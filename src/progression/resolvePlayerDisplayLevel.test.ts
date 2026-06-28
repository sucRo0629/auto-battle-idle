import { describe, expect, it } from "vitest";
import { resolvePlayerDisplayLevel } from "./resolvePlayerDisplayLevel.ts";
import type { PartySlotState } from "../battle/types.ts";

function member(level: number): PartySlotState {
  return {
    classId: "at_swordsman",
    progress: { level, exp: 0 },
    build: { equippedActiveSlots: [] },
  };
}

describe("resolvePlayerDisplayLevel", () => {
  it("returns 1 for empty party (all null slots)", () => {
    expect(resolvePlayerDisplayLevel([null, null, null, null])).toBe(1);
  });

  it("returns the sole member level", () => {
    expect(resolvePlayerDisplayLevel([member(7), null, null, null])).toBe(7);
  });

  it("returns max level across multiple members", () => {
    expect(
      resolvePlayerDisplayLevel([member(3), member(12), member(8), null])
    ).toBe(12);
  });

  it("returns shared level when all members match", () => {
    expect(
      resolvePlayerDisplayLevel([member(5), member(5), member(5), member(5)])
    ).toBe(5);
  });
});
