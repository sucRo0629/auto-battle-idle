import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import {
  expectIntAtLeast,
  expectUnlockTiersMatchGameData,
} from '../test/gameDataResilience.ts';

describe('sp_alchemist passive / active unlock structure', () => {
  const gameData = loadGameData();
  const alchemistClass = gameData.classRegistry['sp_alchemist'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with non-empty display names', () => {
    for (const id of getClassSkillIds(alchemistClass.skills)) {
      const skill = passives[id] ?? actives[id];
      expect(skill?.name).toBeTruthy();
    }
  });

  it('uses herbalPotency on passive_1 and passive_4', () => {
    expect(passives['sp_alchemist_passive_1']?.effect).toBe('herbalPotency');
    expect(passives['sp_alchemist_passive_4']?.effect).toBe('herbalPotency');
    expectIntAtLeast(passives['sp_alchemist_passive_1']?.herbalPotencyMaxStacks, 1);
    expectIntAtLeast(passives['sp_alchemist_passive_4']?.herbalPotencyMaxStacks, 1);
    expect(
      passives['sp_alchemist_passive_4']!.herbalPotencyMaxStacks!,
    ).toBeGreaterThanOrEqual(passives['sp_alchemist_passive_1']!.herbalPotencyMaxStacks!);
  });

  it('defines active_1 as melee HoT with stackOnApply only', () => {
    const active1 = actives['sp_alchemist_active_1']!;
    const hot = active1.effect.find((e) => e.type === 'heal' && e.healSubKind === 'hot');
    expect(hot?.targetShape).toBe('aoe');
    expectIntAtLeast(hot?.stackOnApply, 1);
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
    expect(thenHot?.buffDisplayName).toBeTruthy();
    expect(active4.effect.every((e) => e.type !== 'debuff')).toBe(true);
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('sp_alchemist', gameData);
  });
});
