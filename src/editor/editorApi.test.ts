import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  buildClassPresetFromDraft,
  buildClassSkillsFromEntries,
  classDraftFromPreset,
  classStatsEqual,
  collectSkillsFromDrafts,
  defaultBasicAttackId,
  initClassSkillEntriesFromPreset,
  resyncEnemyBasicAttackEntry,
  toClassStatsPatch,
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

describe('collectSkillsFromDrafts threat fields', () => {
  it('preserves threatBurstScale on damage effect save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'at_warrior_active_1', kind: 'active' },
        active: {
          id: 'at_warrior_active_1',
          name: '叩き付け',
          trigger: { kind: 'basicAttackCount', value: 5 },
          effect: [
            {
              target: { kind: 'distance', side: 'enemy', order: 'nearest' },
              type: 'damage',
              damageType: 'physical',
              amount: { kind: 'atkBased', atkScale: 1.8 },
              threatBurstScale: 1.25,
            },
          ],
        },
      },
    ];

    const { actives } = collectSkillsFromDrafts(entries);
    const effect = actives[0]?.effect[0];
    expect(effect?.type).toBe('damage');
    if (effect?.type !== 'damage') return;
    expect(effect.threatBurstScale).toBe(1.25);
  });

  it('preserves threatControl passive fields on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'df_guardian_passive_5', kind: 'passive' },
        passive: {
          id: 'df_guardian_passive_5',
          name: '鉄壁の挑発',
          effect: 'threatControl',
          onDamageTakenScale: 0.5,
          onBlockFlat: 5,
          threatDecayMultiplier: 0.5,
        },
      },
    ];

    const { passives } = collectSkillsFromDrafts(entries);
    expect(passives[0]).toMatchObject({
      effect: 'threatControl',
      onDamageTakenScale: 0.5,
      onBlockFlat: 5,
      threatDecayMultiplier: 0.5,
    });
  });

  it('preserves fireConditions compare gte on save', () => {
    const entries: SkillDraftEntry[] = [
      {
        ref: { skillId: 'at_warrior_active_1', kind: 'active' },
        active: {
          id: 'at_warrior_active_1',
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
