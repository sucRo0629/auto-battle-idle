import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds, resolveLearnedSkills } from './skillUnlocks.ts';

describe('sp_cleric passive / active unlock structure', () => {
  const gameData = loadGameData();
  const clericClass = gameData.classRegistry['sp_cleric'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class body passive and no Lv actives (R12l)', () => {
    expect(clericClass.passiveIds).toEqual(['sp_cleric_passive_1']);
    expect(clericClass.skills).toEqual([]);
    expect(getClassSkillIds(clericClass.skills)).toEqual([]);
    for (const id of clericClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    expect(actives['sp_cleric_basic_attack']).toBeDefined();
    expect(actives['sp_cleric_active_1']).toBeUndefined();
  });

  it('resolveLearnedSkills yields body passive only and zero learned actives', () => {
    const learned = resolveLearnedSkills(
      clericClass,
      99,
      gameData.skillRegistry,
    );
    expect(learned.learnedPassiveIds).toEqual(['sp_cleric_passive_1']);
    expect(learned.learnedActiveIds).toEqual([]);
  });
});
