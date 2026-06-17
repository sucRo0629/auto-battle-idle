import { describe, expect, it } from "vitest";
import { CombatReactionPopupManager } from "./CombatReactionPopup.ts";

describe("CombatReactionPopupManager", () => {
  it("coalesces duplicate evade popups for the same target while active", () => {
    const manager = new CombatReactionPopupManager();

    manager.spawn("enemy-1", "evade");
    manager.spawn("enemy-1", "evade");
    manager.spawn("enemy-1", "evade");

    manager.tick(100);

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    let drawCount = 0;
    ctx.save = () => {
      drawCount += 1;
    };

    manager.draw(ctx, [{ id: "enemy-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);

    expect(drawCount).toBe(1);
  });

  it("allows a new popup after the previous one expires", () => {
    const manager = new CombatReactionPopupManager();

    manager.spawn("enemy-1", "evade");
    manager.tick(900);
    manager.spawn("enemy-1", "evade");

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    let drawCount = 0;
    ctx.save = () => {
      drawCount += 1;
    };

    manager.draw(ctx, [{ id: "enemy-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);

    expect(drawCount).toBe(1);
  });
});
