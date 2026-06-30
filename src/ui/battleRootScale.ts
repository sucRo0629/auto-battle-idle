export const BATTLE_ROOT_WIDTH = 1280;
export const BATTLE_ROOT_HEIGHT = 720;

export const BATTLE_SCALE_CSS_VAR = "--battle-scale";

export function computeBattleRootScale(
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

export function applyBattleRootScale(
  battleRoot: HTMLElement,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const scale = computeBattleRootScale(viewportWidth, viewportHeight);
  battleRoot.style.setProperty(BATTLE_SCALE_CSS_VAR, String(scale));
}
