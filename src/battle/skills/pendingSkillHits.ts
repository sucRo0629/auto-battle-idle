import type {
  ActiveSkillDef,
  CombatantState,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  SkillEffectResolution,
} from '../types.ts';

export function buildPendingHitsFromResolution(
  resolution: SkillEffectResolution,
  battleSec: number,
  actorId: string,
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  cd: SkillCooldown,
): PendingSkillHit[] {
  const spread = resolution.spreadDurationSec;
  if (spread === undefined || spread <= 0) return [];

  const waves = resolution.waves.filter((wave) => wave.targets.length > 0);
  if (waves.length === 0) return [];

  return waves.map((wave) => ({
    applyAtBattleSec:
      battleSec + (spread * wave.hitIndex) / Math.max(waves.length, 1),
    actorId,
    skillId: skill.id,
    skillName: skill.name,
    effectDef,
    slotKind: cd.slotKind,
    hitIndex: wave.hitIndex,
    targets: wave.targets.map((entry) => ({
      targetId: entry.unit.id,
      powerMultiplierOverride: entry.powerMultiplierOverride,
    })),
  }));
}

export function tickPendingHits(
  queue: PendingSkillHit[],
  battleSec: number,
  onApply: (hit: PendingSkillHit) => void,
): PendingSkillHit[] {
  const remaining: PendingSkillHit[] = [];
  for (const hit of queue) {
    if (hit.applyAtBattleSec <= battleSec) {
      onApply(hit);
    } else {
      remaining.push(hit);
    }
  }
  return remaining;
}

export function findCombatantById(
  id: string,
  allies: CombatantState[],
  enemies: CombatantState[],
): CombatantState | undefined {
  return [...allies, ...enemies].find((unit) => unit.id === id);
}
