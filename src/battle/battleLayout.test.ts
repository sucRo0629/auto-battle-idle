import { describe, expect, it } from 'vitest';
import {
  CANVAS_W,
  ROW_X,
  PLAYER_ROW_SPACING,
  SPRITE_WIDTH,
  engagedFrontLineGap,
  engagedMinBodyGap,
  enemyRangedRearGap,
} from './battleConstants.ts';
import type { CombatantState } from './types.ts';
import {
  applyFormationMarchTick,
  beginEngagedLayout,
  clampEngagedEnemyGroupOnScreen,
  clampPlayerVisualDepth,
  computeEngagedPlayerLaneOffsets,
  computePlayerPositions,
  resolveEngagedLayout,
  resolveStablePlayerEngagedVisuals,
  approachVisualX,
  resolveFormationScreenTargets,
} from './battleLayout.ts';

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
    cooldowns: [],
    statusEffects: [],
    battleX: ROW_X.front,
    visualX: ROW_X.front,
    isEnemy: false,
    ...overrides,
  };
}

describe('battleLayout snapshots', () => {
  it('places front-row defender forward (right) of attacker', () => {
    const positions = computePlayerPositions([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'sword', role: 'attacker', formationRow: 'front', rangePx: 0, isAlive: true },
    ]);
    expect(positions.get('guard')!).toBeGreaterThan(positions.get('sword')!);
    expect(positions.get('guard')! - positions.get('sword')!).toBeCloseTo(
      PLAYER_ROW_SPACING,
      0,
    );
  });

  it('places formation slots with back < front on new axis', () => {
    const positions = computePlayerPositions([
      { id: 'guard', role: 'defender', formationRow: 'front', rangePx: 0, isAlive: true },
      { id: 'archer', role: 'attacker', formationRow: 'back', rangePx: 100, isAlive: true },
    ]);
    expect(positions.get('guard')).toBe(ROW_X.front);
    expect(positions.get('archer')).toBe(ROW_X.back);
    expect(positions.get('guard')!).toBeGreaterThan(positions.get('archer')!);
  });

  it('resolveEngagedLayout returns stable player and enemy visual targets', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          visualX: 200,
          battleX: 180,
          engagedVisualLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeVisualSlot: 0,
        },
      ],
      playerContactBattleX: 180,
      battleVisualOffset: 20,
      frontEnemyVisualAnchor: 270,
      resolveRangedTargetVisualX: () => null,
    });

    expect(layout).not.toBeNull();
    const guardX = layout!.playerVisualX.get('guard')!;
    const meleeX = layout!.enemyVisualX.get('melee')!;
    expect(meleeX - guardX).toBeGreaterThanOrEqual(engagedFrontLineGap() - 1);
  });

  it('resolveEngagedLayout keeps ranged enemy at formation depth behind melee', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          visualX: 200,
          battleX: 180,
          engagedVisualLaneX: 0,
        },
        {
          id: 'archer',
          role: 'attacker',
          formationRow: 'back',
          rangePx: 50,
          isAlive: true,
          visualX: 80,
          battleX: 60,
          engagedVisualLaneX: -120,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeVisualSlot: 0,
        },
        {
          id: 'ranged',
          isAlive: true,
          rangePx: 50,
          battleX: 320,
        },
      ],
      playerContactBattleX: 180,
      battleVisualOffset: 20,
      frontEnemyVisualAnchor: 270,
      resolveRangedTargetVisualX: (enemyId) =>
        enemyId === 'ranged' ? 200 : null,
    });

    expect(layout).not.toBeNull();
    const meleeX = layout!.enemyVisualX.get('melee')!;
    const rangedX = layout!.enemyVisualX.get('ranged')!;
    expect(rangedX).toBeGreaterThan(meleeX);
    expect(rangedX - meleeX).toBeGreaterThanOrEqual(enemyRangedRearGap() - 1);
  });

  it('resolveEngagedLayout keeps ranged behind rearmost melee slot', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'guard',
          role: 'defender',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          visualX: 200,
          battleX: 180,
          engagedVisualLaneX: 0,
        },
      ],
      enemies: [
        {
          id: 'melee-a',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeVisualSlot: 0,
        },
        {
          id: 'melee-b',
          isAlive: true,
          rangePx: 0,
          battleX: 260,
          engagedMeleeVisualSlot: 1,
        },
        {
          id: 'ranged',
          isAlive: true,
          rangePx: 50,
          battleX: 320,
        },
      ],
      playerContactBattleX: 180,
      battleVisualOffset: 20,
      frontEnemyVisualAnchor: 270,
      resolveRangedTargetVisualX: (enemyId) =>
        enemyId === 'ranged' ? 200 : null,
    });

    expect(layout).not.toBeNull();
    const rearMeleeX = layout!.enemyVisualX.get('melee-b')!;
    const rangedX = layout!.enemyVisualX.get('ranged')!;
    expect(rangedX - rearMeleeX).toBeGreaterThanOrEqual(enemyRangedRearGap() - 1);
  });

  it('approachVisualX moves bidirectionally toward target', () => {
    expect(approachVisualX(100, 120, 5)).toBe(105);
    expect(approachVisualX(100, 80, 5)).toBe(95);
  });

  it('keeps back row separated when only one front-row player remains', () => {
    const layout = resolveEngagedLayout({
      players: [
        {
          id: 'sword',
          role: 'attacker',
          formationRow: 'front',
          rangePx: 0,
          isAlive: true,
          visualX: 200,
          battleX: 180,
          engagedVisualLaneX: 0,
        },
        {
          id: 'cleric',
          role: 'supporter',
          formationRow: 'back',
          rangePx: 0,
          isAlive: true,
          visualX: 80,
          battleX: 120,
        },
        {
          id: 'ranger',
          role: 'attacker',
          formationRow: 'back',
          rangePx: 100,
          isAlive: true,
          visualX: 60,
          battleX: 100,
        },
      ],
      enemies: [
        {
          id: 'melee',
          isAlive: true,
          rangePx: 0,
          battleX: 250,
          engagedMeleeVisualSlot: 0,
        },
      ],
      playerContactBattleX: 180,
      battleVisualOffset: 20,
      frontEnemyVisualAnchor: 270,
      resolveRangedTargetVisualX: () => null,
    });
    const swordX = layout!.playerVisualX.get('sword')!;
    const clericX = layout!.playerVisualX.get('cleric')!;
    const rangerX = layout!.playerVisualX.get('ranger')!;
    expect(swordX).toBeGreaterThan(layout!.frontLineVisualX);
    expect(clericX).toBe(80);
    expect(rangerX).toBe(60);
    expect(clericX - rangerX).toBeGreaterThanOrEqual(engagedMinBodyGap() - 1);
  });

  it('orders same-row slots by range with shorter range further forward', () => {
    const positions = computePlayerPositions([
      { id: 'cleric', role: 'supporter', formationRow: 'back', rangePx: 40, isAlive: true },
      { id: 'sigil', role: 'attacker', formationRow: 'back', rangePx: 50, isAlive: true },
      { id: 'geomancer', role: 'attacker', formationRow: 'back', rangePx: 55, isAlive: true },
    ]);
    expect(positions.get('geomancer')!).toBe(ROW_X.back);
    expect(positions.get('sigil')!).toBe(ROW_X.back + PLAYER_ROW_SPACING);
    expect(positions.get('cleric')!).toBe(ROW_X.back + PLAYER_ROW_SPACING * 2);
    expect(positions.get('cleric')! - positions.get('geomancer')!).toBe(
      PLAYER_ROW_SPACING * 2,
    );
  });

  it('applyFormationMarchTick preserves spacing for three back-row units', () => {
    const placements = [
      { id: 'cleric', role: 'supporter' as const, formationRow: 'back' as const, rangePx: 40, isAlive: true },
      { id: 'sigil', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 50, isAlive: true },
      { id: 'geomancer', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 55, isAlive: true },
    ];
    const units = [
      { id: 'geomancer', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 55, isAlive: true as const, visualX: 60 },
      { id: 'sigil', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 50, isAlive: true as const, visualX: 102 },
      { id: 'cleric', role: 'supporter' as const, formationRow: 'back' as const, rangePx: 40, isAlive: true as const, visualX: 144 },
    ];
    for (let i = 0; i < 30; i++) {
      applyFormationMarchTick(units, placements, 1 / 60);
    }
    expect(units[1]!.visualX - units[0]!.visualX).toBeCloseTo(PLAYER_ROW_SPACING, 0);
    expect(units[2]!.visualX - units[1]!.visualX).toBeCloseTo(PLAYER_ROW_SPACING, 0);
  });

  it('computeEngagedPlayerLaneOffsets preserves back-row formation depth', () => {
    const players = [
      { id: 'guard', role: 'defender' as const, formationRow: 'front' as const, rangePx: 0, isAlive: true },
      { id: 'cleric', role: 'supporter' as const, formationRow: 'back' as const, rangePx: 40, isAlive: true },
      { id: 'ranger', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 50, isAlive: true },
    ];
    const lanes = computeEngagedPlayerLaneOffsets(players, 400, 220);
    expect(lanes.get('ranger')).toBe(ROW_X.back - ROW_X.front);
    expect(lanes.get('cleric')).toBe(ROW_X.back + PLAYER_ROW_SPACING - ROW_X.front);
    expect(lanes.get('guard')).toBeGreaterThan(0);
  });

  it('computeEngagedPlayerLaneOffsets anchors rear rows to forwardmost front slot', () => {
    const frontContactX = ROW_X.front + PLAYER_ROW_SPACING;
    const players = [
      { id: 'guard', role: 'defender' as const, formationRow: 'front' as const, rangePx: 0, isAlive: true },
      { id: 'sword', role: 'attacker' as const, formationRow: 'front' as const, rangePx: 0, isAlive: true },
      { id: 'cleric', role: 'supporter' as const, formationRow: 'back' as const, rangePx: 40, isAlive: true },
      { id: 'ranger', role: 'attacker' as const, formationRow: 'back' as const, rangePx: 50, isAlive: true },
    ];
    const lanes = computeEngagedPlayerLaneOffsets(players, 400, 220);
    expect(lanes.get('ranger')).toBe(ROW_X.back - frontContactX);
    expect(lanes.get('cleric')).toBe(
      ROW_X.back + PLAYER_ROW_SPACING - frontContactX,
    );
  });

  it('beginEngagedLayout records rear screen X without snapping front row', () => {
    const clericMarchX = 160;
    const rangerMarchX = 118;
    const guardMarchX = 280;
    const layout = beginEngagedLayout({
      allies: [
        {
          id: 'guard',
          formationRow: 'front',
          visualX: guardMarchX,
          isAlive: true,
        },
        {
          id: 'cleric',
          formationRow: 'back',
          visualX: clericMarchX,
          isAlive: true,
        },
        {
          id: 'ranger',
          formationRow: 'back',
          visualX: rangerMarchX,
          isAlive: true,
        },
      ],
      combatCameraX: 0,
      leadingRow: 'front',
      contactVisualX: guardMarchX,
    });

    expect(layout.combatCameraX).toBe(0);
    expect(layout.allyVisualX.get('guard')).toBe(guardMarchX);
    expect(layout.engageRearScreenX.get('cleric')).toBe(clericMarchX);
    expect(layout.engageRearScreenX.get('ranger')).toBe(rangerMarchX);
    expect(layout.engageRearScreenX.has('guard')).toBe(false);
    expect(layout.engageRearScreenX.get('cleric')! - layout.engageRearScreenX.get('ranger')!).toBeGreaterThanOrEqual(
      PLAYER_ROW_SPACING - 1,
    );
  });

  it('resolveStablePlayerEngagedVisuals keeps absolute rear targets off leading separation', () => {
    const contactVisualX = 280;
    const clericX = 180;
    const rangerX = 138;
    const result = resolveStablePlayerEngagedVisuals(
      [
        {
          id: 'sword',
          formationRow: 'front',
          rangePx: 0,
          battleX: 222,
          isAlive: true,
          engagedVisualLaneX: 0,
        },
        {
          id: 'cleric',
          formationRow: 'back',
          rangePx: 40,
          battleX: 120,
          isAlive: true,
          engagedVisualLaneX: clericX,
        },
        {
          id: 'ranger',
          formationRow: 'back',
          rangePx: 50,
          battleX: 60,
          isAlive: true,
          engagedVisualLaneX: rangerX,
        },
      ],
      contactVisualX,
      0,
      'front',
      true,
    );
    expect(result.get('cleric')).toBe(clericX);
    expect(result.get('ranger')).toBe(rangerX);
    expect(result.get('sword')).toBe(contactVisualX);
  });

  it('resolveFormationScreenTargets matches row + spacing', () => {
    const targets = resolveFormationScreenTargets([
      { id: 'a', role: 'defender', formationRow: 'front', isAlive: true },
      { id: 'b', role: 'attacker', formationRow: 'front', isAlive: true },
    ]);
    expect(targets.get('a')! - targets.get('b')!).toBe(PLAYER_ROW_SPACING);
  });

  it('clampPlayerVisualDepth keeps shorter-range back-row slot further forward', () => {
    const gap = engagedMinBodyGap();
    const frontContactX = ROW_X.front + PLAYER_ROW_SPACING;
    const players = [
      mockCombatant({
        id: 'guard',
        role: 'defender',
        formationRow: 'front',
        visualX: frontContactX,
        battleX: ROW_X.front,
      }),
      mockCombatant({
        id: 'sword',
        role: 'attacker',
        formationRow: 'front',
        visualX: frontContactX,
        battleX: ROW_X.front + PLAYER_ROW_SPACING,
      }),
      mockCombatant({
        id: 'cleric',
        role: 'supporter',
        formationRow: 'back',
        traits: {
          rangePx: 40,
          damageType: 'magic',
          basicAttackVfx: { preset: 'orb' },
        },
        visualX: 320,
        battleX: ROW_X.back + PLAYER_ROW_SPACING,
      }),
      mockCombatant({
        id: 'ranger',
        role: 'attacker',
        formationRow: 'back',
        traits: {
          rangePx: 50,
          damageType: 'physical',
          basicAttackVfx: { preset: 'arrow' },
        },
        visualX: 300,
        battleX: ROW_X.back,
      }),
    ];

    clampPlayerVisualDepth(players);

    const cleric = players.find((p) => p.id === 'cleric')!;
    const ranger = players.find((p) => p.id === 'ranger')!;
    expect(cleric.visualX).toBeGreaterThan(ranger.visualX);
    expect(cleric.visualX - ranger.visualX).toBeGreaterThanOrEqual(gap - 1);
  });
});

describe('clampEngagedEnemyGroupOnScreen', () => {
  it('shifts the enemy group right when any sprite would leave the left edge', () => {
    const combatCameraX = 10;
    const clamped = clampEngagedEnemyGroupOnScreen(
      [
        { id: 'a', visualX: -80, isAlive: true },
        { id: 'b', visualX: -30, isAlive: true },
      ],
      combatCameraX,
    );
    const minScreen = Math.min(
      ...[...clamped.values()].map((x) => x + combatCameraX),
    );
    expect(minScreen).toBeGreaterThanOrEqual(-SPRITE_WIDTH);
  });

  it('still clamps the right edge when the group overflows CANVAS_W', () => {
    const combatCameraX = 0;
    const clamped = clampEngagedEnemyGroupOnScreen(
      [{ id: 'a', visualX: CANVAS_W + 40, isAlive: true }],
      combatCameraX,
    );
    expect(clamped.get('a')! + combatCameraX).toBeLessThanOrEqual(CANVAS_W);
  });
});
