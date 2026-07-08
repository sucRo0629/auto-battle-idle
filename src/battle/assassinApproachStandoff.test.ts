import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import {
  capEngagedEnemyApproachBattleX,
  resolveApproachAttackBattleX,
  resolveApproachRangePx,
} from './combatPosition.ts';
import {
  resolveAllPlayerApproachBattleX,
  shouldSkipEngagedAutoApproach,
} from './resolveApproachBattleX.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import type { CombatantState } from './types.ts';

function buildAssassin(battleX: number, gameData: ReturnType<typeof loadGameData>): CombatantState {
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
    battleX,
    traits: preset.traits,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'at_assassin_basic_attack', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'at_assassin',
    iconKey: 'at_assassin',
  };
}

function buildMeleeEnemy(battleX: number): CombatantState {
  return {
    id: 'enemy',
    name: 'enemy',
    classId: 'test_enemy',
    hp: 100,
    maxHp: 100,
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

describe('assassin approach standoff', () => {
  const gameData = loadGameData();

  it('retreats to traits range standoff when enemy closes inside attack range', () => {
    const enemy = buildMeleeEnemy(400);
    const assassin = buildAssassin(395, gameData);
    const rangePx = resolveApproachRangePx(assassin, gameData);
    expect(rangePx).toBe(32);

    const stopX = resolveApproachAttackBattleX(
      assassin,
      enemy.battleX,
      gameData,
      1,
      enemy.battleX,
    );
    expect(stopX).toBe(enemy.battleX - rangePx);
    expect(stopX).toBeLessThan(assassin.battleX);

    const approachTargets = resolveAllPlayerApproachBattleX(
      [assassin],
      [enemy],
      gameData,
    );
    expect(approachTargets.get(assassin.id)).toBe(stopX);
    expect(
      shouldSkipEngagedAutoApproach(assassin, [assassin], [enemy], gameData, {
        approachTargetX: stopX,
      }),
    ).toBe(false);
  });

  it('keeps standoff gap after approach target is applied', () => {
    const enemy = buildMeleeEnemy(400);
    const assassin = buildAssassin(400, gameData);
    const approachX = resolveAllPlayerApproachBattleX(
      [assassin],
      [enemy],
      gameData,
    ).get(assassin.id)!;

    assassin.battleX = approachX;
    const stopGap = enemy.battleX - assassin.battleX;
    expect(stopGap).toBe(32);
    expect(isWithinSkillRange(assassin, enemy, stopGap)).toBe(true);
  });
});

describe('enemy approach standoff', () => {
  const gameData = loadGameData();

  it('does not retreat right when over-advanced past chase target (left-only)', () => {
    const preset = gameData.classRegistry.at_assassin!;
    const player = {
      id: 'assassin',
      name: '双刃士',
      classId: 'at_assassin',
      role: 'attacker' as const,
      formationRow: 'front' as const,
      partySlotIndex: 0,
      hp: 100,
      maxHp: 100,
      barrierHp: 0,
      atk: 34,
      def: 12,
      res: 0,
      isAlive: true,
      isEnemy: false,
      battleX: 375,
      traits: preset.traits,
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [
        { skillId: 'at_assassin_basic_attack', remaining: 0, slotKind: 'basic' },
      ],
      statusEffects: [],
      spriteKey: 'at_assassin',
      iconKey: 'at_assassin',
    };
    const enemy = buildMeleeEnemy(390);
    enemy.traits.rangePx = 30;

    const stopX = resolveApproachAttackBattleX(
      enemy,
      player.battleX,
      gameData,
    );
    // hostile engage floors to engagedMinBodyGap (SPRITE_WIDTH)
    expect(stopX).toBe(player.battleX + 32);
    expect(stopX).toBeGreaterThan(enemy.battleX);

    const capped = capEngagedEnemyApproachBattleX(enemy, stopX);
    expect(capped).toBe(enemy.battleX);
    expect(
      shouldSkipEngagedAutoApproach(enemy, [player], [enemy], gameData, {
        approachTargetX: capped,
      }),
    ).toBe(true);
  });
});
