/**
 * battle-field.md §4.4 capForwardAfterMeleeWipe — ally battleX drift after short-range enemies die.
 */
import { describe, expect, it } from 'vitest';
import {
  LONG_BATTLE_TIMEOUT_MS,
  createStage1Wave1MeleeFirstDeathEngine,
  createStage1Wave2MeleeOnlyEngine,
  measureAllyBattleXDriftAfterShortRangeWipe,
  reachWave2Engage,
  waitForEngaged,
} from './test/battleFieldSpec.harness.ts';

describe(
  'battle-field §4.4 capForwardAfterMeleeWipe (ally slide)',
  { timeout: LONG_BATTLE_TIMEOUT_MS },
  () => {
    it('wave 1: ally battleX left drift bounded after enemies with rangePx < 100 die', () => {
      const engine = createStage1Wave1MeleeFirstDeathEngine();
      waitForEngaged(engine);
      const { wipeTick, maxLeftDrift } =
        measureAllyBattleXDriftAfterShortRangeWipe(engine, {
          waveIndex: 0,
          maxTicksAfterWipe: 250,
        });
      expect(wipeTick).toBeGreaterThan(0);
      expect(maxLeftDrift).toBeLessThan(80);
    });

    it('wave 2 (1-2): ally battleX left drift bounded after short-range enemies die', () => {
      const engine = createStage1Wave2MeleeOnlyEngine();
      reachWave2Engage(engine);
      const { wipeTick, maxLeftDrift } =
        measureAllyBattleXDriftAfterShortRangeWipe(engine, {
          waveIndex: 1,
          maxTicksAfterWipe: 600,
        });
      expect(wipeTick).toBeGreaterThan(0);
      expect(maxLeftDrift).toBeLessThan(80);
    });

    it('wave 2 (1-2): ally battleX right drift bounded after short-range enemies die', () => {
      const engine = createStage1Wave2MeleeOnlyEngine();
      reachWave2Engage(engine);
      const { wipeTick, maxRightDrift } =
        measureAllyBattleXDriftAfterShortRangeWipe(engine, {
          waveIndex: 1,
          maxTicksAfterWipe: 600,
        });
      expect(wipeTick).toBeGreaterThan(0);
      // 回復通常攻撃のヒーラーが負傷味方へ前進するため、わずかに許容幅を広げる
      expect(maxRightDrift).toBeLessThan(90);
    });
  },
);
