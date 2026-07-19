/**
 * R12m 問題系列の seed 正規化・安定 hash・deterministic 選出。
 *
 * 汎用 PRNG / shuffle は持たない。catalog 追加・選出規則変更時は
 * `generatorVersion` を変更する責務がある（同じ seed でも別系列になり得る）。
 */

import type { ProblemSeriesCatalogDef, ProblemSeriesDef } from '../types.ts';

/** 実装とテストで固定する FNV-1a 32-bit の offset / prime */
export const PROBLEM_SERIES_FNV1A_OFFSET = 0x811c9dc5;
export const PROBLEM_SERIES_FNV1A_PRIME = 0x01000193;

/**
 * seed 文字列の最小正規化: trim のみ。
 * 空文字は不正（自動生成は Player 入口側の責務）。
 */
export function normalizeProblemSeriesSeed(seed: string): string {
  if (typeof seed !== 'string') {
    throw new Error('problem series seed must be a string');
  }
  const normalized = seed.trim();
  if (normalized.length === 0) {
    throw new Error('problem series seed must be a non-empty string after trim');
  }
  return normalized;
}

/**
 * FNV-1a 32-bit。アルゴリズムは本ファイルとテストで固定する。
 * 入力は UTF-16 code unit 順（JavaScript 文字列の通常走査）。
 */
export function hashProblemSeriesFnv1a32(input: string): number {
  let hash = PROBLEM_SERIES_FNV1A_OFFSET >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, PROBLEM_SERIES_FNV1A_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** generator version を含めた選出用メッセージ。配列順に依存しない。 */
export function buildProblemSeriesSelectionMessage(
  generatorVersion: string,
  normalizedSeed: string,
): string {
  if (!generatorVersion.trim()) {
    throw new Error('generatorVersion must be a non-empty string');
  }
  return `${generatorVersion}\u0000${normalizedSeed}`;
}

export function listProblemSeriesInStableOrder(
  catalog: ProblemSeriesCatalogDef,
): ProblemSeriesDef[] {
  return [...catalog.series].sort((a, b) =>
    a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : 0,
  );
}

export interface ResolveProblemSeriesResult {
  seed: string;
  generatorVersion: string;
  series: ProblemSeriesDef;
  selectionIndex: number;
  selectionHash: number;
}

/**
 * 同じ canonical seed + generator version から同じ系列を選出する。
 * catalog JSON 配列の並べ替えでは結果が変わらない（seriesId 安定順で選出）。
 * 明示された generatorVersion は catalog.generatorVersion と一致必須
 *（不一致の version で hash して別系列を返すことはしない）。
 */
export function resolveProblemSeriesFromSeed(
  catalog: ProblemSeriesCatalogDef,
  seed: string,
  generatorVersion: string = catalog.generatorVersion,
): ResolveProblemSeriesResult {
  if (catalog.series.length === 0) {
    throw new Error('problem series catalog must be non-empty to resolve');
  }
  const normalizedSeed = normalizeProblemSeriesSeed(seed);
  const version = generatorVersion.trim();
  if (!version) {
    throw new Error('generatorVersion must be a non-empty string');
  }
  const catalogVersion = catalog.generatorVersion.trim();
  if (version !== catalogVersion) {
    throw new Error(
      `problem series generatorVersion mismatch: requested "${version}" does not match catalog generatorVersion "${catalogVersion}"`,
    );
  }
  const ordered = listProblemSeriesInStableOrder(catalog);
  const message = buildProblemSeriesSelectionMessage(version, normalizedSeed);
  const selectionHash = hashProblemSeriesFnv1a32(message);
  const selectionIndex = selectionHash % ordered.length;
  const series = ordered[selectionIndex];
  if (series === undefined) {
    throw new Error('problem series selection index out of range');
  }
  return {
    seed: normalizedSeed,
    generatorVersion: version,
    series,
    selectionIndex,
    selectionHash,
  };
}
