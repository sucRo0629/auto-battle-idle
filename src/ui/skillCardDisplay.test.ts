import { describe, expect, it } from "vitest";
import { formatSkillCardLines } from "./formatSkillText.ts";
import { resolveSkillCardDisplay } from "./skillCardDisplay.ts";

describe("resolveSkillCardDisplay", () => {
  it("moves seedFlame list items to status chips and keeps a short headline", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.at_sorcerer_passive_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "敵に攻撃スキルが1回命中するごとに「種火」を1スタックする",
    ]);
    expect(display.statusChips).toHaveLength(2);
    expect(display.statusChips[0]?.termId).toBe("seedFlame");
    expect(display.statusChips[0]?.summary).toContain("DoT");
    expect(display.statusChips[0]?.summary).toContain("Max 5");
    expect(display.statusChips[1]?.termId).toBe("blazingFlame");
  });

  it("extracts multi-lock and magic damage tags from active sorcerer skill", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines).toEqual(["Deals 90% ATK as magic damage"]);
    expect(display.tags.map((tag) => tag.label)).toEqual([
      "Multi-Lock 2",
      "Magic damage",
    ]);
  });
});
