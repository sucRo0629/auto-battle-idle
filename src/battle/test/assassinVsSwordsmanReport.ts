import type { ClassId } from '../types.ts';
import {
  ASSASSIN_FRONTLINE_CLASS_IDS,
  ASSASSIN_PRIORITY_TARGET_CLASS_IDS,
  type AssassinRoleReportBattleInput,
  type AssassinRoleReportClassRow,
} from './assassinRoleReport.ts';
import type { DemoEnemyDeathRecord } from './rangerTargetReport.ts';

export type AssassinVsSwordsmanVariant = 'assassin' | 'swordsman';

export type AssassinVsSwordsmanVerdict =
  | 'ASSASSIN_SURVIVAL_WEAK'
  | 'BOTH_FAIL_STAGE_PRESSURE'
  | 'ASSASSIN_ROLE_OK'
  | 'SWORDSMAN_BETTER_FRONTLINE_ONLY'
  | 'INCONCLUSIVE';

const COMPARISON_CLASS_IDS = ['at_assassin', 'at_swordsman'] as const;
export type ComparisonMeleeClassId = (typeof COMPARISON_CLASS_IDS)[number];

export interface DemoAssassinVsSwordsmanSurvivalReport {
  stageId: string;
  partyLabel: string;
  variant: AssassinVsSwordsmanVariant;
  outcome: AssassinRoleReportBattleInput['outcome'];
  targetClassId: ComparisonMeleeClassId;
  survived: boolean;
  deathTimeSec: number | null;
  firstBasicActionSec: number | null;
  basicActionCount: number;
  activeSkillUseCount: number;
  damageDealt: number;
  damageTaken: number;
  damageTakenPerSec: number;
  damageDealtPerSec: number;
  primaryTargetClassId: ClassId | null;
  damageByTargetClassId: Partial<Record<ClassId, number>>;
  frontlineDamageShare: number | null;
  priorityTargetDamageShare: number | null;
  killOrLastHitTargetClassId: Partial<Record<ClassId, number>>;
  note: string;
}

export interface DemoAssassinVsSwordsmanSummary {
  stageId: string;
  partyLabel: string;
  verdict: AssassinVsSwordsmanVerdict;
  reason: string;
}

export interface AssassinVsSwordsmanComparisonInput {
  stageId: string;
  partyLabel: string;
  partyHasHealer: boolean;
  assassin: AssassinRoleReportBattleInput;
  swordsman: AssassinRoleReportBattleInput;
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

function buildKillOrLastHitForClass(
  classId: ComparisonMeleeClassId,
  enemyDeaths: DemoEnemyDeathRecord[] | undefined,
): Partial<Record<ClassId, number>> {
  const record: Partial<Record<ClassId, number>> = {};
  for (const death of enemyDeaths ?? []) {
    if (death.lastHitByAllyClassId !== classId) continue;
    record[death.classId] = (record[death.classId] ?? 0) + 1;
  }
  return record;
}

function isEarlyDeath(
  row: AssassinRoleReportClassRow,
  durationSec: number,
): boolean {
  if (row.deathSec === undefined) return false;
  return row.deathSec < durationSec * 0.3 || row.damageDealt < 25;
}

function isLowContribution(
  row: AssassinRoleReportClassRow,
  durationSec: number,
): boolean {
  const survived = row.deathSec === undefined;
  if (isEarlyDeath(row, durationSec)) return true;
  if (!survived && row.damageDealt < 80) return true;
  if (row.basicActionCount <= 1 && row.damageDealt < 50) return true;
  return false;
}

function buildVariantNote(input: {
  targetClassId: ComparisonMeleeClassId;
  row: AssassinRoleReportClassRow;
  durationSec: number;
  partyHasHealer: boolean;
  priorityTargetDamageShare: number | null;
  frontlineDamageShare: number | null;
  firstBasicActionSec: number | null;
  damageTakenPerSec: number;
}): string {
  const notes: string[] = [];
  const {
    targetClassId,
    row,
    durationSec,
    partyHasHealer,
    priorityTargetDamageShare,
    frontlineDamageShare,
    firstBasicActionSec,
    damageTakenPerSec,
  } = input;

  if (!partyHasHealer) {
    notes.push('no-healer composition — formation gap may dominate over class base stats');
  }

  if (isEarlyDeath(row, durationSec)) {
    notes.push(
      `early death at ${row.deathSec?.toFixed(1) ?? '?'}s with damageDealt=${row.damageDealt}`,
    );
  }

  if (
    firstBasicActionSec !== null &&
    firstBasicActionSec > 15 &&
    row.basicActionCount <= 3
  ) {
    notes.push(
      `slow firstBasicActionSec=${firstBasicActionSec.toFixed(1)} with basicActionCount=${row.basicActionCount} — approach/range/target suspicion`,
    );
  }

  if (damageTakenPerSec > 8 && row.damageTaken > 0) {
    notes.push(
      `high damageTakenPerSec=${damageTakenPerSec.toFixed(1)} — base durability or enemy firepower pressure`,
    );
  }

  if (targetClassId === 'at_assassin') {
    if (
      frontlineDamageShare !== null &&
      frontlineDamageShare >= 0.65 &&
      (priorityTargetDamageShare ?? 0) < 0.25
    ) {
      notes.push(
        `frontline absorption ${(frontlineDamageShare * 100).toFixed(0)}% before priority targets`,
      );
    }
    if (
      priorityTargetDamageShare !== null &&
      priorityTargetDamageShare >= 0.35
    ) {
      notes.push(
        `priority band share ${(priorityTargetDamageShare * 100).toFixed(0)}% — execute target reached`,
      );
    }
  }

  if (targetClassId === 'at_swordsman') {
    if (
      frontlineDamageShare !== null &&
      frontlineDamageShare >= 0.5 &&
      row.damageDealt > 0
    ) {
      notes.push(
        `frontline-focused damage share ${(frontlineDamageShare * 100).toFixed(0)}% (expected for swordsman)`,
      );
    }
  }

  if (notes.length === 0) {
    notes.push('no dominant survival signal in telemetry');
  }

  return notes.join('; ');
}

export function buildDemoAssassinVsSwordsmanSurvivalReport(
  stageId: string,
  partyLabel: string,
  variant: AssassinVsSwordsmanVariant,
  input: AssassinRoleReportBattleInput,
  options?: { partyHasHealer?: boolean },
): DemoAssassinVsSwordsmanSurvivalReport | null {
  const targetClassId: ComparisonMeleeClassId =
    variant === 'assassin' ? 'at_assassin' : 'at_swordsman';
  const row = input.classStats.find((stat) => stat.classId === targetClassId);
  if (!row) return null;

  const durationSec = Math.max(input.durationSec, 0.1);
  const killOrLastHitTargetClassId = buildKillOrLastHitForClass(
    targetClassId,
    input.enemyDeaths,
  );
  const priorityTargetDamageShare = shareForClassIds(
    row.damageByTarget,
    ASSASSIN_PRIORITY_TARGET_CLASS_IDS,
  );
  const frontlineDamageShare = shareForClassIds(
    row.damageByTarget,
    ASSASSIN_FRONTLINE_CLASS_IDS,
  );

  return {
    stageId,
    partyLabel,
    variant,
    outcome: input.outcome,
    targetClassId,
    survived: row.deathSec === undefined,
    deathTimeSec: row.deathSec ?? null,
    firstBasicActionSec: row.firstBasicActionSec ?? null,
    basicActionCount: row.basicActionCount,
    activeSkillUseCount: totalActiveSkillUses(row),
    damageDealt: row.damageDealt,
    damageTaken: row.damageTaken,
    damageTakenPerSec: row.damageTaken / durationSec,
    damageDealtPerSec: row.damageDealt / durationSec,
    primaryTargetClassId: dominantKey(row.damageByTarget),
    damageByTargetClassId: { ...row.damageByTarget },
    frontlineDamageShare,
    priorityTargetDamageShare,
    killOrLastHitTargetClassId,
    note: buildVariantNote({
      targetClassId,
      row,
      durationSec: input.durationSec,
      partyHasHealer: options?.partyHasHealer ?? true,
      priorityTargetDamageShare,
      frontlineDamageShare,
      firstBasicActionSec: row.firstBasicActionSec ?? null,
      damageTakenPerSec: row.damageTaken / durationSec,
    }),
  };
}

function hasPriorityLastHit(
  record: Partial<Record<ClassId, number>>,
): boolean {
  return Object.entries(record).some(
    ([classId, count]) =>
      (count ?? 0) > 0 &&
      ASSASSIN_PRIORITY_TARGET_CLASS_IDS.includes(classId as ClassId),
  );
}

function hasMeaningfulAssassinRole(report: DemoAssassinVsSwordsmanSurvivalReport): boolean {
  if (
    report.priorityTargetDamageShare !== null &&
    report.priorityTargetDamageShare >= 0.35 &&
    report.basicActionCount >= 2
  ) {
    return true;
  }
  if (hasPriorityLastHit(report.killOrLastHitTargetClassId)) {
    return true;
  }
  if (
    report.outcome === 'victory' &&
    report.damageDealt >= 40 &&
    (report.priorityTargetDamageShare ?? 0) >= 0.25
  ) {
    return true;
  }
  return false;
}

export function buildDemoAssassinVsSwordsmanSummary(
  input: AssassinVsSwordsmanComparisonInput,
  assassinReport: DemoAssassinVsSwordsmanSurvivalReport,
  swordsmanReport: DemoAssassinVsSwordsmanSurvivalReport,
): DemoAssassinVsSwordsmanSummary {
  const { stageId, partyLabel, partyHasHealer, assassin, swordsman } = input;

  const assassinRow = assassin.classStats.find((r) => r.classId === 'at_assassin');
  const swordsmanRow = swordsman.classStats.find((r) => r.classId === 'at_swordsman');

  const assassinEarly = assassinRow
    ? isEarlyDeath(assassinRow, assassin.durationSec)
    : true;
  const swordsmanEarly = swordsmanRow
    ? isEarlyDeath(swordsmanRow, swordsman.durationSec)
    : true;
  const assassinLow = assassinRow
    ? isLowContribution(assassinRow, assassin.durationSec)
    : true;
  const swordsmanLow = swordsmanRow
    ? isLowContribution(swordsmanRow, swordsman.durationSec)
    : true;

  if (hasMeaningfulAssassinRole(assassinReport)) {
    return {
      stageId,
      partyLabel,
      verdict: 'ASSASSIN_ROLE_OK',
      reason:
        `assassin reached priority band (share=${formatShare(assassinReport.priorityTargetDamageShare)}, ` +
        `basicActionCount=${assassinReport.basicActionCount}, ` +
        `lastHit={${formatRecord(assassinReport.killOrLastHitTargetClassId)}}) — ` +
        `role target works; survival gap vs swordsman is secondary for this frame`,
    };
  }

  if (
    swordsmanReport.survived &&
    !swordsmanEarly &&
    assassinEarly &&
    !assassinReport.survived
  ) {
    const healerNote = !partyHasHealer
      ? ' no-healer frame — check formation before class HP/DEF tweak'
      : '';
    return {
      stageId,
      partyLabel,
      verdict: 'ASSASSIN_SURVIVAL_WEAK',
      reason:
        `swordsman survived (${swordsmanReport.damageDealt} dealt, taken=${swordsmanReport.damageTaken}) ` +
        `while assassin died @${assassinReport.deathTimeSec?.toFixed(1) ?? '?'}s ` +
        `(dealt=${assassinReport.damageDealt}) — base durability gap likely;${healerNote}`,
    };
  }

  if (assassinLow && swordsmanLow) {
    const healerNote = !partyHasHealer
      ? ' both in no-healer slot — formation gap / enemy firepower suspect'
      : ' stage pressure or party mismatch suspect';
    return {
      stageId,
      partyLabel,
      verdict: 'BOTH_FAIL_STAGE_PRESSURE',
      reason:
        `both variants low contribution (assassin survived=${assassinReport.survived} ` +
        `dealt=${assassinReport.damageDealt}; swordsman survived=${swordsmanReport.survived} ` +
        `dealt=${swordsmanReport.damageDealt}).${healerNote}`,
    };
  }

  if (
    swordsmanReport.survived &&
    swordsmanReport.damageDealt > assassinReport.damageDealt * 1.5 &&
    (swordsmanReport.frontlineDamageShare ?? 0) >= 0.45 &&
    (assassinReport.priorityTargetDamageShare ?? 0) < 0.35
  ) {
    return {
      stageId,
      partyLabel,
      verdict: 'SWORDSMAN_BETTER_FRONTLINE_ONLY',
      reason:
        `swordsman stable frontline processing (frontline share ${formatShare(swordsmanReport.frontlineDamageShare)}, ` +
        `dealt=${swordsmanReport.damageDealt}); assassin did not reach priority execute band ` +
        `(share=${formatShare(assassinReport.priorityTargetDamageShare)}, dealt=${assassinReport.damageDealt})`,
    };
  }

  if (
    swordsmanReport.survived &&
    !assassinReport.survived &&
    assassinReport.basicActionCount <= 2
  ) {
    return {
      stageId,
      partyLabel,
      verdict: 'INCONCLUSIVE',
      reason:
        `assassin died before meaningful actions (basicActionCount=${assassinReport.basicActionCount}, ` +
        `firstBasic=${assassinReport.firstBasicActionSec?.toFixed(1) ?? 'none'}); swordsman survived — ` +
        `mix of approach/target timing and durability`,
    };
  }

  return {
    stageId,
    partyLabel,
    verdict: 'INCONCLUSIVE',
    reason:
      `assassin survived=${assassinReport.survived} dealt=${assassinReport.damageDealt} ` +
      `priorityShare=${formatShare(assassinReport.priorityTargetDamageShare)}; ` +
      `swordsman survived=${swordsmanReport.survived} dealt=${swordsmanReport.damageDealt} ` +
      `frontlineShare=${formatShare(swordsmanReport.frontlineDamageShare)}`,
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

export function logDemoAssassinVsSwordsmanSurvivalReport(
  report: DemoAssassinVsSwordsmanSurvivalReport,
): void {
  console.info(
    `[demo-assassin-vs-swordsman-survival] ${report.stageId}/${report.partyLabel}/${report.variant}: ` +
      `targetClassId=${report.targetClassId} outcome=${report.outcome} ` +
      `survived=${report.survived} deathTimeSec=${report.deathTimeSec?.toFixed(1) ?? 'none'} ` +
      `firstBasicActionSec=${report.firstBasicActionSec?.toFixed(1) ?? 'none'} ` +
      `basicActionCount=${report.basicActionCount} activeSkillUseCount=${report.activeSkillUseCount} ` +
      `damageDealt=${report.damageDealt} damageTaken=${report.damageTaken} ` +
      `damageDealtPerSec=${report.damageDealtPerSec.toFixed(2)} ` +
      `damageTakenPerSec=${report.damageTakenPerSec.toFixed(2)} ` +
      `primaryTargetClassId=${report.primaryTargetClassId ?? 'none'} ` +
      `damageByTargetClassId={${formatRecord(report.damageByTargetClassId)}} ` +
      `frontlineDamageShare=${formatShare(report.frontlineDamageShare)} ` +
      `priorityTargetDamageShare=${formatShare(report.priorityTargetDamageShare)} ` +
      `killOrLastHitTargetClassId={${formatRecord(report.killOrLastHitTargetClassId)}} ` +
      `note=${report.note}`,
  );
}

export function logDemoAssassinVsSwordsmanSummary(
  summary: DemoAssassinVsSwordsmanSummary,
): void {
  console.info(
    `[demo-assassin-vs-swordsman-summary] ${summary.stageId}/${summary.partyLabel}: ` +
      `verdict=${summary.verdict} reason=${summary.reason}`,
  );
}

export function logDemoAssassinVsSwordsmanComparison(
  input: AssassinVsSwordsmanComparisonInput,
): DemoAssassinVsSwordsmanSummary {
  const assassinReport = buildDemoAssassinVsSwordsmanSurvivalReport(
    input.stageId,
    input.partyLabel,
    'assassin',
    input.assassin,
    { partyHasHealer: input.partyHasHealer },
  );
  const swordsmanReport = buildDemoAssassinVsSwordsmanSurvivalReport(
    input.stageId,
    input.partyLabel,
    'swordsman',
    input.swordsman,
    { partyHasHealer: input.partyHasHealer },
  );

  if (!assassinReport || !swordsmanReport) {
    const summary: DemoAssassinVsSwordsmanSummary = {
      stageId: input.stageId,
      partyLabel: input.partyLabel,
      verdict: 'INCONCLUSIVE',
      reason: 'missing assassin or swordsman row in party stats',
    };
    logDemoAssassinVsSwordsmanSummary(summary);
    return summary;
  }

  logDemoAssassinVsSwordsmanSurvivalReport(assassinReport);
  logDemoAssassinVsSwordsmanSurvivalReport(swordsmanReport);

  const summary = buildDemoAssassinVsSwordsmanSummary(
    input,
    assassinReport,
    swordsmanReport,
  );
  logDemoAssassinVsSwordsmanSummary(summary);
  return summary;
}

export function toAssassinVsSwordsmanBattleInput(result: {
  classStats: AssassinRoleReportClassRow[];
  enemyDeaths?: DemoEnemyDeathRecord[];
  outcome: AssassinRoleReportBattleInput['outcome'];
  durationSec: number;
}): AssassinRoleReportBattleInput {
  return {
    classStats: result.classStats,
    enemyDeaths: result.enemyDeaths,
    outcome: result.outcome,
    durationSec: result.durationSec,
  };
}
