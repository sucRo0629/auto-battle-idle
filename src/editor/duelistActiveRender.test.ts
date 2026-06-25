import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readSkillsRoot } from '../battle/data/skillsJsonFs.ts';
import { formatActiveDescription } from '../ui/formatSkillText.ts';
import { getEffectTarget } from '../battle/skills/targetSpec.ts';
import { normalizeTarget } from '../battle/skills/targetSpec.ts';

describe('df_duelist active editor prerequisites', () => {
  const actives = readSkillsRoot().actives.filter((a) =>
    a.id.startsWith('df_duelist_active_'),
  );

  it.each(actives.map((active) => [active.id, active] as const))(
    'formats %s without throwing',
    (_id, active) => {
      expect(() => formatActiveDescription(active)).not.toThrow();
    },
  );

  it('normalizes effect targets without throwing', () => {
    for (const active of actives) {
      for (const effect of active.effect) {
        expect(() => getEffectTarget(effect)).not.toThrow();
        expect(() => normalizeTarget(getEffectTarget(effect))).not.toThrow();
      }
    }
  });
});
