import { describe, expect, it } from 'vitest';
import type { CombatantState, GameData } from './types.ts';
import { BATTLE_ENEMY_VISIBLE_MIN_X } from './types.ts';
import {
  computeEnemyStopX,
  engagedMinLeftEdgeGap,
  resolveEnemyMarchEngageGap,
} from '../render/formationLayout.ts';
import {
  assignInitialAllyBattleX,
  resolveEnemyMarchCapX,
  getAllyContactX,
  getBattleContactAllyVisual,
  getEnemyContactX,
  getMeleeEnemyContactX,
  isEnemyVisibleOnScreen,
  resolveAttackBattleX,
  resolveMoveBattleX,
  resolveMaxEffectiveRangePx,
  resolveRangedRearBattleXCap,
  resolveEngageLineX,
  separateByGap,
  shouldStartApproach,
  syncEnemyVisualToBattleContact,
  updateUnitApproach,
} from './combatPosition.ts';
import { SPRITE_GAP } from '../render/formationLayout.ts';
import { mockMeleeTraits, mockRangedTraits } from './testFixtures.ts';

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
    traits: { rangePx: 0, damageType: 'physical', basicAttackVfx: { preset: 'slash' } },
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
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 } }],
      },
      spear: {
        id: 'spear',
        name: 'spear',
        interval: 2,
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 30 }],
      },
      bow: {
        id: 'bow',
        name: 'bow',
        interval: 2,
        effect: [{ target: { kind: "distance", side: "enemy", order: "nearest" }, type: 'damage', damageType: 'physical', amount: { kind: 'atkBased', atkScale: 1 }, range: 100 }],
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

  it('starts approach at ranged enemy attack distance', () => {
    const ally = mockCombatant({ id: 'guard', formationRow: 'front', battleX: 240 });
    const rangedEnemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
      battleX: BATTLE_ENEMY_VISIBLE_MIN_X,
    });
    const engageLine = 240 - resolveEnemyMarchEngageGap(0, 100);
    expect(resolveEngageLineX([ally], [rangedEnemy], gameData)).toBe(engageLine);
    expect(shouldStartApproach([ally], [rangedEnemy], gameData)).toBe(false);
    rangedEnemy.battleX = engageLine;
    expect(shouldStartApproach([ally], [rangedEnemy], gameData)).toBe(true);
  });

  it('caps each enemy march by its own attack range', () => {
    const ally = mockCombatant({ id: 'guard', formationRow: 'front', battleX: 240 });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 200,
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
      battleX: 200,
    });
    const meleeCap = resolveEnemyMarchCapX(melee, [ally], gameData, [melee, ranged])!;
    const rangedCap = resolveEnemyMarchCapX(ranged, [ally], gameData, [melee, ranged])!;
    expect(meleeCap).toBe(240 - engagedMinLeftEdgeGap());
    expect(rangedCap).toBeLessThanOrEqual(meleeCap - SPRITE_GAP);
  });

  it('ranged approach stays behind melee front line', () => {
    const ally = mockCombatant({ id: 'guard', formationRow: 'front', battleX: 240 });
    const melee = mockCombatant({
      id: 'melee',
      isEnemy: true,
      battleX: 100,
      traits: mockMeleeTraits(),
    });
    const ranged = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: mockRangedTraits(),
      battleX: 120,
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    const rearCap = resolveRangedRearBattleXCap([melee, ranged]);
    expect(rearCap).toBe(100 - SPRITE_GAP);
  });

  it('ranged enemies only advance right toward attack range', () => {
    const enemy = mockCombatant({
      id: 'ranged',
      isEnemy: true,
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
      battleX: 100,
    });
    updateUnitApproach(enemy, 140, 10);
    expect(enemy.battleX).toBe(110);
    updateUnitApproach(enemy, 140, 100);
    expect(enemy.battleX).toBe(140);
    updateUnitApproach(enemy, 130, 5);
    expect(enemy.battleX).toBe(140);
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
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      cooldowns: [{ skillId: 'bow', remaining: 0, slotKind: 'basic' }],
    });
    expect(resolveMaxEffectiveRangePx(bow, gameData)).toBe(100);
  });

  it('moves allies left and enemies right toward attack position', () => {
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

    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 10,
      cooldowns: [],
    });
    updateUnitApproach(enemy, 140, 10);
    expect(enemy.battleX).toBe(20);
    updateUnitApproach(enemy, 140, 120);
    expect(enemy.battleX).toBe(140);
    updateUnitApproach(enemy, 130, 5);
    expect(enemy.battleX).toBe(140);
  });

  it('assigns initial ally battleX by formation row', () => {
    const front = mockCombatant({ id: 'f', formationRow: 'front', role: 'defender' });
    const back = mockCombatant({
      id: 'b',
      formationRow: 'back',
      role: 'attacker',
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
    });
    assignInitialAllyBattleX([front, back]);
    expect(front.battleX).toBeLessThan(back.battleX);
  });

  it('getEnemyContactX returns front enemy', () => {
    const e1 = mockCombatant({ id: 'e1', isEnemy: true, battleX: 10 });
    const e2 = mockCombatant({ id: 'e2', isEnemy: true, battleX: 40 });
    expect(getEnemyContactX([e1, e2])).toBe(40);
  });

  it('getMeleeEnemyContactX ignores ranged enemies', () => {
    const melee = mockCombatant({
      id: 'm',
      isEnemy: true,
      battleX: 10,
      traits: mockMeleeTraits(),
    });
    const ranged = mockCombatant({
      id: 'r',
      isEnemy: true,
      battleX: 40,
      traits: mockRangedTraits(),
    });
    expect(getMeleeEnemyContactX([melee, ranged])).toBe(10);
    expect(getMeleeEnemyContactX([ranged])).toBeNull();
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
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
        { type: 'move', target: { kind: "distance", side: "enemy", order: "nearest" }, moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(80);
    expect(
      resolveMoveBattleX(
        spear,
        enemy,
        { type: 'move', target: { kind: "distance", side: "enemy", order: "nearest" }, moveDurationSec: 0.2, moveMode: 'engage' },
        gameData,
      ),
    ).toBe(110);
    expect(
      resolveMoveBattleX(
        sword,
        enemy,
        {
          type: 'move',
          target: { kind: "distance", side: "enemy", order: "nearest" },
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
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
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
