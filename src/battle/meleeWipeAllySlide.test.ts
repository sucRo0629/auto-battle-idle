import { describe, expect, it } from 'vitest';
import { isMeleeRangePx } from './types.ts';
import {
  createStage1Engine,
  createStage1Wave1MeleeFirstDeathEngine,
  reachWave1Engage,
  reachWave2Engage,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';

function maxDriftAfterMeleeWipe(
  engine: ReturnType<typeof createStage1Engine>,
  options?: { waveIndex?: number; maxTicksAfterWipe?: number },
): { meleeWipeTick: number; maxLeftDrift: number; maxRightDrift: number } {
  const waveIndex = options?.waveIndex ?? 0;
  const maxTicksAfterWipe = options?.maxTicksAfterWipe ?? 900;
  let meleeWipeTick = -1;
  let minAllyXAtWipe = Infinity;
  let maxAllyXAtWipe = -Infinity;
  let maxLeftDrift = 0;
  let maxRightDrift = 0;

  for (let t = 0; t < 120_000; t++) {
    engine.tick(TICK_DT);
    const snap = engine.getSnapshot();
    if (snap.waveIndex !== waveIndex) continue;

    const livingMelee = snap.enemies.filter(
      (e) => e.hp > 0 && isMeleeRangePx(e.rangePx ?? 0),
    );
    const livingAllies = snap.allies.filter((a) => a.hp > 0);
    const livingEnemies = snap.enemies.filter((e) => e.hp > 0);

    if (
      meleeWipeTick < 0 &&
      livingMelee.length === 0 &&
      livingAllies.length > 0 &&
      livingEnemies.length > 0
    ) {
      meleeWipeTick = t;
      minAllyXAtWipe = Math.min(...livingAllies.map((a) => a.battleX));
      maxAllyXAtWipe = Math.max(...livingAllies.map((a) => a.battleX));
    }

    if (
      meleeWipeTick >= 0 &&
      t - meleeWipeTick <= maxTicksAfterWipe &&
      snap.engaged
    ) {
      const minNow = Math.min(...livingAllies.map((a) => a.battleX));
      const maxNow = Math.max(...livingAllies.map((a) => a.battleX));
      maxLeftDrift = Math.max(maxLeftDrift, minAllyXAtWipe - minNow);
      maxRightDrift = Math.max(maxRightDrift, maxNow - maxAllyXAtWipe);
    }

    if (meleeWipeTick >= 0 && t - meleeWipeTick > maxTicksAfterWipe) break;
  }

  return { meleeWipeTick, maxLeftDrift, maxRightDrift };
}

function maxLeftDriftAfterMeleeWipe(
  engine: ReturnType<typeof createStage1Engine>,
  options?: { waveIndex?: number; maxTicksAfterWipe?: number },
): { meleeWipeTick: number; maxLeftDrift: number } {
  const { meleeWipeTick, maxLeftDrift } = maxDriftAfterMeleeWipe(engine, options);
  return { meleeWipeTick, maxLeftDrift };
}

describe('melee wipe ally slide', () => {
  it('wave 1 default: no major left drift after all melee die (same wave)', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    reachWave1Engage(engine);
    const { meleeWipeTick, maxLeftDrift } = maxLeftDriftAfterMeleeWipe(engine, {
      waveIndex: 0,
      maxTicksAfterWipe: 250,
    });
    expect(meleeWipeTick).toBeGreaterThan(0);
    expect(maxLeftDrift).toBeLessThan(80);
  });

  it('wave 2 (1-2): no major left drift after melee die', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const { meleeWipeTick, maxLeftDrift } = maxLeftDriftAfterMeleeWipe(engine, {
      waveIndex: 1,
      maxTicksAfterWipe: 600,
    });
    expect(meleeWipeTick).toBeGreaterThan(0);
    expect(maxLeftDrift).toBeLessThan(80);
  });

  it('wave 2 (1-2): no major right drift after melee die', () => {
    const engine = createStage1Engine();
    reachWave2Engage(engine);
    const { meleeWipeTick, maxRightDrift } = maxDriftAfterMeleeWipe(engine, {
      waveIndex: 1,
      maxTicksAfterWipe: 600,
    });
    expect(meleeWipeTick).toBeGreaterThan(0);
    // 回復通常攻撃のヒーラーが負傷味方へ前進するため、わずかに許容幅を広げる
    expect(maxRightDrift).toBeLessThan(90);
  });

  it('wave 1 fast melee death: no major left drift after all melee die', () => {
    const engine = createStage1Wave1MeleeFirstDeathEngine();
    reachWave1Engage(engine);
    const { meleeWipeTick, maxLeftDrift } = maxLeftDriftAfterMeleeWipe(engine);
    expect(meleeWipeTick).toBeGreaterThan(0);
    expect(maxLeftDrift).toBeLessThan(80);
  });
});
