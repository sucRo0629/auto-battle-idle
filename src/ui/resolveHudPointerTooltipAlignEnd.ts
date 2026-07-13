/**
 * Prefer opening a pointer-anchored HUD tooltip to the left of the cursor when
 * the anchor is on the right half of the mount (or when only the left side fits).
 *
 * Must not use DOM slot index: Party HUD uses `flex-direction: row-reverse`, so
 * high visual indices are on the left edge of the screen.
 */
export function resolveHudPointerTooltipAlignEnd(
  localAnchorX: number,
  mountLocalWidth: number,
  panelWidth = 0,
  gapPx = 12,
  marginPx = 4,
): boolean {
  if (mountLocalWidth <= 0) return false;

  if (panelWidth > 0) {
    const fitsRight =
      localAnchorX + gapPx + panelWidth <= mountLocalWidth - marginPx;
    const fitsLeft = localAnchorX - gapPx - panelWidth >= marginPx;
    if (fitsRight !== fitsLeft) return !fitsRight;
  }

  return localAnchorX >= mountLocalWidth / 2;
}
