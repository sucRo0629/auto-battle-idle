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

  it('defines named basic + passives + actives', () => {
    expect(actives['sp_alchemist_basic_attack']?.name).toBe('薬手当て');
    expect(actives['sp_alchemist_active_1']?.name).toBe('薬粉撒き');
    expect(actives['sp_alchemist_active_2']?.name).toBe('薬香の霧');
    expect(actives['sp_alchemist_active_3']?.name).toBe('滋養強壮薬');
    expect(actives['sp_alchemist_active_4']?.name).toBe('薬効顕現');
    expect(passives['sp_alchemist_passive_1']?.name).toBe('薬効の香り');
    expect(passives['sp_alchemist_passive_4']?.name).toBe('薬草の極意');
  });

  it('uses herbalPotency on passive_1 and passive_4', () => {
    expect(passives['sp_alchemist_passive_1']?.effect).toBe('herbalPotency');
    expect(passives['sp_alchemist_passive_4']?.effect).toBe('herbalPotency');
    expect(passives['sp_alchemist_passive_1']?.herbalPotencyMaxStacks).toBe(6);
    expect(passives['sp_alchemist_passive_4']?.herbalPotencyMaxStacks).toBe(9);
  });

  it('defines active_1 as melee HoT with stackOnApply only', () => {
    const active1 = actives['sp_alchemist_active_1']!;
    const hot = active1.effect.find((e) => e.type === 'heal' && e.healSubKind === 'hot');
    expect(hot?.targetShape).toBe('aoe');
    expect(hot?.stackOnApply).toBe(1);
    expect(active1.effect.some((e) => e.type === 'debuff')).toBe(false);
  });

  it('defines active_2 and active_3 as party HoT sustain', () => {
    const active2 = actives['sp_alchemist_active_2']!;
    const active3 = actives['sp_alchemist_active_3']!;
    expect(
      active2.effect.some(
        (e) => e.type === 'heal' && e.healSubKind === 'hot' && e.target?.kind === 'all',
      ),
    ).toBe(true);
    expect(
      active3.effect.some((e) => e.type === 'heal' && e.healSubKind === 'hot'),
    ).toBe(true);
    expect(active3.effect.some((e) => e.type === 'buff' && e.buffStat === 'hp')).toBe(
      true,
    );
  });

  it('defines active_4 as potency consume plus conditional branch', () => {
    const active4 = actives['sp_alchemist_active_4']!;
    expect(active4.effect[0]?.type).toBe('herbalPotencyConsume');
    const branch = active4.effect[1];
    expect(branch?.type).toBe('conditionalEffect');
    if (branch?.type !== 'conditionalEffect') return;
    const thenHot = branch.thenEffects.find(
      (e) => e.type === 'heal' && e.healSubKind === 'hot',
    );
    expect(thenHot?.potencyStackScale).toBe(true);
    expect(thenHot?.buffDisplayName).toBe('濃縮薬効');
    expect(active4.effect.every((e) => e.type !== 'debuff')).toBe(true);
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
