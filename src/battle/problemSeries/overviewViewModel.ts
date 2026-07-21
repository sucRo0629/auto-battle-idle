/**
 * R12m Player 概要表示コア（純粋 view model）。
 *
 * 作戦開始スナップショットから Player 概要表示の土台となる readonly 構造を生成する。
 * 各敵 group の scale は createProblemSeriesOverviewScale で正規化し core へ保持する。
 * 作戦固有条件・catalog 参照は後続作業単位の責務。
 */

import type { GameData } from '../types.ts';
import type { ProblemSeriesOperationStartSnapshot } from './operationStartSnapshot.ts';
import {
  createProblemSeriesOverviewScale,
  type ProblemSeriesOverviewScale,
} from './overviewScale.ts';

export interface ProblemSeriesOverviewEnemyGroupCore {
  readonly classId: string;
  readonly count: number;
  readonly selectedCombatModuleId: string;
  readonly scale: ProblemSeriesOverviewScale;
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

export interface ProblemSeriesOverviewNamedEnemyGroup {
  readonly classId: string;
  readonly classDisplayName: string;
  readonly count: number;
  readonly selectedCombatModuleId: string;
  readonly combatModuleDisplayName: string;
}

export interface ProblemSeriesOverviewNamedWave {
  readonly waveNumber: number;
  readonly prepResourceGrant: number;
  readonly enemyGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[];
}

export interface ProblemSeriesOverviewNamed {
  readonly seed: string;
  readonly waves: readonly ProblemSeriesOverviewNamedWave[];
}

function toOverviewEnemyGroupCore(
  group: ProblemSeriesOperationStartSnapshot['waves'][number]['enemyGroups'][number],
): ProblemSeriesOverviewEnemyGroupCore {
  return {
    classId: group.classId,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    scale: createProblemSeriesOverviewScale(group),
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

function resolveClassDisplayName(
  classRegistry: Pick<GameData, 'classRegistry'>['classRegistry'],
  classId: string,
): string {
  const preset = classRegistry[classId as keyof typeof classRegistry];
  if (preset === undefined) {
    throw new Error(`unknown classId "${classId}"`);
  }
  return preset.displayName;
}

function resolveCombatModuleDisplayName(
  combatModuleRegistry: Pick<GameData, 'combatModuleRegistry'>['combatModuleRegistry'],
  moduleId: string,
): string {
  const module = combatModuleRegistry[moduleId];
  if (module === undefined) {
    throw new Error(`unknown combatModuleId "${moduleId}"`);
  }
  return module.displayName;
}

function toOverviewNamedEnemyGroup(
  group: ProblemSeriesOverviewEnemyGroupCore,
  gameData: Pick<GameData, 'classRegistry' | 'combatModuleRegistry'>,
): ProblemSeriesOverviewNamedEnemyGroup {
  return {
    classId: group.classId,
    classDisplayName: resolveClassDisplayName(gameData.classRegistry, group.classId),
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: resolveCombatModuleDisplayName(
      gameData.combatModuleRegistry,
      group.selectedCombatModuleId,
    ),
  };
}

/**
 * 概要表示コアに production GameData から敵兵科名・CombatModule 名を解決する。
 * Wave 順 / group 順 / ID / count / grant を保持し、core と配列・オブジェクトを共有しない。
 */
export function createProblemSeriesOverviewNamed(
  core: ProblemSeriesOverviewCore,
  gameData: Pick<GameData, 'classRegistry' | 'combatModuleRegistry'>,
): ProblemSeriesOverviewNamed {
  return {
    seed: core.seed,
    waves: core.waves.map((wave) => ({
      waveNumber: wave.waveNumber,
      prepResourceGrant: wave.prepResourceGrant,
      enemyGroups: wave.enemyGroups.map((group) =>
        toOverviewNamedEnemyGroup(group, gameData),
      ),
    })),
  };
}
