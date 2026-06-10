import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import {
  engagedMinBodyGap,
  enemyRangedRearGap,
  PLAYER_FORMATION_DEPTH,
} from './battleConstants.ts';
import {
  resolvePlayerApproachBattleX,
  resolveEnemyApproachBattleX,
  resolveEnemyBasicAttackTarget,
} from './resolveApproachBattleX.ts';

function mockCombatant(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isAlive: true,
    role: 'attacker',
    classId: 'test',
    formationRow: 'back',
    traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
    build: {
      learnedPassiveIds: ['archer_passive'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [
      { skillId: 'bow_basic', remaining: 0, slotKind: 'basic' },
    ],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 60,
    visualX: 60,
    corpseVisible: true,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: {
    passives: {
      archer_passive: {
        id: 'archer_passive',
        name: '射手排除',
        effect: 'targetRuleOverride',
        targetRuleOverride: { kind: "attackType", ranged: true },
      },
    },
    actives: {
      basic_melee: {
        id: 'basic_melee',
        name: 'basic',
        interval: 2,
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 } }],
      },
      bow_basic: {
        id: 'bow_basic',
        name: '射撃',
        interval: 2,
        effect: [
          {
            target: { kind: "distance", side: "enemy", order: "nearest" },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
            range: 100,
          },
        ],
      },
    },
  },
} as unknown as GameData;

describe('resolvePlayerApproachBattleX', () => {
  it('approaches farthest-in-range priority target, not only front contact', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 320,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(320 - 100);
    expect(approachX).toBeGreaterThan(280 - 100);
  });

  it('front row uses melee contact even with ranged passive', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });
    const backRanged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 320,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(280 - engagedMinBodyGap());
  });

  it('falls back to front contact when no ranged enemies exist', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      archer,
      [archer],
      [frontMelee],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it('front row approaches ranged target after melee enemies are gone', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      battleX: 280,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolvePlayerApproachBattleX(
      guard,
      [guard],
      [ranged],
      gameData,
    );

    expect(approachX).toBe(280 - 100);
  });

  it('back row stays behind front contact in battleX even when in ranged firing range', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enchanter = mockCombatant({
      id: 'enchanter',
      formationRow: 'back',
      battleX: 60,
      traits: { rangePx: 50, damageType: 'magic', basicAttackVfx: { preset: 'magic' } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolvePlayerApproachBattleX(
      enchanter,
      [guard, enchanter],
      [meleeEnemy],
      gameData,
    );

    expect(approachX).toBeLessThanOrEqual(200 + PLAYER_FORMATION_DEPTH);
    expect(approachX).toBeLessThan(250 - 50);
  });
});

describe('resolveEnemyBasicAttackTarget', () => {
  it('melee enemies skip back row units beyond front contact reach', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const enchanter = mockCombatant({
      id: 'enchanter',
      formationRow: 'back',
      battleX: 80,
      traits: { rangePx: 50, damageType: 'magic', basicAttackVfx: { preset: 'magic' } },
      cooldowns: [],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });
    const meleeEnemy = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 250,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'basic_melee', remaining: 0, slotKind: 'basic' }],
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    });

    const target = resolveEnemyBasicAttackTarget(
      meleeEnemy,
      [guard, enchanter],
      [meleeEnemy],
      gameData,
    );

    expect(target?.id).toBe('guard');
  });
});

describe('resolveEnemyApproachBattleX', () => {
  it('stops at skill range from closest player', () => {
    const rangedEnemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      formationRow: 'front',
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      battleX: 60,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(180 + 100);
  });

  it('caps ranged approach behind living melee', () => {
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 250,
      cooldowns: [],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX).toBeGreaterThanOrEqual(250 + enemyRangedRearGap());
  });

  it('keeps ranged battleX at formation depth behind melee contact', () => {
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 300,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 250,
      cooldowns: [],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 60,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      battleX: 180,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [melee, rangedEnemy],
      gameData,
    );

    expect(approachX - melee.battleX).toBeGreaterThanOrEqual(
      enemyRangedRearGap() - 1,
    );
  });
});
