import { BATTLE_ROOT_WIDTH, snapHudCanvasCssSize } from './battleRootScale.ts';
import { PARTY_HUD_OVERLAY_STATUS_COLS } from '../battle/statusEffectDisplay.ts';

/** Left / right inset of side HUD columns from the battle-root edge (px). */
export const BATTLE_HUD_SIDE_MARGIN = 24;

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

export function partyHudRightEdge(): number {
  return BATTLE_HUD_SIDE_MARGIN + BATTLE_SIDE_HUD_WIDTH;
}

export function enemyHudLeftEdge(): number {
  return BATTLE_ROOT_WIDTH - BATTLE_HUD_SIDE_MARGIN - BATTLE_SIDE_HUD_WIDTH;
}
