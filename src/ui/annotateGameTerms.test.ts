import { describe, expect, it } from "vitest";
import {
  segmentTextByGameTerms,
  segmentsToPlainText,
} from "./annotateGameTerms.ts";
import { SKILL_CARD_BODY_TERM_EXCLUDE_IDS, SKILL_CARD_BODY_TERM_INCLUDE_IDS } from "./skillCardDisplayRules.ts";

describe("segmentTextByGameTerms", () => {
  it("prefers longer aliases at the same offset", () => {
    const segments = segmentTextByGameTerms("ブロック率+50%", "ja");
    expect(segments).toEqual([
      { kind: "term", termId: "block", matchedText: "ブロック" },
      { kind: "text", text: "率+50%" },
    ]);
  });

  it("matches multiple non-overlapping terms", () => {
    const text = "バリア付与、スタン3秒";
    const segments = segmentTextByGameTerms(text, "ja");
    expect(segments).toEqual([
      { kind: "term", termId: "barrier", matchedText: "バリア" },
      { kind: "text", text: "付与、" },
      { kind: "term", termId: "stun", matchedText: "スタン" },
      { kind: "text", text: "3秒" },
    ]);
    expect(segmentsToPlainText(segments)).toBe(text);
  });

  it("separates barrier and wardBarrier ids", () => {
    const barrierSegments = segmentTextByGameTerms("バリア×2", "ja");
    expect(
      barrierSegments.some((s) => s.kind === "term" && s.termId === "barrier")
    ).toBe(true);

    const wardSegments = segmentTextByGameTerms("障壁1スタック", "ja");
    expect(
      wardSegments.some((s) => s.kind === "term" && s.termId === "wardBarrier")
    ).toBe(true);

    const resonanceSegments = segmentTextByGameTerms("防壁≥3", "ja");
    expect(
      resonanceSegments.some(
        (s) => s.kind === "term" && s.termId === "blockResonance",
      )
    ).toBe(true);
  });

  it("separates sigilist marks and arenaMark ids", () => {
    const windSegments = segmentTextByGameTerms("乾印を付与", "ja");
    expect(
      windSegments.some((s) => s.kind === "term" && s.termId === "windMark")
    ).toBe(true);

    const earthSegments = segmentTextByGameTerms("坤印を起爆", "ja");
    expect(
      earthSegments.some((s) => s.kind === "term" && s.termId === "earthMark")
    ).toBe(true);

    const arenaSegments = segmentTextByGameTerms("闘士の指名", "ja");
    expect(
      arenaSegments.some((s) => s.kind === "term" && s.termId === "arenaMark")
    ).toBe(true);
  });

  it("does not match ja aliases when locale is unsupported", () => {
    const segments = segmentTextByGameTerms("ダメージ軽減25%", "en" as "ja");
    expect(segments).toEqual([{ kind: "text", text: "ダメージ軽減25%" }]);
  });

  it("does not link damageReduction or damageIncrease in skill text", () => {
    expect(segmentTextByGameTerms("ダメージ軽減 20%", "ja")).toEqual([
      { kind: "text", text: "ダメージ軽減 20%" },
    ]);
    expect(segmentTextByGameTerms("被ダメージ増加 15%", "ja")).toEqual([
      { kind: "text", text: "被ダメージ増加 15%" },
    ]);
  });

  it("separates physical block and magicBlock ids", () => {
    expect(segmentTextByGameTerms("ブロック率+10%", "ja")).toEqual([
      { kind: "term", termId: "block", matchedText: "ブロック" },
      { kind: "text", text: "率+10%" },
    ]);

    expect(segmentTextByGameTerms("魔法ブロック", "ja")[0]).toEqual({
      kind: "term",
      termId: "magicBlock",
      matchedText: "魔法ブロック",
    });

    const mixed = segmentTextByGameTerms(
      "周囲のブロック率+5%、魔法ブロックを可能にする",
      "ja",
    );
    expect(mixed).toEqual([
      { kind: "text", text: "周囲の" },
      { kind: "term", termId: "block", matchedText: "ブロック" },
      { kind: "text", text: "率+5%、" },
      { kind: "term", termId: "magicBlock", matchedText: "魔法ブロック" },
      { kind: "text", text: "を可能にする" },
    ]);
  });

  it("links block, basicAttack, and charge terms", () => {
    expect(segmentTextByGameTerms("ブロック+10%", "ja")[0]).toEqual({
      kind: "term",
      termId: "block",
      matchedText: "ブロック",
    });

    expect(segmentTextByGameTerms("通常攻撃5回", "ja")[0]).toEqual({
      kind: "term",
      termId: "basicAttack",
      matchedText: "通常攻撃",
    });

    expect(segmentTextByGameTerms("1回チャージ可能", "ja")[1]).toEqual({
      kind: "term",
      termId: "charge",
      matchedText: "チャージ",
    });
  });

  it("does not link atk, def, reg, hp, or attackSpeed in skill text", () => {
    expect(segmentTextByGameTerms("攻撃力+20%", "ja")).toEqual([
      { kind: "text", text: "攻撃力+20%" },
    ]);
    expect(segmentTextByGameTerms("防御力+25%", "ja")).toEqual([
      { kind: "text", text: "防御力+25%" },
    ]);
    expect(segmentTextByGameTerms("魔法耐性を20%無視", "ja")).toEqual([
      { kind: "text", text: "魔法耐性を20%無視" },
    ]);
    expect(segmentTextByGameTerms("味方のHPを攻撃力の175%で回復", "ja")).toEqual([
      { kind: "text", text: "味方のHPを攻撃力の175%で回復" },
    ]);
    expect(segmentTextByGameTerms("攻撃速度+25%", "ja")).toEqual([
      { kind: "text", text: "攻撃速度+25%" },
    ]);
  });

  it("preserves newlines in text segments", () => {
    const text = "1行目\nバリア付与\n3行目";
    const segments = segmentTextByGameTerms(text, "ja");
    expect(segments).toEqual([
      { kind: "text", text: "1行目\n" },
      { kind: "term", termId: "barrier", matchedText: "バリア" },
      { kind: "text", text: "付与\n3行目" },
    ]);
    expect(segmentsToPlainText(segments)).toBe(text);
  });

  it("does not link proprietary status names excluded from skill card body", () => {
    expect(
      segmentTextByGameTerms(
        "敵に攻撃スキルが1回命中するごとに「種火」を1スタックする",
        "ja",
        { excludeTermIds: SKILL_CARD_BODY_TERM_EXCLUDE_IDS },
      ),
    ).toEqual([
      {
        kind: "text",
        text: "敵に攻撃スキルが1回命中するごとに「種火」を1スタックする",
      },
    ]);
  });

  it("does not link proprietary status names without aliases", () => {
    expect(segmentTextByGameTerms("種火を付与", "ja")).toEqual([
      { kind: "text", text: "種火を付与" },
    ]);
  });

  it("keeps seedFlame as status-dictionary-only entry", async () => {
    const { getGameTermEntry } = await import("./gameTermGlossary.ts");
    const entry = getGameTermEntry("seedFlame");
    expect(entry?.statusDefinition?.ja).toContain("魔法DoT");
    expect(entry?.description).toBeUndefined();
    expect(entry?.aliases).toBeUndefined();
    expect(entry?.tooltip).toBeUndefined();
  });

  it("links only inline term labels when includeTermIds is set", () => {
    expect(
      segmentTextByGameTerms("マルチロック 2 / 攻撃力の90%の魔法ダメージ", "ja", {
        includeTermIds: SKILL_CARD_BODY_TERM_INCLUDE_IDS,
      }),
    ).toEqual([
      { kind: "term", termId: "multiLock", matchedText: "マルチロック" },
      { kind: "text", text: " 2 / 攻撃力の90%の魔法ダメージ" },
    ]);
    expect(
      segmentTextByGameTerms("バリアを付与", "ja", {
        includeTermIds: SKILL_CARD_BODY_TERM_INCLUDE_IDS,
        excludeTermIds: SKILL_CARD_BODY_TERM_EXCLUDE_IDS,
      }),
    ).toEqual([{ kind: "text", text: "バリアを付与" }]);
  });

  it("links multiLock, skillLock, moveLock, and dotCompress terms", () => {
    expect(segmentTextByGameTerms("Multi-Lock", "en")[0]).toEqual({
      kind: "term",
      termId: "multiLock",
      matchedText: "Multi-Lock",
    });

    expect(segmentTextByGameTerms("硬直・移動停止5秒", "ja")).toEqual([
      { kind: "term", termId: "skillLock", matchedText: "硬直" },
      { kind: "text", text: "・" },
      { kind: "term", termId: "moveLock", matchedText: "移動停止" },
      { kind: "text", text: "5秒" },
    ]);

    expect(segmentTextByGameTerms("DoT圧縮基準×0.7", "ja")[0]).toEqual({
      kind: "term",
      termId: "dotCompress",
      matchedText: "DoT圧縮",
    });
  });
});

describe("gameTermGlossary locale shape", () => {
  it("registers ja and en titles for every entry", async () => {
    const { GAME_TERM_ENTRIES } = await import("./gameTermGlossary.ts");
    for (const entry of GAME_TERM_ENTRIES) {
      expect(entry.title.ja.length).toBeGreaterThan(0);
      expect(entry.title.en.length).toBeGreaterThan(0);
      if (entry.description !== undefined) {
        expect(entry.description.ja.length).toBeGreaterThan(0);
        if (entry.aliases !== undefined) {
          expect(entry.description.en?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }
  });

  it("requires ja aliases only when description is present", async () => {
    const { GAME_TERM_ENTRIES } = await import("./gameTermGlossary.ts");
    for (const entry of GAME_TERM_ENTRIES) {
      if (entry.description === undefined) {
        expect(entry.aliases).toBeUndefined();
        continue;
      }
      expect(entry.aliases?.ja.length).toBeGreaterThan(0);
      if (entry.description.en !== undefined) {
        expect(entry.aliases?.en?.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers every HUD status badge category with a glossary entry", async () => {
    const { GAME_TERM_ENTRIES } = await import("./gameTermGlossary.ts");
    const { STATUS_BADGE_SLOT_ORDER } = await import(
      "../battle/statusEffectDisplay.ts"
    );

    const covered = new Set(
      GAME_TERM_ENTRIES.flatMap((entry) =>
        entry.statusCategory ? [entry.statusCategory] : [],
      ),
    );

    for (const category of STATUS_BADGE_SLOT_ORDER) {
      expect(covered.has(category)).toBe(true);
    }
  });

  it("returns status icon URL only when PNG is registered", async () => {
    const { GAME_TERM_ENTRIES, resolveGameTermStatusIconUrl } = await import(
      "./gameTermGlossary.ts"
    );
    const { hasStatusIcon } = await import("../render/StatusIconRegistry.ts");

    const barrier = GAME_TERM_ENTRIES.find((entry) => entry.id === "barrier");
    expect(barrier).toBeDefined();
    expect(resolveGameTermStatusIconUrl(barrier!)).toBeUndefined();

    const stun = GAME_TERM_ENTRIES.find((entry) => entry.id === "stun");
    expect(stun).toBeDefined();
    expect(stun!.statusCategory).toBe("stun");
    expect(hasStatusIcon("stun")).toBe(true);
    expect(resolveGameTermStatusIconUrl(stun!)).toBeTruthy();

    const magicBlock = GAME_TERM_ENTRIES.find(
      (entry) => entry.id === "magicBlock",
    );
    expect(magicBlock).toBeDefined();
    expect(magicBlock!.statusIconCategory).toBe("block");
    expect(resolveGameTermStatusIconUrl(magicBlock!)).toBeTruthy();
  });
});
