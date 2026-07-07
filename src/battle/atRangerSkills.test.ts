import { describe, expect, it, vi } from 'vitest';
import { shouldTriggerBonusBasicAttackOnHit } from './bonusBasicAttackOnHit.ts';
import { resolveDamage } from './combatMath.ts';
import { mockCombatant } from './testFixtures.ts';
import type { PassiveSkillDef } from './types.ts';
import { RANGED_ATTACK_MIN_PX } from './types.ts';

describe('at_ranger combat mechanics', () => {
  const baseEffect = {
    type: 'damage' as const,
    target: { kind: 'distance' as const, side: 'enemy' as const, order: 'nearest' as const },
    damageType: 'physical' as const,
    amount: { kind: 'flat' as const, flatAmount: 100 },
  };

  const p3Passives: Record<string, PassiveSkillDef> = {
    at_ranger_passive_3: {
      id: 'at_ranger_passive_3',
      name: '遠隔狩り',
      effect: 'specialEffect',
      specialEffectApplyTo: 'damage',
      specialEffect: {
        scale: 1.2,
        conditions: [
          { kind: 'attackType', ranged: true, excludeRoles: ['supporter'] },
        ],
      },
    },
  };

  const p4Passives: Record<string, PassiveSkillDef> = {
    at_ranger_passive_4: {
      id: 'at_ranger_passive_4',
      name: '二の矢',
      effect: 'bonusBasicAttackOnHit',
      chance: 0.5,
      bonusBasicAttackConditions: [
        { kind: 'attackType', ranged: true, excludeRoles: ['supporter'] },
      ],
    },
  };

  function enemyWithRange(rangePx: number) {
    return mockCombatant({
      def: 0,
      hp: 100,
      maxHp: 100,
      isEnemy: true,
      traits: { rangePx, damageType: 'physical' },
    });
  }

  it('P3 specialEffect applies only to ranged enemies', () => {
    const attacker = mockCombatant({
      atk: 100,
      build: {
        learnedPassiveIds: ['at_ranger_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const rangedTarget = enemyWithRange(RANGED_ATTACK_MIN_PX);
    const meleeTarget = enemyWithRange(RANGED_ATTACK_MIN_PX - 1);

    const rangedDamage = resolveDamage(attacker, rangedTarget, baseEffect, p3Passives);
    const meleeDamage = resolveDamage(attacker, meleeTarget, baseEffect, p3Passives);
    const meleeBaseline = resolveDamage(
      mockCombatant({ atk: 100 }),
      meleeTarget,
      baseEffect,
      {},
    );

    expect(rangedDamage).toBeGreaterThan(meleeDamage);
    expect(meleeDamage).toBe(meleeBaseline);
  });

  it('P3 specialEffect skips ranged supporter enemies', () => {
    const attacker = mockCombatant({
      atk: 100,
      build: {
        learnedPassiveIds: ['at_ranger_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const rangedSupporter = enemyWithRange(RANGED_ATTACK_MIN_PX);
    rangedSupporter.role = 'supporter';
    const baseline = resolveDamage(
      mockCombatant({ atk: 100 }),
      rangedSupporter,
      baseEffect,
      {},
    );
    const withPassive = resolveDamage(
      attacker,
      rangedSupporter,
      baseEffect,
      p3Passives,
    );
    expect(withPassive).toBe(baseline);
  });

  it('P4 triggers bonus basic hit only on ranged enemies when chance succeeds', () => {
    vi.restoreAllMocks();
    const actor = mockCombatant({
      build: {
        learnedPassiveIds: ['at_ranger_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const rangedTarget = enemyWithRange(RANGED_ATTACK_MIN_PX);
    const meleeTarget = enemyWithRange(RANGED_ATTACK_MIN_PX - 1);

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldTriggerBonusBasicAttackOnHit(actor, rangedTarget, p4Passives)).toBe(
      true,
    );
    expect(shouldTriggerBonusBasicAttackOnHit(actor, meleeTarget, p4Passives)).toBe(
      false,
    );
    successSpy.mockRestore();
  });

  it('P4 does not trigger on ranged supporter enemies', () => {
    vi.restoreAllMocks();
    const actor = mockCombatant({
      build: {
        learnedPassiveIds: ['at_ranger_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const rangedSupporter = enemyWithRange(RANGED_ATTACK_MIN_PX);
    rangedSupporter.role = 'supporter';

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldTriggerBonusBasicAttackOnHit(actor, rangedSupporter, p4Passives)).toBe(
      false,
    );
    successSpy.mockRestore();
  });

  it('P4 does not require low HP on ranged enemies', () => {
    vi.restoreAllMocks();
    const actor = mockCombatant({
      build: {
        learnedPassiveIds: ['at_ranger_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const fullHpRanged = enemyWithRange(RANGED_ATTACK_MIN_PX);

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldTriggerBonusBasicAttackOnHit(actor, fullHpRanged, p4Passives)).toBe(
      true,
    );
    successSpy.mockRestore();
  });
});
