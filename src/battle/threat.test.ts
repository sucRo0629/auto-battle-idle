import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  applyThreatFromDamage,
  applyThreatFromDebuffApply,
  computeAllyBaseThreat,
  initializeAllyThreat,
  pickThreatWeightedAlly,
  refreshAlliesBaseThreat,
  tickAllyThreatDecay,
} from './threat.ts';

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
    traits: { attackRange: 'melee' },
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

const passives: Record<string, PassiveSkillDef> = {
  tank_bonus: {
    id: 'tank_bonus',
    name: 'Tank',
    effect: 'threatBonus',
    bonus: 50,
  },
  duelist_threat: {
    id: 'duelist_threat',
    name: 'Duelist',
    effect: 'threatOnDebuff',
    multiplier: 2,
  },
};

describe('threat', () => {
  it('computes base threat from stats and threatBonus passive', () => {
    const tank = mockAlly({
      id: 'tank',
      maxHp: 200,
      def: 20,
      build: {
        learnedPassiveIds: ['tank_bonus'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const base = computeAllyBaseThreat(tank, [tank], passives);
    expect(base).toBe(Math.floor(200 * 0.1 + 20 * 2) + 50);
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
    const warriorBaseAlone = computeAllyBaseThreat(warrior, [warrior], passives);
    const warriorBaseWithPressure = computeAllyBaseThreat(
      warrior,
      [guard, warrior],
      passives,
    );
    expect(warriorBaseWithPressure).toBeGreaterThan(warriorBaseAlone);
  });

  it('pickThreatWeightedAlly strongly favors higher threat (squared weights)', () => {
    const tank = mockAlly({ id: 'tank', threat: 150, baseThreat: 150 });
    const healer = mockAlly({ id: 'healer', threat: 50, baseThreat: 50 });
    expect(pickThreatWeightedAlly([tank, healer], () => 0.89)?.id).toBe('tank');
    expect(pickThreatWeightedAlly([tank, healer], () => 0.99)?.id).toBe('healer');
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
    expect(ally.threat).toBe(50 + Math.floor(40 * 0.5));
    applyThreatFromDamage(enemy, ally, 40);
    expect(ally.threat).toBe(50 + Math.floor(40 * 0.5) * 2);
  });

  it('applyThreatFromDebuffApply respects threatOnDebuff multiplier', () => {
    const duelist = mockAlly({
      id: 'duelist',
      threat: 30,
      baseThreat: 30,
      build: {
        learnedPassiveIds: ['duelist_threat'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    applyThreatFromDebuffApply(duelist, passives);
    expect(duelist.threat).toBe(30 + 15 * 2);
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
    initializeAllyThreat(allies, passives);
    expect(allies[0]!.threat).toBe(allies[0]!.baseThreat);
    expect(allies[1]!.threat).toBe(allies[1]!.baseThreat);
  });
});
