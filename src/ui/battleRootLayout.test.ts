import { describe, expect, it } from "vitest";
import {
  BATTLE_BACKGROUND_RECT,
  BATTLE_LANE_RECT,
  BATTLE_TOP_INFO_RECT,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_SIDE_HUD_WIDTH,
  ENEMY_HUD_MAX_SLOTS,
  ENEMY_HUD_PANEL_FRAME_PADDING,
  ENEMY_HUD_SLOT_GAP,
  ENEMY_HUD_SLOT_HEIGHT,
  ENEMY_HUD_SLOT_RECT,
  PARTY_HUD_ALLY_CARD_GAP,
  PARTY_HUD_ALLY_CARD_HEIGHT,
  PARTY_HUD_SLOT_RECT,
  battleHudToolbarTopY,
  battleRootRectStyle,
  battleXDebugCanvasMaxDisplayHeight,
  battleXDebugCanvasMaxDisplayWidth,
  computeBattleSideHudWidth,
  computeEnemyHudPanelHeight,
} from "./battleRootLayout.ts";
import { BATTLE_ROOT_HEIGHT, BATTLE_ROOT_WIDTH } from "./battleRootScale.ts";
import { battleCanvasHeight } from "../render/formationLayout.ts";

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
    expect(PARTY_HUD_SLOT_RECT).toEqual({
      x: BATTLE_HUD_SIDE_MARGIN,
      y: 64,
      w: BATTLE_SIDE_HUD_WIDTH,
      h: 608,
    });
    expect(ENEMY_HUD_SLOT_RECT).toEqual({
      x: 1280 - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH,
      y: 64,
      w: BATTLE_SIDE_HUD_WIDTH,
      h: 608,
    });
  });

  it("sizes side HUD width to the party overlay status icon grid", () => {
    expect(BATTLE_SIDE_HUD_WIDTH).toBe(computeBattleSideHudWidth());
    expect(BATTLE_SIDE_HUD_WIDTH).toBeGreaterThan(200);
    expect(BATTLE_SIDE_HUD_WIDTH).toBeLessThan(300);
  });

  it("sizes ally cards to fill the partyHud slot height", () => {
    expect(
      4 * PARTY_HUD_ALLY_CARD_HEIGHT + 3 * PARTY_HUD_ALLY_CARD_GAP,
    ).toBe(PARTY_HUD_SLOT_RECT.h);
  });

  it("sizes enemy rows to fit within the enemyHud slot height", () => {
    expect(
      ENEMY_HUD_MAX_SLOTS * ENEMY_HUD_SLOT_HEIGHT +
        (ENEMY_HUD_MAX_SLOTS - 1) * ENEMY_HUD_SLOT_GAP +
        ENEMY_HUD_PANEL_FRAME_PADDING,
    ).toBeLessThanOrEqual(ENEMY_HUD_SLOT_RECT.h);
  });

  it("computes enemyHud panel height from alive count", () => {
    expect(computeEnemyHudPanelHeight(0)).toBe(0);
    expect(computeEnemyHudPanelHeight(1)).toBe(
      ENEMY_HUD_PANEL_FRAME_PADDING + ENEMY_HUD_SLOT_HEIGHT,
    );
    expect(computeEnemyHudPanelHeight(3)).toBe(
      ENEMY_HUD_PANEL_FRAME_PADDING +
        3 * ENEMY_HUD_SLOT_HEIGHT +
        2 * ENEMY_HUD_SLOT_GAP,
    );
  });

  it("aligns battle-x-debug canvas ceiling with battle-hud-toolbar top", () => {
    expect(battleHudToolbarTopY()).toBe(
      BATTLE_LANE_RECT.y + battleCanvasHeight(1),
    );
    expect(battleXDebugCanvasMaxDisplayHeight()).toBe(
      battleHudToolbarTopY() - PARTY_HUD_SLOT_RECT.y - 4,
    );
    expect(battleXDebugCanvasMaxDisplayWidth()).toBe(
      PARTY_HUD_SLOT_RECT.w - 8,
    );
  });

  it("serializes rects for inline style", () => {
    expect(battleRootRectStyle(BATTLE_LANE_RECT)).toBe(
      "left:340px;top:80px;width:600px;height:560px",
    );
  });
});
