import { describe, expect, it } from 'vitest';
import {
  applyIncomingDamage,
  applyDelayedDamageTick,
  computeDamageDelayTickAmount,
  getEffectiveDamageDelayRatio,
} from './damageDelay.ts';
import { applyDefenseMitigation } from './combatMath.ts';
import type { CombatantState, StatusEffect } from './types.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 1000,
    maxHp: 1000,
    barrierHp: 0,
    atk: 20,
    def: 0,
    res: 0,
    isAlive: true,
    role: 'defender',
    classId: 'test',
    formationRow: 'front',
    traits: {
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'test',
    iconKey: 'test',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

function damageDelayEffect(ratio: number, remainingSec = 5): StatusEffect {
  return {
    id: 'test_damageDelay',
    kind: 'buff',
    overlay: 'damageDelay',
    ratio,
    multiplier: 1,
    durationSec: 5,
    remainingSec,
  };
}

describe('getEffectiveDamageDelayRatio', () => {
  it('sums ratios from active overlays capped at 1', () => {
    const unit = mockUnit({
      id: 'a',
      statusEffects: [damageDelayEffect(0.3), damageDelayEffect(0.4)],
    });
    expect(getEffectiveDamageDelayRatio(unit.statusEffects)).toBe(0.7);
  });
});

describe('applyIncomingDamage', () => {
  it('splits final damage into immediate HP/barrier and delayed pool', () => {
    const unit = mockUnit({
      id: 'a',
      statusEffects: [damageDelayEffect(0.5)],
    });
    const result = applyIncomingDamage(unit, 1000);
    expect(result.immediateDamage).toBe(500);
    expect(result.delayedDamage).toBe(500);
    expect(result.totalDamage).toBe(1000);
    expect(unit.hp).toBe(500);
    expect(unit.delayedDamagePool).toBe(500);
  });

  it('accumulates delayed pool across multiple hits', () => {
    const unit = mockUnit({
      id: 'a',
      statusEffects: [damageDelayEffect(0.5)],
    });
    applyIncomingDamage(unit, 1000);
    applyIncomingDamage(unit, 600);
    expect(unit.hp).toBe(1000 - 500 - 300);
    expect(unit.delayedDamagePool).toBe(800);
  });

  it('applies barrier only to immediate portion', () => {
    const unit = mockUnit({
      id: 'a',
      barrierHp: 200,
      statusEffects: [damageDelayEffect(0.5)],
    });
    applyIncomingDamage(unit, 1000);
    expect(unit.barrierHp).toBe(0);
    expect(unit.hp).toBe(700);
    expect(unit.delayedDamagePool).toBe(500);
  });
});

describe('applyDelayedDamageTick', () => {
  it('reduces HP without touching barrier', () => {
    const unit = mockUnit({ id: 'a', barrierHp: 100, delayedDamagePool: 80 });
    const result = applyDelayedDamageTick(unit, 50);
    expect(result.hpDamage).toBe(50);
    expect(result.barrierDamage).toBe(0);
    expect(unit.barrierHp).toBe(100);
    expect(unit.delayedDamagePool).toBe(30);
  });

  it('can kill the unit from delayed damage', () => {
    const unit = mockUnit({ id: 'a', hp: 40, delayedDamagePool: 40 });
    const result = applyDelayedDamageTick(unit, 40);
    expect(result.lethal).toBe(true);
    expect(unit.hp).toBe(0);
  });
});

describe('computeDamageDelayTickAmount', () => {
  it('distributes pool evenly over remaining duration', () => {
    expect(computeDamageDelayTickAmount(500, 5)).toBe(100);
    expect(computeDamageDelayTickAmount(400, 4)).toBe(100);
  });
});

describe('defense mitigation is not reapplied to delayed damage', () => {
  it('uses post-mitigation amount for split only', () => {
    const unit = mockUnit({
      id: 'a',
      def: 100,
      statusEffects: [damageDelayEffect(0.5)],
    });
    const mitigated = applyDefenseMitigation(1000, unit, 'physical');
    applyIncomingDamage(unit, mitigated);
    expect(unit.delayedDamagePool).toBe(Math.floor(mitigated * 0.5));
  });
});
