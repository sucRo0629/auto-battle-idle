import { describe, expect, it } from "vitest";
import {
  BATTLE_BACKGROUND_RECT,
  BATTLE_LANE_RECT,
  BATTLE_TOP_INFO_RECT,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_SLOT_RECT,
  battleRootRectStyle,
} from "./battleRootLayout.ts";
import { BATTLE_ROOT_HEIGHT, BATTLE_ROOT_WIDTH } from "./battleRootScale.ts";

describe("battleRootLayout", () => {
  it("covers the full 1280x720 battle root with the background rect", () => {
    expect(BATTLE_BACKGROUND_RECT).toEqual({
      x: 0,
      y: 0,
      w: BATTLE_ROOT_WIDTH,
      h: BATTLE_ROOT_HEIGHT,
    });
  });

  it("uses the spec battleLane coordinates", () => {
    expect(BATTLE_LANE_RECT).toEqual({
      x: 340,
      y: 80,
      w: 600,
      h: 560,
    });
  });

  it("reserves topInfo and HUD slot rects", () => {
    expect(BATTLE_TOP_INFO_RECT).toEqual({ x: 24, y: 16, w: 1232, h: 40 });
    expect(PARTY_HUD_SLOT_RECT).toEqual({ x: 24, y: 64, w: 300, h: 608 });
    expect(ENEMY_HUD_SLOT_RECT).toEqual({ x: 956, y: 64, w: 300, h: 608 });
  });

  it("serializes rects for inline style", () => {
    expect(battleRootRectStyle(BATTLE_LANE_RECT)).toBe(
      "left:340px;top:80px;width:600px;height:560px",
    );
  });
});
