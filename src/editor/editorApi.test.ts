import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  buildClassPresetFromDraft,
  buildClassSkillsFromEntries,
  classDraftFromPreset,
  defaultBasicAttackId,
  initClassSkillEntriesFromPreset,
  resyncEnemyBasicAttackEntry,
  type SkillDraftEntry,
  type SkillsJson,
} from './editorApi.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';

function basicAttackEntry(
  enemyId: string,
  active: ActiveSkillDef,
): SkillDraftEntry {
  return {
    ref: { skillId: active.id, kind: 'active' },
    active,
  };
}

describe('class passive unlock levels', () => {
  const classId = 'test_cls';
  const skills: SkillsJson = {
    passives: [
      {
        id: 'test_cls_passive_lv0',
        name: 'P0',
        effect: 'evasionChance',
        evasionChance: 0.1,
      },
      {
        id: 'test_cls_passive_lv3',
        name: 'P3',
        effect: 'evasionChance',
        evasionChance: 0.2,
      },
    ],
    actives: [
      {
        id: `${classId}_basic_attack`,
        name: 'Basic',
        effect: [],
      },
      {
        id: 'test_cls_active_1',
        name: 'A1',
        effect: [],
      },
    ],
  };

  it('saves passive unlock levels into skills[] and sorts passiveIds asc', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: `${classId}_basic_attack`, kind: 'active' },
        active: skills.actives[0],
      },
      {
        ref: { skillId: 'test_cls_passive_lv3', kind: 'passive' },
        passive: skills.passives[1],
        unlockLevel: 3,
      },
      {
        ref: { skillId: 'test_cls_passive_lv0', kind: 'passive' },
        passive: skills.passives[0],
        unlockLevel: 0,
      },
      {
        ref: { skillId: 'test_cls_active_1', kind: 'active' },
        active: skills.actives[1],
        unlockLevel: 0,
      },
    ];

    expect(buildClassSkillsFromEntries(classId, entries)).toEqual([
      {
        level: 0,
        skillIds: ['test_cls_passive_lv0', 'test_cls_active_1'],
      },
      { level: 3, skillIds: ['test_cls_passive_lv3'] },
    ]);

    const draft = classDraftFromPreset({
      id: classId,
      role: 'attacker',
      displayName: 'Test',
      formationRow: 'front',
      traits: {},
      maxHp: 100,
      atk: 10,
      def: 10,
      reg: 0,
      basicAttackSkillId: `${classId}_basic_attack`,
      skills: [{ level: 0, skillIds: [] }],
    } satisfies ClassPresetBeforeEnrich);
    const preset = buildClassPresetFromDraft(draft, entries);
    expect(preset.passiveIds).toEqual([
      'test_cls_passive_lv0',
      'test_cls_passive_lv3',
    ]);
    expect(preset.skills).toEqual([
      {
        level: 0,
        skillIds: ['test_cls_passive_lv0', 'test_cls_active_1'],
      },
      { level: 3, skillIds: ['test_cls_passive_lv3'] },
    ]);
  });

  it('loads passive entries sorted by unlock level asc', () => {
    const preset: ClassPresetBeforeEnrich = {
      id: classId,
      role: 'attacker',
      displayName: 'Test',
      formationRow: 'front',
      traits: {},
      maxHp: 100,
      atk: 10,
      def: 10,
      reg: 0,
      basicAttackSkillId: `${classId}_basic_attack`,
      passiveIds: ['test_cls_passive_lv3', 'test_cls_passive_lv0'],
      skills: [
        {
          level: 0,
          skillIds: ['test_cls_passive_lv0', 'test_cls_active_1'],
        },
        { level: 3, skillIds: ['test_cls_passive_lv3'] },
      ],
    };

    const entries = initClassSkillEntriesFromPreset(preset, skills);
    const passives = entries.filter((entry) => entry.ref.kind === 'passive');

    expect(passives.map((entry) => entry.ref.skillId)).toEqual([
      'test_cls_passive_lv0',
      'test_cls_passive_lv3',
    ]);
    expect(passives.map((entry) => entry.unlockLevel)).toEqual([0, 3]);
  });
});

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
