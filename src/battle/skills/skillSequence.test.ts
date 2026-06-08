import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData, SkillCooldown } from '../types.ts';
import { resolveMoveBattleX } from '../combatPosition.ts';
import { SkillExecutor } from './SkillExecutor.ts';
import {
  buildSkillSequence,
  SkillSequenceRunner,
} from './skillSequence.ts';

function mockUnit(
  overrides: Partial<CombatantState> & { id: string },
): CombatantState {
  return {
    name: overrides.id,
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 20,
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

function makeGameData(skills: Record<string, ActiveSkillDef>): GameData {
  return {
    skillRegistry: {
      passives: {},
      actives: skills,
    },
  } as unknown as GameData;
}

describe('skillSequence', () => {
  it('schedules applyAt for move + damage + move', () => {
    const skill: ActiveSkillDef = {
      id: 'flank',
      name: 'flank',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          type: 'move',
          targetRule: 'farthestEnemy',
          moveMode: 'engage',
          moveDurationSec: 0.3,
        },
        {
          type: 'damage',
          targetRule: 'farthestEnemy',
          damageType: 'physical',
          powerMultiplier: 1.5,
        },
        {
          type: 'move',
          targetRule: 'closestAlly',
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
        },
      ],
    };
    const actor = mockUnit({ id: 'actor', battleX: 180 });
    const ally = mockUnit({ id: 'ally', battleX: 220 });
    const enemyFar = mockUnit({ id: 'far', isEnemy: true, battleX: 40 });
    const enemyNear = mockUnit({ id: 'near', isEnemy: true, battleX: 80 });
    const cd: SkillCooldown = { skillId: 'flank', remaining: 0, slotKind: 'active' };

    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor, ally],
      [enemyNear, enemyFar],
      makeGameData({ flank: skill }),
      [],
      10,
      cd,
    );

    expect(sequence).not.toBeNull();
    expect(sequence!.steps.map((s) => s.applyAtBattleSec)).toEqual([10, 10.3, 10.3]);
    expect(sequence!.steps[0]!.targetId).toBe('far');
    expect(sequence!.steps[2]!.targetId).toBe('ally');
  });

  it('interpolates battleX during move', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 100 });
    runner.startMove({
      actorId: 'actor',
      fromX: 100,
      toX: 50,
      remainingSec: 1,
      totalSec: 1,
      baseVisualX: 210,
    });

    runner.tickMoves(0.5, [actor]);
    expect(actor.battleX).toBe(75);

    runner.tickMoves(0.5, [actor]);
    expect(actor.battleX).toBe(50);
    expect(runner.getActiveMoves()).toHaveLength(0);
  });

  it('applies damage after move completes within range', () => {
    const runner = new SkillSequenceRunner();
    const events: string[] = [];
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 50, hp: 100 });
    const skill: ActiveSkillDef = {
      id: 'charge',
      name: 'charge',
      trigger: { kind: 'time', value: 5 },
      effect: [
        {
          type: 'move',
          targetRule: 'frontEnemy',
          moveMode: 'engage',
          moveDurationSec: 0.2,
        },
        {
          type: 'damage',
          targetRule: 'frontEnemy',
          damageType: 'physical',
          powerMultiplier: 1,
        },
      ],
    };
    const cd: SkillCooldown = { skillId: 'charge', remaining: 0, slotKind: 'active' };
    const data = makeGameData({ charge: skill });
    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor],
      [enemy],
      data,
      [],
      0,
      cd,
    )!;

    const executor = new SkillExecutor(data, (event) => {
      if (event.type === 'skill' && event.effect === 'damage') {
        events.push(`damage:${event.amount}`);
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    runner.schedule(sequence);
    runner.tickSequences(0, (step) => {
      executor.applyScheduledStep(step, [actor], [enemy]);
    });
    runner.tickMoves(0.2, [actor, enemy]);
    runner.tickSequences(0.2, (step) => {
      executor.applyScheduledStep(step, [actor], [enemy]);
    });

    expect(actor.battleX).toBe(50);
    expect(events.length).toBe(1);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('returns actor near closestAlly after 3-step flank', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const ally = mockUnit({ id: 'ally', battleX: 210 });
    const enemyFar = mockUnit({ id: 'far', isEnemy: true, battleX: 30 });
    const enemyNear = mockUnit({ id: 'near', isEnemy: true, battleX: 70 });

    const skill: ActiveSkillDef = {
      id: 'flank',
      name: 'flank',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          type: 'move',
          targetRule: 'farthestEnemy',
          moveMode: 'engage',
          moveDurationSec: 0.1,
        },
        {
          type: 'damage',
          targetRule: 'farthestEnemy',
          damageType: 'physical',
          powerMultiplier: 1,
        },
        {
          type: 'move',
          targetRule: 'closestAlly',
          moveMode: 'toAnchor',
          moveDurationSec: 0.1,
        },
      ],
    };
    const cd: SkillCooldown = { skillId: 'flank', remaining: 0, slotKind: 'active' };
    const data = makeGameData({ flank: skill });
    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor, ally],
      [enemyNear, enemyFar],
      data,
      [],
      0,
      cd,
    )!;

    const executor = new SkillExecutor(data, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, ally, enemyNear, enemyFar],
      getSequenceRunner: () => runner,
    });

    runner.schedule(sequence);
    runner.tickSequences(0, (step) => {
      executor.applyScheduledStep(step, [actor, ally], [enemyNear, enemyFar]);
    });
    runner.tickMoves(0.1, [actor, ally, enemyNear, enemyFar]);
    runner.tickSequences(0.1, (step) => {
      executor.applyScheduledStep(step, [actor, ally], [enemyNear, enemyFar]);
    });
    runner.tickMoves(0.1, [actor, ally, enemyNear, enemyFar]);
    runner.tickSequences(0.2, () => {});

    expect(actor.battleX).toBe(ally.battleX);
    expect(cd.remaining).toBe(8);
  });

  it('marks actor busy during skill move so engine can skip auto-approach', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    runner.startMove({
      actorId: 'actor',
      fromX: 200,
      toX: 100,
      remainingSec: 1,
      totalSec: 1,
      baseVisualX: 210,
    });

    expect(runner.isActorBusy('actor')).toBe(true);

    runner.tickMoves(1, [actor]);
    expect(actor.battleX).toBe(100);
    expect(runner.isActorBusy('actor')).toBe(false);
  });
});

describe('resolveMoveBattleX', () => {
  const basicData = makeGameData({
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
  });

  it('engage places ally at enemy contact range', () => {
    const actor = mockUnit({ id: 'a', battleX: 200 });
    const enemy = mockUnit({ id: 'e', isEnemy: true, battleX: 60 });
    const x = resolveMoveBattleX(
      actor,
      enemy,
      { type: 'move', targetRule: 'frontEnemy', moveDurationSec: 0.2, moveMode: 'engage' },
      basicData,
    );
    expect(x).toBe(60);
  });

  it('toAnchor snaps to ally position', () => {
    const actor = mockUnit({ id: 'a', battleX: 40 });
    const ally = mockUnit({ id: 'ally', battleX: 215 });
    const x = resolveMoveBattleX(
      actor,
      ally,
      { type: 'move', targetRule: 'closestAlly', moveDurationSec: 0.2, moveMode: 'toAnchor' },
      basicData,
    );
    expect(x).toBe(215);
  });
});
