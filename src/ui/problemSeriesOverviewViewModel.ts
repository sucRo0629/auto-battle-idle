/**
 * R12m Player 概要表示 adapter（敵 group / 全 Wave 表示データ）。
 *
 * ProblemSeriesOverviewNamed を、seed・全 Wave・各 Wave 付与予定・敵 group 表示へ
 * 変換する純粋関数。文章結合や React は後続作業単位の責務。
 */

import type { ProblemSeriesOperationStartSnapshot } from '../battle/problemSeries/operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewCore,
  createProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamed,
  type ProblemSeriesOverviewNamedEnemyGroup,
} from '../battle/problemSeries/overviewViewModel.ts';
import type { GameData } from '../battle/types.ts';
import { formatEnemyGroupScaleSummary } from './stageEnemyCompositionPreview.ts';

export interface ProblemSeriesOverviewEnemyGroupDisplay {
  readonly classId: string;
  readonly classDisplayName: string;
  readonly count: number;
  readonly selectedCombatModuleId: string;
  readonly combatModuleDisplayName: string;
  readonly scaleSummary: string;
}

export interface ProblemSeriesOverviewWaveDisplay {
  readonly waveNumber: number;
  readonly prepResourceGrant: number;
  readonly enemyGroups: readonly ProblemSeriesOverviewEnemyGroupDisplay[];
}

export interface ProblemSeriesOverviewDisplay {
  readonly seed: string;
  readonly operationConditions: readonly string[];
  readonly waves: readonly ProblemSeriesOverviewWaveDisplay[];
}

/**
 * named 敵 group を Player 概要向けの表示データへ変換する。
 * ID・表示名・人数・Module は入力を保持し、scaleSummary のみ既存 formatter で生成する。
 * 入力 group / scale は変更せず、返却オブジェクトは入力と別参照にする。
 */
export function createProblemSeriesOverviewEnemyGroupDisplay(
  group: ProblemSeriesOverviewNamedEnemyGroup,
): ProblemSeriesOverviewEnemyGroupDisplay {
  return {
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scaleSummary: formatEnemyGroupScaleSummary(group.scale),
  };
}

/**
 * named 概要を Player 概要向けの全 Wave 表示データへ変換する。
 * seed / Wave 順 / grant / group 順を保持し、各 group は既存 group adapter で変換する。
 * 入力 named は変更せず、返却の配列・Wave・group は入力と共有しない。
 */
export function createProblemSeriesOverviewDisplay(
  named: ProblemSeriesOverviewNamed,
  operationConditions: readonly string[],
): ProblemSeriesOverviewDisplay {
  return {
    seed: named.seed,
    operationConditions: [...operationConditions],
    waves: named.waves.map((wave) => ({
      waveNumber: wave.waveNumber,
      prepResourceGrant: wave.prepResourceGrant,
      enemyGroups: wave.enemyGroups.map((group) =>
        createProblemSeriesOverviewEnemyGroupDisplay(group),
      ),
    })),
  };
}

/**
 * 作戦開始スナップショットと GameData から Player 概要向けの全 Wave 表示データを生成する。
 * core → named → display の既存 production 変換を順に再利用する。
 * resolver / snapshot factory は呼ばず、seed からの再選出も行わない。
 */
export function createProblemSeriesOverviewDisplayFromSnapshot(
  snapshot: ProblemSeriesOperationStartSnapshot,
  gameData: Pick<GameData, 'classRegistry' | 'combatModuleRegistry'>,
): ProblemSeriesOverviewDisplay {
  const core = createProblemSeriesOverviewCore(snapshot);
  const named = createProblemSeriesOverviewNamed(core, gameData);
  return createProblemSeriesOverviewDisplay(named, snapshot.operationConditions);
}
