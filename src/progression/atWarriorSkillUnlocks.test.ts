import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from './partyCompose.ts';
import {
  getUnlockedActiveSlotCount,
  reconcileMemberBuildFromGameData,
} from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

describe('at_warrior passive / active unlock structure', () => {
  const gameData = loadGameData();
  const warriorClass = gameData.classRegistry['at_warrior'];
  const { passives, actives } = gameData.skillRegistry;

  it('defines named basic + passives + actives', () => {
    expect(actives['at_warrior_basic_attack']?.name).toBe('斬撃');
    expect(passives['at_warrior_passive_3']?.name).toBe('穿甲の一撃');
    expect(passives['at_warrior_passive_4']?.effect).toBe('ignoredDefBonusDamage');
    expect(actives['at_warrior_active_3']?.name).toBe('突き通し');
    expect(actives['at_warrior_active_4']?.name).toBe('断鉄');
  });

  it('unlocks Lv0=2 / Lv10=3 / Lv20=4 passives and actives via classes.json skills[]', () => {
    expect(warriorClass.passiveIds).toEqual([
      'at_warrior_passive_1',
      'at_warrior_passive_2',
      'at_warrior_passive_3',
      'at_warrior_passive_4',
    ]);

    const lv0 = resolveLearnedSkills(warriorClass, 1, gameData.skillRegistry);
    expect(lv0.learnedPassiveIds).toEqual([
      'at_warrior_passive_1',
      'at_warrior_passive_2',
    ]);
    expect(lv0.learnedActiveIds).toEqual([
      'at_warrior_active_1',
      'at_warrior_active_2',
    ]);

    const lv10 = resolveLearnedSkills(warriorClass, 10, gameData.skillRegistry);
    expect(lv10.learnedPassiveIds).toContain('at_warrior_passive_3');
    expect(lv10.learnedActiveIds).toEqual([
      'at_warrior_active_1',
      'at_warrior_active_2',
      'at_warrior_active_3',
    ]);

    const lv20 = resolveLearnedSkills(warriorClass, 20, gameData.skillRegistry);
    expect(lv20.learnedPassiveIds).toContain('at_warrior_passive_4');
    expect(lv20.learnedActiveIds).toEqual([
      'at_warrior_active_1',
      'at_warrior_active_2',
      'at_warrior_active_3',
      'at_warrior_active_4',
    ]);
  });

  it('aligns active slot count with learned actives at each level tier', () => {
    for (const [level, expectedSlots] of [
      [1, 2],
      [10, 3],
      [20, 4],
    ] as const) {
      const member = createMemberFromClass('at_warrior', gameData);
      member.progress.level = level;
      reconcileMemberBuildFromGameData(member, gameData);
      expect(getUnlockedActiveSlotCount(member, gameData)).toBe(expectedSlots);
      expect(member.build.learnedActiveIds).toHaveLength(expectedSlots);
    }
  });

  it('active_4 sets all pierce flags for full mitigation bypass', () => {
    const damage = actives['at_warrior_active_4']!.effect[0];
    expect(damage?.type).toBe('damage');
    if (damage?.type !== 'damage') return;
    expect(damage.pierceBarrier).toBe(true);
    expect(damage.pierceWard).toBe(true);
    expect(damage.pierceBlock).toBe(true);
    expect(damage.ignoreDamageTakenReduction).toBe(true);
  });
});
