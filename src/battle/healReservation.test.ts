import { describe, expect, it } from 'vitest';
import {
  grantHealReservationStacks,
  tryTriggerHealReservation,
} from './healReservation.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

function unit(partial: Partial<CombatantState> & Pick<CombatantState, 'id'>): CombatantState {
  return {
    id: partial.id,
    classId: partial.classId ?? 'test',
    name: partial.name ?? partial.id,
    isEnemy: partial.isEnemy ?? false,
    isAlive: partial.isAlive ?? true,
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    barrierHp: partial.barrierHp ?? 0,
    atk: partial.atk ?? 100,
    def: partial.def ?? 50,
    reg: partial.reg ?? 0,
    battleX: partial.battleX ?? 0,
    role: partial.role ?? 'supporter',
    formationRow: partial.formationRow ?? 'back',
    traits: partial.traits ?? {
      rangePx: 128,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
    },
    build: partial.build ?? {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    statusEffects: partial.statusEffects ?? [],
    cooldowns: partial.cooldowns ?? [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
  };
}

function withPassives(
  combatant: CombatantState,
  passiveIds: string[],
): CombatantState {
  return {
    ...combatant,
    build: {
      ...combatant.build,
      learnedPassiveIds: passiveIds,
    },
  };
}

describe('healReservation', () => {
  const passive: PassiveSkillDef = {
    id: 'reservation_passive',
    name: 'reservation',
    effect: 'healReservation',
    grantOnHealMaxHpRatio: 0.6,
    stackDurationSec: 8,
    triggerHpRatio: 0.35,
    buffDisplayName: '癒しの残響',
    healAmount: { kind: 'flat', flatAmount: 40 },
  };
  const passives = { reservation_passive: passive };

  it('grants a stack when healing a low-HP ally', () => {
    const healer = withPassives(unit({ id: 'cleric' }), ['reservation_passive']);
    const target = unit({ id: 'ally', hp: 50, maxHp: 100 });
    grantHealReservationStacks(healer, target, 0.5, passives);
    const stack = target.statusEffects.find((e) => e.overlay === 'healReservation');
    expect(stack).toBeDefined();
    expect(stack?.displayName).toBe('癒しの残響');
  });

  it('does not grant when pre-heal HP ratio is above threshold', () => {
    const healer = withPassives(unit({ id: 'cleric' }), ['reservation_passive']);
    const target = unit({ id: 'ally', hp: 80, maxHp: 100 });
    grantHealReservationStacks(healer, target, 0.8, passives);
    expect(target.statusEffects.some((e) => e.overlay === 'healReservation')).toBe(false);
  });

  it('consumes one stack and heals when HP drops below trigger threshold', () => {
    const healer = withPassives(unit({ id: 'cleric' }), ['reservation_passive']);
    const target = unit({
      id: 'ally',
      hp: 30,
      maxHp: 100,
      statusEffects: [
        {
          id: 'stack_1',
          kind: 'buff',
          overlay: 'healReservation',
          multiplier: 1,
          durationSec: 8,
          remainingSec: 8,
          sourceId: 'cleric',
          skillId: 'reservation_passive',
          amount: { kind: 'flat', flatAmount: 40 },
        },
      ],
    });
    const result = tryTriggerHealReservation(target, [healer, target], passives);
    expect(result.healed).toBe(40);
    expect(target.hp).toBe(70);
    expect(target.statusEffects.some((e) => e.overlay === 'healReservation')).toBe(false);
  });

  it('does not trigger when HP remains above trigger threshold', () => {
    const healer = withPassives(unit({ id: 'cleric' }), ['reservation_passive']);
    const target = unit({
      id: 'ally',
      hp: 50,
      maxHp: 100,
      statusEffects: [
        {
          id: 'stack_1',
          kind: 'buff',
          overlay: 'healReservation',
          multiplier: 1,
          durationSec: 8,
          remainingSec: 8,
          sourceId: 'cleric',
          skillId: 'reservation_passive',
          amount: { kind: 'flat', flatAmount: 40 },
        },
      ],
    });
    const result = tryTriggerHealReservation(target, [healer, target], passives);
    expect(result.healed).toBe(0);
    expect(target.hp).toBe(50);
  });
});
