/**
 * battle-field.md structural invariants (L1, §4.2, §4.6).
 *
 * Tests marked it.fails document spec violations in the current implementation.
 * Flip to it() when battleDisplay rebuild makes them pass.
 */
import { describe, expect, it } from 'vitest';
import { __testOnlyBattleLayout } from './battleLayout.ts';
import {
  BACK_ROW_NAMES,
  LONG_BATTLE_TIMEOUT_MS,
  TICK_DT,
  assertFrozenScreenDelta,
  createStage1Engine,
  reachWave1Engage,
  tickRecord,
} from './test/battleFieldSpec.harness.ts';

describe('battle-field architecture spec (A-*)', { timeout: LONG_BATTLE_TIMEOUT_MS }, () => {
  it.fails(
    'A-L1-01: Engaged ticks do not call resolveEngagedLayout (L1 single layout)',
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

  it('A-§4.2-01: rear allies screenX tracks camera only when battleX moves', () => {
      const engine = createStage1Engine();
      reachWave1Engage(engine);
      // skip settle ticks
      for (let i = 0; i < 30; i++) engine.tick(TICK_DT);

      const samples = tickRecord(engine, 180).filter(
        (s) => s.engaged && s.waveIndex === 0,
      );
      for (const name of BACK_ROW_NAMES) {
        const ally = samples[0]?.allies.find((a) => a.name === name && a.hp > 0);
        if (!ally) continue;
        assertFrozenScreenDelta(samples, ally.id, 'ally', 0.5);
      }
  });

  it('A-§4.2-01b: engaged enemies screenX tracks camera only when battleX moves', () => {
      const engine = createStage1Engine();
      reachWave1Engage(engine);
      for (let i = 0; i < 60; i++) engine.tick(TICK_DT);

      const samples = tickRecord(engine, 300).filter(
        (s) => s.engaged && s.waveIndex === 0,
      );
      const enemyId = samples.at(-1)?.enemies.find((e) => e.hp > 0)?.id;
      expect(enemyId).toBeDefined();
      assertFrozenScreenDelta(samples, enemyId!, 'enemy', 0.5);
  });

  it('A-§4.6-01: Engaged combatCameraX is non-decreasing (Wave 1)', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let prevCamera = engine.getSnapshot().combatCameraX;
    for (let t = 0; t < 360; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged || snap.waveIndex !== 0) break;
      expect(snap.combatCameraX).toBeGreaterThanOrEqual(prevCamera - 0.01);
      prevCamera = snap.combatCameraX;
    }
  });

  it('A-§4.6-02: combatCameraX does not reset to 0 during Engaged (no mid-fight bake)', () => {
      const engine = createStage1Engine();
      reachWave1Engage(engine);

      let sawPositiveCamera = false;
      for (let t = 0; t < 360; t++) {
        engine.tick(TICK_DT);
        const snap = engine.getSnapshot();
        if (!snap.engaged || snap.waveIndex !== 0) break;
        if (snap.combatCameraX > 1) sawPositiveCamera = true;
        if (sawPositiveCamera && snap.combatCameraX < 0.5) {
          expect.fail(`camera reset to ${snap.combatCameraX} at tick ${t} while engaged`);
        }
      }
  });
});
