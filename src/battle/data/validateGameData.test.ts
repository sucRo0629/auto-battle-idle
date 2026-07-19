import problemSeriesCatalogJson from '../../../data/problem-series-catalog.json';
import { describe, expect, it } from 'vitest';
import classesJson from '../../../data/classes.json';
import enemiesJson from '../../../data/enemies.json';
import partiesJson from '../../../data/parties.json';
import stagesDemoJson from '../../../data/stages-demo.json';
import type { ActiveSkillDef, CombatModuleDef, PassiveSkillDef } from '../types.ts';
import { tryLoadGameData } from './loadGameData.ts';
import {
  DEPRECATED_THREAT_PASSIVE_EFFECT,
  EDITOR_PASSIVE_EFFECT_KINDS,
} from './gameDataSchema.ts';
import {
  parseAndValidateGameDataJson,
  parseSkillEffect,
} from './validateGameData.ts';

const passiveModules = import.meta.glob<PassiveSkillDef[]>(
  '../../../data/skills/passives/*.json',
  { eager: true, import: 'default' },
);

const activeModules = import.meta.glob<ActiveSkillDef[]>(
  '../../../data/skills/actives/*.json',
  { eager: true, import: 'default' },
);

const combatModuleFiles = import.meta.glob<CombatModuleDef[]>(
  '../../../data/combat-modules/*.json',
  { eager: true, import: 'default' },
);

function loadMergedSkillsForValidateTest(): {
  passives: PassiveSkillDef[];
  actives: ActiveSkillDef[];
} {
  return {
    passives: Object.values(passiveModules).flat(),
    actives: Object.values(activeModules).flat(),
  };
}

function loadMergedCombatModulesForValidateTest(): CombatModuleDef[] {
  return Object.values(combatModuleFiles).flat();
}

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
  problemSeriesCatalog: problemSeriesCatalogJson,
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
          res: 0,
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
          res: 0,
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
      problemSeriesCatalog: problemSeriesCatalogJson,
    },
      { mode: 'editor' },
    );

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
        problemSeriesCatalog: problemSeriesCatalogJson,
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

  it('accepts enemyGroups without recommendedLevel', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'ok',
            displayName: 'Ok',
            enemyGroups: [{ classId: 'df_paladin', count: 1 }],
            waves: [{ enemies: [] }],
          },
        ],
        parties: emptyGameDataShell.parties,
        problemSeriesCatalog: problemSeriesCatalogJson,
      },
      { mode: 'editor' },
    );
    expect(result.stages[0]?.recommendedLevel).toBeUndefined();
    expect(result.stages[0]?.enemyGroups).toHaveLength(1);
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
        problemSeriesCatalog: problemSeriesCatalogJson,
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
        problemSeriesCatalog: problemSeriesCatalogJson,
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
        problemSeriesCatalog: problemSeriesCatalogJson,
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
        problemSeriesCatalog: problemSeriesCatalogJson,
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
        problemSeriesCatalog: problemSeriesCatalogJson,
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
        problemSeriesCatalog: problemSeriesCatalogJson,
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]?.enemyGroups?.[0]?.count).toBe(5);
  });

  it('loads eg_smoke pilot stage in real game data bundle', () => {
    const result = tryLoadGameData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stage = result.data.stages.find((entry) => entry.id === 'eg_smoke');
    expect(stage).toMatchObject({
      id: 'eg_smoke',
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 1 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(stage?.recommendedLevel).toBeUndefined();
  });

  it('loads ranged_test stage in real game data bundle', () => {
    const result = tryLoadGameData();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stage = result.data.stages.find((entry) => entry.id === 'ranged_test');
    expect(stage).toMatchObject({
      id: 'ranged_test',
      enemyGroups: [
        { classId: 'df_guardian', count: 1 },
        { classId: 'at_hunter', count: 2 },
      ],
      waves: [{ enemies: [] }],
    });
    expect(stage?.recommendedLevel).toBeUndefined();
  });
});

describe('wave enemyGroups validation (R6g-1)', () => {
  function loadRealBundleForWaveTests() {
    return {
      classes: classesJson,
      enemies: enemiesJson,
      skills: loadMergedSkillsForValidateTest(),
      combatModules: loadMergedCombatModulesForValidateTest(),
      parties: partiesJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    };
  }

  it('accepts waves[].enemyGroups with recommendedLevel and empty wave enemies', () => {
    const result = parseAndValidateGameDataJson(
      {
        ...loadRealBundleForWaveTests(),
        stages: [
          {
            id: 'multi_wave_groups',
            displayName: 'Multi Wave Groups',
            recommendedLevel: 10,
            waves: [
              {
                enemies: [],
                enemyGroups: [{ classId: 'df_guardian', count: 2 }],
              },
              {
                enemies: [],
                enemyGroups: [{ classId: 'at_sorcerer', count: 1 }],
              },
            ],
          },
        ],
      },
      { mode: 'editor' },
    );

    expect(result.stages[0]?.waves).toEqual([
      {
        enemies: [],
        enemyGroups: [{ classId: 'df_guardian', count: 2 }],
      },
      {
        enemies: [],
        enemyGroups: [{ classId: 'at_sorcerer', count: 1 }],
      },
    ]);
  });

  it('rejects waves[].enemyGroups with unknown classId', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          classes: [minimalStageClass],
          enemies: [minimalStageEnemy],
          skills: minimalStageSkills,
          stages: [
            {
              id: 'bad_wave_class',
              displayName: 'Bad Wave Class',
              recommendedLevel: 5,
              waves: [
                {
                  enemies: [],
                  enemyGroups: [{ classId: 'no_such_class', count: 1 }],
                },
              ],
            },
          ],
          parties: emptyGameDataShell.parties,
        problemSeriesCatalog: problemSeriesCatalogJson,
        },
        { mode: 'editor' },
      ),
    ).toThrow(/Unknown classId "no_such_class"/i);
  });

  it('rejects waves[].enemyGroups with invalid selectedCombatModuleId', () => {
    expect(() =>
      parseAndValidateGameDataJson(
        {
          ...loadRealBundleForWaveTests(),
          stages: [
            {
              id: 'bad_wave_module',
              displayName: 'Bad Wave Module',
              recommendedLevel: 10,
              waves: [
                {
                  enemies: [],
                  enemyGroups: [
                    {
                      classId: 'df_guardian',
                      count: 1,
                      selectedCombatModuleId: 'missing_module_id',
                    },
                  ],
                },
              ],
            },
          ],
        },
        { mode: 'editor' },
      ),
    ).toThrow(/Unknown selectedCombatModuleId "missing_module_id"/);
  });

  it('accepts waves[].enemyGroups without recommendedLevel', () => {
    const result = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'ok_wave_level',
            displayName: 'Ok Wave Level',
            waves: [
              {
                enemies: [],
                enemyGroups: [{ classId: 'df_paladin', count: 1 }],
              },
            ],
          },
        ],
        parties: emptyGameDataShell.parties,
        problemSeriesCatalog: problemSeriesCatalogJson,
      },
      { mode: 'editor' },
    );
    expect(result.stages[0]?.recommendedLevel).toBeUndefined();
    expect(result.stages[0]?.waves[0]?.enemyGroups).toHaveLength(1);
  });

  it('keeps stage-level enemyGroups and legacy waves[].enemies working', () => {
    const stageLevel = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'stage_groups',
            displayName: 'Stage Groups',
            recommendedLevel: 10,
            enemyGroups: [{ classId: 'df_paladin', count: 2 }],
            waves: [{ enemies: [] }],
          },
        ],
        parties: emptyGameDataShell.parties,
        problemSeriesCatalog: problemSeriesCatalogJson,
      },
      { mode: 'editor' },
    );

    expect(stageLevel.stages[0]).toMatchObject({
      enemyGroups: [{ classId: 'df_paladin', count: 2 }],
      waves: [{ enemies: [] }],
    });

    const legacy = parseAndValidateGameDataJson(
      {
        classes: [minimalStageClass],
        enemies: [minimalStageEnemy],
        skills: minimalStageSkills,
        stages: [
          {
            id: 'legacy_wave',
            displayName: 'Legacy Wave',
            waves: [{ enemies: [{ templateId: 'test_dummy', spawnX: 0 }] }],
          },
        ],
        parties: emptyGameDataShell.parties,
        problemSeriesCatalog: problemSeriesCatalogJson,
      },
      { mode: 'editor' },
    );

    expect(legacy.stages[0]?.waves[0]?.enemies[0]).toEqual({
      templateId: 'test_dummy',
      spawnX: 0,
    });
  });
});

describe('stages-demo.json validation', () => {
  it('parseAndValidateGameDataJson accepts stages-demo with real game data bundle', () => {
    const result = parseAndValidateGameDataJson({
      classes: classesJson,
      enemies: enemiesJson,
      skills: loadMergedSkillsForValidateTest(),
      combatModules: loadMergedCombatModulesForValidateTest(),
      stages: stagesDemoJson,
      parties: partiesJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    });

    expect(result.stages).toHaveLength(7);
    expect(result.stages.map((stage) => stage.id)).toEqual([
      'demo_ch1_01',
      'demo_ch1_02',
      'demo_ch1_03',
      'demo_ch1_04',
      'demo_ch1_05',
      'demo_ch1_06',
      'demo_ch1_07',
    ]);

    for (const stage of result.stages) {
      expect(stage.recommendedLevel).toBeGreaterThanOrEqual(1);
      expect(stage.enemyGroups?.length).toBeGreaterThan(0);
      expect(stage.waves).toEqual([{ enemies: [] }]);
    }

    const rushStage = result.stages.find((s) => s.id === 'demo_ch1_03');
    expect(rushStage?.enemyGroups?.reduce((sum, g) => sum + g.count, 0)).toBe(7);

    const finale = result.stages.find((s) => s.id === 'demo_ch1_07');
    expect(finale?.recommendedLevel).toBe(2);
    expect(finale?.unlockClassIdsOnClear).toEqual(['at_ballista']);
    expect(finale?.enemyGroups?.reduce((sum, g) => sum + g.count, 0)).toBe(6);

    const assassinSpotlight = result.stages.find((s) => s.id === 'demo_ch1_05');
    expect(assassinSpotlight?.formationHintJa).toBe(
      '双刃士は低HPの敵を優先します。削れた後衛や瀕死の敵を仕留める役として試してみましょう。',
    );
    expect(
      result.stages
        .filter((stage) => stage.id !== 'demo_ch1_05')
        .every((stage) => stage.formationHintJa === undefined),
    ).toBe(true);

    expect(JSON.stringify(stagesDemoJson)).not.toContain('templateId');
  });
});

describe('at_ranger passive attackType', () => {
  it('parseAndValidateGameDataJson keeps ranged-attacker priority on Lv0 passive', () => {
    const skills = loadMergedSkillsForValidateTest();
    const result = parseAndValidateGameDataJson({
      classes: classesJson,
      enemies: enemiesJson,
      skills,
      combatModules: loadMergedCombatModulesForValidateTest(),
      stages: [],
      parties: partiesJson,
      problemSeriesCatalog: problemSeriesCatalogJson,
    });

    const p1 = result.passives.find((p) => p.id === 'at_ranger_passive_1');
    const p3 = result.passives.find((p) => p.id === 'at_ranger_passive_3');
    const p4 = result.passives.find((p) => p.id === 'at_ranger_passive_4');

    expect(p1?.targetRuleOverride).toEqual({
      kind: 'attackType',
      ranged: true,
      excludeRoles: ['supporter'],
    });
    expect(p3?.specialEffect?.conditions[0]).toMatchObject({
      kind: 'attackType',
      ranged: true,
    });
    expect(p4?.bonusBasicAttackConditions?.[0]).toMatchObject({
      kind: 'attackType',
      ranged: true,
    });
  });
});
