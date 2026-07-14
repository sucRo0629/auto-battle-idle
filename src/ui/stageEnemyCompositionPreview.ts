import type { StageDef, StageEnemyGroup } from '../battle/types.ts';

const DEFAULT_SCALE = 1;

export interface StageEnemyGroupPreviewLine {
  classId: string;
  count: number;
  hpScale: number;
  atkScale: number;
  defScale: number;
  resScale: number;
  /** waves[].enemyGroups 由来のとき 0-based。stage 直下 enemyGroups のときは null。 */
  waveIndex: number | null;
}

export interface StageLegacyWavePreviewLine {
  waveIndex: number;
  templateIds: string[];
}

export interface StageEnemyCompositionPreview {
  recommendedLevel: number | null;
  usesEnemyGroups: boolean;
  /** waves[].enemyGroups を正本としている（複数 Wave 要約）。 */
  usesWaveEnemyGroups: boolean;
  totalEnemyCount: number;
  enemyGroupLines: StageEnemyGroupPreviewLine[];
  legacyWaveLines: StageLegacyWavePreviewLine[];
  showLargePartyWarning: boolean;
}

function resolveGroupScale(value: number | undefined): number {
  return value ?? DEFAULT_SCALE;
}

function toEnemyGroupLine(
  group: StageEnemyGroup,
  waveIndex: number | null,
): StageEnemyGroupPreviewLine {
  return {
    classId: group.classId,
    count: group.count,
    hpScale: resolveGroupScale(group.hpScale),
    atkScale: resolveGroupScale(group.atkScale),
    defScale: resolveGroupScale(group.defScale),
    resScale: resolveGroupScale(group.resScale),
    waveIndex,
  };
}

function sumEnemyGroupCount(groups: readonly StageEnemyGroup[]): number {
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

function collectWaveEnemyGroupLines(
  stage: StageDef,
  waveIndex: number | null,
): StageEnemyGroupPreviewLine[] {
  const waves = stage.waves ?? [];
  const lines: StageEnemyGroupPreviewLine[] = [];

  for (let index = 0; index < waves.length; index += 1) {
    if (waveIndex !== null && waveIndex !== index) continue;
    const groups = waves[index]?.enemyGroups;
    if (!groups || groups.length === 0) continue;
    for (const group of groups) {
      lines.push(toEnemyGroupLine(group, index));
    }
  }

  return lines;
}

/**
 * DebugMenuPanel / ステージ詳細向けにステージ敵編成を要約する。
 * 優先順は spawn（`createEnemiesForStage`）に合わせる:
 * 1. いずれかの `waves[].enemyGroups`
 * 2. stage 直下 `enemyGroups`
 * 3. legacy `waves[].enemies`
 */
export function resolveStageEnemyCompositionPreview(
  stage: StageDef,
  waveIndex: number | null = null,
): StageEnemyCompositionPreview {
  const waveEnemyGroupLines = collectWaveEnemyGroupLines(stage, waveIndex);
  const usesWaveEnemyGroups = (stage.waves ?? []).some(
    (wave) => Array.isArray(wave.enemyGroups) && wave.enemyGroups.length > 0,
  );

  if (usesWaveEnemyGroups) {
    const totalEnemyCount = sumEnemyGroupCount(
      waveEnemyGroupLines.map((line) => ({
        classId: line.classId,
        count: line.count,
      })),
    );
    return {
      recommendedLevel: stage.recommendedLevel ?? null,
      usesEnemyGroups: true,
      usesWaveEnemyGroups: true,
      totalEnemyCount,
      enemyGroupLines: waveEnemyGroupLines,
      legacyWaveLines: [],
      showLargePartyWarning: totalEnemyCount >= 5,
    };
  }

  const enemyGroups = stage.enemyGroups ?? [];
  const usesEnemyGroups = enemyGroups.length > 0;
  const enemyGroupLines = enemyGroups.map((group) => toEnemyGroupLine(group, null));
  const legacyWaveLines = usesEnemyGroups
    ? []
    : buildLegacyWaveLines(stage, waveIndex);
  const totalEnemyCount = usesEnemyGroups
    ? sumEnemyGroupCount(enemyGroups)
    : countLegacyEnemies(legacyWaveLines);

  return {
    recommendedLevel: stage.recommendedLevel ?? null,
    usesEnemyGroups,
    usesWaveEnemyGroups: false,
    totalEnemyCount,
    enemyGroupLines,
    legacyWaveLines,
    showLargePartyWarning: totalEnemyCount >= 5,
  };
}

export function formatEnemyGroupScaleSummary(
  line: Pick<StageEnemyGroupPreviewLine, 'hpScale' | 'atkScale' | 'defScale' | 'resScale'>,
): string {
  const parts: string[] = [];
  if (line.hpScale !== DEFAULT_SCALE) parts.push(`hp×${line.hpScale}`);
  if (line.atkScale !== DEFAULT_SCALE) parts.push(`atk×${line.atkScale}`);
  if (line.defScale !== DEFAULT_SCALE) parts.push(`def×${line.defScale}`);
  if (line.resScale !== DEFAULT_SCALE) parts.push(`res×${line.resScale}`);
  return parts.length > 0 ? ` (${parts.join(' ')})` : '';
}

/** ステージ詳細・一覧向けの 1 行ラベル（Wave 接頭辞つき）。 */
export function formatEnemyGroupPreviewLabel(
  line: StageEnemyGroupPreviewLine,
  displayName: string,
  options?: { includeWavePrefix?: boolean },
): string {
  const includeWavePrefix = options?.includeWavePrefix ?? true;
  const wavePrefix =
    includeWavePrefix && line.waveIndex !== null
      ? `Wave ${line.waveIndex + 1}: `
      : '';
  return `${wavePrefix}${displayName} ×${line.count}${formatEnemyGroupScaleSummary(line)}`;
}
