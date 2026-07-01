import { describe, expect, it } from "vitest";
import {
  BATTLE_HUD_PIXEL_SCALE_STEP,
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
  computeBattleRootScale,
  computeRawBattleRootScale,
  snapBattleRootScaleForPixelArt,
  snapHudCanvasCssSize,
} from "./battleRootScale.ts";

describe("computeRawBattleRootScale", () => {
  it("uses the smaller of width and height scale at 1280x720", () => {
    expect(computeRawBattleRootScale(1280, 720)).toBe(1);
  });

  it("scales down uniformly when the viewport is smaller", () => {
    expect(computeRawBattleRootScale(640, 360)).toBe(0.5);
  });

  it("falls back to 1 for invalid viewport sizes", () => {
    expect(computeRawBattleRootScale(0, 720)).toBe(1);
    expect(computeRawBattleRootScale(1280, 0)).toBe(1);
  });
});

describe("snapBattleRootScaleForPixelArt", () => {
  it("snaps to 1/4 steps so 24px icons land on whole CSS pixels", () => {
    expect(snapBattleRootScaleForPixelArt(0.940625)).toBe(0.75);
    expect(24 * snapBattleRootScaleForPixelArt(0.940625)).toBe(18);
  });

  it("keeps exact quarter scales unchanged", () => {
    expect(snapBattleRootScaleForPixelArt(1)).toBe(1);
    expect(snapBattleRootScaleForPixelArt(0.5)).toBe(0.5);
    expect(snapBattleRootScaleForPixelArt(1.5)).toBe(1.5);
  });

  it("snaps canvas css sizes to the HUD pixel grid", () => {
    expect(snapHudCanvasCssSize(249)).toBe(248);
    expect(snapHudCanvasCssSize(49)).toBe(48);
  });
});

describe("computeBattleRootScale", () => {
  it("uses snapped scale at 1280x720", () => {
    expect(computeBattleRootScale(1280, 720)).toBe(1);
  });

  it("snaps non-quarter viewport scales down for pixel art", () => {
    const raw = Math.min(1204 / BATTLE_ROOT_WIDTH, 678 / BATTLE_ROOT_HEIGHT);
    expect(computeBattleRootScale(1204, 678)).toBe(
      snapBattleRootScaleForPixelArt(raw),
    );
    expect(computeBattleRootScale(1204, 678)).toBe(0.75);
  });

  it("uses min scale for non-16:9 viewports", () => {
    expect(computeBattleRootScale(1920, 1080)).toBeCloseTo(1.5);
    expect(computeBattleRootScale(800, 600)).toBe(0.5);
  });

  it("keeps the design basis at 1280x720", () => {
    expect(BATTLE_ROOT_WIDTH).toBe(1280);
    expect(BATTLE_ROOT_HEIGHT).toBe(720);
    expect(BATTLE_HUD_PIXEL_SCALE_STEP).toBe(4);
  });
});
