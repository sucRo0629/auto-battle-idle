import {
  applyDefenseMitigation,
  getEffectiveMaxHp,
  resolveDamage,
} from './combatMath.ts';
import {
  computeBlockMitigationRatio,
  getBlockChance,
} from './blockMitigation.ts';
import { getEvasionChance } from './passiveEffects.ts';
import type {
  CombatantState,
  PassiveSkillDef,
  PendingSkillHit,
} from './types.ts';
import { findCombatantById } from './skills/pendingSkillHits.ts';
import { resolveSkillDamageType } from './skills/damageTypeUtils.ts';

function estimateBlockMitigatedPhysicalDamage(
  defender: CombatantState,
  physicalDamage: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (physicalDamage <= 0) return 0;
  const chance = getBlockChance(defender, passives);
  const blockedWhenSuccess = Math.floor(
    physicalDamage * computeBlockMitigationRatio(defender),
  );
  const damageWhenBlocked = Math.max(0, physicalDamage - blockedWhenSuccess);
  return Math.floor(
    (1 - chance) * physicalDamage + chance * damageWhenBlocked,
  );
}

function estimateEvasionMitigatedDamage(
  defender: CombatantState,
  damage: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (damage <= 0) return 0;
  const chance = Math.min(1, getEvasionChance(defender, passives));
  return Math.floor(damage * (1 - chance));
}

export function estimatePendingDamageToTarget(
  attacker: CombatantState,
  target: CombatantState,
  hit: PendingSkillHit,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (hit.effectDef.type !== 'damage') return 0;
  const raw = resolveDamage(attacker, target, hit.effectDef, passives, {
    atkScaleOverride: hit.targets.find((entry) => entry.targetId === target.id)
      ?.powerMultiplierOverride,
  });
  let mitigated = applyDefenseMitigation(
    raw,
    target,
    resolveSkillDamageType(attacker, hit.effectDef),
  );
  const damageType = resolveSkillDamageType(attacker, hit.effectDef);
  if (damageType === 'physical') {
    mitigated = estimateBlockMitigatedPhysicalDamage(
      target,
      mitigated,
      passives,
    );
  }
  return estimateEvasionMitigatedDamage(target, mitigated, passives);
}

export function evaluatePendingIncomingDamage(
  allies: CombatantState[],
  enemies: CombatantState[],
  pendingHitQueue: readonly PendingSkillHit[],
  battleTimeSec: number,
  maxHpRatio: number,
  windowSec: number,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  const deadline = battleTimeSec + windowSec;
  const enemyIds = new Set(enemies.map((enemy) => enemy.id));

  for (const hit of pendingHitQueue) {
    if (hit.applyAtBattleSec > deadline) continue;
    if (!enemyIds.has(hit.actorId)) continue;
    if (hit.effectDef.type !== 'damage') continue;

    const attacker = findCombatantById(hit.actorId, allies, enemies);
    if (!attacker?.isAlive) continue;

    for (const entry of hit.targets) {
      const target = findCombatantById(entry.targetId, allies, enemies);
      if (!target?.isAlive || target.isEnemy) continue;

      const estimated = estimatePendingDamageToTarget(
        attacker,
        target,
        {
          ...hit,
          targets: [entry],
        },
        passives,
      );
      const threshold = getEffectiveMaxHp(target) * maxHpRatio;
      if (estimated >= threshold) return true;
    }
  }

  return false;
}
