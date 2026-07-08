import { describe, expect, it } from "vitest";
import {
  EIGHT_DIRECTION_OFFSETS,
  buildOutlineBandMask,
  extractOutlineMask,
  extractSilhouetteMask,
  fillOutlinePixelData,
  resolveHoverGlowPulseIntensity,
} from "./hoverHighlightOutlineGlow.ts";

describe("extractOutlineMask", () => {
  it("marks alpha edges on an 8-neighbor boundary", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    const set = (x: number, y: number, alpha: number) => {
      const offset = (y * width + x) * 4;
      data[offset + 3] = alpha;
    };

    set(1, 1, 255);
    set(2, 1, 255);
    set(1, 2, 255);
    set(2, 2, 255);

    const mask = extractOutlineMask(data, width, height);
    expect(mask[1 * width + 1]).toBe(1);
    expect(mask[2 * width + 1]).toBe(1);
    expect(mask[1 * width + 2]).toBe(1);
    expect(mask[2 * width + 2]).toBe(1);
    expect(mask[1 * width + 0]).toBe(0);
  });

  it("treats canvas border as transparent for edge detection", () => {
    const width = 3;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    data[3] = 255;

    const mask = extractOutlineMask(data, width, height);
    expect(mask[0]).toBe(1);
  });
});

describe("buildOutlineBandMask", () => {
  it("creates a band outside the silhouette without filling the interior", () => {
    const width = 5;
    const height = 5;
    const silhouette = new Uint8Array(width * height);
    silhouette[2 * width + 2] = 1;

    const band = buildOutlineBandMask(silhouette, width, height, 2);

    expect(silhouette[2 * width + 2]).toBe(1);
    expect(band[2 * width + 2]).toBe(0);
    expect(band[2 * width + 1]).toBe(1);
    expect(band[1 * width + 2]).toBe(1);
    expect(band[0 * width + 2]).toBe(1);
  });
});

describe("fillOutlinePixelData", () => {
  it("writes outline color only on masked pixels", () => {
    const mask = new Uint8Array([0, 1, 0, 1]);
    const pixels = fillOutlinePixelData(mask, 2, 2, {
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });

    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(128);
    expect(pixels[12]).toBe(10);
    expect(pixels[13]).toBe(20);
    expect(pixels[14]).toBe(30);
    expect(pixels[15]).toBe(128);
  });
});

describe("resolveHoverGlowPulseIntensity", () => {
  it("returns values within the expected pulse range", () => {
    const start = resolveHoverGlowPulseIntensity(0);
    const peak = resolveHoverGlowPulseIntensity(825);
    const trough = resolveHoverGlowPulseIntensity(1650);

    expect(start.core).toBeCloseTo(0.86, 5);
    expect(peak.core).toBeCloseTo(1, 5);
    expect(trough.core).toBeCloseTo(start.core, 5);
    expect(start.halo).toBeGreaterThanOrEqual(0.12);
    expect(start.halo).toBeLessThanOrEqual(0.3);
  });
});

describe("EIGHT_DIRECTION_OFFSETS", () => {
  it("contains 8 unique neighbor directions", () => {
    expect(EIGHT_DIRECTION_OFFSETS).toHaveLength(8);
    expect(new Set(EIGHT_DIRECTION_OFFSETS.map(([x, y]) => `${x},${y}`)).size).toBe(
      8,
    );
  });
});
