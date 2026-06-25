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

  it("shows lastStandRecovery popup text", () => {
    const manager = new CombatReactionPopupManager();
    manager.spawn("ally-1", "lastStandRecovery");

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: (text: string) => {
        expect(text).toBe("再起！");
      },
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    manager.draw(ctx, [{ id: "ally-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);
  });

  it("shows invulnerable popup text", () => {
    const manager = new CombatReactionPopupManager();
    manager.spawn("ally-1", "invulnerable");

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: (text: string) => {
        expect(text).toBe("無敵！");
      },
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    manager.draw(ctx, [{ id: "ally-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);
  });

  it("shows enemyReelIn popup text", () => {
    const manager = new CombatReactionPopupManager();
    manager.spawn("enemy-1", "enemyReelIn");

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: (text: string) => {
        expect(text).toBe("引き寄せ！");
      },
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    manager.draw(ctx, [{ id: "enemy-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);
  });

  it("shows knockback popup text", () => {
    const manager = new CombatReactionPopupManager();
    manager.spawn("enemy-1", "knockback");

    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      strokeText: (text: string) => {
        expect(text).toBe("ノックバック！");
      },
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    manager.draw(ctx, [{ id: "enemy-1", x: 0, y: 0 } as never], 64, 1, {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never);
  });

  it("uses the same anchor for knockback and evade on the same target", () => {
    const manager = new CombatReactionPopupManager();
    const layout = {
      id: "ally-1",
      x: 40,
      y: 100,
      spriteKey: "placeholder",
      skillAnimKey: null,
      anim: "idle" as const,
      animFrame: 0,
    };
    const spriteSize = 64;
    const scale = 1;
    const theme = {
      headerFontSize: 12,
      fontFamily: "sans-serif",
      nameColor: "#fff",
    } as never;

    const anchorYs: number[] = [];
    const ctx = {
      font: "",
      save: () => {},
      restore: () => {},
      translate: (_x: number, y: number) => {
        anchorYs.push(y);
      },
      scale: () => {},
      strokeText: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
    } as unknown as CanvasRenderingContext2D;

    manager.spawn("ally-1", "evade");
    manager.spawn("ally-1", "knockback");
    manager.draw(ctx, [layout as never], spriteSize, scale, theme);

    expect(anchorYs.length).toBe(2);
    expect(anchorYs[0]).toBe(anchorYs[1]);
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
