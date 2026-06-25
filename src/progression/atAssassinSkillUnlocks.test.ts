import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from './partyCompose.ts';
import {
  getUnlockedActiveSlotCount,
  reconcileMemberBuildFromGameData,
} from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

describe('at_assassin passive / active unlock structure', () => {
  const gameData = loadGameData();
  const assassinClass = gameData.classRegistry['at_assassin'];
  const { passives, actives } = gameData.skillRegistry;

  it('defines named basic + passives + actives', () => {
    expect(actives['at_assassin_basic_attack']?.effect[0]?.hitCount).toBe(2);
    expect(passives['at_assassin_passive_3']?.name).toBe('刈り取り');
    expect(passives['at_assassin_passive_4']?.effect).toBe('bonusBasicAttackOnHit');
    expect(actives['at_assassin_active_3']?.name).toBe('閃影刃');
    expect(actives['at_assassin_active_4']?.name).toBe('百花繚乱');
  });

  it('unlocks Lv0=2 / Lv10=3 / Lv20=4 passives and actives via classes.json skills[]', () => {
    expect(assassinClass.passiveIds).toEqual([
      'at_assassin_passive_1',
      'at_assassin_passive_2',
      'at_assassin_passive_3',
      'at_assassin_passive_4',
    ]);

    const lv0 = resolveLearnedSkills(assassinClass, 1, gameData.skillRegistry);
    expect(lv0.learnedPassiveIds).toEqual([
      'at_assassin_passive_1',
      'at_assassin_passive_2',
    ]);
    expect(lv0.learnedActiveIds).toEqual([
      'at_assassin_active_1',
      'at_assassin_active_2',
    ]);

    const lv10 = resolveLearnedSkills(assassinClass, 10, gameData.skillRegistry);
    expect(lv10.learnedPassiveIds).toContain('at_assassin_passive_3');
    expect(lv10.learnedActiveIds).toEqual([
      'at_assassin_active_1',
      'at_assassin_active_2',
      'at_assassin_active_3',
    ]);

    const lv20 = resolveLearnedSkills(assassinClass, 20, gameData.skillRegistry);
    expect(lv20.learnedPassiveIds).toContain('at_assassin_passive_4');
    expect(lv20.learnedActiveIds).toEqual([
      'at_assassin_active_1',
      'at_assassin_active_2',
      'at_assassin_active_3',
      'at_assassin_active_4',
    ]);
  });

  it('aligns active slot count with learned actives at each level tier', () => {
    for (const [level, expectedSlots] of [
      [1, 2],
      [10, 3],
      [20, 4],
    ] as const) {
      const member = createMemberFromClass('at_assassin', gameData);
      member.progress.level = level;
      reconcileMemberBuildFromGameData(member, gameData);
      expect(getUnlockedActiveSlotCount(member, gameData)).toBe(expectedSlots);
      expect(member.build.learnedActiveIds).toHaveLength(expectedSlots);
    }
  });

  it('active_4 uses multiLock with extended range and low HP priority', () => {
    const damage = actives['at_assassin_active_4']!.effect[0];
    expect(damage?.type).toBe('damage');
    if (damage?.type !== 'damage') return;
    expect(damage.targetShape).toBe('multiLock');
    expect(damage.range).toBe(100);
    expect(damage.hitCount).toBe(3);
    expect(damage.target).toMatchObject({
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'ratio',
    });
    expect(actives['at_assassin_active_4']?.trigger).toEqual({
      kind: 'basicAttackCount',
      value: 16,
    });
  });
});
