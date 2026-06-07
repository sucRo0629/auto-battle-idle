import type { GameData, SaveGameState } from '../battle/types.ts';
import {
  addExp,
  computeStatsAtLevel,
  type LevelCurvesConfig,
} from './levelGrowth.ts';
import { computeStageExpReward, getNextStageId } from './stageProgression.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

export interface MemberLevelUpInfo {
  partyIndex: number;
  classId: string;
  displayName: string;
  oldLevel: number;
  newLevel: number;
  statDelta: { maxHp: number; atk: number; def: number };
}

export interface VictoryRewardResult {
  levelUps: MemberLevelUpInfo[];
  expGranted: number;
  nextStageId: string;
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

  return {
    version: 1,
    stageProgress: {
      currentStageId: firstStageId,
      totalClears: 0,
    },
    party: party.members.map((member) => {
      const preset = gameData.classRegistry[member.classId];
      if (!preset) {
        throw new Error(`Class not found: ${member.classId}`);
      }
      const learned = resolveLearnedSkills(
        preset,
        1,
        gameData.skillRegistry,
      );
      return {
        classId: member.classId,
        progress: { level: 1, exp: 0 },
        build: {
          learnedPassiveIds: learned.learnedPassiveIds,
          learnedActiveIds: learned.learnedActiveIds,
          equippedActiveSlots: structuredClone(member.build.equippedActiveSlots),
        },
      };
    }),
  };
}

export function applyVictoryRewards(
  save: SaveGameState,
  gameData: GameData,
  curves: LevelCurvesConfig,
  survivingPartyIndices: number[],
): VictoryRewardResult {
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
      member.classId,
      oldLevel,
      curves,
    );

    const { newLevel, levelsGained } = addExp(member.progress, expGranted, curves);
    if (levelsGained <= 0) continue;

    const newStats = computeStatsAtLevel(
      preset,
      member.classId,
      newLevel,
      curves,
    );

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
    });
  }

  const nextStageId = getNextStageId(
    gameData.stages,
    save.stageProgress.currentStageId,
  );
  save.stageProgress.currentStageId = nextStageId;
  save.stageProgress.totalClears += 1;

  return { levelUps, expGranted, nextStageId };
}

export function formatLevelUpLog(info: MemberLevelUpInfo): string {
  const { statDelta } = info;
  const parts: string[] = [];
  if (statDelta.maxHp > 0) parts.push(`+${statDelta.maxHp} HP`);
  if (statDelta.atk > 0) parts.push(`+${statDelta.atk} ATK`);
  if (statDelta.def > 0) parts.push(`+${statDelta.def} DEF`);
  const bonus = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `${info.displayName} reached Lv ${info.newLevel}!${bonus}`;
}

export function formatExpGrantLog(
  displayName: string,
  exp: number,
): string {
  return `${displayName} +${exp} EXP`;
}
