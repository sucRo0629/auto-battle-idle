import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import {
  THREAT_BASE_DEFENDER_MULTIPLIER,
  THREAT_DAMAGE_SCALE,
  THREAT_TARGET_SWITCH_MARGIN,
  applyThreatControlOnBlock,
  applyThreatControlOnDamageTaken,
  applyThreatFromDamage,
  applyThreatFromDebuffApply,
  computeAllyBaseThreat,
  initializeAllyThreat,
  pickHighestThreatAlly,
  pickThreatTargetWithHysteresis,
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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
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
    corpseVisible: true,
    ...overrides,
  };
}

const guardianThreatControl: PassiveSkillDef = {
  id: 'df_guardian_passive_2',
  name: '鉄壁の挑発',
  effect: 'threatControl',
  onDamageTakenScale: 0.5,
  onBlockFlat: 5,
  threatDecayMultiplier: 0.5,
};

describe('threat', () => {
  it('computes base threat from stats only', () => {
    const tank = mockAlly({
      id: 'tank',
      maxHp: 200,
      def: 20,
    });
    const base = computeAllyBaseThreat(tank, [tank]);
    const raw = Math.floor(200 * 0.1 + 20 * 2);
    expect(base).toBe(Math.floor(raw * THREAT_BASE_DEFENDER_MULTIPLIER));
  });

  it('does not apply defender base multiplier to non-defender roles', () => {
    const attacker = mockAlly({
      id: 'attacker',
      role: 'attacker',
      maxHp: 165,
      def: 14,
    });
    const base = computeAllyBaseThreat(attacker, [attacker]);
    expect(base).toBe(Math.floor(165 * 0.1 + 14 * 2));
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

  it('pickHighestThreatAlly selects max threat', () => {
    const tank = mockAlly({ id: 'tank', threat: 150, baseThreat: 150 });
    const healer = mockAlly({ id: 'healer', threat: 50, baseThreat: 50 });
    expect(pickHighestThreatAlly([tank, healer])?.id).toBe('tank');
    expect(pickHighestThreatAlly([healer, tank])?.id).toBe('tank');
  });

  it('pickHighestThreatAlly breaks threat ties by frontline battleX then id', () => {
    const front = mockAlly({
      id: 'b-front',
      threat: 100,
      baseThreat: 100,
      battleX: 220,
    });
    const back = mockAlly({
      id: 'a-back',
      threat: 100,
      baseThreat: 100,
      battleX: 180,
    });
    expect(pickHighestThreatAlly([back, front])?.id).toBe('b-front');
    const left = mockAlly({
      id: 'a-left',
      threat: 100,
      baseThreat: 100,
      battleX: 220,
    });
    const right = mockAlly({
      id: 'b-right',
      threat: 100,
      baseThreat: 100,
      battleX: 220,
    });
    expect(pickHighestThreatAlly([right, left])?.id).toBe('a-left');
  });

  it('pickThreatTargetWithHysteresis keeps focus until margin exceeded', () => {
    const tank = mockAlly({ id: 'tank', threat: 150, baseThreat: 150 });
    const striker = mockAlly({ id: 'striker', threat: 180, baseThreat: 180 });
    const smallLead = pickThreatTargetWithHysteresis(
      [tank, striker],
      'tank',
    );
    expect(smallLead.target?.id).toBe('tank');

    striker.threat = 150 + THREAT_TARGET_SWITCH_MARGIN - 1;
    const belowMargin = pickThreatTargetWithHysteresis(
      [tank, striker],
      'tank',
    );
    expect(belowMargin.target?.id).toBe('tank');

    striker.threat = 150 + THREAT_TARGET_SWITCH_MARGIN;
    const atMargin = pickThreatTargetWithHysteresis(
      [tank, striker],
      'tank',
    );
    expect(atMargin.target?.id).toBe('striker');
  });

  it('applyThreatFromDamage increases ally threat on deal only', () => {
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
    expect(ally.threat).toBe(50 + Math.floor(40 * THREAT_DAMAGE_SCALE));
  });

  it('applyThreatFromDamage uses same scale when attacker deals damage', () => {
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
      44 + Math.floor(63 * THREAT_DAMAGE_SCALE),
    );
  });

  it('applyThreatControlOnDamageTaken adds threat only with passive', () => {
    const guardian = mockAlly({ id: 'guardian', threat: 90, baseThreat: 90 });
    const attacker = mockAlly({
      id: 'attacker',
      role: 'attacker',
      threat: 44,
      baseThreat: 44,
    });
    applyThreatControlOnDamageTaken(attacker, 40, []);
    expect(attacker.threat).toBe(44);
    applyThreatControlOnDamageTaken(guardian, 40, [guardianThreatControl]);
    expect(guardian.threat).toBe(
      90 + Math.floor(40 * 0.5),
    );
  });

  it('applyThreatControlOnBlock adds flat threat', () => {
    const guardian = mockAlly({ id: 'guardian', threat: 90, baseThreat: 90 });
    applyThreatControlOnBlock(guardian, [guardianThreatControl]);
    expect(guardian.threat).toBe(95);
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

  it('tickAllyThreatDecay respects threatDecayMultiplier', () => {
    const ally = mockAlly({ id: 'ally', threat: 200, baseThreat: 80 });
    tickAllyThreatDecay(ally, 1, 0.5);
    expect(ally.threat).toBe(190);
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

  it('demo party start targets guardian as highest threat', () => {
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
    expect(pickHighestThreatAlly(allies)?.id).toBe('guardian');
  });

  it('guardian keeps top threat after a light swordsman hit', () => {
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

  it('swordsman can overtake guardian threat after a strong burst', () => {
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
    initializeAllyThreat([guardian, swordsman]);
    const enemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      threat: undefined,
      baseThreat: undefined,
    });
    applyThreatFromDamage(swordsman, enemy, 100);
    expect(swordsman.threat!).toBeGreaterThan(guardian.threat!);
    expect(pickHighestThreatAlly([guardian, swordsman])?.id).toBe('swordsman');
  });

  it('attacker does not gain threat from being hit without threatControl', () => {
    const assassin = mockAlly({
      id: 'assassin',
      role: 'attacker',
      threat: 44,
      baseThreat: 44,
    });
    const enemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
    });
    applyThreatFromDamage(enemy, assassin, 80);
    applyThreatControlOnDamageTaken(assassin, 80, []);
    expect(assassin.threat).toBe(44);
  });
});
