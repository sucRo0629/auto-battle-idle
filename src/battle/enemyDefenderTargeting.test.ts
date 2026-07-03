import { describe, expect, it } from 'vitest';
import type { CombatantState, DamageSkillEffect, PassiveSkillDef } from './types.ts';
import { resolveDamage } from './combatMath.ts';
import { syncDamageReductionAuras } from './passiveEffects.ts';
import { resolveEnemyChaseTargetPlayer } from './resolveApproachBattleX.ts';
import { mockApproachGameData } from './testFixtures.ts';

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
    res: 0,
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

const paladinDamageReductionAura: PassiveSkillDef = {
  id: 'df_paladin_passive_2',
  name: '護法陣',
  effect: 'damageReduction',
  damageReductionPercent: 0.05,
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
};

describe('enemy defender targeting', () => {
  it('enemy chase picks defender over nearer attacker', () => {
    const paladin = mockAlly({
      id: 'paladin',
      battleX: 200,
    });
    const warrior = mockAlly({
      id: 'warrior',
      role: 'attacker',
      battleX: 220,
    });
    const meleeEnemy = mockAlly({
      id: 'enemy',
      isEnemy: true,
      battleX: 280,
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
    expect(nearMul).toBe(0.95);
    expect(selfMul).toBe(0.95);
    expect(farMul).toBeUndefined();
  });

  it('護法陣 reduces resolveDamage for allies inside aura radius', () => {
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
      def: 0,
    });
    const farAlly = mockAlly({
      id: 'far',
      role: 'attacker',
      formationRow: 'front',
      battleX: 100,
      def: 0,
    });
    const attacker = mockAlly({
      id: 'enemy',
      isEnemy: true,
      atk: 200,
      battleX: 300,
    });
    const gameData = mockApproachGameData();
    syncDamageReductionAuras(
      [paladin, nearAlly, farAlly],
      [],
      passivesRegistry,
      gameData,
    );

    const effect: DamageSkillEffect = {
      type: 'damage',
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
    };
    const nearReduced = resolveDamage(
      attacker,
      nearAlly,
      effect,
      passivesRegistry,
    );
    const farUnreduced = resolveDamage(
      attacker,
      farAlly,
      effect,
      passivesRegistry,
    );
    const nearWithoutAura = resolveDamage(
      attacker,
      { ...nearAlly, statusEffects: [] },
      effect,
      passivesRegistry,
    );

    expect(nearReduced).toBeLessThan(nearWithoutAura);
    expect(nearReduced).toBe(Math.max(1, Math.floor(nearWithoutAura * 0.95)));
    expect(farUnreduced).toBe(nearWithoutAura);
  });
});
