import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from './partyCompose.ts';
import {
  getUnlockedActiveSlotCount,
  reconcileMemberBuildFromGameData,
} from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

describe('sp_abjurer passive / active unlock structure', () => {
  const gameData = loadGameData();
  const abjurerClass = gameData.classRegistry['sp_abjurer'];
  const { passives, actives } = gameData.skillRegistry;

  it('defines basic + four passives + four actives with id-matched names', () => {
    expect(actives['sp_abjurer_basic_attack']?.name).toBe('sp_abjurer_basic_attack');
    expect(actives['sp_abjurer_active_1']?.name).toBe('sp_abjurer_active_1');
    expect(actives['sp_abjurer_active_2']?.name).toBe('sp_abjurer_active_2');
    expect(actives['sp_abjurer_active_3']?.name).toBe('sp_abjurer_active_3');
    expect(actives['sp_abjurer_active_4']?.name).toBe('sp_abjurer_active_4');

    for (let i = 1; i <= 4; i += 1) {
      const id = `sp_abjurer_passive_${i}`;
      expect(passives[id]?.name).toBe(id);
    }
  });

  it('keeps Stability-focused active roles (barrier-first, heal as support)', () => {
    const active1 = actives['sp_abjurer_active_1']!;
    expect(active1.effect.some((e) => e.type === 'heal')).toBe(true);
    expect(
      active1.effect.some((e) => e.type === 'buff' && e.buffSubKind === 'barrier'),
    ).toBe(true);

    const active2 = actives['sp_abjurer_active_2']!;
    expect(active2.effect).toHaveLength(1);
    expect(active2.effect[0]).toMatchObject({
      type: 'buff',
      buffSubKind: 'barrier',
      targetShape: 'multiLock',
      hitCount: 2,
    });

    const active3 = actives['sp_abjurer_active_3']!;
    expect(
      active3.effect.some(
        (e) =>
          e.type === 'buff' &&
          e.buffSubKind === 'barrier' &&
          e.target?.kind === 'all',
      ),
    ).toBe(true);

    const active4 = actives['sp_abjurer_active_4']!;
    expect(
      active4.effect.some(
        (e) =>
          e.type === 'buff' &&
          e.buffSubKind === 'stat' &&
          e.buffStat === 'damageTaken' &&
          e.target?.kind === 'all',
      ),
    ).toBe(true);
    expect(
      active4.effect.some(
        (e) =>
          e.type === 'buff' &&
          e.buffSubKind === 'barrier' &&
          e.target?.kind === 'all',
      ),
    ).toBe(true);
  });

  it('unlocks Lv0=2 / Lv10=3 / Lv20=4 actives via classes.json skills[]', () => {
    expect(abjurerClass.passiveIds).toEqual([
      'sp_abjurer_passive_1',
      'sp_abjurer_passive_2',
      'sp_abjurer_passive_3',
      'sp_abjurer_passive_4',
    ]);

    const lv0 = resolveLearnedSkills(abjurerClass, 1, gameData.skillRegistry);
    expect(lv0.learnedPassiveIds).toEqual([
      'sp_abjurer_passive_1',
      'sp_abjurer_passive_2',
    ]);
    expect(lv0.learnedActiveIds).toEqual([
      'sp_abjurer_active_1',
      'sp_abjurer_active_2',
    ]);

    const lv10 = resolveLearnedSkills(abjurerClass, 10, gameData.skillRegistry);
    expect(lv10.learnedPassiveIds).toContain('sp_abjurer_passive_3');
    expect(lv10.learnedActiveIds).toEqual([
      'sp_abjurer_active_1',
      'sp_abjurer_active_2',
      'sp_abjurer_active_3',
    ]);

    const lv20 = resolveLearnedSkills(abjurerClass, 20, gameData.skillRegistry);
    expect(lv20.learnedPassiveIds).toContain('sp_abjurer_passive_4');
    expect(lv20.learnedActiveIds).toEqual([
      'sp_abjurer_active_1',
      'sp_abjurer_active_2',
      'sp_abjurer_active_3',
      'sp_abjurer_active_4',
    ]);
  });

  it('aligns active slot count with learned actives at each level tier', () => {
    for (const [level, expectedSlots] of [
      [1, 2],
      [10, 3],
      [20, 4],
    ] as const) {
      const member = createMemberFromClass('sp_abjurer', gameData);
      member.progress.level = level;
      reconcileMemberBuildFromGameData(member, gameData);
      expect(getUnlockedActiveSlotCount(member, gameData)).toBe(expectedSlots);
      expect(member.build.learnedActiveIds).toHaveLength(expectedSlots);
    }
  });
});
