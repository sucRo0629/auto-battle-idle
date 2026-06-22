import { resolveMaxEffectiveRangePx } from '../combatPosition.ts';
import { currentHpRatio, getEffectiveMaxHp, matchesHpRatioThreshold } from '../combatMath.ts';
import { hasMatchingDebuff } from '../debuffMatching.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  ConditionalSkillEffect,
  FireCondition,
  GameData,
  PassiveSkillDef,
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

export function evaluateCondition(
  ctx: ConditionEvalContext,
  condition: FireCondition,
): boolean {
  switch (condition.kind) {
    case 'waveStart':
      return ctx.isWaveStartPhase === true;
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

export function evaluateConditions(
  ctx: ConditionEvalContext,
  conditions: readonly FireCondition[],
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => evaluateCondition(ctx, condition));
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
