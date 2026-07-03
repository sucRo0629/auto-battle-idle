import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  buildClassPresetFromDraft,
  buildClassSkillsFromEntries,
  classDraftFromPreset,
  classStatsEqual,
  collectSkillsFromDrafts,
  defaultBasicAttackId,
  createEmptyStageDraft,
  initClassSkillEntriesFromPreset,
  loadStageDraftById,
  normalizeStageDraftForSave,
  resyncEnemyBasicAttackEntry,
  toClassStatsPatch,
  validateStageDraftForSave,
  type SkillDraftEntry,
  type SkillsJson,
} from './editorApi.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';

function basicAttackEntry(
  _enemyId: string,
  active: ActiveSkillDef,
): SkillDraftEntry {
  return {
    ref: { skillId: active.id, kind: 'active' },
    active,
  };
}

describe('collectSkillsFromDrafts basic attack', () => {
  it('strips damageType from basic attack damage effects on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'sp_cleric_basic_attack', kind: 'active' },
        active: {
          id: 'sp_cleric_basic_attack',
          name: 'sp_cleric_basic_attack',
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'magic',
              amount: { kind: 'atkBased', atkScale: 0.5 },
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    const effect = actives[0]?.effect[0];
    expect(effect?.type).toBe('damage');
    expect(effect).not.toHaveProperty('damageType');
  });

  it('preserves fire gate and charge fields on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'test_smart_active', kind: 'active' },
        active: {
          id: 'test_smart_active',
          name: 'Smart Active',
          trigger: { kind: 'time', value: 8 },
          firePolicy: 'smart',
          fireConditions: [{ kind: 'waveStart' }],
          fireTimeoutSec: 4,
          maxCharges: 1,
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    expect(actives[0]).toMatchObject({
      firePolicy: 'smart',
      fireConditions: [{ kind: 'waveStart' }],
      fireTimeoutSec: 4,
      maxCharges: 1,
    });
  });
});

describe('collectSkillsFromDrafts passive sanitize', () => {
  it('preserves damageReduction aoe fields on save (護法陣 shape)', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'df_paladin_passive_2', kind: 'passive' },
        passive: {
          id: 'df_paladin_passive_2',
          name: '護法陣',
          effect: 'damageReduction',
          damageReductionPercent: 0.05,
          damageReductionTargetShape: 'aoe',
          damageReductionAoeRadiusPx: 50,
          damageReductionTargetRule: { kind: 'all', side: 'ally' },
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]).toMatchObject({
      effect: 'damageReduction',
      damageReductionPercent: 0.05,
      damageReductionTargetShape: 'aoe',
      damageReductionAoeRadiusPx: 50,
      damageReductionTargetRule: { kind: 'all', side: 'ally' },
    });
  });

  it('strips orphan fields from excessHealToBarrier passive on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'sp_wardweaver_passive_2', kind: 'passive' },
        passive: {
          id: 'sp_wardweaver_passive_2',
          name: 'sp_wardweaver_passive_2',
          effect: 'excessHealToBarrier',
          barrierScale: 1.5,
          excessHealSources: ['outgoing', 'incoming'],
          targetRuleOverride: {
            kind: 'distance',
            side: 'enemy',
            order: 'nearest',
          },
          hotAmount: { kind: 'atkBased', atkScale: 0.05 },
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]).toEqual({
      id: 'sp_wardweaver_passive_2',
      name: 'sp_wardweaver_passive_2',
      effect: 'excessHealToBarrier',
      barrierScale: 1.5,
      excessHealSources: ['outgoing', 'incoming'],
    });
  });

  it('strips targetRuleOverride from specialEffect heal passive on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'sp_cleric_passive_1', kind: 'passive' },
        passive: {
          id: 'sp_cleric_passive_1',
          name: 'sp_cleric_passive_1',
          effect: 'specialEffect',
          specialEffectApplyTo: 'heal',
          specialEffect: {
            scale: 1.5,
            conditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }],
          },
          targetRuleOverride: {
            kind: 'distance',
            side: 'enemy',
            order: 'nearest',
          },
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]).not.toHaveProperty('targetRuleOverride');
    expect(passives[0]?.effect).toBe('specialEffect');
  });
});

describe('collectSkillsFromDrafts deprecated threat fields', () => {
  it('strips threatBurst fields from damage effects on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'at_swordsman_active_1', kind: 'active' },
        active: {
          id: 'at_swordsman_active_1',
          name: '叩き付け',
          trigger: { kind: 'time', value: 8 },
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1.5 },
              threatBurstFlat: 10,
              threatBurstScale: 1.25,
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    const effect = actives[0]?.effect[0];
    expect(effect?.type).toBe('damage');
    expect(effect).not.toHaveProperty('threatBurstFlat');
    expect(effect).not.toHaveProperty('threatBurstScale');
  });
});

describe('collectSkillsFromDrafts heal HoT', () => {
  it('keeps healSubKind hot and fills default durationSec on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'test_heal_hot', kind: 'active' },
        active: {
          id: 'test_heal_hot',
          name: 'HoT Test',
          trigger: { kind: 'time', value: 5 },
          effect: [
            {
              type: 'heal',
              healSubKind: 'hot',
              amount: { kind: 'atkBased', atkScale: 0.5 },
              target: { kind: 'self' },
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    const heal = actives[0]?.effect[0];
    expect(heal?.type).toBe('heal');
    if (heal?.type !== 'heal') return;
    expect(heal.healSubKind).toBe('hot');
    expect(heal.durationSec).toBe(5);
  });
});

describe('classStatsEqual', () => {
  const base: ClassPresetBeforeEnrich = {
    id: 'at_ranger',
    role: 'attacker',
    displayName: '弓術士',
    formationRow: 'back',
    traits: { rangePx: 50 },
    maxHp: 100,
    atk: 10,
    def: 10,
    reg: 0,
    basicAttackSkillId: 'at_ranger_basic',
    skills: [],
  };

  it('detects rangePx changes', () => {
    const changed = structuredClone(base);
    changed.traits.rangePx = 60;
    expect(classStatsEqual(base, changed)).toBe(false);
    expect(toClassStatsPatch(changed).rangePx).toBe(60);
  });
});

describe('class passive unlock levels', () => {
  const classId = 'test_cls';
  const skills: SkillsJson = {
    passives: [
      {
        id: 'test_cls_passive_lv0',
        name: 'P0',
        effect: 'buff',
        buffSubKind: 'evasion',
        chance: 0.1,
        buffTargetRule: { kind: 'self' },
      },
      {
        id: 'test_cls_passive_lv3',
        name: 'P3',
        effect: 'buff',
        buffSubKind: 'evasion',
        chance: 0.2,
        buffTargetRule: { kind: 'self' },
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
        trigger: { kind: 'time', value: 2.5 },
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
      vfx: { enabled: true },
    };
    const entries = [basicAttackEntry(enemyId, draftActive)];

    const next = resyncEnemyBasicAttackEntry(entries, enemyId, skills);

    expect(next[0]?.active?.vfx).toEqual({ enabled: true });
  });

  it('renames draft id when enemy id changes without reloading from disk', () => {
    const draftActive: ActiveSkillDef = {
      ...skills.actives[0]!,
      vfx: { enabled: true },
    };
    const entries = [basicAttackEntry(enemyId, draftActive)];

    const next = resyncEnemyBasicAttackEntry(entries, 'renamed_enemy', skills);
    const renamedId = defaultBasicAttackId('renamed_enemy');

    expect(next[0]?.ref.skillId).toBe(renamedId);
    expect(next[0]?.active?.id).toBe(renamedId);
    expect(next[0]?.active?.vfx).toEqual({ enabled: true });
  });
});

describe('collectSkillsFromDrafts fireConditions', () => {
  it('preserves fireConditions compare gte on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'at_swordsman_active_1', kind: 'active' },
        active: {
          id: 'at_swordsman_active_1',
          name: '叩き付け',
          trigger: { kind: 'basicAttackCount', value: 5 },
          firePolicy: 'smart',
          fireConditions: [{ kind: 'targetHp', maxHpRatio: 0.3, compare: 'gte' }],
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1.8 },
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    expect(actives[0]?.fireConditions).toEqual([
      { kind: 'targetHp', maxHpRatio: 0.3, compare: 'gte' },
    ]);
  });

  it('preserves basicAttackTransform primaryEffectOverride target on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'df_paladin_active_3', kind: 'active' },
        active: {
          id: 'df_paladin_active_3',
          name: '治療専念',
          trigger: { kind: 'time', value: 8 },
          effect: [
            {
              target: { kind: 'self' },
              type: 'basicAttackTransform',
              buffDurationSec: 4,
              primaryEffectOverride: {
                type: 'heal',
                healSubKind: 'instant',
                target: {
                  kind: 'stat',
                  side: 'ally',
                  stat: 'hp',
                  order: 'ratio',
                },
                amount: { kind: 'atkBased', atkScale: 1.5 },
              },
              range: 60,
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    const effect = actives[0]?.effect[0];
    expect(effect?.type).toBe('basicAttackTransform');
    if (effect?.type !== 'basicAttackTransform') return;
    expect(effect.primaryEffectOverride?.target).toEqual({
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
    });
    expect(effect.range).toBe(60);
  });
});

describe('normalizeStageDraftForSave', () => {
  it('adds placeholder waves when enemyGroups stage omits waves', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'demo_1',
      displayName: 'Demo 1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
    });

    expect(normalized.waves).toEqual([{ enemies: [] }]);
    expect(normalized.enemyGroups).toEqual([{ classId: 'df_paladin', count: 2 }]);
  });

  it('adds placeholder waves when enemyGroups stage has empty waves array', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'demo_1',
      displayName: 'Demo 1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      waves: [],
    });

    expect(normalized.waves).toEqual([{ enemies: [] }]);
  });

  it('keeps existing placeholder waves for enemyGroups stage', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'demo_1',
      displayName: 'Demo 1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      waves: [{ enemies: [] }],
    });

    expect(normalized.waves).toEqual([{ enemies: [] }]);
  });

  it('keeps legacy waves structure unchanged', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'legacy',
      displayName: 'Legacy',
      waves: [{ enemies: [{ templateId: 'test_dummy', spawnX: 120 }] }],
    });

    expect(normalized.waves).toEqual([
      { enemies: [{ templateId: 'test_dummy', spawnX: 120 }] },
    ]);
    expect(normalized.enemyGroups).toBeUndefined();
  });

  it('throws for legacy stage without waves', () => {
    expect(() =>
      normalizeStageDraftForSave({
        id: 'legacy',
        displayName: 'Legacy',
      }),
    ).toThrow(/waves is required for legacy stage drafts/i);
  });

  it('normalized enemyGroups draft passes editor validate when recommendedLevel is set', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'demo_1',
      displayName: 'Demo 1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
    });

    const minimalStageClass = {
      id: 'df_paladin',
      role: 'defender',
      displayName: '聖騎士',
      summary: { ja: 'test' },
      formationRow: 'front',
      maxHp: 100,
      atk: 10,
      def: 5,
      reg: 0,
      basicAttackSkillId: 'df_paladin_basic_attack',
      passiveIds: [],
      starterActiveIds: [],
      skills: [{ level: 0, skillIds: [] }],
      classSkillIds: [],
    };

    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [
          {
            id: 'test_dummy',
            displayName: 'dummy',
            maxHp: 100,
            atk: 1,
            def: 1,
            reg: 0,
            exp: 0,
            basicAttackSkillId: 'test_dummy_basic_attack',
            attackSpeedTier: 'normal',
          },
        ],
        skills: {
          passives: [],
          actives: [
            {
              id: 'df_paladin_basic_attack',
              name: 'basic',
              trigger: { kind: 'time', value: 2 },
              effect: [
                {
                  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                  type: 'damage',
                  amount: { kind: 'atkBased', atkScale: 1 },
                },
              ],
            },
          ],
        },
        stages: [normalized],
        parties: {
          test: {
            name: 'Test',
            members: [{ classId: 'df_paladin', build: { activeSkillIds: [] } }],
          },
        },
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]).toMatchObject({
      id: 'demo_1',
      recommendedLevel: 10,
      waves: [{ enemies: [] }],
    });
  });

  it('does not auto-fill recommendedLevel for enemyGroups draft', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'bad',
      displayName: 'Bad',
      enemyGroups: [{ classId: 'df_paladin', count: 1 }],
    });

    const minimalStageClass = {
      id: 'df_paladin',
      role: 'defender',
      displayName: '聖騎士',
      summary: { ja: 'test' },
      formationRow: 'front',
      maxHp: 100,
      atk: 10,
      def: 5,
      reg: 0,
      basicAttackSkillId: 'df_paladin_basic_attack',
      passiveIds: [],
      starterActiveIds: [],
      skills: [{ level: 0, skillIds: [] }],
      classSkillIds: [],
    };

    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [],
          skills: { passives: [], actives: [] },
          stages: [normalized],
          parties: {
            test: {
              name: 'Test',
              members: [{ classId: 'df_paladin', build: { activeSkillIds: [] } }],
            },
          },
        },
        { mode: 'editor' },
      ),
    ).toThrow(/recommendedLevel.*required when enemyGroups is set/i);
  });
});

describe('stage draft helpers', () => {
  const stages = [
    {
      id: 'demo_1',
      displayName: 'Demo 1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
      waves: [{ enemies: [] }],
    },
    {
      id: 'legacy_1',
      displayName: 'Legacy 1',
      waves: [{ enemies: [{ templateId: 'test_dummy', spawnX: 100 }] }],
    },
  ];

  it('createEmptyStageDraft returns blank draft', () => {
    expect(createEmptyStageDraft()).toEqual({ id: '', displayName: '' });
  });

  it('loadStageDraftById clones matching stage', () => {
    const draft = loadStageDraftById(stages, 'demo_1');
    expect(draft.id).toBe('demo_1');
    expect(draft.enemyGroups).toEqual([{ classId: 'df_paladin', count: 2 }]);
    draft.id = 'mutated';
    expect(stages[0]!.id).toBe('demo_1');
  });

  it('loadStageDraftById falls back to empty draft for unknown id', () => {
    expect(loadStageDraftById(stages, 'missing')).toEqual(createEmptyStageDraft());
  });
});

describe('validateStageDraftForSave', () => {
  it('allows legacy-only draft without enemyGroups', () => {
    expect(
      validateStageDraftForSave({
        id: 'legacy_1',
        displayName: 'Legacy 1',
        waves: [{ enemies: [{ templateId: 'test_dummy', spawnX: 100 }] }],
      }),
    ).toBeNull();
  });

  it('rejects enemyGroups draft without recommendedLevel', () => {
    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      }),
    ).toMatch(/recommendedLevel/);
  });

  it('rejects empty enemyGroups array', () => {
    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        recommendedLevel: 10,
        enemyGroups: [],
      }),
    ).toMatch(/1 件以上/);
  });

  it('rejects invalid count and scale', () => {
    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_paladin', count: 0 }],
      }),
    ).toMatch(/count/);

    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_paladin', count: 1, hpScale: 0 }],
      }),
    ).toMatch(/hpScale/);
  });

  it('accepts valid enemyGroups draft', () => {
    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        recommendedLevel: 10,
        enemyGroups: [{ classId: 'df_paladin', count: 2, atkScale: 1.5 }],
      }),
    ).toBeNull();
  });

  it('round-trips eg_smoke draft through normalize without losing fields', () => {
    const draft = loadStageDraftById(loadGameData().stages, 'eg_smoke');

    expect(validateStageDraftForSave(draft)).toBeNull();

    const normalized = normalizeStageDraftForSave(draft);

    expect(normalized).toMatchObject({
      id: 'eg_smoke',
      recommendedLevel: 10,
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 1 },
      ],
      waves: [{ enemies: [] }],
    });
  });
});
