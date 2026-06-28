import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { resolveIncomingHealAmount } from './passiveEffects.ts';
import {
  PRIDE_HEAL_MULTIPLIER_DEFAULT,
  PRIDE_HP_RATIO_MIN_DEFAULT,
  resolveDuelistPrideIncomingHealMultiplier,
  syncDuelistPrideAuras,
} from './duelistPride.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: overrides.hp ?? 60,
    maxHp: overrides.maxHp ?? 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'df_duelist',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['pride'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'ally',
    iconKey: 'ally',
    isEnemy: false,
    battleX: 0,
    corpseVisible: true,
    ...overrides,
  };
}

const pridePassive: PassiveSkillDef = {
  id: 'pride',
  name: '闘士の矜持',
  effect: 'duelistPride',
  prideHpRatioMin: PRIDE_HP_RATIO_MIN_DEFAULT,
  prideHealMultiplier: PRIDE_HEAL_MULTIPLIER_DEFAULT,
};

const passives: Record<string, PassiveSkillDef> = {
  pride: pridePassive,
};

describe('duelistPride', () => {
  it('reduces incoming heal at 60% HP', () => {
    const unit = mockUnit({ id: 'duelist', hp: 60, maxHp: 100 });
    expect(resolveDuelistPrideIncomingHealMultiplier(unit, passives)).toBe(0.25);
    expect(resolveIncomingHealAmount(unit, 100, passives)).toBe(25);
  });

  it('reduces incoming heal at exactly 50% HP (boundary inclusive)', () => {
    const unit = mockUnit({ id: 'duelist', hp: 50, maxHp: 100 });
    expect(resolveDuelistPrideIncomingHealMultiplier(unit, passives)).toBe(0.25);
    expect(resolveIncomingHealAmount(unit, 100, passives)).toBe(25);
  });

  it('does not reduce incoming heal below 50% HP', () => {
    const unit = mockUnit({ id: 'duelist', hp: 49, maxHp: 100 });
    expect(resolveDuelistPrideIncomingHealMultiplier(unit, passives)).toBe(1);
    expect(resolveIncomingHealAmount(unit, 100, passives)).toBe(100);
  });

  it('applies through resolveIncomingHealAmount for HoT-style ticks', () => {
    const unit = mockUnit({ id: 'duelist', hp: 70, maxHp: 100 });
    expect(resolveIncomingHealAmount(unit, 40, passives)).toBe(10);
  });

  it('ignores barrier HP for pride threshold', () => {
    const unit = mockUnit({ id: 'duelist', hp: 40, maxHp: 100, barrierHp: 50 });
    expect(resolveDuelistPrideIncomingHealMultiplier(unit, passives)).toBe(1);
  });

  it('syncs debuff overlay while HP is at or above pride threshold', () => {
    const highHp = mockUnit({ id: 'duelist', hp: 60, maxHp: 100 });
    syncDuelistPrideAuras([highHp], passives);
    expect(
      highHp.statusEffects.some(
        (effect) =>
          effect.overlay === 'duelistPride' &&
          effect.kind === 'debuff' &&
          effect.displayName === '闘士の矜持',
      ),
    ).toBe(true);

    const lowHp = mockUnit({ id: 'duelist2', hp: 40, maxHp: 100 });
    syncDuelistPrideAuras([lowHp], passives);
    expect(lowHp.statusEffects.some((effect) => effect.overlay === 'duelistPride')).toBe(
      false,
    );
  });
});
