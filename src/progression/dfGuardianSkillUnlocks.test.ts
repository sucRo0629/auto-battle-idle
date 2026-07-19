import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';

describe('df_guardian passive / active unlock structure', () => {
  const gameData = loadGameData();
  const guardianClass = gameData.classRegistry['df_guardian'];
  const { passives, actives } = gameData.skillRegistry;

  it('keeps only the class-body passive as always learned (R12l: no Lv actives)', () => {
    expect(guardianClass.passiveIds).toEqual(['df_guardian_passive_1']);
    expect(guardianClass.skills).toEqual([]);
    expect(getClassSkillIds(guardianClass.skills)).toEqual([]);
    expect(passives['df_guardian_passive_1']?.name).toBe('大盾使い');
    expect(passives['df_guardian_passive_4']?.effect).toBe(
      'lastStandInvulnerable',
    );
    expect(actives['df_guardian_basic_attack']).toBeDefined();
    expect(actives['df_guardian_active_1']).toBeUndefined();
  });
});
