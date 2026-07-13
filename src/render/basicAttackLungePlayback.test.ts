import { describe, expect, it } from "vitest";
import {
  BasicAttackLungePlayback,
  resolveBasicAttackLungeDirection,
  resolveBasicAttackLungeDistancePx,
} from "./basicAttackLungePlayback.ts";

describe("resolveBasicAttackLungeDistancePx", () => {
  it("uses a fixed lunge distance regardless of target separation", () => {
    expect(resolveBasicAttackLungeDistancePx(24)).toBe(24);
  });
});

describe("resolveBasicAttackLungeDirection", () => {
  it("uses battleX delta toward the target", () => {
    expect(
      resolveBasicAttackLungeDirection({ sourceX: 40, targetX: 180 }),
    ).toBe(1);
    expect(
      resolveBasicAttackLungeDirection({ sourceX: 180, targetX: 40 }),
    ).toBe(-1);
  });

  it("falls back to facingSign when battleX matches", () => {
    expect(
      resolveBasicAttackLungeDirection({
        sourceX: 100,
        targetX: 100,
        facingSign: -1,
      }),
    ).toBe(-1);
  });
});

describe("BasicAttackLungePlayback", () => {
  it("moves forward then returns with a sine bump", () => {
    const playback = new BasicAttackLungePlayback();
    playback.trigger("ally-0", 1, 20);

    playback.tick(0);
    expect(playback.getOffsetX("ally-0")).toBe(0);

    playback.tick(55);
    const mid = playback.getOffsetX("ally-0");
    expect(mid).toBeGreaterThan(0);

    playback.tick(165);
    expect(playback.getOffsetX("ally-0")).toBe(0);
  });

  it("restarts the lunge when the same combatant attacks again", () => {
    const playback = new BasicAttackLungePlayback();
    playback.trigger("ally-0", 1, 20);
    playback.tick(40);
    const first = playback.getOffsetX("ally-0");

    playback.trigger("ally-0", 1, 20);
    playback.tick(0);
    expect(playback.getOffsetX("ally-0")).toBe(0);
    playback.tick(40);
    expect(playback.getOffsetX("ally-0")).toBeCloseTo(first, 5);
  });
});
