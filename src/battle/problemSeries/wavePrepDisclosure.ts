/**
 * R12m Wave 間準備の開示コンテキスト（純粋 factory）。
 *
 * 作戦開始スナップショットと production GameData から、Wave 間準備に必要な
 * 開示情報を抽出する。差分計算・DOM・GameSession 接続は行わない。
 */

import type { GameData } from '../types.ts';
import type { ProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewCore,
  createProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamedWave,
} from './overviewViewModel.ts';

export interface ProblemSeriesWavePrepDisclosureContext {
  readonly operationConditions: readonly string[];
  readonly previousWave: ProblemSeriesOverviewNamedWave;
  readonly nextWave: ProblemSeriesOverviewNamedWave;
  readonly remainingWaves: readonly ProblemSeriesOverviewNamedWave[];
}

function assertValidTargetWaveIndex(
  targetWaveIndex: number,
  waveCount: number,
): void {
  if (!Number.isInteger(targetWaveIndex)) {
    throw new Error(`invalid targetWaveIndex: ${String(targetWaveIndex)}`);
  }
  if (targetWaveIndex < 1) {
    throw new Error(`invalid targetWaveIndex: ${targetWaveIndex}`);
  }
  if (targetWaveIndex >= waveCount) {
    throw new Error(`invalid targetWaveIndex: ${targetWaveIndex}`);
  }
}

/**
 * 作戦開始スナップショットから Wave 間準備の開示コンテキストを生成する。
 *
 * `targetWaveIndex` はこれから開始する Wave の 0-based index。
 * Wave 間準備専用のため、有効値は `1 <= targetWaveIndex < snapshot.waves.length` の整数のみ。
 * 無効値は例外とし、丸め・clamp・fallback は行わない。
 */
export function createProblemSeriesWavePrepDisclosureContext(
  snapshot: ProblemSeriesOperationStartSnapshot,
  targetWaveIndex: number,
  gameData: Pick<GameData, 'classRegistry' | 'combatModuleRegistry'>,
): ProblemSeriesWavePrepDisclosureContext {
  assertValidTargetWaveIndex(targetWaveIndex, snapshot.waves.length);

  const core = createProblemSeriesOverviewCore(snapshot);
  const named = createProblemSeriesOverviewNamed(core, gameData);

  const previousWave = named.waves[targetWaveIndex - 1]!;
  const nextWave = named.waves[targetWaveIndex]!;
  const remainingWaves = named.waves.slice(targetWaveIndex);

  return {
    operationConditions: [...snapshot.operationConditions],
    previousWave,
    nextWave,
    remainingWaves,
  };
}
