import { describe, expect, it } from 'vitest';
import type {
  ClassPreset,
  GameData,
  PartyMemberState,
  SkillRegistry,
} from '../battle/types.ts';
import {
  getUnlockedActiveSlotCount,
  MAX_ACTIVE_SLOTS,
  normalizeActiveSlots,
  reconcileMemberBuild,
} from './skillBuild.ts';
import { resolveBattleActiveSkillIds } from './battleActiveSkills.ts';

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
  classOrder: [],
  classRegistry: {},
  skillRegistry: { passives: {}, actives: {} },
  enemyRegistry: {},
  stages: [],
  parties: {},
} as unknown as GameData;

const starterRegistry: SkillRegistry = {
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

const starterClassPreset = {
  passiveIds: ['passive_a'],
  starterPassiveIds: ['passive_a'],
  starterActiveIds: ['active_1', 'active_2'],
  skills: [{ level: 0, skillIds: ['active_1', 'active_2'] }],
} as ClassPreset;

describe('skillBuild', () => {
  it('unlocks two active slots at level 1', () => {
    expect(getUnlockedActiveSlotCount(member, gameData)).toBe(2);
    expect(MAX_ACTIVE_SLOTS).toBe(4);
  });

  it('unlocks active slots at levels 0, 10, and 20', () => {
    expect(
      getUnlockedActiveSlotCount(
        { ...member, progress: { level: 9, exp: 0 } },
        gameData,
      ),
    ).toBe(2);
    expect(
      getUnlockedActiveSlotCount(
        { ...member, progress: { level: 10, exp: 0 } },
        gameData,
      ),
    ).toBe(3);
    expect(
      getUnlockedActiveSlotCount(
        { ...member, progress: { level: 20, exp: 0 } },
        gameData,
      ),
    ).toBe(4);
  });

  it('normalizeActiveSlots pads to MAX_ACTIVE_SLOTS', () => {
    const normalized = normalizeActiveSlots(member.build);
    expect(normalized.equippedActiveSlots).toHaveLength(MAX_ACTIVE_SLOTS);
    expect(normalized.equippedActiveSlots[0]).toBe('skill_a');
    expect(normalized.equippedActiveSlots[1]).toBe('');
  });

  it('uses learnedActiveIds, not equippedActiveSlots, for battle participation', () => {
    const build = {
      learnedPassiveIds: [],
      learnedActiveIds: ['learned_1', 'learned_2', 'learned_3', 'learned_4'],
      equippedActiveSlots: ['equipped_1', 'equipped_2', '', ''],
    };

    expect(resolveBattleActiveSkillIds(build, 3)).toEqual([
      'learned_1',
      'learned_2',
      'learned_3',
    ]);
  });

  it('reconcileMemberBuild learns passives and actives without auto-equipping slots', () => {
    const slotMember: PartyMemberState = {
      classId: 'test',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    };

    reconcileMemberBuild(slotMember, starterClassPreset, starterRegistry);

    expect(slotMember.build.learnedPassiveIds).toContain('passive_a');
    expect(slotMember.build.learnedActiveIds).toEqual(['active_1', 'active_2']);
    expect(slotMember.build.equippedActiveSlots).toEqual(['', '', '', '']);
  });

  it('reconcileMemberBuild strips equipped actives above current level', () => {
    const levelGatedPreset = {
      ...starterClassPreset,
      skills: [
        { level: 0, skillIds: ['active_1'] },
        { level: 5, skillIds: ['active_2'] },
      ],
    } as ClassPreset;
    const slotMember: PartyMemberState = {
      classId: 'test',
      progress: { level: 1, exp: 0 },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: ['active_1', 'active_2'],
      },
    };

    reconcileMemberBuild(slotMember, levelGatedPreset, starterRegistry);

    expect(slotMember.build.learnedActiveIds).toEqual(['active_1']);
    expect(slotMember.build.equippedActiveSlots[0]).toBe('active_1');
    expect(slotMember.build.equippedActiveSlots[1]).toBe('');
  });
});
