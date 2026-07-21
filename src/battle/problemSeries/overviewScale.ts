/**
 * R12m Player 敵 group scale の表示入力正規化（純粋変換）。
 *
 * optional scale を Player 表示で使える数値へ変換する。
 * overview core / named / UI / 表示文への接続は後続作業単位の責務。
 */

import type { ProblemSeriesOperationStartEnemyGroup } from './operationStartSnapshot.ts';

export interface ProblemSeriesOverviewScale {
  readonly hpScale: number;
  readonly atkScale: number;
  readonly defScale: number;
  readonly resScale: number;
  readonly hasDifference: boolean;
}

/**
 * 作戦開始スナップショットの敵 group から scale 表示入力を生成する。
 * undefined は 1 に正規化し、指定値はそのまま返す。入力は変更しない。
 */
export function createProblemSeriesOverviewScale(
  group: Pick<
    ProblemSeriesOperationStartEnemyGroup,
    'hpScale' | 'atkScale' | 'defScale' | 'resScale'
  >,
): ProblemSeriesOverviewScale {
  const hpScale = group.hpScale ?? 1;
  const atkScale = group.atkScale ?? 1;
  const defScale = group.defScale ?? 1;
  const resScale = group.resScale ?? 1;
  return {
    hpScale,
    atkScale,
    defScale,
    resScale,
    hasDifference:
      hpScale !== 1 || atkScale !== 1 || defScale !== 1 || resScale !== 1,
  };
}
