import { describe, expect, it } from 'vitest';
import {
  createStage1Engine,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

describe('wave 2 engage movement', () => {
  it('iron guard starts moving the same tick as other allies', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const players = (
      engine as unknown as {
        players: { name: string; battleX: number; isAlive: boolean }[];
      }
    ).players;

    const firstMove = new Map<string, number>();
    for (let t = 0; t < 40; t++) {
      const before = new Map(
        players.filter((p) => p.isAlive).map((p) => [p.name, p.battleX]),
      );
      engine.tick(TICK_DT);
      for (const p of players.filter((x) => x.isAlive)) {
        const prev = before.get(p.name);
        if (
          prev !== undefined &&
          Math.abs(p.battleX - prev) > 0.05 &&
          !firstMove.has(p.name)
        ) {
          firstMove.set(p.name, t + 1);
        }
      }
    }

    const ironTick = firstMove.get('鉄衛士');
    const swordTick = firstMove.get('剣術士');
    expect(ironTick).toBeDefined();
    expect(swordTick).toBeDefined();
    expect(Math.abs(ironTick! - swordTick!)).toBeLessThanOrEqual(1);
  });
});
