export const BATTLE_ROOT_WIDTH = 1280;
export const BATTLE_ROOT_HEIGHT = 720;

export const BATTLE_SCALE_CSS_VAR = "--battle-scale";

/**
 * 12 / 20 / 24px HUD アイコンが CSS 整数ピクセルに乗るよう scale を 1/4 刻みで切り下げる。
 * transform / zoom いずれでも非整数倍だと DOM ピクセルアートがにじむ。
 */
export const BATTLE_HUD_PIXEL_SCALE_STEP = 4;

export function computeRawBattleRootScale(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return 1;
  }

  return Math.min(
    viewportWidth / BATTLE_ROOT_WIDTH,
    viewportHeight / BATTLE_ROOT_HEIGHT,
  );
}

export function snapBattleRootScaleForPixelArt(rawScale: number): number {
  if (rawScale <= 0) return 1;
  const step = 1 / BATTLE_HUD_PIXEL_SCALE_STEP;
  const snapped = Math.floor(rawScale / step) * step;
  return snapped > 0 ? snapped : step;
}

/** Canvas CSS 寸法を HUD スケール刻みに揃え、zoom 後も整数 CSS px になるようにする */
export function snapHudCanvasCssSize(size: number): number {
  if (size <= 0) return BATTLE_HUD_PIXEL_SCALE_STEP;
  return Math.max(
    BATTLE_HUD_PIXEL_SCALE_STEP,
    Math.round(size / BATTLE_HUD_PIXEL_SCALE_STEP) * BATTLE_HUD_PIXEL_SCALE_STEP,
  );
}

export function computeBattleRootScale(
  viewportWidth: number,
  viewportHeight: number,
): number {
  return snapBattleRootScaleForPixelArt(
    computeRawBattleRootScale(viewportWidth, viewportHeight),
  );
}

export function applyBattleRootScale(
  battleRoot: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const scale = computeBattleRootScale(viewportWidth, viewportHeight);
  battleRoot.style.setProperty(BATTLE_SCALE_CSS_VAR, String(scale));
}
