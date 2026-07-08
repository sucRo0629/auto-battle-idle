/**
 * Regression: after enemy frontline dies, surviving ranged must not keep
 * drifting right while allies advance (battle-field.md §2.4 Engaged: left-only).
 */
import { describe, expect, it } from 'vitest';
import {
  advanceUntil,
  createStage1Wave1MeleeFirstDeathEngine,
  isShortRangeWipedEngaged,
  TICK_DT,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

describe('ranged enemy right drift after front wipe', () => {
  it('does not keep moving right after short-range enemies die', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    waitForEngaged(engine);

    const wiped = advanceUntil(
      engine,
      (snap) => isShortRangeWipedEngaged(snap, 0),
      90_000,
    );
    expect(wiped).not.toBeNull();

    const rangedAtWipe = wiped!.enemies.find(
      (e) => e.hp > 0 && e.name === 'test_ranged',
    );
    expect(rangedAtWipe).toBeDefined();
    const startX = rangedAtWipe!.battleX;

    let maxX = startX;
    let endX = startX;
    for (let i = 0; i < 600; i++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      const ranged = snap.enemies.find(
        (e) => e.hp > 0 && e.name === 'test_ranged',
      );
      if (!ranged) break;
      maxX = Math.max(maxX, ranged.battleX);
      endX = ranged.battleX;
    }

    // Left-only approach: may close left toward allies, never chase right with them.
    expect(maxX - startX).toBeLessThan(2);
    expect(endX).toBeLessThanOrEqual(startX + 2);
  });
});
