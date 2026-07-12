import { isOperationPassiveCandidateForClass } from '../game/operationPassiveCatalog.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { usesBuffAuraMode } from './passivePeriodicTrigger.ts';

/** R8f: 1 次元 ally range buff のフィールド帯（判定と同一 battleX / radius） */
export interface AllyRangePassiveBand {
  sourceId: string;
  passiveId: string;
  centerBattleX: number;
  radiusPx: number;
}

export function isAllyRangeBuffAuraPassive(passive: PassiveSkillDef): boolean {
  if (passive.effect !== 'buff') return false;
  if (!usesBuffAuraMode(passive)) return false;
  if ((passive.buffTargetShape ?? 'single') !== 'aoe') return false;
  const rule = passive.buffTargetRule;
  if (rule?.kind !== 'distance' || rule.side !== 'ally') return false;
  const radius = passive.buffAoeRadiusPx ?? 0;
  return radius > 0;
}

function isVisibleAllySource(ally: CombatantState): boolean {
  if (!ally.isAlive) return false;
  if (ally.isEnemy) return false;
  if (ally.partySlotIndex === undefined) return false;
  if (ally.corpseVisible === false) return false;
  return true;
}

export function resolveAllyRangePassiveBands(
  allies: readonly CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  getAcquiredOperationPassiveIds: (slotIndex: number) => readonly string[],
): AllyRangePassiveBand[] {
  const bands: AllyRangePassiveBand[] = [];

  for (const ally of allies) {
    if (!isVisibleAllySource(ally)) continue;

    const slotIndex = ally.partySlotIndex!;
    const acquiredIds = getAcquiredOperationPassiveIds(slotIndex);

    for (const passiveId of acquiredIds) {
      if (!isOperationPassiveCandidateForClass(ally.classId, passiveId)) continue;
      const passive = passives[passiveId];
      if (!passive || !isAllyRangeBuffAuraPassive(passive)) continue;

      bands.push({
        sourceId: ally.id,
        passiveId,
        centerBattleX: ally.battleX,
        radiusPx: passive.buffAoeRadiusPx!,
      });
    }
  }

  return bands;
}

export function resolveAllyRangePassiveBandInterval(
  band: Pick<AllyRangePassiveBand, 'centerBattleX' | 'radiusPx'>,
): { minBattleX: number; maxBattleX: number } {
  return {
    minBattleX: band.centerBattleX - band.radiusPx,
    maxBattleX: band.centerBattleX + band.radiusPx,
  };
}

export function isBattleXInsideAllyRangePassiveBand(
  battleX: number,
  band: Pick<AllyRangePassiveBand, 'centerBattleX' | 'radiusPx'>,
): boolean {
  const { minBattleX, maxBattleX } = resolveAllyRangePassiveBandInterval(band);
  return battleX >= minBattleX && battleX <= maxBattleX;
}
