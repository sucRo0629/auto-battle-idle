import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { parseAndValidateGameDataJson } from '../battle/data/validateGameData.ts';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  addStageDraftWave,
  beginStageEnemyGroupsAuthoring,
  beginWaveEnemyGroupsAuthoring,
  buildClassPresetFromDraft,
  buildClassSkillsFromEntries,
  canRemoveStageDraftWave,
  classDraftFromPreset,
  classStatsEqual,
  collectSkillsFromDrafts,
  createDefaultStageDraft,
  defaultBasicAttackId,
  createEmptyStageDraft,
  initClassSkillEntriesFromPreset,
  isNewStageDraft,
  loadStageDraftById,
  normalizeStageDraftForSave,
  removeStageDraftWave,
  resolveStageDraftCompositionMode,
  resyncEnemyBasicAttackEntry,
  toClassStatsPatch,
  validateStageDraftForSave,
  type SkillDraftEntry,
  type SkillsJson,
  type StageDraft,
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

  it('strips default hostile targetRuleOverride from targetRuleOverride passive on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'test_passive_default', kind: 'passive' },
        passive: {
          id: 'test_passive_default',
          name: 'test_passive_default',
          effect: 'targetRuleOverride',
          targetRuleOverride: {
            kind: 'distance',
            side: 'enemy',
            order: 'nearest',
          },
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]).toEqual({
      id: 'test_passive_default',
      name: 'test_passive_default',
      effect: 'targetRuleOverride',
    });
  });

  it('preserves priority targetRuleOverride attackType.ranged on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'at_ranger_passive_1', kind: 'passive' },
        passive: {
          id: 'at_ranger_passive_1',
          name: 'at_ranger_passive_1',
          effect: 'targetRuleOverride',
          targetRuleOverride: {
            kind: 'attackType',
            ranged: true,
            excludeRoles: ['supporter'],
          },
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]?.targetRuleOverride).toEqual({
      kind: 'attackType',
      ranged: true,
      excludeRoles: ['supporter'],
    });
  });

  it('strips default hostile effect.target from damage active on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'test_damage_active', kind: 'active' },
        active: {
          id: 'test_damage_active',
          name: 'test_damage_active',
          trigger: { kind: 'time', value: 5 },
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
    expect(actives[0]?.effect[0]).not.toHaveProperty('target');
  });

  it('preserves ally heal target on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'sp_cleric_basic_attack', kind: 'active' },
        active: {
          id: 'sp_cleric_basic_attack',
          name: 'sp_cleric_basic_attack',
          trigger: { kind: 'time', value: 2 },
          effect: [
            {
              target: {
                kind: 'stat',
                side: 'ally',
                stat: 'hp',
                order: 'ratio',
              },
              type: 'heal',
              healSubKind: 'instant',
              amount: { kind: 'atkBased', atkScale: 1 },
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    expect(actives[0]?.effect[0]?.target).toEqual({
      kind: 'stat',
      side: 'ally',
      stat: 'hp',
      order: 'ratio',
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
    res: 0,
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
      res: 0,
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

  it('buildClassPresetFromDraft omits legacy formationRow from preset', () => {
    const draft = classDraftFromPreset({
      id: classId,
      role: 'attacker',
      displayName: 'Test',
      formationRow: 'front',
      traits: { rangePx: 200 },
      maxHp: 100,
      atk: 10,
      def: 10,
      res: 0,
      basicAttackSkillId: `${classId}_basic_attack`,
      skills: [{ level: 0, skillIds: [] }],
    } satisfies ClassPresetBeforeEnrich);
    const preset = buildClassPresetFromDraft(draft, []);
    expect(preset.formationRow).toBeUndefined();
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
      res: 0,
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
      res: 0,
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
            res: 0,
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
      res: 0,
      basicAttackSkillId: 'df_paladin_basic_attack',
      passiveIds: [],
      starterActiveIds: [],
      skills: [{ level: 0, skillIds: [] }],
      classSkillIds: [],
    };

    expect(
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
      ).stages[0]?.recommendedLevel,
    ).toBeUndefined();
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

  it('accepts enemyGroups draft without recommendedLevel', () => {
    expect(
      validateStageDraftForSave({
        id: 'demo_1',
        displayName: 'Demo 1',
        enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      }),
    ).toBeNull();
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
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 1 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(normalized.recommendedLevel).toBeUndefined();
  });

  it('round-trips ranged_test draft through normalize without losing fields', () => {
    const draft = loadStageDraftById(loadGameData().stages, 'ranged_test');

    expect(validateStageDraftForSave(draft)).toBeNull();

    const normalized = normalizeStageDraftForSave(draft);

    expect(normalized).toMatchObject({
      id: 'ranged_test',
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 2 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(normalized.recommendedLevel).toBeUndefined();
  });
});

describe('wave enemyGroups draft helpers (R6g-4)', () => {
  const minimalStageClass = {
    id: 'df_paladin',
    role: 'defender',
    displayName: '聖騎士',
    summary: { ja: 'test' },
    formationRow: 'front',
    maxHp: 100,
    atk: 10,
    def: 5,
    res: 0,
    basicAttackSkillId: 'df_paladin_basic_attack',
    passiveIds: [],
    starterActiveIds: [],
    skills: [{ level: 0, skillIds: [] }],
    classSkillIds: [],
  };

  const minimalStageEnemy = {
    id: 'test_dummy',
    displayName: 'dummy',
    maxHp: 100,
    atk: 1,
    def: 1,
    res: 0,
    exp: 0,
    basicAttackSkillId: 'test_dummy_basic_attack',
    attackSpeedTier: 'normal' as const,
  };

  const minimalStageSkills = {
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
  };

  const emptyParties = {
    test: {
      name: 'Test',
      members: [{ classId: 'df_paladin', build: { activeSkillIds: [] } }],
    },
  };

  it('loads waves[].enemyGroups into draft via loadStageDraftById', () => {
    const stage = {
      id: 'multi_wave',
      displayName: 'Multi Wave',
      recommendedLevel: 12,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 2 }],
        },
        {
          enemies: [],
          enemyGroups: [{ classId: 'at_hunter', count: 1, atkScale: 1.1 }],
        },
      ],
    };

    const draft = loadStageDraftById([stage], 'multi_wave');

    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
    expect(draft.waves?.[0]?.enemyGroups).toEqual([
      { classId: 'df_paladin', count: 2 },
    ]);
    expect(draft.waves?.[1]?.enemyGroups).toEqual([
      { classId: 'at_hunter', count: 1, atkScale: 1.1 },
    ]);
  });

  it('saves wave-level enemyGroups edits through normalizeStageDraftForSave', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'multi_wave',
      displayName: 'Multi Wave',
      recommendedLevel: 12,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 3 }],
        },
        {
          enemies: [],
          enemyGroups: [{ classId: 'at_hunter', count: 1 }],
        },
      ],
    });

    expect(normalized.waves).toEqual([
      {
        enemies: [],
        enemyGroups: [{ classId: 'df_paladin', count: 3 }],
      },
      {
        enemies: [],
        enemyGroups: [{ classId: 'at_hunter', count: 1 }],
      },
    ]);
    expect(normalized.enemyGroups).toBeUndefined();
  });

  it('preserves unedited waves when saving mixed wave draft', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'mixed_wave',
      displayName: 'Mixed Wave',
      recommendedLevel: 10,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        },
        {
          enemies: [{ templateId: 'test_dummy', spawnX: 120 }],
        },
      ],
    });

    expect(normalized.waves?.[1]?.enemies).toEqual([
      { templateId: 'test_dummy', spawnX: 120 },
    ]);
    expect(normalized.waves?.[1]?.enemyGroups).toBeUndefined();
  });

  it('keeps stage-level enemyGroups save path unchanged', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'stage_groups',
      displayName: 'Stage Groups',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
    });

    expect(normalized.enemyGroups).toEqual([{ classId: 'df_paladin', count: 2 }]);
    expect(normalized.waves).toEqual([{ enemies: [] }]);
  });

  it('keeps legacy waves[].enemies when saving legacy stage', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'legacy_1',
      displayName: 'Legacy 1',
      waves: [
        { enemies: [{ templateId: 'test_dummy', spawnX: 100 }] },
        {
          enemies: [
            { templateId: 'test_dummy', spawnX: 80 },
            { templateId: 'test_dummy', spawnX: 160 },
          ],
        },
      ],
    });

    expect(normalized.waves).toEqual([
      { enemies: [{ templateId: 'test_dummy', spawnX: 100 }] },
      {
        enemies: [
          { templateId: 'test_dummy', spawnX: 80 },
          { templateId: 'test_dummy', spawnX: 160 },
        ],
      },
    ]);
  });

  it('normalized wave enemyGroups draft passes parseAndValidateGameDataJson', () => {
    const normalized = normalizeStageDraftForSave({
      id: 'multi_wave',
      displayName: 'Multi Wave',
      recommendedLevel: 12,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 2 }],
        },
        {
          enemies: [{ templateId: 'test_dummy', spawnX: 100 }],
          enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        },
      ],
    });

    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [normalized],
        parties: emptyParties,
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]?.waves).toEqual([
      {
        enemies: [],
        enemyGroups: [{ classId: 'df_paladin', count: 2 }],
      },
      {
        enemies: [{ templateId: 'test_dummy', spawnX: 100 }],
        enemyGroups: [{ classId: 'df_paladin', count: 1 }],
      },
    ]);
  });

  it('validateStageDraftForSave validates per-wave enemyGroups', () => {
    expect(
      validateStageDraftForSave({
        id: 'wave_groups',
        displayName: 'Wave Groups',
        recommendedLevel: 10,
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 2 }] },
          { enemies: [], enemyGroups: [] },
        ],
      }),
    ).toMatch(/waves\[1\]\.enemyGroups/);

    expect(
      validateStageDraftForSave({
        id: 'wave_groups',
        displayName: 'Wave Groups',
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 1 }] },
        ],
      }),
    ).toBeNull();

    expect(
      validateStageDraftForSave({
        id: 'wave_groups',
        displayName: 'Wave Groups',
        recommendedLevel: 10,
        waves: [
          { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 2 }] },
          { enemies: [{ templateId: 'test_dummy', spawnX: 100 }] },
        ],
      }),
    ).toBeNull();
  });

  it('validateStageDraftForSave accepts enemyGroups with selectedCombatModuleId', () => {
    expect(
      validateStageDraftForSave({
        id: 'module_stage',
        displayName: 'Module Stage',
        recommendedLevel: 10,
        enemyGroups: [
          {
            classId: 'df_guardian',
            count: 1,
            selectedCombatModuleId: 'df_guardian_mod_nearest_strike',
          },
        ],
        waves: [{ enemies: [] }],
      }),
    ).toBeNull();
  });

  it('normalizeStageDraftForSave preserves selectedCombatModuleId on stage and wave groups', () => {
    const stageDraft: StageDraft = {
      id: 'module_save_stage',
      displayName: 'Module Save Stage',
      recommendedLevel: 10,
      enemyGroups: [
        {
          classId: 'df_guardian',
          count: 1,
          selectedCombatModuleId: 'df_guardian_mod_guard_focus',
        },
      ],
      waves: [{ enemies: [] }],
    };
    const waveDraft: StageDraft = {
      id: 'module_save_wave',
      displayName: 'Module Save Wave',
      recommendedLevel: 10,
      waves: [
        {
          enemies: [],
          enemyGroups: [
            {
              classId: 'at_swordsman',
              count: 1,
              selectedCombatModuleId: 'at_swordsman_mod_pierce_slash',
            },
          ],
        },
      ],
    };

    expect(normalizeStageDraftForSave(stageDraft).enemyGroups?.[0]).toMatchObject({
      selectedCombatModuleId: 'df_guardian_mod_guard_focus',
    });
    expect(
      normalizeStageDraftForSave(waveDraft).waves?.[0]?.enemyGroups?.[0],
    ).toMatchObject({
      selectedCombatModuleId: 'at_swordsman_mod_pierce_slash',
    });
  });
});

describe('wave structure authoring helpers (R9c)', () => {
  it('addStageDraftWave appends wave with default enemyGroups when authoring', () => {
    const draft: StageDraft = {
      id: 'author_wave',
      displayName: 'Author Wave',
      recommendedLevel: 10,
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        },
      ],
    };

    addStageDraftWave(draft, { defaultClassId: 'at_hunter' });

    expect(draft.waves).toHaveLength(2);
    expect(draft.waves?.[1]?.enemyGroups).toEqual([
      { classId: 'at_hunter', count: 1 },
    ]);
    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
  });

  it('removeStageDraftWave removes wave while keeping at least one', () => {
    const draft: StageDraft = {
      id: 'remove_wave',
      displayName: 'Remove Wave',
      recommendedLevel: 10,
      waves: [
        { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 1 }] },
        { enemies: [], enemyGroups: [{ classId: 'at_hunter', count: 2 }] },
      ],
    };

    expect(canRemoveStageDraftWave(draft)).toBe(true);
    expect(removeStageDraftWave(draft, 1)).toBeNull();
    expect(draft.waves).toHaveLength(1);
    expect(draft.waves?.[0]?.enemyGroups?.[0]?.classId).toBe('df_paladin');
    expect(canRemoveStageDraftWave(draft)).toBe(false);
    expect(removeStageDraftWave(draft, 0)).toMatch(/最低 1 件/);
  });

  it('saves two-wave enemyGroups draft and passes runtime validate', () => {
    const draft: StageDraft = {
      id: 'r9c_two_wave',
      displayName: 'R9c Two Wave',
      recommendedLevel: 12,
      waves: [
        { enemies: [], enemyGroups: [{ classId: 'df_paladin', count: 2 }] },
        { enemies: [], enemyGroups: [{ classId: 'at_hunter', count: 1 }] },
      ],
    };

    const normalized = normalizeStageDraftForSave(draft);
    expect(validateStageDraftForSave(draft)).toBeNull();
    expect(normalized.waves).toHaveLength(2);

    const reloaded = loadStageDraftById([normalized], 'r9c_two_wave');
    expect(resolveStageDraftCompositionMode(reloaded)).toBe('waveEnemyGroups');
    expect(reloaded.waves?.[1]?.enemyGroups?.[0]?.classId).toBe('at_hunter');
  });

  it('promotes stage enemyGroups and appends wave when adding from stage authoring', () => {
    const draft = loadStageDraftById(loadGameData().stages, 'eg_smoke');

    addStageDraftWave(draft, { defaultClassId: 'df_paladin' });

    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
    expect(draft.enemyGroups).toBeUndefined();
    expect(draft.waves).toHaveLength(2);
    expect(draft.waves?.[0]?.enemyGroups).toEqual([
      { classId: 'df_guardian', count: 1 },
      { classId: 'at_hunter', count: 1 },
    ]);
    expect(draft.waves?.[1]?.enemyGroups).toEqual([
      { classId: 'df_paladin', count: 1 },
    ]);
  });
});

describe('legacy composition authoring helpers', () => {
  it('begins wave authoring from legacy without leaving stage enemyGroups behind', () => {
    const draft: StageDraft = {
      id: 'legacy_wave_start',
      displayName: 'Legacy Wave Start',
      waves: [{ enemies: [{ templateId: 'enemy_a', spawnX: 80 }] }],
    };

    beginWaveEnemyGroupsAuthoring(draft, { defaultClassId: 'df_paladin' });

    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
    expect(draft.enemyGroups).toBeUndefined();
    expect(draft.waves?.[0]?.enemyGroups).toEqual([
      { classId: 'df_paladin', count: 1 },
    ]);
  });

  it('begins stage authoring from legacy and clears wave enemyGroups', () => {
    const draft: StageDraft = {
      id: 'legacy_stage_start',
      displayName: 'Legacy Stage Start',
      waves: [
        {
          enemies: [],
          enemyGroups: [{ classId: 'df_paladin', count: 1 }],
        },
      ],
    };

    beginStageEnemyGroupsAuthoring(draft);

    expect(resolveStageDraftCompositionMode(draft)).toBe('stageEnemyGroups');
    expect(draft.enemyGroups).toEqual([]);
    expect(draft.waves?.[0]?.enemyGroups).toBeUndefined();
  });
});

describe('stage create authoring (R9f)', () => {
  it('createDefaultStageDraft starts waveEnemyGroups with one group', () => {
    const draft = createDefaultStageDraft({
      defaultClassId: 'at_hunter',
      recommendedLevel: 5,
    });

    expect(draft.id).toBe('');
    expect(draft.displayName).toBe('');
    expect(draft.recommendedLevel).toBe(5);
    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
    expect(draft.waves).toHaveLength(1);
    expect(draft.waves?.[0]?.enemyGroups).toEqual([
      { classId: 'at_hunter', count: 1 },
    ]);
    expect(draft.waves?.[0]?.enemies).toEqual([]);
    expect(isNewStageDraft(draft, loadGameData().stages)).toBe(true);
  });

  it('createDefaultStageDraft can seed two waves for R10-style operations', () => {
    const draft = createDefaultStageDraft({
      defaultClassId: 'df_paladin',
      waveCount: 2,
    });

    expect(draft.recommendedLevel).toBeUndefined();
    expect(draft.waves).toHaveLength(2);
    expect(resolveStageDraftCompositionMode(draft)).toBe('waveEnemyGroups');
    expect(validateStageDraftForSave({
      ...draft,
      id: 'r9f_two_wave',
      displayName: 'R9f Two Wave',
    })).toBeNull();

    const normalized = normalizeStageDraftForSave({
      ...draft,
      id: 'r9f_two_wave',
      displayName: 'R9f Two Wave',
    });
    const reloaded = loadStageDraftById([normalized], 'r9f_two_wave');
    expect(reloaded.waves).toHaveLength(2);
    expect(resolveStageDraftCompositionMode(reloaded)).toBe('waveEnemyGroups');
  });

  it('rejects missing identity and duplicate stageId on new drafts', () => {
    const draft = createDefaultStageDraft({ defaultClassId: 'df_paladin' });
    expect(validateStageDraftForSave(draft, { isNewStage: true })).toMatch(
      /stageId/,
    );

    draft.id = 'bad id';
    draft.displayName = 'Bad';
    expect(validateStageDraftForSave(draft, { isNewStage: true })).toMatch(
      /英数字/,
    );

    draft.id = 'eg_smoke';
    draft.displayName = 'Dup';
    expect(
      validateStageDraftForSave(draft, {
        isNewStage: true,
        existingStageIds: loadGameData().stages.map((stage) => stage.id),
      }),
    ).toMatch(/既に存在/);
  });

  it('accepts unique new stage identity and round-trips through normalize', () => {
    const draft = createDefaultStageDraft({
      defaultClassId: 'df_guardian',
      waveCount: 2,
      recommendedLevel: 8,
    });
    draft.id = 'r9f_new_op';
    draft.displayName = 'R9f New Operation';
    draft.waves![0]!.enemyGroups = [{ classId: 'df_guardian', count: 1 }];
    draft.waves![1]!.enemyGroups = [{ classId: 'at_hunter', count: 2 }];

    const existingIds = loadGameData().stages.map((stage) => stage.id);
    expect(
      validateStageDraftForSave(draft, {
        isNewStage: true,
        existingStageIds: existingIds,
        classRegistry: loadGameData().classRegistry,
        combatModuleRegistry: loadGameData().combatModuleRegistry,
      }),
    ).toBeNull();

    const normalized = normalizeStageDraftForSave(draft);
    const reloaded = loadStageDraftById(
      [...loadGameData().stages, normalized],
      'r9f_new_op',
    );
    expect(resolveStageDraftCompositionMode(reloaded)).toBe('waveEnemyGroups');
    expect(reloaded.displayName).toBe('R9f New Operation');
    expect(reloaded.waves).toHaveLength(2);
    expect(reloaded.waves?.[0]?.enemyGroups?.[0]?.classId).toBe('df_guardian');
    expect(reloaded.waves?.[1]?.enemyGroups?.[0]).toEqual({
      classId: 'at_hunter',
      count: 2,
    });
    expect(isNewStageDraft(reloaded, loadGameData().stages)).toBe(true);
    expect(isNewStageDraft(reloaded, [...loadGameData().stages, normalized])).toBe(
      false,
    );
  });
});
