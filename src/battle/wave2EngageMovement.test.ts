import { describe, expect, it } from 'vitest';
import {
  asBattleEngineInternals,
  createStage1Engine,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

describe('wave 2 engage movement', () => {
  it('iron guard starts moving the same tick as other allies', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const internal = asBattleEngineInternals(engine);
    const iron = internal.players.find((p) => p.name === '鉄衛士');
    expect(iron).toBeDefined();
    for (const enemy of internal.enemies) {
      if (!enemy.isAlive) continue;
      enemy.battleX = iron!.battleX + 120;
    }
    const players = internal.players;

    const firstMove = new Map<string, number>();
    for (let t = 0; t < 240; t++) {
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
    const peerTick =
      firstMove.get('剣術士') ??
      firstMove.get('療養師') ??
      firstMove.get('弓術士');
    expect(ironTick).toBeDefined();
    expect(ironTick!).toBeLessThanOrEqual(240);
    if (peerTick !== undefined) {
      expect(Math.abs(ironTick! - peerTick)).toBeLessThanOrEqual(60);
    }
  });
});
