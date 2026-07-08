import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveFacingSign } from './combatFacing.ts';
import {
  isPlayerRearAssaultAccess,
  setPlayerRearAssaultAccess,
} from './combatPosition.ts';
import {
  resolveAllPlayerApproachBattleX,
  resolvePlayerAttackTargetEnemy,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import type { CombatantState, GameData } from './types.ts';

function buildAssassinWithPassives(gameData: GameData): CombatantState {
  const preset = gameData.classRegistry.at_assassin!;
  return {
    id: 'assassin',
    name: '双刃士',
    classId: 'at_assassin',
    role: 'attacker',
    formationRow: 'front',
    partySlotIndex: 0,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 34,
    def: 12,
    res: 0,
    isAlive: true,
    isEnemy: false,
    battleX: 0,
    traits: preset.traits,
    build: {
      learnedPassiveIds: ['at_assassin_passive_2'],
      learnedActiveIds: ['at_assassin_active_2'],
      equippedActiveSlots: ['at_assassin_active_2', null, null, null],
    },
    cooldowns: [
      {
        skillId: 'at_assassin_basic_attack',
        remaining: 0,
        slotKind: 'basic',
      },
      {
        skillId: 'at_assassin_active_2',
        remaining: 5,
        slotKind: 'active',
        slotIndex: 0,
      },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
  };
}

function buildTankAlly(battleX: number): CombatantState {
  return {
    id: 'tank',
    name: '鉄衛士',
    classId: 'df_guardian',
    role: 'defender',
    formationRow: 'front',
    partySlotIndex: 1,
    hp: 200,
    maxHp: 200,
    barrierHp: 0,
    atk: 20,
    def: 30,
    res: 0,
    isAlive: true,
    isEnemy: false,
    battleX,
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'df_guardian_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
  };
}

function buildEnemy(
  id: string,
  battleX: number,
  hp: number,
  maxHp = hp,
): CombatantState {
  return {
    id,
    name: id,
    classId: 'test_enemy',
    hp,
    maxHp,
    barrierHp: 0,
    atk: 20,
    def: 10,
    res: 0,
    isAlive: true,
    isEnemy: true,
    battleX,
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'test_enemy_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
  };
}

describe('assassin rear assault targeting', () => {
  const gameData = loadGameData();

  it('holds behind contact front and attacks with flipped facing after rear move', () => {
    // 敵前衛（contact）= 小さい battleX。パッシブ最低 HP で接触前衛が AttackTarget。
    const contactEnemy = buildEnemy('contact', 140, 20, 100);
    const rearEnemy = buildEnemy('rear', 200, 500, 500);
    const tank = buildTankAlly(115);
    const assassin = buildAssassinWithPassives(gameData);
    assassin.battleX = contactEnemy.battleX + 32;
    setPlayerRearAssaultAccess(assassin, 32);

    const players = [assassin, tank];
    const enemies = [contactEnemy, rearEnemy];
    const battleContext = { players, enemies };

    expect(isPlayerRearAssaultAccess(assassin, battleContext)).toBe(true);
    expect(
      isWithinSkillRange(assassin, contactEnemy, assassin.traits.rangePx),
    ).toBe(false);

    const approachX = resolveAllPlayerApproachBattleX(
      players,
      enemies,
      gameData,
    ).get(assassin.id)!;
    expect(approachX).toBe(contactEnemy.battleX + 32);

    const attackTarget = resolvePlayerAttackTargetEnemy(
      assassin,
      players,
      enemies,
      gameData,
    );
    expect(attackTarget?.id).toBe('contact');
    expect(resolveFacingSign(assassin, attackTarget)).toBe(-1);
    expect(
      shouldSkipEngagedAutoApproach(assassin, players, enemies, gameData, {
        approachTargetX: approachX,
      }),
    ).toBe(true);
  });

  it('does not pull left toward chase stop while rear assault behind contact', () => {
    // Chase = 接触前衛（最低 HP）→ 通常 stop は contact−range（左）。hold は接触線追従。
    const contactEnemy = buildEnemy('contact', 140, 20, 100);
    const rearEnemy = buildEnemy('rear', 200, 500, 500);
    const tank = buildTankAlly(115);
    const assassin = buildAssassinWithPassives(gameData);
    const behindX = contactEnemy.battleX + 32;
    assassin.battleX = behindX;
    setPlayerRearAssaultAccess(assassin, 32);

    const players = [assassin, tank];
    const enemies = [contactEnemy, rearEnemy];

    const approachX = resolveAllPlayerApproachBattleX(
      players,
      enemies,
      gameData,
    ).get(assassin.id)!;

    expect(approachX).toBe(behindX);
    expect(approachX).toBeGreaterThan(contactEnemy.battleX);
    expect(approachX).toBeGreaterThan(contactEnemy.battleX - assassin.traits.rangePx);
  });

  it('follows enemy contact leftward so rear hold does not sprite-overlap', () => {
    const contactEnemy = buildEnemy('contact', 200, 20, 100);
    const tank = buildTankAlly(150);
    const assassin = buildAssassinWithPassives(gameData);
    assassin.battleX = contactEnemy.battleX + 32;
    setPlayerRearAssaultAccess(assassin, 32);

    contactEnemy.battleX = 160;

    const approachX = resolveAllPlayerApproachBattleX(
      [assassin, tank],
      [contactEnemy],
      gameData,
    ).get(assassin.id)!;

    expect(approachX).toBe(192);
    expect(approachX - contactEnemy.battleX).toBe(32);
  });
});
