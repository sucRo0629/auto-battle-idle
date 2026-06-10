import { describe, expect, it } from 'vitest';
import {
  createStage1Engine,
  reachWave1Engage,
  SCREEN_MIN_X,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

describe('engaged approach stability', () => {
  it('does not slide the party left off screen after wave 1 engage', () => {
    const engine = createStage1Engine();
    reachWave1Engage(engine);

    let minAllyX = Infinity;
    for (let t = 0; t < 900; t++) {
      engine.tick(TICK_DT);
      const snap = engine.getSnapshot();
      if (!snap.engaged) continue;
      for (const ally of snap.allies.filter((a) => a.hp > 0)) {
        minAllyX = Math.min(minAllyX, ally.battleX);
      }
    }

    expect(minAllyX).toBeGreaterThan(SCREEN_MIN_X);
  });
});
