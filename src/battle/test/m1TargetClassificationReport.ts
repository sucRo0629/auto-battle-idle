import { isRangedAttack } from '../data/entityTraits.ts';
import type { ClassId, ClassPreset, GameData } from '../types.ts';
import { ASSASSIN_PRIORITY_TARGET_CLASS_IDS } from './assassinRoleReport.ts';
import { isRangerPriorityEnemyClass } from './rangerTargetReport.ts';

/** M1 demo 診断で比較する classId（味方 8 + ch1_07 敵ボス + 闘技士は M1 外参考） */
export const M1_TARGET_CLASSIFICATION_IDS: readonly ClassId[] = [
  'at_ranger',
  'at_assassin',
  'at_ballista',
  'at_sorcerer',
  'sp_cleric',
  'sp_wardweaver',
  'df_duelist',
] as const;

export interface M1TargetClassificationRow {
  classId: ClassId;
  displayName: string;
  role: ClassPreset['role'];
  formationRow: ClassPreset['formationRow'];
  rangePx: number;
  damageType: string;
  /** `traits.rangePx >= RANGED_ATTACK_MIN_PX` — 弓術士 P2 `attackType.ranged` プール */
  inRangerRangedPool: boolean;
  /** 診断 `RANGER_PRIORITY_ENEMY_CLASS_IDS` / back / ranged ヒューリスティック */
  inRangerDiagnosticBand: boolean;
  /** 双刃士 P2 `stat.hp order lowest` — 全敵が候補。低 HP 時に execute 寄与 */
  inAssassinLowHpPool: boolean;
  /** 診断 `ASSASSIN_PRIORITY_TARGET_CLASS_IDS`（execute band ログ用） */
  inAssassinDiagnosticBand: boolean;
  /** 弩砲士 P1 `stat.maxHp order highest` プール（参考・M1 味方は ch1_07 解禁前） */
  inBallistaHighMaxHpPool: boolean;
  rangerVsAssassinNote: string;
}

function displayNameFor(classId: ClassId, preset: ClassPreset): string {
  return preset.displayName ?? classId;
}

function buildSplitNote(row: Omit<M1TargetClassificationRow, 'rangerVsAssassinNote'>): string {
  if (row.classId === 'at_ballista') {
    return 'ranger ranged yes; assassin low-HP only (high MaxHP → 開幕は低HP対象になりにくい)';
  }
  if (row.classId === 'sp_cleric' || row.classId === 'sp_wardweaver') {
    return row.inRangerRangedPool
      ? 'support だが rangePx>=100 のため ranger ranged 対象; assassin は HP 低下後'
      : 'support; ranger ranged 外なら assassin low-HP のみ';
  }
  if (row.classId === 'at_sorcerer') {
    return 'ranger ranged yes (rangePx); assassin low-HP when damaged';
  }
  if (row.classId === 'at_ranger') {
    return 'both ranger ranged band; assassin when HP lowest among living';
  }
  if (row.classId === 'at_assassin') {
    return 'ranger fallback nearest; assassin self-band when lowest HP';
  }
  if (row.classId === 'df_duelist') {
    return 'M1 外; melee — ranger nearest fallback; assassin when lowest HP';
  }
  return '—';
}

export function buildM1TargetClassificationRows(
  gameData: GameData,
): M1TargetClassificationRow[] {
  const registry = gameData.classRegistry;
  return M1_TARGET_CLASSIFICATION_IDS.map((classId) => {
    const preset = registry[classId];
    if (!preset) {
      throw new Error(`Missing class preset: ${classId}`);
    }
    const rangePx = preset.traits?.rangePx ?? 0;
    const damageType = preset.traits?.damageType ?? 'physical';
    const inRangerRangedPool = isRangedAttack(rangePx);
    const inRangerDiagnosticBand = isRangerPriorityEnemyClass(classId, registry);
    const inAssassinDiagnosticBand = ASSASSIN_PRIORITY_TARGET_CLASS_IDS.includes(classId);
    const base = {
      classId,
      displayName: displayNameFor(classId, preset),
      role: preset.role,
      formationRow: preset.formationRow,
      rangePx,
      damageType,
      inRangerRangedPool,
      inRangerDiagnosticBand,
      inAssassinLowHpPool: true,
      inAssassinDiagnosticBand,
      inBallistaHighMaxHpPool: true,
    };
    return {
      ...base,
      rangerVsAssassinNote: buildSplitNote(base),
    };
  });
}

export function logM1TargetClassificationReport(gameData: GameData): void {
  const rows = buildM1TargetClassificationRows(gameData);
  console.info('[demo-m1-target-classification] M1 target priority bands (implementation + diagnostics):');
  console.info(
    '  ranger P2 (at_ranger_passive_2): targetRuleOverride attackType.ranged — pool = enemies with rangePx>=100; fallback nearest if empty',
  );
  console.info(
    '  assassin P2 (at_assassin_passive_2): targetRuleOverride stat.hp order lowest — all living enemies; P3 bonus when targetHp<=25% maxHp',
  );
  console.info(
    '  ballista P2 (at_ballista_passive_2): targetRuleOverride stat.maxHp order highest — reference for ch1_07 enemy',
  );
  for (const row of rows) {
    console.info(
      `  ${row.classId} (${row.displayName}) role=${row.role} row=${row.formationRow} rangePx=${row.rangePx} dmg=${row.damageType} ` +
        `rangerRangedPool=${row.inRangerRangedPool} rangerDiag=${row.inRangerDiagnosticBand} ` +
        `assassinLowHp=${row.inAssassinLowHpPool} assassinDiag=${row.inAssassinDiagnosticBand} ` +
        `| ${row.rangerVsAssassinNote}`,
    );
  }
  const healersRanged = rows.filter(
    (r) => r.role === 'supporter' && r.inRangerRangedPool,
  );
  if (healersRanged.length > 0) {
    console.info(
      `[demo-m1-target-classification] healer/support in ranger ranged pool: ${healersRanged.map((r) => r.classId).join(', ')} (role ではなく rangePx>=100 で判定)`,
    );
  }
  console.info(
    '[demo-m1-target-classification] clearest ranger-vs-assassin split: at_ballista (ranged + high MaxHP, not low-HP opener for assassin)',
  );
}
