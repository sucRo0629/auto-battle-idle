import type { BattleEventListener } from '../events.ts';
import {
  applyBarrierToTarget,
  applyDamageToTarget,
  applyHealToTarget,
  getPassiveDefs,
  resolveDamage,
  resolveResourceAmount,
} from '../combatMath.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
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
  resolutionHasTargets,
  resolveEffectResolution,
  resolveTargetRule,
} from './targeting.ts';

export interface SkillExecutorDeps {
  getBattleTimeSec: () => number;
  enqueuePendingHits: (hits: PendingSkillHit[]) => void;
  getAllCombatants: () => CombatantState[];
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

    const skill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!skill || skill.effect.length === 0) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );

    let appliedAny = false;
    for (const effectDef of skill.effect) {
      const targetRule = resolveTargetRule(passives, effectDef.targetRule);
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
      cd.remaining = skill.interval;
    }
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

    for (const entry of hit.targets) {
      const target = findCombatantById(entry.targetId, allies, enemies);
      if (!target?.isAlive) continue;
      this.applyEffect(
        actor,
        target,
        skill,
        hit.effectDef,
        cd,
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

  private applyEffect(
    actor: CombatantState,
    target: CombatantState,
    skill: ActiveSkillDef,
    effectDef: SkillEffectDef,
    cd: SkillCooldown,
    powerMultiplierOverride?: number,
    hitIndex?: number,
  ): boolean {
    if (effectDef.type === 'damage') {
      const amount = resolveDamage(
        actor,
        target,
        effectDef,
        this.gameData.skillRegistry.passives,
        powerMultiplierOverride,
      );
      const { lethal } = applyDamageToTarget(target, amount);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'damage',
        amount,
        range: effectDef.range,
        ...(hitIndex !== undefined ? { hitIndex } : {}),
      });
      this.emit({ type: 'hurt', targetId: target.id });
      if (lethal) {
        target.isAlive = false;
        this.emit({ type: 'death', targetId: target.id });
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
        statusLabel: statusLabels.join(', '),
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
