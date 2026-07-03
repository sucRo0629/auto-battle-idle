import { describe, expect, it } from 'vitest';
import {
  DEPRECATED_THREAT_PASSIVE_EFFECT,
  EDITOR_PASSIVE_EFFECT_KINDS,
} from './gameDataSchema.ts';
import {
  parseAndValidateGameDataJson,
  parseSkillEffect,
} from './validateGameData.ts';

const emptyGameDataShell = {
  classes: [],
  enemies: [],
  stages: [],
  parties: {
    test: {
      name: 'Test',
      members: [
        {
          classId: 'df_paladin',
          build: {
            learnedPassiveIds: [],
            learnedActiveIds: [],
            equippedActiveSlots: [],
          },
        },
      ],
    },
  },
};

describe('deprecated threat validation', () => {
  it('editor passive effect kinds omit threatControl', () => {
    expect(EDITOR_PASSIVE_EFFECT_KINDS).not.toContain(
      DEPRECATED_THREAT_PASSIVE_EFFECT,
    );
  });

  it('parseSkillEffect rejects threatBurstFlat on damage', () => {
    expect(() =>
      parseSkillEffect(
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          threatBurstFlat: 5,
        },
        'effect[0]',
      ),
    ).toThrow(/threatBurstFlat.*deprecated/i);
  });

  it('parseAndValidateGameDataJson accepts damageReduction aoe passive', () => {
    const result = parseAndValidateGameDataJson(
      {
        ...emptyGameDataShell,
        skills: {
          passives: [
            {
              id: 'df_paladin_passive_2',
              name: '護法陣',
              effect: 'damageReduction',
              damageReductionPercent: 0.05,
              damageReductionTargetShape: 'aoe',
              damageReductionAoeRadiusPx: 50,
              damageReductionTargetRule: { kind: 'all', side: 'ally' },
            },
          ],
          actives: [],
        },
      },
      { mode: 'editor' },
    );

    expect(result.passives[0]).toMatchObject({
      effect: 'damageReduction',
      damageReductionAoeRadiusPx: 50,
      damageReductionTargetShape: 'aoe',
    });
  });

  it('parseAndValidateGameDataJson rejects threatControl passive effect', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          ...emptyGameDataShell,
          skills: {
            passives: [
              {
                id: 'legacy_threat',
                name: 'legacy',
                effect: 'threatControl',
                onDamageTakenScale: 0.5,
              },
            ],
            actives: [],
          },
        },
        { mode: 'editor' },
      ),
    ).toThrow(/threatControl was removed/i);
  });

  it('parseAndValidateGameDataJson keeps class basic when enemy borrows its id', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [
        {
          id: 'at_hunter',
          role: 'attacker',
          displayName: '狩猟士',
          summary: { ja: 'test' },
          formationRow: 'back',
          maxHp: 100,
          atk: 10,
          def: 5,
          reg: 0,
          basicAttackSkillId: 'at_hunter_basic_attack',
          passiveIds: ['at_hunter_passive_1'],
          starterActiveIds: ['at_hunter_active_1'],
          skills: [{ level: 0, skillIds: ['at_hunter_passive_1', 'at_hunter_active_1'] }],
          classSkillIds: [],
        },
      ],
      enemies: [
        {
          id: 'enemy_at_hunter',
          displayName: 'デバフ確認',
          maxHp: 200,
          atk: 10,
          def: 30,
          reg: 0,
          exp: 0,
          basicAttackSkillId: 'at_hunter_basic_attack',
          attackSpeedTier: 'normal',
          traits: { rangePx: 300 },
        },
      ],
      skills: {
        passives: [
          {
            id: 'at_hunter_passive_1',
            name: '濃縮毒',
            effect: 'dotCompressAssist',
            dotCompressRatio: 0.7,
          },
        ],
        actives: [
          {
            id: 'at_hunter_basic_attack',
            name: '通常射撃',
            trigger: { kind: 'time', value: 2 },
            effect: [
              {
                target: { kind: 'distance', side: 'enemy', order: 'nearest' },
                type: 'damage',
                amount: { kind: 'atkBased', atkScale: 1 },
              },
            ],
          },
          {
            id: 'at_hunter_active_1',
            name: '毒罠',
            trigger: { kind: 'time', value: 8 },
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
      stages: [],
      parties: {
        test: {
          name: 'Test',
          members: [
            {
              classId: 'at_hunter',
              build: {
                learnedPassiveIds: [],
                learnedActiveIds: [],
                equippedActiveSlots: [],
              },
            },
          ],
        },
      },
    });

    const basic = result.actives.find((skill) => skill.id === 'at_hunter_basic_attack');
    expect(basic).toBeDefined();
    expect(basic?.name).toBe('通常射撃');
    expect(
      result.actives.some((skill) => skill.id === 'enemy_at_hunter_basic_attack'),
    ).toBe(false);
  });

  it('parseAndValidateGameDataJson rejects orphan threat fields on other passives', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          ...emptyGameDataShell,
          skills: {
            passives: [
              {
                id: 'bad_mix',
                name: 'bad',
                effect: 'damageReduction',
                damageReductionPercent: 0.1,
                damageReductionTargetRule: { kind: 'self' },
                frontThreatFloor: 0.72,
              },
            ],
            actives: [],
          },
        },
        { mode: 'editor' },
      ),
    ).toThrow(/frontThreatFloor.*deprecated/i);
  });
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

const minimalStageEnemy = {
  id: 'test_dummy',
  displayName: 'dummy',
  maxHp: 100,
  atk: 1,
  def: 1,
  reg: 0,
  exp: 0,
  basicAttackSkillId: 'test_dummy_basic_attack',
  attackSpeedTier: 'normal',
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
    {
      id: 'test_dummy_basic_attack',
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

describe('stage enemyGroups validation', () => {
  it('accepts enemyGroups stage with recommendedLevel and empty wave placeholder', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'demo_1',
            displayName: 'Demo 1',
            recommendedLevel: 10,
            enemyGroups: [{ classId: 'df_paladin', count: 2 }],
            waves: [{ enemies: [] }],
          },
        ],
        parties: emptyGameDataShell.parties,
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]).toMatchObject({
      id: 'demo_1',
      recommendedLevel: 10,
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
      waves: [{ enemies: [] }],
    });
  });

  it('rejects enemyGroups without recommendedLevel', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'bad',
              displayName: 'Bad',
              enemyGroups: [{ classId: 'df_paladin', count: 1 }],
              waves: [{ enemies: [] }],
            },
          ],
          parties: emptyGameDataShell.parties,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/recommendedLevel.*required when enemyGroups is set/i);
  });

  it('keeps legacy wave templateId validation', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'legacy',
            displayName: 'Legacy',
            waves: [{ enemies: [{ templateId: 'test_dummy', spawnX: 0 }] }],
          },
        ],
        parties: emptyGameDataShell.parties,
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]?.waves[0]?.enemies[0]).toEqual({
      templateId: 'test_dummy',
      spawnX: 0,
    });
  });

  it('rejects legacy stage with empty wave enemies', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'legacy_empty',
              displayName: 'Legacy Empty',
              waves: [{ enemies: [] }],
            },
          ],
          parties: emptyGameDataShell.parties,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/enemies.*must be a non-empty array/i);
  });

  it('rejects enemyGroups with unknown classId', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'bad_class',
              displayName: 'Bad Class',
              recommendedLevel: 5,
              enemyGroups: [{ classId: 'no_such_class', count: 1 }],
              waves: [{ enemies: [] }],
            },
          ],
          parties: emptyGameDataShell.parties,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/Unknown classId "no_such_class"/i);
  });

  it('rejects enemyGroups with count 0', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'bad_count',
              displayName: 'Bad Count',
              recommendedLevel: 5,
              enemyGroups: [{ classId: 'df_paladin', count: 0 }],
              waves: [{ enemies: [] }],
            },
          ],
          parties: emptyGameDataShell.parties,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/count.*must be a positive integer/i);
  });

  it('rejects enemyGroups with non-positive scale', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'bad_scale',
              displayName: 'Bad Scale',
              recommendedLevel: 5,
              enemyGroups: [{ classId: 'df_paladin', count: 1, hpScale: 0 }],
              waves: [{ enemies: [] }],
            },
          ],
          parties: emptyGameDataShell.parties,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/hpScale.*must be a positive number/i);
  });

  it('accepts enemyGroups with count 5 or more', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'many_enemies',
            displayName: 'Many Enemies',
            recommendedLevel: 10,
            enemyGroups: [{ classId: 'df_paladin', count: 5 }],
            waves: [{ enemies: [] }],
          },
        ],
        parties: emptyGameDataShell.parties,
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]?.enemyGroups?.[0]?.count).toBe(5);
  });
});
