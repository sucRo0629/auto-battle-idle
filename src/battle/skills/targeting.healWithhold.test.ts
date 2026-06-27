import { describe, expect, it } from 'vitest';
import type { SkillEffectDef } from '../types.ts';
import { resolveEffectResolution } from './targeting.ts';
import { mockTargetingGameData, mockUnit } from './targeting.fixtures.ts';

describe('heal / hot withhold when no damaged allies', () => {
  const gameData = mockTargetingGameData(200);
  const ratioAllyTarget = {
    kind: 'stat',
    side: 'ally',
    stat: 'hp',
    order: 'ratio',
  } as const;

  it('withholds heal when all allies are at max HP', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('withholds hot when all allies are at max HP', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 0.2 },
        durationSec: 5,
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('resolves heal when a damaged ally is in range', () => {
    const healer = mockUnit('healer', 200);
    const damaged = mockUnit('ally-damaged', 180, { hp: 40, maxHp: 100 });
    const healthy = mockUnit('ally-healthy', 160);
    const party = [healer, damaged, healthy];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally-damaged');
  });

  it('resolves hot when a damaged ally is in range', () => {
    const healer = mockUnit('healer', 200);
    const damaged = mockUnit('ally-damaged', 180, { hp: 40, maxHp: 100 });
    const party = [healer, damaged];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 0.2 },
        durationSec: 5,
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('ally-damaged');
  });

  it('withholds stat heal when PHT is out of range but a lighter ally is in range', () => {
    const healer = mockUnit('healer', 52, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const lighter = mockUnit('sorcerer', 20, { hp: 76, maxHp: 80 });
    const party = [healer, pht, lighter];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('resolves stat heal when PHT is in range', () => {
    const healer = mockUnit('healer', 160, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const lighter = mockUnit('sorcerer', 20, { hp: 76, maxHp: 80 });
    const party = [healer, pht, lighter];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('guardian');
  });

  it('withholds selfOrigin aoe hot when PHT is outside aoe radius', () => {
    const healer = mockUnit('healer', 52, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const lighter = mockUnit('sorcerer', 20, { hp: 76, maxHp: 80 });
    const party = [healer, pht, lighter];
    const selfOriginAoeHot = {
      type: 'heal',
      healSubKind: 'hot',
      durationSec: 8,
      target: {
        kind: 'distance',
        side: 'ally',
        order: 'selfOrigin',
      },
      targetShape: 'aoe',
      aoeRadiusPx: 70,
      amount: { kind: 'atkBased', atkScale: 0.5 },
    } as SkillEffectDef;

    expect(
      resolveEffectResolution(selfOriginAoeHot, healer, party, [], gameData),
    ).toBeNull();
  });

  it('resolves selfOrigin aoe hot when PHT is inside aoe radius', () => {
    const healer = mockUnit('healer', 180, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const party = [healer, pht];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        durationSec: 8,
        target: {
          kind: 'distance',
          side: 'ally',
          order: 'selfOrigin',
        },
        targetShape: 'aoe',
        aoeRadiusPx: 70,
        amount: { kind: 'atkBased', atkScale: 0.5 },
      } as SkillEffectDef,
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).not.toBeNull();
    expect(
      resolution?.waves[0]?.targets.some((hit) => hit.unit.id === 'guardian'),
    ).toBe(true);
  });

  it('resolves all-ally hot when any ally is damaged regardless of range', () => {
    const healer = mockUnit('healer', 20, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const party = [healer, pht];

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        healSubKind: 'hot',
        durationSec: 10,
        target: { kind: 'all', side: 'ally' },
        amount: { kind: 'atkBased', atkScale: 0.2 },
      },
      healer,
      party,
      [],
      gameData,
    );
    expect(resolution).not.toBeNull();
  });

  it('resolves heal at full HP when the skill also grants barrier', () => {
    const healer = mockUnit('healer', 200);
    const ally = mockUnit('ally', 180);
    const party = [healer, ally];
    const skillEffects = [
      {
        type: 'buff',
        buffSubKind: 'barrier',
        target: { kind: 'all', side: 'ally' },
        amount: { kind: 'flat', flatAmount: 20 },
      },
      {
        type: 'heal',
        target: ratioAllyTarget,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ] as SkillEffectDef[];

    const resolution = resolveEffectResolution(
      skillEffects[1]!,
      healer,
      party,
      [],
      gameData,
      Math.random,
      undefined,
      skillEffects,
    );
    expect(resolution).not.toBeNull();
    expect(resolution?.waves[0]?.targets[0]?.unit.isAlive).toBe(true);
  });
});
