import {
  resolveCompactStatusOverflowTooltipLabel,
  resolveStatusBadgeTooltipLabel,
} from "./gameTermGlossary.ts";
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import { quantizeBadgeOverlayStep } from '../render/statusBadgeRenderer.ts';
import type { BattleHudTheme } from '../render/battleHudTheme.ts';
import {
  measureCompactStatusBadgeRow,
  measureStatusBadgeWrap,
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusBadgeDrawableRowHeight,
  statusBadgeOutlinePad,
  statusBadgeStride,
  statusBadgeWidth,
} from '../render/statusBadgeRenderer.ts';
import type { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';

export const DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH = 280;

function badgeIdentityPart(badge: StatusEffectBadgeDisplay): string {
  return `${badge.category}:${badge.stackCount ?? 1}`;
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
  return `${slotIndex};${overflowCount};${badgePart}`;
}

export function buildDetailStatusBadgeHitSignature(
  badges: StatusEffectBadgeDisplay[],
): string {
  if (badges.length === 0) return '';
  return badges.map((badge) => badgeIdentityPart(badge)).join('|');
}

export function syncPartyHudStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  visibleCount: number,
  theme: BattleHudTheme,
  slotIndex: number,
  floatingTooltip: PartyHudFloatingTooltip | null,
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
    PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
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

  const attachHit = (left: number, text: string, wide: boolean): void => {
    const hit = document.createElement('span');
    hit.className = 'party-hud-status-badge-hit';
    if (alignEnd) {
      hit.classList.add('party-hud-status-badge-hit--align-end');
    }
    hit.style.left = `${left}px`;
    hit.style.top = `${outlinePad}px`;
    hit.style.width = `${badgeW}px`;
    hit.style.height = `${layout.totalHeight}px`;

    if (floatingTooltip) {
      floatingTooltip.bindHit(hit, text, { wide, alignEnd });
    } else {
      const tooltip = document.createElement('span');
      tooltip.className = 'party-hud-status-badge-tooltip';
      if (wide) {
        tooltip.classList.add('party-hud-status-badge-tooltip--wide');
      }
      tooltip.textContent = text;
      hit.appendChild(tooltip);
    }

    hitLayer.appendChild(hit);
  };

  for (let i = 0; i < visible.length; i++) {
    attachHit(
      outlinePad + i * stride,
      resolveStatusBadgeTooltipLabel(visible[i]!),
      false,
    );
  }

  if (overflowCount > 0) {
    attachHit(
      outlinePad + visibleCount * stride,
      resolveCompactStatusOverflowTooltipLabel(badges, visibleCount),
      true,
    );
  }
}

export function syncDetailStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  theme: BattleHudTheme,
  floatingTooltip: PartyHudFloatingTooltip | null,
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
      const hit = document.createElement('span');
      hit.className = 'party-hud-status-badge-hit';
      hit.style.left = `${left}px`;
      hit.style.top = `${rowTop}px`;
      hit.style.width = `${badgeW}px`;
      hit.style.height = `${rowHeight}px`;

      const text = resolveStatusBadgeTooltipLabel(badge);
      if (floatingTooltip) {
        floatingTooltip.bindHit(hit, text, { placement: 'above' });
      } else {
        const tooltip = document.createElement('span');
        tooltip.className = 'party-hud-status-badge-tooltip';
        tooltip.textContent = text;
        hit.appendChild(tooltip);
      }

      hitLayer.appendChild(hit);
      left += stride;
    }
    rowTop += rowHeight + rowGap;
  }
}
