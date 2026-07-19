/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { GameTermTooltip } from "./GameTermTooltip.ts";
import { isGameUiOverlayOpen } from "./gameUiOverlay.ts";

function createAnchor(label = "マルチロック"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "game-term-link";
  button.textContent = label;
  document.body.appendChild(button);
  button.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      bottom: 120,
      right: 140,
      width: 40,
      height: 20,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  return button;
}

describe("GameTermTooltip", () => {
  let host: HTMLElement;
  let tooltip: GameTermTooltip;

  afterEach(() => {
    tooltip?.destroy();
    document.body.replaceChildren();
  });

  function setupTooltip(): GameTermTooltip {
    host = document.createElement("div");
    host.style.position = "relative";
    host.style.width = "800px";
    host.style.height = "600px";
    document.body.appendChild(host);
    tooltip = new GameTermTooltip(host);
    return tooltip;
  }

  it("opens on term click and closes on same term toggle", () => {
    setupTooltip();
    const anchor = createAnchor();
    const tooltipEl = host.querySelector(".game-term-tooltip") as HTMLElement;

    tooltip.openFromTerm("multiLock", anchor, "ja");
    expect(isGameUiOverlayOpen(tooltipEl)).toBe(true);
    expect(tooltipEl.querySelector(".game-term-tooltip-title")?.textContent).toBe(
      "マルチロック N",
    );

    tooltip.openFromTerm("multiLock", anchor, "ja");
    expect(isGameUiOverlayOpen(tooltipEl)).toBe(false);
  });

  it("links other terms in tooltip body but not the current term", () => {
    setupTooltip();
    const anchor = createAnchor("障壁");
    tooltip.openFromTerm("wardBarrier", anchor, "ja");

    const tooltipEl = host.querySelector(".game-term-tooltip") as HTMLElement;
    expect(
      tooltipEl.querySelector(
        '.game-term-link[data-game-term-id="wardBarrier"]',
      ),
    ).toBeNull();
    const barrierLink = tooltipEl.querySelector(
      '.game-term-link[data-game-term-id="barrier"]',
    ) as HTMLButtonElement;
    expect(barrierLink).toBeTruthy();

    barrierLink.click();
    expect(tooltipEl.querySelector(".game-term-tooltip-title")?.textContent).toBe(
      "バリア",
    );
  });

  it("resolves tooltip body from description for status terms", () => {
    setupTooltip();
    const anchor = createAnchor("種火");
    tooltip.openFromTerm("emberIgnition", anchor, "ja");

    const body = host.querySelector(".game-term-tooltip-body");
    expect(body?.textContent).toContain("時間では消えない");
    expect(body?.textContent).not.toContain("毎秒");
  });

  it("positions from the pointer in scaled mount coordinates", () => {
    setupTooltip();
    Object.defineProperties(host, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
    });
    host.getBoundingClientRect = () =>
      ({
        top: 50,
        left: 100,
        bottom: 650,
        right: 900,
        width: 800,
        height: 600,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;

    const tooltipEl = host.querySelector(".game-term-tooltip") as HTMLElement;
    tooltipEl.getBoundingClientRect = () =>
      ({
        top: 200,
        left: 300,
        bottom: 400,
        right: 500,
        width: 200,
        height: 200,
        x: 300,
        y: 200,
        toJSON: () => ({}),
      }) as DOMRect;

    tooltip.openFromTerm("multiLock", createAnchor(), "ja", {
      clientX: 300,
      clientY: 400,
    });

    expect(tooltipEl.style.left).toBe("112px");
    expect(tooltipEl.style.top).toBe("63px");
  });
});
