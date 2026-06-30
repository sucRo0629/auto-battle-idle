import { describe, expect, it } from "vitest";
import { formatSkillCardLines } from "./formatSkillText.ts";
import {
  isSkillCardInlineTermLabelId,
  isSkillCardStatusChipTermId,
  SKILL_CARD_INLINE_TERM_LABEL_IDS,
  SKILL_CARD_STATUS_CHIP_TERM_IDS,
} from "./skillCardDisplayRules.ts";
import { resolveSkillCardDisplay, resolveStatusChipTooltip } from "./skillCardDisplay.ts";
import { resolveGameTermTooltip } from "./gameTermGlossary.ts";

describe("skillCardDisplayRules", () => {
  it("keeps plain-text stats out of inline label and status-chip allowlists", () => {
    const plainTextTerms = ["hp", "atk", "def", "reg", "attackSpeed"] as const;

    for (const termId of plainTextTerms) {
      expect(isSkillCardInlineTermLabelId(termId)).toBe(false);
      expect(isSkillCardStatusChipTermId(termId)).toBe(false);
    }
  });

  it("allows inline labels for shape and special-behavior terms", () => {
    expect(SKILL_CARD_INLINE_TERM_LABEL_IDS).toContain("multiLock");
    expect(SKILL_CARD_INLINE_TERM_LABEL_IDS).toContain("stun");
    expect(SKILL_CARD_INLINE_TERM_LABEL_IDS).toContain("knockback");
    expect(SKILL_CARD_INLINE_TERM_LABEL_IDS).not.toContain("barrier");
  });

  it("lists battle states for state chips including generic states", () => {
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).toContain("seedFlame");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).toContain("barrier");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).toContain("dot");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).not.toContain("multiLock");
  });
});

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
    expect(display.statusChips[0]?.summary).toContain("→熾火");
    const seedTooltip = resolveStatusChipTooltip(
      display.statusChips[0]!,
      "ja",
    );
    expect(seedTooltip.body).toContain("魔法DoT");
    expect(seedTooltip.body).toContain("最大5スタック");
    expect(seedTooltip.body).toContain("「熾火」へ変化する");
    expect(seedTooltip.body).not.toContain("攻撃スキル");
    expect(display.statusChips[1]?.termId).toBe("blazingFlame");
  });

  it("extracts barrier chip for wardweaver multi-lock barrier active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips).toEqual([
      {
        termId: "barrier",
        title: "バリア",
        summary: "攻撃力200%",
      },
    ]);
    expect(display.headlineLines).toEqual([
      "マルチロック 2 / 攻撃力の200%",
    ]);
  });

  it("extracts bleed chip and shortens dot grant line for assassin active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_assassin_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips.some((chip) => chip.termId === "bleed")).toBe(
      true,
    );
    expect(display.headlineLines).toEqual([
      "攻撃力の115%の物理ダメージ",
      "対象に出血が付与されているなら、このダメージは+130%される",
      "その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを付与",
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
    expect(display.headlineLines.some((line) => /multi-lock/i.test(line))).toBe(
      true
    );
  });

  it("does not treat magic damage as a separate tag row", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.statusChips).toEqual([]);
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
    expect(resolveGameTermTooltip("multiLock", "ja")).toContain(
      "不足分は同じ対象へ再度適用する"
    );
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

  it("extracts stacking barrier chip for paladin Nearby active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.df_paladin_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips).toEqual([
      {
        termId: "barrier",
        title: "バリア",
        summary: "攻撃力20% / 加算",
      },
    ]);
    expect(display.headlineLines).toEqual([
      "周囲 5 / 味方に以下の効果を付与",
      "魔法耐性+10、ダメージ軽減5%",
    ]);
  });

  it("extracts ward and barrier chips for wardweaver emergency active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_4;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips.map((chip) => chip.termId)).toEqual([
      "wardBarrier",
      "barrier",
    ]);
    expect(display.statusChips[0]?.summary).toBe("2スタック");
    expect(display.statusChips[1]?.summary).toBe("攻撃力125%");
    expect(display.headlineLines).toEqual([
      "味方全体 ×2（ダメージ軽減10%）",
      "攻撃力の125%",
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

  it("extracts hot chip for alchemist Nearby active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_alchemist_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips).toEqual([
      {
        termId: "hot",
        title: "HoT",
        summary: "maxHp×0.6% / 8秒",
      },
    ]);
    expect(display.headlineLines).toEqual([
      "周囲 7 / maxHp×0.6% 8秒 / 薬効+1",
    ]);
    expect(display.headlineLines.some((line) => /HoT/i.test(line))).toBe(false);
  });

  it("extracts hot chip for alchemist all-ally active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_alchemist_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips[0]?.termId).toBe("hot");
    expect(display.statusChips[0]?.summary).toBe("maxHp×0.8% / 10秒");
    expect(display.headlineLines).toEqual(["味方全体 maxHp×0.8% 10秒"]);
    expect(display.headlineLines.some((line) => /HoT/i.test(line))).toBe(false);
  });

  it("extracts herbalPotency chip for alchemist passive aura", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.sp_alchemist_passive_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips).toEqual([
      {
        termId: "herbalPotency",
        title: "薬効",
        summary: "最大6 / maxHp×0.4% / +0.1%/スタック",
      },
    ]);
    expect(display.headlineLines.some((line) => /HoT/i.test(line))).toBe(false);
  });

  it("extracts poisonWeapon chip for hunter passive", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.passives.at_hunter_passive_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips).toEqual([
      {
        termId: "poisonWeapon",
        title: "毒の武器",
        summary: "20% / 5秒 / 攻撃力10%",
      },
    ]);
    expect(display.headlineLines[0]).not.toMatch(/poison/i);
  });

  it("extracts poison chip from hunter trap active nested effects", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_hunter_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "ja" });
    const display = resolveSkillCardDisplay(lines, def, "ja");

    expect(display.statusChips.some((chip) => chip.termId === "poison")).toBe(
      true,
    );
    expect(display.statusChips.find((chip) => chip.termId === "poison")?.summary).toContain(
      "5秒",
    );
  });
});
