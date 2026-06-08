import {
  getEffectiveAtk,
  getEffectiveDef,
  getEffectiveReg,
} from '../combatMath.ts';
import type {
  CombatantState,
  PassiveSkillDef,
  SkillEffectDef,
  SkillEffectResolution,
  SkillHitTarget,
  SkillHitWave,
  TargetRule,
  TargetShape,
} from '../types.ts';
import {
  applyPowerStep,
  chainStepFields,
  pierceStepFields,
} from './powerStep.ts';
import { getBattleX } from '../combatPosition.ts';
import {
  getAttackablePool,
  resolveSkillRangePx,
} from './rangeUtils.ts';
import { pickThreatWeightedAlly } from '../threat.ts';
import { getTargetPoolForRule } from './targetingPool.ts';

export { getTargetPoolForRule } from './targetingPool.ts';

export interface TargetRuleContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
}

/** パッシブ targetRuleOverride は候補がいるときだけ適用（射手排除など） */
export function resolveTargetRule(
  passives: PassiveSkillDef[],
  defaultRule: TargetRule,
  context?: TargetRuleContext,
): TargetRule {
  for (let i = passives.length - 1; i >= 0; i--) {
    const override = passives[i].targetRuleOverride;
    if (!override) continue;
    if (context) {
      const pool = getTargetPoolForRule(
        override,
        context.actor,
        context.allies,
        context.enemies,
      );
      if (pool.length > 0) return override;
      continue;
    }
    return override;
  }
  return defaultRule;
}

function livingAllies(allies: CombatantState[]): CombatantState[] {
  return allies.filter((a) => a.isAlive);
}

function livingEnemies(enemies: CombatantState[]): CombatantState[] {
  return enemies.filter((e) => e.isAlive);
}

export function pickTargetFromPool(
  rule: TargetRule,
  actor: CombatantState,
  pool: CombatantState[],
): CombatantState | null {
  if (pool.length === 0) return null;

  if (rule === 'self') {
    return actor.isAlive ? actor : null;
  }

  if (actor.isEnemy) {
    switch (rule) {
      case 'closestAlly':
        return pickThreatWeightedAlly(pool);
      default:
        return pool[0] ?? null;
    }
  }

  if (rule === 'closestAlly') {
    const others = pool.filter((unit) => unit.id !== actor.id);
    if (others.length === 0) return null;
    const actorX = getBattleX(actor);
    return others.reduce((a, b) =>
      Math.abs(getBattleX(a) - actorX) <= Math.abs(getBattleX(b) - actorX)
        ? a
        : b,
    );
  }

  switch (rule) {
    case 'frontEnemy':
    case 'rangedAttackingEnemy':
      return pool.reduce((a, b) =>
        getBattleX(a) >= getBattleX(b) ? a : b,
      );
    case 'lowestHpEnemy':
      return pool.reduce((a, b) => (a.hp <= b.hp ? a : b));
    case 'highestHpEnemy':
      return pool.reduce((a, b) => (a.hp >= b.hp ? a : b));
    case 'highestAtkEnemy':
      return pool.reduce((a, b) =>
        getEffectiveAtk(a) >= getEffectiveAtk(b) ? a : b,
      );
    case 'lowestDefEnemy':
      return pool.reduce((a, b) =>
        getEffectiveDef(a) <= getEffectiveDef(b) ? a : b,
      );
    case 'highestDefEnemy':
      return pool.reduce((a, b) =>
        getEffectiveDef(a) >= getEffectiveDef(b) ? a : b,
      );
    case 'lowestRegEnemy':
      return pool.reduce((a, b) =>
        getEffectiveReg(a) <= getEffectiveReg(b) ? a : b,
      );
    case 'highestRegEnemy':
      return pool.reduce((a, b) =>
        getEffectiveReg(a) >= getEffectiveReg(b) ? a : b,
      );
    case 'farthestEnemy':
      return pool.reduce((a, b) =>
        getBattleX(a) <= getBattleX(b) ? a : b,
      );
    case 'mostDamagedAlly':
      return pool.reduce((a, b) =>
        a.maxHp - a.hp >= b.maxHp - b.hp ? a : b,
      );
    default:
      return pool[0] ?? null;
  }
}

/** @deprecated 互換用。resolveEffectResolution を優先 */
export function pickTarget(
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState | null {
  const pool = getTargetPoolForRule(rule, actor, allies, enemies);
  return pickTargetFromPool(rule, actor, pool);
}

function resolveAoeHitTargets(
  rule: TargetRule,
  actor: CombatantState,
  attackablePool: CombatantState[],
  aoeRadiusPx: number,
): SkillHitTarget[] {
  const anchor = pickTargetFromPool(rule, actor, attackablePool);
  if (!anchor) return [];

  const anchorX = getBattleX(anchor);
  return attackablePool
    .filter((unit) => Math.abs(getBattleX(unit) - anchorX) <= aoeRadiusPx)
    .map((unit) => ({ unit }));
}

function orderPoolByRule(
  rule: TargetRule,
  actor: CombatantState,
  pool: CombatantState[],
): CombatantState[] {
  if (pool.length <= 1) return [...pool];

  const copy = [...pool];
  if (rule === 'self') return copy;

  if (actor.isEnemy) {
    if (rule === 'closestAlly') {
      return copy.sort((a, b) => (b.threat ?? 0) - (a.threat ?? 0));
    }
    return copy;
  }

  if (rule === 'closestAlly') {
    const actorX = getBattleX(actor);
    return copy
      .filter((unit) => unit.id !== actor.id)
      .sort(
        (a, b) =>
          Math.abs(getBattleX(a) - actorX) - Math.abs(getBattleX(b) - actorX),
      );
  }

  switch (rule) {
    case 'frontEnemy':
    case 'rangedAttackingEnemy':
      return copy.sort((a, b) => getBattleX(b) - getBattleX(a));
    case 'farthestEnemy':
      return copy.sort((a, b) => getBattleX(a) - getBattleX(b));
    case 'lowestHpEnemy':
      return copy.sort((a, b) => a.hp - b.hp);
    case 'highestHpEnemy':
      return copy.sort((a, b) => b.hp - a.hp);
    case 'highestAtkEnemy':
      return copy.sort(
        (a, b) => getEffectiveAtk(b) - getEffectiveAtk(a),
      );
    case 'lowestDefEnemy':
      return copy.sort(
        (a, b) => getEffectiveDef(a) - getEffectiveDef(b),
      );
    case 'highestDefEnemy':
      return copy.sort(
        (a, b) => getEffectiveDef(b) - getEffectiveDef(a),
      );
    case 'lowestRegEnemy':
      return copy.sort(
        (a, b) => getEffectiveReg(a) - getEffectiveReg(b),
      );
    case 'highestRegEnemy':
      return copy.sort(
        (a, b) => getEffectiveReg(b) - getEffectiveReg(a),
      );
    case 'mostDamagedAlly':
      return copy.sort(
        (a, b) => b.maxHp - b.hp - (a.maxHp - a.hp),
      );
    default:
      return copy.sort((a, b) => getBattleX(a) - getBattleX(b));
  }
}

function resolveMultiLockHitTargets(
  rule: TargetRule,
  actor: CombatantState,
  attackablePool: CombatantState[],
  hitCount: number,
): SkillHitTarget[] {
  if (attackablePool.length === 0) return [];

  const ordered = orderPoolByRule(rule, actor, attackablePool);
  const targets: SkillHitTarget[] = [];
  for (let i = 0; i < hitCount; i++) {
    targets.push({ unit: ordered[i % ordered.length]! });
  }
  return targets;
}

function resolvePierceHitTargets(
  actor: CombatantState,
  attackablePool: CombatantState[],
  rangePx: number,
  basePowerMultiplier: number | undefined,
  effect: SkillEffectDef,
): SkillHitTarget[] {
  const actorX = getBattleX(actor);
  const minX = actorX - rangePx;
  const inLine = attackablePool
    .filter((unit) => {
      const x = getBattleX(unit);
      return x <= actorX && x >= minX;
    })
    .sort((a, b) => getBattleX(b) - getBattleX(a));

  const step = pierceStepFields(effect);
  const base = basePowerMultiplier ?? 1;
  return inLine.map((unit, index) => ({
    unit,
    powerMultiplierOverride: step
      ? applyPowerStep(base, index, step)
      : undefined,
  }));
}

function resolveChainHitTargets(
  rule: TargetRule,
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
  let current: CombatantState | null = pickTargetFromPool(
    rule,
    actor,
    attackablePool,
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

    const hitIds = new Set(result.map((entry) => entry.unit.id));
    const currentX = getBattleX(current);
    const sameFaction: CombatantState[] = current.isEnemy
      ? livingEnemies(enemies)
      : livingAllies(allies);
    const candidates = sameFaction.filter(
      (unit) =>
        unit.isAlive &&
        !hitIds.has(unit.id) &&
        Math.abs(getBattleX(unit) - currentX) <= chainMaxDistancePx,
    );
    if (candidates.length === 0) break;

    current = candidates.reduce((a, b) =>
      Math.abs(getBattleX(a) - currentX) <= Math.abs(getBattleX(b) - currentX)
        ? a
        : b,
    );
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
  rule: TargetRule,
  actor: CombatantState,
  attackablePool: CombatantState[],
  spreadRadiusPx: number,
  hitRadiusPx: number,
  hitCount: number,
  spreadRate: number,
  rand: () => number,
): SkillHitWave[] {
  const anchor = pickTargetFromPool(rule, actor, attackablePool);
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

function getBaseAtkScale(effect: SkillEffectDef): number | undefined {
  if (effect.type === 'damage' || effect.type === 'heal') {
    if (effect.amount.kind === 'atkBased') {
      return effect.amount.atkScale ?? 1;
    }
  }
  return undefined;
}

/** move は射程外でも anchor を選ぶ */
export function resolveEffectAnchor(
  effect: SkillEffectDef,
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState | null {
  if (effect.type === 'move') {
    const pool = getTargetPoolForRule(rule, actor, allies, enemies);
    return pickTargetFromPool(rule, actor, pool);
  }
  const resolution = resolveEffectResolution(
    effect,
    rule,
    actor,
    allies,
    enemies,
  );
  return resolution?.waves[0]?.targets[0]?.unit ?? null;
}

export function resolveEffectResolution(
  effect: SkillEffectDef,
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  rand: () => number = Math.random,
): SkillEffectResolution | null {
  if (effect.type === 'move') {
    const pool = getTargetPoolForRule(rule, actor, allies, enemies);
    const target = pickTargetFromPool(rule, actor, pool);
    if (!target) return null;
    return {
      waves: [{ hitIndex: 0, targets: [{ unit: target }] }],
    };
  }

  const rangePx = resolveSkillRangePx(actor, effect);
  const attackablePool = getAttackablePool(rule, actor, allies, enemies, rangePx);
  const shape: TargetShape = effect.targetShape ?? 'single';
  const basePower = getBaseAtkScale(effect);

  if (shape === 'single') {
    const target = pickTargetFromPool(rule, actor, attackablePool);
    if (!target) return null;
    const hits = effect.hitCount;
    if (hits === undefined || hits < 2) {
      return {
        waves: [{ hitIndex: 0, targets: [{ unit: target }] }],
      };
    }
    const duration = effect.hitDurationSec;
    if (duration === undefined || duration <= 0) return null;
    return resolveRepeatedHitWaves([{ unit: target }], hits, duration);
  }

  if (shape === 'aoe') {
    const radius = effect.aoeRadiusPx;
    if (radius === undefined || radius <= 0) return null;
    const targets = resolveAoeHitTargets(rule, actor, attackablePool, radius);
    if (targets.length === 0) return null;
    const hits = effect.hitCount;
    if (hits === undefined || hits < 2) {
      return { waves: [{ hitIndex: 0, targets }] };
    }
    const duration = effect.hitDurationSec;
    if (duration === undefined || duration <= 0) return null;
    return resolveRepeatedHitWaves(targets, hits, duration);
  }

  if (shape === 'multiLock') {
    const hits = effect.hitCount;
    if (hits === undefined || hits < 2) return null;
    const targets = resolveMultiLockHitTargets(
      rule,
      actor,
      attackablePool,
      hits,
    );
    if (targets.length === 0) return null;
    return { waves: [{ hitIndex: 0, targets }] };
  }

  if (shape === 'pierce') {
    const targets = resolvePierceHitTargets(
      actor,
      attackablePool,
      rangePx,
      basePower,
      effect,
    );
    if (targets.length === 0) return null;

    const duration = effect.pierceDurationSec;
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
    const count = effect.chainCount;
    const maxDist = effect.chainMaxDistancePx;
    if (count === undefined || count < 1 || maxDist === undefined || maxDist <= 0) {
      return null;
    }
    const targets = resolveChainHitTargets(
      rule,
      actor,
      attackablePool,
      allies,
      enemies,
      count,
      maxDist,
      basePower,
      effect,
    );
    if (targets.length === 0) return null;
    return {
      waves: targets.map((entry, hitIndex) => ({
        hitIndex,
        targets: [entry],
      })),
    };
  }

  if (shape === 'scatter') {
    const radius = effect.scatterRadiusPx;
    const hitCount = effect.scatterHitCount;
    const duration = effect.scatterDurationSec;
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
    const spreadRate = effect.scatterSpreadRate ?? 1;
    const spreadRadiusPx = effect.scatterSpreadRadiusPx ?? radius;
    const waves = resolveScatterWaves(
      rule,
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

/** @deprecated 互換用。即時適用分のフラット target 一覧 */
export function resolveEffectTargets(
  effect: Pick<
    SkillEffectDef,
    'targetShape' | 'aoeRadiusPx' | 'hitCount' | 'range'
  >,
  rule: TargetRule,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState[] {
  const resolution = resolveEffectResolution(
    effect as SkillEffectDef,
    rule,
    actor,
    allies,
    enemies,
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
