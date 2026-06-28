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
    const text = "被ダメ×0.75、スタン3秒";
    const segments = segmentTextByGameTerms(text, "ja");
    expect(segments).toEqual([
      { kind: "term", termId: "damageTaken", matchedText: "被ダメ" },
      { kind: "text", text: "×0.75、" },
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
  });

  it("separates mark and arenaMark ids", () => {
    const markSegments = segmentTextByGameTerms("印を付与", "ja");
    expect(
      markSegments.some((s) => s.kind === "term" && s.termId === "mark")
    ).toBe(true);

    const arenaSegments = segmentTextByGameTerms("闘士の指名", "ja");
    expect(
      arenaSegments.some((s) => s.kind === "term" && s.termId === "arenaMark")
    ).toBe(true);
  });

  it("does not match ja aliases when locale is unsupported", () => {
    const segments = segmentTextByGameTerms("被ダメ×0.75", "en" as "ja");
    expect(segments).toEqual([{ kind: "text", text: "被ダメ×0.75" }]);
  });

  it("prefers ダメージ軽減 over 被ダメ when both could match", () => {
    const segments = segmentTextByGameTerms("ダメージ軽減 20%", "ja");
    expect(segments[0]).toEqual({
      kind: "term",
      termId: "damageTaken",
      matchedText: "ダメージ軽減",
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
});
