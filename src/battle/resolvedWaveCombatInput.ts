/**
 * BattleEngine が消費する解決済み Wave 戦闘入力（中立最小形）。
 *
 * StageDef / seed / seriesId / authoring / prepResourceGrant は含めない。
 * ProblemSeriesOperationStartSnapshot.waves は構造的に渡せる。
 */

import type { StageEnemyGroup } from './types.ts';

/**
 * 解決済み 1 Wave の戦闘入力。
 * BattleEngine が参照するのは enemyGroups のみ。
 */
export interface ResolvedWaveCombatInput {
  readonly enemyGroups: readonly StageEnemyGroup[];
}

/**
 * 解決済み Wave 配列。空配列も正本（固定 Stage へ fallback しない）。
 */
export type ResolvedWavesCombatInput = readonly ResolvedWaveCombatInput[];

/**
 * 解決済み Wave 戦闘入力 provider。
 * - 未指定、または null: 既存固定 Stage 経路
 * - 配列（空含む）: その配列が Wave 数・enemyGroups の正本
 */
export type ResolvedWavesCombatInputProvider = () =>
  | ResolvedWavesCombatInput
  | null;
