import type {
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
import {
  getAttackablePool,
  resolveSkillRangePx,
} from './rangeUtils.ts';
import {
  getEffectTarget,
  getTargetPool,
  isMultiTargetSpec,
  normalizeTarget,
  orderPoolByTarget,
  pickTargetFromPool as pickTargetFromPoolSpec,
} from './targetSpec.ts';
import {
  getTargetPoolForEffect,
  getTargetPoolForRule,
  getTargetPoolForSpec,
} from './targetingPool.ts';

export {
  getTargetPoolForEffect,
  getTargetPoolForRule,
  getTargetPoolForSpec,
} from './targetingPool.ts';
export {
  formatTargetLabel,
  getEffectTarget,
  normalizeTarget,
} from './targetSpec.ts';

export interface TargetRuleContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
}

/** パッシブ targetRuleOverride は候補がいるときだけ適用（射手排除など） */
export function resolveTargetSpec(
  passives: PassiveSkillDef[],
  defaultSpec: TargetSpec,
  context?: TargetRuleContext,
): TargetSpec {
  for (let i = passives.length - 1; i >= 0; i--) {
    const override = passives[i].targetRuleOverride;
    if (!override) continue;
    if (context) {
      const pool = getTargetPool(override, context.actor, context.allies, context.enemies);
      if (pool.length > 0) return override;
      continue;
    }
    return override;
  }
  return defaultSpec;
}

/** @deprecated Use resolveTargetSpec */
export function resolveTargetRule(
  passives: PassiveSkillDef[],
  defaultRule: TargetRule,
  context?: TargetRuleContext,
): TargetRule {
  const defaultSpec = normalizeTarget(defaultRule);
  const resolved = resolveTargetSpec(passives, defaultSpec, context);
  return targetSpecToLegacyRule(resolved) ?? defaultRule;
}

function targetSpecToLegacyRule(spec: TargetSpec): TargetRule | null {
  switch (spec.kind) {
    case 'self':
      return 'self';
    case 'all':
      return spec.side === 'ally' ? 'allAllies' : 'allEnemies';
    case 'distance':
      if (spec.side === 'ally' && spec.order === 'nearest') return 'closestAlly';
      if (spec.side === 'enemy' && spec.order === 'nearest') return 'frontEnemy';
      if (spec.side === 'enemy' && spec.order === 'farthest') return 'farthestEnemy';
      return null;
    case 'stat':
      if (spec.side === 'ally' && spec.stat === 'hp' && spec.order === 'ratio') {
        return 'mostDamagedAlly';
      }
      if (spec.side === 'enemy' && spec.stat === 'hp' && spec.order === 'lowest') {
        return 'lowestHpEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'hp' && spec.order === 'highest') {
        return 'highestHpEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'atk' && spec.order === 'highest') {
        return 'highestAtkEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'def' && spec.order === 'lowest') {
        return 'lowestDefEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'def' && spec.order === 'highest') {
        return 'highestDefEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'reg' && spec.order === 'lowest') {
        return 'lowestRegEnemy';
      }
      if (spec.side === 'enemy' && spec.stat === 'reg' && spec.order === 'highest') {
        return 'highestRegEnemy';
      }
      return null;
    case 'attackType':
      if (spec.ranged && !spec.physical && !spec.magic && !spec.melee) {
        return 'rangedAttackingEnemy';
      }
      if (spec.magic && !spec.physical && !spec.ranged && !spec.melee) {
        return 'magicAttackingEnemy';
      }
      return null;
    case 'status':
      return 'debuffedEnemy';
  }
}

function livingAllies(allies: CombatantState[]): CombatantState[] {
  return allies.filter((a) => a.isAlive);
}

function livingEnemies(enemies: CombatantState[]): CombatantState[] {
  return enemies.filter((e) => e.isAlive);
}

export function pickTargetFromPool(
  specOrRule: TargetSpec | TargetRule,
  actor: CombatantState,
  pool: CombatantState[],
): CombatantState | null {
  const spec =
    typeof specOrRule === 'string'
      ? normalizeTarget(specOrRule)
      : specOrRule;
  return pickTargetFromPoolSpec(spec, actor, pool);
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
): SkillHitTarget[] {
  const anchor = pickTargetFromPoolSpec(spec, actor, attackablePool);
  if (!anchor) return [];

  const anchorX = getBattleX(anchor);
  return attackablePool
    .filter((unit) => Math.abs(getBattleX(unit) - anchorX) <= aoeRadiusPx)
    .map((unit) => ({ unit }));
}

function getBaseAtkScale(effect: SkillEffectDef): number | undefined {
  if (effect.type === 'damage' || effect.type === 'heal') {
    if (effect.amount.kind === 'atkBased') {
      return effect.amount.atkScale ?? 1;
    }
  }
  return undefined;
}

function resolveEffectTargetSpec(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives?: PassiveSkillDef[],
): TargetSpec {
  const defaultSpec = getEffectTarget(effect);
  if (!passives || passives.length === 0) return defaultSpec;
  return resolveTargetSpec(passives, defaultSpec, { actor, allies, enemies });
}

/** move は射程外でも anchor を選ぶ */
export function resolveEffectAnchor(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  passives?: PassiveSkillDef[],
): CombatantState | null {
  const spec = resolveEffectTargetSpec(effect, actor, allies, enemies, passives);
  if (effect.type === 'move') {
    const pool = getTargetPool(spec, actor, allies, enemies);
    return pickTargetFromPoolSpec(spec, actor, pool);
  }
  const resolution = resolveEffectResolution(
    effect,
    actor,
    allies,
    enemies,
    gameData,
    Math.random,
    passives,
  );
  return resolution?.waves[0]?.targets[0]?.unit ?? null;
}

export function resolveEffectResolution(
  effect: SkillEffectDef,
  actor: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  rand: () => number = Math.random,
  passives?: PassiveSkillDef[],
): SkillEffectResolution | null {
  const spec = resolveEffectTargetSpec(effect, actor, allies, enemies, passives);

  if (effect.type === 'move') {
    const pool = getTargetPool(spec, actor, allies, enemies);
    const target = pickTargetFromPoolSpec(spec, actor, pool);
    if (!target) return null;
    return {
      waves: [{ hitIndex: 0, targets: [{ unit: target }] }],
    };
  }

  const rangePx = resolveSkillRangePx(actor, effect);
  const attackablePool = getAttackablePool(spec, actor, allies, enemies, rangePx);
  const shape: TargetShape = effect.targetShape ?? 'single';
  const basePower = getBaseAtkScale(effect);

  if (shape === 'single') {
    if (isMultiTargetSpec(spec)) {
      const targets = attackablePool
        .filter((unit) => unit.isAlive)
        .map((unit) => ({ unit }));
      if (targets.length === 0) return null;
      const hits = effect.hitCount;
      if (hits === undefined || hits < 2) {
        return { waves: [{ hitIndex: 0, targets }] };
      }
      const duration = effect.hitDurationSec;
      if (duration === undefined || duration <= 0) return null;
      return resolveRepeatedHitWaves(targets, hits, duration);
    }

    const target = pickTargetFromPoolSpec(spec, actor, attackablePool);
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
    const targets = resolveAoeHitTargets(spec, actor, attackablePool, radius);
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
      spec,
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
      spec,
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
      spec,
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
): SkillHitTarget[] {
  if (attackablePool.length === 0) return [];

  const ordered = orderPoolByTarget(spec, actor, attackablePool);
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
