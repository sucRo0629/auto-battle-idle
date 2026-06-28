import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import { shouldSkipEngagedAutoApproach } from './resolveApproachBattleX.ts';

function mockUnit(
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
    traits: { rangePx: 40, damageType: 'physical', basicAttackVfx: { enabled: true } },
    build: {
      learnedPassiveIds: ['passive_target_ranged_attacking'],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 180,
    corpseVisible: true,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: {
    actives: {
      bow_basic: {
        id: 'bow_basic',
        displayName: 'Bow',
        effect: [
          {
            type: 'damage',
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          },
        ],
      },
      slash_basic: {
        id: 'slash_basic',
        displayName: 'Slash',
        effect: [
          {
            type: 'damage',
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          },
        ],
      },
    },
    passives: {
      passive_target_ranged_attacking: {
        id: 'passive_target_ranged_attacking',
        name: '射手排除',
        effect: 'targetRuleOverride',
        targetRuleOverride: { kind: 'attackType', ranged: true },
      },
    },
  },
} as unknown as GameData;

describe('shouldSkipEngagedAutoApproach', () => {
  it('does not skip archer when only melee enemy is in range', () => {
    const archer = mockUnit({ id: 'archer', battleX: 180 });
    const meleeEnemy = mockUnit({
      id: 'melee',
      isEnemy: true,
      battleX: 200,
      traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'slash_basic', remaining: 0, slotKind: 'basic' }],
    });
    const farRanged = mockUnit({
      id: 'farRanged',
      isEnemy: true,
      battleX: 500,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    expect(
      shouldSkipEngagedAutoApproach(
        archer,
        [archer],
        [meleeEnemy, farRanged],
        gameData,
      ),
    ).toBe(false);
  });

  it('skips archer when a ranged enemy is in attack range', () => {
    const archer = mockUnit({ id: 'archer', battleX: 180 });
    const rangedEnemy = mockUnit({
      id: 'ranged',
      isEnemy: true,
      battleX: 210,
      traits: { rangePx: 100, damageType: 'physical', basicAttackVfx: { enabled: true } },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    expect(
      shouldSkipEngagedAutoApproach(archer, [archer], [rangedEnemy], gameData),
    ).toBe(true);
  });

  it('skips archer when test_ranged is in attack range', () => {
    const archer = mockUnit({ id: 'archer', battleX: 180 });
    const testRanged = mockUnit({
      id: 'test_ranged',
      isEnemy: true,
      battleX: 210,
      traits: {
        rangePx: 100,
        damageType: 'physical',
        basicAttackVfx: { enabled: true },
      },
      cooldowns: [{ skillId: 'bow_basic', remaining: 0, slotKind: 'basic' }],
    });

    expect(
      shouldSkipEngagedAutoApproach(archer, [archer], [testRanged], gameData),
    ).toBe(true);
  });
});
