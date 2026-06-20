/**
 * battle-field.md structural invariants (L1, §4.2, §4.6).
 *
 * A-L1-01 enforces L1: no per-tick resolveEngagedLayout during Engaged.
 */
import { describe, expect, it } from 'vitest';
import { __testOnlyBattleLayout } from './battleLayout.ts';
import { MOVE_PX_PER_SEC } from './battleConstants.ts';
import {
  LONG_BATTLE_TIMEOUT_MS,
  TICK_DT,
  advanceUntil,
  asBattleEngineInternals,
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  createStage1Wave2MeleeOnlyEngine,
  reachWave1Engage,
  reachWave2Engage,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

/** approach 1 tick + overlap 微調整の許容幅（layout snap 由来の大ジャンプを除外） */
const ENGAGED_APPROACH_MAX_JUMP_PX =
  MOVE_PX_PER_SEC * TICK_DT + 6;

function trackLivingBattleXJumps(
  prev: Map<string, number>,
  units: { id: string; battleX: number; hp: number }[],
): number {
  let maxJump = 0;
  for (const unit of units.filter((u) => u.hp > 0)) {
    const p = prev.get(unit.id);
    if (p !== undefined) {
      maxJump = Math.max(maxJump, Math.abs(unit.battleX - p));
    }
    prev.set(unit.id, unit.battleX);
  }
  return maxJump;
}

describe('battle-field architecture spec (A-*)', { timeout: LONG_BATTLE_TIMEOUT_MS }, () => {
  it('R1-fix-01: Engaged snapshots keep battleX === visualX', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const unit of [...snap.allies, ...snap.enemies]) {
        if (unit.hp <= 0) continue;
        expect(unit.visualX).toBe(unit.battleX);
      }
    }
  });

    it(
      'A-L1-01: Engaged ticks do not call resolveEngagedLayout (no layout bake during Engaged)',
      () => {
      const engine = createStage1Engine();
      reachWave1Engage(engine);
      __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();

      for (let t = 0; t < 360; t++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!snap.engaged || snap.waveIndex !== 0) break;
      }

      expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(0);
    },
  );

  it('A-§4.6-01: Engaged ally battleX per-tick delta stays bounded (Wave 1)', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    const prevScreenX = new Map<string, number>();
    let maxJump = 0;
    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        const sx = ally.battleX;
        const prev = prevScreenX.get(ally.id);
        if (prev !== undefined) {
          maxJump = Math.max(maxJump, Math.abs(sx - prev));
        }
        prevScreenX.set(ally.id, sx);
      }
    }
    expect(maxJump).toBeLessThanOrEqual(24);
  });

  it('A-L1-02b: first enemy melee death does not invoke resolveEngagedLayout (wave 1)', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    waitForEngaged(engine);
    __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();

    const wiped = advanceUntil(
      engine,
      (snap) =>
        snap.waveIndex === 0 &&
        snap.engaged &&
        snap.enemies.some((e) => e.hp <= 0) &&
        snap.enemies.some((e) => e.hp > 0),
      90_000,
    );
    expect(wiped).not.toBeNull();
    expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(0);
  });

  it('A-L1-02c: first enemy melee death does not invoke resolveEngagedLayout (wave 2)', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    reachWave2Engage(engine);
    __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();

    const wiped = advanceUntil(
      engine,
      (snap) =>
        snap.waveIndex === 1 &&
        snap.engaged &&
        !snap.enemies.some((e) => e.hp > 0 && e.name === 'test_enemy') &&
        snap.enemies.some((e) => e.hp > 0 && e.name === 'test_ranged'),
      200_000,
    );
    expect(wiped).not.toBeNull();
    expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(0);
  });

  it('A-§4.2-01: wave 1 first melee death — living units battleX jump stays approach-scale', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    waitForEngaged(engine);

    const prev = new Map<string, number>();
    let deathTick = -1;
    let maxJumpAtDeath = 0;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (
        before.waveIndex === 0 &&
        after.waveIndex === 0 &&
        after.engaged &&
        before.enemies.every((e) => e.hp > 0 || e.name !== 'test_enemy') &&
        after.enemies.some((e) => e.hp <= 0) &&
        after.enemies.some((e) => e.hp > 0)
      ) {
        deathTick = i;
      }
      if (deathTick >= 0 && i <= deathTick + 3) {
        const jump = trackLivingBattleXJumps(prev, [
          ...after.allies,
          ...after.enemies,
        ]);
        maxJumpAtDeath = Math.max(maxJumpAtDeath, jump);
      }
      if (deathTick >= 0 && i >= deathTick + 60) break;
    }

    expect(deathTick).toBeGreaterThanOrEqual(0);
    expect(maxJumpAtDeath).toBeLessThanOrEqual(ENGAGED_APPROACH_MAX_JUMP_PX);
  });

  it('A-§4.2-02: wave 2 first melee death — living ranged enemy does not lurch on battleX', () => {
    const engine = createStage1Wave2MeleeOnlyEngine();
    reachWave2Engage(engine);

    const prev = new Map<string, number>();
    let deathTick = -1;
    let maxRangedJump = 0;

    for (let i = 0; i < 200_000; i++) {
      const before = engine.getSnapshot();
      engine.tick(TICK_DT);
      const after = engine.getSnapshot();
      if (
        before.waveIndex === 1 &&
        after.waveIndex === 1 &&
        after.engaged &&
        before.enemies.some((e) => e.hp > 0 && e.name === 'test_enemy') &&
        !after.enemies.some((e) => e.hp > 0 && e.name === 'test_enemy') &&
        after.enemies.some((e) => e.hp > 0 && e.name === 'test_ranged')
      ) {
        deathTick = i;
      }
      if (deathTick >= 0 && i <= deathTick + 3) {
        const ranged = after.enemies.filter(
          (e) => e.hp > 0 && e.name === 'test_ranged',
        );
        maxRangedJump = Math.max(
          maxRangedJump,
          trackLivingBattleXJumps(prev, ranged),
        );
      }
      if (deathTick >= 0 && i >= deathTick + 60) break;
    }

    expect(deathTick).toBeGreaterThanOrEqual(0);
    expect(maxRangedJump).toBeLessThanOrEqual(ENGAGED_APPROACH_MAX_JUMP_PX);
  });

  it('A-§4.2-03: player front row death does not layout-snap surviving allies', () => {
    const engine = createStage1Engine();
    waitForEngaged(engine);
    const internal = asBattleEngineInternals(engine);

    for (let i = 0; i < 600; i++) {
      engine.tick(TICK_DT);
    }

    const front = internal.players.find(
      (p) => p.isAlive && p.formationRow === 'front',
    );
    expect(front).toBeDefined();

    const backBefore = internal.players
      .filter((p) => p.isAlive && p.formationRow === 'back')
      .map((p) => [p.id, p.battleX] as const);
    expect(backBefore.length).toBeGreaterThan(0);

    __testOnlyBattleLayout.resetResolveEngagedLayoutCallCount();
    front!.hp = 0;
    front!.isAlive = false;

    let maxBackJump = 0;
    for (let t = 0; t < 5; t++) {
      const prevBack = new Map(
        internal.players
          .filter((p) => p.isAlive)
          .map((p) => [p.id, p.battleX] as const),
      );
      engine.tick(TICK_DT);
      for (const [id, beforeX] of prevBack) {
        const after = internal.players.find((p) => p.id === id && p.isAlive);
        if (!after) continue;
        maxBackJump = Math.max(maxBackJump, Math.abs(after.battleX - beforeX));
      }
    }

    expect(__testOnlyBattleLayout.getResolveEngagedLayoutCallCount()).toBe(0);
    expect(maxBackJump).toBeLessThanOrEqual(ENGAGED_APPROACH_MAX_JUMP_PX);
  });
});
