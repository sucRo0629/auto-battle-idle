import type {
  ClassId,
  GameData,
  PartyMemberState,
  PartySlotState,
  SaveGameState,
  SkillRegistry,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT, SAVE_VERSION } from '../battle/types.ts';
import {
  buildDefaultUnlockedClassIds,
  normalizePartySlots,
} from './partyCompose.ts';
import {
  addExp,
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from './levelGrowth.ts';
import {
  computeStageExpReward,
  getNextStageId,
  getStageById,
} from './stageProgression.ts';
import { reconcileMemberBuild } from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

export interface MemberLevelUpInfo {
  partyIndex: number;
  classId: string;
  displayName: string;
  oldLevel: number;
  newLevel: number;
  statDelta: { maxHp: number; atk: number; def: number };
  newSkillNames: string[];
}

function getNewSkillNames(
  oldLevel: number,
  newLevel: number,
  preset: GameData['classRegistry'][string],
  registry: SkillRegistry,
): string[] {
  const oldLearned = resolveLearnedSkills(preset, oldLevel, registry);
  const newLearned = resolveLearnedSkills(preset, newLevel, registry);
  const oldIds = new Set([
    ...oldLearned.learnedPassiveIds,
    ...oldLearned.learnedActiveIds,
  ]);
  const newIds = [
    ...newLearned.learnedPassiveIds,
    ...newLearned.learnedActiveIds,
  ].filter((id) => !oldIds.has(id));

  return newIds.map((id) => {
    const passive = registry.passives[id];
    if (passive) return passive.name;
    const active = registry.actives[id];
    if (active) return active.name;
    return id;
  });
}

export interface VictoryRewardResult {
  levelUps: MemberLevelUpInfo[];
  expGranted: number;
  nextStageId: string;
  newlyUnlockedClassIds: ClassId[];
}

export interface ApplyVictoryRewardsOptions {
  /** When false, rewards apply but currentStageId is unchanged (release / stage-select flow). */
  advanceCurrentStage?: boolean;
}

export function mergeUnlockedClassIds(
  unlockedClassIds: ClassId[] | undefined,
  toAdd: readonly ClassId[],
): ClassId[] {
  const ids = new Set(unlockedClassIds ?? []);
  for (const classId of toAdd) {
    ids.add(classId);
  }
  return [...ids];
}

export function mergeClearedStageId(
  stageProgress: SaveGameState['stageProgress'],
  stageId: string,
): void {
  const existing = stageProgress.clearedStageIds ?? [];
  if (existing.includes(stageId)) return;
  stageProgress.clearedStageIds = [...existing, stageId];
}

export function createDefaultSave(
  gameData: GameData,
  partyId = 'demo',
): SaveGameState {
  const party = gameData.parties[partyId];
  if (!party) {
    throw new Error(`Party not found: ${partyId}`);
  }
  const firstStageId = gameData.stages[0]?.id;
  if (!firstStageId) {
    throw new Error('No stages defined');
  }

  const slots: PartySlotState[] = Array.from({ length: PARTY_SLOT_COUNT }, () => null);
  party.members.forEach((member, index) => {
    if (index >= PARTY_SLOT_COUNT) return;
    const preset = gameData.classRegistry[member.classId];
    if (!preset) {
      throw new Error(`Class not found: ${member.classId}`);
    }
    const slotMember: PartyMemberState = {
      classId: member.classId,
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: structuredClone(member.build.equippedActiveSlots),
      },
    };
    reconcileMemberBuild(slotMember, preset, gameData.skillRegistry);
    slots[index] = slotMember;
  });

  const normalizedParty = normalizePartySlots(slots);

  return {
    version: SAVE_VERSION,
    stageProgress: {
      currentStageId: firstStageId,
      totalClears: 0,
      clearedStageIds: [],
    },
    party: normalizedParty,
    unlockedClassIds: buildDefaultUnlockedClassIds(normalizedParty, partyId),
  };
}

export function applyVictoryRewards(
  save: SaveGameState,
  gameData: GameData,
  curves: LevelCurvesConfig,
  survivingPartyIndices: number[],
  options?: ApplyVictoryRewardsOptions,
): VictoryRewardResult {
  const advanceCurrentStage = options?.advanceCurrentStage ?? true;
  const expGranted = computeStageExpReward(
    gameData,
    save.stageProgress.currentStageId,
  );
  const levelUps: MemberLevelUpInfo[] = [];

  for (const index of survivingPartyIndices) {
    const member = save.party[index];
    if (!member) continue;

    const preset = gameData.classRegistry[member.classId];
    if (!preset) continue;

    const oldLevel = member.progress.level;
    const oldStats = computeStatsAtLevel(
      preset,
      preset,
      oldLevel,
      curves,
    );

    const { newLevel, levelsGained } = addExp(member.progress, expGranted, curves);
    if (levelsGained <= 0) continue;

    const newStats = computeStatsAtLevel(
      preset,
      preset,
      newLevel,
      curves,
    );

    reconcileMemberBuild(member, preset, gameData.skillRegistry);

    levelUps.push({
      partyIndex: index,
      classId: member.classId,
      displayName: preset.displayName,
      oldLevel,
      newLevel,
      statDelta: {
        maxHp: newStats.maxHp - oldStats.maxHp,
        atk: newStats.atk - oldStats.atk,
        def: newStats.def - oldStats.def,
      },
      newSkillNames: getNewSkillNames(
        oldLevel,
        newLevel,
        preset,
        gameData.skillRegistry,
      ),
    });
  }

  const clearedStageId = save.stageProgress.currentStageId;
  const clearedStage = getStageById(gameData.stages, clearedStageId);
  const unlockIds = clearedStage?.unlockClassIdsOnClear ?? [];
  const previousUnlocked = save.unlockedClassIds ?? [];
  const newlyUnlockedClassIds = unlockIds.filter(
    (classId) => !previousUnlocked.includes(classId),
  );
  save.unlockedClassIds = mergeUnlockedClassIds(previousUnlocked, unlockIds);

  const nextStageId = getNextStageId(gameData.stages, clearedStageId);
  if (advanceCurrentStage) {
    save.stageProgress.currentStageId = nextStageId;
  } else {
    mergeClearedStageId(save.stageProgress, clearedStageId);
  }
  save.stageProgress.totalClears += 1;

  return { levelUps, expGranted, nextStageId, newlyUnlockedClassIds };
}

export function formatLevelUpLog(info: MemberLevelUpInfo): string {
  const { statDelta } = info;
  const parts: string[] = [];
  if (statDelta.maxHp > 0) parts.push(`+${statDelta.maxHp} HP`);
  if (statDelta.atk > 0) parts.push(`+${statDelta.atk} ATK`);
  if (statDelta.def > 0) parts.push(`+${statDelta.def} DEF`);
  const bonus = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  const learned =
    info.newSkillNames.length > 0
      ? ` Learned: ${info.newSkillNames.join(', ')}`
      : '';
  return `${info.displayName} reached Lv ${info.newLevel}!${bonus}${learned}`;
}

export function formatExpGrantLog(
  displayName: string,
  exp: number,
): string {
  return `${displayName} +${exp} EXP`;
}
