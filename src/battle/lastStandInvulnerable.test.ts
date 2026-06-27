import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { grantInvulnerable } from './invulnerable.ts';
import { tryLastStandInvulnerable } from './lastStandInvulnerable.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 20,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['df_guardian_passive_4'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_guardian',
    iconKey: 'df_guardian',
    isEnemy: false,
    battleX: 0,
    visualX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const passives: Record<string, PassiveSkillDef> = {
  df_guardian_passive_4: {
    id: 'df_guardian_passive_4',
    name: '不撓の誓い',
    effect: 'lastStandInvulnerable',
  },
};

describe('lastStandInvulnerable', () => {
  it('negates lethal damage once regardless of current HP ratio', () => {
    const unit = mockUnit({ id: 'g1', hp: 25, maxHp: 100 });
    const result = tryLastStandInvulnerable(unit, 30, passives);
    expect(result.negated).toBe(true);
    expect(result.triggered).toBe(true);
    expect(unit.lastStandInvulnerableUsed).toBe(true);
  });

  it('triggers on lethal damage even above former 25% HP threshold', () => {
    const unit = mockUnit({ id: 'g2', hp: 80, maxHp: 100 });
    const result = tryLastStandInvulnerable(unit, 90, passives);
    expect(result.negated).toBe(true);
    expect(result.triggered).toBe(true);
  });

  it('does not trigger on non-lethal damage', () => {
    const unit = mockUnit({ id: 'g2b', hp: 80, maxHp: 100 });
    const result = tryLastStandInvulnerable(unit, 50, passives);
    expect(result.negated).toBe(false);
    expect(unit.lastStandInvulnerableUsed).toBeUndefined();
  });

  it('does not trigger twice in same wave', () => {
    const unit = mockUnit({
      id: 'g3',
      hp: 20,
      maxHp: 100,
      lastStandInvulnerableUsed: true,
    });
    const result = tryLastStandInvulnerable(unit, 50, passives);
    expect(result.negated).toBe(false);
  });

  it('grants invulnerable overlay on trigger', () => {
    const unit = mockUnit({ id: 'g4', hp: 20, maxHp: 100 });
    tryLastStandInvulnerable(unit, 25, passives);
    expect(
      unit.statusEffects.some(
        (effect) =>
          effect.overlay === 'invulnerable' && effect.remainingSec > 0,
      ),
    ).toBe(true);
  });
});

describe('lastStandInvulnerable with grantInvulnerable', () => {
  it('prevents follow-up damage while invulnerable', () => {
    const unit = mockUnit({ id: 'g6', hp: 20, maxHp: 100 });
    tryLastStandInvulnerable(unit, 30, passives);
    grantInvulnerable(unit, 3, unit.id);
    expect(unit.hp).toBe(20);
  });
});
