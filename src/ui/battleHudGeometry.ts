import { PARTY_HUD_OVERLAY_STATUS_COLS } from '../battle/statusEffectDisplay.ts';
import { BATTLE_ROOT_HEIGHT, BATTLE_ROOT_WIDTH, snapHudCanvasCssSize } from './battleRootScale.ts';

/** Left / right inset of side HUD columns from the battle-root edge (px). */
export const BATTLE_HUD_SIDE_MARGIN = 24;

/** Bottom inset of partyHud from the battle-root edge — matches side margin. */
export const BATTLE_PARTY_HUD_BOTTOM_MARGIN = BATTLE_HUD_SIDE_MARGIN;

/** Horizontal padding inside overlay `.party-hud-status-badges-wrap` (1px per side). */
export const BATTLE_HUD_STATUS_WRAP_PAD_X = 2;

/** Horizontal padding inside overlay `.party-hud-slot` (5px per side). */
export const BATTLE_HUD_OVERLAY_CARD_PAD_X = 10;

/** Party HUD overlay status icon size (px) — mirrors statusBadgeRenderer constant. */
export const PARTY_HUD_STATUS_BADGE_ICON_SIZE = 20;

const STATUS_BADGE_GAP = 1;

function statusBadgeOutlinePad(outlineWidth: number, scale = 1): number {
  const widthPx = outlineWidth * scale;
  if (widthPx <= 0) return 0;
  return Math.ceil(widthPx) + 1;
}

/** Party overlay status grid width — same formula as measurePartyHudOverlayStatusGrid. */
function measurePartyHudOverlayStatusGridWidth(
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): number {
  const badgeW = iconSize * scale;
  const outlinePad = statusBadgeOutlinePad(outlineWidth, scale);
  const stride =
    badgeW +
    STATUS_BADGE_GAP * scale +
    outlinePad * 2 -
    rowOverlap * scale;
  const cols = PARTY_HUD_OVERLAY_STATUS_COLS;
  return badgeW + Math.max(0, cols - 1) * stride + outlinePad * 2;
}

/** Side HUD column width — party overlay status icon grid + frame padding. */
export function computeBattleSideHudWidth(
  iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusIconOutlineWidth = 1,
  statusBadgeOverlap = 0,
): number {
  const gridWidth = measurePartyHudOverlayStatusGridWidth(
    1,
    iconSize,
    statusIconOutlineWidth,
    statusBadgeOverlap,
  );
  const canvasW = snapHudCanvasCssSize(gridWidth);
  return (
    canvasW + BATTLE_HUD_STATUS_WRAP_PAD_X + BATTLE_HUD_OVERLAY_CARD_PAD_X
  );
}

export const BATTLE_SIDE_HUD_WIDTH = computeBattleSideHudWidth();

/** Party overlay allyCard content width — status badge canvas + wrap padding. */
export function computePartyHudOverlayStatusColumnWidth(
  iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusIconOutlineWidth = 1,
  statusBadgeOverlap = 0,
): number {
  const gridWidth = measurePartyHudOverlayStatusGridWidth(
    1,
    iconSize,
    statusIconOutlineWidth,
    statusBadgeOverlap,
  );
  return snapHudCanvasCssSize(gridWidth) + BATTLE_HUD_STATUS_WRAP_PAD_X;
}

/** Per-side horizontal padding so slot chrome fills partyHud with no inter-card gap. */
export function computePartyHudOverlayCardPadXPerSide(
  slotWidth: number,
  contentWidth = computePartyHudOverlayStatusColumnWidth(),
): number {
  return Math.max(0, (slotWidth - contentWidth) / 2);
}

/** battleLane 上端（battle-root Y）— `battleConstants.BATTLE_LANE_TOP_INSET` と同値。 */
const BATTLE_LANE_TOP_INSET = 64;

/** battleLane height so partyHud sits with bottom margin equal to side margin. */
export function computeBattleCanvasHeightForPartyHudSlot(
  partyHudSlotHeight: number,
  bottomMargin = BATTLE_PARTY_HUD_BOTTOM_MARGIN,
  laneTop = BATTLE_LANE_TOP_INSET,
  rootHeight = BATTLE_ROOT_HEIGHT,
): number {
  return rootHeight - bottomMargin - laneTop - partyHudSlotHeight;
}

export function partyHudRightEdge(): number {
  /** @deprecated 下部横並び partyHud 移行後は combat safe left に使わない */
  return BATTLE_HUD_SIDE_MARGIN + BATTLE_SIDE_HUD_WIDTH;
}

export function enemyHudLeftEdge(): number {
  return BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH;
}
