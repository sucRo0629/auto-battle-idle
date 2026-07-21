/**
 * R12m 問題系列の作戦開始スナップショット（純粋 factory）。
 *
 * 選出済み ResolveProblemSeriesResult から、同 seed 再試行で維持する不変入力を生成する。
 * 系列の再選出・GameSession / OperationState への保持は行わない。
 * 公開型は OperationCheckpointSnapshot と同様の TypeScript deep-readonly 境界。
 */

import type { ClassId } from '../types.ts';
import type { ResolveProblemSeriesResult } from './seedResolve.ts';
import {
  toProblemSeriesBattleWaves,
  type ProblemSeriesBattleEnemyGroup,
  type ProblemSeriesBattleWave,
} from './toBattleWaves.ts';

/**
 * 作戦開始スナップショット内の敵 group（書き換え不可）。
 * 戦闘用 group の selectedCombatModuleId 必須性を維持する。
 * StageDef / authoring は含まない。
 */
export type ProblemSeriesOperationStartEnemyGroup =
  Readonly<ProblemSeriesBattleEnemyGroup>;

/**
 * 作戦開始スナップショット内の 1 Wave（書き換え不可）。
 */
export interface ProblemSeriesOperationStartWave {
  readonly prepResourceGrant: ProblemSeriesBattleWave['prepResourceGrant'];
  readonly enemyGroups: readonly ProblemSeriesOperationStartEnemyGroup[];
}

/**
 * 作戦開始時の不変入力。
 * ProblemSeriesDef・authoring・作戦可変状態・Stage は含まない。
 */
export interface ProblemSeriesOperationStartSnapshot {
  readonly seed: string;
  readonly generatorVersion: string;
  readonly seriesId: string;
  readonly allowedClassIds: readonly ClassId[];
  readonly waves: readonly ProblemSeriesOperationStartWave[];
}

/**
 * resolver 結果から作戦開始スナップショットを生成する。
 * seed / generatorVersion / seriesId は result の値をそのまま用い、再計算しない。
 * Wave は toProblemSeriesBattleWaves(result.series) で解決し、配列・group を共有しない。
 */
export function createProblemSeriesOperationStartSnapshot(
  result: ResolveProblemSeriesResult,
): ProblemSeriesOperationStartSnapshot {
  return {
    seed: result.seed,
    generatorVersion: result.generatorVersion,
    seriesId: result.series.seriesId,
    allowedClassIds: [...result.series.allowedClassIds],
    waves: toProblemSeriesBattleWaves(result.series),
  };
}
