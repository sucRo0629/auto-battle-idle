import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import {
  expectRatio,
  expectUnlockTiersMatchGameData,
} from '../test/gameDataResilience.ts';

describe('sp_cleric passive / active unlock structure', () => {
  const gameData = loadGameData();
  const clericClass = gameData.classRegistry['sp_cleric'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with non-empty display names', () => {
    for (const id of getClassSkillIds(clericClass.skills)) {
      const skill = passives[id] ?? actives[id];
      expect(skill?.name).toBeTruthy();
    }
    for (const id of clericClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
  });

  it('redefines active_2 as low HP smart heal and moves area heal to active_3', () => {
    const active2 = actives['sp_cleric_active_2']!;
    expect(active2.firePolicy).toBe('smart');
    expect(active2.fireConditions?.[0]?.kind).toBe('targetHp');
    expectRatio(active2.fireConditions?.[0]?.maxHpRatio);
    expect(active2.effect.some((e) => e.type === 'heal' && e.target?.kind === 'all')).toBe(
      false,
    );

    const active3 = actives['sp_cleric_active_3']!;
    expect(active3.effect.some((e) => e.type === 'heal' && e.target?.kind === 'all')).toBe(
      true,
    );
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('sp_cleric', gameData);
  });
});
