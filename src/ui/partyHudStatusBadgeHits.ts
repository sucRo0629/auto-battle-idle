import {
  resolveCompactStatusOverflowTooltipLabel,
  resolveStatusBadgeTooltipLabel,
} from "./gameTermGlossary.ts";
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import type { BattleHudTheme } from '../render/battleHudTheme.ts';
import {
  measureCompactStatusBadgeRow,
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusBadgeOutlinePad,
  statusBadgeStride,
  statusBadgeWidth,
} from '../render/statusBadgeRenderer.ts';

export function buildPartyHudStatusBadgeHitSignature(
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  slotIndex: number,
  canvasWidth: number,
  canvasHeight: number,
): string {
  const badgePart = visible
    .map((badge) => `${badge.category}:${badge.stackCount ?? 1}`)
    .join('|');
  return `${slotIndex};${canvasWidth}x${canvasHeight};${overflowCount};${badgePart}`;
}

export function syncPartyHudStatusBadgeHits(
  hitLayer: HTMLElement,
  badges: StatusEffectBadgeDisplay[],
  visible: StatusEffectBadgeDisplay[],
  overflowCount: number,
  visibleCount: number,
  theme: BattleHudTheme,
  slotIndex: number,
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

    const tooltip = document.createElement('span');
    tooltip.className = 'party-hud-status-badge-tooltip';
    if (wide) {
      tooltip.classList.add('party-hud-status-badge-tooltip--wide');
    }
    tooltip.textContent = text;
    hit.appendChild(tooltip);

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
