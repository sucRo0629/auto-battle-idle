/**
 * R12m Player Wave 間準備開示表示 adapter。
 *
 * WavePrep 開示コンテキストと敵差分を、Player UI が描画できる表示データへ純粋変換する。
 * DOM・文章生成・GameSession 接続は後続作業単位の責務。
 */

import type { ProblemSeriesWavePrepDisclosureContext } from '../battle/problemSeries/wavePrepDisclosure.ts';
import type { ProblemSeriesWavePrepEnemyChange } from '../battle/problemSeries/wavePrepEnemyChanges.ts';
import type { ProblemSeriesOverviewNamedWave } from '../battle/problemSeries/overviewViewModel.ts';
import {
  createProblemSeriesOverviewEnemyGroupDisplay,
  type ProblemSeriesOverviewEnemyGroupDisplay,
  type ProblemSeriesOverviewWaveDisplay,
} from './problemSeriesOverviewViewModel.ts';

export interface ProblemSeriesWavePrepEnemyChangeDisplay {
  readonly classId: string;
  readonly classDisplayName: string;
  readonly previousGroups: readonly ProblemSeriesOverviewEnemyGroupDisplay[];
  readonly nextGroups: readonly ProblemSeriesOverviewEnemyGroupDisplay[];
}

export interface ProblemSeriesWavePrepDisclosureDisplay {
  readonly operationConditions: readonly string[];
  readonly nextWave: ProblemSeriesOverviewWaveDisplay;
  readonly enemyChanges: readonly ProblemSeriesWavePrepEnemyChangeDisplay[];
  readonly remainingWaves: readonly ProblemSeriesOverviewWaveDisplay[];
}

function createProblemSeriesOverviewWaveDisplay(
  wave: ProblemSeriesOverviewNamedWave,
): ProblemSeriesOverviewWaveDisplay {
  return {
    waveNumber: wave.waveNumber,
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) =>
      createProblemSeriesOverviewEnemyGroupDisplay(group),
    ),
  };
}

function createProblemSeriesWavePrepEnemyChangeDisplay(
  change: ProblemSeriesWavePrepEnemyChange,
): ProblemSeriesWavePrepEnemyChangeDisplay {
  return {
    classId: change.classId,
    classDisplayName: change.classDisplayName,
    previousGroups: change.previousGroups.map((group) =>
      createProblemSeriesOverviewEnemyGroupDisplay(group),
    ),
    nextGroups: change.nextGroups.map((group) =>
      createProblemSeriesOverviewEnemyGroupDisplay(group),
    ),
  };
}

/**
 * Wave 間準備開示コンテキストと敵差分を Player 向け表示データへ変換する。
 * operationConditions / Wave 順 / group 順 / 差分順を保持し、各 group は既存 adapter で変換する。
 * 入力 context / enemyChanges は変更せず、返却の配列・Wave・group は入力と共有しない。
 */
export function createProblemSeriesWavePrepDisclosureDisplay(
  context: ProblemSeriesWavePrepDisclosureContext,
  enemyChanges: readonly ProblemSeriesWavePrepEnemyChange[],
): ProblemSeriesWavePrepDisclosureDisplay {
  return {
    operationConditions: [...context.operationConditions],
    nextWave: createProblemSeriesOverviewWaveDisplay(context.nextWave),
    enemyChanges: enemyChanges.map((change) =>
      createProblemSeriesWavePrepEnemyChangeDisplay(change),
    ),
    remainingWaves: context.remainingWaves.map((wave) =>
      createProblemSeriesOverviewWaveDisplay(wave),
    ),
  };
}
