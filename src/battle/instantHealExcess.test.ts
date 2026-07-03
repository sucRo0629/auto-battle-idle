import { describe, expect, it } from 'vitest';
import {
  applyDirectHealWithExcess,
  resolveExcessHealRedirectTarget,
  resolveRedirectHealAmount,
} from './instantHealExcess.ts';
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
    res: partial.res ?? 0,
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

describe('resolveExcessHealRedirectTarget', () => {
  it('picks the ally with the lowest HP ratio excluding primary', () => {
    const primary = unit({ id: 'primary', hp: 90, maxHp: 100 });
    const low = unit({ id: 'low', hp: 20, maxHp: 100 });
    const mid = unit({ id: 'mid', hp: 50, maxHp: 100 });
    expect(
      resolveExcessHealRedirectTarget(primary, [primary, low, mid])?.id,
    ).toBe('low');
  });

  it('breaks HP ratio ties by lower maxHp', () => {
    const primary = unit({ id: 'primary', hp: 90, maxHp: 100 });
    const small = unit({ id: 'small', hp: 50, maxHp: 100 });
    const large = unit({ id: 'large', hp: 100, maxHp: 200 });
    expect(
      resolveExcessHealRedirectTarget(primary, [primary, small, large])?.id,
    ).toBe('small');
  });

  it('keeps pool order when HP ratio and maxHp tie', () => {
    const primary = unit({ id: 'primary', hp: 90, maxHp: 100 });
    const first = unit({ id: 'first', hp: 50, maxHp: 100 });
    const second = unit({ id: 'second', hp: 50, maxHp: 100 });
    expect(
      resolveExcessHealRedirectTarget(primary, [primary, first, second])?.id,
    ).toBe('first');
  });
});

describe('excessHealRedirect pipeline', () => {
  const redirectPassive: PassiveSkillDef = {
    id: 'redirect',
    name: 'redirect',
    effect: 'excessHealRedirect',
    redirectScale: 0.5,
    excessHealSources: ['outgoing'],
  };
  const barrierPassive: PassiveSkillDef = {
    id: 'barrier',
    name: 'barrier',
    effect: 'excessHealToBarrier',
    barrierScale: 0.8,
    excessHealSources: ['outgoing'],
  };

  it('redirects a fraction of overheal to the next-lowest-HP ally', () => {
    const passives = { redirect: redirectPassive };
    const healer = withPassives(unit({ id: 'healer' }), ['redirect']);
    const primary = unit({ id: 'primary', hp: 90, maxHp: 100 });
    const ally = unit({ id: 'ally', hp: 40, maxHp: 100 });
    const result = applyDirectHealWithExcess(
      healer,
      primary,
      30,
      [healer, primary, ally],
      passives,
    );
    expect(result.healed).toBe(10);
    expect(result.redirectTarget?.id).toBe('ally');
    expect(result.redirectAmount).toBe(10);
    expect(result.redirectHealed).toBe(10);
    expect(ally.hp).toBe(50);
  });

  it('applies passive_1 specialEffect multiplier on redirect heal only', () => {
    const specialPassive: PassiveSkillDef = {
      id: 'special',
      name: 'special',
      effect: 'specialEffect',
      specialEffectApplyTo: 'heal',
      specialEffect: {
        scale: 1.25,
        conditions: [{ kind: 'targetHp', maxHpRatio: 0.5 }],
      },
    };
    const passives = { redirect: redirectPassive, special: specialPassive };
    const healer = withPassives(unit({ id: 'healer' }), ['redirect', 'special']);
    const redirectTarget = unit({ id: 'ally', hp: 40, maxHp: 100 });
    const amount = resolveRedirectHealAmount(
      healer,
      redirectTarget,
      20,
      passives,
    );
    expect(amount).toBe(Math.floor(20 * 1.25));
  });

  it('sends remaining excess to barrier after redirect', () => {
    const passives = {
      redirect: redirectPassive,
      barrier: barrierPassive,
    };
    const healer = withPassives(unit({ id: 'healer' }), ['redirect', 'barrier']);
    const primary = unit({ id: 'primary', hp: 80, maxHp: 100, barrierHp: 0 });
    const ally = unit({ id: 'ally', hp: 50, maxHp: 100 });
    const result = applyDirectHealWithExcess(
      healer,
      primary,
      50,
      [healer, primary, ally],
      passives,
    );
    expect(result.healed).toBe(20);
    expect(result.redirectAmount).toBe(15);
    expect(result.outgoingBarrierGranted).toBe(Math.floor(15 * 0.8));
    expect(primary.barrierHp).toBe(Math.floor(15 * 0.8));
  });

  it('does not redirect when allowRedirect is false', () => {
    const passives = { redirect: redirectPassive };
    const healer = withPassives(unit({ id: 'healer' }), ['redirect']);
    const primary = unit({ id: 'primary', hp: 90, maxHp: 100 });
    const ally = unit({ id: 'ally', hp: 40, maxHp: 100 });
    const result = applyDirectHealWithExcess(
      healer,
      primary,
      30,
      [healer, primary, ally],
      passives,
      { allowRedirect: false },
    );
    expect(result.redirectAmount).toBe(0);
    expect(ally.hp).toBe(40);
  });
});
