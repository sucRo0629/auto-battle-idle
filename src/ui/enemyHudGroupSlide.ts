/** FLIP slide when enemy HUD groups reorder (battle-field.md §8.8). */

export const ENEMY_HUD_GROUP_SLIDE_MS = 260;

export interface Point2D {
  x: number;
  y: number;
}

export function computeSlideDelta(
  before: Pick<DOMRect, 'left' | 'top'>,
  after: Pick<DOMRect, 'left' | 'top'>,
): Point2D {
  return {
    x: before.left - after.left,
    y: before.top - after.top,
  };
}

export function shouldAnimateEnemyHudGroupSlide(delta: Point2D): boolean {
  return Math.abs(delta.x) >= 1 || Math.abs(delta.y) >= 1;
}

export function hasEnemyHudGroupOrderChanged(
  before: readonly string[],
  after: readonly string[],
): boolean {
  if (before.length !== after.length) return true;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) return true;
  }
  return false;
}

/** Clear in-flight FLIP transforms so layout rects are stable. */
export function resetEnemyHudGroupSlideTransforms(
  roots: readonly HTMLElement[],
): void {
  for (const root of roots) {
    root.style.transition = '';
    root.style.transform = '';
  }
}

export function captureEnemyHudGroupRects(
  roots: readonly HTMLElement[],
): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  for (const root of roots) {
    if (root.hidden) continue;
    const groupId = root.dataset.enemyGroupId;
    if (!groupId) continue;
    rects.set(groupId, root.getBoundingClientRect());
  }
  return rects;
}

/** Apply FLIP transform after DOM order changes. */
export function playEnemyHudGroupSlide(
  roots: readonly HTMLElement[],
  beforeRects: ReadonlyMap<string, DOMRect>,
  durationMs = ENEMY_HUD_GROUP_SLIDE_MS,
): void {
  for (const root of roots) {
    if (root.hidden) continue;
    const groupId = root.dataset.enemyGroupId;
    if (!groupId) continue;
    const before = beforeRects.get(groupId);
    if (!before) continue;

    const after = root.getBoundingClientRect();
    const delta = computeSlideDelta(before, after);
    if (!shouldAnimateEnemyHudGroupSlide(delta)) continue;

    root.style.transition = 'none';
    root.style.transform = `translate(${delta.x}px, ${delta.y}px)`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.style.transition = `transform ${durationMs}ms ease-out`;
        root.style.transform = '';
        root.addEventListener(
          'transitionend',
          (event) => {
            if (event.propertyName !== 'transform') return;
            root.style.transition = '';
            root.style.transform = '';
          },
          { once: true },
        );
      });
    });
  }
}
