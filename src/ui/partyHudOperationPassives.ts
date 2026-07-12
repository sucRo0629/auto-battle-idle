import type { PassiveSkillDef } from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';

export function resolveOperationAcquiredPassiveDisplayNames(
  passiveIds: readonly string[],
  passiveRegistry: Record<string, PassiveSkillDef>,
): readonly string[] {
  const names: string[] = [];
  for (const passiveId of passiveIds) {
    const name = passiveRegistry[passiveId]?.name?.trim();
    if (name) names.push(name);
  }
  return names;
}

export function buildAcquiredOperationPassiveNamesBySlot(
  getAcquiredIds: (slotIndex: number) => readonly string[],
  passiveRegistry: Record<string, PassiveSkillDef>,
): readonly (readonly string[])[] {
  return Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) =>
    resolveOperationAcquiredPassiveDisplayNames(
      getAcquiredIds(slotIndex),
      passiveRegistry,
    ),
  );
}

export function attachOperationPassiveNamesToPartyHudEntries(
  entries: (PartyHudEntry | null)[],
  namesByPartySlot: readonly (readonly string[])[],
): (PartyHudEntry | null)[] {
  return entries.map((entry) => {
    if (!entry) return null;
    const names = namesByPartySlot[entry.partySlotIndex] ?? [];
    return {
      ...entry,
      acquiredOperationPassiveNames: names.length > 0 ? names : [],
    };
  });
}
