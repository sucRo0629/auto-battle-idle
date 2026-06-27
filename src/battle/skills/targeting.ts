import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  PassiveSkillDef,
  SkillEffectDef,
  SkillEffectResolution,
  SkillHitTarget,
  SkillHitWave,
  TargetRule,
  TargetShape,
  TargetSpec,
} from '../types.ts';
import {
  applyPowerStep,
  chainStepFields,
  pierceStepFields,
} from './powerStep.ts';
import { getBattleX } from '../combatPosition.ts';
import { getEffectiveMaxHp, currentHpRatio } from '../combatMath.ts';
import {
  getAttackablePool,
  isInForwardSegment,
  isWithinSkillRange,
  resolveSkillRangePx,
} from './rangeUtils.ts';
import {
  applyIncludeSelfFilter,
  filterSelectablePool,
  getEffectTarget,
  getTargetPool,
  isMultiTargetSpec,
  isSelfOriginSpec,
  normalizeTarget,
  orderPoolByTarget,
  pickOptionsForEffect,
  pickTargetFromPool as pickTargetFromPoolSpec,
  resolveTargetSpec,
  targetSpecFaction,
  type PickTargetOptions,
  type TargetRuleContext,
} from './targetSpec.ts';
import {
  computeTargetingLockKey,
  mergeEffectWithSkillTargeting,
} from './skillSharedTargeting.ts';

export {
  formatTargetLabel,
  getEffectTarget,
  normalizeTarget,
  resolveTargetSpec,
  targetSpecFaction,
} from './targetSpec.ts';

export type { TargetRuleContext } from './targetSpec.ts';

/** 連鎖デフォルト spread に加算する秒数（跳び間隔を読み取りやすくする） */
const DEFAULT_CHAIN_SPREAD_EXTRA_SEC = 0.5;

function livingAllies(allies: CombatantState[]): CombatantState[] {
  return allies.filter((a) => a.isAlive);
}

function livingEnemies(enemies: CombatantState[]): CombatantState[] {
  return enemies.filter((e) => e.isAlive);
}

/** 生存味方のうち hp/effectiveMaxHp 最小の負傷者（PHT）。正本: docs/spec/combat.md §回復 PHT */
export function resolvePriorityHealTarget(
  allies: readonly CombatantState[],
): CombatantState | null {
  const candidates = allies.filter(
    (unit) => unit.isAlive && unit.hp < getEffectiveMaxHp(unit),
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const bestRatio = currentHpRatio(best);
    const currentRatio = currentHpRatio(current);
    if (currentRatio < bestRatio - 1e-9) return current;
    if (currentRatio > bestRatio + 1e-9) return best;
    const bestMax = getEffectiveMaxHp(best);
    const currentMax = getEffectiveMaxHp(current);
    if (currentMax < bestMax) return current;
    if (currentMax > bestMax) return best;
    return current.id < best.id ? current : best;
  });
}

export function pickTargetFromPool(
  specOrRule: TargetSpec | TargetRule,
  actor: CombatantState,
  pool: CombatantState[],
  options?: PickTargetOptions,
): CombatantState | null {
  const spec =
    typeof specOrRule === 'string'
      ? normalizeTarget(specOrRule)
      : specOrRule;
  return pickTargetFromPoolSpec(spec, actor, pool, options);
}

export function isMultiTargetRule(rule: TargetRule): boolean {
  return rule === 'allAllies' || rule === 'allEnemies';
}

export function pickTargets(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  const pool = getTargetPool(spec, actor, allies, enemies);
  if (isMultiTargetSpec(spec)) {
    return pool.filter((unit) => unit.isAlive);
  }
  const target = pickTargetFromPoolSpec(spec, actor, pool);
  return target?.isAlive ? [target] : [];
}

/** @deprecated 互換用。resolveEffectResolution を優先 */
export function pickTarget(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState | null {
  const pool = getTargetPool(spec, actor, allies, enemies);
  return pickTargetFromPoolSpec(spec, actor, pool);
}

function resolveAoeHitTargets(
  spec: TargetSpec,
  actor: CombatantState,
  attackablePool: CombatantState[],
  aoeRadiusPx: number,
  pickOptions?: PickTargetOptions,
): SkillHitTarget[] {
  if (isSelfOriginSpec(spec)) {
    const anchorX = getBattleX(actor);
    return attackablePool
      .filter((unit) => Math.abs(getBattleX(unit) - anchorX) <= aoeRadiusPx)
      .map((unit) => ({ unit }));
  }

  const anchor = pickTargetFromPoolSpec(spec, actor, attackablePool, pickOptions);
  if (!anchor) return [];

  const anchorX = getBattleX(anchor);
  return attackablePool
    .filter((unit) => Math.abs(getBattleX(unit) - anchorX) <= aoeRadiusPx)
    .map((unit) => ({ unit }));
}

function getBaseAtkScale(effect: SkillEffectDef): number | undefined {
  if (effect.type === 'damage' || effect.type === 'heal') {
    const amount = effect.amount;
    if (amount?.kind === 'atkBased') {
      return amount.atkScale ?? 1;
    }
  }
  return undefined;
}

export function isBarrierEffect(effect: SkillEffectDef): boolean {
  return (
    effect.type === 'barrier' ||
    (effect.type === 'buff' && effect.buffSubKind === 'barrier')
  );
}

export function skillHasBarrierEffect(
  effects: readonly SkillEffectDef[],
): boolean {
  return effects.some(isBarrierEffect);
}

/** アクティブ heal / hot 発動保留理由（debug 表示用） */
export type HealWithholdReason =
  | 'all_full_hp'
  | 'pht_out_of_range'
  | 'pht_outside_aoe';

export function evaluateHealWithholdReason(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  passives?: PassiveSkillDef[],
  skill?: ActiveSkillDef,
): HealWithholdReason | null {
  if (effect.type !== 'heal' || (effect.healSubKind ?? 'instant') === 'dispel') {
    return null;
  }

  const spec = resolveEffectTargetSpec(
    effect,
    actor,
    allies,
    enemies,
    passives,
    skill,
  );

  if (spec.kind === 'self') {
    return actor.isAlive && actor.hp < getEffectiveMaxHp(actor)
      ? null
      : 'all_full_hp';
  }

  if (spec.kind === 'all' && spec.side === 'ally') {
    return resolvePriorityHealTarget(livingAllies(allies)) !== null
      ? null
      : 'all_full_hp';
  }

  const pht = resolvePriorityHealTarget(livingAllies(allies));
  if (!pht) return 'all_full_hp';

  const merged = mergeEffectWithSkillTargeting(skill, effect);
  const rangePx = resolveSkillRangePx(
    actor,
    merged,
    livingAllies(allies).length,
  );
  const attackablePool = getAttackablePool(
    spec,
    actor,
    allies,
    enemies,
    rangePx,
  );

  if (
    merged.targetShape === 'aoe' &&
    merged.aoeRadiusPx !== undefined &&
    merged.aoeRadiusPx > 0 &&
    isSelfOriginSpec(spec)
  ) {
    const anchorX = getBattleX(actor);
    return Math.abs(getBattleX(pht) - anchorX) <= merged.aoeRadiusPx
      ? null
      : 'pht_outside_aoe';
  }

  return attackablePool.some((unit) => unit.id === pht.id)
    ? null
    : 'pht_out_of_range';
}

/** アクティブ heal / hot: PHT が効果形状内にいなければ発動保留（正本: combat.md §回復 PHT） */
function hasDamagedHealCandidate(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  passives?: PassiveSkillDef[],
  skill?: ActiveSkillDef,
): boolean {
  return (
    evaluateHealWithholdReason(
      effect,
      actor,
      allies,
      enemies,
      gameData,
      passives,
      skill,
    ) === null
  );
}

function hasScopedTargetRuleOverride(
  passives: PassiveSkillDef[],
  faction: 'enemy' | 'ally',
  context: TargetRuleContext,
): boolean {
  for (let i = passives.length - 1; i >= 0; i--) {
    const passive = passives[i]!;
    if (passive.effect !== 'targetRuleOverride' || !passive.targetRuleOverride) {
      continue;
    }
    if ((passive.targetRuleOverrideApplyTo ?? 'enemy') !== faction) continue;
    const pool = getTargetPool(
      passive.targetRuleOverride,
      context.actor,
      context.allies,
      context.enemies,
    );
    if (pool.length > 0) return true;
  }
  return false;
}

function shouldApplyTargetRuleOverride(
  defaultSpec: TargetSpec,
  passives: PassiveSkillDef[],
  context: TargetRuleContext,
): boolean {
  const faction = targetSpecFaction(defaultSpec, context.actor);
  if (faction === 'self') return false;
  return hasScopedTargetRuleOverride(passives, faction, context);
}

export function resolveEffectTargetSpec(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives?: PassiveSkillDef[],
  skill?: ActiveSkillDef,
): TargetSpec {
  const merged = mergeEffectWithSkillTargeting(skill, effect);
  const defaultSpec = getEffectTarget(merged);
  if (!passives || passives.length === 0) return defaultSpec;
  const context: TargetRuleContext = { actor, allies, enemies };
  if (!shouldApplyTargetRuleOverride(defaultSpec, passives, context)) {
    return defaultSpec;
  }
  const faction = targetSpecFaction(defaultSpec, actor);
  if (faction === 'self') return defaultSpec;
  return resolveTargetSpec(passives, defaultSpec, {
    ...context,
    applyScope: faction,
  });
}

/** move は射程外でも anchor を選ぶ */
export function resolveEffectAnchor(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  passives?: PassiveSkillDef[],
  skill?: ActiveSkillDef,
): CombatantState | null {
  const spec = resolveEffectTargetSpec(
    effect,
    actor,
    allies,
    enemies,
    passives,
    skill,
  );
  if (isSelfOriginSpec(spec)) {
    return actor.isAlive ? actor : null;
  }
  if (effect.type === 'move') {
    const pool = getTargetPool(spec, actor, allies, enemies);
    return pickTargetFromPoolSpec(spec, actor, pool, { moveAnchor: true });
  }
  const resolution = resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    passives,
    undefined,
    undefined,
    skill,
  );
  return resolution?.waves[0]?.targets[0]?.unit ?? null;
}

export function resolveEffectResolution(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  _gameData: GameData,
  rand: () => number = Math.random,
  passives?: PassiveSkillDef[],
  allSkillEffects?: readonly SkillEffectDef[],
  priorEffectHitPools?: ReadonlyMap<number, readonly CombatantState[]>,
  skill?: ActiveSkillDef,
  sharedTargetingLocks?: ReadonlyMap<string, SkillEffectResolution>,
): SkillEffectResolution | null {
  const merged = mergeEffectWithSkillTargeting(skill, effect);
  const lockKey =
    skill !== undefined ? computeTargetingLockKey(skill, effect) : null;
  if (lockKey && sharedTargetingLocks?.has(lockKey)) {
    return sharedTargetingLocks.get(lockKey)!;
  }

  return resolveEffectResolutionInternal(
    merged,
    effect,
    actor,
    allies,
    enemies,
    _gameData,
    rand,
    passives,
    allSkillEffects ?? skill?.effect,
    priorEffectHitPools,
    skill,
  );
}

function resolveEffectResolutionInternal(
  merged: SkillEffectDef,
  sourceEffect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  _gameData: GameData,
  rand: () => number = Math.random,
  passives?: PassiveSkillDef[],
  allSkillEffects?: readonly SkillEffectDef[],
  priorEffectHitPools?: ReadonlyMap<number, readonly CombatantState[]>,
  skill?: ActiveSkillDef,
): SkillEffectResolution | null {
  if (sourceEffect.type === 'conditionalEffect') return null;
  if (sourceEffect.type === 'placedField') return null;

  const specForResolution = resolveEffectTargetSpec(
    sourceEffect,
    actor,
    allies,
    enemies,
    passives,
    skill,
  );

  if (sourceEffect.type === 'move') {
    const pool = getTargetPool(specForResolution, actor, allies, enemies);
    const target = pickTargetFromPoolSpec(specForResolution, actor, pool, {
      moveAnchor: true,
    });
    const rangePx = resolveSkillRangePx(
      actor,
      merged,
      livingAllies(allies).length,
    );
    if (!target) return null;
    return {
      waves: [{ hitIndex: 0, targets: [{ unit: target }] }],
    };
  }

  const rangePx = resolveSkillRangePx(
    actor,
    merged,
    livingAllies(allies).length,
  );
  const priorPool = resolvePriorEffectAttackablePool(
    specForResolution,
    priorEffectHitPools,
  );
  if (priorPool === null) return null;
  const attackablePool =
    priorPool ??
    getAttackablePool(specForResolution, actor, allies, enemies, rangePx);
  const shape: TargetShape = merged.targetShape ?? 'single';
  const basePower = getBaseAtkScale(sourceEffect);
  const pickOptions = pickOptionsForEffect(merged);

  const skipHealWithhold =
    allSkillEffects !== undefined &&
    skillHasBarrierEffect(allSkillEffects);
  if (
    sourceEffect.type === 'heal' &&
    (sourceEffect.healSubKind ?? 'instant') !== 'dispel' &&
    !skipHealWithhold &&
    !hasDamagedHealCandidate(
      merged,
      actor,
      allies,
      enemies,
      _gameData,
      passives,
      skill,
    )
  ) {
    return null;
  }

  if (shape === 'single') {
    if (isSelfOriginSpec(specForResolution)) {
      if (!actor.isAlive) return null;
      const targets = applyIncludeSelfFilter(specForResolution, actor, [{ unit: actor }]);
      if (targets.length === 0) return null;
      const hits = merged.hitCount;
      if (hits === undefined || hits < 2) {
        return { waves: [{ hitIndex: 0, targets }] };
      }
      const duration = merged.hitDurationSec;
      if (duration === undefined || duration <= 0) return null;
      return resolveRepeatedHitWaves(targets, hits, duration);
    }

    if (isMultiTargetSpec(specForResolution)) {
      const targets = attackablePool
        .filter((unit) => unit.isAlive)
        .map((unit) => ({ unit }));
      if (targets.length === 0) return null;
      const hits = merged.hitCount;
      if (hits === undefined || hits < 2) {
        return { waves: [{ hitIndex: 0, targets }] };
      }
      const duration = merged.hitDurationSec;
      if (duration === undefined || duration <= 0) return null;
      return resolveRepeatedHitWaves(targets, hits, duration);
    }

    const target = pickTargetFromPoolSpec(
      specForResolution,
      actor,
      attackablePool,
      pickOptions,
    );
    if (!target) return null;
    const hits = merged.hitCount;
    if (hits === undefined || hits < 2) {
      return {
        waves: [
          {
            hitIndex: 0,
            targets: applyIncludeSelfFilter(specForResolution, actor, [{ unit: target }]),
          },
        ],
      };
    }
    const duration = merged.hitDurationSec;
    if (duration === undefined || duration <= 0) return null;
    return resolveRepeatedHitWaves([{ unit: target }], hits, duration);
  }

  if (shape === 'aoe') {
    const radius = merged.aoeRadiusPx;
    if (radius === undefined || radius <= 0) return null;
    const targets = applyIncludeSelfFilter(
      specForResolution,
      actor,
      resolveAoeHitTargets(specForResolution, actor, attackablePool, radius, pickOptions),
    );
    if (targets.length === 0) return null;
    const hits = merged.hitCount;
    if (hits === undefined || hits < 2) {
      return { waves: [{ hitIndex: 0, targets }] };
    }
    const duration = merged.hitDurationSec;
    if (duration === undefined || duration <= 0) return null;
    return resolveRepeatedHitWaves(targets, hits, duration);
  }

  if (shape === 'multiLock') {
    const hits = merged.hitCount;
    if (hits === undefined || hits < 2) return null;
    const targets = resolveMultiLockHitTargets(
      specForResolution,
      actor,
      attackablePool,
      hits,
      pickOptions,
    );
    if (targets.length === 0) return null;
    return { waves: [{ hitIndex: 0, targets }] };
  }

  if (shape === 'poolEach') {
    const targets = attackablePool
      .filter((unit) => unit.isAlive)
      .map((unit) => ({ unit }));
    if (targets.length === 0) return null;
    return { waves: [{ hitIndex: 0, targets }] };
  }

  if (shape === 'pierce') {
    const targets = resolvePierceHitTargets(
      specForResolution,
      actor,
      allies,
      enemies,
      rangePx,
      basePower,
      merged,
    );
    if (targets.length === 0) return null;

    const duration = merged.pierceDurationSec;
    if (duration !== undefined && duration > 0 && targets.length > 1) {
      return {
        spreadDurationSec: duration,
        waves: targets.map((entry, hitIndex) => ({
          hitIndex,
          targets: [entry],
        })),
      };
    }
    return { waves: [{ hitIndex: 0, targets }] };
  }

  if (shape === 'chain') {
    const count = merged.chainCount;
    const maxDist = merged.chainMaxDistancePx;
    if (count === undefined || count < 1 || maxDist === undefined || maxDist <= 0) {
      return null;
    }
    const targets = resolveChainHitTargets(
      specForResolution,
      actor,
      attackablePool,
      allies,
      enemies,
      count,
      maxDist,
      basePower,
      merged,
    );
    if (targets.length === 0) return null;

    const waves = targets.map((entry, hitIndex) => ({
      hitIndex,
      targets: [entry],
    }));
    if (waves.length <= 1) {
      return { waves };
    }

    const explicitDuration = merged.chainDurationSec;
    const duration =
      explicitDuration !== undefined && explicitDuration > 0
        ? explicitDuration
        : 0.15 * count + DEFAULT_CHAIN_SPREAD_EXTRA_SEC;

    if (duration > 0) {
      return { spreadDurationSec: duration, waves };
    }
    return { waves };
  }

  if (shape === 'scatter') {
    const radius = merged.scatterRadiusPx;
    const hitCount = merged.scatterHitCount;
    const duration = merged.scatterDurationSec;
    if (
      radius === undefined ||
      radius <= 0 ||
      hitCount === undefined ||
      hitCount < 2 ||
      duration === undefined ||
      duration <= 0
    ) {
      return null;
    }
    const spreadRate = merged.scatterSpreadRate ?? 1;
    const spreadRadiusPx = merged.scatterSpreadRadiusPx ?? radius;
    const waves = resolveScatterWaves(
      specForResolution,
      actor,
      attackablePool,
      spreadRadiusPx,
      radius,
      hitCount,
      spreadRate,
      rand,
    );
    const hasAny = waves.some((wave) => wave.targets.length > 0);
    if (!hasAny) return null;
    return { spreadDurationSec: duration, waves };
  }

  return null;
}

function resolveMultiLockHitTargets(
  spec: TargetSpec,
  actor: CombatantState,
  attackablePool: CombatantState[],
  hitCount: number,
  pickOptions?: PickTargetOptions,
): SkillHitTarget[] {
  const selectable = filterSelectablePool(spec, attackablePool);
  if (selectable.length === 0) return [];

  const ordered = orderPoolByTarget(spec, actor, selectable, pickOptions);
  const targets: SkillHitTarget[] = [];
  for (let i = 0; i < hitCount; i++) {
    targets.push({ unit: ordered[i % ordered.length]! });
  }
  return targets;
}

function resolvePierceHitTargets(
  spec: TargetSpec,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  rangePx: number,
  basePowerMultiplier: number | undefined,
  effect: SkillEffectDef,
): SkillHitTarget[] {
  const side =
    spec.kind === 'distance'
      ? spec.side
      : spec.kind === 'stat' || spec.kind === 'all'
        ? spec.side
        : 'enemy';
  const pool = getTargetPool(
    { kind: 'distance', side, order: 'selfOrigin' },
    actor,
    allies,
    enemies,
  ).filter((unit) => unit.isAlive);

  const inSegment = pool
    .filter((unit) => isInForwardSegment(actor, unit, rangePx))
    .sort((a, b) =>
      actor.isEnemy
        ? getBattleX(b) - getBattleX(a)
        : getBattleX(a) - getBattleX(b),
    );

  const step = pierceStepFields(effect);
  const base = basePowerMultiplier ?? 1;
  const targets = inSegment.map((unit, index) => ({
    unit,
    powerMultiplierOverride: step
      ? applyPowerStep(base, index, step)
      : undefined,
  }));
  return applyIncludeSelfFilter(spec, actor, targets);
}

function pickChainNextTarget(
  candidates: CombatantState[],
  currentX: number,
  hitIds: ReadonlySet<string>,
): CombatantState {
  const unhit = candidates.filter((unit) => !hitIds.has(unit.id));
  const pool = unhit.length > 0 ? unhit : candidates;
  return pool.reduce((a, b) =>
    Math.abs(getBattleX(a) - currentX) <= Math.abs(getBattleX(b) - currentX)
      ? a
      : b,
  );
}

function resolveChainHitTargets(
  spec: TargetSpec,
  actor: CombatantState,
  attackablePool: CombatantState[],
  allies: CombatantState[],
  enemies: CombatantState[],
  chainCount: number,
  chainMaxDistancePx: number,
  basePowerMultiplier: number | undefined,
  effect: SkillEffectDef,
): SkillHitTarget[] {
  const result: SkillHitTarget[] = [];
  let current: CombatantState | null = pickTargetFromPoolSpec(
    spec,
    actor,
    attackablePool,
    pickOptionsForEffect(effect),
  );
  if (!current) return [];

  const step = chainStepFields(effect);
  const base = basePowerMultiplier ?? 1;

  for (let i = 0; i < chainCount; i++) {
    result.push({
      unit: current,
      powerMultiplierOverride: step
        ? applyPowerStep(base, i, step)
        : undefined,
    });
    if (i >= chainCount - 1) break;

    const currentX = getBattleX(current);
    const sameFaction: CombatantState[] = current.isEnemy
      ? livingEnemies(enemies)
      : livingAllies(allies);
    const candidates = sameFaction.filter(
      (unit) =>
        unit.isAlive &&
        unit.id !== current.id &&
        Math.abs(getBattleX(unit) - currentX) <= chainMaxDistancePx,
    );
    if (candidates.length === 0) break;

    const hitIds = new Set(result.map((entry) => entry.unit.id));
    current = pickChainNextTarget(candidates, currentX, hitIds);
  }

  return result;
}

function resolveRepeatedHitWaves(
  targets: SkillHitTarget[],
  hitCount: number,
  hitDurationSec: number,
): SkillEffectResolution | null {
  if (targets.length === 0) return null;
  const waves: SkillHitWave[] = [];
  for (let i = 0; i < hitCount; i++) {
    waves.push({ hitIndex: i, targets });
  }
  return { spreadDurationSec: hitDurationSec, waves };
}

function resolveScatterWaves(
  spec: TargetSpec,
  actor: CombatantState,
  attackablePool: CombatantState[],
  spreadRadiusPx: number,
  hitRadiusPx: number,
  hitCount: number,
  spreadRate: number,
  rand: () => number,
): SkillHitWave[] {
  const anchor = pickTargetFromPoolSpec(spec, actor, attackablePool);
  if (!anchor) return [];

  const anchorX = getBattleX(anchor);
  const waves: SkillHitWave[] = [];

  for (let i = 0; i < hitCount; i++) {
    const offset = (rand() * 2 - 1) * spreadRadiusPx * spreadRate;
    const centerX = anchorX + offset;
    const targets = attackablePool
      .filter(
        (unit) => Math.abs(getBattleX(unit) - centerX) <= hitRadiusPx,
      )
      .map((unit) => ({ unit }));
    waves.push({ hitIndex: i, targets });
  }

  return waves;
}

/** @deprecated 互換用。即時適用分のフラット target 一覧 */
export function resolveEffectTargets(
  effect: Pick<
    SkillEffectDef,
    'targetShape' | 'aoeRadiusPx' | 'hitCount' | 'range'
  > & { target?: TargetSpec; targetRule?: TargetRule; targetDebuffFilter?: import('../types.ts').DebuffFilterTag[] },
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState[] {
  const resolution = resolveEffectResolution(
    effect as SkillEffectDef,
    actor,
    allies,
    enemies,
    gameData,
  );
  if (!resolution) return [];
  return resolution.waves.flatMap((wave) =>
    wave.targets.map((entry) => entry.unit),
  );
}

export function resolutionHasTargets(
  resolution: SkillEffectResolution | null,
): boolean {
  if (!resolution) return false;
  return resolution.waves.some((wave) => wave.targets.length > 0);
}

export function extractResolutionHitUnits(
  resolution: SkillEffectResolution,
): CombatantState[] {
  const seen = new Set<string>();
  const units: CombatantState[] = [];
  for (const wave of resolution.waves) {
    for (const { unit } of wave.targets) {
      if (!unit.isAlive || seen.has(unit.id)) continue;
      seen.add(unit.id);
      units.push(unit);
    }
  }
  return units;
}

function resolvePriorEffectAttackablePool(
  spec: TargetSpec,
  priorEffectHitPools?: ReadonlyMap<number, readonly CombatantState[]>,
): CombatantState[] | null | undefined {
  if (spec.kind !== 'stat' || spec.poolFromEffectIndex === undefined) {
    return undefined;
  }
  const prior = priorEffectHitPools?.get(spec.poolFromEffectIndex);
  if (!prior || prior.length === 0) return null;
  const alive = prior.filter((unit) => unit.isAlive);
  return alive.length > 0 ? alive : null;
}
