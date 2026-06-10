import { describe, expect, it } from 'vitest';
import { resolveAttackBattleX, resolveMaxEffectiveRangePx } from './combatPosition.ts';
import { hideFallenAllyCorpses } from './entities.ts';
import {
  PLAYER_FORMATION_DEPTH,
  PLAYER_ROW_SPACING,
  ROW_X,
  SCROLL_SPEED,
  engagedFrontLineGap,
  engagedMinBodyGap,
} from './battleConstants.ts';
import {
  applyStaggeredFormationMarchRestore,
  approachVisualX,
  computePlayerPositions,
  computeEngagedPlayerTargets,
  computeEngagedEnemyPositions,
  computeEnemyStopX,
  computeRangedEnemyVisualX,
  clampPlayerVisualDepth,
  getLeadingPlayerFront,
  isFormationScreenLayoutRestored,
  isFormationSpacingRestored,
  isLeadColumnSpacingRestored,
  moveTowardX,
  resolveEngagedLayout,
  resolveEngagedVisualTargets,
  resolveMoveVisualX,
  tickCompensatedFormationReset,
} from './battleLayout.ts';
import type { ActiveSkillMove } from './skills/skillSequence.ts';
import type { CombatantState, GameData } from './types.ts';

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
    battleX: 180,
    visualX: 180,
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
        effect: [
          {
            target: { kind: "distance", side: "enemy", order: "nearest" },
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
          },
        ],
      },
    },
  },
} as unknown as GameData;

function applySkillMoveVisualOverlay(
  unit: CombatantState,
  move: ActiveSkillMove,
): void {
  const baseVisualX = move.baseVisualX ?? unit.visualX;
  const t =
    move.toX === move.fromX
      ? 1
      : (unit.battleX - move.fromX) / (move.toX - move.fromX);
  unit.visualX = baseVisualX + (move.toVisualX - baseVisualX) * t;
}

describe('visual position (new axis)', () => {
  it('computePlayerPositions assigns back < front', () => {
    const positions = computePlayerPositions([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'archer', role: 'attacker', formationRow: 'back', rangePx: 100, isAlive: true },
    ]);
    expect(positions.get('guard')).toBe(ROW_X.front);
    expect(positions.get('archer')).toBe(ROW_X.back);
    expect(positions.get('guard')!).toBeGreaterThan(positions.get('archer')!);
  });

  it('approachVisualX moves bidirectionally', () => {
    expect(approachVisualX(180, 200, 10)).toBe(190);
    expect(approachVisualX(180, 160, 10)).toBe(170);
  });

  it('clampPlayerVisualDepth keeps back row left of leading front', () => {
    const guard = mockCombatant({ id: 'guard', formationRow: 'front', visualX: 200 });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      visualX: 220,
    });
    clampPlayerVisualDepth([guard, archer]);
    expect(archer.visualX).toBe(200 + PLAYER_FORMATION_DEPTH);
  });

  it('applyStaggeredFormationMarchRestore marches lead front player right each tick', () => {
    const players = [
      { id: 'guard', role: 'defender' as const, formationRow: 'front' as const, isAlive: true as const, visualX: 140 },
      { id: 'cleric', role: 'supporter' as const, formationRow: 'back' as const, isAlive: true as const, visualX: 60 },
    ];
    const dt = 1 / 60;
    const guardBefore = players[0]!.visualX;
    applyStaggeredFormationMarchRestore({ phase: 'lead', players }, dt);
    const marchStep = SCROLL_SPEED * dt;
    expect(players[0]!.visualX).toBeGreaterThanOrEqual(guardBefore + marchStep - 0.01);
  });

  it('computeEnemyStopX places enemy right of player contact', () => {
    const stopX = computeEnemyStopX(0, 200, 0);
    expect(stopX).toBeGreaterThan(200);
  });

  it('computeRangedEnemyVisualX places ranged enemy further right', () => {
    const x = computeRangedEnemyVisualX(200, 80);
    expect(x).toBeGreaterThan(200);
  });

  it('resolveEngagedLayout separates melee enemy to the right of front line', () => {
    const layout = resolveEngagedLayout({
      players: [{
        id: 'guard',
        role: 'defender',
        formationRow: 'front',
        rangePx: 0,
        isAlive: true,
        visualX: 200,
        battleX: 180,
        engagedVisualLaneX: 0,
      }],
      enemies: [{
        id: 'melee',
        isAlive: true,
        rangePx: 0,
        battleX: 250,
        engagedMeleeVisualSlot: 0,
      }],
      playerContactBattleX: 180,
      battleVisualOffset: 20,
      frontEnemyVisualAnchor: 270,
      resolveRangedTargetVisualX: () => null,
    });
    const guardX = layout!.playerVisualX.get('guard')!;
    const meleeX = layout!.enemyVisualX.get('melee')!;
    expect(meleeX).toBeGreaterThan(guardX + engagedFrontLineGap() - 1);
  });

  it('resolveMoveVisualX engage places player left of enemy anchor', () => {
    const actor = mockCombatant({ id: 'a', visualX: 180 });
    const enemy = mockCombatant({ id: 'e', isEnemy: true, visualX: 280 });
    const x = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      moveDurationSec: 0.2,
      moveMode: 'engage',
    }, gameData);
    expect(x).toBe(enemy.visualX - Math.max(0, engagedMinBodyGap()));
  });

  it('hideFallenAllyCorpses clears corpseVisible for dead players only', () => {
    const living = mockCombatant({ id: 'living' });
    const fallen = mockCombatant({ id: 'fallen', hp: 0, isAlive: false, corpseVisible: true });
    hideFallenAllyCorpses([living, fallen]);
    expect(living.corpseVisible).toBe(true);
    expect(fallen.corpseVisible).toBe(false);
  });

  it('getLeadingPlayerFront picks max visualX on leading row', () => {
    const front = getLeadingPlayerFront([
      { id: 'g', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true, visualX: 200 },
      { id: 's', role: 'attacker', formationRow: 'front', rangePx: 0, isAlive: true, visualX: 180 },
    ]);
    expect(front?.visualX).toBe(200);
  });

  it('tickCompensatedFormationReset keeps screen X stable during right march', () => {
    const players = [
      { id: 'guard', role: 'defender' as const, formationRow: 'front' as const, isAlive: true as const, visualX: 100 },
    ];
    const dt = 1 / 60;
    const beforeScreen = players[0]!.visualX;
    const result = tickCompensatedFormationReset(
      { phase: 'lead', players },
      0,
      dt,
    );
    const afterScreen = players[0]!.visualX + result.combatCameraX;
    expect(Math.abs(afterScreen - beforeScreen)).toBeLessThan(10);
  });

  it('isFormationScreenLayoutRestored checks ROW_X screen positions', () => {
    const players = [
      { id: 'guard', role: 'defender' as const, formationRow: 'front' as const, isAlive: true as const, visualX: ROW_X.front },
      { id: 'archer', role: 'attacker' as const, formationRow: 'back' as const, isAlive: true as const, visualX: ROW_X.back },
    ];
    expect(isFormationScreenLayoutRestored(players, 0)).toBe(true);
  });

  it('skill move overlay interpolates visualX toward move target', () => {
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true, battleX: 280, visualX: 280 });
    const actor = mockCombatant({ id: 'actor', battleX: 100, visualX: 100 });
    const toVisualX = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      moveDurationSec: 0.2,
      moveMode: 'engage',
    }, gameData);
    const move: ActiveSkillMove = {
      actorId: 'actor',
      fromX: 100,
      toX: 280,
      toVisualX,
      remainingSec: 0.5,
      totalSec: 1,
      baseVisualX: 100,
    };
    actor.battleX = 190;
    applySkillMoveVisualOverlay(actor, move);
    expect(actor.visualX).toBe(100 + (toVisualX - 100) * 0.5);
  });
});
