import { describe, expect, it, vi } from "vitest";
import { DamagePopupManager } from "./DamagePopup.ts";
import type { BattleHudTheme } from "./battleHudTheme.ts";
import type { CombatantLayout } from "./IBattleRenderer.ts";

function minimalTheme(): BattleHudTheme {
  return {
    popupFontSize: 12,
    popupFontFamily: "sans-serif",
    popupOutlineWidth: 1,
    popupDamageFill: "#ffffff",
    popupDamageStroke: "#000000",
    popupDotFill: "#ff3333",
    popupDotStroke: "#000000",
    popupPoisonDotFill: "#9933ff",
    popupPoisonDotStroke: "#000000",
    popupHealFill: "#00ff00",
    popupHealStroke: "#000000",
  } as BattleHudTheme;
}

describe("DamagePopupManager", () => {
  it("uses poison dot fill when dotFlavor is poison", () => {
    const manager = new DamagePopupManager();
    manager.spawn("enemy-1", 12, "dot", "poison");

    const fillStyles: string[] = [];
    const ctx = {
      font: "12px sans-serif",
      measureText(text: string) {
        return { width: text.length * 6 };
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      set globalAlpha(_value: number) {},
      set textAlign(_value: CanvasTextAlign) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set miterLimit(_value: number) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      strokeText() {},
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
      fillText() {},
    } as unknown as CanvasRenderingContext2D;

    const layouts: CombatantLayout[] = [
      {
        id: "enemy-1",
        x: 0,
        y: 0,
        spriteKey: "enemy",
        hp: 10,
        maxHp: 10,
        baseMaxHp: 10,
        barrierHp: 0,
        atk: 1,
        def: 1,
        reg: 0,
        isEnemy: true,
        isAlive: true,
        anim: "idle",
        animFrame: 0,
        attackSheetKey: "",
        skillAnimKey: null,
        skillAnimFrame: 0,
        statusEffects: [],
      },
    ];

    manager.draw(ctx, layouts, 32, 1, minimalTheme());

    expect(fillStyles).toContain("#9933ff");
    expect(fillStyles).not.toContain("#ff3333");
  });

  it("uses generic dot fill for bleed flavor", () => {
    const manager = new DamagePopupManager();
    manager.spawn("enemy-1", 8, "dot", "bleed");

    const fillStyles: string[] = [];
    const ctx = {
      font: "12px sans-serif",
      measureText(text: string) {
        return { width: text.length * 6 };
      },
      save() {},
      restore() {},
      translate() {},
      scale() {},
      set globalAlpha(_value: number) {},
      set textAlign(_value: CanvasTextAlign) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      set lineJoin(_value: CanvasLineJoin) {},
      set miterLimit(_value: number) {},
      set strokeStyle(_value: string) {},
      set lineWidth(_value: number) {},
      strokeText() {},
      set fillStyle(value: string) {
        fillStyles.push(value);
      },
      fillText() {},
    } as unknown as CanvasRenderingContext2D;

    const layouts: CombatantLayout[] = [
      {
        id: "enemy-1",
        x: 0,
        y: 0,
        spriteKey: "enemy",
        hp: 10,
        maxHp: 10,
        baseMaxHp: 10,
        barrierHp: 0,
        atk: 1,
        def: 1,
        reg: 0,
        isEnemy: true,
        isAlive: true,
        anim: "idle",
        animFrame: 0,
        attackSheetKey: "",
        skillAnimKey: null,
        skillAnimFrame: 0,
        statusEffects: [],
      },
    ];

    manager.draw(ctx, layouts, 32, 1, minimalTheme());

    expect(fillStyles).toContain("#ff3333");
  });
});
