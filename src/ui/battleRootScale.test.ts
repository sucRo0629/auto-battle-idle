import { describe, expect, it } from "vitest";
import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
  computeBattleRootScale,
} from "./battleRootScale.ts";

describe("computeBattleRootScale", () => {
  it("uses the smaller of width and height scale at 1280x720", () => {
    expect(computeBattleRootScale(1280, 720)).toBe(1);
  });

  it("scales down uniformly when the viewport is smaller", () => {
    expect(computeBattleRootScale(640, 360)).toBe(0.5);
  });

  it("letterboxes wider viewports using height scale", () => {
    expect(computeBattleRootScale(1920, 720)).toBeCloseTo(1);
    expect(computeBattleRootScale(2560, 720)).toBeCloseTo(1);
  });

  it("pillarboxes taller viewports using width scale", () => {
    expect(computeBattleRootScale(1280, 1080)).toBeCloseTo(1);
    expect(computeBattleRootScale(1280, 1440)).toBeCloseTo(1280 / BATTLE_ROOT_WIDTH);
  });

  it("uses min scale for non-16:9 viewports", () => {
    expect(computeBattleRootScale(1920, 1080)).toBeCloseTo(
      Math.min(1920 / BATTLE_ROOT_WIDTH, 1080 / BATTLE_ROOT_HEIGHT),
    );
    expect(computeBattleRootScale(800, 600)).toBeCloseTo(800 / BATTLE_ROOT_WIDTH);
  });

  it("falls back to 1 for invalid viewport sizes", () => {
    expect(computeBattleRootScale(0, 720)).toBe(1);
    expect(computeBattleRootScale(1280, 0)).toBe(1);
  });

  it("keeps the design basis at 1280x720", () => {
    expect(BATTLE_ROOT_WIDTH).toBe(1280);
    expect(BATTLE_ROOT_HEIGHT).toBe(720);
  });
});
