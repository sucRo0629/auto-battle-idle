import type {
  ActiveSkillDef,
  CombatantState,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  SkillEffectResolution,
} from '../types.ts';

export interface BuildPendingHitsOptions {
  effectIndex?: number;
  /** applyFrame 等による全ヒット共通の先頭遅延（秒） */
  baseDelaySec?: number;
}

export function buildPendingHitsFromResolution(
  resolution: SkillEffectResolution,
  battleSec: number,
  actorId: string,
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  cd: SkillCooldown,
  options?: BuildPendingHitsOptions,
): PendingSkillHit[] {
  const spread = resolution.spreadDurationSec ?? 0;
  const baseDelaySec = Math.max(0, options?.baseDelaySec ?? 0);
  const hasSpread = spread > 0;
  if (!hasSpread && baseDelaySec <= 0) return [];

  const waves = resolution.waves.filter((wave) => wave.targets.length > 0);
  if (waves.length === 0) return [];

  const segmentShape =
    effectDef.targetShape === 'chain' || effectDef.targetShape === 'pierce';
  let segmentSourceId = actorId;

  return waves.map((wave) => {
    const hitIndex = wave.hitIndex;
    let applyAtBattleSec: number;
    if (hasSpread) {
      applyAtBattleSec =
        battleSec +
        baseDelaySec +
        (spread * hitIndex) / Math.max(waves.length, 1);
    } else {
      applyAtBattleSec = battleSec + baseDelaySec;
    }

    const hit: PendingSkillHit = {
      applyAtBattleSec,
      actorId,
      skillId: skill.id,
      skillName: skill.name,
      effectDef,
      effectIndex: options?.effectIndex ?? 0,
      slotKind: cd.slotKind,
      hitIndex,
      targets: wave.targets.map((entry) => ({
        targetId: entry.unit.id,
        powerMultiplierOverride: entry.powerMultiplierOverride,
      })),
    };
    if (segmentShape) {
      hit.vfxSourceId = segmentSourceId;
      const firstTarget = wave.targets[0];
      if (firstTarget) {
        segmentSourceId = firstTarget.unit.id;
      }
    }
    return hit;
  });
}

export function tickPendingHits(
  queue: PendingSkillHit[],
  battleSec: number,
  onApply: (hit: PendingSkillHit) => void | boolean,
): PendingSkillHit[] {
  const remaining: PendingSkillHit[] = [];
  const sorted = [...queue].sort(
    (a, b) =>
      a.applyAtBattleSec - b.applyAtBattleSec ||
      (a.hitIndex ?? 0) - (b.hitIndex ?? 0),
  );

  for (const hit of sorted) {
    if (hit.applyAtBattleSec <= battleSec) {
      if (onApply(hit) === false) {
        remaining.push(hit);
      }
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
