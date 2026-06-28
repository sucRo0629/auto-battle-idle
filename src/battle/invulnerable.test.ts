import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import { applyConfirmedHpDamage, applyDamageToTarget } from './combatMath.ts';
import { applyIncomingDamage } from './damageDelay.ts';
import { grantInvulnerable, isInvulnerable } from './invulnerable.ts';
import { applyWardBarrierToIncomingDamage } from './wardBarrier.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 10,
    maxHp: 100,
    barrierHp: 20,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_guardian',
    iconKey: 'df_guardian',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

describe('invulnerable', () => {
  it('blocks direct HP damage', () => {
    const unit = mockUnit({ id: 'u1' });
    grantInvulnerable(unit, 3, unit.id);
    const result = applyDamageToTarget(unit, 999);
    expect(result.hpDamage).toBe(0);
    expect(unit.hp).toBe(10);
  });

  it('blocks confirmed HP damage (DoT/delay path)', () => {
    const unit = mockUnit({ id: 'u2' });
    grantInvulnerable(unit, 3, unit.id);
    const result = applyConfirmedHpDamage(unit, 50);
    expect(result.hpDamage).toBe(0);
    expect(unit.hp).toBe(10);
  });

  it('blocks incoming damage pipeline including barrier', () => {
    const unit = mockUnit({ id: 'u3' });
    grantInvulnerable(unit, 3, unit.id);
    const incoming = applyIncomingDamage(unit, 80);
    expect(incoming.totalDamage).toBe(0);
    expect(unit.barrierHp).toBe(20);
    expect(unit.hp).toBe(10);
  });

  it('blocks ward consumption', () => {
    const unit = mockUnit({
      id: 'u4',
      statusEffects: [
        {
          id: 'ward',
          kind: 'buff',
          overlay: 'wardBarrier',
          stacks: 2,
          ratio: 0.5,
          multiplier: 1,
          durationSec: 999,
          remainingSec: 999,
          sourceId: 'cleric',
        },
      ],
    });
    grantInvulnerable(unit, 3, unit.id);
    const ward = applyWardBarrierToIncomingDamage(unit, 100);
    expect(ward.damage).toBe(0);
    expect(isInvulnerable(unit)).toBe(true);
  });
});
