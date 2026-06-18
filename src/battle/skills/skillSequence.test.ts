import { describe, expect, it } from 'vitest';
import { applyStunToTarget } from '../ccEffects.ts';
import { resolveAttackBattleX } from '../combatPosition.ts';
import type { ActiveSkillDef, CombatantState, GameData, SkillCooldown } from '../types.ts';
import { SkillExecutor } from './SkillExecutor.ts';
import {
  buildSkillSequence,
  resolveActiveEffectGaugeDurationSec,
  resolveMaxSelfBuffEffectDurationSec,
  resolveSequenceWallClockSec,
  SkillSequenceRunner,
} from './skillSequence.ts';
import { getEffectTarget } from './targetSpec.ts';

import { mockCombatant } from '../testFixtures.ts';

function mockUnit(overrides: Partial<CombatantState> & { id: string }): CombatantState {
  return mockCombatant(
    { atk: 20, battleX: 200, visualX: 200, ...overrides },
    'meleeFront',
  );
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
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          anchorOffsetPx: 10,
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
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          anchorOffsetPx: 10,
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

  it('skips return-to-ally move when actor is the only living ally', () => {
    const skill: ActiveSkillDef = {
      id: 'backstab',
      name: 'backstab',
      trigger: { kind: 'basicAttackCount', value: 14 },
      effect: [
        {
          type: 'buff',
          buffSubKind: 'evasion',
          buffStat: 'atk',
          buffMultiplier: 1.2,
          buffDurationSec: 1.5,
          target: { kind: 'self' },
        },
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          anchorOffsetPx: 10,
        },
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          waitAfterSec: 0.5,
        },
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.25,
          target: { kind: 'distance', side: 'ally', order: 'nearest' },
        },
      ],
    };
    const actor = mockUnit({ id: 'assassin', battleX: 220 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    const cd: SkillCooldown = {
      skillId: 'backstab',
      remaining: 0,
      slotKind: 'active',
    };

    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor],
      [enemy],
      makeGameData({ backstab: skill }),
      [],
      0,
      cd,
    );

    expect(sequence).not.toBeNull();
    expect(sequence!.steps).toHaveLength(3);
    const moveSteps = sequence!.steps.filter((step) => step.effectDef.type === 'move');
    expect(moveSteps).toHaveLength(1);
    expect(getEffectTarget(moveSteps[0]!.effectDef).side).toBe('enemy');
    expect(
      sequence!.steps.every(
        (step) =>
          step.effectDef.type !== 'move' ||
          getEffectTarget(step.effectDef).side !== 'ally',
      ),
    ).toBe(true);
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

  it('pauses skill move while actor is stunned', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 100 });
    applyStunToTarget(actor, 2, { skillId: 'bash', sourceId: 'ally' });
    runner.startMove({
      actorId: 'actor',
      fromX: 100,
      toX: 50,
      toVisualX: 50,
      remainingSec: 1,
      totalSec: 1,
      baseVisualX: 100,
    });

    runner.tickMoves(0.5, [actor]);
    expect(actor.battleX).toBe(100);
    expect(runner.getActiveMoves()).toHaveLength(1);
    expect(runner.getActiveMoves()[0]?.remainingSec).toBe(1);
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

    expect(actor.battleX).toBe(resolveAttackBattleX(actor, enemy.battleX, data));
    expect(events.length).toBe(1);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('move sequence pierce selfOrigin does not damage actor', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({
      id: 'lancer',
      battleX: 100,
      hp: 150,
      maxHp: 150,
      traits: { rangePx: 70, damageType: 'physical', basicAttackVfx: { enabled: true } },
    });
    const near = mockUnit({ id: 'near', isEnemy: true, battleX: 240, hp: 9999999, maxHp: 9999999 });
    const far = mockUnit({ id: 'far', isEnemy: true, battleX: 360, hp: 9999999, maxHp: 9999999 });
    const skill: ActiveSkillDef = {
      id: 'lunge',
      name: '踏み込み突き',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          type: 'move',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          moveMode: 'toAnchor',
          moveDurationSec: 0.25,
          anchorOffsetPx: -32,
        },
        {
          targetShape: 'pierce',
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1.1 },
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        },
        {
          type: 'knockback',
          distancePx: 30,
          targetShape: 'pierce',
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        },
      ],
    };
    const cd: SkillCooldown = { skillId: 'lunge', remaining: 0, slotKind: 'active' };
    const data = makeGameData({ lunge: skill });
    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor],
      [near, far],
      data,
      [],
      0,
      cd,
    )!;

    const damageTargets: string[] = [];
    const executor = new SkillExecutor(data, (event) => {
      if (event.type === 'skill' && event.effect === 'damage' && event.targetId) {
        damageTargets.push(event.targetId);
      }
    }, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, near, far],
      getSequenceRunner: () => runner,
    });

    const runSequence = () => {
      const seq = buildSkillSequence(
        skill,
        actor,
        [actor],
        [near, far],
        data,
        [],
        0,
        { ...cd },
      )!;
      runner.schedule(seq);
      runner.tickSequences(0, (step) => {
        executor.applyScheduledStep(step, [actor], [near, far]);
      });
      runner.tickMoves(0.25, [actor, near, far]);
      runner.tickSequences(0.25, (step) => {
        executor.applyScheduledStep(step, [actor], [near, far]);
      });
    };

    runSequence();
    expect(actor.hp).toBe(150);
    expect(damageTargets).not.toContain('lancer');

    runSequence();
    expect(actor.hp).toBe(150);
    expect(damageTargets.filter((id) => id === 'lancer')).toHaveLength(0);
  });

  it('tailWaitAfterSec keeps actor in skill motion until wait elapses', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 220 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 260 });
    const skill: ActiveSkillDef = {
      id: 'backstab',
      name: 'backstab',
      trigger: { kind: 'time', value: 3 },
      effect: [
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.2,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          anchorOffsetPx: 10,
        },
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          waitAfterSec: 0.5,
        },
      ],
    };
    const cd: SkillCooldown = {
      skillId: 'backstab',
      remaining: 0,
      slotKind: 'active',
    };
    const data = makeGameData({ backstab: skill });
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

    const executor = new SkillExecutor(data, () => {}, {
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

    expect(runner.isActorInSkillMotion('actor')).toBe(true);
    expect(cd.remaining).toBe(0);

    runner.tickSequences(0.69, () => {});
    expect(runner.isActorInSkillMotion('actor')).toBe(true);

    runner.tickSequences(0.7, () => {});
    expect(runner.isActorInSkillMotion('actor')).toBe(false);
    expect(cd.remaining).toBe(3);
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

  it('re-resolves engage move anchor when build-time target died', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 220 });
    const enemyWasTarget = mockUnit({
      id: 'was',
      isEnemy: true,
      battleX: 80,
      hp: 0,
      isAlive: false,
    });
    const enemyAlive = mockUnit({
      id: 'alive',
      isEnemy: true,
      battleX: 50,
      hp: 100,
    });
    const skill: ActiveSkillDef = {
      id: 'shadow_return',
      name: 'shadow_return',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          type: 'move',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          moveMode: 'engage',
          moveDurationSec: 0.2,
        },
      ],
    };
    const cd: SkillCooldown = {
      skillId: 'shadow_return',
      remaining: 0,
      slotKind: 'active',
    };
    const data = makeGameData({ shadow_return: skill });
    const sequence = buildSkillSequence(
      skill,
      actor,
      [actor],
      [{ ...enemyWasTarget, hp: 100, isAlive: true }, enemyAlive],
      data,
      [],
      0,
      cd,
    )!;
    const engageStep = sequence.steps[0]!;
    expect(engageStep.targetId).toBe('was');

    const executor = new SkillExecutor(data, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemyWasTarget, enemyAlive],
      getSequenceRunner: () => runner,
    });

    executor.applyScheduledStep(
      engageStep,
      [actor],
      [enemyWasTarget, enemyAlive],
    );

    const expectedX = resolveAttackBattleX(actor, enemyAlive.battleX, data);
    expect(runner.getActiveMoves()).toHaveLength(1);
    expect(runner.getActiveMoves()[0]!.toX).toBe(expectedX);
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

  it('blocks basic attack during skill motion even after useDuration lock expires', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    runner.beginUse('actor', 0.2);
    runner.startMove({
      actorId: 'actor',
      fromX: 200,
      toX: 100,
      toVisualX: 150,
      remainingSec: 0.5,
      totalSec: 0.5,
      baseVisualX: 210,
    });

    runner.tickUseLocks(0.2);
    expect(runner.isActorUseLocked('actor')).toBe(false);
    expect(runner.isActorInSkillMotion('actor')).toBe(true);
    expect(runner.isBasicAttackBlocked('actor')).toBe(true);

    runner.tickMoves(0.5, [actor]);
    expect(runner.isBasicAttackBlocked('actor')).toBe(false);
  });

  it('resolveSequenceWallClockSec covers final move tail wait', () => {
    const skill: ActiveSkillDef = {
      id: 'shadow',
      name: 'shadow',
      trigger: { kind: 'basicAttackCount', value: 14 },
      useDurationSec: 1,
      effect: [
        {
          type: 'buff',
          target: { kind: 'self' },
          buffSubKind: 'evasion',
          buffDurationSec: 1.5,
        },
        {
          type: 'move',
          moveMode: 'toAnchor',
          moveDurationSec: 0.2,
          waitAfterSec: 0.2,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1.5 },
          waitAfterSec: 0.5,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
        {
          type: 'move',
          moveMode: 'engage',
          moveDurationSec: 0.25,
          waitAfterSec: 0.25,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
      ],
    };
    expect(resolveSequenceWallClockSec(skill)).toBeCloseTo(1.15, 5);
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

  it('beginAnimLock blocks active fire without setting use lock and expires via tickAnimLocks', () => {
    const runner = new SkillSequenceRunner();
    const actor = mockUnit({ id: 'actor', battleX: 200 });
    const enemy = mockUnit({ id: 'enemy', isEnemy: true, battleX: 200, hp: 100 });
    const skill: ActiveSkillDef = {
      id: 'burst',
      name: 'burst',
      trigger: { kind: 'time', value: 5 },
      effect: [
        {
          type: 'damage',
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
        },
      ],
    };
    const cd: SkillCooldown = {
      skillId: 'burst',
      remaining: 0,
      slotKind: 'active',
    };
    const data = makeGameData({ burst: skill });
    const executor = new SkillExecutor(data, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
    });

    runner.beginAnimLock('actor', 0.4);
    expect(runner.isActorUseLocked('actor')).toBe(false);
    expect(runner.isActorBusy('actor')).toBe(true);
    expect(runner.isBasicAttackBlocked('actor')).toBe(true);
    expect(executor.tryExecute(actor, cd, [actor], [enemy])).toBe(false);

    runner.tickAnimLocks(0.4);
    expect(runner.isActorBusy('actor')).toBe(false);
    expect(runner.isBasicAttackBlocked('actor')).toBe(false);
    expect(executor.tryExecute(actor, cd, [actor], [enemy])).toBe(true);
  });

  it('clearForActor removes use lock', () => {
    const runner = new SkillSequenceRunner();
    runner.beginUse('actor', 1);
    runner.clearForActor('actor');
    expect(runner.isActorBusy('actor')).toBe(false);
  });

  it('resolveMaxSelfBuffEffectDurationSec returns max self buff seconds', () => {
    expect(
      resolveMaxSelfBuffEffectDurationSec({
        id: 'buff_combo',
        name: 'buff_combo',
        trigger: { kind: 'time', value: 12 },
        effect: [
          {
            type: 'buff',
            buffStat: 'def',
            buffMultiplier: 1.5,
            buffDurationSec: 6,
            target: { kind: 'self' },
          },
          {
            type: 'buff',
            buffStat: 'atk',
            buffMultiplier: 1.2,
            buffDurationSec: 4,
            target: { kind: 'self' },
          },
        ],
      }),
    ).toBe(6);
  });

  it('resolveMaxSelfBuffEffectDurationSec ignores enemy debuffs', () => {
    expect(
      resolveMaxSelfBuffEffectDurationSec({
        id: 'enemy_debuff',
        name: 'enemy_debuff',
        trigger: { kind: 'time', value: 8 },
        effect: [
          {
            type: 'debuff',
            debuffStat: 'atk',
            debuffMultiplier: 0.8,
            debuffDurationSec: 5,
            target: {
              kind: 'distance',
              side: 'enemy',
              order: 'nearest',
            },
          },
        ],
      }),
    ).toBe(0);
  });

  it('resolveMaxSelfBuffEffectDurationSec uses self buff only in mixed skill', () => {
    expect(
      resolveMaxSelfBuffEffectDurationSec({
        id: 'mixed',
        name: 'mixed',
        trigger: { kind: 'hitsTaken', value: 10 },
        effect: [
          {
            type: 'buff',
            buffSubKind: 'damageTakenToHeal',
            buffStat: 'atk',
            buffMultiplier: 1.2,
            buffDurationSec: 5,
            ratio: 0.05,
            target: { kind: 'self' },
          },
          {
            type: 'debuff',
            debuffStat: 'atk',
            debuffMultiplier: 0.8,
            debuffDurationSec: 5,
            target: { kind: 'self' },
          },
        ],
      }),
    ).toBe(5);
  });

  it('resolveMaxSelfBuffEffectDurationSec returns 0 for self debuff only', () => {
    expect(
      resolveMaxSelfBuffEffectDurationSec({
        id: 'self_debuff',
        name: 'self_debuff',
        trigger: { kind: 'time', value: 15 },
        effect: [
          {
            type: 'debuff',
            debuffStat: 'damageTaken',
            debuffMultiplier: 1.5,
            debuffDurationSec: 6,
            target: { kind: 'self' },
          },
        ],
      }),
    ).toBe(0);
  });

  it('resolveActiveEffectGaugeDurationSec requires useDurationSec', () => {
    expect(
      resolveActiveEffectGaugeDurationSec({
        id: 'buff_only',
        name: 'buff_only',
        trigger: { kind: 'hitsTaken', value: 10 },
        effect: [
          {
            type: 'buff',
            buffStat: 'def',
            buffMultiplier: 1.5,
            buffDurationSec: 5,
            target: { kind: 'self' },
          },
        ],
      }),
    ).toBe(0);

    expect(
      resolveActiveEffectGaugeDurationSec({
        id: 'guard',
        name: 'guard',
        trigger: { kind: 'hitsTaken', value: 8 },
        useDurationSec: 5,
        effect: [
          {
            type: 'buff',
            buffStat: 'def',
            buffMultiplier: 1.5,
            buffDurationSec: 5,
            target: { kind: 'self' },
          },
        ],
      }),
    ).toBe(5);

    expect(
      resolveActiveEffectGaugeDurationSec({
        id: 'backstab',
        name: 'backstab',
        trigger: { kind: 'time', value: 9 },
        useDurationSec: 1.1,
        effect: [
          {
            type: 'damage',
            damageType: 'physical',
            amount: { kind: 'atkBased', atkScale: 1 },
            target: {
              kind: 'distance',
              side: 'enemy',
              order: 'nearest',
            },
          },
        ],
      }),
    ).toBe(1.1);
  });

  it('beginActiveEffectGauge ticks down via tickActiveEffectGauges', () => {
    const runner = new SkillSequenceRunner();
    runner.beginActiveEffectGauge('actor', 0, 2);
    expect(runner.getActiveEffectRemaining('actor', 0)).toBe(2);
    expect(runner.getActiveEffectGauge('actor', 0)?.totalSec).toBe(2);

    runner.tickActiveEffectGauges(0.75);
    expect(runner.getActiveEffectRemaining('actor', 0)).toBeCloseTo(1.25);

    runner.tickActiveEffectGauges(1.25);
    expect(runner.getActiveEffectRemaining('actor', 0)).toBe(0);
    expect(runner.getActiveEffectGauge('actor', 0)).toBeUndefined();
  });

  it('isActorUseLocked is true only during use duration lock', () => {
    const runner = new SkillSequenceRunner();
    runner.beginUse('actor', 0.5);
    expect(runner.isActorUseLocked('actor')).toBe(true);
    expect(runner.isActorInSkillMotion('actor')).toBe(false);
    runner.tickUseLocks(0.5);
    expect(runner.isActorUseLocked('actor')).toBe(false);
  });
});
