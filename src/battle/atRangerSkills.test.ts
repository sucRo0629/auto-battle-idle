import { describe, expect, it, vi } from 'vitest';
import { shouldTriggerBonusBasicAttackOnHit } from './bonusBasicAttackOnHit.ts';
import { resolveDamage } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { mockCombatant } from './testFixtures.ts';
import type { PassiveSkillDef } from './types.ts';

describe('at_ranger combat mechanics', () => {
  const gameData = loadGameData();

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
        conditions: [{ kind: 'attackType', ranged: true }],
      },
    },
  };

  const p4Passives: Record<string, PassiveSkillDef> = {
    at_ranger_passive_4: {
      id: 'at_ranger_passive_4',
      name: '二の矢',
      effect: 'bonusBasicAttackOnHit',
      chance: 0.5,
      bonusBasicAttackConditions: [{ kind: 'attackType', ranged: true }],
    },
  };

  function enemyWithBasic(skillId: string, rangePx: number) {
    return mockCombatant({
      def: 0,
      hp: 100,
      maxHp: 100,
      isEnemy: true,
      traits: { rangePx, damageType: 'physical' },
      cooldowns: [{ skillId, remaining: 0, slotKind: 'basic' }],
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
    const rangedTarget = enemyWithBasic('at_ranger_basic_attack', 30);
    const meleeTarget = enemyWithBasic('at_swordsman_basic_attack', 300);

    const rangedDamage = resolveDamage(attacker, rangedTarget, baseEffect, p3Passives, {
      gameData,
    });
    const meleeDamage = resolveDamage(attacker, meleeTarget, baseEffect, p3Passives, {
      gameData,
    });
    const meleeBaseline = resolveDamage(
      mockCombatant({ atk: 100 }),
      meleeTarget,
      baseEffect,
      {},
    );

    expect(rangedDamage).toBeGreaterThan(meleeDamage);
    expect(meleeDamage).toBe(meleeBaseline);
  });

  it('P3 specialEffect skips heal-only supporter enemies', () => {
    const attacker = mockCombatant({
      atk: 100,
      build: {
        learnedPassiveIds: ['at_ranger_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const healSupporter = enemyWithBasic('sp_cleric_mod_single_mend', 110);
    healSupporter.role = 'supporter';
    const baseline = resolveDamage(
      mockCombatant({ atk: 100 }),
      healSupporter,
      baseEffect,
      {},
    );
    const withPassive = resolveDamage(attacker, healSupporter, baseEffect, p3Passives, {
      gameData,
    });
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
    const rangedTarget = enemyWithBasic('at_ranger_basic_attack', 30);
    const meleeTarget = enemyWithBasic('at_swordsman_basic_attack', 300);

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(
      shouldTriggerBonusBasicAttackOnHit(actor, rangedTarget, p4Passives, gameData),
    ).toBe(true);
    expect(
      shouldTriggerBonusBasicAttackOnHit(actor, meleeTarget, p4Passives, gameData),
    ).toBe(false);
    successSpy.mockRestore();
  });

  it('P4 does not trigger on heal-only supporter enemies', () => {
    vi.restoreAllMocks();
    const actor = mockCombatant({
      build: {
        learnedPassiveIds: ['at_ranger_passive_4'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const healSupporter = enemyWithBasic('sp_cleric_mod_single_mend', 110);
    healSupporter.role = 'supporter';

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(
      shouldTriggerBonusBasicAttackOnHit(actor, healSupporter, p4Passives, gameData),
    ).toBe(false);
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
    const fullHpRanged = enemyWithBasic('at_ranger_basic_attack', 30);

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(
      shouldTriggerBonusBasicAttackOnHit(actor, fullHpRanged, p4Passives, gameData),
    ).toBe(true);
    successSpy.mockRestore();
  });
});
