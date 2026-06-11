import type { BattleEventListener } from '../events.ts';
import {
  applyBarrierToTarget,
  applyDamageToTarget,
  applyHealToTarget,
  getPassiveDefs,
  resolveDamage,
  resolveHealAmount,
  resolveResourceAmount,
} from '../combatMath.ts';
import {
  applyKnockbackToTarget,
  applyStunToTarget,
  isUnitStunned,
} from '../ccEffects.ts';
import {
  applyExcessHealToBarrierFromPassive,
  rollsEvasion,
  stripPassivesAurasFromSource,
  type PassiveDamageContext,
} from '../passiveEffects.ts';
import { dispelDebuffsOnTarget } from '../debuffDispel.ts';
import { applyBlockToPhysicalDamage } from '../blockMitigation.ts';
import { grantCounterStatus } from '../counterEffects.ts';
import { resolveMoveBattleX } from '../combatPosition.ts';
import {
  resetCooldownAfterFire,
  tickCountTriggerCooldowns,
} from '../skillTrigger.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  MoveSkillEffect,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  SkillSlotKind,
  StatusEffect,
} from '../types.ts';
import { asStatusEffectStatList } from '../types.ts';
import {
  buildPendingHitsFromResolution,
  findCombatantById,
} from './pendingSkillHits.ts';
import { resolveSkillDamageType } from './damageTypeUtils.ts';
import {
  buildSkillSequence,
  type PendingSkillStep,
  resolveSequenceStepAnchor,
  resolveUseDurationSec,
  type SkillSequenceRunner,
  skillHasMoveEffect,
} from './skillSequence.ts';
import { getEffectTarget } from './targetSpec.ts';
import {
  resolutionHasTargets,
  resolveEffectResolution,
  resolveTargetSpec,
} from './targeting.ts';

export interface SkillExecutorDeps {
  getBattleTimeSec: () => number;
  enqueuePendingHits: (hits: PendingSkillHit[]) => void;
  getAllCombatants: () => CombatantState[];
  getSequenceRunner: () => SkillSequenceRunner;
  onBasicAttackExecuted?: (actorId: string) => void;
  onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
    meta?: {
      attackKind: 'damage' | 'dot';
      isCounterDamage?: boolean;
    },
  ) => void;
  onDebuffApplied?: (actor: CombatantState) => void;
  onHealApplied?: (target: CombatantState) => void;
  onUnitDied?: (unit: CombatantState) => void;
}

export class SkillExecutor {
  constructor(
    private readonly gameData: GameData,
    private readonly emit: BattleEventListener,
    private readonly deps: SkillExecutorDeps,
  ) {}

  tryExecute(
    actor: CombatantState,
    cd: SkillCooldown,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): void {
    if (!actor.isAlive || cd.remaining > 0) return;
    if (isUnitStunned(actor)) return;
    if (this.deps.getSequenceRunner().isActorBusy(actor.id)) return;

    const skill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!skill || skill.effect.length === 0) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );

    if (skillHasMoveEffect(skill)) {
      const sequence = buildSkillSequence(
        skill,
        actor,
        allies,
        enemies,
        this.gameData,
        passives,
        this.deps.getBattleTimeSec(),
        cd,
      );
      if (!sequence) return;
      this.beginSkillUseIfActive(actor.id, skill, cd.slotKind);
      this.deps.getSequenceRunner().schedule(sequence);
      return;
    }

    let appliedAny = false;
    for (let effectIndex = 0; effectIndex < skill.effect.length; effectIndex++) {
      const effectDef = skill.effect[effectIndex]!;
      const resolution = resolveEffectResolution(
        effectDef,
        actor,
        allies,
        enemies,
        this.gameData,
        Math.random,
        passives,
      );
      if (!resolutionHasTargets(resolution)) continue;

      const spread = resolution!.spreadDurationSec;
      if (spread !== undefined && spread > 0) {
        const pending = buildPendingHitsFromResolution(
          resolution!,
          this.deps.getBattleTimeSec(),
          actor.id,
          skill,
          effectDef,
          cd,
        );
        if (pending.length > 0) {
          this.deps.enqueuePendingHits(pending);
          appliedAny = true;
        }
        continue;
      }

      const crowdHitCount =
        effectDef.type === 'damage'
          ? resolution!.waves.reduce(
              (sum, wave) => sum + wave.targets.length,
              0,
            )
          : undefined;
      const damageContext: PassiveDamageContext = {
        skill,
        slotKind: cd.slotKind,
        crowdHitCount,
        targetShape: effectDef.targetShape,
      };

      for (const wave of resolution!.waves) {
        for (const { unit, powerMultiplierOverride } of wave.targets) {
          if (
            this.applyEffect(
              actor,
              unit,
              skill,
              effectDef,
              cd,
              effectIndex,
              powerMultiplierOverride,
              wave.hitIndex,
              damageContext,
            )
          ) {
            appliedAny = true;
          }
        }
      }
    }

    if (appliedAny) {
      this.beginSkillUseIfActive(actor.id, skill, cd.slotKind);
      resetCooldownAfterFire(cd, skill);
      if (cd.slotKind === 'basic') {
        tickCountTriggerCooldowns(
          actor.cooldowns,
          this.gameData.skillRegistry.actives,
          'basicAttackCount',
        );
        this.deps.onBasicAttackExecuted?.(actor.id);
      }
    }
  }

  applyScheduledStep(
    step: PendingSkillStep,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): void {
    const actor = findCombatantById(step.actorId, allies, enemies);
    if (!actor?.isAlive) return;

    const skill = this.gameData.skillRegistry.actives[step.skillId];
    if (!skill) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );
    const defaultSpec = getEffectTarget(step.effectDef);
    const spec = resolveTargetSpec(passives, defaultSpec, {
      actor,
      allies,
      enemies,
    });
    const target =
      step.effectDef.type === 'move'
        ? findCombatantById(step.targetId, allies, enemies)
        : resolveSequenceStepAnchor(
            step.effectDef,
            spec,
            actor,
            allies,
            enemies,
            this.gameData,
          );
    if (!target?.isAlive) return;

    if (step.effectDef.type === 'move') {
      this.applyMoveEffect(
        actor,
        target,
        skill,
        step.effectDef,
        step.cd,
        step.effectIndex,
      );
      return;
    }

    this.applyEffect(
      actor,
      target,
      skill,
      step.effectDef,
      step.cd,
      step.effectIndex,
    );
  }

  applyPendingHit(hit: PendingSkillHit): void {
    const [allies, enemies] = this.splitCombatants();
    const actor = findCombatantById(hit.actorId, allies, enemies);
    if (!actor?.isAlive) return;

    const skill = this.gameData.skillRegistry.actives[hit.skillId];
    if (!skill) return;

    const cd: SkillCooldown = {
      skillId: hit.skillId,
      remaining: 0,
      slotKind: hit.slotKind,
    };

    const effectIndex = skill.effect.findIndex((def) => def === hit.effectDef);
    for (const entry of hit.targets) {
      const target = findCombatantById(entry.targetId, allies, enemies);
      if (!target?.isAlive) continue;
      this.applyEffect(
        actor,
        target,
        skill,
        hit.effectDef,
        cd,
        effectIndex >= 0 ? effectIndex : 0,
        entry.powerMultiplierOverride,
        hit.hitIndex,
      );
    }
  }

  private splitCombatants(): [CombatantState[], CombatantState[]] {
    const all = this.deps.getAllCombatants();
    return [
      all.filter((unit) => !unit.isEnemy),
      all.filter((unit) => unit.isEnemy),
    ];
  }

  private applyMoveEffect(
    actor: CombatantState,
    anchor: CombatantState,
    skill: ActiveSkillDef,
    effectDef: MoveSkillEffect,
    cd: SkillCooldown,
    effectIndex: number,
  ): void {
    const toX = resolveMoveBattleX(actor, anchor, effectDef, this.gameData);
    const fromX = actor.battleX;
    if (fromX === toX) {
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: anchor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'move',
        effectIndex,
      });
      return;
    }

    this.deps.getSequenceRunner().startMove({
      actorId: actor.id,
      fromX,
      toX,
      toVisualX: toX,
      remainingSec: effectDef.moveDurationSec,
      totalSec: effectDef.moveDurationSec,
      baseVisualX: actor.battleX,
    });

    this.emit({
      type: 'skill',
      actorId: actor.id,
      targetId: anchor.id,
      skillId: skill.id,
      skillName: skill.name,
      slotKind: cd.slotKind,
      effect: 'move',
      effectIndex,
    });
  }

  private applyEffect(
    actor: CombatantState,
    target: CombatantState,
    skill: ActiveSkillDef,
    effectDef: SkillEffectDef,
    cd: SkillCooldown,
    effectIndex: number,
    powerMultiplierOverride?: number,
    hitIndex?: number,
    damageContext: PassiveDamageContext = {},
  ): boolean {
    if (effectDef.type === 'move') {
      return false;
    }

    if (effectDef.type === 'damage') {
      if (rollsEvasion(target, this.gameData.skillRegistry.passives)) {
        this.emit({ type: 'evade', targetId: target.id });
        return false;
      }
      const amount = resolveDamage(
        actor,
        target,
        effectDef,
        this.gameData.skillRegistry.passives,
        {
          atkScaleOverride: powerMultiplierOverride,
          passiveContext: damageContext,
          effectDamageIncrease: effectDef.damageIncrease,
          effectDefenseIgnore: effectDef.defenseIgnore,
        },
      );
      let finalDamage = amount;
      if (resolveSkillDamageType(actor, effectDef) === 'physical') {
        const blockResult = applyBlockToPhysicalDamage(
          target,
          amount,
          this.gameData.skillRegistry.passives,
        );
        finalDamage = blockResult.finalDamage;
        if (blockResult.didBlock) {
          this.emit({ type: 'block', targetId: target.id });
        }
      }
      const damageResult = applyDamageToTarget(target, finalDamage);
      const appliedDamage =
        damageResult.hpDamage + damageResult.barrierDamage;
      this.deps.onDamageApplied?.(actor, target, appliedDamage, {
        attackKind: 'damage',
      });
      const { lethal } = damageResult;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'damage',
        effectIndex,
        amount: finalDamage,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      this.emit({ type: 'hurt', targetId: target.id });
      if (lethal) {
        target.isAlive = false;
        if (!target.isEnemy) {
          stripPassivesAurasFromSource(
            target.id,
            this.deps.getAllCombatants(),
          );
        }
        this.deps.getSequenceRunner().clearForActor(target.id);
        this.deps.onUnitDied?.(target);
        this.emit({ type: 'death', targetId: target.id });
      }
      return true;
    }

    if (effectDef.type === 'heal') {
      if ((effectDef.healSubKind ?? 'instant') === 'hot') {
        const amountSpec =
          effectDef.amount ??
          ({ kind: 'flat', flatAmount: 0 } as const);
        const duration = effectDef.durationSec ?? 0;
        if (duration <= 0) return false;
        const appliedAt = Date.now();
        target.statusEffects.push({
          id: `${skill.id}_hot_${appliedAt}`,
          kind: 'buff',
          overlay: 'hot',
          multiplier: 1,
          durationSec: duration,
          remainingSec: duration,
          amount: amountSpec,
          sourceId: actor.id,
          skillId: skill.id,
          tickSec: 1,
        });
        this.emit({
          type: 'skill',
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: skill.name,
          slotKind: cd.slotKind,
          effect: 'hot',
          effectIndex,
          statusLabel: 'hot',
          range: effectDef.range,
          ...(hitIndex !== undefined ? { hitIndex } : {}),
        });
        return true;
      }
      if ((effectDef.healSubKind ?? 'instant') === 'dispel') {
        const removed = dispelDebuffsOnTarget(
          target,
          effectDef.dispelCount ?? 0,
          effectDef.dispelTags,
          actor.id,
        );
        if (removed <= 0) return false;
        this.emit({
          type: 'skill',
          actorId: actor.id,
          targetId: target.id,
          skillId: skill.id,
          skillName: skill.name,
          slotKind: cd.slotKind,
          effect: 'dispel',
          effectIndex,
          amount: removed,
          range: effectDef.range,
          ...(hitIndex !== undefined ? { hitIndex } : {}),
        });
        return true;
      }
      const amount = resolveHealAmount(
        actor,
        target,
        effectDef.amount ?? ({ kind: 'flat', flatAmount: 0 } as const),
        this.gameData.skillRegistry.passives,
        {
          atkScaleOverride: powerMultiplierOverride,
          effectSpecialIncrease: effectDef.damageIncrease,
        },
      );
      if (amount <= 0) return false;
      const passives = this.gameData.skillRegistry.passives;
      applyExcessHealToBarrierFromPassive(
        actor,
        target,
        amount,
        passives,
        'outgoing',
      );
      applyExcessHealToBarrierFromPassive(
        target,
        target,
        amount,
        passives,
        'incoming',
      );
      const healed = applyHealToTarget(target, amount);
      if (healed <= 0 && target.barrierHp <= 0) return false;
      this.deps.onHealApplied?.(target);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'heal',
        effectIndex,
        amount,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'buff' || effectDef.type === 'debuff') {
      if (effectDef.type === 'buff') {
        const subKind = effectDef.buffSubKind ?? 'stat';
        if (subKind === 'barrier') {
          const amountSpec =
            effectDef.amount ??
            ({ kind: 'flat', flatAmount: 0 } as const);
          const grant = resolveResourceAmount(
            actor,
            target,
            amountSpec,
            this.gameData.skillRegistry.passives,
            powerMultiplierOverride,
          );
          if (grant <= 0) return false;
          applyBarrierToTarget(target, grant, effectDef.barrierStack ?? false);
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'barrier',
            effectIndex,
            amount: grant,
            range: effectDef.range,
            ...(hitIndex !== undefined ? { hitIndex } : {}),
          });
          return true;
        }
        if (subKind === 'block' || subKind === 'evasion') {
          const chance = effectDef.chance ?? 0;
          const duration = effectDef.buffDurationSec ?? 0;
          if (chance <= 0 || duration <= 0) return false;
          const appliedAt = Date.now();
          target.statusEffects.push({
            id: `${skill.id}_${subKind}_${appliedAt}`,
            kind: 'buff',
            overlay: subKind,
            ...(subKind === 'block'
              ? { blockChance: chance }
              : { evasionChance: chance }),
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            sourceId: actor.id,
            skillId: skill.id,
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: subKind === 'block' ? 'block' : 'buff',
            effectIndex,
            statusLabel: subKind,
            range: effectDef.range,
            ...(hitIndex !== undefined ? { hitIndex } : {}),
          });
          return true;
        }
      }
      if (effectDef.type === 'debuff') {
        const subKind = effectDef.debuffSubKind ?? 'stat';
        if (subKind === 'dot') {
          const duration = effectDef.durationSec ?? 0;
          const power = effectDef.powerMultiplier ?? 0;
          if (duration <= 0 || power <= 0) return false;
          const appliedAt = Date.now();
          target.statusEffects.push({
            id: `${skill.id}_dot_${appliedAt}`,
            kind: 'debuff',
            overlay: 'dot',
            multiplier: 1,
            durationSec: duration,
            remainingSec: duration,
            powerMultiplier: power,
            sourceId: actor.id,
            skillId: skill.id,
            damageType: resolveSkillDamageType(actor, effectDef),
            damageIncrease: effectDef.damageIncrease,
            defenseIgnore: effectDef.defenseIgnore,
            tickSec: 1,
          });
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'dot',
            effectIndex,
            statusLabel: 'dot',
            range: effectDef.range,
            ...(hitIndex !== undefined ? { hitIndex } : {}),
          });
          return true;
        }
        if (subKind === 'stun') {
          const duration = effectDef.durationSec ?? 0;
          if (duration <= 0) return false;
          const applied = applyStunToTarget(target, duration, {
            skillId: skill.id,
            sourceId: actor.id,
          });
          if (!applied) return false;
          this.emit({
            type: 'skill',
            actorId: actor.id,
            targetId: target.id,
            skillId: skill.id,
            skillName: skill.name,
            slotKind: cd.slotKind,
            effect: 'stun',
            effectIndex,
            statusLabel: 'stun',
            range: effectDef.range,
            ...(hitIndex !== undefined ? { hitIndex } : {}),
          });
          return true;
        }
      }
      const isBuff = effectDef.type === 'buff';
      const stats = asStatusEffectStatList(
        isBuff
          ? (Array.isArray(effectDef.buffStat)
              ? effectDef.buffStat.filter(
                  (stat): stat is 'atk' | 'def' | 'reg' | 'damageTaken' | 'attackSpeed' =>
                    stat === 'atk' ||
                    stat === 'def' ||
                    stat === 'reg' ||
                    stat === 'damageTaken' ||
                    stat === 'attackSpeed',
                )
              : effectDef.buffStat === 'atk' ||
                  effectDef.buffStat === 'def' ||
                  effectDef.buffStat === 'reg' ||
                  effectDef.buffStat === 'damageTaken' ||
                  effectDef.buffStat === 'attackSpeed'
                ? [effectDef.buffStat]
                : [])
          : effectDef.debuffStat,
      );
      const multiplier = isBuff
        ? effectDef.buffMultiplier
        : effectDef.debuffMultiplier;
      const flatBonus = isBuff
        ? effectDef.buffFlatBonus
        : effectDef.debuffFlatBonus;
      let duration = isBuff
        ? effectDef.buffDurationSec
        : effectDef.debuffDurationSec;
      if (
        stats.length === 0 ||
        (multiplier === undefined && flatBonus === undefined)
      ) {
        return false;
      }

      const statusLabels: string[] = [];
      const appliedAt = Date.now();
      if (duration === undefined) return false;

      for (let i = 0; i < stats.length; i++) {
        const stat = stats[i]!;
        const effect: StatusEffect = {
          id: `${skill.id}_${stat}_${appliedAt}_${i}`,
          kind: isBuff ? 'buff' : 'debuff',
          stat,
          multiplier: multiplier ?? 1,
          durationSec: duration,
          remainingSec: duration,
          ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
        };
        target.statusEffects.push(effect);
        statusLabels.push(formatStatusLabel(stat, multiplier, flatBonus));
      }

      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: effectDef.type,
        effectIndex,
        statusLabel: statusLabels.join(', '),
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      if (!isBuff && actor.isEnemy === false && target.isEnemy) {
        this.deps.onDebuffApplied?.(actor);
      }
      return true;
    }

    if (effectDef.type === 'stun') {
      const applied = applyStunToTarget(target, effectDef.durationSec, {
        skillId: skill.id,
        sourceId: actor.id,
      });
      if (!applied) return false;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'stun',
        effectIndex,
        statusLabel: 'stun',
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'knockback') {
      const applied = applyKnockbackToTarget(target, effectDef.distancePx);
      if (!applied) return false;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'knockback',
        effectIndex,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'dispel') {
      const removed = dispelDebuffsOnTarget(
        target,
        effectDef.dispelCount,
        effectDef.dispelTags,
        actor.id,
      );
      if (removed <= 0) return false;
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'dispel',
        effectIndex,
        amount: removed,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'block') {
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_block_${appliedAt}`,
        kind: 'buff',
        overlay: 'block',
        blockChance: effectDef.blockChance,
        multiplier: 1,
        durationSec: effectDef.durationSec,
        remainingSec: effectDef.durationSec,
        sourceId: actor.id,
        skillId: skill.id,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'block',
        effectIndex,
        statusLabel: 'block',
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'counter') {
      grantCounterStatus(actor, {
        responses: effectDef.responses,
        durationSec: effectDef.durationSec,
        range: effectDef.range,
        skillId: skill.id,
        sourceId: actor.id,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: actor.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'counter',
        effectIndex,
        statusLabel: 'counter',
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    if (effectDef.type === 'hot' || effectDef.type === 'dot') {
      const overlay = effectDef.type;
      const appliedAt = Date.now();
      target.statusEffects.push({
        id: `${skill.id}_${overlay}_${appliedAt}`,
        kind: overlay === 'hot' ? 'buff' : 'debuff',
        overlay,
        multiplier: 1,
        durationSec: effectDef.durationSec,
        remainingSec: effectDef.durationSec,
        ...(overlay === 'hot'
          ? { amount: effectDef.amount }
          : { powerMultiplier: effectDef.powerMultiplier }),
        sourceId: actor.id,
        skillId: skill.id,
        ...(overlay === 'dot'
          ? {
              damageType: resolveSkillDamageType(actor, effectDef),
              damageIncrease: effectDef.damageIncrease,
              defenseIgnore: effectDef.defenseIgnore,
            }
          : {}),
        tickSec: 1,
      });
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: effectDef.type,
        effectIndex,
        statusLabel: overlay,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      return true;
    }

    return false;
  }

  private beginSkillUseIfActive(
    actorId: string,
    skill: ActiveSkillDef,
    slotKind: SkillSlotKind,
  ): void {
    if (slotKind === 'basic') return;
    const duration = resolveUseDurationSec(skill);
    if (duration > 0) {
      this.deps.getSequenceRunner().beginUse(actorId, duration);
    }
  }
}

function formatStatusLabel(
  stat: NonNullable<StatusEffect['stat']>,
  multiplier: number | undefined,
  flatBonus: number | undefined,
): string {
  const parts: string[] = [stat];
  if (multiplier !== undefined && multiplier !== 1) {
    parts.push(`x${multiplier}`);
  }
  if (flatBonus !== undefined) {
    parts.push(`+${Math.abs(flatBonus)}`);
  }
  return parts.join(' ');
}
