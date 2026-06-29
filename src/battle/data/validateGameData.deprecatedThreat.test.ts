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
