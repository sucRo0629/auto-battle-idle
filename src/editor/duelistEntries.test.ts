import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import { initClassSkillEntriesFromPreset } from './editorApi.ts';

describe('df_duelist skill entries', () => {
  it('includes active skills from skills[] blocks', () => {
    const classes = JSON.parse(
      readFileSync('data/classes.json', 'utf8'),
    ) as ClassPresetBeforeEnrich[];
    const preset = classes.find((cls) => cls.id === 'df_duelist');
    expect(preset).toBeDefined();
    const skills = readSkillsRoot();
    const entries = initClassSkillEntriesFromPreset(preset!, skills);
    const actives = entries.filter(
      (entry) =>
        entry.ref.kind === 'active' &&
        !entry.ref.skillId.endsWith('_basic_attack'),
    );
    expect(actives.map((entry) => entry.ref.skillId)).toEqual([
      'df_duelist_active_1',
      'df_duelist_active_2',
      'df_duelist_active_3',
      'df_duelist_active_4',
    ]);
  });
});
