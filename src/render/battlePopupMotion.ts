export const BATTLE_POPUP_DURATION_MS = 800;

const FADE_IN_END = 0.15;
const ZOOM_IN_END = 0.2;
/** 拡大フェーズの 5 倍の長さで縮小する */
const ZOOM_OUT_END = ZOOM_IN_END * 3;
const START_SCALE = 0.3;
const END_SCALE = 1;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeInQuad(t: number): number {
  return t * t;
}

export function computeBattlePopupAlpha(progress: number): number {
  if (progress < FADE_IN_END) {
    return progress / FADE_IN_END;
  }
  if (progress >= ZOOM_IN_END) {
    const t = Math.min(1, (progress - ZOOM_IN_END) / ZOOM_OUT_END);
    return 1 - easeInQuad(t);
  }
  return 1;
}

export function computeBattlePopupScale(progress: number): number {
  if (progress < ZOOM_IN_END) {
    const t = easeOutCubic(progress / ZOOM_IN_END);
    return START_SCALE + t * (END_SCALE - START_SCALE);
  }
  const zoomOutEnd = ZOOM_IN_END + ZOOM_OUT_END;
  if (progress < zoomOutEnd) {
    const t = easeOutCubic((progress - ZOOM_IN_END) / ZOOM_OUT_END);
    return END_SCALE + t * (START_SCALE - END_SCALE);
  }
  return START_SCALE;
}
