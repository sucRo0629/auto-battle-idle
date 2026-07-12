import { expect } from 'vitest';

const VICTORY_OVERLAY_SELECTOR = '.battle-victory-result-overlay';
const DEFEAT_OVERLAY_SELECTOR = '.battle-defeat-retry-overlay';

const PRODUCTION_OVERLAY_HIDDEN_CSS = `
.battle-defeat-retry-overlay[hidden] {
  display: none !important;
  pointer-events: none !important;
}

.battle-victory-result-overlay[hidden] {
  display: none !important;
  pointer-events: none !important;
}

.battle-defeat-retry-overlay {
  display: flex;
}

.battle-victory-result-overlay {
  display: flex;
}
`;

let overlayTestCssReady = false;

/** happy-dom では import した CSS が効かないため、production と同じ [hidden] ルールを注入する。 */
export function ensureProductionOverlayTestCss(): void {
  if (overlayTestCssReady) return;
  const style = document.createElement('style');
  style.id = 'battle-result-overlay-test-css';
  style.textContent = PRODUCTION_OVERLAY_HIDDEN_CSS;
  document.head.appendChild(style);
  overlayTestCssReady = true;
}

ensureProductionOverlayTestCss();

export function queryOverlay(
  selector: string,
  root: ParentNode = document.body,
): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector);
}

export function overlayComputedDisplay(
  selector: string,
  root: ParentNode = document.body,
): string | undefined {
  const overlay = queryOverlay(selector, root);
  return overlay ? getComputedStyle(overlay).display : undefined;
}

/** hidden 属性と computed display の両方で「見えない」ことを検証する。 */
export function expectOverlayVisuallyHidden(
  selector: string,
  root: ParentNode = document.body,
): void {
  ensureProductionOverlayTestCss();
  const overlay = queryOverlay(selector, root);
  expect(overlay).not.toBeNull();
  expect(overlay?.hidden).toBe(true);
  expect(getComputedStyle(overlay!).display).toBe('none');
}

/** hidden 属性と computed display の両方で「見える」ことを検証する。 */
export function expectOverlayVisuallyVisible(
  selector: string,
  root: ParentNode = document.body,
): void {
  ensureProductionOverlayTestCss();
  const overlay = queryOverlay(selector, root);
  expect(overlay).not.toBeNull();
  expect(overlay?.hidden).toBe(false);
  expect(getComputedStyle(overlay!).display).not.toBe('none');
}

export function expectVictoryOverlayVisuallyHidden(
  root: ParentNode = document.body,
): void {
  expectOverlayVisuallyHidden(VICTORY_OVERLAY_SELECTOR, root);
}

export function expectVictoryOverlayVisuallyVisible(
  root: ParentNode = document.body,
): void {
  expectOverlayVisuallyVisible(VICTORY_OVERLAY_SELECTOR, root);
}

export function createOverlayProbe(className: string): HTMLElement {
  ensureProductionOverlayTestCss();
  const overlay = document.createElement('div');
  overlay.className = className;
  document.body.appendChild(overlay);
  return overlay;
}

export const VICTORY_OVERLAY_CLASS = 'battle-victory-result-overlay';
export const DEFEAT_OVERLAY_CLASS = 'battle-defeat-retry-overlay';
