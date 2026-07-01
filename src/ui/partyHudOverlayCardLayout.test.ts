// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import "../styles/battle-view.css";
import "../styles/party-member-stats.css";
import "../styles/party-hud-overlay.css";
import { PartyHudPanel } from "./PartyHudPanel.ts";
import type { PartyHudEntry } from "./partyHudTypes.ts";
import { PARTY_HUD_SLOT_RECT } from "./battleRootLayout.ts";
import type { StageDamageDisplayRow } from "../battle/stageDamageStats.ts";

function sampleEntry(overrides: Partial<PartyHudEntry> = {}): PartyHudEntry {
  return {
    unitId: "u0",
    partySlotIndex: 0,
    rangePx: 30,
    displayName: "鉄衛士",
    iconKey: "df_guardian",
    hp: 60,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    reg: 0,
    isAlive: true,
    useLocked: false,
    unlockedActiveSlotCount: 2,
    statusEffects: [],
    activeCooldowns: [
      {
        slotIndex: 0,
        remainingSec: 1.2,
        totalSec: 3,
        state: "active",
      },
      {
        slotIndex: 1,
        remainingSec: 0,
        totalSec: 2,
        state: "ready",
      },
    ],
    ...overrides,
  };
}

function mockDisplayRow(
  overrides: Partial<StageDamageDisplayRow> &
    Pick<StageDamageDisplayRow, "slotIndex" | "classId" | "displayName">
): StageDamageDisplayRow {
  return {
    role: "attacker",
    isHealer: false,
    damageDealt: 0,
    damageTaken: 0,
    healingDealt: 0,
    dealtRatio: 0,
    takenRatio: 0,
    ...overrides,
  };
}

describe("PartyHudPanel overlay allyCard layout", () => {
  let host: HTMLElement;
  let panel: PartyHudPanel;

  beforeEach(() => {
    host = document.createElement("div");
    host.className = "battle-view";
    host.style.width = `${PARTY_HUD_SLOT_RECT.w}px`;
    host.style.height = `${PARTY_HUD_SLOT_RECT.h}px`;
    host.style.setProperty("--hud-icon-size", "24");
    host.style.setProperty("--hud-header-font-size", "12");
    host.style.setProperty("--hud-body-bar-h", "14");
    host.style.setProperty("--hud-recast-bar-h", "9.8");
    host.style.setProperty("--hud-recast-gap", "2");
    host.style.setProperty("--party-hud-overlay-recast-h", "21.6");
    document.body.appendChild(host);
    panel = new PartyHudPanel(host, { layout: "overlay" });
    panel.mount(host);
  });

  afterEach(() => {
    panel.destroy();
    host.remove();
  });

  it("stacks header, status, recast, and damage in allyCard order", () => {
    panel.update([sampleEntry(), null, null, null]);

    const card = host.querySelector(".party-hud-card") as HTMLElement;
    expect(card).not.toBeNull();
    const children = [...card.children].map((node) => node.className);
    expect(children).toEqual([
      "party-hud-header-row",
      "party-hud-status-badges-wrap",
      "party-hud-recast-grid",
      "party-stats-damage party-hud-detail-damage",
    ]);
  });

  it("applies HP fill width and active recast gauge widths", () => {
    panel.update([sampleEntry(), null, null, null]);

    const hpFill = host.querySelector(
      ".party-hud-header-row .party-hud-hp-fill"
    ) as HTMLElement;
    const recastGrid = host.querySelector(
      ".party-hud-recast-grid"
    ) as HTMLElement;
    const activeFills = [
      ...recastGrid.querySelectorAll(".party-hud-recast-fill"),
    ] as HTMLElement[];

    expect(hpFill.style.width).toBe("60%");
    expect(recastGrid.querySelectorAll(".party-hud-recast-cell")).toHaveLength(
      4
    );
    expect(
      recastGrid.querySelectorAll(".party-hud-recast-cell--inactive")
    ).toHaveLength(2);
    expect(activeFills[0]?.style.width).not.toBe("0%");
    expect(activeFills[0]?.dataset.state).not.toBe("empty");
    expect(activeFills[1]?.dataset.state).not.toBe("empty");
  });

  it("anchors member stats hover to the overlay header row", () => {
    panel.update([sampleEntry(), null, null, null]);
    const anchor = panel.getMemberStatsAnchor(0);
    expect(anchor?.classList.contains("party-hud-header-row")).toBe(true);
  });

  it("shows synced damage metrics in the overlay damage row", () => {
    panel.update([sampleEntry(), null, null, null]);
    panel.updateDetailMetrics({
      snapshots: [],
      displayRows: [
        mockDisplayRow({
          slotIndex: 0,
          classId: "df_guardian",
          displayName: "鉄衛士",
          damageDealt: 1200,
          damageTaken: 400,
          dealtRatio: 0.6,
          takenRatio: 0.4,
        }),
      ],
    });

    const damageRoot = host.querySelector(
      ".party-hud-detail-damage"
    ) as HTMLElement;
    const bars = host.querySelector(
      ".party-hud-detail-damage .party-stats-damage-bars"
    ) as HTMLElement;

    expect(damageRoot).not.toBeNull();
    expect(damageRoot.hidden).toBe(false);
    expect(bars.children).toHaveLength(2);
    expect(
      host.querySelector(
        ".party-hud-detail-damage .party-stats-damage-bar--dealt .party-stats-damage-bar-value"
      )?.textContent
    ).toBe("1.2k");
    expect(
      host.querySelector(
        ".party-hud-detail-damage .party-stats-damage-bar--taken .party-stats-damage-bar-value"
      )?.textContent
    ).toBe("400");
  });
});
