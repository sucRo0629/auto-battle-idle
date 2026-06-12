import { currentHpRatio, matchesHpRatioThreshold } from '../combatMath.ts';
import { hasMatchingDebuff } from '../debuffMatching.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  FireCondition,
  GameData,
  PassiveSkillDef,
  SkillCooldown,
} from '../types.ts';
import { getTargetPool } from './targetSpec.ts';
import { pickTargetFromPool, resolveEffectTargetSpec } from './targeting.ts';
import {
  isFireTimeoutExpired,
  resolveFirePolicy,
} from './chargeBank.ts';

export interface FireGateContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
  skill: ActiveSkillDef;
  passives: PassiveSkillDef[];
  gameData: GameData;
  battleTimeSec: number;
  cd?: SkillCooldown;
  isWaveStartPhase: boolean;
  isWaveEndPhase: boolean;
}

function livingUnits(units: CombatantState[]): CombatantState[] {
  return units.filter((u) => u.isAlive);
}

function resolvePrimaryTarget(
  ctx: FireGateContext,
): CombatantState | null {
  const firstEffect = ctx.skill.effect[0];
  if (!firstEffect) return null;
  const spec = resolveEffectTargetSpec(
    firstEffect,
    ctx.actor,
    ctx.allies,
    ctx.enemies,
    ctx.passives,
  );
  const pool = getTargetPool(spec, ctx.actor, ctx.allies, ctx.enemies);
  return pickTargetFromPool(spec, ctx.actor, pool);
}

function countSkillTargets(ctx: FireGateContext): number {
  const firstEffect = ctx.skill.effect[0];
  if (!firstEffect) return 0;
  const spec = resolveEffectTargetSpec(
    firstEffect,
    ctx.actor,
    ctx.allies,
    ctx.enemies,
    ctx.passives,
  );
  const pool = getTargetPool(spec, ctx.actor, ctx.allies, ctx.enemies);
  return pool.filter((u) => u.isAlive).length;
}

function enemiesInActorRange(ctx: FireGateContext): CombatantState[] {
  const rangePx = ctx.actor.traits.rangePx;
  return livingUnits(ctx.enemies).filter(
    (enemy) => Math.abs(enemy.battleX - ctx.actor.battleX) <= rangePx,
  );
}

function evaluateFireCondition(
  ctx: FireGateContext,
  condition: FireCondition,
): boolean {
  switch (condition.kind) {
    case 'waveStart':
      return ctx.isWaveStartPhase;
    case 'waveEnd':
      return ctx.isWaveEndPhase;
    case 'selfHp':
      return matchesHpRatioThreshold(
        currentHpRatio(ctx.actor),
        condition.maxHpRatio,
        condition.compare,
      );
    case 'allyDamaged':
      return ctx.allies.some(
        (ally) => ally.isAlive && ally.hp < ally.maxHp,
      );
    case 'minTargets':
      return countSkillTargets(ctx) >= condition.count;
    case 'enemyCount': {
      const scope = condition.scope ?? 'living';
      const pool =
        scope === 'inRange'
          ? enemiesInActorRange(ctx)
          : livingUnits(ctx.enemies);
      const count = pool.length;
      if (condition.min !== undefined && count < condition.min) return false;
      if (condition.max !== undefined && count > condition.max) return false;
      return true;
    }
    case 'targetHp': {
      const target = resolvePrimaryTarget(ctx);
      if (!target?.isAlive) return false;
      return matchesHpRatioThreshold(
        currentHpRatio(target),
        condition.maxHpRatio,
        condition.compare,
      );
    }
    case 'debuff': {
      const target = resolvePrimaryTarget(ctx);
      if (!target?.isAlive) return false;
      return hasMatchingDebuff(target, condition.tags, {
        selfSourceId: ctx.actor.id,
        selfAppliedOnly: condition.selfAppliedOnly,
      });
    }
  }
}

export function shouldFireActiveSkill(ctx: FireGateContext): boolean {
  if (ctx.cd && isFireTimeoutExpired(ctx.cd, ctx.skill, ctx.battleTimeSec)) {
    return true;
  }
  if (resolveFirePolicy(ctx.skill) !== 'smart') return true;
  const conditions = ctx.skill.fireConditions;
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => evaluateFireCondition(ctx, condition));
}

export function isActiveFireHold(ctx: FireGateContext): boolean {
  if (resolveFirePolicy(ctx.skill) !== 'smart') return false;
  if (shouldFireActiveSkill(ctx)) return false;
  const cd = ctx.cd;
  if (!cd) return false;
  return cd.remaining <= 0 || (cd.storedCharges ?? 0) > 0;
}
