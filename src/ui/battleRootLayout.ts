import {
  BATTLE_ROOT_HEIGHT,
  BATTLE_ROOT_WIDTH,
} from "./battleRootScale.ts";
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

/** 草タイル描画帯の高さ — `formationLayout.GRASS_BAND_H` と同値（import 循環回避） */
const GRASS_BAND_H = 24;

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

export const BATTLE_TOP_INFO_RECT: BattleRootRect = {
  x: 24,
  y: 30,
  w: 1232,
  h: 40,
};

/** Top edge of enemyHud band — directly below topInfo (battle-field.md §8 Phase 2). */
export const ENEMY_HUD_TOP_Y =
  BATTLE_TOP_INFO_RECT.y + BATTLE_TOP_INFO_RECT.h;

import {
  computeEnemyHudCardStackFootprint,
  ENEMY_HUD_MAX_VISIBLE_STACK,
} from './enemyHudCardStack.ts';

/** Fixed enemy group footprint height inside top enemyHud (card stack). */
export const ENEMY_HUD_SLOT_HEIGHT = computeEnemyHudCardStackFootprint(
  ENEMY_HUD_MAX_VISIBLE_STACK,
).height;

/** Horizontal gap between enemy group stacks inside enemyHud. */
export const ENEMY_HUD_SLOT_GAP = 4;

/** Maximum enemy group stacks shown in the enemyHud list. */
export const ENEMY_HUD_MAX_SLOTS = 10;

/** Left + right inset inside the enemyHud panel frame (px). */
export const ENEMY_HUD_PANEL_FRAME_PADDING = 8;

/** Fixed per-group stack width — max visible stack footprint; does not shrink for solo enemies. */
export const ENEMY_HUD_SLOT_WIDTH = computeEnemyHudCardStackFootprint(
  ENEMY_HUD_MAX_VISIBLE_STACK,
).width;

/** Reserved top enemyHud band height (single-row strip; battle-field.md §8 Phase 2). */
export const ENEMY_HUD_SLOT_BAND_HEIGHT = 72;

/** Top enemyHud — horizontal alive-enemy strip (battle-field.md §8 Phase 2 Task 1). */
export const ENEMY_HUD_SLOT_RECT: BattleRootRect = {
  x: BATTLE_HUD_SIDE_MARGIN,
  y: ENEMY_HUD_TOP_Y,
  w: BATTLE_TOP_INFO_RECT.w,
  h: ENEMY_HUD_SLOT_BAND_HEIGHT,
};

/** battleLane 上端 — below top enemyHud band. */
export const BATTLE_LANE_TOP = ENEMY_HUD_TOP_Y + ENEMY_HUD_SLOT_BAND_HEIGHT;

/** @deprecated Use `BATTLE_LANE_TOP` — kept for battleConstants re-export. */
export const BATTLE_LANE_TOP_INSET = BATTLE_LANE_TOP;

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

/**
 * 戦闘キャンバス高さ（px）。
 * partyHud 下端の battle-root 下余白が左右余白（24px）と揃うよう導出。
 */
export const BATTLE_CANVAS_HEIGHT = computeBattleCanvasHeightForPartyHudSlot(
  PARTY_HUD_SLOT_HEIGHT,
  BATTLE_PARTY_HUD_BOTTOM_MARGIN,
  BATTLE_LANE_TOP,
);

/** Full-bleed battle lane: HUD はオーバーレイ、キャンバスは root 全幅。高さは下部 partyHud 直上まで。 */
export const BATTLE_LANE_RECT: BattleRootRect = {
  x: 0,
  y: BATTLE_LANE_TOP,
  w: BATTLE_ROOT_WIDTH,
  h: BATTLE_CANVAS_HEIGHT,
};

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

/** @deprecated Use `ENEMY_HUD_SLOT_WIDTH` — kept for layout tests. */
export function computeEnemyHudSlotWidth(
  _aliveCount?: number,
): number {
  return ENEMY_HUD_SLOT_WIDTH;
}

/** Visible enemyHud panel height — fixed band when alive, 0 when empty (wave collapse). */
export function computeEnemyHudPanelHeight(aliveCount: number): number {
  if (aliveCount <= 0) return 0;
  return ENEMY_HUD_SLOT_BAND_HEIGHT;
}

/** battle-x-debug panel top — left column, below top enemyHud. */
export const BATTLE_X_DEBUG_PANEL_TOP = BATTLE_LANE_TOP;

/** Ground line Y on battle-root screen coordinates (above bottom partyHud). */
export const BATTLE_GROUND_LINE_SCREEN_Y =
  BATTLE_LANE_TOP + BATTLE_CANVAS_HEIGHT - GRASS_BAND_H;

/** Ratio for DOM background sky/ground gradient (0–100). */
export const BATTLE_GROUND_LINE_SCREEN_RATIO =
  (BATTLE_GROUND_LINE_SCREEN_Y / BATTLE_ROOT_HEIGHT) * 100;

/** battle lane 下端（キャンバス下端）の battle-root Y */
export function battleHudToolbarTopY(): number {
  return BATTLE_LANE_RECT.y + BATTLE_CANVAS_HEIGHT;
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
