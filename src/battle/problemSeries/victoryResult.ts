/**
 * R12m 問題系列の最終勝利結果（純粋 factory）。
 *
 * 作戦開始スナップショットから、Stage 非依存・Save 非依存の最小勝利結果を生成する。
 * GameSession / BattleView / 結果 overlay への接続は行わない。
 */

import type { ProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';

/**
 * 問題系列の最終勝利時に確定する最小結果（メモリのみ・Save 非統合）。
 * snapshot の waves / enemyGroups 等は含まない。
 */
export interface ProblemSeriesVictoryResult {
  readonly outcome: 'victory';
  readonly seed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  /** 開始 snapshot の最終 Wave index（0 始まり）。 */
  readonly reachedWaveIndex: number;
}

/**
 * 作戦開始スナップショットから問題系列勝利結果を生成する。
 * seed / generatorVersion / seriesId は snapshot の値をそのまま用い、再計算しない。
 * reachedWaveIndex は `snapshot.waves.length - 1`。
 * waves が空の snapshot は不正として例外を投げる。
 */
export function createProblemSeriesVictoryResult(
  snapshot: ProblemSeriesOperationStartSnapshot,
): ProblemSeriesVictoryResult {
  if (snapshot.waves.length === 0) {
    throw new Error(
      'problem series victory result requires a snapshot with at least one wave',
    );
  }

  return {
    outcome: 'victory',
    seed: snapshot.seed,
    generatorVersion: snapshot.generatorVersion,
    seriesId: snapshot.seriesId,
    reachedWaveIndex: snapshot.waves.length - 1,
  };
}
