import { describe, expect, it } from "vitest";
import {
  computeBattlePopupAlpha,
  computeBattlePopupScale,
} from "./battlePopupMotion.ts";

describe("battlePopupMotion", () => {
  it("shrinks back to start scale after the zoom-in peak", () => {
    expect(computeBattlePopupScale(0)).toBeCloseTo(0.3);
    expect(computeBattlePopupScale(0.2)).toBeCloseTo(1);
    expect(computeBattlePopupScale(0.8)).toBeCloseTo(0.3);
  });

  it("fades out while shrinking after zoom-in", () => {
    expect(computeBattlePopupAlpha(0.2)).toBe(1);
    expect(computeBattlePopupAlpha(0.8)).toBeLessThan(1);
  });
});
