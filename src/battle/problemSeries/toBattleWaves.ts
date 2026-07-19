/**
 * ProblemSeriesDef → 戦闘用 Wave 入力の純粋変換。
 *
 * 固定 StageDef / authoring metadata / seed 選出結果は扱わない。
 * BattleEngine・OperationState への注入は後続作業単位の責務。
 */

import type {
  ProblemSeriesDef,
  ProblemSeriesEnemyGroup,
  StageEnemyGroup,
} from '../types.ts';

/**
 * 問題系列の戦闘用敵 group。
 * StageEnemyGroup を基礎形状とし、selectedCombatModuleId だけ必須にする。
 * StageEnemyGroup 一般仕様（optional Module ID）は変更しない。
 */
export type ProblemSeriesBattleEnemyGroup = Omit<
  StageEnemyGroup,
  'selectedCombatModuleId'
> & {
  selectedCombatModuleId: string;
};

/**
 * 解決済み 1 Wave の戦闘入力（StageWave ではない）。
 * legacy 必須フィールド `enemies` は持たない。
 */
export interface ProblemSeriesBattleWave {
  enemyGroups: ProblemSeriesBattleEnemyGroup[];
  prepResourceGrant: number;
}

function toBattleEnemyGroup(
  group: ProblemSeriesEnemyGroup,
): ProblemSeriesBattleEnemyGroup {
  return {
    classId: group.classId,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    ...(group.hpScale !== undefined ? { hpScale: group.hpScale } : {}),
    ...(group.atkScale !== undefined ? { atkScale: group.atkScale } : {}),
    ...(group.defScale !== undefined ? { defScale: group.defScale } : {}),
    ...(group.resScale !== undefined ? { resScale: group.resScale } : {}),
  };
}

/**
 * 選出済み問題系列から、後続が BattleEngine へ渡せる解決済み 3 Wave 入力を生成する。
 * 入力順を保持し、数値の再計算・scale 補完は行わない。配列・group は入力と共有しない。
 */
export function toProblemSeriesBattleWaves(
  series: ProblemSeriesDef,
): ProblemSeriesBattleWave[] {
  if (series.waves.length !== 3) {
    throw new Error(
      `problem series "${series.seriesId}" must have exactly 3 waves, got ${series.waves.length}`,
    );
  }
  return series.waves.map((wave) => ({
    prepResourceGrant: wave.prepResourceGrant,
    enemyGroups: wave.enemyGroups.map((group) => toBattleEnemyGroup(group)),
  }));
}
