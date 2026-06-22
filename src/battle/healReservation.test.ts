import { describe, expect, it } from 'vitest';
import {
  grantHealReservationStacks,
  tryTriggerHealReservation,
} from './healReservation.ts';
import {
  resolveOutgoingHealSpecialMultiplier,
  resolveTargetHpRatioHealScaleMultiplier,
} from './passiveEffects.ts';
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
    threat: partial.threat ?? 0,
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

describe('targetHpRatioHealScale', () => {
  const passive: PassiveSkillDef = {
    id: 'scale_passive',
    name: 'scale',
    effect: 'targetHpRatioHealScale',
    healScaleMax: 1.2,
    maxScaleAtHpRatio: 0.5,
  };
  const passives = { scale_passive: passive };

  it('returns 1 at full HP', () => {
    const healer = withPassives(unit({ id: 'h' }), ['scale_passive']);
    const target = unit({ id: 't', hp: 100, maxHp: 100 });
    expect(resolveTargetHpRatioHealScaleMultiplier(healer, target, passives)).toBe(1);
  });

  it('ramps toward healScaleMax as target HP drops', () => {
    const healer = withPassives(unit({ id: 'h' }), ['scale_passive']);
    const target = unit({ id: 't', hp: 75, maxHp: 100 });
    const mul = resolveTargetHpRatioHealScaleMultiplier(healer, target, passives);
    expect(mul).toBeCloseTo(1.1, 5);
  });

  it('reaches healScaleMax when target HP is at or below maxScaleAtHpRatio', () => {
    const healer = withPassives(unit({ id: 'h' }), ['scale_passive']);
    const target = unit({ id: 't', hp: 25, maxHp: 100 });
    const mul = resolveTargetHpRatioHealScaleMultiplier(healer, target, passives);
    expect(mul).toBeCloseTo(1.2, 5);
  });

  it('stacks with specialEffect in outgoing heal multiplier', () => {
    const specialPassive: PassiveSkillDef = {
      id: 'special',
      name: 'special',
      effect: 'specialEffect',
      specialEffectApplyTo: 'heal',
      specialEffect: { scale: 1.5, conditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }] },
    };
    const registry = { scale_passive: passive, special: specialPassive };
    const healer = withPassives(unit({ id: 'h' }), ['scale_passive', 'special']);
    const target = unit({ id: 't', hp: 25, maxHp: 100 });
    const mul = resolveOutgoingHealSpecialMultiplier(healer, target, registry);
    expect(mul).toBeCloseTo(1.5 * 1.2, 5);
  });
});

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
