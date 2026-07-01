import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import { sortBadgesForCompactView } from '../battle/statusEffectDisplay.ts';
import type { CompactStatusBadgeLayout } from '../render/statusBadgeRenderer.ts';
import {
  drawCompactStatusBadgeRow,
  measureCompactStatusBadgeRow,
} from '../render/statusBadgeRenderer.ts';
import type { BattleHudTheme } from '../render/battleHudTheme.ts';
import { resolveStatusIconFallbackColor } from '../render/battleHudTheme.ts';
import {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
  syncPartyHudStatusBadgeHits,
  type PartyHudStatusBadgeHitContext,
} from './partyHudStatusBadgeHits.ts';

/** Status badge row height in front enemy card (px). */
export const ENEMY_HUD_STATUS_ROW_HEIGHT = 18;

/** Enemy HUD row status icon size (fits status row height). */
export const ENEMY_HUD_STATUS_ICON_SIZE = 14;

/** Visible badges before +N when overflow occurs. */
export const ENEMY_HUD_STATUS_OVERFLOW_VISIBLE = 6;

/** Max badges drawn in one enemy row (includes +N slot). */
export const ENEMY_HUD_STATUS_LAYOUT_SLOTS = 7;

export function resolveEnemyHudStatusBadgeLayout(
  overflowCount: number,
): CompactStatusBadgeLayout {
  if (overflowCount > 0) {
    return {
      visibleCount: ENEMY_HUD_STATUS_OVERFLOW_VISIBLE,
      slotCount: ENEMY_HUD_STATUS_LAYOUT_SLOTS,
    };
  }
  return {
    visibleCount: ENEMY_HUD_STATUS_LAYOUT_SLOTS,
    slotCount: ENEMY_HUD_STATUS_LAYOUT_SLOTS,
  };
}

export function selectEnemyHudStatusBadges(
  badges: StatusEffectBadgeDisplay[],
): { visible: StatusEffectBadgeDisplay[]; overflowCount: number } {
  const sorted = sortBadgesForCompactView(badges);
  if (sorted.length <= ENEMY_HUD_STATUS_LAYOUT_SLOTS) {
    return {
      visible: sorted.slice(0, ENEMY_HUD_STATUS_LAYOUT_SLOTS),
      overflowCount: 0,
    };
  }
  return {
    visible: sorted.slice(0, ENEMY_HUD_STATUS_OVERFLOW_VISIBLE),
    overflowCount: sorted.length - ENEMY_HUD_STATUS_OVERFLOW_VISIBLE,
  };
}

export function drawEnemyHudStatusRow(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  scale: number,
  theme: BattleHudTheme,
): { totalWidth: number; totalHeight: number } {
  const badgeLayout = resolveEnemyHudStatusBadgeLayout(overflowCount);
  const badgeTheme = {
    iconSize: ENEMY_HUD_STATUS_ICON_SIZE,
    rowOverlap: theme.statusBadgeOverlap,
    overlayColor: theme.statusBadgeOverlay,
    iconOutlineColor: theme.statusIconOutlineColor,
    iconOutlineWidth: theme.statusIconOutlineWidth,
    iconFallbackAlpha: theme.statusIconFallbackAlpha,
    resolveIconFallbackColor: (category: Parameters<
      typeof resolveStatusIconFallbackColor
    >[0]) => resolveStatusIconFallbackColor(category, theme),
  };

  return drawCompactStatusBadgeRow(
    ctx,
    left,
    top,
    visible,
    overflowCount,
    scale,
    badgeTheme,
    badgeLayout,
  );
}

export function measureEnemyHudStatusRow(
  scale: number,
  theme: BattleHudTheme,
  overflowCount: number,
): { totalWidth: number; totalHeight: number } {
  const badgeLayout = resolveEnemyHudStatusBadgeLayout(overflowCount);
  return measureCompactStatusBadgeRow(
    scale,
    ENEMY_HUD_STATUS_ICON_SIZE,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
    badgeLayout,
  );
}

export function syncEnemyHudStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  theme: BattleHudTheme,
  slotIndex: number,
  context: PartyHudStatusBadgeHitContext,
): void {
  const badgeLayout = resolveEnemyHudStatusBadgeLayout(overflowCount);
  syncPartyHudStatusBadgeHits(
    hitLayer,
    badges,
    visible,
    overflowCount,
    badgeLayout,
    theme,
    slotIndex,
    context,
    ENEMY_HUD_STATUS_ICON_SIZE,
  );
}

export {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
};
