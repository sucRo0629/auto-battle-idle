import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';

describe('df_guardian passive / active unlock structure', () => {
  const gameData = loadGameData();
  const guardianClass = gameData.classRegistry['df_guardian'];
  const { passives, actives } = gameData.skillRegistry;

  it('keeps only the class-body passive as always learned', () => {
    expect(guardianClass.passiveIds).toEqual(['df_guardian_passive_1']);
    expect(
      guardianClass.skills.flatMap((entry) => entry.skillIds).filter((id) =>
        id.startsWith('df_guardian_passive_'),
      ),
    ).toEqual([]);
    expect(passives['df_guardian_passive_1']?.name).toBe('大盾使い');
    expect(passives['df_guardian_passive_4']?.name).toBe('不撓の誓い');
    for (const id of getClassSkillIds(guardianClass.skills)) {
      expect(actives[id]?.id).toBe(id);
    }
  });
});
