/**
 * R12m Wave 間準備の敵・Module 差分（純粋計算）。
 *
 * Wave 間準備開示コンテキストから、前 Wave から変化した兵科だけを抽出する。
 * 表示文・DOM・GameSession 接続は行わない。
 */

import type { ProblemSeriesOverviewNamedEnemyGroup } from './overviewViewModel.ts';
import type { ProblemSeriesWavePrepDisclosureContext } from './wavePrepDisclosure.ts';

export interface ProblemSeriesWavePrepEnemyChange {
  readonly classId: string;
  readonly classDisplayName: string;
  readonly previousGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[];
  readonly nextGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[];
}

interface GroupMultisetEntry {
  readonly count: number;
  readonly selectedCombatModuleId: string;
  readonly hpScale: number;
  readonly atkScale: number;
  readonly defScale: number;
  readonly resScale: number;
  readonly hasDifference: boolean;
}

function toMultisetEntry(
  group: ProblemSeriesOverviewNamedEnemyGroup,
): GroupMultisetEntry {
  return {
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    hpScale: group.scale.hpScale,
    atkScale: group.scale.atkScale,
    defScale: group.scale.defScale,
    resScale: group.scale.resScale,
    hasDifference: group.scale.hasDifference,
  };
}

function serializeMultisetEntry(entry: GroupMultisetEntry): string {
  return JSON.stringify([
    entry.count,
    entry.selectedCombatModuleId,
    entry.hpScale,
    entry.atkScale,
    entry.defScale,
    entry.resScale,
    entry.hasDifference,
  ]);
}

function multisetSignatures(
  groups: readonly ProblemSeriesOverviewNamedEnemyGroup[],
): readonly string[] {
  return groups.map((group) => serializeMultisetEntry(toMultisetEntry(group)));
}

function multisetsEqual(
  previous: readonly ProblemSeriesOverviewNamedEnemyGroup[],
  next: readonly ProblemSeriesOverviewNamedEnemyGroup[],
): boolean {
  const previousSignatures = [...multisetSignatures(previous)].sort();
  const nextSignatures = [...multisetSignatures(next)].sort();
  if (previousSignatures.length !== nextSignatures.length) {
    return false;
  }
  for (let index = 0; index < previousSignatures.length; index++) {
    if (previousSignatures[index] !== nextSignatures[index]) {
      return false;
    }
  }
  return true;
}

function copyNamedEnemyGroup(
  group: ProblemSeriesOverviewNamedEnemyGroup,
): ProblemSeriesOverviewNamedEnemyGroup {
  return {
    classId: group.classId,
    classDisplayName: group.classDisplayName,
    count: group.count,
    selectedCombatModuleId: group.selectedCombatModuleId,
    combatModuleDisplayName: group.combatModuleDisplayName,
    scale: {
      hpScale: group.scale.hpScale,
      atkScale: group.scale.atkScale,
      defScale: group.scale.defScale,
      resScale: group.scale.resScale,
      hasDifference: group.scale.hasDifference,
    },
  };
}

function groupsForClassId(
  waveGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[],
  classId: string,
): readonly ProblemSeriesOverviewNamedEnemyGroup[] {
  return waveGroups.filter((group) => group.classId === classId);
}

function firstAppearanceClassIds(
  waveGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[],
): readonly string[] {
  const seen = new Set<string>();
  const classIds: string[] = [];
  for (const group of waveGroups) {
    if (!seen.has(group.classId)) {
      seen.add(group.classId);
      classIds.push(group.classId);
    }
  }
  return classIds;
}

function resolveClassDisplayName(
  previousGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[],
  nextGroups: readonly ProblemSeriesOverviewNamedEnemyGroup[],
): string {
  if (nextGroups.length > 0) {
    return nextGroups[0]!.classDisplayName;
  }
  return previousGroups[0]!.classDisplayName;
}

function orderedChangedClassIds(
  context: ProblemSeriesWavePrepDisclosureContext,
): readonly string[] {
  const previousClassIds = firstAppearanceClassIds(
    context.previousWave.enemyGroups,
  );
  const nextClassIds = firstAppearanceClassIds(context.nextWave.enemyGroups);

  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const classId of previousClassIds) {
    if (!seen.has(classId)) {
      seen.add(classId);
      ordered.push(classId);
    }
  }
  for (const classId of nextClassIds) {
    if (!seen.has(classId)) {
      seen.add(classId);
      ordered.push(classId);
    }
  }

  return ordered;
}

/**
 * Wave 間準備開示コンテキストから、前 Wave から変化した兵科だけを返す。
 * 同一兵科内の group は count / Module / scale による multiset として比較する。
 */
export function createProblemSeriesWavePrepEnemyChanges(
  context: ProblemSeriesWavePrepDisclosureContext,
): readonly ProblemSeriesWavePrepEnemyChange[] {
  const changes: ProblemSeriesWavePrepEnemyChange[] = [];

  for (const classId of orderedChangedClassIds(context)) {
    const previousGroups = groupsForClassId(
      context.previousWave.enemyGroups,
      classId,
    );
    const nextGroups = groupsForClassId(context.nextWave.enemyGroups, classId);

    if (multisetsEqual(previousGroups, nextGroups)) {
      continue;
    }

    changes.push({
      classId,
      classDisplayName: resolveClassDisplayName(previousGroups, nextGroups),
      previousGroups: previousGroups.map((group) => copyNamedEnemyGroup(group)),
      nextGroups: nextGroups.map((group) => copyNamedEnemyGroup(group)),
    });
  }

  return changes;
}
