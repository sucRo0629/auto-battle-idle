import type { StageDef, StageEnemyGroup } from '../battle/types.ts';

const DEFAULT_SCALE = 1;

export interface StageEnemyGroupPreviewLine {
  classId: string;
  count: number;
  hpScale: number;
  atkScale: number;
  defScale: number;
  resScale: number;
}

export interface StageLegacyWavePreviewLine {
  waveIndex: number;
  templateIds: string[];
}

export interface StageEnemyCompositionPreview {
  recommendedLevel: number | null;
  usesEnemyGroups: boolean;
  totalEnemyCount: number;
  enemyGroupLines: StageEnemyGroupPreviewLine[];
  legacyWaveLines: StageLegacyWavePreviewLine[];
  showLargePartyWarning: boolean;
}

function resolveGroupScale(value: number | undefined): number {
  return value ?? DEFAULT_SCALE;
}

function toEnemyGroupLine(group: StageEnemyGroup): StageEnemyGroupPreviewLine {
  return {
    classId: group.classId,
    count: group.count,
    hpScale: resolveGroupScale(group.hpScale),
    atkScale: resolveGroupScale(group.atkScale),
    defScale: resolveGroupScale(group.defScale),
    resScale: resolveGroupScale(group.resScale),
  };
}

function sumEnemyGroupCount(groups: StageEnemyGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

function buildLegacyWaveLines(
  stage: StageDef,
  waveIndex: number | null,
): StageLegacyWavePreviewLine[] {
  const waves = stage.waves ?? [];
  if (waves.length === 0) return [];

  if (waveIndex !== null && waveIndex >= 0 && waveIndex < waves.length) {
    const wave = waves[waveIndex]!;
    return [
      {
        waveIndex,
        templateIds: wave.enemies.map((enemy) => enemy.templateId),
      },
    ];
  }

  return waves.map((wave, index) => ({
    waveIndex: index,
    templateIds: wave.enemies.map((enemy) => enemy.templateId),
  }));
}

function countLegacyEnemies(lines: StageLegacyWavePreviewLine[]): number {
  return lines.reduce((sum, line) => sum + line.templateIds.length, 0);
}

/**
 * DebugMenuPanel 向けにステージ敵編成を要約する。
 * enemyGroups あり時は新正本を優先し、legacy templateId は併記しない。
 */
export function resolveStageEnemyCompositionPreview(
  stage: StageDef,
  waveIndex: number | null = null,
): StageEnemyCompositionPreview {
  const enemyGroups = stage.enemyGroups ?? [];
  const usesEnemyGroups = enemyGroups.length > 0;
  const enemyGroupLines = enemyGroups.map(toEnemyGroupLine);
  const legacyWaveLines = usesEnemyGroups
    ? []
    : buildLegacyWaveLines(stage, waveIndex);
  const totalEnemyCount = usesEnemyGroups
    ? sumEnemyGroupCount(enemyGroups)
    : countLegacyEnemies(legacyWaveLines);

  return {
    recommendedLevel: stage.recommendedLevel ?? null,
    usesEnemyGroups,
    totalEnemyCount,
    enemyGroupLines,
    legacyWaveLines,
    showLargePartyWarning: totalEnemyCount >= 5,
  };
}

export function formatEnemyGroupScaleSummary(line: StageEnemyGroupPreviewLine): string {
  const parts: string[] = [];
  if (line.hpScale !== DEFAULT_SCALE) parts.push(`hp×${line.hpScale}`);
  if (line.atkScale !== DEFAULT_SCALE) parts.push(`atk×${line.atkScale}`);
  if (line.defScale !== DEFAULT_SCALE) parts.push(`def×${line.defScale}`);
  if (line.resScale !== DEFAULT_SCALE) parts.push(`res×${line.resScale}`);
  return parts.length > 0 ? ` (${parts.join(' ')})` : '';
}
