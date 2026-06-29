/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { GameTermPanel } from "./GameTermPanel.ts";

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
    expect(panelEl.hidden).toBe(false);
    expect(anchor.getAttribute("aria-expanded")).toBe("true");

    panel.openFromTerm("damageReduction", anchor);
    expect(panelEl.hidden).toBe(true);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
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
    expect((host.querySelector(".game-term-panel") as HTMLElement).hidden).toBe(
      true,
    );
  });

  it("closes and clears history when detail scroll root scrolls", () => {
    setupPanel();
    const anchor = createAnchor();
    panel.openFromTerm("stun", anchor);

    scrollRoot.dispatchEvent(new Event("scroll"));
    expect((host.querySelector(".game-term-panel") as HTMLElement).hidden).toBe(
      true,
    );
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
    expect(panelEl.hidden).toBe(false);
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
    expect((host.querySelector(".game-term-panel") as HTMLElement).hidden).toBe(
      true,
    );
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
    expect(panelEl.hidden).toBe(false);
  });

  it("shows status icon only when HUD PNG is registered", () => {
    setupPanel();
    const anchor = createAnchor("バリア");
    panel.openFromTerm("barrier", anchor);

    const iconEl = host.querySelector(
      ".game-term-panel-icon",
    ) as HTMLImageElement;
    expect(iconEl.hidden).toBe(true);
    expect(iconEl.hasAttribute("src")).toBe(false);

    panel.openFromTerm("stun", createAnchor("スタン"));
    expect(iconEl.hidden).toBe(false);
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
    expect(iconEl.hidden).toBe(false);
    expect(iconEl.getAttribute("src")).toBeTruthy();
    expect(host.querySelector(".game-term-panel-title")?.textContent).toBe(
      "魔法ブロック",
    );
  });
});
