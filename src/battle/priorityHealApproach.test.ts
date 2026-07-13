import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  resolvePlayerApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import { resolvePriorityHealTarget, resolveEffectResolution } from './skills/targeting.ts';
import type { CombatantState, GameData } from './types.ts';

const ALCHEMIST_BASIC_ID = 'sp_alchemist_basic_attack';

function mockAlchemist(
  battleX: number,
  overrides: Partial<CombatantState> = {},
): CombatantState {
  return {
    id: 'alchemist',
    name: '薬草師',
    hp: 100,
    maxHp: 100,
    atk: 12,
    def: 8,
    res: 10,
    isAlive: true,
    role: 'supporter',
    classId: 'sp_alchemist',
    formationRow: 'front',
    traits: {
      rangePx: 80,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: ALCHEMIST_BASIC_ID, remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
    ...overrides,
  };
}

function mockGuardian(battleX: number, hp: number, maxHp = 235): CombatantState {
  return {
    id: 'guardian',
    name: '鉄衛士',
    hp,
    maxHp,
    atk: 11,
    def: 26,
    res: 5,
    isAlive: hp > 0,
    role: 'defender',
    classId: 'df_guardian',
    formationRow: 'front',
    traits: {
      rangePx: 5,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'df_guardian_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockSorcerer(
  battleX: number,
  hp: number,
  maxHp = 80,
): CombatantState {
  return {
    id: 'sorcerer',
    name: '魔術師',
    hp,
    maxHp,
    atk: 26,
    def: 5,
    res: 20,
    isAlive: true,
    role: 'attacker',
    classId: 'at_sorcerer',
    formationRow: 'back',
    traits: {
      rangePx: 128,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: 'at_sorcerer_basic_attack',
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockDuelist(battleX: number): CombatantState {
  return {
    id: 'duelist',
    name: '剣術士',
    hp: 100,
    maxHp: 100,
    atk: 18,
    def: 10,
    res: 5,
    isAlive: true,
    role: 'attacker',
    classId: 'at_duelist',
    formationRow: 'front',
    traits: {
      rangePx: 5,
      damageType: 'physical',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'at_duelist_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX,
    corpseVisible: true,
  };
}

function mockEnemy(battleX: number): CombatantState {
  return {
    id: 'enemy',
    name: 'enemy',
    hp: 100,
    maxHp: 100,
    atk: 10,
    def: 5,
    res: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test_enemy',
    formationRow: 'front',
    traits: {
      rangePx: 200,
      damageType: 'magic',
      basicAttackVfx: { enabled: true },
    },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      {
        skillId: 'test_enemy_basic_attack',
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    statusEffects: [],
    barrierHp: 0,
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: true,
    battleX,
    corpseVisible: true,
  };
}

function alchemistGameData(): GameData {
  return loadGameData();
}

describe('PHT ally-heal approach (sp_alchemist regression)', () => {
  const gameData = alchemistGameData();
  const enemy = mockEnemy(280);

  it('does not stop approach when frontline is out of heal range even if a rear ally is in range', () => {
    const alchemist = mockAlchemist(52);
    const guardian = mockGuardian(204, 47);
    const sorcerer = mockSorcerer(20, 76);
    const duelist = mockDuelist(200);
    const players = [guardian, duelist, sorcerer, alchemist];

    expect(resolvePriorityHealTarget(players)?.id).toBe('guardian');
    expect(
      shouldSkipEngagedAutoApproach(alchemist, players, [enemy], gameData),
    ).toBe(false);
  });

  it('advances toward frontline when frontline is out of heal range', () => {
    const alchemist = mockAlchemist(52);
    const guardian = mockGuardian(204, 47);
    const sorcerer = mockSorcerer(20, 76);
    const duelist = mockDuelist(200);
    const players = [guardian, duelist, sorcerer, alchemist];

    const approachX = resolvePlayerApproachBattleX(
      alchemist,
      players,
      [enemy],
      gameData,
    );
    expect(approachX).toBeGreaterThan(alchemist.battleX);
    expect(approachX).toBeLessThan(duelist.battleX);
  });

  it('stops approach when frontline is within basic heal range', () => {
    const alchemist = mockAlchemist(160);
    const guardian = mockGuardian(224, 47);
    const sorcerer = mockSorcerer(20, 76);
    const players = [guardian, sorcerer, alchemist];

    expect(
      shouldSkipEngagedAutoApproach(alchemist, players, [enemy], gameData),
    ).toBe(true);
  });

  it('advances toward frontline when every ally is at full HP', () => {
    const alchemist = mockAlchemist(52);
    const guardian = mockGuardian(204, 235);
    const sorcerer = mockSorcerer(20, 80);
    const duelist = mockDuelist(200);
    const players = [guardian, duelist, sorcerer, alchemist];

    expect(
      shouldSkipEngagedAutoApproach(alchemist, players, [enemy], gameData),
    ).toBe(false);
    expect(
      resolvePlayerApproachBattleX(
        alchemist,
        players,
        [enemy],
        gameData,
      ),
    ).toBeGreaterThan(alchemist.battleX);
  });

  it('withholds sp_alchemist_active_1 when PHT is outside selfOrigin aoe', () => {
    const alchemist = mockAlchemist(52);
    const guardian = mockGuardian(224, 47);
    const sorcerer = mockSorcerer(20, 76);
    const players = [guardian, sorcerer, alchemist];
    const active1 = gameData.skillRegistry.actives['sp_alchemist_active_1'];
    expect(active1?.effect[0]?.type).toBe('heal');

    const resolution = resolveEffectResolution(
      active1!.effect[0]!,
      alchemist,
      players,
      [mockEnemy(280)],
      gameData,
      Math.random,
      undefined,
      active1!.effect,
      undefined,
      active1,
    );
    expect(resolution).toBeNull();
  });
});
