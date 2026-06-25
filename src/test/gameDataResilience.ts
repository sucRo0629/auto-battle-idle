import type { ClassPreset, GameData } from '../battle/types.ts';
import {
  getUnlockedActiveSlotCount,
  reconcileMemberBuildFromGameData,
} from '../progression/skillBuild.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { resolveLearnedSkills } from '../progression/skillUnlocks.ts';
import { expect } from 'vitest';

/** Probe levels derived from classes.json skills[] (Lv0 → 1). */
export function unlockProbeLevels(classPreset: ClassPreset): number[] {
  const levels = new Set<number>([1]);
  for (const entry of classPreset.skills) {
    levels.add(entry.level <= 0 ? 1 : entry.level);
  }
  return [...levels].sort((a, b) => a - b);
}

export function expectPositive(value: number | undefined): void {
  expect(value).toBeDefined();
  expect(value!).toBeGreaterThan(0);
}

export function expectRatio(value: number | undefined): void {
  expect(value).toBeDefined();
  expect(value!).toBeGreaterThan(0);
  expect(value!).toBeLessThanOrEqual(1);
}

export function expectIntAtLeast(value: number | undefined, min: number): void {
  expect(value).toBeDefined();
  expect(Number.isInteger(value!)).toBe(true);
  expect(value!).toBeGreaterThanOrEqual(min);
}

export function expectUnlockTiersMatchGameData(
  classId: string,
  gameData: GameData,
): void {
  const classPreset = gameData.classRegistry[classId];
  for (const level of unlockProbeLevels(classPreset)) {
    const expected = resolveLearnedSkills(classPreset, level, gameData.skillRegistry);
    const member = createMemberFromClass(classId, gameData);
    member.progress.level = level;
    reconcileMemberBuildFromGameData(member, gameData);
    expect(member.build.learnedPassiveIds).toEqual(expected.learnedPassiveIds);
    expect(member.build.learnedActiveIds).toEqual(expected.learnedActiveIds);
    expect(getUnlockedActiveSlotCount(member, gameData)).toBe(
      expected.learnedActiveIds.length,
    );
  }
}
