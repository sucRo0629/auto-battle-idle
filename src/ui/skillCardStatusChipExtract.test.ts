import { describe, expect, it } from "vitest";
import {
  extractStatusChipsFromSkillDef,
  sanitizeHeadlineLineForStatusChips,
} from "./skillCardStatusChipExtract.ts";

describe("skillCardStatusChipExtract", () => {
  it("extracts barrier chip from multi-lock barrier active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.sp_wardweaver_active_2;
    expect(def).toBeDefined();

    const chips = extractStatusChipsFromSkillDef(def!, "ja");
    expect(chips).toEqual([
      {
        termId: "barrier",
        title: "バリア",
        summary: "攻撃力200%",
      },
    ]);
  });

  it("extracts bleed chip from assassin active", async () => {
    const { loadGameData } = await import("../battle/data/loadGameData.ts");
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_assassin_active_1;
    expect(def).toBeDefined();

    const chips = extractStatusChipsFromSkillDef(def!, "ja");
    expect(chips.some((chip) => chip.termId === "bleed")).toBe(true);
    expect(chips.find((chip) => chip.termId === "bleed")?.summary).toContain(
      "5秒",
    );
  });

  it("strips barrier grant wording from comma-joined headline when chip is present", () => {
    const chips = [
      {
        termId: "barrier" as const,
        title: "バリア",
        summary: "攻撃力20% / 加算",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "魔法耐性+10、ダメージ軽減5%、攻撃力の20%のバリア（加算）",
        chips,
        "ja",
      ),
    ).toBe("魔法耐性+10、ダメージ軽減5%");
  });

  it("strips barrier grant wording from headline when chip is present", () => {
    const chips = [
      {
        termId: "barrier" as const,
        title: "バリア",
        summary: "攻撃力200%",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "マルチロック 2 / 攻撃力の200%のバリア",
        chips,
        "ja",
      ),
    ).toBe("マルチロック 2 / 攻撃力の200%");
  });

  it("strips hot grant wording when chip is present", () => {
    const chips = [
      {
        termId: "hot" as const,
        title: "HoT",
        summary: "maxHp×0.8% / 10秒",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "味方全体 HoT maxHp×0.8% 10秒",
        chips,
        "ja",
      ),
    ).toBe("味方全体 maxHp×0.8% 10秒");
    expect(
      sanitizeHeadlineLineForStatusChips(
        "AoE 7 / HoT maxHp×0.6% 8秒 / 薬効+1",
        chips,
        "ja",
      ),
    ).toBe("AoE 7 / maxHp×0.6% 8秒 / 薬効+1");
  });

  it("strips ward grant wording when chip is present", () => {
    const chips = [
      {
        termId: "wardBarrier" as const,
        title: "障壁",
        summary: "2スタック",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "味方全体 障壁 ×2（ダメージ軽減10%）",
        chips,
        "ja",
      ),
    ).toBe("味方全体 ×2（ダメージ軽減10%）");
  });

  it("strips poison grant wording when poisonWeapon chip is present", () => {
    const chips = [
      {
        termId: "poisonWeapon" as const,
        title: "毒の武器",
        summary: "20% / 5秒 / 攻撃力10%",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "味方物理basic 20%でpoison 攻撃力10%/5秒",
        chips,
        "ja",
      ),
    ).toBe("味方物理basic 20%で 攻撃力10%/5秒");
  });

  it("strips hot and herbal potency labels when chip is present", () => {
    const chips = [
      {
        termId: "herbalPotency" as const,
        title: "薬効",
        summary: "最大6",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "常時 HoT maxHp×0.4% → 味方全員（薬効蓄積 10秒）",
        chips,
        "ja",
      ),
    ).toBe("常時 maxHp×0.4% → 味方全員（薬効蓄積 10秒）");
  });

  it("strips bleed grant wording from headline when chip is present", () => {
    const chips = [
      {
        termId: "bleed" as const,
        title: "出血",
        summary: "5秒 / 攻撃力30%",
      },
    ];
    expect(
      sanitizeHeadlineLineForStatusChips(
        "その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを与える出血を付与する",
        chips,
        "ja",
      ),
    ).toBe(
      "その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを付与",
    );
  });
});
