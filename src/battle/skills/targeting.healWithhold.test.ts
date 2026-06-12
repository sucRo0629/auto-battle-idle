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
