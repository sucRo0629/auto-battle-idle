import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import { BATTLE_ENEMY_VISIBLE_MIN_X } from './types.ts';
import {
  assignInitialAllyBattleX,
  getEnemyContactX,
  isEnemyVisibleOnScreen,
  resolveAttackBattleX,
  resolveMoveBattleX,
  resolveMaxEffectiveRangePx,
  shouldStartApproach,
  updateUnitApproach,
} from './combatPosition.ts';

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
    formationRow: 'front',
    traits: { attackRange: 'melee' },
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: 200,
    visualX: 200,
    ...overrides,
  };
}

const gameData = {
  skillRegistry: {
    passives: {},
    actives: {
      basic: {
        id: 'basic',
        name: 'basic',
        interval: 2,
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', powerMultiplier: 1 }],
      },
      spear: {
        id: 'spear',
        name: 'spear',
        interval: 2,
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', powerMultiplier: 1, range: 30 }],
      },
      bow: {
        id: 'bow',
        name: 'bow',
        interval: 2,
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', powerMultiplier: 1, range: 140 }],
      },
    },
  },
} as unknown as GameData;

describe('combatPosition', () => {
  it('detects enemy on screen', () => {
    const off = mockCombatant({ id: 'e1', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MIN_X - 1 });
    const on = mockCombatant({ id: 'e2', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MIN_X });
    expect(isEnemyVisibleOnScreen(off)).toBe(false);
    expect(isEnemyVisibleOnScreen(on)).toBe(true);
    expect(shouldStartApproach([off])).toBe(false);
    expect(shouldStartApproach([on])).toBe(true);
  });

  it('resolves melee range 0 and spear range 30', () => {
    const sword = mockCombatant({ id: 'sword', cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }] });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveMaxEffectiveRangePx(sword, gameData)).toBe(0);
    expect(resolveMaxEffectiveRangePx(spear, gameData)).toBe(30);
  });

  it('resolves attack battleX from contact', () => {
    const contactX = 50;
    const sword = mockCombatant({ id: 'sword', cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }] });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    const bow = mockCombatant({
      id: 'bow',
      traits: { attackRange: 'ranged', rangePx: 140 },
      formationRow: 'back',
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveAttackBattleX(sword, contactX, gameData)).toBe(50);
    expect(resolveAttackBattleX(spear, contactX, gameData)).toBe(80);
    expect(resolveAttackBattleX(bow, contactX, gameData)).toBe(190);
  });

  it('moves allies left toward attack position only', () => {
    const ally = mockCombatant({
      id: 'ally',
      battleX: 200,
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });
    updateUnitApproach(ally, 50, 1000);
    expect(ally.battleX).toBe(50);
    updateUnitApproach(ally, 60, 5);
    expect(ally.battleX).toBe(50);
    updateUnitApproach(ally, 40, 5);
    expect(ally.battleX).toBe(45);
  });

  it('assigns initial ally battleX by formation row', () => {
    const front = mockCombatant({ id: 'f', formationRow: 'front', role: 'defender' });
    const back = mockCombatant({
      id: 'b',
      formationRow: 'back',
      role: 'attacker',
      traits: { attackRange: 'ranged', rangePx: 140 },
    });
    assignInitialAllyBattleX([front, back]);
    expect(front.battleX).toBeLessThan(back.battleX);
  });

  it('getEnemyContactX returns front enemy', () => {
    const e1 = mockCombatant({ id: 'e1', isEnemy: true, battleX: 10 });
    const e2 = mockCombatant({ id: 'e2', isEnemy: true, battleX: 40 });
    expect(getEnemyContactX([e1, e2])).toBe(40);
  });

  it('resolveMoveBattleX engage and behindTarget', () => {
    const sword = mockCombatant({
      id: 'sword',
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });
    const spear = mockCombatant({
      id: 'spear',
      cooldowns: [{ skillId: 'spear', remaining: 0, slotKind: 'basic' }],
    });
    const enemy = mockCombatant({ id: 'e', isEnemy: true, battleX: 80 });

    expect(
      resolveMoveBattleX(
        sword,
        enemy,
        { type: 'move', targetRule: 'frontEnemy', moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(80);
    expect(
      resolveMoveBattleX(
        spear,
        enemy,
        { type: 'move', targetRule: 'frontEnemy', moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(110);
    expect(
      resolveMoveBattleX(
        sword,
        enemy,
        {
          type: 'move',
          targetRule: 'frontEnemy',
          moveDurationSec: 0.2,
          moveMode: 'behindTarget',
          behindOffsetPx: 20,
        },
        gameData,
      ),
    ).toBe(60);
  });
});
