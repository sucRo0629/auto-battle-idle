import { describe, expect, it } from "vitest";
import {
  segmentTextByGameTerms,
  segmentsToPlainText,
} from "./annotateGameTerms.ts";

describe("segmentTextByGameTerms", () => {
  it("prefers longer aliases at the same offset", () => {
    const segments = segmentTextByGameTerms("ブロック率+50%", "ja");
    expect(segments).toEqual([
      { kind: "term", termId: "block", matchedText: "ブロック率" },
      { kind: "text", text: "+50%" },
    ]);
  });

  it("matches multiple non-overlapping terms", () => {
    const text = "ダメージ軽減25%、スタン3秒";
    const segments = segmentTextByGameTerms(text, "ja");
    expect(segments).toEqual([
      { kind: "term", termId: "damageReduction", matchedText: "ダメージ軽減" },
      { kind: "text", text: "25%、" },
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

  it("links ダメージ軽減 and 被ダメージ増加 separately", () => {
    expect(segmentTextByGameTerms("ダメージ軽減 20%", "ja")[0]).toEqual({
      kind: "term",
      termId: "damageReduction",
      matchedText: "ダメージ軽減",
    });

    expect(segmentTextByGameTerms("被ダメージ増加 15%", "ja")[0]).toEqual({
      kind: "term",
      termId: "damageIncrease",
      matchedText: "被ダメージ増加",
    });

    expect(segmentTextByGameTerms("ダメージ軽減25%", "ja")[0]).toEqual({
      kind: "term",
      termId: "damageReduction",
      matchedText: "ダメージ軽減",
    });

    expect(segmentTextByGameTerms("被ダメージ増加20%", "ja")[0]).toEqual({
      kind: "term",
      termId: "damageIncrease",
      matchedText: "被ダメージ増加",
    });
  });
});

describe("gameTermGlossary locale shape", () => {
  it("registers ja aliases only for v1 matching", async () => {
    const { GAME_TERM_ENTRIES } = await import("./gameTermGlossary.ts");
    for (const entry of GAME_TERM_ENTRIES) {
      expect(entry.title.ja.length).toBeGreaterThan(0);
      expect(entry.description.ja.length).toBeGreaterThan(0);
      expect(entry.aliases.ja.length).toBeGreaterThan(0);
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
});
