import type { ClassId } from '../types.ts';
import {
  ASSASSIN_PRIORITY_TARGET_CLASS_IDS,
  buildDemoAssassinRoleReport,
  type DemoAssassinRoleReport,
  toAssassinRoleReportInput,
} from './assassinRoleReport.ts';
import {
  buildDemoRangerTargetReport,
  toRangerTargetReportInput,
  type DemoRangerTargetReport,
} from './rangerTargetReport.ts';
import {
  demoStageOutcomeScore,
  type DemoStageBattleResult,
} from './demoStageSim.harness.ts';

const STAGE_ID = 'demo_ch1_05' as const;

export type Ch1_05AssassinFormalVerdict =
  | 'EXPERIENCE_SPOTLIGHT_CANDIDATE'
  | 'EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK'
  | 'NOT_ASSASSIN_COUNTER_PUZZLE'
  | 'ASSASSIN_ROLE_UNMET'
  | 'INCONCLUSIVE';

export interface Ch1_05SlotComparisonRow {
  partyLabel: string;
  slotIndex: number;
  slotClassId: ClassId;
  outcome: DemoStageBattleResult['outcome'];
  durationSec: number;
  survivors: number;
  remainingHp: number;
  outcomeScore: number;
  slotDamageDealt: number;
  slotDamageByTarget: Partial<Record<ClassId, number>>;
  slotKillOrLastHit: Partial<Record<ClassId, number>>;
  assassinReport: DemoAssassinRoleReport | null;
  rangerReport: DemoRangerTargetReport | null;
}

export interface Ch1_05PuzzleQuadSnapshot {
  baseline: Pick<DemoStageBattleResult, 'outcome' | 'durationSec' | 'survivingAllies' | 'totalRemainingHp'>;
  bad: Pick<DemoStageBattleResult, 'outcome' | 'durationSec' | 'survivingAllies' | 'totalRemainingHp'>;
  universal: Pick<DemoStageBattleResult, 'outcome' | 'durationSec' | 'survivingAllies' | 'totalRemainingHp'>;
  counter: Pick<DemoStageBattleResult, 'outcome' | 'durationSec' | 'survivingAllies' | 'totalRemainingHp'>;
  baselineScore: number;
  badScore: number;
  counterScore: number;
}

export interface Ch1_05AssassinFormalizationSummary {
  stageId: typeof STAGE_ID;
  verdict: Ch1_05AssassinFormalVerdict;
  puzzleDefaultLoses: boolean;
  puzzleCounterWins: boolean;
  assassinSpotlightRoleOk: boolean;
  assassinSpotlightOutcome: DemoStageBattleResult['outcome'] | null;
  substituteRangerSlotWins: boolean;
  assassinExplainableInLogs: boolean;
  reason: string;
  recommendation: string;
  slotRows: Ch1_05SlotComparisonRow[];
  puzzleQuad: Ch1_05PuzzleQuadSnapshot;
}

function formatRecord(record: Partial<Record<string, number>>): string {
  const entries = Object.entries(record).filter(([, v]) => (v ?? 0) > 0);
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function killOrLastHitForClass(
  result: DemoStageBattleResult,
  classId: ClassId,
): Partial<Record<ClassId, number>> {
  const counts: Partial<Record<ClassId, number>> = {};
  for (const death of result.enemyDeaths ?? []) {
    if (death.lastHitByAllyClassId !== classId) continue;
    counts[death.classId] = (counts[death.classId] ?? 0) + 1;
  }
  return counts;
}

function slotStatRow(
  result: DemoStageBattleResult,
  slotIndex: number,
): DemoStageBattleResult['classStats'][number] | undefined {
  return result.classStats.find((row) => row.slotIndex === slotIndex);
}

export function buildCh1_05SlotComparisonRow(
  partyLabel: string,
  slotIndex: number,
  slotClassId: ClassId,
  result: DemoStageBattleResult,
): Ch1_05SlotComparisonRow {
  const row = slotStatRow(result, slotIndex);
  const assassinReport =
    slotClassId === 'at_assassin'
      ? buildDemoAssassinRoleReport(STAGE_ID, partyLabel, toAssassinRoleReportInput(result))
      : null;
  const rangerReport =
    slotClassId === 'at_ranger'
      ? buildDemoRangerTargetReport(
          STAGE_ID,
          partyLabel,
          toRangerTargetReportInput(result),
        )
      : null;

  return {
    partyLabel,
    slotIndex,
    slotClassId,
    outcome: result.outcome,
    durationSec: result.durationSec,
    survivors: result.survivingAllies,
    remainingHp: result.totalRemainingHp,
    outcomeScore: demoStageOutcomeScore(result),
    slotDamageDealt: row?.damageDealt ?? 0,
    slotDamageByTarget: row?.damageByTarget ?? {},
    slotKillOrLastHit: row ? killOrLastHitForClass(result, row.classId) : {},
    assassinReport,
    rangerReport,
  };
}

export function buildCh1_05PuzzleQuadSnapshot(quad: {
  baseline: DemoStageBattleResult;
  badResult: DemoStageBattleResult;
  universalResult: DemoStageBattleResult;
  counterResult: DemoStageBattleResult;
}): Ch1_05PuzzleQuadSnapshot {
  const pick = (result: DemoStageBattleResult) => ({
    outcome: result.outcome,
    durationSec: result.durationSec,
    survivingAllies: result.survivingAllies,
    totalRemainingHp: result.totalRemainingHp,
  });

  return {
    baseline: pick(quad.baseline),
    bad: pick(quad.badResult),
    universal: pick(quad.universalResult),
    counter: pick(quad.counterResult),
    baselineScore: demoStageOutcomeScore(quad.baseline),
    badScore: demoStageOutcomeScore(quad.badResult),
    counterScore: demoStageOutcomeScore(quad.counterResult),
  };
}

function assassinExplainable(report: DemoAssassinRoleReport | null): boolean {
  if (!report) return false;
  const priorityOk =
    report.priorityTargetDamageShare !== null &&
    report.priorityTargetDamageShare >= 0.35;
  const lastHitOk = Object.keys(report.killOrLastHitTargetClassId).length > 0;
  const targetBandOk =
    report.primaryTargetClassId !== null &&
    ASSASSIN_PRIORITY_TARGET_CLASS_IDS.includes(report.primaryTargetClassId);
  return (
    report.roleVerdict === 'ROLE_OK' &&
    (priorityOk || lastHitOk || targetBandOk)
  );
}

export function buildCh1_05AssassinFormalizationSummary(input: {
  slotRows: Ch1_05SlotComparisonRow[];
  puzzleQuad: Ch1_05PuzzleQuadSnapshot;
}): Ch1_05AssassinFormalizationSummary {
  const { slotRows, puzzleQuad } = input;

  const spotlight = slotRows.find((row) => row.partyLabel === 'ranger-slot-assassin');
  const rangerBaseline = slotRows.find((row) => row.partyLabel === 'ranger-slot-baseline');
  const swordsmanSubstitute = slotRows.find(
    (row) => row.partyLabel === 'ranger-slot-swordsman',
  );
  const sorcererSubstitute = slotRows.find(
    (row) => row.partyLabel === 'ranger-slot-sorcerer',
  );

  const puzzleDefaultLoses = puzzleQuad.baseline.outcome === 'defeat';
  const puzzleCounterWins = puzzleQuad.counter.outcome === 'victory';
  const assassinSpotlightRoleOk = spotlight?.assassinReport?.roleVerdict === 'ROLE_OK';
  const assassinExplainableInLogs = assassinExplainable(spotlight?.assassinReport ?? null);

  const substituteRangerSlotWins =
    (rangerBaseline?.outcome === 'victory') ||
    (swordsmanSubstitute?.outcome === 'victory') ||
    (sorcererSubstitute?.outcome === 'victory');

  let verdict: Ch1_05AssassinFormalVerdict = 'INCONCLUSIVE';
  let reason = 'insufficient telemetry';
  let recommendation =
    're-run demoStageCh1_05AssassinFormalization.test.ts and inspect slot rows';

  if (!spotlight?.assassinReport) {
    verdict = 'INCONCLUSIVE';
    reason = 'ranger-slot-assassin row missing assassin report';
  } else if (!assassinSpotlightRoleOk) {
    verdict = 'ASSASSIN_ROLE_UNMET';
    reason = `assassin spotlight roleVerdict=${spotlight.assassinReport.roleVerdict ?? 'n/a'}`;
    recommendation =
      'ch1_05 is not ready as assassin showcase — priority band / last-hit not met in logs';
  } else if (puzzleDefaultLoses && spotlight.outcome === 'victory') {
    verdict = 'EXPERIENCE_SPOTLIGHT_CANDIDATE';
    reason =
      'baseline loses but assassin ranger-slot wins with ROLE_OK — puzzle-style assassin counter';
    recommendation =
      'formalize ch1_05 as assassin counter puzzle once baseline defeat is confirmed in data';
  } else if (!puzzleDefaultLoses && puzzleCounterWins && substituteRangerSlotWins) {
    verdict = 'EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK';
    reason =
      'baseline already wins; paladin is puzzle counter not assassin; ranger/swordsman/sorcerer also win ranger slot — assassin ROLE_OK is visible but not uniquely required';
    recommendation =
      'formalize ch1_05 as M1 assassin experience spotlight (編成ヒント), not mandatory assassin puzzle; defer class/stage numeric tweak';
  } else if (assassinExplainableInLogs) {
    verdict = 'EXPERIENCE_SPOTLIGHT_CANDIDATE';
    reason =
      'assassin ranger-slot shows execute band in logs (priority share / last-hit) even if outcome varies';
    recommendation =
      'accept ch1_05 as experience spotlight candidate; document that substitutes may also win';
  }

  if (
    !puzzleDefaultLoses &&
    puzzleQuad.baseline.outcome === 'victory' &&
    verdict !== 'ASSASSIN_ROLE_UNMET'
  ) {
    // Annotate: not a default-loses puzzle stage regardless of spotlight verdict.
    if (verdict === 'EXPERIENCE_SPOTLIGHT_CANDIDATE') {
      verdict = 'EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK';
      if (!reason.includes('baseline already wins')) {
        reason += '; baseline wins — not default-loses assassin counter puzzle';
      }
    }
  }

  return {
    stageId: STAGE_ID,
    verdict,
    puzzleDefaultLoses,
    puzzleCounterWins,
    assassinSpotlightRoleOk: assassinSpotlightRoleOk ?? false,
    assassinSpotlightOutcome: spotlight?.outcome ?? null,
    substituteRangerSlotWins,
    assassinExplainableInLogs,
    reason,
    recommendation,
    slotRows,
    puzzleQuad,
  };
}

export function logCh1_05SlotComparisonRow(row: Ch1_05SlotComparisonRow): void {
  console.info(
    `[demo-ch1_05-slot-comparison] ${row.partyLabel}: ` +
      `slot${row.slotIndex}=${row.slotClassId} outcome=${row.outcome} ` +
      `survivors=${row.survivors} remainingHp=${row.remainingHp} ` +
      `durationSec=${row.durationSec.toFixed(1)} score=${row.outcomeScore} ` +
      `slotDamageDealt=${row.slotDamageDealt} ` +
      `damageByTargetClassId={${formatRecord(row.slotDamageByTarget)}} ` +
      `killOrLastHitTargetClassId={${formatRecord(row.slotKillOrLastHit)}}`,
  );

  if (row.assassinReport) {
    const report = row.assassinReport;
    console.info(
      `[demo-ch1_05-slot-comparison]   assassin: ` +
        `roleVerdict=${report.roleVerdict} ` +
        `priorityTargetDamageShare=${report.priorityTargetDamageShare !== null ? `${(report.priorityTargetDamageShare * 100).toFixed(0)}%` : 'n/a'} ` +
        `killOrLastHit={${formatRecord(report.killOrLastHitTargetClassId)}} ` +
        `note=${report.note}`,
    );
  }

  if (row.rangerReport) {
    const report = row.rangerReport;
    console.info(
      `[demo-ch1_05-slot-comparison]   ranger: ` +
        `backlineDamageShare=${report.backlineDamageShare !== null ? `${(report.backlineDamageShare * 100).toFixed(0)}%` : 'n/a'} ` +
        `roleFulfilled=${report.roleFulfilled} ` +
        `killOrLastHit={${formatRecord(report.killOrLastHitTargetClassId)}}`,
    );
  }
}

export function logCh1_05PuzzleQuadSnapshot(snapshot: Ch1_05PuzzleQuadSnapshot): void {
  console.info(
    `[demo-ch1_05-puzzle-quad] baseline=${snapshot.baseline.outcome}(hp=${snapshot.baseline.totalRemainingHp}, score=${snapshot.baselineScore}) ` +
      `bad=${snapshot.bad.outcome}(hp=${snapshot.bad.totalRemainingHp}, score=${snapshot.badScore}) ` +
      `universal=${snapshot.universal.outcome}(hp=${snapshot.universal.totalRemainingHp}) ` +
      `counter=${snapshot.counter.outcome}(hp=${snapshot.counter.totalRemainingHp}, score=${snapshot.counterScore})`,
  );
  console.info(
    `[demo-ch1_05-puzzle-quad] read: defaultLoses=${snapshot.baseline.outcome === 'defeat'} ` +
      `counterWins=${snapshot.counter.outcome === 'victory'} ` +
      `existing puzzle counter=paladin (not assassin); bad=no-healer uses cleric slot assassin`,
  );
}

export function logCh1_05AssassinFormalizationVerdict(
  summary: Ch1_05AssassinFormalizationSummary,
): void {
  console.info(
    `[demo-ch1_05-assassin-formalization] verdict=${summary.verdict} ` +
      `puzzleDefaultLoses=${summary.puzzleDefaultLoses} puzzleCounterWins=${summary.puzzleCounterWins} ` +
      `assassinSpotlightRoleOk=${summary.assassinSpotlightRoleOk} ` +
      `assassinSpotlightOutcome=${summary.assassinSpotlightOutcome ?? 'n/a'} ` +
      `substituteRangerSlotWins=${summary.substituteRangerSlotWins} ` +
      `assassinExplainableInLogs=${summary.assassinExplainableInLogs}`,
  );
  console.info(`[demo-ch1_05-assassin-formalization] reason: ${summary.reason}`);
  console.info(
    `[demo-ch1_05-assassin-formalization] recommendation: ${summary.recommendation}`,
  );
}

export function logCh1_05AssassinFormalization(input: {
  slotRows: Ch1_05SlotComparisonRow[];
  puzzleQuad: Ch1_05PuzzleQuadSnapshot;
}): Ch1_05AssassinFormalizationSummary {
  for (const row of input.slotRows) {
    logCh1_05SlotComparisonRow(row);
  }
  logCh1_05PuzzleQuadSnapshot(input.puzzleQuad);
  const summary = buildCh1_05AssassinFormalizationSummary(input);
  logCh1_05AssassinFormalizationVerdict(summary);
  return summary;
}
