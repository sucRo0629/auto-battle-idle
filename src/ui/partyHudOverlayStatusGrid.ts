import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import {
  PARTY_HUD_OVERLAY_STATUS_COLS,
  PARTY_HUD_OVERLAY_STATUS_ROWS,
  PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT,
  selectPartyHudOverlayStatusBadges,
} from '../battle/statusEffectDisplay.ts';
import type { BattleHudTheme } from '../render/battleHudTheme.ts';
import { resolveStatusIconFallbackColor } from '../render/battleHudTheme.ts';
import {
  drawOverflowCountBadge,
  drawStatusBadge,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  prepareStatusBadgeCanvasContext,
  statusBadgeDrawableRowHeight,
  statusBadgeOutlinePad,
  statusBadgeStride,
  statusBadgeWidth,
} from '../render/statusBadgeRenderer.ts';
import {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
  type PartyHudStatusBadgeHitContext,
} from './partyHudStatusBadgeHits.ts';
import {
  resolveCompactStatusOverflowTooltipLabel,
  resolveStatusBadgeGameTermId,
  resolveStatusBadgeTooltipLabel,
  statusBadgeHasClickableGameTerm,
  type GameTermLocale,
} from './gameTermGlossary.ts';
import { getLocale } from '../i18n/locale.ts';

export const PARTY_HUD_OVERLAY_STATUS_ROW_GAP = 1;

export interface PartyHudOverlayStatusGridLayout {
  totalWidth: number;
  totalHeight: number;
  rowHeight: number;
  stride: number;
  outlinePad: number;
  cols: number;
  rows: number;
}

export function measurePartyHudOverlayStatusGrid(
  scale: number,
  iconSize: number,
  outlineWidth: number,
  rowOverlap = 0,
): PartyHudOverlayStatusGridLayout {
  const rowHeight = statusBadgeDrawableRowHeight(scale, iconSize);
  const stride = statusBadgeStride(scale, iconSize, outlineWidth, rowOverlap);
  const badgeW = statusBadgeWidth(scale, iconSize);
  const cols = PARTY_HUD_OVERLAY_STATUS_COLS;
  const rows = PARTY_HUD_OVERLAY_STATUS_ROWS;
  const totalWidth =
    badgeW + Math.max(0, cols - 1) * stride + statusBadgeOutlinePad(outlineWidth, scale) * 2;
  const totalHeight =
    rowHeight * rows + PARTY_HUD_OVERLAY_STATUS_ROW_GAP * (rows - 1);
  return {
    totalWidth,
    totalHeight,
    rowHeight,
    stride,
    outlinePad: statusBadgeOutlinePad(outlineWidth, scale),
    cols,
    rows,
  };
}

function drawEmptyStatusGridSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  badgeSize: number,
): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(Math.round(x), Math.round(y), badgeSize, badgeSize);
  ctx.strokeStyle = 'rgba(143, 168, 200, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, badgeSize - 1, badgeSize - 1);
}

export function drawPartyHudOverlayStatusGrid(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  scale: number,
  theme: {
    iconSize: number;
    rowOverlap: number;
    overlayColor: string;
    iconOutlineColor: string;
    iconOutlineWidth: number;
    iconFallbackAlpha: number;
    resolveIconFallbackColor: (
      category: Parameters<typeof resolveStatusIconFallbackColor>[0],
    ) => string;
  },
): PartyHudOverlayStatusGridLayout {
  prepareStatusBadgeCanvasContext(ctx);
  const layout = measurePartyHudOverlayStatusGrid(
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  const badgeSize = theme.iconSize * scale;
  const overflowSlotIndex = overflowCount > 0 ? visible.length : -1;

  for (let slot = 0; slot < PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT; slot++) {
    const row = Math.floor(slot / layout.cols);
    const col = slot % layout.cols;
    const rowTop =
      top + row * (layout.rowHeight + PARTY_HUD_OVERLAY_STATUS_ROW_GAP);
    const x = left + layout.outlinePad + col * layout.stride;

    if (slot === overflowSlotIndex) {
      drawOverflowCountBadge(ctx, x, rowTop, overflowCount, scale, theme);
      continue;
    }

    const badge = visible[slot];
    if (badge) {
      drawStatusBadge(ctx, x, rowTop, badge, scale, theme);
    } else {
      drawEmptyStatusGridSlot(ctx, x, rowTop + 2 * scale, badgeSize);
    }
  }

  return layout;
}

function createStatusBadgeHitElement(
  tag: 'button' | 'span',
): HTMLButtonElement | HTMLSpanElement {
  const hit = document.createElement(tag);
  hit.className = 'party-hud-status-badge-hit';
  if (tag === 'button') {
    hit.type = 'button';
    hit.classList.add('party-hud-status-badge-hit--interactive');
    hit.setAttribute('aria-expanded', 'false');
  }
  return hit;
}

function positionStatusBadgeHit(
  hit: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  hit.style.left = `${left}px`;
  hit.style.top = `${top}px`;
  hit.style.width = `${width}px`;
  hit.style.height = `${height}px`;
}

function bindHoverTooltipHit(
  hit: HTMLElement,
  text: string,
  context: PartyHudStatusBadgeHitContext,
  options: { wide?: boolean } = {},
): void {
  const floatingTooltip = context.floatingTooltip;
  if (floatingTooltip) {
    floatingTooltip.bindHit(hit, text, options);
    return;
  }

  const tooltip = document.createElement('span');
  tooltip.className = 'party-hud-status-badge-tooltip';
  if (options.wide) {
    tooltip.classList.add('party-hud-status-badge-tooltip--wide');
  }
  tooltip.textContent = text;
  hit.appendChild(tooltip);
}

function bindIndividualStatusBadgeHit(
  hit: HTMLElement,
  badge: StatusEffectBadgeDisplay,
  context: PartyHudStatusBadgeHitContext,
): void {
  const locale = getLocale() as GameTermLocale;
  const label = resolveStatusBadgeTooltipLabel(badge, locale);
  bindHoverTooltipHit(hit, label, context);

  if (!statusBadgeHasClickableGameTerm(badge, locale)) return;

  const termId = resolveStatusBadgeGameTermId(badge);
  const panel = context.gameTermPanel;
  if (!termId || !panel) return;

  hit.setAttribute('aria-label', label);
  if (panel.getPanelId()) {
    hit.setAttribute('aria-controls', panel.getPanelId());
  }

  hit.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.openFromTerm(termId, hit);
  });
}

export function syncPartyHudOverlayStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  theme: BattleHudTheme,
  context: PartyHudStatusBadgeHitContext,
): void {
  hitLayer.replaceChildren();
  if (badges.length === 0) return;

  const scale = 1;
  const iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE;
  const layout = measurePartyHudOverlayStatusGrid(
    scale,
    iconSize,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
  );
  const badgeW = statusBadgeWidth(scale, iconSize);
  const overflowSlotIndex = overflowCount > 0 ? visible.length : -1;

  for (let slot = 0; slot < PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT; slot++) {
    const row = Math.floor(slot / layout.cols);
    const col = slot % layout.cols;
    const left = layout.outlinePad + col * layout.stride;
    const top = row * (layout.rowHeight + PARTY_HUD_OVERLAY_STATUS_ROW_GAP);

    if (slot === overflowSlotIndex) {
      const hit = createStatusBadgeHitElement('span');
      hit.classList.add('party-hud-status-badge-hit--overflow');
      positionStatusBadgeHit(hit, left, top, badgeW, layout.rowHeight);
      bindHoverTooltipHit(
        hit,
        resolveCompactStatusOverflowTooltipLabel(
          badges,
          visible.length,
          getLocale() as GameTermLocale,
        ),
        context,
        { wide: true },
      );
      hitLayer.appendChild(hit);
      continue;
    }

    const badge = visible[slot];
    if (!badge) continue;

    const clickable = statusBadgeHasClickableGameTerm(
      badge,
      getLocale() as GameTermLocale,
    );
    const hit = createStatusBadgeHitElement(clickable ? 'button' : 'span');
    positionStatusBadgeHit(hit, left, top, badgeW, layout.rowHeight);
    bindIndividualStatusBadgeHit(hit, badge, context);
    hitLayer.appendChild(hit);
  }
}

export {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
};
