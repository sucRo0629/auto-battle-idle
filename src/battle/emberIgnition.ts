import { getEffectiveAtk, resolveDamage } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef, StatusEffect } from './types.ts';

/**
 * 種火は時間制ではない。鉄衛士 M1 永続 status と同じく
 * `Number.POSITIVE_INFINITY` を使い、tick で減算しても消滅しない。
 * 有限の巨大秒数（例: 99999）は使わない。
 */
const EMBER_IGNITION_TIMELESS_SEC = Number.POSITIVE_INFINITY;
const EMBER_IGNITION_ID_PREFIX = 'ember_ignition_';
const EMBER_IGNITION_DISPLAY_NAME = '種火';

export interface EmberIgnitionConfig {
  threshold: number;
  atkScale: number;
  damageBonusScale: number;
}

export interface EmberIgnitionOutcome {
  stacks: number;
  ignited: boolean;
  consumedStacks: number;
  resolvedDamage: number;
}

function emberIgnitionEffectId(targetId: string): string {
  return `${EMBER_IGNITION_ID_PREFIX}${targetId}`;
}

function findEmberIgnitionEffect(
  target: CombatantState,
): StatusEffect | undefined {
  return target.statusEffects.find(
    (effect) =>
      effect.overlay === 'emberIgnition' &&
      effect.id === emberIgnitionEffectId(target.id),
  );
}

export function getEmberIgnitionStacks(target: CombatantState): number {
  return findEmberIgnitionEffect(target)?.stacks ?? 0;
}

export function clearEmberIgnition(target: CombatantState): void {
  target.statusEffects = target.statusEffects.filter(
    (effect) => effect.overlay !== 'emberIgnition',
  );
}

/** Wave 終了時: 全 Combatant の種火を消去する */
export function clearAllEmberIgnition(units: readonly CombatantState[]): void {
  for (const unit of units) {
    clearEmberIgnition(unit);
  }
}

export function resolveEmberIgnitionConfig(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): EmberIgnitionConfig | undefined {
  let threshold: number | undefined;
  let atkScale: number | undefined;
  let damageBonusScale = 1;
  let thresholdReduction = 0;

  for (const passiveId of actor.build.learnedPassiveIds) {
    const passive = passives[passiveId];
    if (!passive) continue;
    if (passive.effect === 'emberIgnition') {
      threshold = passive.emberIgnitionThreshold ?? 5;
      atkScale = passive.emberIgnitionAtkScale ?? 1;
      continue;
    }
    if (passive.effect === 'ignitionDamageBonus') {
      damageBonusScale *= passive.ignitionDamageBonusScale ?? 1;
      continue;
    }
    if (passive.effect === 'ignitionThresholdReduction') {
      thresholdReduction += passive.ignitionThresholdReduction ?? 0;
    }
  }

  if (threshold === undefined || atkScale === undefined) return undefined;
  return {
    threshold: Math.max(1, threshold - thresholdReduction),
    atkScale,
    damageBonusScale: Math.max(0, damageBonusScale),
  };
}

function upsertEmberIgnitionEffect(
  actor: CombatantState,
  target: CombatantState,
  stacks: number,
): void {
  const existing = findEmberIgnitionEffect(target);
  if (existing) {
    existing.stacks = stacks;
    existing.durationSec = EMBER_IGNITION_TIMELESS_SEC;
    existing.remainingSec = EMBER_IGNITION_TIMELESS_SEC;
    return;
  }
  target.statusEffects.push({
    id: emberIgnitionEffectId(target.id),
    kind: 'debuff',
    overlay: 'emberIgnition',
    multiplier: 1,
    durationSec: EMBER_IGNITION_TIMELESS_SEC,
    remainingSec: EMBER_IGNITION_TIMELESS_SEC,
    stacks,
    sourceId: actor.id,
    displayName: EMBER_IGNITION_DISPLAY_NAME,
  });
}

export function shouldGrantEmberOnCombatModuleHit(options: {
  actorIsEnemy: boolean;
  targetIsEnemy: boolean;
  slotKind: 'basic' | 'active';
  isCombatModuleSkill: boolean;
  targetAlive: boolean;
}): boolean {
  return (
    options.slotKind === 'basic' &&
    options.isCombatModuleSkill &&
    options.targetAlive &&
    options.actorIsEnemy !== options.targetIsEnemy
  );
}

export function applyEmberIgnitionOnCombatModuleHit(
  actor: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): EmberIgnitionOutcome {
  const config = resolveEmberIgnitionConfig(actor, passives);
  if (!config || !target.isAlive) {
    return {
      stacks: getEmberIgnitionStacks(target),
      ignited: false,
      consumedStacks: 0,
      resolvedDamage: 0,
    };
  }

  const nextStacks = getEmberIgnitionStacks(target) + 1;
  if (nextStacks < config.threshold) {
    upsertEmberIgnitionEffect(actor, target, nextStacks);
    return {
      stacks: nextStacks,
      ignited: false,
      consumedStacks: 0,
      resolvedDamage: 0,
    };
  }

  clearEmberIgnition(target);
  const baseDamage = Math.floor(getEffectiveAtk(actor) * config.atkScale);
  const ignitionBase = Math.floor(baseDamage * config.damageBonusScale);
  const resolvedDamage =
    ignitionBase <= 0
      ? 0
      : resolveDamage(
          actor,
          target,
          {
            type: 'damage',
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
            damageType: 'magic',
            amount: { kind: 'flat', flatAmount: ignitionBase },
          },
          passives,
          {
            passiveContext: {
              slotKind: 'basic',
              isHitDamage: true,
            },
          },
        );
  return {
    stacks: 0,
    ignited: true,
    consumedStacks: nextStacks,
    resolvedDamage,
  };
}
