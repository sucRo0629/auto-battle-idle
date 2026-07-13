/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { GameTermPanel } from "./GameTermPanel.ts";
import { isGameUiOverlayOpen } from "./gameUiOverlay.ts";

function createAnchor(label = "ダメージ軽減"): HTMLButtonElement {
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

describe("GameTermPanel", () => {
  let host: HTMLElement;
  let scrollRoot: HTMLElement;
  let panel: GameTermPanel;

  afterEach(() => {
    panel?.destroy();
    document.body.replaceChildren();
  });

  function setupPanel(): GameTermPanel {
    host = document.createElement("div");
    scrollRoot = document.createElement("div");
    scrollRoot.style.height = "200px";
    scrollRoot.style.overflow = "auto";
    host.appendChild(scrollRoot);
    document.body.appendChild(host);

    panel = new GameTermPanel(host, {
      locale: "ja",
      detailScrollRoot: scrollRoot,
    });
    panel.mount();
    return panel;
  }

  it("opens on term click and closes on same term toggle", () => {
    setupPanel();
    const anchor = createAnchor();
    const panelEl = host.querySelector(".game-term-panel") as HTMLElement;

    panel.openFromTerm("damageReduction", anchor);
    expect(isGameUiOverlayOpen(panelEl)).toBe(true);
    expect(anchor.getAttribute("aria-expanded")).toBe("true");

    panel.openFromTerm("damageReduction", anchor);
    expect(isGameUiOverlayOpen(panelEl)).toBe(false);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not link the currently open term in panel body", () => {
    setupPanel();
    const anchor = createAnchor("バリア");
    panel.openFromTerm("barrier", anchor);

    expect(
      host.querySelector(
        '.game-term-panel-body .game-term-link[data-game-term-id="barrier"]',
      ),
    ).toBeNull();
  });

  it("navigates with history and Escape pops one level", () => {
    setupPanel();
    const anchor = createAnchor("障壁");
    panel.openFromTerm("wardBarrier", anchor);

    const innerLink = host.querySelector(
      '.game-term-panel-body .game-term-link[data-game-term-id="barrier"]',
    ) as HTMLButtonElement;
    expect(innerLink).toBeTruthy();
    innerLink.click();
    expect(host.querySelector(".game-term-panel-title")?.textContent).toBe(
      "バリア",
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(host.querySelector(".game-term-panel-title")?.textContent).toBe(
      "障壁",
    );

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(
      isGameUiOverlayOpen(host.querySelector(".game-term-panel") as HTMLElement),
    ).toBe(false);
  });

  it("closes and clears history when detail scroll root scrolls", () => {
    setupPanel();
    const anchor = createAnchor();
    panel.openFromTerm("stun", anchor);

    scrollRoot.dispatchEvent(new Event("scroll"));
    expect(
      isGameUiOverlayOpen(host.querySelector(".game-term-panel") as HTMLElement),
    ).toBe(false);
  });

  it("does not close when clicking inside the panel body", () => {
    setupPanel();
    const anchor = createAnchor();
    panel.openFromTerm("dot", anchor);
    const panelEl = host.querySelector(".game-term-panel") as HTMLElement;
    const body = host.querySelector(".game-term-panel-body") as HTMLElement;

    body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(isGameUiOverlayOpen(panelEl)).toBe(true);
  });

  it("closes on outside pointer down", () => {
    setupPanel();
    const anchor = createAnchor();
    panel.openFromTerm("block", anchor);
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    outside.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(
      isGameUiOverlayOpen(host.querySelector(".game-term-panel") as HTMLElement),
    ).toBe(false);
  });

  it("does not close when clicking status badge anchor", () => {
    setupPanel();
    const badgeHit = document.createElement("button");
    badgeHit.type = "button";
    badgeHit.className = "party-hud-status-badge-hit--interactive";
    document.body.appendChild(badgeHit);
    badgeHit.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 80,
        bottom: 100,
        right: 100,
        width: 20,
        height: 20,
        x: 80,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;

    panel.openFromTerm("stun", badgeHit);
    const panelEl = host.querySelector(".game-term-panel") as HTMLElement;

    badgeHit.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    expect(isGameUiOverlayOpen(panelEl)).toBe(true);
  });

  it("shows status icon only when HUD PNG is registered", () => {
    setupPanel();
    const anchor = createAnchor("バリア");
    panel.openFromTerm("barrier", anchor);

    const iconEl = host.querySelector(
      ".game-term-panel-icon",
    ) as HTMLImageElement;
    expect(iconEl.classList.contains("game-ui-fragment--hidden")).toBe(true);
    expect(iconEl.hasAttribute("src")).toBe(false);

    panel.openFromTerm("stun", createAnchor("スタン"));
    expect(iconEl.classList.contains("game-ui-fragment--hidden")).toBe(false);
    expect(iconEl.getAttribute("src")).toBeTruthy();
  });

  it("shows title only when glossary entry has no description", () => {
    setupPanel();
    panel.openFromTerm("nextOutgoingDamage", createAnchor("次のダメージ増加"));

    expect(host.querySelector(".game-term-panel-title")?.textContent).toBe(
      "次のダメージ増加",
    );
    expect(host.querySelector(".game-term-panel-body")?.textContent).toBe("");
  });

  it("shows block status icon for magicBlock term", () => {
    setupPanel();
    panel.openFromTerm("magicBlock", createAnchor("魔法ブロック"));

    const iconEl = host.querySelector(
      ".game-term-panel-icon",
    ) as HTMLImageElement;
    expect(iconEl.classList.contains("game-ui-fragment--hidden")).toBe(false);
    expect(iconEl.getAttribute("src")).toBeTruthy();
    expect(host.querySelector(".game-term-panel-title")?.textContent).toBe(
      "魔法ブロック",
    );
  });

  it("positions within frameMount for battle HUD layer", () => {
    const frame = document.createElement("div");
    frame.style.cssText = "position:relative;width:400px;height:300px;";
    document.body.appendChild(frame);

    panel = new GameTermPanel(frame, {
      locale: "ja",
      frameMount: frame,
    });
    panel.mount();

    const anchor = createAnchor();
    panel.openFromTerm("stun", anchor);

    const panelEl = frame.querySelector(
      ".game-term-panel--hud-layer",
    ) as HTMLElement;
    expect(isGameUiOverlayOpen(panelEl)).toBe(true);
    expect(panelEl.parentElement).toBe(frame);
    expect(frame.lastElementChild).toBe(panelEl);
    expect(Number.parseFloat(panelEl.style.top)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(panelEl.style.left)).toBeGreaterThanOrEqual(0);
  });

  it("positions from the pointer in zoomed battle HUD coordinates", () => {
    const frame = document.createElement("div");
    document.body.appendChild(frame);
    Object.defineProperties(frame, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
    });
    frame.getBoundingClientRect = () =>
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

    panel = new GameTermPanel(frame, {
      locale: "ja",
      frameMount: frame,
    });
    panel.mount();

    const panelEl = frame.querySelector(".game-term-panel") as HTMLElement;
    panelEl.getBoundingClientRect = () =>
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

    panel.openFromTerm("stun", createAnchor(), {
      clientX: 300,
      clientY: 400,
    });

    expect(panelEl.style.left).toBe("112px");
    expect(panelEl.style.top).toBe("63px");
  });

  it("keeps panel position when navigating via inner term link in battle HUD layer", () => {
    const frame = document.createElement("div");
    document.body.appendChild(frame);
    Object.defineProperties(frame, {
      clientWidth: { value: 400 },
      clientHeight: { value: 300 },
    });
    frame.getBoundingClientRect = () =>
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

    panel = new GameTermPanel(frame, {
      locale: "ja",
      frameMount: frame,
    });
    panel.mount();

    const anchor = createAnchor("障壁");
    const panelEl = frame.querySelector(".game-term-panel") as HTMLElement;
    panelEl.getBoundingClientRect = () =>
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

    panel.openFromTerm("wardBarrier", anchor, {
      clientX: 300,
      clientY: 400,
    });
    const openedLeft = panelEl.style.left;
    const openedTop = panelEl.style.top;
    expect(openedLeft).toBe("112px");
    expect(openedTop).toBe("63px");

    anchor.remove();

    const innerLink = panelEl.querySelector(
      '.game-term-link[data-game-term-id="barrier"]',
    ) as HTMLButtonElement;
    innerLink.click();

    expect(panelEl.style.left).toBe(openedLeft);
    expect(panelEl.style.top).toBe(openedTop);
    expect(panelEl.querySelector(".game-term-panel-title")?.textContent).toBe(
      "バリア",
    );
  });
});
