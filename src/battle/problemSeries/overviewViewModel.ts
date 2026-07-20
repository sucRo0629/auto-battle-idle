/**
 * R12m Player 概要表示コア（純粋 view model）。
 *
 * 作戦開始スナップショットから Player 概要表示の土台となる readonly 構造を生成する。
 * 表示名解決・scale・作戦固有条件・catalog 参照は後続作業単位の責務。
 */

import type { ProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';

export interface ProblemSeriesOverviewEnemyGroupCore {
  readonly classId: string;
  readonly count: number;
  readonly selectedCombatModuleId: string;
}

export interface ProblemSeriesOverviewWaveCore {
  readonly waveNumber: number;
  readonly prepResourceGrant: number;
  readonly enemyGroups: readonly ProblemSeriesOverviewEnemyGroupCore[];
}

export interface ProblemSeriesOverviewCore {
  readonly seed: string;
  readonly waves: readonly ProblemSeriesOverviewWaveCore[];
}

function toOverviewEnemyGroupCore(
  group: ProblemSeriesOperationStartSnapshot['waves'][number]['enemyGroups'][number],
): ProblemSeriesOverviewEnemyGroupCore {
  return {
    classId: group.classId,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
  };
}

/**
 * 作戦開始スナップショットから概要表示コアを生成する。
 * seed / Wave 順 / group 順を保持し、再選出・再計算・random 処理は行わない。
 * 配列・Wave・group オブジェクトは入力と共有しない。
 */
export function createProblemSeriesOverviewCore(
  snapshot: ProblemSeriesOperationStartSnapshot,
): ProblemSeriesOverviewCore {
  return {
    seed: snapshot.seed,
    waves: snapshot.waves.map((wave, waveIndex) => ({
      waveNumber: waveIndex + 1,
      prepResourceGrant: wave.prepResourceGrant,
      enemyGroups: wave.enemyGroups.map((group) => toOverviewEnemyGroupCore(group)),
    })),
  };
}
