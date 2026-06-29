import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { syncDamageReductionAuras } from './passiveEffects.ts';
import { resolveEnemyChaseTargetPlayer } from './resolveApproachBattleX.ts';
import { mockApproachGameData } from './testFixtures.ts';
import {
  THREAT_DAMAGE_SCALE,
  THREAT_TARGET_SWITCH_MARGIN,
  applyThreatBurst,
  applyThreatFromDamage,
  applyThreatControlOnDamageTaken,
  initializeAllyThreat,
  pickHighestThreatAlly,
  pickThreatTargetWithHysteresis,
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
  id: 'test_threat_control',
  name: 'Test Threat',
  effect: 'threatControl',
  onDamageTakenScale: 0.5,
  onBlockFlat: 5,
  threatDecayMultiplier: 0.5,
};

const paladinDamageReductionAura: PassiveSkillDef = {
  id: 'df_paladin_passive_2',
  name: '護法陣',
  effect: 'damageReduction',
  damageReductionPercent: 0.1,
  damageReductionTargetShape: 'aoe',
  damageReductionAoeRadiusPx: 50,
  damageReductionTargetRule: {
    kind: 'distance',
    side: 'ally',
    order: 'selfOrigin',
  },
};

const passivesRegistry: Record<string, PassiveSkillDef> = {
  df_paladin_passive_2: paladinDamageReductionAura,
  test_threat_control: guardianThreatControl,
};

describe('threat phase 2', () => {
  it('warrior light hit does not overtake guardian threat', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      maxHp: 165,
      def: 14,
    });
    initializeAllyThreat([guardian, warrior]);
    const enemy = mockAlly({ id: 'enemy', isEnemy: true });
    applyThreatFromDamage(warrior, enemy, 63);
    expect(warrior.threat!).toBeLessThan(guardian.threat!);
    expect(pickHighestThreatAlly([guardian, warrior])?.id).toBe('guardian');
  });

  it('warrior burst skill overtakes guardian threat', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      maxHp: 165,
      def: 14,
      atk: 30,
    });
    initializeAllyThreat([guardian, warrior]);
    const enemy = mockAlly({ id: 'enemy', isEnemy: true });
    const burstDamage = 54;
    applyThreatFromDamage(warrior, enemy, burstDamage);
    applyThreatBurst(warrior, burstDamage, { threatBurstScale: 1.25 });
    expect(warrior.threat!).toBeGreaterThan(guardian.threat!);
    expect(pickHighestThreatAlly([guardian, warrior])?.id).toBe('warrior');
  });

  it('enemy chase picks defender over nearer attacker (not threat hysteresis)', () => {
    const paladin = mockAlly({
      id: 'paladin',
      threat: 100,
      baseThreat: 100,
      battleX: 200,
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      threat: 110,
      baseThreat: 48,
      battleX: 220,
    });
    const meleeEnemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      battleX: 280,
      threatFocusTargetId: 'paladin',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });
    const gameData = mockApproachGameData();
    const target = resolveEnemyChaseTargetPlayer(
      meleeEnemy,
      [paladin, warrior],
      [meleeEnemy],
      gameData,
    );
    expect(target?.id).toBe('paladin');
  });

  it('護法陣 applies damageTaken reduction aura to allies within 50px', () => {
    const paladin = mockAlly({
      id: 'paladin',
      battleX: 200,
      build: {
        learnedPassiveIds: ['df_paladin_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const nearAlly = mockAlly({
      id: 'near',
      role: 'attacker',
      formationRow: 'front',
      battleX: 230,
    });
    const farAlly = mockAlly({
      id: 'far',
      role: 'attacker',
      formationRow: 'front',
      battleX: 100,
    });
    const gameData = mockApproachGameData();
    syncDamageReductionAuras(
      [paladin, nearAlly, farAlly],
      [],
      passivesRegistry,
      gameData,
    );
    const nearMul = nearAlly.statusEffects.find((fx) => fx.stat === 'damageTaken')
      ?.multiplier;
    const farMul = farAlly.statusEffects.find((fx) => fx.stat === 'damageTaken')
      ?.multiplier;
    const selfMul = paladin.statusEffects.find((fx) => fx.stat === 'damageTaken')
      ?.multiplier;
    expect(nearMul).toBe(0.9);
    expect(selfMul).toBe(0.9);
    expect(farMul).toBeUndefined();
  });

  it('duelist does not become main tank from being hit alone', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
    });
    const duelist = mockAlly({
      id: 'duelist',
      maxHp: 190,
      def: 18,
    });
    initializeAllyThreat([guardian, duelist]);
    const enemy = mockAlly({ id: 'enemy', isEnemy: true });
    applyThreatFromDamage(enemy, duelist, 80);
    applyThreatControlOnDamageTaken(duelist, 80, []);
    expect(duelist.threat).toBe(duelist.baseThreat);
    expect(pickHighestThreatAlly([guardian, duelist])?.id).toBe('guardian');
  });

  it('duelist stays below guardian after light damage dealt', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
    });
    const duelist = mockAlly({
      id: 'duelist',
      maxHp: 190,
      def: 18,
    });
    initializeAllyThreat([guardian, duelist]);
    const enemy = mockAlly({ id: 'enemy', isEnemy: true });
    applyThreatFromDamage(duelist, enemy, 30);
    expect(duelist.threat!).toBeLessThan(guardian.threat!);
  });

  it('enemy retarget hysteresis still blocks small threat lead changes', () => {
    const tank = mockAlly({ id: 'tank', threat: 150, baseThreat: 150 });
    const striker = mockAlly({
      id: 'striker',
      threat: 150 + THREAT_TARGET_SWITCH_MARGIN - 10,
      baseThreat: 150,
    });
    const result = pickThreatTargetWithHysteresis(
      [tank, striker],
      'tank',
    );
    expect(result.target?.id).toBe('tank');
  });

  it('threatControl on damage taken still sustains main tank role when configured', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
      threat: 92,
      baseThreat: 92,
      build: {
        learnedPassiveIds: ['test_threat_control'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      maxHp: 165,
      def: 14,
      threat: 75,
      baseThreat: 48,
    });
    applyThreatControlOnDamageTaken(guardian, 40, [guardianThreatControl]);
    expect(guardian.threat).toBe(92 + Math.floor(40 * 0.5));
    expect(guardian.threat!).toBeGreaterThan(warrior.threat!);
  });

  it('warrior basic attack threat uses only deal scale without burst', () => {
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      threat: 48,
      baseThreat: 48,
    });
    const enemy = mockAlly({ id: 'enemy', isEnemy: true });
    applyThreatFromDamage(warrior, enemy, 30);
    applyThreatBurst(warrior, 30, {});
    expect(warrior.threat).toBe(48 + Math.floor(30 * THREAT_DAMAGE_SCALE));
  });
});
