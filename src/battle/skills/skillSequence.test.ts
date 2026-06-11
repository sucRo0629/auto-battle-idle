import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState, GameData, SkillCooldown } from '../types.ts';
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
          target: { kind: "distance", side: "enemy", order: "farthest" },
          moveMode: 'engage',
          moveDurationSec: 0.3,
        },
        {
          type: 'damage',
          target: { kind: "distance", side: "enemy", order: "farthest" },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1.5 },
        },
        {
          type: 'move',
          target: { kind: "distance", side: "ally", order: "nearest" },
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

  it('toAnchor ally step keeps ally anchor when targetRuleOverride passive is equipped', () => {
    const skill: ActiveSkillDef = {
      id: 'backstab',
      name: 'backstab',
      trigger: { kind: 'time', value: 3 },
      effect: [
        {
          type: 'move',
          moveMode: 'behindTarget',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          behindOffsetPx: 10,
        },
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'ally', order: 'nearest' },
        },
      ],
    };
    const actor = mockUnit({ id: 'assassin', battleX: 220 });
    const ally = mockUnit({ id: 'warrior', battleX: 180 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    const cd: SkillCooldown = {
      skillId: 'backstab',
      remaining: 0,
      slotKind: 'active',
    };
    const gameData = {
      skillRegistry: {
        passives: {
          passive_target_lowest_hp: {
            id: 'passive_target_lowest_hp',
            name: '仕留めの眼',
            effect: 'targetRuleOverride',
            targetRuleOverride: {
              kind: 'stat',
              side: 'enemy',
              stat: 'hp',
              order: 'lowest',
            },
          },
        },
        actives: { backstab: skill },
      },
    } as unknown as GameData;
    const passives = [gameData.skillRegistry.passives.passive_target_lowest_hp];

    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor, ally],
      [enemy],
      gameData,
      passives,
      5,
      cd,
    );

    expect(sequence).not.toBeNull();
    expect(sequence!.steps[0]!.targetId).toBe('enemy');
    expect(sequence!.steps[2]!.targetId).toBe('warrior');
  });

  it('waitAfterSec delays the next effect in move sequences', () => {
    const skill: ActiveSkillDef = {
      id: 'backstab',
      name: 'backstab',
      trigger: { kind: 'time', value: 3 },
      effect: [
        {
          type: 'move',
          moveMode: 'behindTarget',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          behindOffsetPx: 10,
        },
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          waitAfterSec: 0.2,
        },
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'ally', order: 'nearest' },
        },
      ],
    };
    const actor = mockUnit({ id: 'assassin', battleX: 220 });
    const ally = mockUnit({ id: 'warrior', battleX: 180 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    const cd: SkillCooldown = {
      skillId: 'backstab',
      remaining: 0,
      slotKind: 'active',
    };

    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor, ally],
      [enemy],
      makeGameData({ backstab: skill }),
      [],
      0,
      cd,
    );

    expect(sequence).not.toBeNull();
    expect(sequence!.steps.map((s) => s.applyAtBattleSec)).toEqual([
      0,
      0.3,
      0.5,
    ]);
  });

  it('interpolates battleX during move', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 100 });
    runner.startMove({
      actorId: 'actor',
      fromX: 100,
      toX: 50,
      toVisualX: 125,
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
          target: { kind: "distance", side: "enemy", order: "nearest" },
          moveMode: 'engage',
          moveDurationSec: 0.2,
        },
        {
          type: 'damage',
          target: { kind: "distance", side: "enemy", order: "nearest" },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
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
          target: { kind: "distance", side: "enemy", order: "farthest" },
          moveMode: 'engage',
          moveDurationSec: 0.1,
        },
        {
          type: 'damage',
          target: { kind: "distance", side: "enemy", order: "farthest" },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
        {
          type: 'move',
          target: { kind: "distance", side: "ally", order: "nearest" },
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
      toVisualX: 150,
      remainingSec: 1,
      totalSec: 1,
      baseVisualX: 210,
    });

    expect(runner.isActorInSkillMotion('actor')).toBe(true);
    expect(runner.isActorBusy('actor')).toBe(true);

    runner.tickMoves(1, [actor]);
    expect(actor.battleX).toBe(100);
    expect(runner.isActorBusy('actor')).toBe(false);
  });

  it('beginUse marks actor busy until tickUseLocks elapses', () => {
    const runner = new SkillSequenceRunner();
    expect(runner.isActorBusy('actor')).toBe(false);
    expect(runner.isActorInSkillMotion('actor')).toBe(false);

    runner.beginUse('actor', 0.4);
    expect(runner.isActorBusy('actor')).toBe(true);
    expect(runner.isActorInSkillMotion('actor')).toBe(false);

    runner.tickUseLocks(0.2);
    expect(runner.isActorBusy('actor')).toBe(true);

    runner.tickUseLocks(0.2);
    expect(runner.isActorBusy('actor')).toBe(false);
  });

  it('beginUse keeps the longer remaining lock', () => {
    const runner = new SkillSequenceRunner();
    runner.beginUse('actor', 0.3);
    runner.beginUse('actor', 0.5);

    runner.tickUseLocks(0.3);
    expect(runner.isActorBusy('actor')).toBe(true);

    runner.tickUseLocks(0.2);
    expect(runner.isActorBusy('actor')).toBe(false);
  });

  it('clearForActor removes use lock', () => {
    const runner = new SkillSequenceRunner();
    runner.beginUse('actor', 1);
    runner.clearForActor('actor');
    expect(runner.isActorBusy('actor')).toBe(false);
  });
});
