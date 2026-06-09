import { describe, expect, it } from 'vitest';
import type { GameData, PartyMemberState } from '../battle/types.ts';
import {
  getUnlockedActiveSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeActiveSlots,
} from './skillBuild.ts';

const member: PartyMemberState = {
  classId: 'test',
  progress: { level: 1, exp: 0 },
  build: {
    learnedPassiveIds: [],
    learnedActiveIds: [],
    equippedActiveSlots: ['skill_a'],
  },
};

const gameData = {
  classRegistry: {},
  skillRegistry: { passives: {}, actives: {} },
  enemyRegistry: {},
  stages: [],
  parties: {},
} as unknown as GameData;

describe('skillBuild', () => {
  it('unlocks both active slots from the start', () => {
    expect(getUnlockedActiveSlotCount(member, gameData)).toBe(MAX_ACTIVE_SLOTS);
    expect(MAX_ACTIVE_SLOTS).toBe(2);
  });

  it('normalizeActiveSlots pads to MAX_ACTIVE_SLOTS', () => {
    const normalized = normalizeActiveSlots(member.build);
    expect(normalized.equippedActiveSlots).toHaveLength(MAX_ACTIVE_SLOTS);
    expect(normalized.equippedActiveSlots[0]).toBe('skill_a');
    expect(normalized.equippedActiveSlots[1]).toBe('');
  });
});
