import type { BattleEventListener } from '../events.ts';
import {
  applyBarrierToTarget,
  applyDamageToTarget,
  applyHealToTarget,
  getPassiveDefs,
  resolveDamage,
  resolveResourceAmount,
} from '../combatMath.ts';
import { resolveMoveBattleX } from '../combatPosition.ts';
import { resolveMoveVisualX } from '../../render/formationLayout.ts';
import { resetCooldownAfterFire } from '../skillTrigger.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  MoveSkillEffect,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  StatusEffect,
} from '../types.ts';
import { asStatusEffectStatList } from '../types.ts';
import {
  buildPendingHitsFromResolution,
  findCombatantById,
} from './pendingSkillHits.ts';
import {
  buildSkillSequence,
  type PendingSkillStep,
  resolveSequenceStepAnchor,
  type SkillSequenceRunner,
  skillHasMoveEffect,
} from './skillSequence.ts';
import {
  resolutionHasTargets,
  resolveEffectResolution,
  resolveTargetRule,
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
  ) => void;
  onDebuffApplied?: (actor: CombatantState) => void;
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
      this.deps.getSequenceRunner().schedule(sequence);
      return;
    }

    let appliedAny = false;
    for (let effectIndex = 0; effectIndex < skill.effect.length; effectIndex++) {
      const effectDef = skill.effect[effectIndex]!;
      const targetRule = resolveTargetRule(passives, effectDef.targetRule, {
        actor,
        allies,
        enemies,
      });
      const resolution = resolveEffectResolution(
        effectDef,
        targetRule,
        actor,
        allies,
        enemies,
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
            )
          ) {
            appliedAny = true;
          }
        }
      }
    }

    if (appliedAny) {
      resetCooldownAfterFire(cd, skill);
      if (cd.slotKind === 'basic') {
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
    const rule = resolveTargetRule(passives, step.effectDef.targetRule, {
      actor,
      allies,
      enemies,
    });
    const target =
      step.effectDef.type === 'move'
        ? findCombatantById(step.targetId, allies, enemies)
        : resolveSequenceStepAnchor(
            step.effectDef,
            rule,
            actor,
            allies,
            enemies,
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
      toVisualX: resolveMoveVisualX(actor, anchor, effectDef, this.gameData),
      remainingSec: effectDef.moveDurationSec,
      totalSec: effectDef.moveDurationSec,
      baseVisualX: actor.visualX,
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
  ): boolean {
    if (effectDef.type === 'move') {
      return false;
    }

    if (effectDef.type === 'damage') {
      const amount = resolveDamage(
        actor,
        target,
        effectDef,
        this.gameData.skillRegistry.passives,
        powerMultiplierOverride,
      );
      const damageResult = applyDamageToTarget(target, amount);
      const appliedDamage =
        damageResult.hpDamage + damageResult.barrierDamage;
      this.deps.onDamageApplied?.(actor, target, appliedDamage);
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
        amount,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      this.emit({ type: 'hurt', targetId: target.id });
      if (lethal) {
        target.isAlive = false;
        this.emit({ type: 'death', targetId: target.id });
        this.deps.getSequenceRunner().clearForActor(target.id);
      }
      return true;
    }

    if (effectDef.type === 'heal') {
      const amount = resolveResourceAmount(
        actor,
        target,
        effectDef.amount,
        this.gameData.skillRegistry.passives,
        powerMultiplierOverride,
      );
      if (amount <= 0) return false;
      applyHealToTarget(target, amount);
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

    if (effectDef.type === 'barrier') {
      const grant = resolveResourceAmount(
        actor,
        target,
        effectDef.amount,
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

    if (effectDef.type === 'buff' || effectDef.type === 'debuff') {
      const isBuff = effectDef.type === 'buff';
      const stats = asStatusEffectStatList(
        isBuff ? effectDef.buffStat : effectDef.debuffStat,
      );
      const multiplier = isBuff
        ? effectDef.buffMultiplier
        : effectDef.debuffMultiplier;
      const flatBonus = isBuff
        ? effectDef.buffFlatBonus
        : effectDef.debuffFlatBonus;
      const duration = isBuff
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
          ? { damageType: effectDef.damageType ?? 'physical' }
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
