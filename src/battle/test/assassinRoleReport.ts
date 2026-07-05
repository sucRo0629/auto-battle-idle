import type { ClassId } from '../types.ts';
import type { DemoEnemyDeathRecord } from './rangerTargetReport.ts';

/** Soft / backline targets at_assassin is designed to finish (execute band). */
export const ASSASSIN_PRIORITY_TARGET_CLASS_IDS: readonly ClassId[] = [
  'sp_cleric',
  'at_sorcerer',
  'sp_wardweaver',
  'at_ranger',
  'at_assassin',
] as const;

/** Frontline tanks that absorb assassin damage without role fulfillment. */
export const ASSASSIN_FRONTLINE_CLASS_IDS: readonly ClassId[] = [
  'df_guardian',
  'df_paladin',
  'at_swordsman',
] as const;

export interface AssassinRoleReportClassRow {
  classId: ClassId;
  damageDealt: number;
  damageTaken: number;
  damageByTarget: Partial<Record<ClassId, number>>;
  basicActionCount: number;
  firstBasicActionSec?: number;
  deathSec?: number;
  activeSkillUseCountBySkillId: Record<string, number>;
}

export interface AssassinRoleReportBattleInput {
  classStats: AssassinRoleReportClassRow[];
  enemyDeaths?: DemoEnemyDeathRecord[];
  outcome: 'victory' | 'defeat' | 'timeout';
  durationSec: number;
  assassinUnitId?: string | null;
}

export type AssassinRoleVerdict = 'ROLE_OK' | 'ROLE_THIN' | 'ROLE_UNMET';

export interface DemoAssassinRoleReport {
  stageId: string;
  partyLabel: string;
  assassinUnitId: string | null;
  outcome: AssassinRoleReportBattleInput['outcome'];
  survived: boolean;
  deathTimeSec: number | null;
  firstBasicActionSec: number | null;
  basicActionCount: number;
  activeSkillUseCount: number;
  damageDealt: number;
  damageTaken: number;
  primaryTargetClassId: ClassId | null;
  damageByTargetClassId: Partial<Record<ClassId, number>>;
  killOrLastHitTargetClassId: Partial<Record<ClassId, number>>;
  priorityTargetDamageShare: number | null;
  frontlineDamageShare: number | null;
  roleVerdict: AssassinRoleVerdict | null;
  note: string;
}

export interface DemoAssassinCoverageEntry {
  stageId: string;
  partyLabel: string;
  hasAssassin: boolean;
  report: DemoAssassinRoleReport | null;
  outcome: AssassinRoleReportBattleInput['outcome'];
  durationSec: number;
}

function sumRecordValues(record: Partial<Record<string, number>>): number {
  return Object.values(record).reduce((sum, value) => sum + (value ?? 0), 0);
}

function shareForClassIds(
  record: Partial<Record<ClassId, number>>,
  classIds: readonly ClassId[],
): number | null {
  const total = sumRecordValues(record);
  if (total <= 0) return null;
  let matched = 0;
  for (const classId of classIds) {
    matched += record[classId] ?? 0;
  }
  return matched / total;
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

function totalActiveSkillUses(row: AssassinRoleReportClassRow): number {
  return Object.values(row.activeSkillUseCountBySkillId).reduce(
    (sum, count) => sum + count,
    0,
  );
}

function isPriorityTarget(classId: ClassId): boolean {
  return ASSASSIN_PRIORITY_TARGET_CLASS_IDS.includes(classId);
}

function isFrontlineTarget(classId: ClassId): boolean {
  return ASSASSIN_FRONTLINE_CLASS_IDS.includes(classId);
}

function buildRoleVerdict(input: {
  row: AssassinRoleReportClassRow;
  durationSec: number;
  priorityTargetDamageShare: number | null;
  frontlineDamageShare: number | null;
  primaryTargetClassId: ClassId | null;
  killOrLastHitTargetClassId: Partial<Record<ClassId, number>>;
  outcome: AssassinRoleReportBattleInput['outcome'];
}): { roleVerdict: AssassinRoleVerdict; note: string } {
  const {
    row,
    durationSec,
    priorityTargetDamageShare,
    frontlineDamageShare,
    primaryTargetClassId,
    killOrLastHitTargetClassId,
    outcome,
  } = input;

  const notes: string[] = [];
  const survived = row.deathSec === undefined;
  const activeSkillUseCount = totalActiveSkillUses(row);

  if (row.basicActionCount <= 0 && row.damageDealt <= 0) {
    return {
      roleVerdict: 'ROLE_UNMET',
      note: 'no basic actions and no damage — assassin inactive',
    };
  }

  if (
    !survived &&
    row.deathSec !== undefined &&
    row.deathSec < durationSec * 0.3 &&
    row.damageDealt < 80
  ) {
    notes.push(
      `early death at ${row.deathSec.toFixed(1)}s with low damageDealt=${row.damageDealt}`,
    );
    return {
      roleVerdict: 'ROLE_UNMET',
      note: notes.join('; '),
    };
  }

  if (!survived && row.damageDealt < 25) {
    notes.push(`died with negligible damageDealt=${row.damageDealt}`);
    return {
      roleVerdict: 'ROLE_UNMET',
      note: notes.join('; '),
    };
  }

  const priorityKills = Object.entries(killOrLastHitTargetClassId).filter(
    ([classId, count]) => (count ?? 0) > 0 && isPriorityTarget(classId as ClassId),
  );
  const frontlineKills = Object.entries(killOrLastHitTargetClassId).filter(
    ([classId, count]) => (count ?? 0) > 0 && isFrontlineTarget(classId as ClassId),
  );

  let roleVerdict: AssassinRoleVerdict = 'ROLE_THIN';

  if (priorityTargetDamageShare !== null && priorityTargetDamageShare >= 0.35) {
    roleVerdict = 'ROLE_OK';
    notes.push(
      `priority-target damage share ${(priorityTargetDamageShare * 100).toFixed(0)}% (execute band met)`,
    );
  }

  if (priorityKills.length > 0) {
    roleVerdict = 'ROLE_OK';
    notes.push(
      `last-hit on priority targets: ${priorityKills.map(([id]) => id).join(', ')}`,
    );
  }

  if (
    primaryTargetClassId !== null &&
    isPriorityTarget(primaryTargetClassId) &&
    row.damageDealt > 0
  ) {
    if (roleVerdict !== 'ROLE_OK') roleVerdict = 'ROLE_OK';
    notes.push(`primary damage target ${primaryTargetClassId} is priority band`);
  }

  if (
    frontlineDamageShare !== null &&
    frontlineDamageShare >= 0.65 &&
    (priorityTargetDamageShare ?? 0) < 0.25 &&
    priorityKills.length === 0
  ) {
    roleVerdict = 'ROLE_UNMET';
    notes.push(
      `frontline absorption ${(frontlineDamageShare * 100).toFixed(0)}% — stuck on tanks`,
    );
  }

  if (
    row.damageDealt > 0 &&
    roleVerdict === 'ROLE_THIN' &&
    survived &&
    row.damageDealt >= durationSec * 2
  ) {
    notes.push(
      `survived with damageDealt=${row.damageDealt} but priority focus unclear`,
    );
  }

  if (outcome === 'victory' && roleVerdict === 'ROLE_THIN' && row.damageDealt > 0) {
    notes.push('victory party member — contribution alone does not imply role OK');
  }

  if (frontlineKills.length > 0 && priorityKills.length === 0) {
    notes.push(
      `last-hit mostly frontline: ${frontlineKills.map(([id]) => id).join(', ')}`,
    );
  }

  if (row.firstBasicActionSec !== undefined && row.firstBasicActionSec > 20) {
    notes.push(`firstBasicActionSec slow (${row.firstBasicActionSec.toFixed(1)}s)`);
  }

  if (activeSkillUseCount === 0 && row.basicActionCount > 0) {
    notes.push('no active skill uses recorded');
  }

  if (notes.length === 0) {
    notes.push('insufficient telemetry for role judgment — marginal');
  }

  return { roleVerdict, note: notes.join('; ') };
}

export function buildDemoAssassinRoleReport(
  stageId: string,
  partyLabel: string,
  input: AssassinRoleReportBattleInput,
  options?: { assassinUnitId?: string | null },
): DemoAssassinRoleReport | null {
  const row = input.classStats.find((stat) => stat.classId === 'at_assassin');
  if (!row) return null;

  const killOrLastHitTargetClassId: Partial<Record<ClassId, number>> = {};
  for (const death of input.enemyDeaths ?? []) {
    if (death.lastHitByAllyClassId !== 'at_assassin') continue;
    killOrLastHitTargetClassId[death.classId] =
      (killOrLastHitTargetClassId[death.classId] ?? 0) + 1;
  }

  const priorityTargetDamageShare = shareForClassIds(
    row.damageByTarget,
    ASSASSIN_PRIORITY_TARGET_CLASS_IDS,
  );
  const frontlineDamageShare = shareForClassIds(
    row.damageByTarget,
    ASSASSIN_FRONTLINE_CLASS_IDS,
  );
  const primaryTargetClassId = dominantKey(row.damageByTarget);

  const { roleVerdict, note } = buildRoleVerdict({
    row,
    durationSec: input.durationSec,
    priorityTargetDamageShare,
    frontlineDamageShare,
    primaryTargetClassId,
    killOrLastHitTargetClassId,
    outcome: input.outcome,
  });

  return {
    stageId,
    partyLabel,
    assassinUnitId: options?.assassinUnitId ?? input.assassinUnitId ?? null,
    outcome: input.outcome,
    survived: row.deathSec === undefined,
    deathTimeSec: row.deathSec ?? null,
    firstBasicActionSec: row.firstBasicActionSec ?? null,
    basicActionCount: row.basicActionCount,
    activeSkillUseCount: totalActiveSkillUses(row),
    damageDealt: row.damageDealt,
    damageTaken: row.damageTaken,
    primaryTargetClassId,
    damageByTargetClassId: { ...row.damageByTarget },
    killOrLastHitTargetClassId,
    priorityTargetDamageShare,
    frontlineDamageShare,
    roleVerdict,
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

export function logDemoAssassinRoleReport(report: DemoAssassinRoleReport): void {
  console.info(
    `[demo-assassin-role-report] ${report.stageId}/${report.partyLabel}: ` +
      `assassinUnitId=${report.assassinUnitId ?? 'unknown'} ` +
      `outcome=${report.outcome} survived=${report.survived} ` +
      `deathTimeSec=${report.deathTimeSec?.toFixed(1) ?? 'none'} ` +
      `firstBasicActionSec=${report.firstBasicActionSec?.toFixed(1) ?? 'none'} ` +
      `basicActionCount=${report.basicActionCount} ` +
      `activeSkillUseCount=${report.activeSkillUseCount} ` +
      `damageDealt=${report.damageDealt} damageTaken=${report.damageTaken} ` +
      `primaryTargetClassId=${report.primaryTargetClassId ?? 'none'} ` +
      `damageByTargetClassId={${formatRecord(report.damageByTargetClassId)}} ` +
      `killOrLastHitTargetClassId={${formatRecord(report.killOrLastHitTargetClassId)}} ` +
      `priorityTargetDamageShare=${formatShare(report.priorityTargetDamageShare)} ` +
      `frontlineDamageShare=${formatShare(report.frontlineDamageShare)} ` +
      `roleVerdict=${report.roleVerdict ?? 'n/a'} ` +
      `note=${report.note}`,
  );
}

export function buildDemoAssassinCoverageEntry(
  stageId: string,
  partyLabel: string,
  input: AssassinRoleReportBattleInput,
): DemoAssassinCoverageEntry {
  const hasAssassin = input.classStats.some((row) => row.classId === 'at_assassin');
  const report = hasAssassin
    ? buildDemoAssassinRoleReport(stageId, partyLabel, input)
    : null;

  return {
    stageId,
    partyLabel,
    hasAssassin,
    report,
    outcome: input.outcome,
    durationSec: input.durationSec,
  };
}

export function logDemoAssassinCoverageSummary(
  entries: DemoAssassinCoverageEntry[],
): void {
  console.info('[demo-assassin-coverage-summary] at_assassin execute/finish role:');

  for (const entry of entries) {
    if (entry.hasAssassin && entry.report) {
      console.info(
        `[demo-assassin-coverage-summary]   ${entry.stageId}/${entry.partyLabel}: ` +
          `${entry.report.roleVerdict} — ${entry.report.note}`,
      );
    } else if (!entry.hasAssassin) {
      console.info(
        `[demo-assassin-coverage-summary]   ${entry.stageId}/${entry.partyLabel}: ` +
          `NO_ASSASSIN outcome=${entry.outcome} durationSec=${entry.durationSec.toFixed(1)}`,
      );
    }
  }

  const assassinEntries = entries.filter((e) => e.hasAssassin && e.report);
  const ok = assassinEntries.filter((e) => e.report!.roleVerdict === 'ROLE_OK');
  const thin = assassinEntries.filter((e) => e.report!.roleVerdict === 'ROLE_THIN');
  const unmet = assassinEntries.filter((e) => e.report!.roleVerdict === 'ROLE_UNMET');
  console.info(
    `[demo-assassin-coverage-summary] aggregate: ` +
      `assassin compositions=${assassinEntries.length} ` +
      `ROLE_OK=${ok.length} ROLE_THIN=${thin.length} ROLE_UNMET=${unmet.length}`,
  );
}

export function toAssassinRoleReportInput(result: {
  classStats: AssassinRoleReportClassRow[];
  enemyDeaths?: DemoEnemyDeathRecord[];
  outcome: AssassinRoleReportBattleInput['outcome'];
  durationSec: number;
  assassinUnitId?: string | null;
}): AssassinRoleReportBattleInput {
  return {
    classStats: result.classStats,
    enemyDeaths: result.enemyDeaths,
    outcome: result.outcome,
    durationSec: result.durationSec,
    assassinUnitId: result.assassinUnitId,
  };
}

export function logDemoAssassinRoleReportsForResult(
  stageId: string,
  partyLabel: string,
  input: AssassinRoleReportBattleInput,
): DemoAssassinRoleReport | null {
  const report = buildDemoAssassinRoleReport(stageId, partyLabel, input);
  if (report) {
    logDemoAssassinRoleReport(report);
  }
  return report;
}
