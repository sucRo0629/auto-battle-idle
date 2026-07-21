/**
 * R12m Player 概要表示 adapter（敵 group 表示データ）。
 *
 * ProblemSeriesOverviewNamedEnemyGroup を、兵科名・人数・Module名・scale 差表示へ
 * 変換する純粋関数。文章結合や React は後続作業単位の責務。
 */

import type { ProblemSeriesOverviewNamedEnemyGroup } from '../battle/problemSeries/overviewViewModel.ts';
import { formatEnemyGroupScaleSummary } from './stageEnemyCompositionPreview.ts';

export interface ProblemSeriesOverviewEnemyGroupDisplay {
  readonly classId: string;
  readonly classDisplayName: string;
  readonly count: number;
  readonly selectedCombatModuleId: string;
  readonly combatModuleDisplayName: string;
  readonly scaleSummary: string;
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
