export interface ClampElementToMountBoundsOptions {
  margin?: number;
}

export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function resolveClampDelta(
  visual: RectLike,
  bounds: RectLike,
  margin = 4,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;

  if (visual.left < bounds.left + margin) {
    dx = bounds.left + margin - visual.left;
  } else if (visual.right > bounds.right - margin) {
    dx = bounds.right - margin - visual.right;
  }

  if (visual.top < bounds.top + margin) {
    dy = bounds.top + margin - visual.top;
  } else if (visual.bottom > bounds.bottom - margin) {
    dy = bounds.bottom - margin - visual.bottom;
  }

  return { dx, dy };
}

function readMountScale(mount: HTMLElement): number {
  const rect = mount.getBoundingClientRect();
  const localWidth = mount.clientWidth || mount.offsetWidth;
  if (localWidth <= 0) return 1;
  return rect.width / localWidth;
}

/**
 * Keeps an absolutely positioned element (with optional CSS transform) inside `mount`.
 * Adjusts `left` / `top` in mount-local pixels.
 */
export function clampElementToMountBounds(
  element: HTMLElement,
  mount: HTMLElement,
  options: ClampElementToMountBoundsOptions = {},
): void {
  const margin = options.margin ?? 4;
  const mountRect = mount.getBoundingClientRect();
  const scale = readMountScale(mount);

  const left = Number.parseFloat(element.style.left) || 0;
  const top = Number.parseFloat(element.style.top) || 0;
  const visual = element.getBoundingClientRect();
  const { dx, dy } = resolveClampDelta(visual, mountRect, margin);

  if (dx === 0 && dy === 0) return;

  element.style.left = `${left + dx / scale}px`;
  element.style.top = `${top + dy / scale}px`;
}
