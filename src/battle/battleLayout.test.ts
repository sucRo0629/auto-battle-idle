import { describe, expect, it } from 'vitest';
import {
  PLAYER_ROW_SPACING,
  ROW_X,
  SCROLL_SPEED,
  engagedFrontLineGap,
  engagedMinBodyGap,
  enemyRangedRearGap,
} from './battleConstants.ts';
import {
  getBattleContactPlayerVisual,
  syncAllFieldX,
} from './combatPosition.ts';
import { hideFallenAllyCorpses } from './entities.ts';
import type { ActiveSkillMove } from './skills/skillSequence.ts';
import type { CombatantState, GameData } from './types.ts';
import {
  applyFormationMarchTick,
  applyStaggeredFormationMarchRestore,
  beginEngagedLayout,
  clampPlayerVisualDepth,
  computeEngagedPlayerLaneOffsets,
  computeEnemyStopX,
  computeRangedEnemyVisualX,
  getLeadingPlayerFront,
  isFormationScreenLayoutRestored,
  resolveEngagedLayout,
  resolveStablePlayerEngagedVisuals,
  approachVisualX,
  resolveMoveVisualX,
  tickCompensatedFormationReset,
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
    cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    statusEffects: [],
    spriteKey: 'placeholder',
    iconKey: 'placeholder',
    isEnemy: false,
    battleX: ROW_X.front,
    visualX: ROW_X.front,
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
            target: { kind: 'distance', side: 'enemy', order: 'nearest' },
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

describe('battleLayout snapshots', () => {
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
    expect(clericX).toBe(120);
    expect(rangerX).toBe(100);
    expect(clericX - rangerX).toBeGreaterThanOrEqual(engagedMinBodyGap() - 1);
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

  it('resolveMoveVisualX engage places player left of enemy anchor', () => {
    const actor = mockCombatant({ id: 'a', visualX: 180 });
    const enemy = mockCombatant({ id: 'e', isEnemy: true, visualX: 280 });
    const x = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
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
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
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

describe('battle contact (R1-fix: battleX single)', () => {
  it('getBattleContactPlayerVisual picks leading row contact, not advanced back row', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 180,
      visualX: 200,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { rangePx: 50, damageType: 'physical', basicAttackVfx: { preset: 'arrow', arc: true } },
      battleX: 220,
      visualX: 120,
    });
    const contact = getBattleContactPlayerVisual([guard, archer], gameData);
    expect(contact?.battleX).toBe(180);
  });

  it('syncAllFieldX mirrors battleX into visualX', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      battleX: 180,
      visualX: 200,
    });
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 250,
      visualX: 0,
    });
    syncAllFieldX([guard, enemy]);
    expect(guard.visualX).toBe(180);
    expect(enemy.visualX).toBe(250);
  });
});
