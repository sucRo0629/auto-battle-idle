import type {
  CombatStats,
  ResolvedEnemySpawnSpec,
  StageDef,
  StageEnemyGroup,
} from './types.ts';

/**
 * enemyGroups 敵の内部 Lv 固定値。
 * 強さは recommendedLevel / ランクでは表現しない（兵科基礎ステ + scale のみ）。
 * computeStatsAtLevel / resolveLearnedSkills への互換入力として使う。
 */
export const ENEMY_GROUP_BASE_LEVEL = 1;

/** scale 未指定時は 1（乗算なし） */
export function resolveEnemyStatScale(scale: number | undefined): number {
  return scale ?? 1;
}

/**
 * computeStatsAtLevel 後に group の scale を乗算する。
 * 小数は Math.round（既存のステータスは整数前提）。
 */
export function applyEnemyStatScales(
  stats: CombatStats,
  spec: Pick<
    ResolvedEnemySpawnSpec,
    'hpScale' | 'atkScale' | 'defScale' | 'resScale'
  >,
): CombatStats {
  return {
    maxHp: Math.max(
      1,
      Math.round(stats.maxHp * resolveEnemyStatScale(spec.hpScale)),
    ),
    atk: Math.max(
      1,
      Math.round(stats.atk * resolveEnemyStatScale(spec.atkScale)),
    ),
    def: Math.round(stats.def * resolveEnemyStatScale(spec.defScale)),
    res: Math.round(stats.res * resolveEnemyStatScale(spec.resScale)),
  };
}

/**
 * StageEnemyGroup[] を敵生成用の中間スペック配列へ展開する（StageDef 非依存）。
 * - 空配列は空配列を返す
 * - 入力配列・group object は変更しない
 * - stats 計算・配置・CombatantState 生成は別責務
 */
export function expandEnemyGroupsList(
  groups: readonly StageEnemyGroup[],
): ResolvedEnemySpawnSpec[] {
  if (groups.length === 0) {
    return [];
  }

  const specs: ResolvedEnemySpawnSpec[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!;
    for (let indexInGroup = 0; indexInGroup < group.count; indexInGroup++) {
      specs.push({
        classId: group.classId,
        level: ENEMY_GROUP_BASE_LEVEL,
        hpScale: group.hpScale,
        atkScale: group.atkScale,
        defScale: group.defScale,
        resScale: group.resScale,
        groupIndex,
        indexInGroup,
        groupCount: group.count,
        ...(group.selectedCombatModuleId !== undefined
          ? { selectedCombatModuleId: group.selectedCombatModuleId }
          : {}),
        spawnUnitKey: `g${groupIndex}_i${indexInGroup}`,
      });
    }
  }
  return specs;
}

/**
 * stage.enemyGroups を敵生成用の中間スペック配列へ展開する互換 wrapper。
 * - enemyGroups 未設定時は空配列（legacy waves へのフォールバックは行わない）
 * - 本体の展開は expandEnemyGroupsList
 */
export function expandEnemyGroups(stage: StageDef): ResolvedEnemySpawnSpec[] {
  const groups = stage.enemyGroups;
  if (!groups || groups.length === 0) {
    return [];
  }
  return expandEnemyGroupsList(groups);
}
