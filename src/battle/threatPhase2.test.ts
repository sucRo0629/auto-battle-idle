import { describe, expect, it } from 'vitest';
import type { CombatantState, PassiveSkillDef } from './types.ts';
import { syncFrontThreatControlAuras } from './passiveEffects.ts';
import {
  THREAT_DAMAGE_SCALE,
  THREAT_TARGET_SWITCH_MARGIN,
  applyFrontThreatFloor,
  applyThreatBurst,
  applyThreatFromDamage,
  applyThreatControlOnDamageTaken,
  computeAllyBaseThreat,
  initializeAllyThreat,
  pickHighestThreatAlly,
  pickThreatTargetWithHysteresis,
  resolveAllyThreatDecayMultiplier,
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

const paladinFrontSharing: PassiveSkillDef = {
  id: 'df_paladin_passive_2',
  name: '護法陣',
  effect: 'threatControl',
  frontThreatFloor: 0.72,
  frontThreatDecayMultiplier: 0.65,
};

const passivesRegistry: Record<string, PassiveSkillDef> = {
  df_guardian_passive_2: guardianThreatControl,
  df_paladin_passive_2: paladinFrontSharing,
};

describe('threat phase 2', () => {
  it('warrior light hit does not overtake guardian threat', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
      build: {
        learnedPassiveIds: ['df_guardian_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
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

  it('paladin raises front warrior threat floor toward shared tank level', () => {
    const paladin = mockAlly({
      id: 'paladin',
      maxHp: 220,
      def: 22,
      build: {
        learnedPassiveIds: ['df_paladin_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      maxHp: 165,
      def: 14,
      formationRow: 'front',
    });
    initializeAllyThreat([paladin, warrior]);
    warrior.threat = warrior.baseThreat;
    applyFrontThreatFloor([paladin, warrior], passivesRegistry);
    const expectedFloor = Math.floor(
      (paladin.threat ?? paladin.baseThreat ?? 0) * 0.72,
    );
    expect(warrior.threat).toBe(expectedFloor);
    expect(warrior.threat!).toBeGreaterThan(warrior.baseThreat!);
  });

  it('paladin front sharing slows front ally threat decay', () => {
    const paladin = mockAlly({
      id: 'paladin',
      build: {
        learnedPassiveIds: ['df_paladin_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'front',
      threat: 200,
      baseThreat: 48,
    });
    const decayMul = resolveAllyThreatDecayMultiplier(
      warrior,
      [paladin, warrior],
      passivesRegistry,
      [],
    );
    expect(decayMul).toBe(0.65);
    tickAllyThreatDecay(warrior, 1, decayMul);
    expect(warrior.threat).toBe(187);
  });

  it('護法陣 does not apply front damage taken reduction aura', () => {
    const paladin = mockAlly({
      id: 'paladin',
      build: {
        learnedPassiveIds: ['df_paladin_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      formationRow: 'front',
    });
    const backline = mockAlly({
      id: 'cleric',
      role: 'supporter',
      formationRow: 'back',
    });
    syncFrontThreatControlAuras(
      [paladin, warrior, backline],
      passivesRegistry,
    );
    expect(
      warrior.statusEffects.some((fx) =>
        fx.id.startsWith('passive_front_threat_dmg_reduction_'),
      ),
    ).toBe(false);
    expect(
      backline.statusEffects.some((fx) =>
        fx.id.startsWith('passive_front_threat_dmg_reduction_'),
      ),
    ).toBe(false);
  });

  it('duelist does not become main tank from being hit alone', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
      build: {
        learnedPassiveIds: ['df_guardian_passive_2'],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
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

  it('guardian threat sustain from damage taken keeps main tank role', () => {
    const guardian = mockAlly({
      id: 'guardian',
      maxHp: 235,
      def: 26,
      threat: 92,
      baseThreat: 92,
      build: {
        learnedPassiveIds: ['df_guardian_passive_2'],
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
