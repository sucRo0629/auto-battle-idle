import { describe, expect, it } from 'vitest';
import type {
  ClassPreset,
  GameData,
  PartyMemberState,
  SkillRegistry,
} from '../battle/types.ts';
import {
  equipStarterActiveSkills,
  getUnlockedActiveSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeActiveSlots,
  reconcileMemberBuild,
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

  it('equipStarterActiveSkills fills empty slots with level-0 actives', () => {
    const classPreset = {
      starterActiveIds: ['active_1', 'active_2'],
    } as ClassPreset;
    const build = normalizeActiveSlots({
      learnedPassiveIds: [],
      learnedActiveIds: ['active_1', 'active_2'],
      equippedActiveSlots: [],
    });

    equipStarterActiveSkills(build, classPreset, build.learnedActiveIds);

    expect(build.equippedActiveSlots).toEqual(['active_1', 'active_2']);
  });

  it('reconcileMemberBuild equips both starter actives from empty slots', () => {
    const registry: SkillRegistry = {
      passives: {
        passive_a: {
          id: 'passive_a',
          name: 'Passive',
          effect: 'targetRuleOverride',
          targetRuleOverride: {
            kind: 'stat',
            side: 'enemy',
            stat: 'hp',
            order: 'highest',
          },
        },
      },
      actives: {
        active_1: { id: 'active_1', name: 'Active 1', effect: [] },
        active_2: { id: 'active_2', name: 'Active 2', effect: [] },
      },
    };
    const classPreset = {
      passiveIds: ['passive_a'],
      starterPassiveIds: ['passive_a'],
      starterActiveIds: ['active_1', 'active_2'],
      skills: [{ level: 0, skillIds: ['active_1', 'active_2'] }],
    } as ClassPreset;
    const slotMember: PartyMemberState = {
      classId: 'test',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    };

    reconcileMemberBuild(slotMember, classPreset, registry);

    expect(slotMember.build.learnedActiveIds).toEqual(['active_1', 'active_2']);
    expect(slotMember.build.equippedActiveSlots).toEqual(['active_1', 'active_2']);
  });
});
