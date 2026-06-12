import type {
  ActiveSkillDef,
  CombatantState,
  PendingSkillHit,
  SkillCooldown,
  SkillEffectDef,
  SkillEffectResolution,
} from '../types.ts';

export interface BuildPendingHitsOptions {
  stagedChainVfx?: boolean;
  effectIndex?: number;
}

export interface TickPendingHitsCallbacks {
  onApply: (hit: PendingSkillHit) => void;
  onVfxStart?: (hit: PendingSkillHit) => void;
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
  const spread = resolution.spreadDurationSec;
  if (spread === undefined || spread <= 0) return [];

  const waves = resolution.waves.filter((wave) => wave.targets.length > 0);
  if (waves.length === 0) return [];

  const segmentShape =
    effectDef.targetShape === 'chain' || effectDef.targetShape === 'pierce';
  const stagedChainVfx = options?.stagedChainVfx === true;
  const travelSec = stagedChainVfx ? spread / waves.length : undefined;
  let segmentSourceId = actorId;

  return waves.map((wave) => {
    const hitIndex = wave.hitIndex;
    const applyAtBattleSec = stagedChainVfx
      ? battleSec + (hitIndex + 1) * travelSec!
      : battleSec + (spread * hitIndex) / Math.max(waves.length, 1);

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
      ...(stagedChainVfx
        ? {
            vfxStartAtBattleSec: battleSec + hitIndex * travelSec!,
            travelDurationSec: travelSec,
            segmentCount: waves.length,
          }
        : {}),
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
  callbacks: TickPendingHitsCallbacks | ((hit: PendingSkillHit) => void),
): PendingSkillHit[] {
  const { onApply, onVfxStart } =
    typeof callbacks === 'function'
      ? { onApply: callbacks, onVfxStart: undefined }
      : callbacks;

  const remaining: PendingSkillHit[] = [];
  const sorted = [...queue].sort(
    (a, b) =>
      a.applyAtBattleSec - b.applyAtBattleSec ||
      (a.hitIndex ?? 0) - (b.hitIndex ?? 0),
  );

  for (const hit of sorted) {
    if (hit.applyAtBattleSec <= battleSec) {
      onApply(hit);
    } else {
      remaining.push(hit);
    }
  }

  if (onVfxStart) {
    for (const hit of queue) {
      if (
        hit.vfxStartAtBattleSec !== undefined &&
        hit.vfxStartAtBattleSec <= battleSec &&
        !hit.vfxSpawned
      ) {
        onVfxStart(hit);
        hit.vfxSpawned = true;
      }
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
