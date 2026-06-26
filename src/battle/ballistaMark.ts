import {
  getEffectiveMaxHp,
  getPassiveDefs,
} from './combatMath.ts';
import { pickTargetFromPool, getTargetPool } from './skills/targetSpec.ts';
import type {
  CombatantState,
  PassiveSkillDef,
  TargetSpec,
} from './types.ts';

export const BALLISTA_MARK_OVERLAY = 'ballistaMark' as const;
export const BALLISTA_MARK_DISPLAY_NAME = '砲撃標的';
const BALLISTA_MARK_ID_PREFIX = 'ballista_mark_';
const BALLISTA_MARK_SELF_DEBUFF_PREFIX = 'ballista_mark_self_spd_';
const BALLISTA_MARK_AURA_DURATION_SEC = 99999;

export interface MergedBallistaMarkConfig {
  passiveId: string;
  splashRadiusPx: number;
  splashDamageScale: number;
  selfAttackSpeedMul: number;
  targetRuleOverride?: TargetSpec;
}

export function isBallistaMarked(enemy: CombatantState): boolean {
  return enemy.statusEffects.some(
    (effect) =>
      effect.overlay === BALLISTA_MARK_OVERLAY && effect.remainingSec > 0,
  );
}

export function resolveBallistaMarkSourceId(
  markedEnemy: CombatantState,
): string | undefined {
  return markedEnemy.statusEffects.find(
    (effect) =>
      effect.overlay === BALLISTA_MARK_OVERLAY && effect.remainingSec > 0,
  )?.sourceId;
}

export function mergeBallistaMarkPassive(
  passives: PassiveSkillDef[],
): MergedBallistaMarkConfig | undefined {
  for (const passive of passives) {
    if (passive.effect !== 'ballistaMark') continue;
    return {
      passiveId: passive.id,
      splashRadiusPx: passive.ballistaMarkSplashRadiusPx ?? 50,
      splashDamageScale: passive.ballistaMarkSplashDamageScale ?? 0.3,
      selfAttackSpeedMul: passive.ballistaMarkSelfAttackSpeedMul ?? 0.85,
      targetRuleOverride: passive.targetRuleOverride,
    };
  }
  return undefined;
}

function pickBallistaMarkTarget(
  source: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  targetRule?: TargetSpec,
): CombatantState | null {
  const spec: TargetSpec = targetRule ?? {
    kind: 'stat',
    side: 'enemy',
    stat: 'maxHp',
    order: 'highest',
  };
  const pool = getTargetPool(spec, source, allies, enemies).filter(
    (unit) => unit.isAlive,
  );
  return pickTargetFromPool(spec, source, pool);
}

export function syncBallistaMarks(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const enemy of enemies) {
    enemy.statusEffects = enemy.statusEffects.filter(
      (effect) => effect.overlay !== BALLISTA_MARK_OVERLAY,
    );
  }

  const units = [...allies, ...enemies];
  for (const source of units) {
    if (!source.isAlive) continue;
    const config = mergeBallistaMarkPassive(
      getPassiveDefs(source, passives),
    );
    if (!config) continue;

    source.statusEffects = source.statusEffects.filter(
      (effect) => !effect.id.startsWith(BALLISTA_MARK_SELF_DEBUFF_PREFIX),
    );
    if (config.selfAttackSpeedMul < 1) {
      source.statusEffects.push({
        id: `${BALLISTA_MARK_SELF_DEBUFF_PREFIX}${source.id}`,
        kind: 'debuff',
        stat: 'attackSpeed',
        multiplier: config.selfAttackSpeedMul,
        durationSec: BALLISTA_MARK_AURA_DURATION_SEC,
        remainingSec: BALLISTA_MARK_AURA_DURATION_SEC,
        sourceId: source.id,
        skillId: config.passiveId,
      });
    }

    const markTarget = pickBallistaMarkTarget(
      source,
      allies,
      enemies,
      config.targetRuleOverride,
    );
    if (!markTarget) continue;

    const effectId = `${BALLISTA_MARK_ID_PREFIX}${source.id}`;
    markTarget.statusEffects = markTarget.statusEffects.filter(
      (effect) => effect.id !== effectId,
    );
    markTarget.statusEffects.push({
      id: effectId,
      kind: 'debuff',
      overlay: BALLISTA_MARK_OVERLAY,
      multiplier: 1,
      durationSec: BALLISTA_MARK_AURA_DURATION_SEC,
      remainingSec: BALLISTA_MARK_AURA_DURATION_SEC,
      sourceId: source.id,
      skillId: config.passiveId,
      displayName: BALLISTA_MARK_DISPLAY_NAME,
      stacks: 1,
    });
  }
}

export function clearBallistaMarksFromSource(
  sourceId: string,
  enemies: CombatantState[],
): void {
  for (const enemy of enemies) {
    enemy.statusEffects = enemy.statusEffects.filter(
      (effect) =>
        !(
          effect.overlay === BALLISTA_MARK_OVERLAY &&
          effect.sourceId === sourceId
        ),
    );
  }
}

export function findBallistaMarkSplashTargets(
  markTarget: CombatantState,
  enemies: CombatantState[],
  radiusPx: number,
): CombatantState[] {
  const markX = markTarget.battleX;
  return enemies.filter((enemy) => {
    if (!enemy.isAlive || enemy.id === markTarget.id) return false;
    return Math.abs(enemy.battleX - markX) <= radiusPx;
  });
}

export function resolveBallistaMarkSplashDamage(
  primaryAppliedDamage: number,
  splashDamageScale: number,
): number {
  if (primaryAppliedDamage <= 0 || splashDamageScale <= 0) return 0;
  return Math.max(1, Math.floor(primaryAppliedDamage * splashDamageScale));
}

/** マーク対象の maxHp（表示・ターゲット比較用） */
export function getUnitMaxHpForTargetCompare(unit: CombatantState): number {
  return getEffectiveMaxHp(unit);
}
