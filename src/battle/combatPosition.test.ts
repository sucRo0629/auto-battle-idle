import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import { BATTLE_ENEMY_VISIBLE_MIN_X } from './types.ts';
import { engagedMinLeftEdgeGap } from '../render/formationLayout.ts';
import {
  assignInitialAllyBattleX,
  getAllyContactX,
  getBattleContactAllyVisual,
  getEnemyContactX,
  isEnemyVisibleOnScreen,
  resolveAttackBattleX,
  resolveMoveBattleX,
  resolveMaxEffectiveRangePx,
  resolveEngageLineX,
  separateByGap,
  shouldStartApproach,
  syncEnemyVisualToBattleContact,
  updateUnitApproach,
} from './combatPosition.ts';
import { SPRITE_GAP } from '../render/formationLayout.ts';

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
    corpseVisible: true,
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
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 } }],
      },
      spear: {
        id: 'spear',
        name: 'spear',
        interval: 2,
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 30 }],
      },
      bow: {
        id: 'bow',
        name: 'bow',
        interval: 2,
        effect: [{ targetRule: 'frontEnemy', type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 100 }],
      },
    },
  },
} as unknown as GameData;

describe('combatPosition', () => {
  it('separateByGap spreads enemy spawns left to stay off-screen', () => {
    const separated = separateByGap(
      [
        { id: 'ranged', battleX: -160, isAlive: true },
        { id: 'mid', battleX: -120, isAlive: true },
        { id: 'front', battleX: -100, isAlive: true },
      ],
      SPRITE_GAP,
    );
    for (const id of ['ranged', 'mid', 'front']) {
      expect(separated.get(id)!).toBeLessThan(BATTLE_ENEMY_VISIBLE_MIN_X);
    }
    expect(separated.get('front')!).toBe(-100);
  });

  it('detects enemy on screen', () => {
    const off = mockCombatant({ id: 'e1', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MIN_X - 1 });
    const on = mockCombatant({ id: 'e2', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MIN_X });
    expect(isEnemyVisibleOnScreen(off)).toBe(false);
    expect(isEnemyVisibleOnScreen(on)).toBe(true);
  });

  it('starts approach at standoff distance from ally front, not at screen edge', () => {
    const ally = mockCombatant({ id: 'guard', formationRow: 'front', battleX: 240 });
    const far = mockCombatant({ id: 'far', isEnemy: true, battleX: BATTLE_ENEMY_VISIBLE_MIN_X });
    const near = mockCombatant({ id: 'near', isEnemy: true, battleX: 240 });
    const engageLine = 240 - engagedMinLeftEdgeGap();
    expect(resolveEngageLineX([ally], [far], gameData)).toBe(engageLine);
    expect(shouldStartApproach([ally], [far], gameData)).toBe(false);
    expect(shouldStartApproach([ally], [near], gameData)).toBe(true);
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
      traits: { attackRange: 'ranged' },
      formationRow: 'back',
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveAttackBattleX(sword, contactX, gameData)).toBe(50);
    expect(resolveAttackBattleX(spear, contactX, gameData)).toBe(80);
    expect(resolveAttackBattleX(bow, contactX, gameData)).toBe(150);
  });

  it('approach range follows skill effect range', () => {
    const bow = mockCombatant({
      id: 'bow',
      traits: { attackRange: 'ranged' },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveMaxEffectiveRangePx(bow, gameData)).toBe(100);
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
      traits: { attackRange: 'ranged' },
    });
    assignInitialAllyBattleX([front, back]);
    expect(front.battleX).toBeLessThan(back.battleX);
  });

  it('getEnemyContactX returns front enemy', () => {
    const e1 = mockCombatant({ id: 'e1', isEnemy: true, battleX: 10 });
    const e2 = mockCombatant({ id: 'e2', isEnemy: true, battleX: 40 });
    expect(getEnemyContactX([e1, e2])).toBe(40);
  });

  it('getAllyContactX ignores back row battleX advanced for ranged approach', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 120,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { attackRange: 'ranged' },
      battleX: 70,
    });
    expect(getAllyContactX([guard, archer])).toBe(120);
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

describe('battle contact visual sync', () => {
  it('getBattleContactAllyVisual picks leading row contact, not advanced back row', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 120,
      visualX: 200,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { attackRange: 'ranged' },
      battleX: 70,
      visualX: 180,
    });
    const contact = getBattleContactAllyVisual([guard, archer], gameData);
    expect(contact?.visualX).toBe(200);
  });

  it('syncEnemyVisualToBattleContact maps enemy battleX through contact offset', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 120,
      visualX: 200,
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 110,
      visualX: 0,
    });
    syncEnemyVisualToBattleContact([guard], [enemy]);
    expect(enemy.visualX).toBe(190);
  });
});
