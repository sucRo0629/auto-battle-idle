import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
} from "./battleRootScale.ts";
import {
  BATTLE_CANVAS_HEIGHT,
  BATTLE_LANE_TOP_INSET,
} from "../battle/battleConstants.ts";
import {
  BATTLE_FIELD_SPRITE_SCALE,
  battleCanvasHeight,
  GRASS_BAND_H,
} from "../render/formationLayout.ts";
import {
  BATTLE_HUD_OVERLAY_CARD_PAD_X,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_HUD_STATUS_WRAP_PAD_X,
  BATTLE_SIDE_HUD_WIDTH,
  computeBattleSideHudWidth,
  computePartyHudOverlayCardPadXPerSide,
  computePartyHudOverlayStatusColumnWidth,
  computeBattleCanvasHeightForPartyHudSlot,
  BATTLE_PARTY_HUD_BOTTOM_MARGIN,
} from "./battleHudGeometry.ts";

export {
  BATTLE_HUD_OVERLAY_CARD_PAD_X,
  BATTLE_HUD_SIDE_MARGIN,
  BATTLE_HUD_STATUS_WRAP_PAD_X,
  BATTLE_SIDE_HUD_WIDTH,
  BATTLE_PARTY_HUD_BOTTOM_MARGIN,
  computeBattleSideHudWidth,
  computeBattleCanvasHeightForPartyHudSlot,
  computePartyHudOverlayCardPadXPerSide,
  computePartyHudOverlayStatusColumnWidth,
} from "./battleHudGeometry.ts";

export interface BattleRootRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BATTLE_BACKGROUND_RECT: BattleRootRect = {
  x: 0,
  y: 0,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_ROOT_HEIGHT,
};

/** Top inset of battle lane below topInfo (px). */
export const BATTLE_LANE_TOP = BATTLE_LANE_TOP_INSET;

/** Full-bleed battle lane: HUD はオーバーレイ、キャンバスは root 全幅。高さは下部 partyHud 直上まで。 */
export const BATTLE_LANE_RECT: BattleRootRect = {
  x: 0,
  y: BATTLE_LANE_TOP,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_CANVAS_HEIGHT,
};

export const BATTLE_TOP_INFO_RECT: BattleRootRect = {
  x: 24,
  y: 16,
  w: 1232,
  h: 40,
};

/** Vertical gap between allyCard sections (party-hud-overlay.css). */
export const PARTY_HUD_OVERLAY_CARD_SECTION_GAP = 2;

/** Fixed allyCard block heights — mirror party-hud-overlay.css */
export const PARTY_HUD_OVERLAY_HEADER_H = 26;
export const PARTY_HUD_OVERLAY_STATUS_H = 49;
export const PARTY_HUD_OVERLAY_DAMAGE_H = 22;
export const PARTY_HUD_OVERLAY_RECAST_SCALE = 0.9;

/** Applied `.party-hud-slot` padding = nominal pad-x × this scale. */
export const PARTY_HUD_OVERLAY_CARD_PAD_SCALE = 0.3;

function partyHudOverlayRecastGridHeightPx(): number {
  const barH = 11 * PARTY_HUD_OVERLAY_RECAST_SCALE;
  const gap = 1 * PARTY_HUD_OVERLAY_RECAST_SCALE;
  return 2 * barH + gap;
}

/** Sum of allyCard section heights + inter-section gaps (px). */
export function computePartyHudOverlayCardContentHeight(): number {
  const blocks = [
    PARTY_HUD_OVERLAY_HEADER_H,
    PARTY_HUD_OVERLAY_STATUS_H,
    partyHudOverlayRecastGridHeightPx(),
    PARTY_HUD_OVERLAY_DAMAGE_H,
  ];
  return (
    blocks.reduce((sum, height) => sum + height, 0) +
    (blocks.length - 1) * PARTY_HUD_OVERLAY_CARD_SECTION_GAP
  );
}

/** Nominal per-side inset when content is centered in the slot (px). */
export function computePartyHudAllyCardNominalPadXPerSide(
  partyHudWidth = BATTLE_TOP_INFO_RECT.w,
  cardCount = 4,
  contentWidth = computePartyHudOverlayStatusColumnWidth(),
): number {
  return computePartyHudOverlayCardPadXPerSide(
    partyHudWidth / cardCount,
    contentWidth,
  );
}

/** Applied per-side slot padding (px). */
export function computePartyHudAllyCardPadPerSide(
  scale = PARTY_HUD_OVERLAY_CARD_PAD_SCALE,
): number {
  return computePartyHudAllyCardNominalPadXPerSide() * scale;
}

/** partyHud slot height from fixed allyCard blocks + applied vertical padding. */
export function computePartyHudSlotHeight(): number {
  const pad = computePartyHudAllyCardPadPerSide();
  return Math.ceil(
    pad + computePartyHudOverlayCardContentHeight() + pad,
  );
}

/** Bottom partyHud — horizontal 4 ally cards (battle-field.md §8 Phase 1 Task 1). */
export const PARTY_HUD_SLOT_HEIGHT = computePartyHudSlotHeight();

export const PARTY_HUD_SLOT_RECT: BattleRootRect = {
  x: BATTLE_HUD_SIDE_MARGIN,
  y: BATTLE_LANE_TOP + BATTLE_CANVAS_HEIGHT,
  w: BATTLE_TOP_INFO_RECT.w,
  h: PARTY_HUD_SLOT_HEIGHT,
};

/** Fixed ally card height inside partyHud. */
export const PARTY_HUD_ALLY_CARD_HEIGHT = PARTY_HUD_SLOT_RECT.h;

/** Ally cards in partyHud — no gap; slot chrome abuts (padding carries spacing). */
export const PARTY_HUD_ALLY_CARD_GAP = 0;

export const PARTY_HUD_ALLY_CARD_COUNT = 4;

/** Outer slot width — four equal columns fill partyHud inner width. */
export const PARTY_HUD_ALLY_CARD_SLOT_WIDTH =
  PARTY_HUD_SLOT_RECT.w / PARTY_HUD_ALLY_CARD_COUNT;

/** Inner content column width — matches overlay status icon grid. */
export const PARTY_HUD_ALLY_CARD_CONTENT_WIDTH =
  computePartyHudOverlayStatusColumnWidth();

/** Nominal per-side inset — centers content column in slot at full pad-x. */
export const PARTY_HUD_ALLY_CARD_PAD_X = computePartyHudAllyCardNominalPadXPerSide(
  PARTY_HUD_ALLY_CARD_SLOT_WIDTH * PARTY_HUD_ALLY_CARD_COUNT,
  PARTY_HUD_ALLY_CARD_COUNT,
  PARTY_HUD_ALLY_CARD_CONTENT_WIDTH,
);

/** Applied per-side slot padding (nominal × scale). */
export const PARTY_HUD_ALLY_CARD_PAD = computePartyHudAllyCardPadPerSide();

/** Vertical padding inside each ally slot — same as applied pad. */
export const PARTY_HUD_ALLY_CARD_PAD_Y = PARTY_HUD_ALLY_CARD_PAD;

/** @deprecated Use PARTY_HUD_ALLY_CARD_PAD_Y */
export const PARTY_HUD_ALLY_CARD_PAD_BOTTOM = PARTY_HUD_ALLY_CARD_PAD_Y;

/** @deprecated Use PARTY_HUD_ALLY_CARD_SLOT_WIDTH — kept for layout tests. */
export function computePartyHudAllyCardWidth(
  partyHudWidth = PARTY_HUD_SLOT_RECT.w,
  cardGap = PARTY_HUD_ALLY_CARD_GAP,
): number {
  const count = PARTY_HUD_ALLY_CARD_COUNT;
  return (partyHudWidth - (count - 1) * cardGap) / count;
}

export const PARTY_HUD_ALLY_CARD_WIDTH = PARTY_HUD_ALLY_CARD_SLOT_WIDTH;

/** Gap between dev control row and partyHud top edge (px). */
export const BATTLE_TRANSIENT_CONTROLS_GAP_ABOVE_PARTY_HUD = 4;

/** Approximate height of formation / debug toggle row (px). */
export const BATTLE_TRANSIENT_CONTROLS_ROW_HEIGHT = 26;

/** battle-root Y for `.battle-transient-controls-dock` — partyHud top-right, above cards. */
export const BATTLE_TRANSIENT_CONTROLS_TOP =
  PARTY_HUD_SLOT_RECT.y -
  BATTLE_TRANSIENT_CONTROLS_ROW_HEIGHT -
  BATTLE_TRANSIENT_CONTROLS_GAP_ABOVE_PARTY_HUD;

export const ENEMY_HUD_SLOT_RECT: BattleRootRect = {
  x: BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH,
  y: 64,
  w: BATTLE_SIDE_HUD_WIDTH,
  h: 608,
};

/** Fixed enemy row height inside enemyHud (battle-field.md §8.8). */
export const ENEMY_HUD_SLOT_HEIGHT = 52;

/** Vertical gap between enemy rows inside enemyHud. */
export const ENEMY_HUD_SLOT_GAP = 6;

/** Maximum enemy rows shown in the enemyHud list. */
export const ENEMY_HUD_MAX_SLOTS = 10;

/** Top + bottom inset inside the enemyHud panel frame (px). */
export const ENEMY_HUD_PANEL_FRAME_PADDING = 8;

/** Visible enemyHud panel height for `aliveCount` living enemies (0 when empty). */
export function computeEnemyHudPanelHeight(aliveCount: number): number {
  if (aliveCount <= 0) return 0;
  return (
    ENEMY_HUD_PANEL_FRAME_PADDING +
    aliveCount * ENEMY_HUD_SLOT_HEIGHT +
    (aliveCount - 1) * ENEMY_HUD_SLOT_GAP
  );
}

/** battle-x-debug panel top — left column, below topInfo. */
export const BATTLE_X_DEBUG_PANEL_TOP = BATTLE_LANE_TOP;

/** Ground line Y on battle-root screen coordinates (above bottom partyHud). */
export const BATTLE_GROUND_LINE_SCREEN_Y =
  BATTLE_LANE_TOP + BATTLE_CANVAS_HEIGHT - GRASS_BAND_H;

/** Ratio for DOM background sky/ground gradient (0–100). */
export const BATTLE_GROUND_LINE_SCREEN_RATIO =
  (BATTLE_GROUND_LINE_SCREEN_Y / BATTLE_ROOT_HEIGHT) * 100;

/** battle lane 下端（キャンバス下端）の battle-root Y */
export function battleHudToolbarTopY(
  spriteScale = BATTLE_FIELD_SPRITE_SCALE,
): number {
  return BATTLE_LANE_RECT.y + battleCanvasHeight(spriteScale);
}

/** Max CSS display width for battle-x-debug canvas (left debug column). */
export function battleXDebugCanvasMaxDisplayWidth(
  panelPaddingHorizontalPx = 8,
): number {
  return BATTLE_SIDE_HUD_WIDTH - panelPaddingHorizontalPx;
}

/** Max CSS display height for battle-x-debug canvas (no scroll; lane ceiling). */
export function battleXDebugCanvasMaxDisplayHeight(
  panelPaddingTopPx = 4,
): number {
  return (
    battleHudToolbarTopY() - BATTLE_X_DEBUG_PANEL_TOP - panelPaddingTopPx
  );
}

export function battleRootRectStyle(rect: BattleRootRect): string {
  return [
    `left:${rect.x}px`,
    `top:${rect.y}px`,
    `width:${rect.w}px`,
    `height:${rect.h}px`,
  ].join(";");
}
