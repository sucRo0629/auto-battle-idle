import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDamageToTarget,
  applyConfirmedHpDamage,
} from './combatMath.ts';
import {
  buildDamageAppliedEvent,
  damageAppliedEventToLegacyMeta,
  notifyDamageApplied,
  shouldTriggerCounterRetaliation,
} from './damageAppliedEvent.ts';
import { applyIncomingDamage } from './damageDelay.ts';
import {
  applyCounterRetaliation,
  type CounterRetaliationCallbacks,
} from './counterEffects.ts';
import type { ActiveSkillDef, GameData, PendingSkillHit } from './types.ts';
import { SkillExecutor } from './skills/SkillExecutor.ts';
import { SkillSequenceRunner } from './skills/skillSequence.ts';
import { mockCombatant } from './testFixtures.ts';
import type {
  DamageAppliedCallback,
  DamageAppliedCallbackMeta,
} from './damageAppliedEvent.ts';

function unit(
  overrides: Partial<ReturnType<typeof mockCombatant>> & { id: string },
) {
  return mockCombatant(overrides);
}

describe('DamageAppliedEvent contract', () => {
  it('barrier-only hit: barrierDamage > 0, hpDamage 0, lethal false', () => {
    const target = unit({ id: 't', hp: 100, barrierHp: 40 });
    const result = applyDamageToTarget(target, 25);
    const event = buildDamageAppliedEvent({
      attacker: unit({ id: 'a' }),
      target,
      sourceKind: 'skillHit',
      attackKind: 'damage',
      damageResult: result,
    });
    expect(event.barrierDamage).toBe(25);
    expect(event.hpDamage).toBe(0);
    expect(event.lethal).toBe(false);
  });

  it('lethal uses DamageApplicationResult.lethal, not callback-time isAlive', () => {
    const target = unit({ id: 't', hp: 10, barrierHp: 0, isAlive: true });
    const attacker = unit({ id: 'a' });
    const result = applyDamageToTarget(target, 50);
    const event = buildDamageAppliedEvent({
      attacker,
      target,
      sourceKind: 'skillHit',
      attackKind: 'damage',
      damageResult: result,
    });
    let isAliveAtCallback: boolean | undefined;
    notifyDamageApplied(
      (_actor, callbackTarget, _amount, meta) => {
        isAliveAtCallback = callbackTarget.isAlive;
        expect(meta?.lethal).toBe(true);
        expect(meta?.event.lethal).toBe(true);
      },
      attacker,
      target,
      event,
    );
    expect(event.lethal).toBe(true);
    expect(target.hp).toBe(0);
    expect(isAliveAtCallback).toBe(true);
  });

  it('legacy meta adapter preserves diagnostics fields', () => {
    const event = buildDamageAppliedEvent({
      attacker: unit({ id: 'a' }),
      target: unit({ id: 't' }),
      sourceKind: 'derived',
      attackKind: 'damage',
      damageResult: { hpDamage: 12, barrierDamage: 3, lethal: false },
      slotKind: 'active',
      skillId: 'skill_x',
      effectIndex: 1,
      hitIndex: 2,
    });
    const meta = damageAppliedEventToLegacyMeta(event, {
      barrierHpBefore: 10,
      didBlock: true,
    });
    expect(meta.attackKind).toBe('damage');
    expect(meta.isCounterDamage).toBe(false);
    expect(meta.event.sourceKind).toBe('derived');
    expect(meta.hitIndex).toBe(2);
    expect(meta.barrierHpBefore).toBe(10);
  });

  it('counter retaliation gate accepts skillHit only', () => {
    const skillMeta = damageAppliedEventToLegacyMeta(
      buildDamageAppliedEvent({
        attacker: unit({ id: 'a' }),
        target: unit({ id: 't' }),
        sourceKind: 'skillHit',
        attackKind: 'damage',
        damageResult: { hpDamage: 5, barrierDamage: 0, lethal: false },
      }),
    );
    const derivedMeta = damageAppliedEventToLegacyMeta(
      buildDamageAppliedEvent({
        attacker: unit({ id: 'a' }),
        target: unit({ id: 't' }),
        sourceKind: 'derived',
        attackKind: 'damage',
        damageResult: { hpDamage: 5, barrierDamage: 0, lethal: false },
      }),
    );
    expect(shouldTriggerCounterRetaliation(skillMeta, 5)).toBe(true);
    expect(shouldTriggerCounterRetaliation(derivedMeta, 5)).toBe(false);
  });
});

const damageEffect = {
  type: 'damage' as const,
  damageType: 'physical' as const,
  target: {
    kind: 'distance' as const,
    side: 'enemy' as const,
    order: 'nearest' as const,
  },
  amount: { kind: 'flat' as const, flatAmount: 30 },
};

function makeGameData(actives: Record<string, ActiveSkillDef>): GameData {
  return {
    skillRegistry: { actives, passives: {} },
  } as unknown as GameData;
}

function createExecutor(
  gameData: GameData,
  units: ReturnType<typeof mockCombatant>[],
  onDamageApplied?: (
    actor: ReturnType<typeof mockCombatant>,
    target: ReturnType<typeof mockCombatant>,
    amount: number,
    meta?: DamageAppliedCallbackMeta,
  ) => void,
): SkillExecutor {
  const runner = new SkillSequenceRunner();
  return new SkillExecutor(gameData, () => {}, {
    getBattleTimeSec: () => 0,
    enqueuePendingHits: () => {},
    getAllCombatants: () => units,
    getSequenceRunner: () => runner,
    onDamageApplied,
  });
}

function pendingHit(
  actorId: string,
  skill: ActiveSkillDef,
  targets: { targetId: string; powerMultiplierOverride?: number }[],
  hitIndex = 0,
): PendingSkillHit {
  return {
    applyAtBattleSec: 0,
    actorId,
    skillId: skill.id,
    skillName: skill.name,
    effectDef: skill.effect[0]!,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex,
    targets,
  };
}

describe('DamageAppliedEvent emission — SkillExecutor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('single attack hit emits skillHit with hp/barrier/lethal', () => {
    const basicSkill: ActiveSkillDef = {
      id: 'test_basic',
      name: 'basic',
      trigger: { kind: 'time', value: 1 },
      effect: [damageEffect],
    };
    const gameData = makeGameData({ test_basic: basicSkill });
    const actor = unit({ id: 'attacker', atk: 50, battleX: 100 });
    const enemy = unit({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
    });
    const events: DamageAppliedCallbackMeta[] = [];
    const executor = createExecutor(gameData, [actor, enemy], (_a, _t, _amt, meta) => {
      if (meta) events.push(meta);
    });

    executor.applyPendingHit(pendingHit(actor.id, basicSkill, [{ targetId: enemy.id }]));

    expect(events).toHaveLength(1);
    expect(events[0]?.event.sourceKind).toBe('skillHit');
    expect(events[0]?.event.attackKind).toBe('damage');
    expect(events[0]?.event.hpDamage).toBeGreaterThan(0);
    expect(events[0]?.event.lethal).toBe(false);
  });

  it('multi-hit emits one event per hit with hitIndex', () => {
    const multiSkill: ActiveSkillDef = {
      id: 'multi',
      name: 'multi',
      trigger: { kind: 'time', value: 1 },
      effect: [
        {
          ...damageEffect,
          hitCount: 2,
          hitDurationSec: 0.2,
        },
      ],
    };
    const gameData = makeGameData({ multi: multiSkill });
    const actor = unit({ id: 'attacker', atk: 40, battleX: 100 });
    const enemy = unit({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 200,
      def: 0,
    });
    const hitIndexes: number[] = [];
    const captured: DamageAppliedCallbackMeta[] = [];
    const runner = new SkillSequenceRunner();
    const executor = new SkillExecutor(gameData, () => {}, {
      getBattleTimeSec: () => 0,
      enqueuePendingHits: () => {},
      getAllCombatants: () => [actor, enemy],
      getSequenceRunner: () => runner,
      onDamageApplied: (_a, _t, _amt, meta) => {
        if (meta?.event.hitIndex !== undefined) {
          hitIndexes.push(meta.event.hitIndex);
        }
        if (meta) captured.push(meta);
      },
    });
    for (let hitIndex = 0; hitIndex < 2; hitIndex += 1) {
      executor.applyPendingHit(
        pendingHit(actor.id, multiSkill, [{ targetId: enemy.id }], hitIndex),
      );
    }
    expect(captured).toHaveLength(2);
    expect(hitIndexes).toEqual([0, 1]);
    expect(captured.every((m) => m.event.sourceKind === 'skillHit')).toBe(true);
  });

  it('multiLock emits per-target events without duplicate on same target', () => {
    const lockSkill: ActiveSkillDef = {
      id: 'lock',
      name: 'lock',
      trigger: { kind: 'time', value: 1 },
      effect: [
        {
          ...damageEffect,
          targetShape: 'multiLock',
          hitCount: 2,
        },
      ],
    };
    const gameData = makeGameData({ lock: lockSkill });
    const actor = unit({ id: 'attacker', atk: 40, battleX: 100 });
    const enemyA = unit({
      id: 'enemy-a',
      isEnemy: true,
      battleX: 120,
      hp: 200,
      def: 0,
    });
    const enemyB = unit({
      id: 'enemy-b',
      isEnemy: true,
      battleX: 130,
      hp: 200,
      def: 0,
    });
    const targetIds: string[] = [];
    const executor = createExecutor(
      gameData,
      [actor, enemyA, enemyB],
      (_a, target, _amt, meta) => {
        if (meta?.event.sourceKind === 'skillHit') {
          targetIds.push(target.id);
        }
      },
    );

    executor.applyPendingHit(
      pendingHit(actor.id, lockSkill, [
        { targetId: enemyA.id },
        { targetId: enemyB.id },
      ]),
    );

    expect(targetIds.sort()).toEqual(['enemy-a', 'enemy-b']);
  });

  it('dotHarvest emits derived, not skillHit', () => {
    const harvestSkill: ActiveSkillDef = {
      id: 'harvest',
      name: 'harvest',
      trigger: { kind: 'time', value: 1 },
      effect: [
        {
          type: 'dotHarvest',
          harvestRatio: 1,
          target: damageEffect.target,
        },
      ],
    };
    const gameData = makeGameData({ harvest: harvestSkill });
    const actor = unit({ id: 'attacker', atk: 50, battleX: 100 });
    const enemy = unit({
      id: 'enemy',
      isEnemy: true,
      battleX: 120,
      hp: 100,
      def: 0,
      statusEffects: [
        {
          id: 'dot_1',
          kind: 'debuff',
          overlay: 'dot',
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
          tickSec: 1,
          powerMultiplier: 1,
          sourceId: actor.id,
        },
      ],
    });
    const kinds: string[] = [];
    const executor = createExecutor(gameData, [actor, enemy], (_a, _t, _amt, meta) => {
      if (meta) kinds.push(meta.event.sourceKind);
    });

    executor.applyPendingHit(pendingHit(actor.id, harvestSkill, [{ targetId: enemy.id }]));

    expect(kinds).toEqual(['derived']);
  });

  it('damage delay: skillHit is immediate only; pool tick is delayedPoolTick', () => {
    const basicSkill: ActiveSkillDef = {
      id: 'delay_basic',
      name: 'basic',
      trigger: { kind: 'time', value: 1 },
      effect: [damageEffect],
    };
    const gameData = makeGameData({ delay_basic: basicSkill });
    const actor = unit({ id: 'attacker', atk: 10, battleX: 100 });
    const target = unit({
      id: 'ally',
      battleX: 120,
      hp: 1000,
      def: 0,
      statusEffects: [
        {
          id: 'dd',
          kind: 'buff',
          overlay: 'damageDelay',
          ratio: 0.5,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
        },
      ],
    });
    const skillKinds: string[] = [];
    const executor = createExecutor(gameData, [actor, target], (_a, _t, _amt, meta) => {
      if (meta) skillKinds.push(meta.event.sourceKind);
    });
    executor.applyPendingHit(pendingHit(actor.id, basicSkill, [{ targetId: target.id }]));

    expect(skillKinds).toEqual(['skillHit']);
    expect(target.delayedDamagePool).toBeGreaterThan(0);

    const poolResult = applyIncomingDamage(
      unit({
        id: 'pool',
        hp: 500,
        delayedDamagePool: 100,
        statusEffects: [
          {
            id: 'dd2',
            kind: 'buff',
            overlay: 'damageDelay',
            ratio: 0.5,
            multiplier: 1,
            durationSec: 5,
            remainingSec: 5,
          },
        ],
      }),
      200,
    );
    expect(poolResult.delayedDamage).toBe(100);

    const delayedUnit = unit({ id: 'pool', hp: 500, delayedDamagePool: 80 });
    const delayedKinds: string[] = [];
    const delayedEvent = buildDamageAppliedEvent({
      attacker: delayedUnit,
      target: delayedUnit,
      sourceKind: 'delayedPoolTick',
      attackKind: 'damage',
      damageResult: applyConfirmedHpDamage(delayedUnit, 20),
    });
    notifyDamageApplied(
      (_a, _t, _amt, meta) => {
        if (meta) delayedKinds.push(meta.event.sourceKind);
      },
      delayedUnit,
      delayedUnit,
      delayedEvent,
    );
    expect(delayedKinds).toEqual(['delayedPoolTick']);
  });
});

describe('DamageAppliedEvent emission — counter', () => {
  it('counter damage response emits sourceKind counter', () => {
    const victim = unit({
      id: 'victim',
      atk: 100,
      battleX: 0,
      statusEffects: [
        {
          id: 'counter_1',
          kind: 'buff',
          overlay: 'counter',
          responses: [
            {
              kind: 'damage',
              amount: { kind: 'flat', flatAmount: 40 },
              damageType: 'physical',
            },
          ],
          counterRangePx: 0,
          multiplier: 1,
          durationSec: 5,
          remainingSec: 5,
          skillId: 'counter_skill',
        },
      ],
    });
    const attacker = unit({
      id: 'attacker',
      isEnemy: true,
      battleX: 0,
      hp: 200,
      def: 0,
    });
    const events: DamageAppliedCallbackMeta[] = [];
    const callbacks: CounterRetaliationCallbacks = {
      emit: () => {},
      getAllCombatants: () => [victim, attacker],
      onDamageApplied: (_a, _t, _amt, meta) => {
        if (meta) events.push(meta);
      },
    };

    applyCounterRetaliation(
      victim,
      attacker,
      { attackKind: 'damage', appliedDamage: 10 },
      {},
      {},
      callbacks,
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.event.sourceKind).toBe('counter');
    expect(events[0]?.isCounterDamage).toBe(true);
  });
});

describe('DamageAppliedEvent emission — dotTick', () => {
  it('dot overlay tick uses dotTick sourceKind', () => {
    const source = unit({ id: 'caster', atk: 50 });
    const target = unit({ id: 'target', isEnemy: true, hp: 100, def: 0 });
    const result = applyDamageToTarget(target, 15);
    const event = buildDamageAppliedEvent({
      attacker: source,
      target,
      sourceKind: 'dotTick',
      attackKind: 'dot',
      damageResult: result,
      statusId: 'dot_status',
      skillId: 'dot_skill',
    });
    expect(event.sourceKind).toBe('dotTick');
    expect(event.attackKind).toBe('dot');
  });
});
