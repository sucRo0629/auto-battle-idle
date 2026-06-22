import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from './partyCompose.ts';
import {
  getUnlockedActiveSlotCount,
  reconcileMemberBuildFromGameData,
} from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

describe('sp_alchemist passive / active unlock structure', () => {
  const gameData = loadGameData();
  const alchemistClass = gameData.classRegistry['sp_alchemist'];
  const { passives, actives } = gameData.skillRegistry;

  it('defines basic + four passives + four actives with id-matched names', () => {
    expect(actives['sp_alchemist_basic_attack']?.name).toBe('sp_alchemist_basic_attack');
    expect(actives['sp_alchemist_active_1']?.name).toBe('sp_alchemist_active_1');
    expect(actives['sp_alchemist_active_2']?.name).toBe('sp_alchemist_active_2');
    expect(actives['sp_alchemist_active_3']?.name).toBe('sp_alchemist_active_3');
    expect(actives['sp_alchemist_active_4']?.name).toBe('sp_alchemist_active_4');

    for (let i = 1; i <= 4; i += 1) {
      const id = `sp_alchemist_passive_${i}`;
      expect(passives[id]?.name).toBe(id);
    }
  });

  it('keeps active_1 as area HoT plus enemy atk debuff', () => {
    const active1 = actives['sp_alchemist_active_1']!;
    const hot = active1.effect.find((e) => e.type === 'heal' && e.healSubKind === 'hot');
    const debuff = active1.effect.find((e) => e.type === 'debuff' && e.debuffStat === 'atk');
    expect(hot?.targetShape).toBe('aoe');
    expect(debuff?.targetShape).toBe('aoe');
    expect(debuff?.debuffMultiplier).toBeLessThan(1);
  });

  it('defines active_2 as front-band sustain with HoT and def buff', () => {
    const active2 = actives['sp_alchemist_active_2']!;
    expect(active2.effect.some((e) => e.type === 'heal' && e.healSubKind === 'hot')).toBe(true);
    expect(
      active2.effect.some(
        (e) => e.type === 'buff' && e.buffSubKind === 'stat' && e.buffStat === 'def',
      ),
    ).toBe(true);
    expect(active2.effect.every((e) => e.target?.order === 'selfOrigin')).toBe(true);
  });

  it('defines active_3 as sustain rhythm with hot and modest ally atk buff', () => {
    const active3 = actives['sp_alchemist_active_3']!;
    expect(active3.effect.some((e) => e.type === 'heal' && e.healSubKind === 'hot')).toBe(true);
    const atkBuff = active3.effect.find(
      (e) => e.type === 'buff' && e.buffStat === 'atk',
    );
    expect(atkBuff).toBeDefined();
    expect(atkBuff!.buffMultiplier).toBeLessThanOrEqual(1.1);
  });

  it('defines active_4 as upper sustain with party hot, enemy debuff, and ally atk buff', () => {
    const active4 = actives['sp_alchemist_active_4']!;
    expect(
      active4.effect.some(
        (e) => e.type === 'heal' && e.healSubKind === 'hot' && e.target?.kind === 'all',
      ),
    ).toBe(true);
    expect(
      active4.effect.some((e) => e.type === 'debuff' && e.debuffStat === 'atk'),
    ).toBe(true);
    expect(active4.effect.some((e) => e.type === 'buff' && e.buffStat === 'atk')).toBe(true);
  });

  it('unlocks Lv0=2 / Lv10=3 / Lv20=4 actives via classes.json skills[]', () => {
    expect(alchemistClass.passiveIds).toEqual([
      'sp_alchemist_passive_1',
      'sp_alchemist_passive_2',
      'sp_alchemist_passive_3',
      'sp_alchemist_passive_4',
    ]);

    const lv0 = resolveLearnedSkills(alchemistClass, 1, gameData.skillRegistry);
    expect(lv0.learnedPassiveIds).toEqual([
      'sp_alchemist_passive_1',
      'sp_alchemist_passive_2',
    ]);
    expect(lv0.learnedActiveIds).toEqual([
      'sp_alchemist_active_1',
      'sp_alchemist_active_2',
    ]);

    const lv10 = resolveLearnedSkills(alchemistClass, 10, gameData.skillRegistry);
    expect(lv10.learnedPassiveIds).toContain('sp_alchemist_passive_3');
    expect(lv10.learnedActiveIds).toEqual([
      'sp_alchemist_active_1',
      'sp_alchemist_active_2',
      'sp_alchemist_active_3',
    ]);

    const lv20 = resolveLearnedSkills(alchemistClass, 20, gameData.skillRegistry);
    expect(lv20.learnedPassiveIds).toContain('sp_alchemist_passive_4');
    expect(lv20.learnedActiveIds).toEqual([
      'sp_alchemist_active_1',
      'sp_alchemist_active_2',
      'sp_alchemist_active_3',
      'sp_alchemist_active_4',
    ]);
  });

  it('aligns active slot count with learned actives at each level tier', () => {
    for (const [level, expectedSlots] of [
      [1, 2],
      [10, 3],
      [20, 4],
    ] as const) {
      const member = createMemberFromClass('sp_alchemist', gameData);
      member.progress.level = level;
      reconcileMemberBuildFromGameData(member, gameData);
      expect(getUnlockedActiveSlotCount(member, gameData)).toBe(expectedSlots);
      expect(member.build.learnedActiveIds).toHaveLength(expectedSlots);
    }
  });
});
