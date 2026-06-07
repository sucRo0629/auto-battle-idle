import type { SaveGameState } from '../battle/types.ts';

export const SAVE_STORAGE_KEY = 'auto-battle-idle:save';
const CURRENT_SAVE_VERSION = 1;

export class SaveManager {
  load(): SaveGameState | null {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return parseSaveGameState(parsed);
    } catch (error) {
      console.warn('[save] Failed to load save, starting fresh:', error);
      return null;
    }
  }

  save(state: SaveGameState): void {
    try {
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
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
  if (version !== CURRENT_SAVE_VERSION) {
    throw new Error(`Unsupported save version: ${String(version)}`);
  }

  const stageProgressRaw = obj.stageProgress;
  if (typeof stageProgressRaw !== 'object' || stageProgressRaw === null) {
    throw new Error('Missing stageProgress');
  }
  const stageProgressObj = stageProgressRaw as Record<string, unknown>;
  const currentStageId = stageProgressObj.currentStageId;
  const totalClears = stageProgressObj.totalClears;
  if (typeof currentStageId !== 'string' || currentStageId.length === 0) {
    throw new Error('Invalid stageProgress.currentStageId');
  }
  if (typeof totalClears !== 'number' || totalClears < 0) {
    throw new Error('Invalid stageProgress.totalClears');
  }

  const partyRaw = obj.party;
  if (!Array.isArray(partyRaw) || partyRaw.length === 0) {
    throw new Error('Invalid party');
  }

  const party = partyRaw.map((memberRaw, index) => {
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
  });

  return {
    version: CURRENT_SAVE_VERSION,
    stageProgress: { currentStageId, totalClears },
    party,
  };
}
