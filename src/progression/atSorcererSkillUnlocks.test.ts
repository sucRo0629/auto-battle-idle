import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import { expectUnlockTiersMatchGameData } from '../test/gameDataResilience.ts';

describe('at_sorcerer passive / active unlock structure', () => {
  const gameData = loadGameData();
  const sorcererClass = gameData.classRegistry['at_sorcerer'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected roles', () => {
    for (const id of sorcererClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(sorcererClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    expect(actives['at_sorcerer_basic_attack']?.effect[0]?.type).toBe('damage');
    expect(passives['at_sorcerer_passive_1']?.effect).toBe('defenseIgnore');
    expect(passives['at_sorcerer_passive_2']?.effect).toBe('seedFlameOnActiveHit');
    expect(passives['at_sorcerer_passive_3']?.effect).toBe('bonusActiveOnHit');
    expect(passives['at_sorcerer_passive_4']?.effect).toBe('blazingFlameDetonate');
    expect(actives['at_sorcerer_active_4']?.effect[0]?.targetShape).toBe('poolEach');
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_sorcerer', gameData);
  });

  it('does not leave placeholder active names', () => {
    for (const id of [
      'at_sorcerer_active_1',
      'at_sorcerer_active_2',
      'at_sorcerer_active_3',
      'at_sorcerer_active_4',
    ]) {
      const skill = actives[id];
      expect(skill?.name).toBeTruthy();
      expect(skill?.name).not.toBe(id);
    }
  });
});
