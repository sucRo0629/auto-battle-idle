import { describe, expect, it } from 'vitest';
import {
  LAST_STAND_RECOVERY_DURATION_SEC_DEFAULT,
  LAST_STAND_RECOVERY_HP_RATIO_DEFAULT,
  tryLastStandRecovery,
} from './lastStandRecovery.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function mockPaladin(id: string): CombatantState {
  return {
    id,
    name: id,
    hp: 10,
    maxHp: 200,
    barrierHp: 30,
    atk: 10,
    def: 22,
    reg: 10,
    isAlive: true,
    role: 'defender',
    classId: 'df_paladin',
    formationRow: 'front',
    traits: { rangePx: 30, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['df_paladin_passive_4'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'df_paladin',
    iconKey: 'df_paladin',
    isEnemy: false,
    battleX: 100,
    visualX: 100,
    corpseVisible: true,
  };
}

const passive4: PassiveSkillDef = {
  id: 'df_paladin_passive_4',
  name: '不退転',
  effect: 'lastStandRecovery',
  lastStandRecoveryHpRatio: LAST_STAND_RECOVERY_HP_RATIO_DEFAULT,
  lastStandRecoverySelfDamageTakenMultiplier: 0.5,
  lastStandRecoveryFrontAllyDamageTakenMultiplier: 0.75,
  lastStandRecoveryDurationSec: LAST_STAND_RECOVERY_DURATION_SEC_DEFAULT,
};

const passives: Record<string, PassiveSkillDef> = {
  df_paladin_passive_4: passive4,
};

describe('lastStandRecovery', () => {
  it('negates lethal damage once per wave and restores half HP', () => {
    const paladin = mockPaladin('p1');
    const result = tryLastStandRecovery(paladin, 50, passives, [paladin]);
    expect(result.negated).toBe(true);
    expect(result.triggered).toBe(true);
    expect(paladin.hp).toBe(100);
    expect(paladin.barrierHp).toBe(30);
    expect(paladin.lastStandRecoveryUsed).toBe(true);
  });

  it('does not trigger on non-lethal damage', () => {
    const paladin = mockPaladin('p2');
    paladin.hp = 80;
    const result = tryLastStandRecovery(paladin, 20, passives, [paladin]);
    expect(result.negated).toBe(false);
    expect(paladin.hp).toBe(80);
  });

  it('applies self and front ally damageTaken buffs', () => {
    const paladin = mockPaladin('p3');
    const frontWarrior = {
      ...mockPaladin('warrior'),
      role: 'attacker' as const,
      classId: 'at_warrior',
      formationRow: 'front' as const,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    };
    const backCleric = {
      ...mockPaladin('cleric'),
      role: 'supporter' as const,
      classId: 'sp_cleric',
      formationRow: 'back' as const,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    };

    tryLastStandRecovery(paladin, 50, passives, [paladin, frontWarrior, backCleric]);

    expect(
      paladin.statusEffects.some(
        (fx) => fx.stat === 'damageTaken' && fx.multiplier === 0.5,
      ),
    ).toBe(true);
    expect(
      frontWarrior.statusEffects.some(
        (fx) => fx.stat === 'damageTaken' && fx.multiplier === 0.75,
      ),
    ).toBe(true);
    expect(
      backCleric.statusEffects.some((fx) => fx.stat === 'damageTaken'),
    ).toBe(false);
  });
});
