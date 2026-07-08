import { describe, expect, it } from "vitest";
import { resolveTargetIndicatorBobOffsetY } from "./battleFieldIndicatorDraw.ts";

describe("resolveTargetIndicatorBobOffsetY", () => {
  it("returns zero when amplitude or period is zero", () => {
    expect(resolveTargetIndicatorBobOffsetY(500, 0, 1600)).toBe(0);
    expect(resolveTargetIndicatorBobOffsetY(500, 3, 0)).toBe(0);
  });

  it("oscillates within the configured amplitude", () => {
    const amplitude = 3;
    const periodMs = 1600;
    const start = resolveTargetIndicatorBobOffsetY(0, amplitude, periodMs);
    const peak = resolveTargetIndicatorBobOffsetY(periodMs / 4, amplitude, periodMs);
    const trough = resolveTargetIndicatorBobOffsetY(
      (periodMs * 3) / 4,
      amplitude,
      periodMs,
    );

    expect(start).toBeCloseTo(0, 5);
    expect(peak).toBeCloseTo(amplitude, 5);
    expect(trough).toBeCloseTo(-amplitude, 5);
  });
});
