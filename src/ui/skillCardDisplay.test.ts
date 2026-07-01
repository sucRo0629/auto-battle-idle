import { describe, expect, it } from "vitest";
import { formatSkillCardLines } from "./formatSkillText.ts";
import { segmentTextByGameTerms } from "./annotateGameTerms.ts";
import { resolveSkillCardDisplay } from "./skillCardDisplay.ts";
import { resolveGameTermTooltip, resolveGameTermDescription } from "./gameTermGlossary.ts";

describe("resolveSkillCardDisplay", () => {
  it("keeps only seedFlame grant line; status list rows go to term tooltip", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.at_sorcerer_passive_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "敵に攻撃スキルが1回命中するごとに「種火」を1スタックする",
    ]);
    expect(
      segmentTextByGameTerms(display.headlineLines[0]!, "ja").some(
        (s) => s.kind === "term" && s.termId === "seedFlame",
      ),
    ).toBe(true);
    expect(resolveGameTermTooltip("seedFlame", "ja")).toBe(
      resolveGameTermDescription("seedFlame", "ja"),
    );
    expect(resolveGameTermTooltip("seedFlame", "ja")).toContain("最大5スタック");
    expect(resolveGameTermTooltip("seedFlame", "ja")).not.toContain("攻撃スキル");
  });

  it("keeps barrier effect text in headline without a separate chip row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "マルチロック 2 / 攻撃力の200%のバリア",
    ]);
    expect(display.headlineLines.some((line) => line.includes("バリア"))).toBe(
      true,
    );
  });

  it("keeps bleed grant lines in headline", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_assassin_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines.some((line) => line.includes("出血"))).toBe(
      true,
    );
    expect(display.headlineLines).toEqual([
      "攻撃力の115%の物理ダメージ",
      "対象に出血が付与されているなら、このダメージは+130%される",
      "その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを与える出血を付与する",
    ]);
  });

  it("keeps multi-lock shape text in headline without separate tag row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines).toEqual([
      "Multi-Lock 2 / 90% ATK magic damage",
    ]);
    expect(resolveGameTermTooltip("multiLock", "en")).toContain(
      "remaining applications hit the same target again"
    );
  });

  it("does not treat magic damage as a separate tag row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines[0]).toContain("magic damage");
  });

  it("uses target-count body text for Japanese multi-lock without verb form", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines.some((line) => line.includes("マルチロック"))).toBe(
      true
    );
    expect(display.headlineLines.some((line) => /敵\d+体に/.test(line))).toBe(
      false
    );
    expect(display.headlineLines.some((line) =>
      line.includes("対象不足")
    )).toBe(false);
  });

  it("keeps Nearby shape text in headline without separate tag row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.df_paladin_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines.some((line) => /nearby/i.test(line))).toBe(
      true
    );
  });

  it("keeps paladin Nearby effect lines in headline", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.df_paladin_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "周囲 5 / 味方に以下の効果を付与",
      "魔法耐性+10、ダメージ軽減5%、攻撃力の20%のバリア（加算）",
    ]);
  });

  it("keeps ward and barrier lines for wardweaver emergency active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_4;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "味方全体 障壁 ×2（ダメージ軽減10%）",
      "攻撃力の125%のバリア",
    ]);
  });

  it("keeps Ward and Barrier distinct in English for wardweaver emergency active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_4;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines).toEqual([
      "All allies Ward ×2 (10% Damage Reduction)",
      "Barrier equal to 125% of ATK",
    ]);
  });

  it("keeps pierce shape text in headline without separate tag row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_ballista_active_4;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines.some((line) => line.includes("貫通"))).toBe(
      true
    );
  });

  it("keeps hot grant text in headline for alchemist Nearby active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_alchemist_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "周囲 7 / HoT maxHp×0.6% 8秒 / 薬効+1",
    ]);
  });

  it("keeps hot grant text in headline for alchemist all-ally active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_alchemist_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines).toEqual([
      "味方全体 HoT maxHp×0.8% 10秒",
    ]);
  });

  it("keeps herbalPotency line in headline for alchemist passive aura", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.sp_alchemist_passive_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines[0]).toContain("薬効");
  });

  it("keeps poisonWeapon line in headline for hunter passive", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.at_hunter_passive_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines[0]).toContain("poison");
  });

  it("keeps hunter trap effect lines in headline", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_hunter_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.headlineLines.length).toBeGreaterThan(0);
  });
});
