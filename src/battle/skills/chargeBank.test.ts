import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, SkillCooldown } from '../types.ts';
import {
  bankReadyChargeIfPossible,
  consumeActiveChargeOnFire,
} from './chargeBank.ts';

function skill(overrides: Partial<ActiveSkillDef> = {}): ActiveSkillDef {
  return {
    id: 'test',
    name: 'test',
    trigger: { kind: 'time', value: 5 },
    effect: [
      {
        target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
    ],
    ...overrides,
  };
}

function activeCd(overrides: Partial<SkillCooldown> = {}): SkillCooldown {
  return {
    skillId: 'test',
    remaining: 0,
    slotKind: 'active',
    ...overrides,
  };
}

describe('bankReadyChargeIfPossible', () => {
  it('does not bank when maxCharges is 0', () => {
    const cd = activeCd({ remaining: 0 });
    expect(bankReadyChargeIfPossible(cd, skill(), [])).toBe(false);
    expect(cd.storedCharges).toBeUndefined();
  });

  it('banks one stored charge when under cap', () => {
    const cd = activeCd({ remaining: 0 });
    expect(bankReadyChargeIfPossible(cd, skill({ maxCharges: 1 }), [])).toBe(true);
    expect(cd.storedCharges).toBe(1);
    expect(cd.remaining).toBe(5);
  });

  it('stops banking at stored cap', () => {
    const cd = activeCd({ remaining: 0, storedCharges: 1 });
    expect(bankReadyChargeIfPossible(cd, skill({ maxCharges: 1 }), [])).toBe(false);
    expect(cd.storedCharges).toBe(1);
  });
});

describe('consumeActiveChargeOnFire', () => {
  it('preserves partial CD when consuming a stored charge', () => {
    const cd = activeCd({ storedCharges: 1, remaining: 3 });
    consumeActiveChargeOnFire(cd, skill({ maxCharges: 1 }), []);
    expect(cd.storedCharges).toBe(0);
    expect(cd.remaining).toBe(3);
  });

  it('preserves ready CD when consuming a stored charge', () => {
    const cd = activeCd({ storedCharges: 1, remaining: 0 });
    consumeActiveChargeOnFire(cd, skill({ maxCharges: 1 }), []);
    expect(cd.storedCharges).toBe(0);
    expect(cd.remaining).toBe(0);
  });

  it('resets CD when firing from ready with no stored charges', () => {
    const cd = activeCd({ storedCharges: 0, remaining: 0 });
    consumeActiveChargeOnFire(cd, skill({ maxCharges: 1 }), []);
    expect(cd.storedCharges).toBe(0);
    expect(cd.remaining).toBe(5);
  });

  it('resets CD for maxCharges=0 skills', () => {
    const cd = activeCd({ remaining: 0 });
    consumeActiveChargeOnFire(cd, skill(), []);
    expect(cd.remaining).toBe(5);
  });

  it('clears fireHoldSinceSec on fire', () => {
    const cd = activeCd({ storedCharges: 1, remaining: 2, fireHoldSinceSec: 10 });
    consumeActiveChargeOnFire(cd, skill({ maxCharges: 1 }), []);
    expect(cd.fireHoldSinceSec).toBeUndefined();
  });
});
