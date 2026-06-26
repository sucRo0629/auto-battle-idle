import { describe, expect, it } from 'vitest';
import type { PassiveSkillDef } from './types.ts';
import {
  defaultStatBuffModifierEntry,
  parseStatBuffModifiers,
  syncPassiveBuffStatModifiers,
} from './statBuffModifiers.ts';

describe('parseStatBuffModifiers', () => {
  it('reads buffStatModifiers when present', () => {
    expect(
      parseStatBuffModifiers({
        buffStatModifiers: [
          { stat: 'def', multiplier: 1.1 },
          { stat: 'reg', flatBonus: 5 },
        ],
      }),
    ).toEqual([
      { stat: 'def', multiplier: 1.1 },
      { stat: 'reg', flatBonus: 5 },
    ]);
  });

  it('falls back to legacy buffStat fields', () => {
    expect(
      parseStatBuffModifiers({
        buffStat: ['def', 'reg'],
        buffMultiplier: 1.1,
        buffFlatBonus: 5,
      }),
    ).toEqual([
      { stat: 'def', multiplier: 1.1, flatBonus: 5 },
      { stat: 'reg', multiplier: 1.1, flatBonus: 5 },
    ]);
  });
});

describe('syncPassiveBuffStatModifiers', () => {
  it('writes buffStatModifiers for multiple entries', () => {
    const passive = { effect: 'buff' } as PassiveSkillDef;
    syncPassiveBuffStatModifiers(passive, [
      { stat: 'def', multiplier: 1.1 },
      { stat: 'reg', flatBonus: 5 },
    ]);
    expect(passive.buffStatModifiers).toEqual([
      { stat: 'def', multiplier: 1.1 },
      { stat: 'reg', flatBonus: 5 },
    ]);
    expect(passive.buffStat).toEqual(['def', 'reg']);
    expect(passive.buffMultiplier).toBeUndefined();
    expect(passive.buffFlatBonus).toBeUndefined();
  });

  it('writes legacy fields for a single entry', () => {
    const passive = { effect: 'buff' } as PassiveSkillDef;
    syncPassiveBuffStatModifiers(passive, [{ stat: 'atk', multiplier: 1.05 }]);
    expect(passive.buffStat).toBe('atk');
    expect(passive.buffMultiplier).toBe(1.05);
    expect(passive.buffStatModifiers).toBeUndefined();
  });

  it('provides a default entry helper', () => {
    expect(defaultStatBuffModifierEntry()).toEqual({
      stat: 'atk',
      multiplier: 1.1,
    });
  });
});
