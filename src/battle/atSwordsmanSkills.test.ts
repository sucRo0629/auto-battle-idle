import { describe, expect, it, vi } from 'vitest';
import { resolveDamage } from './combatMath.ts';
import { applyIncomingDamage } from './damageDelay.ts';
import { applyBlockToPhysicalDamage } from './blockMitigation.ts';
import { applyWardBarrierToIncomingDamage } from './wardBarrier.ts';
import { mockCombatant } from './testFixtures.ts';
import type { PassiveSkillDef } from './types.ts';

describe('at_swordsman combat mechanics', () => {
  const attacker = mockCombatant({
    atk: 100,
    build: {
      learnedPassiveIds: ['at_swordsman_passive_4'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
  });
  const highDefTarget = mockCombatant({ def: 80, isEnemy: true });
  const lowDefTarget = mockCombatant({ def: 5, isEnemy: true });
  const passives: Record<string, PassiveSkillDef> = {
    at_swordsman_passive_4: {
      id: 'at_swordsman_passive_4',
      name: '剛剣の冴え',
      effect: 'ignoredDefBonusDamage',
      ignoredDefBonusScale: 0.5,
    },
  };
  const baseEffect = {
    type: 'damage' as const,
    target: { kind: 'distance' as const, side: 'enemy' as const, order: 'nearest' as const },
    damageType: 'physical' as const,
    amount: { kind: 'flat' as const, flatAmount: 100 },
  };

  it('P4 adds ignoredDef bonus on high DEF targets', () => {
    const withoutBonus = resolveDamage(attacker, highDefTarget, baseEffect, {}, {
      effectDefenseIgnore: { def: { mode: 'percent', amount: 0.5 } },
    });
    const withBonus = resolveDamage(attacker, highDefTarget, baseEffect, passives, {
      effectDefenseIgnore: { def: { mode: 'percent', amount: 0.5 } },
    });
    expect(withBonus).toBeGreaterThan(withoutBonus);
    expect(withBonus - withoutBonus).toBe(20);
  });

  it('P4 bonus is near zero on low DEF targets', () => {
    const withoutBonus = resolveDamage(attacker, lowDefTarget, baseEffect, {});
    const withBonus = resolveDamage(attacker, lowDefTarget, baseEffect, passives);
    expect(withBonus - withoutBonus).toBeLessThanOrEqual(3);
  });

  it('P3 applies 100% DEF ignore only when chance roll succeeds', () => {
    vi.restoreAllMocks();
    const p3Passives: Record<string, PassiveSkillDef> = {
      at_swordsman_passive_3: {
        id: 'at_swordsman_passive_3',
        name: '穿甲の一撃',
        effect: 'defenseIgnore',
        defenseIgnore: {
          def: { mode: 'percent', amount: 1 },
          chance: 0.15,
        },
      },
    };
    const warrior = mockCombatant({
      atk: 100,
      build: {
        learnedPassiveIds: ['at_swordsman_passive_3'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const failSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const failed = resolveDamage(warrior, highDefTarget, baseEffect, p3Passives);
    failSpy.mockRestore();

    const successSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const succeeded = resolveDamage(warrior, highDefTarget, baseEffect, p3Passives);
    successSpy.mockRestore();

    expect(succeeded).toBeGreaterThan(failed);
  });

  it('ignoreDamageTakenReduction skips DR in resolveDamage', () => {
    const drTarget = mockCombatant({
      def: 0,
      isEnemy: true,
      statusEffects: [
        {
          id: 'dr',
          kind: 'buff',
          stat: 'damageTaken',
          multiplier: 0.5,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const normal = resolveDamage(attacker, drTarget, baseEffect, {});
    const ignored = resolveDamage(attacker, drTarget, baseEffect, {}, {
      ignoreDamageTakenReduction: true,
    });
    expect(ignored).toBeGreaterThan(normal);
  });

  it('pierce flags skip ward, block, and barrier layers', () => {
    const wardTarget = mockCombatant({
      def: 0,
      isEnemy: true,
      statusEffects: [
        {
          id: 'ward',
          kind: 'buff',
          overlay: 'wardBarrier',
          stacks: 2,
          damageReductionRatio: 0.1,
          durationSec: 999,
          remainingSec: 999,
        },
        {
          id: 'block',
          kind: 'buff',
          overlay: 'block',
          blockChance: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const afterDr = resolveDamage(attacker, wardTarget, baseEffect, {}, {
      ignoreDamageTakenReduction: true,
    });
    const blocked = applyBlockToPhysicalDamage(wardTarget, afterDr, {});
    const warded = applyWardBarrierToIncomingDamage(wardTarget, blocked.finalDamage);
    expect(warded.damage).toBeLessThan(afterDr);

    const directTarget = mockCombatant({
      def: 0,
      isEnemy: true,
      barrierHp: 50,
      hp: 100,
      maxHp: 100,
    });
    const direct = applyIncomingDamage(directTarget, afterDr, { skipBarrier: true });
    expect(direct.damageResult.hpDamage).toBe(afterDr);
    expect(directTarget.barrierHp).toBe(50);
  });
});
