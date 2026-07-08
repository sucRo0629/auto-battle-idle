import type {
  PartyMemberState,
  PartySlotState,
  SaveGameState,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT, SAVE_VERSION } from '../battle/types.ts';
import {
  mergeMigrationUnlockedClassIds,
  normalizePartySlots,
} from '../progression/partyCompose.ts';
import { projectStorageKey } from '../projectIdentity.ts';
import { migrateSaveClassIds } from './saveClassMigration.ts';

export const SAVE_STORAGE_KEY = projectStorageKey('save');

export class SaveManager {
  load(storageKey = SAVE_STORAGE_KEY): SaveGameState | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return parseSaveGameState(parsed);
    } catch (error) {
      console.warn('[save] Failed to load save, starting fresh:', error);
      return null;
    }
  }

  save(state: SaveGameState, storageKey = SAVE_STORAGE_KEY): void {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[save] Failed to persist save:', error);
    }
  }
}

function parseSaveGameState(raw: unknown): SaveGameState {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Save must be an object');
  }
  const obj = raw as Record<string, unknown>;

  const version = obj.version;
  if (version === 1) {
    return migrateSaveV1(obj);
  }
  if (version !== SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${String(version)}`);
  }

  const stageProgress = parseStageProgress(obj.stageProgress);
  const party = parsePartySlots(obj.party, true);
  const unlockedClassIds = parseUnlockedClassIds(obj.unlockedClassIds);

  return migrateSaveClassIds({
    version: SAVE_VERSION,
    stageProgress,
    party,
    unlockedClassIds,
  });
}

function migrateSaveV1(obj: Record<string, unknown>): SaveGameState {
  const stageProgress = parseStageProgress(obj.stageProgress);
  const legacyParty = parseLegacyPartyMembers(obj.party);
  const slots: PartySlotState[] = Array.from({ length: PARTY_SLOT_COUNT }, () => null);
  legacyParty.forEach((member, index) => {
    if (index < PARTY_SLOT_COUNT) {
      slots[index] = member;
    }
  });
  const party = normalizePartySlots(slots);

  return migrateSaveClassIds({
    version: SAVE_VERSION,
    stageProgress,
    party,
    unlockedClassIds: mergeMigrationUnlockedClassIds(party),
  });
}

function parseStageProgress(raw: unknown): SaveGameState['stageProgress'] {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Missing stageProgress');
  }
  const stageProgressObj = raw as Record<string, unknown>;
  const currentStageId = stageProgressObj.currentStageId;
  const totalClears = stageProgressObj.totalClears;
  if (typeof currentStageId !== 'string' || currentStageId.length === 0) {
    throw new Error('Invalid stageProgress.currentStageId');
  }
  if (typeof totalClears !== 'number' || totalClears < 0) {
    throw new Error('Invalid stageProgress.totalClears');
  }
  const clearedStageIds = parseOptionalStringArray(
    stageProgressObj.clearedStageIds,
    'stageProgress.clearedStageIds',
  );
  return clearedStageIds.length > 0
    ? { currentStageId, totalClears, clearedStageIds }
    : { currentStageId, totalClears };
}

function parseOptionalStringArray(raw: unknown, label: string): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`Invalid ${label}`);
  }
  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`Invalid ${label} entry`);
    }
    if (!ids.includes(entry)) {
      ids.push(entry);
    }
  }
  return ids;
}

function parseLegacyPartyMembers(raw: unknown): PartyMemberState[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Invalid party');
  }
  return raw.map((memberRaw, index) => parsePartyMember(memberRaw, index));
}

function parsePartySlots(raw: unknown, requireFullLength: boolean): PartySlotState[] {
  if (!Array.isArray(raw)) {
    throw new Error('Invalid party');
  }
  if (requireFullLength && raw.length !== PARTY_SLOT_COUNT) {
    throw new Error(`Party must have ${PARTY_SLOT_COUNT} slots`);
  }

  const party: PartySlotState[] = [];
  for (let index = 0; index < PARTY_SLOT_COUNT; index++) {
    const memberRaw = raw[index];
    if (memberRaw === null || memberRaw === undefined) {
      party.push(null);
      continue;
    }
    party.push(parsePartyMember(memberRaw, index));
  }
  return party;
}

function parsePartyMember(memberRaw: unknown, index: number): PartyMemberState {
  if (typeof memberRaw !== 'object' || memberRaw === null) {
    throw new Error(`Invalid party member at index ${index}`);
  }
  const member = memberRaw as Record<string, unknown>;
  const classId = member.classId;
  if (typeof classId !== 'string' || classId.length === 0) {
    throw new Error(`Invalid classId at party[${index}]`);
  }

  const progressRaw = member.progress;
  if (typeof progressRaw !== 'object' || progressRaw === null) {
    throw new Error(`Invalid progress at party[${index}]`);
  }
  const progressObj = progressRaw as Record<string, unknown>;
  const level = progressObj.level;
  const exp = progressObj.exp;
  if (typeof level !== 'number' || level < 1) {
    throw new Error(`Invalid level at party[${index}]`);
  }
  if (typeof exp !== 'number' || exp < 0) {
    throw new Error(`Invalid exp at party[${index}]`);
  }

  const buildRaw = member.build;
  if (typeof buildRaw !== 'object' || buildRaw === null) {
    throw new Error(`Invalid build at party[${index}]`);
  }
  const buildObj = buildRaw as Record<string, unknown>;
  const learnedPassiveIds = buildObj.learnedPassiveIds;
  const learnedActiveIds = buildObj.learnedActiveIds;
  const equippedActiveSlots = buildObj.equippedActiveSlots;
  if (!Array.isArray(learnedPassiveIds) || !Array.isArray(learnedActiveIds)) {
    throw new Error(`Invalid build lists at party[${index}]`);
  }
  if (!Array.isArray(equippedActiveSlots)) {
    throw new Error(`Invalid equippedActiveSlots at party[${index}]`);
  }

  return {
    classId,
    progress: { level, exp },
    build: {
      learnedPassiveIds: learnedPassiveIds as string[],
      learnedActiveIds: learnedActiveIds as string[],
      equippedActiveSlots: equippedActiveSlots as string[],
    },
  };
}

function parseUnlockedClassIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Invalid unlockedClassIds');
  }
  for (const classId of raw) {
    if (typeof classId !== 'string' || classId.length === 0) {
      throw new Error('Invalid unlockedClassIds entry');
    }
  }
  return raw as string[];
}
