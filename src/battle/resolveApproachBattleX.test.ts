import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import {
  resolveAllyApproachBattleX,
  resolveEnemyApproachBattleX,
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
    battleX: 326,
    visualX: 326,
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
        targetRuleOverride: 'rangedAttackingEnemy',
      },
    },
    actives: {
      bow_basic: {
        id: 'bow_basic',
        name: '射撃',
        interval: 2,
        effect: [
          {
            targetRule: 'frontEnemy',
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

describe('resolveAllyApproachBattleX', () => {
  it('approaches farthest-in-range priority target, not only front contact', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: -10,
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
      battleX: -30,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolveAllyApproachBattleX(
      archer,
      [archer],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(-30 + 100);
    expect(approachX).toBeLessThan(-10 + 100);
  });

  it('front row uses front contact even with ranged passive', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: -10,
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
      battleX: -30,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolveAllyApproachBattleX(
      guard,
      [guard],
      [frontMelee, backRanged],
      gameData,
    );

    expect(approachX).toBe(-10 + 100);
  });

  it('falls back to front contact when no ranged enemies exist', () => {
    const archer = mockCombatant({ id: 'archer' });
    const frontMelee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: -10,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
      build: {
        learnedPassiveIds: [],
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
      cooldowns: [],
    });

    const approachX = resolveAllyApproachBattleX(
      archer,
      [archer],
      [frontMelee],
      gameData,
    );

    expect(approachX).toBe(-10 + 100);
  });
});

describe('resolveEnemyApproachBattleX', () => {
  it('stops at skill range from closest ally', () => {
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
      battleX: 240,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      battleX: 356,
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    const approachX = resolveEnemyApproachBattleX(
      rangedEnemy,
      [guard, archer],
      [rangedEnemy],
      gameData,
    );

    expect(approachX).toBe(240 - 100);
  });
});
