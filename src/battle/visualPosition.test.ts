import { describe, expect, it } from 'vitest';
import { resolveAttackBattleX } from './combatPosition.ts';
import { hideFallenAllyCorpses } from './entities.ts';
import {
  approachAllyVisualX,
  computeAllyPositions,
  computeEngagedAllyTargets,
  computeEngagedEnemyPositions,
  clampAllyVisualDepth,
  engagedMinLeftEdgeGap,
  getLeadingAllyFront,
  moveTowardX,
  resolveEngagedVisualTargets,
  resolveMoveVisualX,
  ROW_X,
} from '../render/formationLayout.ts';
import type { ActiveSkillMove } from './skills/skillSequence.ts';
import type { CombatantState, GameData } from './types.ts';
import { DEFAULT_MELEE_RANGE_PX } from './types.ts';

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
    visualX: 210,
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
            targetRule: 'frontEnemy',
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

describe('visual position separation', () => {
  it('keeps visual standoff target ahead of battleX contact for melee range 0', () => {
    const contactX = 80;
    const sword = mockCombatant({
      id: 'sword',
      cooldowns: [{ skillId: 'basic', remaining: 0, slotKind: 'basic' }],
    });

    const battleTarget = resolveAttackBattleX(sword, contactX, gameData);
    expect(battleTarget).toBe(contactX);

    const visualTargets = computeEngagedAllyTargets(
      [
        {
          id: sword.id,
          role: sword.role,
          formationRow: sword.formationRow,
          rangePx: DEFAULT_MELEE_RANGE_PX,
          isAlive: true,
        },
      ],
      contactX,
    );
    const visualTarget = visualTargets.get(sword.id)!;

    expect(visualTarget).toBeGreaterThan(battleTarget);
    expect(visualTarget).toBeGreaterThanOrEqual(
      contactX + Math.max(DEFAULT_MELEE_RANGE_PX, engagedMinLeftEdgeGap()),
    );
  });

  it('interpolates visualX toward standoff target during skill move', () => {
    const enemy = mockCombatant({
      id: 'enemy',
      isEnemy: true,
      battleX: 80,
      visualX: 80,
    });
    const actor = mockCombatant({
      id: 'actor',
      battleX: 200,
      visualX: 210,
    });
    const toVisualX = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      targetRule: 'frontEnemy',
      moveDurationSec: 0.2,
      moveMode: 'engage',
    });
    const move: ActiveSkillMove = {
      actorId: 'actor',
      fromX: 200,
      toX: 80,
      toVisualX,
      remainingSec: 0.5,
      totalSec: 1,
      baseVisualX: 210,
    };

    actor.battleX = 140;
    applySkillMoveVisualOverlay(actor, move);

    expect(toVisualX).toBeGreaterThan(enemy.visualX);
    expect(actor.visualX).toBeGreaterThan(enemy.visualX);
    expect(actor.visualX).toBe(210 + (toVisualX - 210) * 0.5);
  });

  it('does not mirror battleX approach into visualX for melee', () => {
    const ally = mockCombatant({
      id: 'ally',
      battleX: 200,
      visualX: 210,
    });
    const contactX = 80;

    ally.battleX = contactX;
    expect(ally.visualX).toBe(210);
    expect(ally.battleX).not.toBe(ally.visualX);
  });

  it('hideFallenAllyCorpses clears corpseVisible for dead allies only', () => {
    const living = mockCombatant({ id: 'living' });
    const fallen = mockCombatant({
      id: 'fallen',
      hp: 0,
      isAlive: false,
      corpseVisible: true,
    });
    hideFallenAllyCorpses([living, fallen]);
    expect(living.corpseVisible).toBe(true);
    expect(fallen.corpseVisible).toBe(false);
  });

  it('computeAllyPositions ignores hidden corpses when not engaged', () => {
    const positions = computeAllyPositions([
      {
        id: 'living',
        role: 'attacker',
        formationRow: 'middle',
        rangePx: DEFAULT_MELEE_RANGE_PX,
        isAlive: true,
      },
    ]);
    expect(positions.get('living')).toBe(ROW_X.middle);
    expect(positions.has('fallen')).toBe(false);
  });

  it('approachAllyVisualX does not move right when standoff target is ahead', () => {
    const current = 326;
    const standoffTarget = 350;
    expect(approachAllyVisualX(current, standoffTarget, 10)).toBe(current);
    expect(approachAllyVisualX(current, 300, 10)).toBe(316);
  });

  it('clampAllyVisualDepth keeps back row right of leading front', () => {
    const guard = mockCombatant({
      id: 'guard',
      formationRow: 'front',
      visualX: 200,
    });
    const archer = mockCombatant({
      id: 'archer',
      formationRow: 'back',
      traits: { attackRange: 'ranged', rangePx: 140 },
      visualX: 180,
    });
    clampAllyVisualDepth([guard, archer]);
    expect(archer.visualX).toBe(200 + (ROW_X.back - ROW_X.front));
  });

  it('getLeadingAllyFront uses leading formation row not global min visualX', () => {
    const front = getLeadingAllyFront([
      {
        id: 'guard',
        role: 'defender',
        formationRow: 'front',
        rangePx: DEFAULT_MELEE_RANGE_PX,
        isAlive: true,
        visualX: 210,
      },
      {
        id: 'archer',
        role: 'attacker',
        formationRow: 'back',
        rangePx: 140,
        isAlive: true,
        visualX: 180,
      },
    ]);
    expect(front?.visualX).toBe(210);
    expect(front?.rangePx).toBe(DEFAULT_MELEE_RANGE_PX);
  });

  it('getLeadingAllyFront tracks back row when only ranged survivor remains', () => {
    const front = getLeadingAllyFront([
      {
        id: 'archer',
        role: 'attacker',
        formationRow: 'back',
        rangePx: 140,
        isAlive: true,
        visualX: 326,
      },
    ]);
    expect(front?.visualX).toBe(326);
    expect(front?.rangePx).toBe(140);
  });

  it('computeEngagedEnemyPositions stops before leading front row not back row', () => {
    const leadingFront = getLeadingAllyFront([
      {
        id: 'guard',
        role: 'defender',
        formationRow: 'front',
        rangePx: DEFAULT_MELEE_RANGE_PX,
        isAlive: true,
        visualX: 200,
      },
      {
        id: 'archer',
        role: 'attacker',
        formationRow: 'back',
        rangePx: 140,
        isAlive: true,
        visualX: 326,
      },
    ]);
    expect(leadingFront?.visualX).toBe(200);
    const targets = computeEngagedEnemyPositions(
      [
        {
          id: 'melee',
          visualX: 50,
          rangePx: 0,
          isAlive: true,
        },
      ],
      leadingFront!.visualX,
      leadingFront!.rangePx,
    );
    expect(targets.get('melee')).toBe(200 - engagedMinLeftEdgeGap());
    expect(targets.get('melee')!).toBeLessThan(326);
  });

  it('computeEngagedEnemyPositions tracks front ally X for stop distance', () => {
    const frontAllyX = 326;
    const targets = computeEngagedEnemyPositions(
      [
        {
          id: 'melee',
          visualX: 500,
          rangePx: 0,
          isAlive: true,
        },
      ],
      frontAllyX,
      140,
    );
    expect(targets.get('melee')).toBe(frontAllyX - engagedMinLeftEdgeGap());
  });
});

describe('resolveEngagedVisualTargets', () => {
  const stage2Wave1Allies = [
    {
      id: 'guard',
      role: 'defender' as const,
      formationRow: 'front' as const,
      rangePx: DEFAULT_MELEE_RANGE_PX,
      isAlive: true,
      visualX: ROW_X.front,
    },
    {
      id: 'sword',
      role: 'attacker' as const,
      formationRow: 'front' as const,
      rangePx: DEFAULT_MELEE_RANGE_PX,
      isAlive: true,
      visualX: ROW_X.front + 42,
    },
    {
      id: 'healer',
      role: 'healer' as const,
      formationRow: 'front' as const,
      rangePx: DEFAULT_MELEE_RANGE_PX,
      isAlive: true,
      visualX: ROW_X.front + 84,
    },
    {
      id: 'archer',
      role: 'attacker' as const,
      formationRow: 'back' as const,
      rangePx: 140,
      isAlive: true,
      visualX: ROW_X.back,
    },
  ];

  const stage2Wave1Enemies = [
    { id: 'e1', visualX: -15, rangePx: 0, isAlive: true },
    { id: 'e2', visualX: -5, rangePx: 0, isAlive: true },
    { id: 'e3', visualX: 5, rangePx: 0, isAlive: true },
  ];

  it('Stage 2 Wave 1 full party: enemies stop left of front line not archer', () => {
    const layout = resolveEngagedVisualTargets(
      stage2Wave1Allies,
      stage2Wave1Enemies,
      5,
      DEFAULT_MELEE_RANGE_PX,
    );
    expect(layout).not.toBeNull();

    const { allyTargets, enemyTargets, frontLineTargetX } = layout!;
    expect(frontLineTargetX).toBeLessThan(ROW_X.back);

    const frontRowTargets = [
      allyTargets.get('guard')!,
      allyTargets.get('sword')!,
      allyTargets.get('healer')!,
    ];
    const minFrontTarget = Math.min(...frontRowTargets);
    const maxEnemyTarget = Math.max(...enemyTargets.values());

    expect(maxEnemyTarget).toBeLessThan(ROW_X.back);
    expect(maxEnemyTarget).toBeLessThan(minFrontTarget);
    expect(allyTargets.get('archer')).toBeGreaterThanOrEqual(ROW_X.back - 1);
    expect(minFrontTarget).toBeLessThan(ROW_X.back - 50);
  });

  it('shifts enemy stop targets right when front row is eliminated', () => {
    const before = resolveEngagedVisualTargets(
      stage2Wave1Allies,
      stage2Wave1Enemies,
      5,
      DEFAULT_MELEE_RANGE_PX,
    );
    expect(before).not.toBeNull();
    const maxBefore = Math.max(...before!.enemyTargets.values());

    const withoutFront = stage2Wave1Allies.filter(
      (a) => a.formationRow !== 'front',
    );
    const after = resolveEngagedVisualTargets(
      withoutFront,
      stage2Wave1Enemies,
      5,
      DEFAULT_MELEE_RANGE_PX,
    );
    expect(after).not.toBeNull();
    const maxAfter = Math.max(...after!.enemyTargets.values());
    expect(maxAfter).toBeGreaterThan(maxBefore);
  });

  it('keeps archer at ROW_X.back when only back row survives', () => {
    const frontEnemyX = 50;
    const layout = resolveEngagedVisualTargets(
      [
        {
          id: 'archer',
          role: 'attacker',
          formationRow: 'back',
          rangePx: 140,
          isAlive: true,
          visualX: ROW_X.back,
        },
      ],
      [{ id: 'e1', visualX: frontEnemyX, rangePx: 0, isAlive: true }],
      frontEnemyX,
      DEFAULT_MELEE_RANGE_PX,
    );
    expect(layout).not.toBeNull();
    expect(layout!.frontLineTargetX).toBeGreaterThanOrEqual(ROW_X.back - 1);
    expect(layout!.allyTargets.get('archer')).toBeGreaterThanOrEqual(
      ROW_X.back - 1,
    );
    expect(Math.max(...layout!.enemyTargets.values())).toBeLessThan(
      layout!.frontLineTargetX,
    );
    expect(Math.max(...layout!.enemyTargets.values())).toBeGreaterThan(
      frontEnemyX,
    );
  });
});

describe('enemy visual bidirectional approach', () => {
  it('moveTowardX closes gap when target is left of current (one-way bug fix)', () => {
    const target = 198;
    const stuckAt = 250;
    const step = 10;

    const next = moveTowardX(stuckAt, target, step);
    expect(next).toBe(240);
    expect(next).toBeLessThan(stuckAt);

    const oneWayWouldStay = stuckAt;
    expect(oneWayWouldStay).toBe(250);
    expect(next).not.toBe(oneWayWouldStay);
  });
});

describe('resolveMoveVisualX', () => {
  it('engage places ally at anchor standoff', () => {
    const actor = mockCombatant({ id: 'a', visualX: 210 });
    const enemy = mockCombatant({
      id: 'e',
      isEnemy: true,
      visualX: 80,
    });
    const x = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      targetRule: 'frontEnemy',
      moveDurationSec: 0.2,
      moveMode: 'engage',
    });
    expect(x).toBe(
      enemy.visualX +
        Math.max(DEFAULT_MELEE_RANGE_PX, engagedMinLeftEdgeGap()),
    );
  });

  it('toAnchor snaps to anchor visualX', () => {
    const actor = mockCombatant({ id: 'a', visualX: 40 });
    const ally = mockCombatant({ id: 'ally', visualX: 215 });
    const x = resolveMoveVisualX(actor, ally, {
      type: 'move',
      targetRule: 'closestAlly',
      moveDurationSec: 0.2,
      moveMode: 'toAnchor',
    });
    expect(x).toBe(215);
  });

  it('behindTarget offsets past anchor visualX', () => {
    const actor = mockCombatant({ id: 'a', visualX: 210 });
    const enemy = mockCombatant({
      id: 'e',
      isEnemy: true,
      visualX: 80,
    });
    const x = resolveMoveVisualX(actor, enemy, {
      type: 'move',
      targetRule: 'frontEnemy',
      moveDurationSec: 0.2,
      moveMode: 'behindTarget',
      behindOffsetPx: 20,
    });
    expect(x).toBe(60);
  });
});
