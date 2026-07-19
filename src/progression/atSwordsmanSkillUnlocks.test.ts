import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds, resolveLearnedSkills } from './skillUnlocks.ts';

describe('at_swordsman passive / active unlock structure', () => {
  const gameData = loadGameData();
  const warriorClass = gameData.classRegistry['at_swordsman'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class body passive and no Lv actives (R12l)', () => {
    expect(warriorClass.passiveIds).toEqual(['at_swordsman_passive_2']);
    expect(warriorClass.skills).toEqual([]);
    expect(getClassSkillIds(warriorClass.skills)).toEqual([]);
    for (const id of warriorClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    expect(actives['at_swordsman_basic_attack']?.effect[0]?.type).toBe('damage');
    expect(passives['at_swordsman_passive_2']?.effect).toBe('targetRuleOverride');
    expect(actives['at_swordsman_active_1']).toBeUndefined();
  });

  it('resolveLearnedSkills yields body passive only and zero learned actives', () => {
    const learned = resolveLearnedSkills(
      warriorClass,
      99,
      gameData.skillRegistry,
    );
    expect(learned.learnedPassiveIds).toEqual(['at_swordsman_passive_2']);
    expect(learned.learnedActiveIds).toEqual([]);
  });
});
