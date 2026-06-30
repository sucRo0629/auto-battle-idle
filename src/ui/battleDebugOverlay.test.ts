import { describe, expect, it } from "vitest";
import {
  BATTLE_LANE_RECT,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_SLOT_RECT,
} from "./battleRootLayout.ts";

describe("battle debug overlay layout invariants", () => {
  it("keeps core HUD slot rects unchanged for Task 8 separation", () => {
    expect(PARTY_HUD_SLOT_RECT).toEqual({ x: 24, y: 64, w: 300, h: 608 });
    expect(ENEMY_HUD_SLOT_RECT).toEqual({ x: 956, y: 64, w: 300, h: 608 });
    expect(BATTLE_LANE_RECT).toEqual({ x: 340, y: 80, w: 600, h: 560 });
  });
});
