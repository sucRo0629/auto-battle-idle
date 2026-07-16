import { describe, expect, it } from 'vitest';
import type {
  CombatantState,
  PendingSkillHit,
  SkillEffectDef,
  TargetSpec,
} from '../types.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { parseSkillEffect } from '../data/validateGameData.ts';
import { normalizeTarget } from './targetSpec.ts';
import { mockCombatant } from '../testFixtures.ts';
import {
  buildDangerTargetingRuntime,
  pickTargets,
  resolutionHasTargets,
  resolveEffectResolution,
} from './targeting.ts';
import { resolveDangerTargets } from '../dangerTargeting.ts';
import { createResolveCurrentAttackTarget } from '../resolveApproachBattleX.ts';

const gameData = loadGameData();

const damageEffect = {
  type: 'damage',
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'physical',
  amount: { kind: 'atkBased', atkScale: 1 },
} as SkillEffectDef;

function dangerSpec(
  partial: Partial<Extract<TargetSpec, { kind: 'danger' }>> = {},
): Extract<TargetSpec, { kind: 'danger' }> {
  return {
    kind: 'danger',
    side: 'ally',
    maxTargets: 1,
    windowSec: 2,
    ...partial,
  };
}

function makePendingHit(
  partial: Partial<PendingSkillHit> & Pick<PendingSkillHit, 'actorId' | 'targets'>,
): PendingSkillHit {
  return {
    applyAtBattleSec: 1,
    skillId: 'test_skill',
    skillName: 'test',
    effectDef: damageEffect,
    effectIndex: 0,
    slotKind: 'basic',
    hitIndex: 0,
    ...partial,
  };
}

function resolveTargets(
  units: CombatantState[],
  mapping: Record<string, string | null>,
) {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return (attacker: CombatantState): CombatantState | null => {
    const targetId = mapping[attacker.id];
    return targetId ? byId.get(targetId) ?? null : null;
  };
}

function runtimeFor(
  allies: CombatantState[],
  enemies: CombatantState[],
  params: {
    battleSec?: number;
    pendingHits?: PendingSkillHit[];
    resolveCurrentAttackTarget?: ReturnType<typeof resolveTargets>;
  } = {},
) {
  return buildDangerTargetingRuntime(allies, enemies, gameData, {
    battleSec: params.battleSec ?? 0,
    pendingHits: params.pendingHits ?? [],
    resolveCurrentAttackTarget: params.resolveCurrentAttackTarget,
  });
}

describe('danger TargetSpec validation', () => {
  it('accepts a valid danger TargetSpec', () => {
    const spec = normalizeTarget({
      kind: 'danger',
      side: 'ally',
      maxTargets: 1,
      windowSec: 2,
    });
    expect(spec).toEqual({
      kind: 'danger',
      side: 'ally',
      maxTargets: 1,
      windowSec: 2,
    });
  });

  it('rejects maxTargets: 0', () => {
    expect(() =>
      normalizeTarget({
        kind: 'danger',
        side: 'ally',
        maxTargets: 0,
        windowSec: 1,
      }),
    ).toThrow(/maxTargets/);
  });

  it('rejects negative windowSec', () => {
    expect(() =>
      normalizeTarget({
        kind: 'danger',
        side: 'ally',
        maxTargets: 1,
        windowSec: -0.1,
      }),
    ).toThrow(/windowSec/);
  });

  it('rejects invalid side', () => {
    expect(() =>
      normalizeTarget({
        kind: 'danger',
        side: 'invalid',
        maxTargets: 1,
        windowSec: 1,
      }),
    ).toThrow(/side/);
  });

  it('rejects non-integer maxTargets', () => {
    expect(() =>
      normalizeTarget({
        kind: 'danger',
        side: 'ally',
        maxTargets: 1.5,
        windowSec: 1,
      }),
    ).toThrow(/maxTargets/);
  });

  it('validates through parseSkillEffect', () => {
    const effect = parseSkillEffect(
      {
        type: 'damage',
        target: { kind: 'danger', side: 'ally', maxTargets: 2, windowSec: 1 },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      'test.effect',
    );
    expect(effect.target).toEqual({
      kind: 'danger',
      side: 'ally',
      maxTargets: 2,
      windowSec: 1,
    });
  });
});

describe('danger TargetSpec resolver', () => {
  it('selects the focused attack target', () => {
    const tank = mockCombatant({ id: 'tank', isEnemy: false, formationRow: 'front' });
    const striker = mockCombatant({ id: 'striker', isEnemy: false, formationRow: 'front' });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec(),
      paladin,
      [tank, striker, paladin],
      [enemyA, enemyB],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [tank, striker, paladin, enemyA, enemyB],
          { enemyA: 'tank', enemyB: 'tank' },
        ),
      },
    );

    expect(targets.map((unit) => unit.id)).toEqual(['tank']);
  });

  it('does not prefer low-HP zero-danger over a danger target', () => {
    const dangerAlly = mockCombatant({
      id: 'dangerAlly',
      isEnemy: false,
      hp: 80,
      maxHp: 100,
    });
    const lowHpAlly = mockCombatant({
      id: 'lowHpAlly',
      isEnemy: false,
      hp: 10,
      maxHp: 100,
    });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec(),
      paladin,
      [dangerAlly, lowHpAlly, paladin],
      [enemy],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [dangerAlly, lowHpAlly, paladin, enemy],
          { enemy: 'dangerAlly' },
        ),
      },
    );

    expect(targets.map((unit) => unit.id)).toEqual(['dangerAlly']);
  });

  it('returns empty when every candidate has zero danger signal', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false, hp: 20, maxHp: 100 });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false, hp: 90, maxHp: 100 });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec(),
      paladin,
      [allyA, allyB, paladin],
      [],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: () => null,
      },
    );

    expect(targets).toEqual([]);
  });

  it('can select a back-row ally regardless of distance', () => {
    const front = mockCombatant({
      id: 'front',
      isEnemy: false,
      formationRow: 'front',
      battleX: 100,
    });
    const back = mockCombatant({
      id: 'back',
      isEnemy: false,
      formationRow: 'back',
      battleX: 40,
    });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true, battleX: 150 });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false, battleX: 80 });

    const targets = resolveDangerTargets(
      dangerSpec(),
      paladin,
      [front, back, paladin],
      [enemy],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [front, back, paladin, enemy],
          { enemy: 'back' },
        ),
      },
    );

    expect(targets.map((unit) => unit.id)).toEqual(['back']);
  });

  it('returns one target for maxTargets: 1', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec({ maxTargets: 1 }),
      paladin,
      [allyA, allyB, paladin],
      [enemyA, enemyB],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [allyA, allyB, paladin, enemyA, enemyB],
          { enemyA: 'allyA', enemyB: 'allyB' },
        ),
      },
    );

    expect(targets).toHaveLength(1);
    expect(['allyA', 'allyB']).toContain(targets[0]?.id);
  });

  it('returns two targets for maxTargets: 2', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec({ maxTargets: 2 }),
      paladin,
      [allyA, allyB, paladin],
      [enemyA, enemyB],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [allyA, allyB, paladin, enemyA, enemyB],
          { enemyA: 'allyA', enemyB: 'allyB' },
        ),
      },
    );

    expect(targets.map((unit) => unit.id).sort()).toEqual(['allyA', 'allyB']);
  });

  it('returns fewer than maxTargets when fewer danger candidates exist', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec({ maxTargets: 2 }),
      paladin,
      [allyA, allyB, paladin],
      [enemy],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: resolveTargets(
          [allyA, allyB, paladin, enemy],
          { enemy: 'allyA' },
        ),
      },
    );

    expect(targets.map((unit) => unit.id)).toEqual(['allyA']);
  });

  it('breaks ties deterministically by targetId', () => {
    const allyA = mockCombatant({ id: 'ally_a', isEnemy: false, hp: 50, maxHp: 100 });
    const allyB = mockCombatant({ id: 'ally_b', isEnemy: false, hp: 50, maxHp: 100 });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const resolver = resolveTargets(
      [allyA, allyB, paladin, enemyA, enemyB],
      { enemyA: 'ally_a', enemyB: 'ally_b' },
    );

    const first = resolveDangerTargets(
      dangerSpec({ maxTargets: 1 }),
      paladin,
      [allyA, allyB, paladin],
      [enemyA, enemyB],
      { battleSec: 0, pendingHits: [], resolveCurrentAttackTarget: resolver },
    );
    const second = resolveDangerTargets(
      dangerSpec({ maxTargets: 1 }),
      paladin,
      [allyB, allyA, paladin],
      [enemyB, enemyA],
      { battleSec: 0, pendingHits: [], resolveCurrentAttackTarget: resolver },
    );

    expect(first.map((unit) => unit.id)).toEqual(second.map((unit) => unit.id));
    expect(first[0]?.id).toBe('ally_a');
  });

  it('is invariant to candidate array order', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });
    const resolver = resolveTargets(
      [allyA, allyB, paladin, enemyA, enemyB],
      { enemyA: 'allyA', enemyB: 'allyB' },
    );

    const orderedA = resolveDangerTargets(
      dangerSpec({ maxTargets: 2 }),
      paladin,
      [allyA, allyB, paladin],
      [enemyA, enemyB],
      { battleSec: 0, pendingHits: [], resolveCurrentAttackTarget: resolver },
    );
    const orderedB = resolveDangerTargets(
      dangerSpec({ maxTargets: 2 }),
      paladin,
      [allyB, allyA, paladin],
      [enemyB, enemyA],
      { battleSec: 0, pendingHits: [], resolveCurrentAttackTarget: resolver },
    );

    expect(orderedA.map((unit) => unit.id)).toEqual(orderedB.map((unit) => unit.id));
  });

  it('counts multi-hit from one enemy as one pending attacker', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const snapshots = resolveDangerTargets(
      dangerSpec(),
      paladin,
      [ally, paladin],
      [enemy],
      {
        battleSec: 0,
        pendingHits: [
          makePendingHit({
            actorId: 'enemy',
            applyAtBattleSec: 1,
            targets: [{ targetId: 'ally' }],
            hitIndex: 0,
          }),
          makePendingHit({
            actorId: 'enemy',
            applyAtBattleSec: 1.2,
            targets: [{ targetId: 'ally' }],
            hitIndex: 1,
          }),
        ],
        resolveCurrentAttackTarget: () => null,
      },
    );

    expect(snapshots.map((unit) => unit.id)).toEqual(['ally']);
  });

  it('respects the pending time window', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const inWindow = resolveDangerTargets(
      dangerSpec({ windowSec: 2 }),
      paladin,
      [ally, paladin],
      [enemy],
      {
        battleSec: 5,
        pendingHits: [
          makePendingHit({
            actorId: 'enemy',
            applyAtBattleSec: 7,
            targets: [{ targetId: 'ally' }],
          }),
        ],
        resolveCurrentAttackTarget: () => null,
      },
    );
    const outOfWindow = resolveDangerTargets(
      dangerSpec({ windowSec: 2 }),
      paladin,
      [ally, paladin],
      [enemy],
      {
        battleSec: 5,
        pendingHits: [
          makePendingHit({
            actorId: 'enemy',
            applyAtBattleSec: 7.01,
            targets: [{ targetId: 'ally' }],
          }),
        ],
        resolveCurrentAttackTarget: () => null,
      },
    );

    expect(inWindow.map((unit) => unit.id)).toEqual(['ally']);
    expect(outOfWindow).toEqual([]);
  });

  it('aggregates pending across multiple targets', () => {
    const allyA = mockCombatant({ id: 'allyA', isEnemy: false });
    const allyB = mockCombatant({ id: 'allyB', isEnemy: false });
    const enemyA = mockCombatant({ id: 'enemyA', isEnemy: true });
    const enemyB = mockCombatant({ id: 'enemyB', isEnemy: true });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });

    const targets = resolveDangerTargets(
      dangerSpec({ maxTargets: 2 }),
      paladin,
      [allyA, allyB, paladin],
      [enemyA, enemyB],
      {
        battleSec: 0,
        pendingHits: [
          makePendingHit({
            actorId: 'enemyA',
            applyAtBattleSec: 1,
            targets: [{ targetId: 'allyA' }],
          }),
          makePendingHit({
            actorId: 'enemyB',
            applyAtBattleSec: 0.5,
            targets: [{ targetId: 'allyB' }],
          }),
        ],
        resolveCurrentAttackTarget: () => null,
      },
    );

    expect(targets.map((unit) => unit.id).sort()).toEqual(['allyA', 'allyB']);
  });

  it('works for enemy-side protection with actor-is-enemy and side: ally', () => {
    const enemyFront = mockCombatant({
      id: 'enemyFront',
      isEnemy: true,
      role: 'defender',
      battleX: 120,
    });
    const enemyBack = mockCombatant({
      id: 'enemyBack',
      isEnemy: true,
      role: 'attacker',
      battleX: 150,
    });
    const player = mockCombatant({
      id: 'player',
      isEnemy: false,
      role: 'attacker',
      battleX: 80,
      traits: { rangePx: 100, damageType: 'physical' },
    });
    const enemyPaladin = mockCombatant({
      id: 'enemyPaladin',
      isEnemy: true,
      battleX: 130,
      traits: { rangePx: 0, damageType: 'physical' },
      cooldowns: [{ skillId: 'enemy_basic', remaining: 0, slotKind: 'basic' }],
    });

    const targets = resolveDangerTargets(
      dangerSpec({ side: 'ally', maxTargets: 1 }),
      enemyPaladin,
      [player],
      [enemyFront, enemyBack, enemyPaladin],
      {
        battleSec: 0,
        pendingHits: [],
        resolveCurrentAttackTarget: createResolveCurrentAttackTarget(
          [player],
          [enemyFront, enemyBack, enemyPaladin],
          gameData,
        ),
      },
    );

    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((unit) => unit.isEnemy)).toBe(true);
  });

  it('returns empty through pickTargets when runtime is missing', () => {
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });
    expect(
      pickTargets(dangerSpec(), paladin, [paladin], [], undefined),
    ).toEqual([]);
  });

  it('resolveEffectResolution returns null for zero danger targets', () => {
    const ally = mockCombatant({ id: 'ally', isEnemy: false });
    const paladin = mockCombatant({ id: 'paladin', isEnemy: false });
    const effect = {
      type: 'buff',
      target: dangerSpec(),
      buffDurationSec: 3,
    } as SkillEffectDef;

    const resolution = resolveEffectResolution(
      effect,
      paladin,
      [ally, paladin],
      [],
      gameData,
      Math.random,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      runtimeFor([ally, paladin], [], {
        resolveCurrentAttackTarget: () => null,
      }),
    );

    expect(resolution).toBeNull();
    expect(resolutionHasTargets(resolution)).toBe(false);
  });

  it('does not regress existing distance TargetSpec resolution', () => {
    const enemy = mockCombatant({ id: 'enemy', isEnemy: true, battleX: 120 });
    const player = mockCombatant({ id: 'player', isEnemy: false, battleX: 80 });
    const effect = {
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType: 'physical',
      amount: { kind: 'atkBased', atkScale: 1 },
      range: 100,
    } as SkillEffectDef;

    const resolution = resolveEffectResolution(
      effect,
      player,
      [player],
      [enemy],
      gameData,
    );

    expect(resolutionHasTargets(resolution)).toBe(true);
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('enemy');
  });
});
