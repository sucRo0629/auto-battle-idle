import { describe, expect, it } from 'vitest';
import { resolveAttackBattleX } from './combatPosition.ts';
import {
  computeEngagedAllyTargets,
  engagedMinLeftEdgeGap,
  resolveMoveVisualX,
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
            powerMultiplier: 1,
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
