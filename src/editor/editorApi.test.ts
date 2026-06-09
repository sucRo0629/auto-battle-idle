import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  defaultBasicAttackId,
  resyncEnemyBasicAttackEntry,
  type SkillDraftEntry,
  type SkillsJson,
} from './editorApi.ts';

function basicAttackEntry(
  enemyId: string,
  active: ActiveSkillDef,
): SkillDraftEntry {
  return {
    ref: { skillId: active.id, kind: 'active' },
    active,
  };
}

describe('resyncEnemyBasicAttackEntry', () => {
  const enemyId = 'test_enemy';
  const basicId = defaultBasicAttackId(enemyId);
  const skills: SkillsJson = {
    passives: [],
    actives: [
      {
        id: basicId,
        name: basicId,
        interval: 2.5,
        effect: [
          {
            target: { kind: "distance", side: "ally", order: "nearest" },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
          },
        ],
      },
    ],
  };

  it('preserves in-memory draft when basic attack id is unchanged', () => {
    const draftActive: ActiveSkillDef = {
      ...skills.actives[0]!,
      vfx: { preset: 'orb' },
    };
    const entries = [basicAttackEntry(enemyId, draftActive)];

    const next = resyncEnemyBasicAttackEntry(entries, enemyId, skills);

    expect(next[0]?.active?.vfx).toEqual({ preset: 'orb' });
  });

  it('renames draft id when enemy id changes without reloading from disk', () => {
    const draftActive: ActiveSkillDef = {
      ...skills.actives[0]!,
      vfx: { preset: 'arrow', arc: true },
    };
    const entries = [basicAttackEntry(enemyId, draftActive)];

    const next = resyncEnemyBasicAttackEntry(entries, 'renamed_enemy', skills);
    const renamedId = defaultBasicAttackId('renamed_enemy');

    expect(next[0]?.ref.skillId).toBe(renamedId);
    expect(next[0]?.active?.id).toBe(renamedId);
    expect(next[0]?.active?.vfx).toEqual({ preset: 'arrow', arc: true });
  });
});
