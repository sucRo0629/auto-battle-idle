import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { createMemberFromClass } from './partyCompose.ts';
import { reconcileMemberBuildFromGameData } from './skillBuild.ts';
import { getUnlockedActiveSlotCount } from './skillBuild.ts';
import { resolveLearnedSkills } from './skillUnlocks.ts';

describe('sp_cleric passive / active unlock structure', () => {
  const gameData = loadGameData();
  const clericClass = gameData.classRegistry['sp_cleric'];
  const { passives, actives } = gameData.skillRegistry;

  it('defines basic + four passives + four actives with id-matched names', () => {
    expect(actives['sp_cleric_basic_attack']?.name).toBe('sp_cleric_basic_attack');
    expect(actives['sp_cleric_active_1']?.name).toBe('sp_cleric_active_1');
    expect(actives['sp_cleric_active_2']?.name).toBe('sp_cleric_active_2');
    expect(actives['sp_cleric_active_3']?.name).toBe('sp_cleric_active_3');
    expect(actives['sp_cleric_active_4']?.name).toBe('sp_cleric_active_4');

    for (let i = 1; i <= 4; i += 1) {
      const id = `sp_cleric_passive_${i}`;
      expect(passives[id]?.name).toBe(id);
    }
  });

  it('redefines active_2 as low HP smart heal and moves area heal to active_3', () => {
    const active2 = actives['sp_cleric_active_2']!;
    expect(active2.firePolicy).toBe('smart');
    expect(active2.fireConditions?.[0]).toMatchObject({
      kind: 'targetHp',
      maxHpRatio: 0.4,
    });
    expect(active2.effect.some((e) => e.type === 'heal' && e.target?.kind === 'all')).toBe(
      false,
    );

    const active3 = actives['sp_cleric_active_3']!;
    expect(active3.effect.some((e) => e.type === 'heal' && e.target?.kind === 'all')).toBe(
      true,
    );
  });

  it('unlocks Lv0=2 / Lv10=3 / Lv20=4 actives via classes.json skills[]', () => {
    expect(clericClass.passiveIds).toEqual([
      'sp_cleric_passive_1',
      'sp_cleric_passive_2',
      'sp_cleric_passive_3',
      'sp_cleric_passive_4',
    ]);

    const lv0 = resolveLearnedSkills(clericClass, 1, gameData.skillRegistry);
    expect(lv0.learnedPassiveIds).toEqual([
      'sp_cleric_passive_1',
      'sp_cleric_passive_2',
    ]);
    expect(lv0.learnedActiveIds).toEqual([
      'sp_cleric_active_1',
      'sp_cleric_active_2',
    ]);

    const lv10 = resolveLearnedSkills(clericClass, 10, gameData.skillRegistry);
    expect(lv10.learnedPassiveIds).toContain('sp_cleric_passive_3');
    expect(lv10.learnedActiveIds).toEqual([
      'sp_cleric_active_1',
      'sp_cleric_active_2',
      'sp_cleric_active_3',
    ]);

    const lv20 = resolveLearnedSkills(clericClass, 20, gameData.skillRegistry);
    expect(lv20.learnedPassiveIds).toContain('sp_cleric_passive_4');
    expect(lv20.learnedActiveIds).toEqual([
      'sp_cleric_active_1',
      'sp_cleric_active_2',
      'sp_cleric_active_3',
      'sp_cleric_active_4',
    ]);
  });

  it('aligns active slot count with learned actives at each level tier', () => {
    for (const [level, expectedSlots] of [
      [1, 2],
      [10, 3],
      [20, 4],
    ] as const) {
      const member = createMemberFromClass('sp_cleric', gameData);
      member.progress.level = level;
      reconcileMemberBuildFromGameData(member, gameData);
      expect(getUnlockedActiveSlotCount(member, gameData)).toBe(expectedSlots);
      expect(member.build.learnedActiveIds).toHaveLength(expectedSlots);
    }
  });
});
