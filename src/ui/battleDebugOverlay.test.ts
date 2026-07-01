import { describe, expect, it } from "vitest";
import {
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_LANE_RECT,
  BATTLE_LANE_TOP,
  BATTLE_SIDE_HUD_WIDTH,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_SLOT_RECT,
} from "./battleRootLayout.ts";
import { BATTLE_ROOT_WIDTH } from "./battleRootScale.ts";
import {
  BATTLE_CANVAS_HEIGHT,
  CANVAS_W,
} from "../battle/battleConstants.ts";

describe("battle debug overlay layout invariants", () => {
  it("keeps side HUD rects aligned to the status icon grid width", () => {
    expect(PARTY_HUD_SLOT_RECT).toEqual({
      x: BATTLE_HUD_SIDE_MARGIN,
      y: 64,
      w: BATTLE_SIDE_HUD_WIDTH,
      h: 608,
    });
    expect(ENEMY_HUD_SLOT_RECT).toEqual({
      x: BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH,
      y: 64,
      w: BATTLE_SIDE_HUD_WIDTH,
      h: 608,
    });
    expect(BATTLE_LANE_RECT).toEqual({
      x: 0,
      y: BATTLE_LANE_TOP,
      w: CANVAS_W,
      h: BATTLE_CANVAS_HEIGHT,
    });
  });
});
