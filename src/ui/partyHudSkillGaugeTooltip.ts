import type { ActiveSkillDef } from '../battle/types.ts';
import type { PartyHudActiveCooldown } from './partyHudRecast.ts';

export function formatPartyHudSkillSlotTooltip(
  _slotIndex: number,
  cd: PartyHudActiveCooldown | undefined,
  skillDef: ActiveSkillDef | undefined,
  inactive: boolean,
): string | null {
  if (inactive || !cd?.skillId) return null;
  return skillDef?.displayName ?? cd.skillId;
}
