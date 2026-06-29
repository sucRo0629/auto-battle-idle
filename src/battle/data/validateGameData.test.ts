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
