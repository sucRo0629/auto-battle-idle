import type { ClassId, ClassPreset, GameData } from '../types.ts';
import { RANGED_ATTACK_MIN_PX } from '../types.ts';
import type { RangerBasicAttackDiagnostics } from './rangerBasicAttackDiagnostic.ts';

/** Demo enemy classes that at_ranger is designed to prioritize (back / ranged band). */
export const RANGER_PRIORITY_ENEMY_CLASS_IDS: readonly ClassId[] = [
  'at_ranger',
  'at_sorcerer',
  'at_ballista',
  'sp_cleric',
  'sp_wardweaver',
  'at_hunter',
  'at_sigilist',
  'at_conductor',
] as const;

export interface DemoEnemyDeathRecord {
  unitId: string;
  classId: ClassId;
  deathSec: number;
  lastHitByAllyClassId?: ClassId;
}

export interface RangerTargetReportClassRow {
  classId: ClassId;
  damageDealt: number;
  damageByTarget: Partial<Record<ClassId, number>>;
  basicActionCount: number;
  firstBasicActionSec?: number;
  activeSkillUseCountBySkillId: Record<string, number>;
}

export interface RangerTargetReportBattleInput {
  classStats: RangerTargetReportClassRow[];
  rangerBasicAttackDiagnostics?: RangerBasicAttackDiagnostics;
  enemyDeaths?: DemoEnemyDeathRecord[];
  outcome: 'victory' | 'defeat' | 'timeout';
  durationSec: number;
  rangerUnitId?: string | null;
}

export interface DemoRangerTargetReport {
  stageId: string;
  partyLabel: string;
  rangerUnitId: string | null;
  firstBasicActionSec: number | null;
  basicActionCount: number;
  activeSkillUseCount: number;
  primaryTargetClassId: ClassId | null;
  targetClassHitCount: Partial<Record<ClassId, number>>;
  damageByTargetClassId: Partial<Record<ClassId, number>>;
  killOrLastHitTargetClassId: Partial<Record<ClassId, number>>;
  outOfRangeSkipCount: number | null;
  movingSkipCount: number | null;
  backlineDamageShare: number | null;
  backlineTargetShare: number | null;
  roleFulfilled: boolean | null;
  note: string;
}

export interface DemoClassCoverageEntry {
  stageId: string;
  partyLabel: string;
  hasRanger: boolean;
  report: DemoRangerTargetReport | null;
  enemyBacklineDeathSec: Partial<Record<ClassId, number>>;
  outcome: RangerTargetReportBattleInput['outcome'];
  durationSec: number;
}

export function isRangerPriorityEnemyClass(
  classId: ClassId,
  classRegistry?: Record<ClassId, ClassPreset>,
): boolean {
  if (RANGER_PRIORITY_ENEMY_CLASS_IDS.includes(classId)) {
    return true;
  }
  const preset = classRegistry?.[classId];
  if (!preset) return false;
  if (preset.formationRow === 'back') return true;
  const rangePx = preset.traits?.rangePx ?? 0;
  return rangePx >= RANGED_ATTACK_MIN_PX;
}

function sumRecordValues(record: Partial<Record<string, number>>): number {
  return Object.values(record).reduce((sum, value) => sum + (value ?? 0), 0);
}

function shareOfPriorityTargets(
  record: Partial<Record<ClassId, number>>,
  classRegistry?: Record<ClassId, ClassPreset>,
): number | null {
  const total = sumRecordValues(record);
  if (total <= 0) return null;
  let priority = 0;
  for (const [classId, amount] of Object.entries(record)) {
    if ((amount ?? 0) > 0 && isRangerPriorityEnemyClass(classId as ClassId, classRegistry)) {
      priority += amount ?? 0;
    }
  }
  return priority / total;
}

function dominantKey(
  record: Partial<Record<ClassId, number>>,
): ClassId | null {
  let best: ClassId | null = null;
  let bestCount = 0;
  for (const [classId, count] of Object.entries(record)) {
    if ((count ?? 0) > bestCount) {
      best = classId as ClassId;
      bestCount = count ?? 0;
    }
  }
  return best;
}

function totalActiveSkillUses(row: RangerTargetReportClassRow): number {
  return Object.values(row.activeSkillUseCountBySkillId).reduce(
    (sum, count) => sum + count,
    0,
  );
}

function buildRoleNote(input: {
  row: RangerTargetReportClassRow | undefined;
  diagnostics: RangerBasicAttackDiagnostics | undefined;
  backlineDamageShare: number | null;
  backlineTargetShare: number | null;
  primaryTargetClassId: ClassId | null;
  killOrLastHitTargetClassId: Partial<Record<ClassId, number>>;
  classRegistry?: Record<ClassId, ClassPreset>;
}): { roleFulfilled: boolean | null; note: string } {
  const {
    row,
    diagnostics,
    backlineDamageShare,
    backlineTargetShare,
    primaryTargetClassId,
    killOrLastHitTargetClassId,
    classRegistry,
  } = input;

  if (!row) {
    return { roleFulfilled: null, note: 'at_ranger not in party' };
  }

  const notes: string[] = [];
  let roleFulfilled: boolean | null = null;

  if (row.basicActionCount <= 0 && row.damageDealt <= 0) {
    return {
      roleFulfilled: false,
      note: 'no basic actions and no damage — ranger inactive',
    };
  }

  const firstBasic = row.firstBasicActionSec ?? diagnostics?.firstBasicActionSec ?? null;
  if (firstBasic !== null && firstBasic > 25) {
    notes.push(`firstBasicActionSec slow (${firstBasic.toFixed(1)}s)`);
  }

  const outOfRange = diagnostics?.skipReasonHistogram.out_of_range ?? null;
  const moving = diagnostics?.skipReasonHistogram.moving ?? null;
  if (outOfRange !== null && outOfRange > 100) {
    notes.push(`out_of_range stall (${outOfRange} ticks)`);
  }
  if (moving !== null && moving > 100) {
    notes.push(`moving stall (${moving} ticks)`);
  }

  const priorityPrimary =
    primaryTargetClassId !== null &&
    isRangerPriorityEnemyClass(primaryTargetClassId, classRegistry);
  const priorityKills = Object.entries(killOrLastHitTargetClassId).filter(
    ([classId, count]) =>
      (count ?? 0) > 0 &&
      isRangerPriorityEnemyClass(classId as ClassId, classRegistry),
  );

  if (backlineDamageShare !== null) {
    const pct = (backlineDamageShare * 100).toFixed(0);
    if (backlineDamageShare >= 0.35) {
      roleFulfilled = true;
      notes.push(`backline damage share ${pct}% (role met)`);
    } else if (row.damageDealt > 0) {
      roleFulfilled = false;
      notes.push(
        `backline damage share ${pct}% — damage absorbed by frontline (role unmet)`,
      );
    }
  }

  if (backlineTargetShare !== null && backlineTargetShare >= 0.4) {
    if (roleFulfilled !== false) roleFulfilled = true;
    notes.push(
      `target acquisition share ${(backlineTargetShare * 100).toFixed(0)}% to backline/ranged`,
    );
  } else if (
    backlineTargetShare !== null &&
    backlineTargetShare < 0.25 &&
    row.basicActionCount > 0
  ) {
    roleFulfilled = false;
    notes.push(
      `target acquisition share ${(backlineTargetShare * 100).toFixed(0)}% — not prioritizing backline`,
    );
  }

  if (priorityPrimary && roleFulfilled !== false) {
    roleFulfilled = true;
    notes.push(`primary target ${primaryTargetClassId} is priority backline/ranged`);
  }

  if (priorityKills.length > 0) {
    if (roleFulfilled !== false) roleFulfilled = true;
    notes.push(
      `last-hit on priority targets: ${priorityKills.map(([id]) => id).join(', ')}`,
    );
  }

  if (roleFulfilled === null && row.damageDealt > 0) {
    roleFulfilled = priorityPrimary || (backlineDamageShare ?? 0) >= 0.25;
    notes.push(
      roleFulfilled
        ? 'damage present with some backline focus — marginal role fulfillment'
        : 'damage present but backline focus unclear',
    );
  }

  if (notes.length === 0) {
    notes.push('insufficient telemetry for role judgment');
  }

  return { roleFulfilled, note: notes.join('; ') };
}

export function buildDemoRangerTargetReport(
  stageId: string,
  partyLabel: string,
  input: RangerTargetReportBattleInput,
  options?: {
    rangerUnitId?: string | null;
    classRegistry?: Record<ClassId, ClassPreset>;
  },
): DemoRangerTargetReport | null {
  const row = input.classStats.find((stat) => stat.classId === 'at_ranger');
  if (!row) return null;

  const diagnostics = input.rangerBasicAttackDiagnostics;
  const targetClassHitCount: Partial<Record<ClassId, number>> = {};
  for (const entry of diagnostics?.targetAcquisition ?? []) {
    if (!entry.targetClassId) continue;
    const classId = entry.targetClassId as ClassId;
    targetClassHitCount[classId] = (targetClassHitCount[classId] ?? 0) + 1;
  }

  const killOrLastHitTargetClassId: Partial<Record<ClassId, number>> = {};
  for (const death of input.enemyDeaths ?? []) {
    if (death.lastHitByAllyClassId !== 'at_ranger') continue;
    killOrLastHitTargetClassId[death.classId] =
      (killOrLastHitTargetClassId[death.classId] ?? 0) + 1;
  }

  const backlineDamageShare = shareOfPriorityTargets(
    row.damageByTarget,
    options?.classRegistry,
  );
  const backlineTargetShare = shareOfPriorityTargets(
    targetClassHitCount,
    options?.classRegistry,
  );
  const primaryTargetClassId = dominantKey(targetClassHitCount);

  const { roleFulfilled, note } = buildRoleNote({
    row,
    diagnostics,
    backlineDamageShare,
    backlineTargetShare,
    primaryTargetClassId,
    killOrLastHitTargetClassId,
    classRegistry: options?.classRegistry,
  });

  return {
    stageId,
    partyLabel,
    rangerUnitId: options?.rangerUnitId ?? input.rangerUnitId ?? null,
    firstBasicActionSec:
      row.firstBasicActionSec ?? diagnostics?.firstBasicActionSec ?? null,
    basicActionCount: row.basicActionCount,
    activeSkillUseCount: totalActiveSkillUses(row),
    primaryTargetClassId,
    targetClassHitCount,
    damageByTargetClassId: { ...row.damageByTarget },
    killOrLastHitTargetClassId,
    outOfRangeSkipCount: diagnostics
      ? (diagnostics.skipReasonHistogram.out_of_range ?? 0)
      : null,
    movingSkipCount: diagnostics
      ? (diagnostics.skipReasonHistogram.moving ?? 0)
      : null,
    backlineDamageShare,
    backlineTargetShare,
    roleFulfilled,
    note,
  };
}

function formatShare(value: number | null): string {
  if (value === null) return 'n/a';
  return `${(value * 100).toFixed(0)}%`;
}

function formatRecord(record: Partial<Record<string, number>>): string {
  const entries = Object.entries(record).filter(([, v]) => (v ?? 0) > 0);
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

export function logDemoRangerTargetReport(report: DemoRangerTargetReport): void {
  console.info(
    `[demo-ranger-target-report] ${report.stageId}/${report.partyLabel}: ` +
      `rangerUnitId=${report.rangerUnitId ?? 'unknown'} ` +
      `firstBasicActionSec=${report.firstBasicActionSec?.toFixed(1) ?? 'none'} ` +
      `basicActionCount=${report.basicActionCount} ` +
      `activeSkillUseCount=${report.activeSkillUseCount} ` +
      `primaryTargetClassId=${report.primaryTargetClassId ?? 'none'} ` +
      `targetClassHitCount={${formatRecord(report.targetClassHitCount)}} ` +
      `damageByTargetClassId={${formatRecord(report.damageByTargetClassId)}} ` +
      `killOrLastHitTargetClassId={${formatRecord(report.killOrLastHitTargetClassId)}} ` +
      `outOfRangeSkipCount=${report.outOfRangeSkipCount ?? 'n/a'} ` +
      `movingSkipCount=${report.movingSkipCount ?? 'n/a'} ` +
      `backlineDamageShare=${formatShare(report.backlineDamageShare)} ` +
      `backlineTargetShare=${formatShare(report.backlineTargetShare)} ` +
      `roleFulfilled=${report.roleFulfilled ?? 'n/a'} ` +
      `note=${report.note}`,
  );
}

export function collectEnemyBacklineDeathSec(
  enemyDeaths: DemoEnemyDeathRecord[] | undefined,
  classRegistry?: Record<ClassId, ClassPreset>,
): Partial<Record<ClassId, number>> {
  const result: Partial<Record<ClassId, number>> = {};
  for (const death of enemyDeaths ?? []) {
    if (!isRangerPriorityEnemyClass(death.classId, classRegistry)) continue;
    const prior = result[death.classId];
    if (prior === undefined || death.deathSec < prior) {
      result[death.classId] = death.deathSec;
    }
  }
  return result;
}

export function buildDemoClassCoverageEntry(
  stageId: string,
  partyLabel: string,
  input: RangerTargetReportBattleInput,
  gameData?: GameData,
): DemoClassCoverageEntry {
  const hasRanger = input.classStats.some((row) => row.classId === 'at_ranger');
  const report = hasRanger
    ? buildDemoRangerTargetReport(stageId, partyLabel, input, {
        classRegistry: gameData?.classRegistry,
      })
    : null;

  return {
    stageId,
    partyLabel,
    hasRanger,
    report,
    enemyBacklineDeathSec: collectEnemyBacklineDeathSec(
      input.enemyDeaths,
      gameData?.classRegistry,
    ),
    outcome: input.outcome,
    durationSec: input.durationSec,
  };
}

export function logDemoClassCoverageSummary(
  entries: DemoClassCoverageEntry[],
): void {
  console.info('[demo-class-coverage] at_ranger backline-processor summary:');

  for (const entry of entries) {
    if (entry.hasRanger && entry.report) {
      const role =
        entry.report.roleFulfilled === true
          ? 'BACKLINE_OK'
          : entry.report.roleFulfilled === false
            ? 'ROLE_UNMET'
            : 'UNKNOWN';
      console.info(
        `[demo-class-coverage]   ${entry.stageId}/${entry.partyLabel}: ` +
          `${role} — ${entry.report.note}`,
      );
    } else if (!entry.hasRanger) {
      const backlineDeaths = formatRecord(entry.enemyBacklineDeathSec);
      console.info(
        `[demo-class-coverage]   ${entry.stageId}/${entry.partyLabel}: ` +
          `no at_ranger; enemy backline deathSec={${backlineDeaths}} ` +
          `outcome=${entry.outcome} durationSec=${entry.durationSec.toFixed(1)}`,
      );
    }
  }

  const rangerEntries = entries.filter((e) => e.hasRanger && e.report);
  const fulfilled = rangerEntries.filter((e) => e.report!.roleFulfilled === true);
  const unmet = rangerEntries.filter((e) => e.report!.roleFulfilled === false);
  console.info(
    `[demo-class-coverage] aggregate: ` +
      `ranger compositions=${rangerEntries.length} ` +
      `roleFulfilled=${fulfilled.length} roleUnmet=${unmet.length}`,
  );

  for (const entry of entries) {
    const backlineKeys = Object.keys(entry.enemyBacklineDeathSec);
    if (backlineKeys.length === 0) continue;
    console.info(
      `[demo-class-coverage]   ${entry.stageId}/${entry.partyLabel} ` +
        `enemyBacklineDeathSec={${formatRecord(entry.enemyBacklineDeathSec)}}`,
    );
  }

  const byStage = new Map<string, DemoClassCoverageEntry[]>();
  for (const entry of entries) {
    const group = byStage.get(entry.stageId) ?? [];
    group.push(entry);
    byStage.set(entry.stageId, group);
  }
  for (const [stageId, group] of byStage) {
    const withRanger = group.find((e) => e.hasRanger && e.report?.roleFulfilled);
    const withoutRanger = group.find((e) => !e.hasRanger);
    if (!withRanger || !withoutRanger) continue;

    const sharedClasses = Object.keys(withRanger.enemyBacklineDeathSec).filter(
      (classId) => withoutRanger.enemyBacklineDeathSec[classId as ClassId] !== undefined,
    );
    if (sharedClasses.length === 0) continue;

    const deltas = sharedClasses.map((classId) => {
      const cid = classId as ClassId;
      const rangerSec = withRanger.enemyBacklineDeathSec[cid] ?? 0;
      const altSec = withoutRanger.enemyBacklineDeathSec[cid] ?? 0;
      return `${classId}:${(altSec - rangerSec).toFixed(1)}s faster-with-ranger`;
    });
    console.info(
      `[demo-class-coverage]   ${stageId} ranger(${withRanger.partyLabel}) vs no-ranger(${withoutRanger.partyLabel}): ` +
        `backline death delta {${deltas.join(', ')}}; ` +
        `outcome ranger=${withRanger.outcome} alt=${withoutRanger.outcome}; ` +
        `durationSec ranger=${withRanger.durationSec.toFixed(1)} alt=${withoutRanger.durationSec.toFixed(1)}`,
    );
  }
}

export function toRangerTargetReportInput(
  result: {
    classStats: RangerTargetReportClassRow[];
    rangerBasicAttackDiagnostics?: RangerBasicAttackDiagnostics;
    enemyDeaths?: DemoEnemyDeathRecord[];
    outcome: RangerTargetReportBattleInput['outcome'];
    durationSec: number;
    rangerUnitId?: string | null;
  },
): RangerTargetReportBattleInput {
  return {
    classStats: result.classStats,
    rangerBasicAttackDiagnostics: result.rangerBasicAttackDiagnostics,
    enemyDeaths: result.enemyDeaths,
    outcome: result.outcome,
    durationSec: result.durationSec,
    rangerUnitId: result.rangerUnitId,
  };
}

export function logDemoRangerTargetReportsForResult(
  stageId: string,
  partyLabel: string,
  input: RangerTargetReportBattleInput,
  gameData?: GameData,
): DemoRangerTargetReport | null {
  const report = buildDemoRangerTargetReport(stageId, partyLabel, input, {
    classRegistry: gameData?.classRegistry,
  });
  if (report) {
    logDemoRangerTargetReport(report);
  }
  return report;
}
