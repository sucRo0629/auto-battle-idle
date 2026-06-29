import { describe, expect, it } from "vitest";
import { formatSkillCardLines } from "./formatSkillText.ts";
import {
  isSkillCardStatusChipTermId,
  isSkillCardTagTermId,
  SKILL_CARD_STATUS_CHIP_TERM_IDS,
  SKILL_CARD_TAG_TERM_IDS,
} from "./skillCardDisplayRules.ts";
import { resolveSkillCardDisplay, resolveStatusChipTooltip } from "./skillCardDisplay.ts";
import { resolveGameTermTooltip } from "./gameTermGlossary.ts";

describe("skillCardDisplayRules", () => {
  it("keeps generic effect terms out of tag and status-chip allowlists", () => {
    const genericTerms = [
      "barrier",
      "wardBarrier",
      "block",
      "dot",
      "hot",
      "poison",
      "bleed",
      "stun",
      "counter",
      "evasion",
    ] as const;

    for (const termId of genericTerms) {
      expect(isSkillCardTagTermId(termId)).toBe(false);
      expect(isSkillCardStatusChipTermId(termId)).toBe(false);
    }
  });

  it("allows shape tags for multiLock, aoe, and pierce", () => {
    expect(SKILL_CARD_TAG_TERM_IDS).toEqual(["multiLock", "aoe", "pierce"]);
  });

  it("lists proprietary named states for status chips", () => {
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).toContain("seedFlame");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).toContain("blazingFlame");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).not.toContain("dot");
    expect(SKILL_CARD_STATUS_CHIP_TERM_IDS).not.toContain("poison");
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
    expect(display.tags).toEqual([]);
  });

  it("extracts Multi-Lock tag from effect lines without verb phrasing", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.headlineLines).toEqual([
      "Deals 90% ATK as magic damage to 2 enemies",
    ]);
    expect(display.tags.map((tag) => tag.label)).toEqual(["Multi-Lock 2"]);
    expect(display.tags.map((tag) => tag.termId)).toEqual(["multiLock"]);
    expect(resolveGameTermTooltip("multiLock", "en")).toContain(
      "remaining applications hit the same target again"
    );
    expect(
      display.headlineLines.some((line) => /multi-lock/i.test(line))
    ).toBe(false);
  });

  it("does not tag magic damage, block, or generic DoT terms", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_sorcerer_active_1;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.tags).toEqual([]);
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

    expect(display.tags.find((tag) => tag.termId === "multiLock")).toBeDefined();
    expect(display.tags.find((tag) => tag.termId === "multiLock")?.label).toBe(
      "マルチロック2"
    );
    expect(display.headlineLines.some((line) => line.includes("マルチロック"))).toBe(
      false
    );
    expect(display.headlineLines.some((line) => /敵\d+体に/.test(line))).toBe(
      true
    );
    expect(display.headlineLines.some((line) =>
      line.includes("対象不足")
    )).toBe(false);
    expect(resolveGameTermTooltip("multiLock", "ja")).toContain(
      "不足分は同じ対象へ再度適用する"
    );
  });

  it("adds AoE tag for skill-level aoe shape", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.df_paladin_active_2;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.tags.map((tag) => tag.termId)).toContain("aoe");
    expect(display.tags.map((tag) => tag.label)).toContain("AoE");
  });

  it("adds Pierce tag for pierce damage effects", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_ballista_active_4;
    expect(def).toBeDefined();

    const lines = formatSkillCardLines(def!, { locale: "en" });
    const display = resolveSkillCardDisplay(lines, def, "en");

    expect(display.tags.map((tag) => tag.termId)).toContain("pierce");
    expect(display.tags.map((tag) => tag.label)).toContain("Pierce");
  });
});
