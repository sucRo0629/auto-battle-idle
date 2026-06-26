import { resolveMaxEffectiveRangePx } from '../combatPosition.ts';
import {
  currentHpRatio,
  getEffectiveMaxHp,
  matchesHpRatioThreshold,
  resolveResourceAmount,
} from '../combatMath.ts';
import { hasMatchingDebuff } from '../debuffMatching.ts';
import { evaluatePendingIncomingDamage } from '../pendingIncomingDamage.ts';
import { getPassiveSpecialEffectMultiplier } from '../passiveEffects.ts';
import { getBlockResonanceStacks } from '../blockResonance.ts';
import { resolveEffectiveAmountSpecForActiveEffect } from '../skillAmountOverride.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  ConditionalSkillEffect,
  FireCondition,
  GameData,
  PassiveSkillDef,
  PendingSkillHit,
  ResourceAmountSpec,
  SkillEffectDef,
  TargetSpec,
} from '../types.ts';
import {
  getAttackablePool,
  isWithinSkillRange,
  resolveSkillRangePx,
} from './rangeUtils.ts';
import { getTargetPool } from './targetSpec.ts';
import { pickTargetFromPool, resolveEffectTargetSpec } from './targeting.ts';

export interface ConditionEvalContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
  passives: PassiveSkillDef[];
  gameData: GameData;
  isWaveStartPhase?: boolean;
  isWaveEndPhase?: boolean;
  /** minTargets / targetHp / debuff 評価の参照 effect */
  referenceEffect?: SkillEffectDef;
  battleTimeSec?: number;
  pendingHitQueue?: readonly PendingSkillHit[];
  /** targetBarrierBelowGrant 用 */
  skill?: ActiveSkillDef;
  effectIndex?: number;
  evaluationTarget?: CombatantState;
  waveIndex?: number;
  waveCount?: number;
}

function livingUnits(units: CombatantState[]): CombatantState[] {
  return units.filter((u) => u.isAlive);
}

export function resolveConditionReferenceEffect(
  effect: SkillEffectDef | undefined,
): SkillEffectDef | undefined {
  if (!effect) return undefined;
  if (effect.type === 'conditionalEffect') {
    return (
      effect.thenEffects[0] ??
      effect.elseEffects[0] ??
      undefined
    );
  }
  return effect;
}

export function resolveSkillConditionReferenceEffect(
  skill: ActiveSkillDef,
): SkillEffectDef | undefined {
  return resolveConditionReferenceEffect(skill.effect[0]);
}

function resolveReferenceTargetSpec(ctx: ConditionEvalContext): TargetSpec | null {
  const reference = ctx.referenceEffect;
  if (!reference) return null;
  return resolveEffectTargetSpec(
    reference,
    ctx.actor,
    ctx.allies,
    ctx.enemies,
    ctx.passives,
  );
}

function resolveReferenceAttackablePool(ctx: ConditionEvalContext): CombatantState[] {
  const reference = ctx.referenceEffect;
  const spec = resolveReferenceTargetSpec(ctx);
  if (!reference || !spec) return [];
  const rangePx = resolveSkillRangePx(
    ctx.actor,
    reference,
    livingUnits(ctx.allies).length,
  );
  return getAttackablePool(
    spec,
    ctx.actor,
    ctx.allies,
    ctx.enemies,
    rangePx,
  ).filter((unit) => unit.isAlive);
}

function evaluateAllyTargetHpCondition(
  pool: CombatantState[],
  spec: TargetSpec,
  condition: Extract<FireCondition, { kind: 'targetHp' }>,
): boolean {
  if (pool.length === 0) return false;
  const threshold = condition.maxHpRatio;
  const compare = condition.compare;

  if (spec.kind === 'all' && spec.side === 'ally') {
    return pool.some((unit) =>
      matchesHpRatioThreshold(currentHpRatio(unit), threshold, compare),
    );
  }

  if (
    spec.kind === 'stat' &&
    spec.side === 'ally' &&
    spec.stat === 'hp' &&
    spec.order === 'ratio'
  ) {
    const minRatio = Math.min(...pool.map((unit) => currentHpRatio(unit)));
    return matchesHpRatioThreshold(minRatio, threshold, compare);
  }

  return pool.some((unit) =>
    matchesHpRatioThreshold(currentHpRatio(unit), threshold, compare),
  );
}

function resolvePrimaryTarget(ctx: ConditionEvalContext): CombatantState | null {
  const reference = ctx.referenceEffect;
  const spec = resolveReferenceTargetSpec(ctx);
  if (!reference || !spec) return null;
  const pool = getTargetPool(spec, ctx.actor, ctx.allies, ctx.enemies);
  return pickTargetFromPool(spec, ctx.actor, pool);
}

function countSkillTargets(ctx: ConditionEvalContext): number {
  const reference = ctx.referenceEffect;
  if (!reference) return 0;
  const spec = resolveEffectTargetSpec(
    reference,
    ctx.actor,
    ctx.allies,
    ctx.enemies,
    ctx.passives,
  );
  const pool = getTargetPool(spec, ctx.actor, ctx.allies, ctx.enemies);
  return pool.filter((u) => u.isAlive).length;
}

function enemiesInActorRange(ctx: ConditionEvalContext): CombatantState[] {
  const rangePx = resolveMaxEffectiveRangePx(ctx.actor, ctx.gameData);
  return livingUnits(ctx.enemies).filter((enemy) =>
    isWithinSkillRange(ctx.actor, enemy, rangePx),
  );
}

function resolveBarrierGrantForContext(
  ctx: ConditionEvalContext,
  effect: SkillEffectDef,
  target: CombatantState,
): number {
  const passivesRecord = Object.fromEntries(
    ctx.passives.map((passive) => [passive.id, passive]),
  );
  let amountSpec: ResourceAmountSpec | undefined;
  if (effect.type === 'buff' && effect.buffSubKind === 'barrier') {
    amountSpec = effect.amount;
  } else if (effect.type === 'barrier') {
    amountSpec = effect.amount;
  }
  if (!amountSpec) return 0;

  const resolvedSpec =
    ctx.skill && ctx.effectIndex !== undefined
      ? resolveEffectiveAmountSpecForActiveEffect(
          ctx.actor,
          passivesRecord,
          ctx.skill,
          effect,
          ctx.effectIndex,
          amountSpec,
        )
      : amountSpec;

  const base = resolveResourceAmount(
    ctx.actor,
    target,
    resolvedSpec,
    passivesRecord,
  );
  const mul = getPassiveSpecialEffectMultiplier(
    'barrier',
    ctx.actor,
    target,
    passivesRecord,
  );
  return Math.floor(base * mul);
}

export function evaluateCondition(
  ctx: ConditionEvalContext,
  condition: FireCondition,
): boolean {
  switch (condition.kind) {
    case 'waveStart':
      return ctx.isWaveStartPhase === true;
    case 'finalWaveStart':
      return (
        ctx.isWaveStartPhase === true &&
        ctx.waveCount !== undefined &&
        ctx.waveIndex !== undefined &&
        ctx.waveIndex === ctx.waveCount - 1
      );
    case 'waveEnd':
      return ctx.isWaveEndPhase === true;
    case 'selfHp':
      return matchesHpRatioThreshold(
        currentHpRatio(ctx.actor),
        condition.maxHpRatio,
        condition.compare,
      );
    case 'allyDamaged':
      return ctx.allies.some(
        (ally) => ally.isAlive && ally.hp < getEffectiveMaxHp(ally),
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
      const spec = resolveReferenceTargetSpec(ctx);
      if (!spec) return false;

      if (
        (spec.kind === 'all' && spec.side === 'ally') ||
        (spec.kind === 'stat' &&
          spec.side === 'ally' &&
          spec.stat === 'hp' &&
          spec.order === 'ratio')
      ) {
        return evaluateAllyTargetHpCondition(
          resolveReferenceAttackablePool(ctx),
          spec,
          condition,
        );
      }

      const target = resolvePrimaryTarget(ctx);
      if (!target?.isAlive) return false;
      return matchesHpRatioThreshold(
        currentHpRatio(target),
        condition.maxHpRatio,
        condition.compare,
      );
    }
    case 'hasDot': {
      const target = resolvePrimaryTarget(ctx);
      if (!target?.isAlive) return false;
      return hasMatchingDebuff(target, ['dot']);
    }
    case 'debuff': {
      const target = resolvePrimaryTarget(ctx);
      if (!target?.isAlive) return false;
      return hasMatchingDebuff(target, condition.tags, {
        selfSourceId: ctx.actor.id,
        selfAppliedOnly: condition.selfAppliedOnly,
      });
    }
    case 'pendingIncomingDamage': {
      if (ctx.pendingHitQueue === undefined || ctx.battleTimeSec === undefined) {
        return false;
      }
      const passivesRecord = Object.fromEntries(
        ctx.passives.map((passive) => [passive.id, passive]),
      );
      return evaluatePendingIncomingDamage(
        ctx.allies,
        ctx.enemies,
        ctx.pendingHitQueue,
        ctx.battleTimeSec,
        condition.maxHpRatio,
        condition.windowSec,
        passivesRecord,
      );
    }
    case 'targetBarrierBelowGrant': {
      const target = ctx.evaluationTarget ?? resolvePrimaryTarget(ctx);
      const effect = ctx.referenceEffect;
      if (!target?.isAlive || !effect) return false;
      const grant = resolveBarrierGrantForContext(ctx, effect, target);
      return grant > target.barrierHp;
    }
    case 'blockResonanceStacks':
      return getBlockResonanceStacks(ctx.actor) >= condition.min;
  }
}

export function evaluateConditions(
  ctx: ConditionEvalContext,
  conditions: readonly FireCondition[],
  match: 'all' | 'any' = 'all',
): boolean {
  if (conditions.length === 0) return true;
  if (match === 'any') {
    return conditions.some((condition) => evaluateCondition(ctx, condition));
  }
  return conditions.every((condition) => evaluateCondition(ctx, condition));
}

export function targetPassesEffectConditions(
  ctx: ConditionEvalContext,
  effect: SkillEffectDef,
  target: CombatantState,
): boolean {
  const conditions = effect.effectConditions;
  if (!conditions || conditions.length === 0) return true;
  return evaluateConditions(
    { ...ctx, referenceEffect: effect, evaluationTarget: target },
    conditions,
  );
}

/** @deprecated use evaluateConditions with match */
export function evaluateConditionsAll(
  ctx: ConditionEvalContext,
  conditions: readonly FireCondition[],
): boolean {
  return evaluateConditions(ctx, conditions, 'all');
}

export function resolveConditionalBranchEffects(
  effect: ConditionalSkillEffect,
  ctx: ConditionEvalContext,
): SkillEffectDef[] {
  return evaluateConditions(ctx, effect.conditions)
    ? effect.thenEffects
    : effect.elseEffects;
}

export type LeafSkillEffect = Exclude<
  SkillEffectDef,
  { type: 'conditionalEffect' }
>;

export function flattenSkillEffectsForRuntime(
  effects: readonly SkillEffectDef[],
): LeafSkillEffect[] {
  const flattened: LeafSkillEffect[] = [];
  for (const effect of effects) {
    if (effect.type === 'conditionalEffect') {
      flattened.push(
        ...(effect.thenEffects as LeafSkillEffect[]),
        ...(effect.elseEffects as LeafSkillEffect[]),
      );
      continue;
    }
    flattened.push(effect);
  }
  return flattened;
}
