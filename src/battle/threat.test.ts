import { describe, expect, it } from 'vitest';
import type { CombatantState } from './types.ts';
import {
  THREAT_DAMAGE_SCALE,
  THREAT_DAMAGE_SCALE_ATTACKER_DEALT,
  THREAT_TARGET_WEIGHT_EXPONENT,
  applyThreatFromDamage,
  applyThreatFromDebuffApply,
  computeAllyBaseThreat,
  initializeAllyThreat,
  pickThreatWeightedAlly,
  tickAllyThreatDecay,
} from './threat.ts';

function threatPickShare(
  allies: CombatantState[],
  targetId: string,
): number {
  const weights = allies.map((ally) =>
    Math.pow(Math.max(ally.threat ?? 1, 1), THREAT_TARGET_WEIGHT_EXPONENT),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const index = allies.findIndex((ally) => ally.id === targetId);
  return weights[index]! / total;
}

function mockAlly(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    reg: 0,
    isAlive: true,
    role: 'defender',
    classId: 'test',
    formationRow: 'front',
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 200,
    visualX: 200,
    corpseVisible: true,
    ...overrides,
  };
}

describe('threat', () => {
  it('computes base threat from stats only', () => {
    const tank = mockAlly({
      id: 'tank',
      maxHp: 200,
      def: 20,
    });
    const base = computeAllyBaseThreat(tank, [tank]);
    expect(base).toBe(Math.floor(200 * 0.1 + 20 * 2));
  });

  it('adds front-row pressure when another front ally is damaged', () => {
    const guard = mockAlly({
      id: 'guard',
      formationRow: 'front',
      maxHp: 200,
      def: 20,
      hp: 100,
    });
    const warrior = mockAlly({
      id: 'warrior',
      formationRow: 'front',
      maxHp: 180,
      def: 15,
      hp: 180,
    });
    const warriorBaseAlone = computeAllyBaseThreat(warrior, [warrior]);
    const warriorBaseWithPressure = computeAllyBaseThreat(
      warrior,
      [guard, warrior],
    );
    expect(warriorBaseWithPressure).toBeGreaterThan(warriorBaseAlone);
  });

  it('pickThreatWeightedAlly strongly favors higher threat (power-5 weights)', () => {
    const tank = mockAlly({ id: 'tank', threat: 150, baseThreat: 150 });
    const healer = mockAlly({ id: 'healer', threat: 50, baseThreat: 50 });
    expect(pickThreatWeightedAlly([tank, healer], () => 0.89)?.id).toBe('tank');
    expect(pickThreatWeightedAlly([tank, healer], () => 0.998)?.id).toBe(
      'healer',
    );
  });

  it('applyThreatFromDamage increases ally threat on deal and take', () => {
    const ally = mockAlly({ id: 'ally', threat: 50, baseThreat: 50 });
    const enemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      threat: undefined,
      baseThreat: undefined,
    });
    applyThreatFromDamage(ally, enemy, 40);
    expect(ally.threat).toBe(50 + Math.floor(40 * THREAT_DAMAGE_SCALE));
    applyThreatFromDamage(enemy, ally, 40);
    expect(ally.threat).toBe(
      50 + Math.floor(40 * THREAT_DAMAGE_SCALE) * 2,
    );
  });

  it('applyThreatFromDamage uses lower scale when attacker deals damage', () => {
    const attacker = mockAlly({
      id: 'swordsman',
      role: 'attacker',
      threat: 44,
      baseThreat: 44,
    });
    const enemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      threat: undefined,
      baseThreat: undefined,
    });
    applyThreatFromDamage(attacker, enemy, 63);
    expect(attacker.threat).toBe(
      44 + Math.floor(63 * THREAT_DAMAGE_SCALE_ATTACKER_DEALT),
    );
  });

  it('applyThreatFromDebuffApply adds fixed debuff threat', () => {
    const duelist = mockAlly({
      id: 'duelist',
      threat: 30,
      baseThreat: 30,
    });
    applyThreatFromDebuffApply(duelist);
    expect(duelist.threat).toBe(45);
  });

  it('tickAllyThreatDecay moves threat toward baseThreat', () => {
    const ally = mockAlly({ id: 'ally', threat: 200, baseThreat: 80 });
    tickAllyThreatDecay(ally, 1);
    expect(ally.threat).toBe(180);
  });

  it('initialize sets threat equal to baseThreat', () => {
    const allies = [
      mockAlly({ id: 'a', maxHp: 100, def: 5 }),
      mockAlly({ id: 'b', maxHp: 80, def: 5, formationRow: 'back' }),
    ];
    initializeAllyThreat(allies);
    expect(allies[0]!.threat).toBe(allies[0]!.baseThreat);
    expect(allies[1]!.threat).toBe(allies[1]!.baseThreat);
  });

  it('demo party start concentrates enemy hits on guardian', () => {
    const allies = [
      mockAlly({
        id: 'guardian',
        maxHp: 235,
        def: 26,
        hp: 235,
        formationRow: 'front',
      }),
      mockAlly({
        id: 'swordsman',
        role: 'attacker',
        maxHp: 165,
        def: 14,
        hp: 165,
        formationRow: 'front',
      }),
      mockAlly({
        id: 'cleric',
        role: 'supporter',
        maxHp: 105,
        def: 11,
        hp: 105,
        formationRow: 'back',
      }),
      mockAlly({
        id: 'ranger',
        role: 'attacker',
        maxHp: 92,
        def: 6,
        hp: 92,
        formationRow: 'back',
      }),
    ];
    initializeAllyThreat(allies);
    expect(threatPickShare(allies, 'guardian')).toBeGreaterThan(0.85);
    expect(threatPickShare(allies, 'swordsman')).toBeLessThan(0.1);
    expect(threatPickShare(allies, 'ranger')).toBeLessThan(0.05);
  });

  it('guardian keeps top threat after swordsman burst damage', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
      hp: 235,
      formationRow: 'front',
    });
    const swordsman = mockAlly({
      id: 'swordsman',
      role: 'attacker',
      maxHp: 165,
      def: 14,
      hp: 165,
      formationRow: 'front',
    });
    const allies = [guardian, swordsman];
    initializeAllyThreat(allies);
    const enemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      threat: undefined,
      baseThreat: undefined,
    });
    applyThreatFromDamage(swordsman, enemy, 63);
    expect(guardian.threat!).toBeGreaterThan(swordsman.threat!);
  });
});
