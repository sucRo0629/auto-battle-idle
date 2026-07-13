/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  bindGameUiOverlayClosed,
  isGameUiOverlayOpen,
  setGameUiFragmentHidden,
  setGameUiOverlayOpen,
} from "./gameUiOverlay.ts";

describe("gameUiOverlay", () => {
  it("tracks overlay open state with a class instead of hidden", () => {
    const element = document.createElement("div");
    bindGameUiOverlayClosed(element);
    expect(isGameUiOverlayOpen(element)).toBe(false);
    expect(element.hasAttribute("hidden")).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("true");

    setGameUiOverlayOpen(element, true);
    expect(isGameUiOverlayOpen(element)).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("false");

    setGameUiOverlayOpen(element, false);
    expect(isGameUiOverlayOpen(element)).toBe(false);
  });

  it("hides optional fragments without the hidden attribute", () => {
    const element = document.createElement("span");
    setGameUiFragmentHidden(element, true);
    expect(element.classList.contains("game-ui-fragment--hidden")).toBe(true);
    expect(element.hasAttribute("hidden")).toBe(false);

    setGameUiFragmentHidden(element, false);
    expect(element.classList.contains("game-ui-fragment--hidden")).toBe(false);
    expect(element.hasAttribute("aria-hidden")).toBe(false);
  });
});
