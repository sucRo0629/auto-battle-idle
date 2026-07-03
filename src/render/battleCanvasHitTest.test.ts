import { describe, expect, it } from "vitest";
import type { CombatantLayout } from "./IBattleRenderer.ts";
import { pickCombatantAtCanvasPoint } from "./battleCanvasHitTest.ts";

function layout(
  id: string,
  x: number,
  isEnemy: boolean,
  depthOffsetY = 0,
): CombatantLayout {
  return {
    id,
    x,
    y: 200,
    depthOffsetY,
    spriteKey: "test",
    hp: 100,
    maxHp: 100,
    baseMaxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 10,
    res: 0,
    isEnemy,
    isAlive: true,
    anim: "idle",
    animFrame: 0,
    attackSheetKey: "",
    skillAnimKey: null,
    skillAnimFrame: 0,
    statusEffects: [],
  };
}

describe("pickCombatantAtCanvasPoint", () => {
  it("returns the front-most sprite under the pointer", () => {
    const layouts = [
      layout("back", 100, false, 20),
      layout("front", 100, false, 0),
    ];

    const hit = pickCombatantAtCanvasPoint(layouts, 110, 210, 1);
    expect(hit?.id).toBe("front");
  });

  it("returns null when no sprite bounds contain the point", () => {
    const layouts = [layout("ally", 100, false)];
    expect(pickCombatantAtCanvasPoint(layouts, 10, 10, 1)).toBeNull();
  });
});
