import type {
  CombatStats,
  ResolvedEnemySpawnSpec,
  StageDef,
} from './types.ts';

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
    'hpScale' | 'atkScale' | 'defScale' | 'regScale'
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
    reg: Math.round(stats.reg * resolveEnemyStatScale(spec.regScale)),
  };
}

/**
 * stage.enemyGroups を敵生成用の中間スペック配列へ展開する。
 * - enemyGroups 未設定時は空配列（legacy waves へのフォールバックは行わない）
 * - stats 計算・配置・CombatantState 生成は Phase B2 以降
 */
export function expandEnemyGroups(stage: StageDef): ResolvedEnemySpawnSpec[] {
  const groups = stage.enemyGroups;
  if (!groups || groups.length === 0) {
    return [];
  }

  const level = stage.recommendedLevel;
  if (level === undefined) {
    throw new Error(
      `recommendedLevel is required when enemyGroups is set (stage: ${stage.id})`,
    );
  }

  const specs: ResolvedEnemySpawnSpec[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!;
    for (let indexInGroup = 0; indexInGroup < group.count; indexInGroup++) {
      specs.push({
        classId: group.classId,
        level,
        hpScale: group.hpScale,
        atkScale: group.atkScale,
        defScale: group.defScale,
        regScale: group.regScale,
        groupIndex,
        indexInGroup,
        groupCount: group.count,
        spawnUnitKey: `g${groupIndex}_i${indexInGroup}`,
      });
    }
  }
  return specs;
}
