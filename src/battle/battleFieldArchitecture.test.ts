/**
 * battle-field.md structural invariants (L1, §4.2, §4.6).
 *
 * A-L1-01 enforces L1: no per-tick resolveEngagedLayout during Engaged.
 */
import { describe, expect, it } from 'vitest';
import { __testOnlyBattleLayout } from './battleLayout.ts';
import {
  LONG_BATTLE_TIMEOUT_MS,
  TICK_DT,
  createStage1Engine,
  reachWave1Engage,
} from './test/battleFieldSpec.harness.ts';

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
    'A-L1-01: Engaged ticks do not call resolveEngagedLayout (layout bake on events only)',
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
});
