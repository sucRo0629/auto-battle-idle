export const GAME_UI_OVERLAY_CLOSED_CLASS = "game-ui-overlay--closed";
export const GAME_UI_FRAGMENT_HIDDEN_CLASS = "game-ui-fragment--hidden";

export function bindGameUiOverlayClosed(element: HTMLElement): void {
  element.classList.add(GAME_UI_OVERLAY_CLOSED_CLASS);
  element.setAttribute("aria-hidden", "true");
}

export function setGameUiOverlayOpen(element: HTMLElement, open: boolean): void {
  element.classList.toggle(GAME_UI_OVERLAY_CLOSED_CLASS, !open);
  element.setAttribute("aria-hidden", open ? "false" : "true");
}

export function isGameUiOverlayOpen(element: HTMLElement): boolean {
  return !element.classList.contains(GAME_UI_OVERLAY_CLOSED_CLASS);
}

export function setGameUiFragmentHidden(
  element: HTMLElement,
  hidden: boolean,
): void {
  element.classList.toggle(GAME_UI_FRAGMENT_HIDDEN_CLASS, hidden);
  if (hidden) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
}
