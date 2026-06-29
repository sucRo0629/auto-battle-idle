import {
  resolveCompactStatusOverflowTooltipLabel,
  resolveStatusBadgeGameTermId,
  resolveStatusBadgeTooltipLabel,
  statusBadgeHasClickableGameTerm,
} from "./gameTermGlossary.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import { getLocale } from '../i18n/locale.ts';
import { quantizeBadgeOverlayStep } from '../render/statusBadgeRenderer.ts';
import type { BattleHudTheme } from '../render/battleHudTheme.ts';
import {
  measureCompactStatusBadgeRow,
  measureStatusBadgeWrap,
  type CompactStatusBadgeLayout,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusBadgeDrawableRowHeight,
  statusBadgeOutlinePad,
  statusBadgeStride,
  statusBadgeWidth,
} from '../render/statusBadgeRenderer.ts';
import type { GameTermPanel } from './GameTermPanel.ts';
import type { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';

export const DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH = 280;

export interface PartyHudStatusBadgeHitContext {
  floatingTooltip: PartyHudFloatingTooltip | null;
  gameTermPanel: GameTermPanel | null;
}

function badgeIdentityPart(badge: StatusEffectBadgeDisplay): string {
  return `${badge.category}:${badge.stackCount ?? 1}`;
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
  alignEnd: boolean,
): void {
  if (alignEnd) {
    hit.classList.add('party-hud-status-badge-hit--align-end');
  }
  hit.style.left = `${left}px`;
  hit.style.top = `${top}px`;
  hit.style.width = `${width}px`;
  hit.style.height = `${height}px`;
}

function bindHoverTooltipHit(
  hit: HTMLElement,
  text: string,
  context: PartyHudStatusBadgeHitContext,
  options: { wide?: boolean; alignEnd?: boolean; placement?: 'above' | 'below' },
): void {
  if (context.floatingTooltip) {
    context.floatingTooltip.bindHit(hit, text, options);
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

function resolveBadgeLocale(): GameTermLocale {
  return getLocale();
}

function bindIndividualStatusBadgeHit(
  hit: HTMLElement,
  badge: StatusEffectBadgeDisplay,
  context: PartyHudStatusBadgeHitContext,
  options: { alignEnd?: boolean; placement?: 'above' | 'below' },
): void {
  const locale = resolveBadgeLocale();
  const label = resolveStatusBadgeTooltipLabel(badge, locale);

  bindHoverTooltipHit(hit, label, context, options);

  if (!statusBadgeHasClickableGameTerm(badge, locale)) {
    return;
  }

  const termId = resolveStatusBadgeGameTermId(badge);
  const panel = context.gameTermPanel;
  if (!termId || !panel) {
    return;
  }

  hit.setAttribute('aria-label', label);
  if (panel.getPanelId()) {
    hit.setAttribute('aria-controls', panel.getPanelId());
  }

  hit.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.openFromTerm(termId, hit);
  });
}

export function buildPartyHudStatusBadgeCanvasSignature(
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  slotIndex: number,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const badgePart = visible
    .map(
      (badge) =>
        `${badgeIdentityPart(badge)}:${quantizeBadgeOverlayStep(badge.remainingRatio)}`,
    )
    .join('|');
  return `${slotIndex};${canvasWidth}x${canvasHeight};${overflowCount};${badgePart}`;
}

export function buildPartyHudStatusBadgeHitSignature(
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  slotIndex: number,
): string {
  const badgePart = visible.map((badge) => badgeIdentityPart(badge)).join('|');
  return `${getLocale()};${slotIndex};${overflowCount};${badgePart}`;
}

export function buildDetailStatusBadgeHitSignature(
  badges: StatusEffectBadgeDisplay[],
): string {
  if (badges.length === 0) return '';
  return `${getLocale()};${badges.map((badge) => badgeIdentityPart(badge)).join('|')}`;
}

export function syncPartyHudStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  badgeLayout: CompactStatusBadgeLayout,
  theme: BattleHudTheme,
  slotIndex: number,
  context: PartyHudStatusBadgeHitContext,
): void {
  hitLayer.replaceChildren();
  if (badges.length === 0) return;

  const scale = 1;
  const iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE;
  const layout = measureCompactStatusBadgeRow(
    scale,
    iconSize,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
    badgeLayout,
  );
  const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
  const stride = statusBadgeStride(
    scale,
    iconSize,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
  );
  const badgeW = statusBadgeWidth(scale, iconSize);
  const alignEnd = slotIndex >= 2;
  const { visibleCount } = badgeLayout;

  for (let i = 0; i < visible.length; i++) {
    const badge = visible[i]!;
    const clickable = statusBadgeHasClickableGameTerm(badge, resolveBadgeLocale());
    const hit = createStatusBadgeHitElement(clickable ? 'button' : 'span');
    positionStatusBadgeHit(
      hit,
      outlinePad + i * stride,
      outlinePad,
      badgeW,
      layout.totalHeight,
      alignEnd,
    );
    bindIndividualStatusBadgeHit(hit, badge, context, { alignEnd });
    hitLayer.appendChild(hit);
  }

  if (overflowCount > 0) {
    const hit = createStatusBadgeHitElement('span');
    hit.classList.add('party-hud-status-badge-hit--overflow');
    positionStatusBadgeHit(
      hit,
      outlinePad + visibleCount * stride,
      outlinePad,
      badgeW,
      layout.totalHeight,
      alignEnd,
    );
    bindHoverTooltipHit(
      hit,
      resolveCompactStatusOverflowTooltipLabel(
        badges,
        visibleCount,
        resolveBadgeLocale(),
      ),
      context,
      { wide: true, alignEnd },
    );
    hitLayer.appendChild(hit);
  }
}

export function syncDetailStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  theme: BattleHudTheme,
  context: PartyHudStatusBadgeHitContext,
  maxWidth = DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
): void {
  hitLayer.replaceChildren();
  if (badges.length === 0) return;

  const scale = 1;
  const iconSize = PARTY_HUD_STATUS_BADGE_ICON_SIZE;
  const layout = measureStatusBadgeWrap(
    badges,
    maxWidth,
    scale,
    iconSize,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
  );
  const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
  const stride = statusBadgeStride(
    scale,
    iconSize,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
  );
  const badgeW = statusBadgeWidth(scale, iconSize);
  const rowHeight = statusBadgeDrawableRowHeight(scale, iconSize);
  const rowGap = Math.max(2, scale * 2);

  let rowTop = outlinePad;
  for (const row of layout.rows) {
    let left = outlinePad;
    for (const badge of row) {
      const clickable = statusBadgeHasClickableGameTerm(badge, resolveBadgeLocale());
      const hit = createStatusBadgeHitElement(clickable ? 'button' : 'span');
      positionStatusBadgeHit(hit, left, rowTop, badgeW, rowHeight, false);
      bindIndividualStatusBadgeHit(hit, badge, context, { placement: 'above' });
      hitLayer.appendChild(hit);
      left += stride;
    }
    rowTop += rowHeight + rowGap;
  }
}
