import { describe, expect, it } from 'vitest';
import {
  mergeIdleAtkRampPassives,
  resolveIdleAtkRampMultiplier,
} from './idleAtkRamp.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function mockUnit(): CombatantState {
  return {
    id: 'u1',
    name: 'u1',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'at_ballista',
    formationRow: 'back',
    traits: { rangePx: 400, damageType: 'physical' },
    build: {
      learnedPassiveIds: ['p2'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'at_ballista',
    iconKey: 'at_ballista',
    isEnemy: false,
    battleX: 40,
    corpseVisible: true,
  };
}

const rampPassive: PassiveSkillDef = {
  id: 'p2',
  name: '巻き上げ機構',
  effect: 'idleAtkRamp',
  rampToMaxSec: 2.5,
  atkMulMin: 1.25,
  atkMulMax: 1.6,
  fullRampAttackSpeedMul: 0.7,
};

describe('idleAtkRamp', () => {
  it('mergeIdleAtkRampPassives reads JSON defaults', () => {
    expect(mergeIdleAtkRampPassives([rampPassive])).toEqual({
      rampToMaxSec: 2.5,
      atkMulMin: 1.25,
      atkMulMax: 1.6,
      fullRampAttackSpeedMul: 0.7,
    });
  });

  it('returns 1 when no ramp passive is learned', () => {
    const unit = mockUnit();
    unit.build.learnedPassiveIds = [];
    expect(
      resolveIdleAtkRampMultiplier(unit, { p2: rampPassive }),
    ).toBe(1);
  });
});
