import { describe, expect, it } from "vitest";
import {
  BATTLE_GROUND_LINE_SCREEN_Y,
  BATTLE_LANE_RECT,
  BATTLE_LANE_TOP,
  BATTLE_TOP_INFO_RECT,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_PARTY_HUD_BOTTOM_MARGIN,
  BATTLE_SIDE_HUD_WIDTH,
  ENEMY_HUD_MAX_SLOTS,
  ENEMY_HUD_PANEL_FRAME_PADDING,
  ENEMY_HUD_SLOT_BAND_HEIGHT,
  ENEMY_HUD_SLOT_GAP,
  ENEMY_HUD_SLOT_HEIGHT,
  ENEMY_HUD_SLOT_RECT,
  ENEMY_HUD_SLOT_WIDTH,
  ENEMY_HUD_TOP_Y,
  PARTY_HUD_ALLY_CARD_CONTENT_WIDTH,
  PARTY_HUD_ALLY_CARD_COUNT,
  PARTY_HUD_ALLY_CARD_GAP,
  PARTY_HUD_ALLY_CARD_HEIGHT,
  PARTY_HUD_ALLY_CARD_PAD,
  PARTY_HUD_ALLY_CARD_PAD_Y,
  PARTY_HUD_ALLY_CARD_PAD_X,
  PARTY_HUD_ALLY_CARD_SLOT_WIDTH,
  PARTY_HUD_ALLY_CARD_WIDTH,
  PARTY_HUD_OVERLAY_CARD_PAD_SCALE,
  BATTLE_TRANSIENT_CONTROLS_GAP_ABOVE_PARTY_HUD,
  BATTLE_TRANSIENT_CONTROLS_ROW_HEIGHT,
  BATTLE_TRANSIENT_CONTROLS_TOP,
  PARTY_HUD_SLOT_RECT,
  battleHudToolbarTopY,
  battleRootRectStyle,
  battleXDebugCanvasMaxDisplayHeight,
  battleXDebugCanvasMaxDisplayWidth,
  computeBattleCanvasHeightForPartyHudSlot,
  computeBattleSideHudWidth,
  computeEnemyHudPanelHeight,
  computeEnemyHudSlotWidth,
  computePartyHudAllyCardWidth,
} from "./battleRootLayout.ts";
import { BATTLE_ROOT_HEIGHT, BATTLE_ROOT_WIDTH } from "./battleRootScale.ts";
import { GRASS_BAND_H } from "../render/formationLayout.ts";
import {
  BATTLE_CANVAS_HEIGHT,
  CANVAS_W,
} from "../battle/battleConstants.ts";

describe("battleRootLayout", () => {
  it("covers the full 1280x720 battle root with the background rect", () => {
    expect({ x: 0, y: 0, w: BATTLE_ROOT_WIDTH, h: BATTLE_ROOT_HEIGHT }).toEqual({
      x: 0,
      y: 0,
      w: BATTLE_ROOT_WIDTH,
      h: BATTLE_ROOT_HEIGHT,
    });
  });

  it("uses full-bleed battleLane ending above bottom partyHud", () => {
    expect(BATTLE_LANE_RECT).toEqual({
      x: 0,
      y: BATTLE_LANE_TOP,
      w: BATTLE_ROOT_WIDTH,
      h: BATTLE_CANVAS_HEIGHT,
    });
    expect(BATTLE_LANE_RECT.w).toBe(CANVAS_W);
    expect(BATTLE_LANE_RECT.y + BATTLE_LANE_RECT.h).toBe(PARTY_HUD_SLOT_RECT.y);
    expect(BATTLE_LANE_RECT.h).toBeGreaterThanOrEqual(400);
    expect(BATTLE_LANE_RECT.h).toBeLessThanOrEqual(500);
  });

  it("aligns partyHud bottom margin with side HUD margin", () => {
    expect(BATTLE_PARTY_HUD_BOTTOM_MARGIN).toBe(BATTLE_HUD_SIDE_MARGIN);
    expect(
      BATTLE_ROOT_HEIGHT -
        (PARTY_HUD_SLOT_RECT.y + PARTY_HUD_SLOT_RECT.h),
    ).toBe(BATTLE_PARTY_HUD_BOTTOM_MARGIN);
    expect(computeBattleCanvasHeightForPartyHudSlot(PARTY_HUD_SLOT_RECT.h, BATTLE_PARTY_HUD_BOTTOM_MARGIN, BATTLE_LANE_TOP)).toBe(
      BATTLE_CANVAS_HEIGHT,
    );
  });

  it("reserves topInfo, top enemyHud, bottom partyHud, and battleLane rects", () => {
    expect(BATTLE_TOP_INFO_RECT).toEqual({ x: 24, y: 30, w: 1232, h: 40 });
    expect(ENEMY_HUD_TOP_Y).toBe(BATTLE_TOP_INFO_RECT.y + BATTLE_TOP_INFO_RECT.h);
    expect(ENEMY_HUD_SLOT_RECT).toEqual({
      x: BATTLE_HUD_SIDE_MARGIN,
      y: ENEMY_HUD_TOP_Y,
      w: 1232,
      h: ENEMY_HUD_SLOT_BAND_HEIGHT,
    });
    expect(BATTLE_LANE_TOP).toBe(ENEMY_HUD_TOP_Y + ENEMY_HUD_SLOT_BAND_HEIGHT);
    expect(PARTY_HUD_SLOT_RECT).toEqual({
      x: BATTLE_HUD_SIDE_MARGIN,
      y: BATTLE_LANE_TOP + BATTLE_CANVAS_HEIGHT,
      w: 1232,
      h: 142,
    });
  });

  it("sizes side HUD width to the party overlay status icon grid", () => {
    expect(BATTLE_SIDE_HUD_WIDTH).toBe(computeBattleSideHudWidth());
    expect(BATTLE_SIDE_HUD_WIDTH).toBeGreaterThan(200);
    expect(BATTLE_SIDE_HUD_WIDTH).toBeLessThan(300);
  });

  it("sizes horizontal ally cards to fill partyHud width without inter-card gap", () => {
    expect(computePartyHudAllyCardWidth()).toBe(PARTY_HUD_ALLY_CARD_SLOT_WIDTH);
    expect(PARTY_HUD_ALLY_CARD_WIDTH).toBe(PARTY_HUD_ALLY_CARD_SLOT_WIDTH);
    expect(
      PARTY_HUD_ALLY_CARD_COUNT * PARTY_HUD_ALLY_CARD_SLOT_WIDTH +
        (PARTY_HUD_ALLY_CARD_COUNT - 1) * PARTY_HUD_ALLY_CARD_GAP,
    ).toBe(PARTY_HUD_SLOT_RECT.w);
    expect(PARTY_HUD_ALLY_CARD_GAP).toBe(0);
    expect(PARTY_HUD_ALLY_CARD_HEIGHT).toBe(PARTY_HUD_SLOT_RECT.h);
    expect(PARTY_HUD_ALLY_CARD_SLOT_WIDTH).toBe(308);
    expect(PARTY_HUD_ALLY_CARD_CONTENT_WIDTH).toBeGreaterThan(240);
    expect(PARTY_HUD_ALLY_CARD_CONTENT_WIDTH).toBeLessThan(260);
    expect(PARTY_HUD_ALLY_CARD_PAD_X).toBeGreaterThan(20);
    expect(PARTY_HUD_OVERLAY_CARD_PAD_SCALE).toBe(0.3);
    expect(PARTY_HUD_ALLY_CARD_PAD).toBeCloseTo(
      PARTY_HUD_ALLY_CARD_PAD_X * PARTY_HUD_OVERLAY_CARD_PAD_SCALE,
      5,
    );
    expect(PARTY_HUD_ALLY_CARD_PAD_Y).toBe(PARTY_HUD_ALLY_CARD_PAD);
    expect(
      PARTY_HUD_ALLY_CARD_CONTENT_WIDTH + 2 * PARTY_HUD_ALLY_CARD_PAD_X,
    ).toBe(PARTY_HUD_ALLY_CARD_SLOT_WIDTH);
  });

  it("places ground line above bottom partyHud", () => {
    expect(BATTLE_GROUND_LINE_SCREEN_Y).toBe(
      BATTLE_LANE_TOP + BATTLE_CANVAS_HEIGHT - GRASS_BAND_H,
    );
    expect(BATTLE_GROUND_LINE_SCREEN_Y).toBeGreaterThanOrEqual(470);
    expect(BATTLE_GROUND_LINE_SCREEN_Y).toBeLessThanOrEqual(535);
    expect(BATTLE_GROUND_LINE_SCREEN_Y).toBeLessThan(PARTY_HUD_SLOT_RECT.y);
  });

  it('sizes enemy group stacks to fit within the top enemyHud band', () => {
    expect(ENEMY_HUD_SLOT_HEIGHT).toBeLessThanOrEqual(ENEMY_HUD_SLOT_BAND_HEIGHT);
    expect(computeEnemyHudSlotWidth(3)).toBe(ENEMY_HUD_SLOT_WIDTH);
    expect(ENEMY_HUD_SLOT_WIDTH).toBe(152);
    expect(ENEMY_HUD_SLOT_HEIGHT).toBe(68);
  });

  it("computes enemyHud panel height as fixed band when alive", () => {
    expect(computeEnemyHudPanelHeight(0)).toBe(0);
    expect(computeEnemyHudPanelHeight(1)).toBe(ENEMY_HUD_SLOT_BAND_HEIGHT);
    expect(computeEnemyHudPanelHeight(3)).toBe(ENEMY_HUD_SLOT_BAND_HEIGHT);
  });

  it("places dev control row just above partyHud top-right", () => {
    expect(BATTLE_TRANSIENT_CONTROLS_TOP).toBe(
      PARTY_HUD_SLOT_RECT.y -
        BATTLE_TRANSIENT_CONTROLS_GAP_ABOVE_PARTY_HUD -
        BATTLE_TRANSIENT_CONTROLS_ROW_HEIGHT,
    );
    expect(BATTLE_TRANSIENT_CONTROLS_TOP).toBeLessThan(PARTY_HUD_SLOT_RECT.y);
  });

  it("aligns battle-x-debug canvas ceiling with battle lane bottom", () => {
    expect(battleHudToolbarTopY()).toBe(
      BATTLE_LANE_RECT.y + BATTLE_CANVAS_HEIGHT,
    );
    expect(battleXDebugCanvasMaxDisplayHeight()).toBe(
      battleHudToolbarTopY() - BATTLE_LANE_TOP - 4,
    );
    expect(battleXDebugCanvasMaxDisplayWidth()).toBe(
      BATTLE_SIDE_HUD_WIDTH - 8,
    );
  });

  it("serializes rects for inline style", () => {
    expect(battleRootRectStyle(BATTLE_LANE_RECT)).toBe(
      `left:${BATTLE_LANE_RECT.x}px;top:${BATTLE_LANE_RECT.y}px;width:${BATTLE_LANE_RECT.w}px;height:${BATTLE_LANE_RECT.h}px`,
    );
  });
});
