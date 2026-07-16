import { describe, expect, it } from 'vitest';
import type { DamageAppliedEvent } from './damageAppliedEvent.ts';
import {
  DF_GUARDIAN_M2_COMBAT_MODULE_ID,
  IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT,
  tryIronGuardianM2SelfHeal,
} from './ironGuardianM2.ts';
import { mockCombatant } from './testFixtures.ts';

function makeEvent(
  partial: Partial<DamageAppliedEvent> = {},
): DamageAppliedEvent {
  return {
    attackerId: 'attacker',
    targetId: 'guardian',
    sourceKind: 'skillHit',
    attackKind: 'damage',
    hpDamage: 10,
    barrierDamage: 0,
    lethal: false,
    ...partial,
  };
}

function makeGuardian(overrides: Parameters<typeof mockCombatant>[0] = {}) {
  return mockCombatant({
    id: 'guardian',
    classId: 'df_guardian',
    hp: 40,
    maxHp: 100,
    isEnemy: false,
    cooldowns: [
      {
        skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    ...overrides,
  });
}

describe('ironGuardianM2 runtime (R12g-b2)', () => {
  it('triggers fixed self-heal on enemy attack hit with real hp damage', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, target);
    expect(result.triggered).toBe(true);
    expect(result.healed).toBe(IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT);
    expect(target.hp).toBe(40 + IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT);
  });

  it('also triggers for magic attack hits', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ attackMethod: 'ranged' }),
      attacker,
      target,
    );
    expect(result.triggered).toBe(true);
  });

  it('does not trigger on barrier-only hits', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 0, barrierDamage: 15 }),
      attacker,
      target,
    );
    expect(result.triggered).toBe(false);
    expect(target.hp).toBe(40);
  });

  it('does not trigger for dot / delayed / counter / derived', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const kinds: DamageAppliedEvent['sourceKind'][] = [
      'dotTick',
      'delayedPoolTick',
      'counter',
      'derived',
    ];
    for (const sourceKind of kinds) {
      const target = makeGuardian();
      const result = tryIronGuardianM2SelfHeal(
        makeEvent({ sourceKind }),
        attacker,
        target,
      );
      expect(result.triggered).toBe(false);
      expect(target.hp).toBe(40);
    }
  });

  it('does not trigger on self damage or non-adversary damage', () => {
    const self = makeGuardian({ isEnemy: false });
    const selfHit = tryIronGuardianM2SelfHeal(
      makeEvent({ attackerId: self.id, targetId: self.id }),
      self,
      self,
    );
    expect(selfHit.triggered).toBe(false);

    const sameSideAttacker = mockCombatant({ id: 'ally', isEnemy: false });
    const allyHit = tryIronGuardianM2SelfHeal(makeEvent(), sameSideAttacker, self);
    expect(allyHit.triggered).toBe(false);
  });

  it('does not trigger on lethal hit and does not rollback lethal', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 0, isAlive: false });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 50, lethal: true }),
      attacker,
      target,
    );
    expect(result.triggered).toBe(false);
    expect(target.hp).toBe(0);
    expect(target.isAlive).toBe(false);
  });

  it('follows event result for guts-like cases', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const prevented = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 0, lethal: false }),
      attacker,
      target,
    );
    expect(prevented.triggered).toBe(false);

    const nonLethal = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 5, lethal: false }),
      attacker,
      target,
    );
    expect(nonLethal.triggered).toBe(true);
  });

  it('triggers per hit on multi-hit and can exceed incoming damage', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 30 });
    const hit1 = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 1, hitIndex: 0 }),
      attacker,
      target,
    );
    const hit2 = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 1, hitIndex: 1 }),
      attacker,
      target,
    );
    expect(hit1.triggered).toBe(true);
    expect(hit2.triggered).toBe(true);
    expect(target.hp).toBe(30 + IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT * 2);
  });

  it('does not trigger when M1 is selected, triggers when M2 is selected', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const m1 = makeGuardian({
      cooldowns: [
        {
          skillId: 'df_guardian_mod_nearest_strike',
          remaining: 0,
          slotKind: 'basic',
        },
      ],
    });
    const m1Result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, m1);
    expect(m1Result.triggered).toBe(false);

    const m2 = makeGuardian();
    const m2Result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, m2);
    expect(m2Result.triggered).toBe(true);
  });

  it('does not trigger for non-guardian classes', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = mockCombatant({
      id: 'not_guardian',
      classId: 'at_swordsman',
      cooldowns: [
        {
          skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
          remaining: 0,
          slotKind: 'basic',
        },
      ],
    });
    const result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, target);
    expect(result.triggered).toBe(false);
  });

  it('works symmetrically for enemy-side guardian M2', () => {
    const attacker = mockCombatant({ id: 'player_attacker', isEnemy: false });
    const enemyGuardian = makeGuardian({ isEnemy: true, hp: 50 });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ attackerId: attacker.id, targetId: enemyGuardian.id }),
      attacker,
      enemyGuardian,
    );
    expect(result.triggered).toBe(true);
    expect(enemyGuardian.hp).toBe(
      50 + IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT,
    );
  });

  it('clamps at max hp and does not create barrier', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 95, barrierHp: 7 });
    const result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, target);
    expect(result.triggered).toBe(true);
    expect(result.healed).toBe(5);
    expect(target.hp).toBe(100);
    expect(target.barrierHp).toBe(7);
  });

  it('does not recurse or double trigger for one event', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 40 });
    const result = tryIronGuardianM2SelfHeal(makeEvent(), attacker, target);
    expect(result.triggered).toBe(true);
    expect(result.healed).toBe(IRON_GUARDIAN_M2_SELF_HEAL_FLAT_AMOUNT);
    expect(target.hp).toBe(60);
  });
});
