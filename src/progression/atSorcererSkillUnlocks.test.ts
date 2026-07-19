import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds, resolveLearnedSkills } from './skillUnlocks.ts';

describe('at_sorcerer passive / active unlock structure', () => {
  const gameData = loadGameData();
  const sorcererClass = gameData.classRegistry['at_sorcerer'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class body passive and no Lv actives (R12l)', () => {
    expect(sorcererClass.passiveIds).toEqual(['at_sorcerer_passive_1']);
    expect(sorcererClass.skills).toEqual([]);
    expect(getClassSkillIds(sorcererClass.skills)).toEqual([]);
    expect(passives['at_sorcerer_passive_1']?.effect).toBe('emberIgnition');
    expect(actives['at_sorcerer_basic_attack']?.effect[0]?.type).toBe('damage');
    expect(actives['at_sorcerer_active_1']).toBeUndefined();
    expect(passives['at_sorcerer_passive_2']).toBeUndefined();
    expect(passives['at_sorcerer_passive_3']).toBeUndefined();
    expect(passives['at_sorcerer_passive_4']).toBeUndefined();
  });

  it('resolveLearnedSkills yields body passive only and zero learned actives', () => {
    const learned = resolveLearnedSkills(
      sorcererClass,
      99,
      gameData.skillRegistry,
    );
    expect(learned.learnedPassiveIds).toEqual(['at_sorcerer_passive_1']);
    expect(learned.learnedActiveIds).toEqual([]);
  });
});
