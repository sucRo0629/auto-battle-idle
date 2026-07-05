import { BattleEngine } from '../BattleEngine.ts';
import { getEffectiveAtk } from '../combatMath.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { createMemberFromClass } from '../../progression/partyCompose.ts';
import stagesDemoJson from '../../../data/stages-demo.json';
import {
  StageDamageStatsTracker,
  resolveDamageSourceKind,
  type DamageSourceKind,
} from '../stageDamageStats.ts';
import type {
  ActiveSkillDef,
  BattlePhase,
  ClassId,
  CombatantState,
  GameData,
  SaveGameState,
  SkillEffectDef,
  StageDef,
} from '../types.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
} from './battleFieldSpec.harness.ts';
import {
  logRangerBasicAttackDiagnostics,
  RangerBasicAttackDiagnosticTracker,
  RANGER_A2_SKILL_ID as RANGER_A2_DIAG_SKILL_ID,
  type RangerBasicAttackDiagnostics,
} from './rangerBasicAttackDiagnostic.ts';
import {
  buildDemoAssassinCoverageEntry,
  logDemoAssassinCoverageSummary,
  logDemoAssassinRoleReport,
  logDemoAssassinRoleReportsForResult,
  toAssassinRoleReportInput,
  type DemoAssassinCoverageEntry,
  type DemoAssassinRoleReport,
} from './assassinRoleReport.ts';
import {
  buildDemoClassCoverageEntry,
  logDemoClassCoverageSummary,
  logDemoRangerTargetReport,
  logDemoRangerTargetReportsForResult,
  toRangerTargetReportInput,
  type DemoClassCoverageEntry,
  type DemoEnemyDeathRecord,
  type DemoRangerTargetReport,
} from './rangerTargetReport.ts';

const RANGER_A2_SKILL_ID = RANGER_A2_DIAG_SKILL_ID;

export interface LoadedRangerA2EffectSummary {
  type: string;
  buffSubKind?: string;
  buffStat?: string | string[];
  buffMultiplier?: number | number[];
  buffDurationSec?: number;
  hitCountMultiplier?: number;
}

export interface LoadedRangerA2Definition {
  id: string;
  trigger: ActiveSkillDef['trigger'];
  effects: LoadedRangerA2EffectSummary[];
}

export interface RangerA2BasicHitRecord {
  battleSec: number;
  amount: number;
  hasA2AtkBuff: boolean;
  effectiveAtk: number;
}

export interface RangerA2BuffWindow {
  appliedSec: number;
  expiresSec: number;
}

export interface RangerA2BattleDiagnostics {
  loadedDefinition: LoadedRangerA2Definition | null;
  buffWindows: RangerA2BuffWindow[];
  basicHits: RangerA2BasicHitRecord[];
  basicActionsDuringBuff: number;
  basicDamageDuringBuff: number;
  basicActionsOutsideBuff: number;
  basicDamageOutsideBuff: number;
}

function summarizeRangerA2Effect(effect: SkillEffectDef): LoadedRangerA2EffectSummary {
  const summary: LoadedRangerA2EffectSummary = { type: effect.type };
  if ('buffSubKind' in effect && effect.buffSubKind !== undefined) {
    summary.buffSubKind = effect.buffSubKind;
  }
  if ('buffStat' in effect && effect.buffStat !== undefined) {
    summary.buffStat = effect.buffStat;
  }
  if ('buffMultiplier' in effect && effect.buffMultiplier !== undefined) {
    summary.buffMultiplier = effect.buffMultiplier;
  }
  if ('buffDurationSec' in effect && effect.buffDurationSec !== undefined) {
    summary.buffDurationSec = effect.buffDurationSec;
  }
  if ('hitCountMultiplier' in effect && effect.hitCountMultiplier !== undefined) {
    summary.hitCountMultiplier = effect.hitCountMultiplier;
  }
  return summary;
}

export function extractLoadedRangerA2Definition(
  gameData: GameData,
): LoadedRangerA2Definition | null {
  const skill = gameData.skillRegistry.actives[RANGER_A2_SKILL_ID];
  if (!skill) return null;
  return {
    id: skill.id,
    trigger: skill.trigger,
    effects: skill.effect.map(summarizeRangerA2Effect),
  };
}

function isAllyRanger(actor: CombatantState): boolean {
  return !actor.isEnemy && actor.classId === 'at_ranger';
}

function hasRangerA2AtkBuff(unit: CombatantState): boolean {
  return unit.statusEffects.some(
    (effect) =>
      effect.kind === 'buff' &&
      effect.stat === 'atk' &&
      effect.remainingSec > 0 &&
      effect.id.startsWith(`${RANGER_A2_SKILL_ID}_`),
  );
}

function resolveRangerA2BuffDurationSec(skill: ActiveSkillDef): number {
  for (const effect of skill.effect) {
    if (effect.type !== 'buff') continue;
    if ('buffStat' in effect && effect.buffStat === 'atk') {
      return effect.buffDurationSec ?? 0;
    }
  }
  return 0;
}

class RangerA2DiagnosticTracker {
  readonly buffWindows: RangerA2BuffWindow[] = [];
  readonly basicHits: RangerA2BasicHitRecord[] = [];
  basicActionsDuringBuff = 0;
  basicDamageDuringBuff = 0;
  basicActionsOutsideBuff = 0;
  basicDamageOutsideBuff = 0;

  constructor(private readonly buffDurationSec: number) {}

  recordActive2Use(actor: CombatantState, battleSec: number): void {
    if (!isAllyRanger(actor)) return;
    if (this.buffDurationSec <= 0) return;
    this.buffWindows.push({
      appliedSec: battleSec,
      expiresSec: battleSec + this.buffDurationSec,
    });
  }

  recordBasicAction(actor: CombatantState): void {
    if (!isAllyRanger(actor)) return;
    if (hasRangerA2AtkBuff(actor)) {
      this.basicActionsDuringBuff += 1;
    } else {
      this.basicActionsOutsideBuff += 1;
    }
  }

  recordBasicDamage(
    actor: CombatantState,
    amount: number,
    battleSec: number,
  ): void {
    if (!isAllyRanger(actor)) return;
    const hasBuff = hasRangerA2AtkBuff(actor);
    this.basicHits.push({
      battleSec,
      amount,
      hasA2AtkBuff: hasBuff,
      effectiveAtk: getEffectiveAtk(actor),
    });
    if (hasBuff) {
      this.basicDamageDuringBuff += amount;
    } else {
      this.basicDamageOutsideBuff += amount;
    }
  }

  snapshot(loadedDefinition: LoadedRangerA2Definition | null): RangerA2BattleDiagnostics {
    return {
      loadedDefinition,
      buffWindows: [...this.buffWindows],
      basicHits: [...this.basicHits],
      basicActionsDuringBuff: this.basicActionsDuringBuff,
      basicDamageDuringBuff: this.basicDamageDuringBuff,
      basicActionsOutsideBuff: this.basicActionsOutsideBuff,
      basicDamageOutsideBuff: this.basicDamageOutsideBuff,
    };
  }
}

function createRangerA2DiagnosticTracker(
  gameData: GameData,
): RangerA2DiagnosticTracker | null {
  const skill = gameData.skillRegistry.actives[RANGER_A2_SKILL_ID];
  if (!skill) return null;
  return new RangerA2DiagnosticTracker(resolveRangerA2BuffDurationSec(skill));
}

export function logLoadedRangerA2Definition(gameData: GameData): void {
  const loaded = extractLoadedRangerA2Definition(gameData);
  console.info(
    `[ranger-a2-diag] loadedRangerA2Definition=${JSON.stringify(loaded)}`,
  );
}

export function logRangerA2BattleDiagnostics(
  stageId: string,
  label: string,
  diagnostics: RangerA2BattleDiagnostics | undefined,
): void {
  if (!diagnostics) {
    console.info(
      `[ranger-a2-diag] ${stageId}/${label}: ranger A2 diagnostics unavailable`,
    );
    return;
  }

  const buffTimeline = diagnostics.buffWindows
    .map(
      (window) =>
        `applied@${window.appliedSec.toFixed(1)}→expires@${window.expiresSec.toFixed(1)}`,
    )
    .join('; ');
  const buffUptimeSec = diagnostics.buffWindows.reduce(
    (sum, window) => sum + (window.expiresSec - window.appliedSec),
    0,
  );
  const hitLines = diagnostics.basicHits.map(
    (hit) =>
      `@${hit.battleSec.toFixed(1)} amount=${hit.amount} ` +
      `hasA2AtkBuff=${hit.hasA2AtkBuff} effectiveAtk=${hit.effectiveAtk}`,
  );

  console.info(
    `[ranger-a2-diag] ${stageId}/${label} loadedRangerA2Definition=${JSON.stringify(diagnostics.loadedDefinition)}`,
  );
  console.info(
    `[ranger-a2-diag] ${stageId}/${label} active_2 buff timeline: ${buffTimeline || 'none'}`,
  );
  console.info(
    `[ranger-a2-diag] ${stageId}/${label} active_2 buff uptimeSec=${buffUptimeSec.toFixed(1)} ` +
      `windows=${diagnostics.buffWindows.length}`,
  );
  console.info(
    `[ranger-a2-diag] ${stageId}/${label} basic during buff: ` +
      `basicActionCount=${diagnostics.basicActionsDuringBuff} ` +
      `basicDamage=${diagnostics.basicDamageDuringBuff}`,
  );
  console.info(
    `[ranger-a2-diag] ${stageId}/${label} basic outside buff: ` +
      `basicActionCount=${diagnostics.basicActionsOutsideBuff} ` +
      `basicDamage=${diagnostics.basicDamageOutsideBuff}`,
  );
  console.info(
    `[ranger-a2-diag] ${stageId}/${label} basic damage hits (${diagnostics.basicHits.length}):`,
  );
  for (const line of hitLines) {
    console.info(`[ranger-a2-diag]   ${line}`);
  }
}

export const DEMO_STAGE_IDS = [
  'demo_ch1_01',
  'demo_ch1_02',
  'demo_ch1_03',
  'demo_ch1_04',
  'demo_ch1_05',
  'demo_ch1_06',
  'demo_ch1_07',
] as const;

export type DemoStageId = (typeof DEMO_STAGE_IDS)[number];

export type DemoStageBattleOutcome = 'victory' | 'defeat' | 'timeout';

export interface DemoStageClassStatRow {
  slotIndex: number;
  classId: ClassId;
  damageDealt: number;
  damageTaken: number;
  healingDealt: number;
  attackCount: number;
  hitCount: number;
  skillUseCount: number;
  averageDamagePerHit: number;
  indexedDamageHits: number;
  damageByTarget: Partial<Record<ClassId, number>>;
  basicActionCount: number;
  basicDamageHitCount: number;
  activeSkillUseCountBySkillId: Record<string, number>;
  activeDamageHitCountBySkillId: Record<string, number>;
  damageBySkillId: Record<string, number>;
  damageBySourceKind: Partial<Record<DamageSourceKind, number>>;
  hitCountBySourceKind: Partial<Record<DamageSourceKind, number>>;
  dotDamageHitCount: number;
  dotDamageByStatusId: Record<string, number>;
  dotHitCountByStatusId: Record<string, number>;
  unknownDamageHitCount: number;
  firstBasicActionSec?: number;
  lastBasicActionSec?: number;
  basicActionTimelineSec: number[];
  activeUseTimelineBySkillId: Record<string, number[]>;
  firstActiveUseSecBySkillId: Record<string, number>;
  lastActiveUseSecBySkillId: Record<string, number>;
  deathSec?: number;
  lastDamageDealtSec?: number;
  damageTimelineBySourceKind: Partial<Record<DamageSourceKind, number[]>>;
}

export interface DemoStageBattleResult {
  stageId: string;
  outcome: DemoStageBattleOutcome;
  phase: BattlePhase;
  tickCount: number;
  durationSec: number;
  survivingAllies: number;
  totalRemainingHp: number;
  totalMaxHp: number;
  classStats: DemoStageClassStatRow[];
  rangerA2Diagnostics?: RangerA2BattleDiagnostics;
  rangerBasicAttackDiagnostics?: RangerBasicAttackDiagnostics;
  enemyDeaths?: DemoEnemyDeathRecord[];
  rangerUnitId?: string | null;
  assassinUnitId?: string | null;
}

const levelCurves = loadLevelCurves(levelCurvesJson);

export function createDemoStageGameData(): GameData {
  const gameData = structuredClone(loadGameData());
  gameData.stages = stagesDemoJson as StageDef[];
  return gameData;
}

export function createStandardDemoSave(
  gameData: GameData,
  stageId: string,
): SaveGameState {
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = stageId;
  return save;
}

export function runDemoStageBattle(
  stageId: string,
  options?: {
    gameData?: GameData;
    configureSave?: (save: SaveGameState, gameData: GameData) => void;
    maxTicks?: number;
    /** demo_ch1_06 Ranger basic attack delay diagnosis */
    enableRangerBasicAttackDiagnostics?: boolean;
    /** Emit [demo-ranger-target-report] after battle when at_ranger is in party */
    enableRangerTargetReport?: boolean;
  },
): DemoStageBattleResult {
  const gameData = options?.gameData ?? createDemoStageGameData();
  const save = createStandardDemoSave(gameData, stageId);
  options?.configureSave?.(save, gameData);

  const stageDamageStats = new StageDamageStatsTracker();
  stageDamageStats.resetForStage(stageId);
  const loadedRangerA2Definition = extractLoadedRangerA2Definition(gameData);
  const rangerA2Tracker = createRangerA2DiagnosticTracker(gameData);
  const rangerBasicTracker = options?.enableRangerBasicAttackDiagnostics
    ? new RangerBasicAttackDiagnosticTracker()
    : null;
  const enemyLastHitByAllyClass = new Map<string, ClassId>();
  const enemyDeaths: DemoEnemyDeathRecord[] = [];

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
    {
      onDamageApplied: (actor, target, amount, meta) => {
        const battleSec = engine.getBattleTimeSec();
        if (
          actor &&
          !actor.isEnemy &&
          target.isEnemy &&
          actor.classId
        ) {
          enemyLastHitByAllyClass.set(target.id, actor.classId);
        }
        stageDamageStats.recordDamage(
          actor,
          target,
          amount,
          meta,
          battleSec,
        );
        if (
          rangerA2Tracker &&
          meta?.slotKind === 'basic' &&
          resolveDamageSourceKind(meta) === 'basic'
        ) {
          rangerA2Tracker.recordBasicDamage(actor, amount, battleSec);
        }
      },
      onHealRecorded: (actor, _target, amount) => {
        stageDamageStats.recordHeal(actor, amount);
      },
      onCombatActionExecuted: (actor, info) => {
        const battleSec = engine.getBattleTimeSec();
        if (info.slotKind === 'basic') {
          stageDamageStats.recordBasicAttack(actor, battleSec);
          rangerA2Tracker?.recordBasicAction(actor);
          if (
            rangerBasicTracker &&
            !actor.isEnemy &&
            actor.classId === 'at_ranger'
          ) {
            rangerBasicTracker.recordBasicAction(battleSec);
          }
        } else {
          stageDamageStats.recordActiveSkillUse(actor, info.skillId, battleSec);
          if (info.skillId === RANGER_A2_SKILL_ID) {
            rangerA2Tracker?.recordActive2Use(actor, battleSec);
          }
          if (
            rangerBasicTracker &&
            info.skillId === RANGER_A2_SKILL_ID &&
            !actor.isEnemy &&
            actor.classId === 'at_ranger'
          ) {
            const internal = asBattleEngineInternals(engine);
            rangerBasicTracker.recordActive2Use(
              actor,
              internal.players,
              internal.enemies,
              gameData,
              battleSec,
            );
          }
        }
      },
    },
  );

  engine.onEvent((event) => {
    if (event.type === 'death') {
      const snap = engine.getSnapshot();
      const unit = [...snap.allies, ...snap.enemies].find(
        (combatant) => combatant.id === event.targetId,
      );
      const deathSec = engine.getBattleTimeSec();
      if (
        unit &&
        !unit.isEnemy &&
        unit.partySlotIndex !== undefined &&
        unit.classId
      ) {
        stageDamageStats.recordAllyDeath(
          unit.partySlotIndex,
          unit.classId,
          deathSec,
        );
      } else if (unit?.isEnemy && unit.classId) {
        enemyDeaths.push({
          unitId: unit.id,
          classId: unit.classId,
          deathSec,
          lastHitByAllyClassId: enemyLastHitByAllyClass.get(unit.id),
        });
      }
      return;
    }

    if (event.type !== 'skill' || event.effect !== 'damage') return;
    if (event.hitIndex === undefined) return;
    const snap = engine.getSnapshot();
    const actor = [...snap.allies, ...snap.enemies].find(
      (unit) => unit.id === event.actorId,
    );
    if (
      !actor ||
      actor.isEnemy ||
      actor.partySlotIndex === undefined ||
      !actor.classId
    ) {
      return;
    }
    stageDamageStats.recordIndexedDamageHitForSlot(
      actor.partySlotIndex,
      actor.classId,
    );
  });
  engine.startBattle();

  const maxTicks = options?.maxTicks ?? 120_000;
  let tickCount = 0;
  let phase: BattlePhase = 'running';

  for (; tickCount < maxTicks; tickCount++) {
    engine.tick(TICK_DT);
    if (rangerBasicTracker) {
      const snap = engine.getSnapshot();
      rangerBasicTracker.recordTick(
        asBattleEngineInternals(engine),
        engine.getBattleTimeSec(),
        snap.engaged,
      );
    }
    phase = engine.getSnapshot().phase;
    if (phase === 'victory' || phase === 'defeat') break;
  }

  const snap = engine.getSnapshot();
  const allies = snap.allies.filter((a) => a.hp > 0);
  const rangerUnit = snap.allies.find((a) => a.classId === 'at_ranger');
  const assassinUnit = snap.allies.find((a) => a.classId === 'at_assassin');
  const totalRemainingHp = allies.reduce((sum, a) => sum + a.hp, 0);
  const totalMaxHp = snap.allies.reduce((sum, a) => sum + a.maxHp, 0);

  const classStats: DemoStageClassStatRow[] = stageDamageStats
    .getDisplayRows(save.party, gameData.classRegistry)
    .map((row) => ({
      slotIndex: row.slotIndex,
      classId: row.classId,
      damageDealt: row.damageDealt,
      damageTaken: row.damageTaken,
      healingDealt: row.healingDealt,
      attackCount: row.attackCount,
      hitCount: row.hitCount,
      skillUseCount: row.skillUseCount,
      averageDamagePerHit: row.averageDamagePerHit,
      indexedDamageHits: row.indexedDamageHits,
      damageByTarget: row.damageByTarget,
      basicActionCount: row.basicActionCount,
      basicDamageHitCount: row.basicDamageHitCount,
      activeSkillUseCountBySkillId: row.activeSkillUseCountBySkillId,
      activeDamageHitCountBySkillId: row.activeDamageHitCountBySkillId,
      damageBySkillId: row.damageBySkillId,
      damageBySourceKind: row.damageBySourceKind,
      hitCountBySourceKind: row.hitCountBySourceKind,
      dotDamageHitCount: row.dotDamageHitCount,
      dotDamageByStatusId: row.dotDamageByStatusId,
      dotHitCountByStatusId: row.dotHitCountByStatusId,
      unknownDamageHitCount: row.unknownDamageHitCount,
      firstBasicActionSec: row.firstBasicActionSec,
      lastBasicActionSec: row.lastBasicActionSec,
      basicActionTimelineSec: row.basicActionTimelineSec,
      activeUseTimelineBySkillId: row.activeUseTimelineBySkillId,
      firstActiveUseSecBySkillId: row.firstActiveUseSecBySkillId,
      lastActiveUseSecBySkillId: row.lastActiveUseSecBySkillId,
      deathSec: row.deathSec,
      lastDamageDealtSec: row.lastDamageDealtSec,
      damageTimelineBySourceKind: row.damageTimelineBySourceKind,
    }));

  const battleResult: DemoStageBattleResult = {
    stageId,
    outcome:
      phase === 'victory'
        ? 'victory'
        : phase === 'defeat'
          ? 'defeat'
          : 'timeout',
    phase,
    tickCount: tickCount + 1,
    durationSec: (tickCount + 1) * TICK_DT,
    survivingAllies: allies.length,
    totalRemainingHp,
    totalMaxHp,
    classStats,
    rangerA2Diagnostics: rangerA2Tracker?.snapshot(loadedRangerA2Definition),
    rangerBasicAttackDiagnostics: rangerBasicTracker?.snapshot(),
    enemyDeaths: [...enemyDeaths],
    rangerUnitId: rangerUnit?.id ?? null,
    assassinUnitId: assassinUnit?.id ?? null,
  };

  if (options?.enableRangerTargetReport) {
    logDemoRangerTargetReportsForResult(
      stageId,
      'battle',
      toRangerTargetReportInput(battleResult),
      gameData,
    );
  }

  return battleResult;
}

export { logRangerBasicAttackDiagnostics };

export {
  buildDemoAssassinCoverageEntry,
  buildDemoAssassinRoleReport,
  logDemoAssassinCoverageSummary,
  logDemoAssassinRoleReport,
  toAssassinRoleReportInput,
  type DemoAssassinCoverageEntry,
  type DemoAssassinRoleReport,
} from './assassinRoleReport.ts';

export {
  buildDemoClassCoverageEntry,
  buildDemoRangerTargetReport,
  logDemoClassCoverageSummary,
  logDemoRangerTargetReport,
  toRangerTargetReportInput,
  type DemoClassCoverageEntry,
  type DemoEnemyDeathRecord,
  type DemoRangerTargetReport,
} from './rangerTargetReport.ts';

/** Emit [demo-ranger-target-report] + class coverage for baseline/bad/universal/counter. */
export function logDemoRangerTargetReportsForQuad(
  stageId: string,
  quad: DemoStageQuadResults,
  gameData?: GameData,
): DemoClassCoverageEntry[] {
  const labels: Array<[string, DemoStageBattleResult]> = [
    ['baseline', quad.baseline],
    ['bad', quad.badResult],
    ['universal', quad.universalResult],
    ['counter', quad.counterResult],
  ];
  const entries = labels.map(([label, result]) =>
    buildDemoClassCoverageEntry(
      stageId,
      label,
      toRangerTargetReportInput(result),
      gameData,
    ),
  );
  for (const entry of entries) {
    if (entry.report) {
      logDemoRangerTargetReport(entry.report);
    }
  }
  logDemoClassCoverageSummary(entries);
  return entries;
}

/** Emit [demo-assassin-role-report] + coverage summary for baseline/bad/universal/counter. */
export function logDemoAssassinRoleReportsForQuad(
  stageId: string,
  quad: DemoStageQuadResults,
): DemoAssassinCoverageEntry[] {
  const labels: Array<[string, DemoStageBattleResult]> = [
    ['baseline', quad.baseline],
    ['bad', quad.badResult],
    ['universal', quad.universalResult],
    ['counter', quad.counterResult],
  ];
  const entries = labels.map(([label, result]) =>
    buildDemoAssassinCoverageEntry(
      stageId,
      label,
      toAssassinRoleReportInput(result),
    ),
  );
  for (const entry of entries) {
    if (entry.report) {
      logDemoAssassinRoleReport(entry.report);
    }
  }
  logDemoAssassinCoverageSummary(entries);
  return entries;
}

/** Emit reports for arbitrary labeled battle results (diagnostic-only compositions). */
export function logDemoAssassinRoleReportsForRuns(
  stageId: string,
  runs: Array<{ partyLabel: string; result: DemoStageBattleResult }>,
): DemoAssassinCoverageEntry[] {
  const entries = runs.map(({ partyLabel, result }) =>
    buildDemoAssassinCoverageEntry(
      stageId,
      partyLabel,
      toAssassinRoleReportInput(result),
    ),
  );
  for (const entry of entries) {
    if (entry.report) {
      logDemoAssassinRoleReport(entry.report);
    }
  }
  logDemoAssassinCoverageSummary(entries);
  return entries;
}

export type DemoStageClassStatField =
  | 'damageDealt'
  | 'damageTaken'
  | 'healingDealt';

export function statForClass(
  classStats: DemoStageClassStatRow[],
  classId: ClassId,
  field: DemoStageClassStatField,
): number {
  return classStats.find((row) => row.classId === classId)?.[field] ?? 0;
}

export function classStatRow(
  classStats: DemoStageClassStatRow[],
  classId: ClassId,
): DemoStageClassStatRow | undefined {
  return classStats.find((row) => row.classId === classId);
}

export function formatDamageByTarget(
  damageByTarget: Partial<Record<ClassId, number>>,
): string {
  const entries = Object.entries(damageByTarget).filter(
    ([, amount]) => (amount ?? 0) > 0,
  );
  if (entries.length === 0) return 'none';
  return entries
    .map(([targetClassId, amount]) => `${targetClassId}=${amount}`)
    .join(', ');
}

export function formatRecordMap(
  record: Record<string, number> | Partial<Record<string, number>>,
): string {
  const entries = Object.entries(record).filter(
    ([, amount]) => (amount ?? 0) > 0,
  );
  if (entries.length === 0) return 'none';
  return entries.map(([key, amount]) => `${key}=${amount}`).join(', ');
}

export function formatSourceKindMap(
  record: Partial<Record<DamageSourceKind, number>>,
): string {
  const entries = Object.entries(record).filter(
    ([, amount]) => (amount ?? 0) > 0,
  );
  if (entries.length === 0) return 'none';
  return entries.map(([key, amount]) => `${key}=${amount}`).join(', ');
}

export function formatTimelineSec(values: number[] | undefined): string {
  if (!values || values.length === 0) return 'none';
  return values.map((sec) => sec.toFixed(1)).join(',');
}

export function formatTimelineBySkillId(
  record: Record<string, number[]> | undefined,
): string {
  if (!record) return 'none';
  const entries = Object.entries(record).filter(
    ([, timeline]) => (timeline?.length ?? 0) > 0,
  );
  if (entries.length === 0) return 'none';
  return entries
    .map(([skillId, timeline]) => `${skillId}=[${formatTimelineSec(timeline)}]`)
    .join('; ');
}

export function formatOptionalSec(value: number | undefined): string {
  return value === undefined ? 'omitted' : value.toFixed(1);
}

export function logAttackerActionTimelineDiagnostics(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
  classId: ClassId,
): void {
  const row = classStatRow(result.classStats, classId);
  if (!row) {
    console.info(
      `[demo-action-timeline] ${stageId}/${label}: ${classId} not in party`,
    );
    return;
  }

  console.info(
    `[demo-action-timeline] ${stageId}/${label} ${classId}: ` +
      `basicActionCount=${row.basicActionCount} ` +
      `firstBasicActionSec=${formatOptionalSec(row.firstBasicActionSec)} ` +
      `lastBasicActionSec=${formatOptionalSec(row.lastBasicActionSec)} ` +
      `basicActionTimelineSec=[${formatTimelineSec(row.basicActionTimelineSec)}] ` +
      `activeUseTimelineBySkillId={${formatTimelineBySkillId(row.activeUseTimelineBySkillId)}} ` +
      `deathSec=${formatOptionalSec(row.deathSec)} ` +
      `lastDamageDealtSec=${formatOptionalSec(row.lastDamageDealtSec)}`,
  );
}

export function logAttackerSourceKindDiagnostics(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
  classId: ClassId,
  options?: { includeDotBreakdown?: boolean },
): void {
  const row = classStatRow(result.classStats, classId);
  if (!row) {
    console.info(
      `[demo-combat-diag] ${stageId}/${label}: ${classId} not in party`,
    );
    return;
  }

  const parts = [
    `damageDealt=${row.damageDealt}`,
    `basicActionCount=${row.basicActionCount}`,
    `basicDamageHitCount=${row.basicDamageHitCount}`,
    `activeSkillUseCountBySkillId={${formatRecordMap(row.activeSkillUseCountBySkillId)}}`,
    `activeDamageHitCountBySkillId={${formatRecordMap(row.activeDamageHitCountBySkillId)}}`,
    `damageBySkillId={${formatRecordMap(row.damageBySkillId)}}`,
    `damageBySourceKind={${formatSourceKindMap(row.damageBySourceKind)}}`,
    `hitCountBySourceKind={${formatSourceKindMap(row.hitCountBySourceKind)}}`,
    `unknownDamageHitCount=${row.unknownDamageHitCount}`,
  ];

  if (options?.includeDotBreakdown) {
    parts.push(`dotDamageHitCount=${row.dotDamageHitCount}`);
    parts.push(
      `dotDamageByStatusId={${formatRecordMap(row.dotDamageByStatusId)}}`,
    );
    parts.push(
      `dotHitCountByStatusId={${formatRecordMap(row.dotHitCountByStatusId)}}`,
    );
  }

  console.info(
    `[demo-combat-diag] ${stageId}/${label} ${classId}: ${parts.join(' ')}`,
  );
}

export function logAttackerCombatDiagnostics(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
  classId: ClassId,
): void {
  const row = classStatRow(result.classStats, classId);
  if (!row) {
    console.info(
      `[demo-combat-diag] ${stageId}/${label}: ${classId} not in party`,
    );
    return;
  }

  console.info(
    `[demo-combat-diag] ${stageId}/${label} ${classId}: ` +
      `damageDealt=${row.damageDealt} ` +
      `attackCount=${row.attackCount} ` +
      `hitCount=${row.hitCount} ` +
      `skillUseCount=${row.skillUseCount} ` +
      `averageDamagePerHit=${row.averageDamagePerHit.toFixed(2)} ` +
      `indexedDamageHits=${row.indexedDamageHits} ` +
      `damageByTarget={${formatDamageByTarget(row.damageByTarget)}}`,
  );
}

export function logDemoCh1_06RangerSorcererDiagnostics(
  baseline: DemoStageBattleResult,
  universal: DemoStageBattleResult,
  counter: DemoStageBattleResult,
): void {
  const stageId = 'demo_ch1_06';
  console.info(`[demo-combat-diag] ${stageId} attacker source-kind breakdown`);
  logAttackerSourceKindDiagnostics(stageId, 'baseline', baseline, 'at_ranger');
  logAttackerSourceKindDiagnostics(
    stageId,
    'universal',
    universal,
    'at_sorcerer',
    { includeDotBreakdown: true },
  );
  logAttackerSourceKindDiagnostics(stageId, 'counter', counter, 'at_ranger');

  console.info(`[demo-action-timeline] ${stageId} attacker action timeline`);
  logAttackerActionTimelineDiagnostics(stageId, 'baseline', baseline, 'at_ranger');
  logAttackerActionTimelineDiagnostics(stageId, 'counter', counter, 'at_ranger');
  logAttackerActionTimelineDiagnostics(
    stageId,
    'universal',
    universal,
    'at_sorcerer',
  );

  console.info(`[demo-combat-diag] ${stageId} attacker workload summary (legacy)`);
  logAttackerCombatDiagnostics(stageId, 'baseline', baseline, 'at_ranger');
  logAttackerCombatDiagnostics(stageId, 'universal', universal, 'at_sorcerer');
  logAttackerCombatDiagnostics(stageId, 'counter', counter, 'at_ranger');
}

export interface DemoStageQuadResults {
  baseline: DemoStageBattleResult;
  badResult: DemoStageBattleResult;
  universalResult: DemoStageBattleResult;
  counterResult: DemoStageBattleResult;
}

/** Front-liner classId in party stats (guardian or paladin slot). */
export function resolveFrontlinerClassId(
  classStats: DemoStageClassStatRow[],
): ClassId | undefined {
  for (const id of ['df_guardian', 'df_paladin'] as const) {
    if (classStats.some((row) => row.classId === id)) {
      return id;
    }
  }
  return classStats[0]?.classId;
}

/** Phase 6c — per-composition metrics for balance triage (no data changes). */
export function logDemoStageCompositionReport(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
): void {
  const frontlinerId = resolveFrontlinerClassId(result.classStats);
  const frontlinerTaken = frontlinerId
    ? statForClass(result.classStats, frontlinerId, 'damageTaken')
    : 0;

  console.info(
    `[demo-6c-report] ${stageId}/${label}: ` +
      `outcome=${result.outcome} ` +
      `survivors=${result.survivingAllies} ` +
      `remainingHp=${result.totalRemainingHp}/${result.totalMaxHp} ` +
      `durationSec=${result.durationSec.toFixed(1)} ` +
      `score=${demoStageOutcomeScore(result)}`,
  );

  for (const row of result.classStats) {
    console.info(
      `[demo-6c-report]   ${row.classId}: ` +
        `damageDealt=${row.damageDealt} ` +
        `damageTaken=${row.damageTaken} ` +
        `healingDealt=${row.healingDealt} ` +
        `basicActionCount=${row.basicActionCount} ` +
        `activeSkillUseCountBySkillId={${formatRecordMap(row.activeSkillUseCountBySkillId)}}`,
    );
  }

  console.info(
    `[demo-6c-report]   frontliner(${frontlinerId ?? 'none'}): damageTaken=${frontlinerTaken}`,
  );
}

/** Phase 6c — baseline / bad / universal / counter side-by-side reports. */
export function logDemoStageQuadCompositionReports(
  stageId: string,
  quad: DemoStageQuadResults,
): void {
  console.info(
    `[demo-6c-quad] ${stageId}: baseline / bad / universal / counter comparison`,
  );
  logDemoStageCompositionReport(stageId, 'baseline', quad.baseline);
  logDemoStageCompositionReport(stageId, 'bad', quad.badResult);
  logDemoStageCompositionReport(stageId, 'universal', quad.universalResult);
  logDemoStageCompositionReport(stageId, 'counter', quad.counterResult);

  console.info(
    `[demo-6c-quad] ${stageId} summary: ` +
      `baseline=${quad.baseline.outcome}(hp=${quad.baseline.totalRemainingHp}) ` +
      `bad=${quad.badResult.outcome}(hp=${quad.badResult.totalRemainingHp}) ` +
      `universal=${quad.universalResult.outcome}(hp=${quad.universalResult.totalRemainingHp}) ` +
      `counter=${quad.counterResult.outcome}(hp=${quad.counterResult.totalRemainingHp})`,
  );
}

export function logDemoStageClassDiagnostics(
  stageId: string,
  label: string,
  result: DemoStageBattleResult,
): void {
  console.info(
    `[demo-puzzle-stats] ${stageId}/${label}: ${result.outcome} ` +
      `durationSec=${result.durationSec.toFixed(1)} ` +
      `survivors=${result.survivingAllies} ` +
      `remainingHp=${result.totalRemainingHp}`,
  );
  for (const row of result.classStats) {
    console.info(
      `[demo-puzzle-stats]   ${row.classId}: ` +
        `damageDealt=${row.damageDealt} ` +
        `attackCount=${row.attackCount} ` +
        `hitCount=${row.hitCount} ` +
        `skillUseCount=${row.skillUseCount} ` +
        `averageDamagePerHit=${row.averageDamagePerHit.toFixed(2)} ` +
        `damageTaken=${row.damageTaken} ` +
        `healingDealt=${row.healingDealt}`,
    );
  }
}

export function logRangerSorcererComparison(
  stageId: string,
  baseline: DemoStageBattleResult,
  universal: DemoStageBattleResult,
): void {
  const rangerDealt = statForClass(baseline.classStats, 'at_ranger', 'damageDealt');
  const sorcererDealt = statForClass(
    universal.classStats,
    'at_sorcerer',
    'damageDealt',
  );
  const delta = sorcererDealt - rangerDealt;
  const ratio =
    rangerDealt > 0 ? ((sorcererDealt / rangerDealt) * 100).toFixed(0) : 'n/a';

  console.info(
    `[demo-puzzle-compare] ${stageId} at_ranger(baseline) vs at_sorcerer(universal):`,
  );
  console.info(
    `[demo-puzzle-compare]   ranger: damageDealt=${rangerDealt} ` +
      `outcome=${baseline.outcome} durationSec=${baseline.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-puzzle-compare]   sorcerer: damageDealt=${sorcererDealt} ` +
      `outcome=${universal.outcome} durationSec=${universal.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-puzzle-compare]   delta=${delta >= 0 ? '+' : ''}${delta} (${ratio}% of ranger)`,
  );
}

/** Phase 6c — demo_ch1_04 healer puzzle ripple after Ranger contact-cap fix. */
export function logDemoCh1_04HealerPuzzleDiagnostics(
  quad: DemoStageQuadResults,
): void {
  const stageId = 'demo_ch1_04';
  const withHealer = quad.baseline;
  const withoutHealer = quad.badResult;

  console.info(
    `[demo-ch1_04-diag] ${stageId} healer puzzle ripple (Ranger contact-cap fix):`,
  );
  console.info(
    `[demo-ch1_04-diag]   withHealer(baseline): ${withHealer.outcome} ` +
      `score=${demoStageOutcomeScore(withHealer)} ` +
      `remainingHp=${withHealer.totalRemainingHp}/${withHealer.totalMaxHp} ` +
      `durationSec=${withHealer.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-ch1_04-diag]   noHealer(bad): ${withoutHealer.outcome} ` +
      `score=${demoStageOutcomeScore(withoutHealer)} ` +
      `remainingHp=${withoutHealer.totalRemainingHp}/${withoutHealer.totalMaxHp} ` +
      `durationSec=${withoutHealer.durationSec.toFixed(1)}`,
  );

  for (const [label, result] of [
    ['withHealer', withHealer],
    ['noHealer', withoutHealer],
  ] as const) {
    const ranger = classStatRow(result.classStats, 'at_ranger');
    const cleric = classStatRow(result.classStats, 'sp_cleric');
    const guardian = classStatRow(result.classStats, 'df_guardian');
    console.info(
      `[demo-ch1_04-diag]   ${label} at_ranger: ` +
        `damageDealt=${ranger?.damageDealt ?? 0} ` +
        `basicActionCount=${ranger?.basicActionCount ?? 0} ` +
        `firstBasicSec=${formatOptionalSec(ranger?.firstBasicActionSec)}`,
    );
    console.info(
      `[demo-ch1_04-diag]   ${label} sp_cleric: healingDealt=${cleric?.healingDealt ?? 0}`,
    );
    console.info(
      `[demo-ch1_04-diag]   ${label} df_guardian: damageTaken=${guardian?.damageTaken ?? 0}`,
    );
  }

  const rangerDelta =
    statForClass(withoutHealer.classStats, 'at_ranger', 'damageDealt') -
    statForClass(withHealer.classStats, 'at_ranger', 'damageDealt');
  const clericHeal = statForClass(withHealer.classStats, 'sp_cleric', 'healingDealt');
  const durationDelta = withoutHealer.durationSec - withHealer.durationSec;
  const guardianTakenDelta =
    statForClass(withoutHealer.classStats, 'df_guardian', 'damageTaken') -
    statForClass(withHealer.classStats, 'df_guardian', 'damageTaken');

  console.info(
    `[demo-ch1_04-diag]   duration delta (noHealer - withHealer)=${durationDelta >= 0 ? '+' : ''}${durationDelta.toFixed(1)}s; ` +
      `guardian damageTaken delta=${guardianTakenDelta >= 0 ? '+' : ''}${guardianTakenDelta}`,
  );
  console.info(
    `[demo-ch1_04-diag]   ranger damage delta (noHealer - withHealer)=${rangerDelta >= 0 ? '+' : ''}${rangerDelta}; ` +
      `cleric healingDealt=${clericHeal}. ` +
      `Healer puzzle: cleric sustain (${clericHeal}) offsets guardian pressure (taken delta ${guardianTakenDelta}).`,
  );
  console.info(
    `[demo-ch1_04-diag]   universal=${quad.universalResult.outcome}(hp=${quad.universalResult.totalRemainingHp}, ` +
      `durationSec=${quad.universalResult.durationSec.toFixed(1)}); ` +
      `counter=${quad.counterResult.outcome}(hp=${quad.counterResult.totalRemainingHp})`,
  );
}

/** Phase 6c — demo_ch1_05 bad outcome score ≥ baseline (assassin swap ripple). */
export function logDemoCh1_05BadBaselineDiagnostics(
  quad: DemoStageQuadResults,
): void {
  const stageId = 'demo_ch1_05';
  const { baseline, badResult, universalResult, counterResult } = quad;

  const baselineScore = demoStageOutcomeScore(baseline);
  const badScore = demoStageOutcomeScore(badResult);
  const durationDelta = badResult.durationSec - baseline.durationSec;
  const assassinDealt = statForClass(badResult.classStats, 'at_assassin', 'damageDealt');
  const clericHeal = statForClass(baseline.classStats, 'sp_cleric', 'healingDealt');
  const guardianBaselineTaken = statForClass(
    baseline.classStats,
    'df_guardian',
    'damageTaken',
  );
  const guardianBadTaken = statForClass(
    badResult.classStats,
    'df_guardian',
    'damageTaken',
  );
  const rangerBaselineDealt = statForClass(
    baseline.classStats,
    'at_ranger',
    'damageDealt',
  );
  const rangerBadDealt = statForClass(badResult.classStats, 'at_ranger', 'damageDealt');

  console.info(
    `[demo-ch1_05-diag] ${stageId} bad vs baseline ripple (puzzle test skipBadVsBaseline=true):`,
  );
  console.info(
    `[demo-ch1_05-diag]   outcome score: baseline=${baselineScore} bad=${badScore} ` +
      `(delta=${badScore - baselineScore >= 0 ? '+' : ''}${badScore - baselineScore})`,
  );
  console.info(
    `[demo-ch1_05-diag]   durationSec: baseline=${baseline.durationSec.toFixed(1)} ` +
      `bad=${badResult.durationSec.toFixed(1)} delta=${durationDelta >= 0 ? '+' : ''}${durationDelta.toFixed(1)}`,
  );
  console.info(
    `[demo-ch1_05-diag]   healer swap: baseline sp_cleric healingDealt=${clericHeal}; ` +
      `bad at_assassin damageDealt=${assassinDealt} ` +
      `activeSkillUse={${formatRecordMap(classStatRow(badResult.classStats, 'at_assassin')?.activeSkillUseCountBySkillId ?? {})}}`,
  );
  console.info(
    `[demo-ch1_05-diag]   df_guardian damageTaken: baseline=${guardianBaselineTaken} ` +
      `bad=${guardianBadTaken} delta=${guardianBadTaken - guardianBaselineTaken >= 0 ? '+' : ''}${guardianBadTaken - guardianBaselineTaken}`,
  );
  console.info(
    `[demo-ch1_05-diag]   at_ranger damageDealt: baseline=${rangerBaselineDealt} bad=${rangerBadDealt}`,
  );
  console.info(
    `[demo-ch1_05-diag]   universal=${universalResult.outcome}(hp=${universalResult.totalRemainingHp}); ` +
      `counter=${counterResult.outcome}(hp=${counterResult.totalRemainingHp}, survivors=${counterResult.survivingAllies})`,
  );
  console.info(
    `[demo-ch1_05-diag]   read: assassin burst + lower guardian taken on bad may offset missing cleric heal; ` +
      `6c candidate = raise enemy pressure so no-healer cannot match baseline score.`,
  );
}

/** Phase 6c — demo_ch1_06 bad victory vs counter (puzzle gap). */
export function logDemoCh1_06BadCounterDiagnostics(
  quad: DemoStageQuadResults,
): void {
  const stageId = 'demo_ch1_06';
  const { baseline, badResult, universalResult, counterResult } = quad;

  const badScore = demoStageOutcomeScore(badResult);
  const counterScore = demoStageOutcomeScore(counterResult);
  const guardianBaselineTaken = statForClass(
    baseline.classStats,
    'df_guardian',
    'damageTaken',
  );
  const guardianBadTaken = statForClass(
    badResult.classStats,
    'df_guardian',
    'damageTaken',
  );
  const paladinCounterTaken = statForClass(
    counterResult.classStats,
    'df_paladin',
    'damageTaken',
  );
  const assassinBadDealt = statForClass(badResult.classStats, 'at_assassin', 'damageDealt');
  const clericBaselineHeal = statForClass(
    baseline.classStats,
    'sp_cleric',
    'healingDealt',
  );

  console.info(
    `[demo-ch1_06-diag] ${stageId} bad victory puzzle gap (bad vs counter):`,
  );
  console.info(
    `[demo-ch1_06-diag]   outcome: baseline=${baseline.outcome}(hp=${baseline.totalRemainingHp}) ` +
      `bad=${badResult.outcome}(hp=${badResult.totalRemainingHp}, survivors=${badResult.survivingAllies}) ` +
      `counter=${counterResult.outcome}(hp=${counterResult.totalRemainingHp}) ` +
      `universal=${universalResult.outcome}(hp=${universalResult.totalRemainingHp})`,
  );
  console.info(
    `[demo-ch1_06-diag]   score: bad=${badScore} counter=${counterScore} delta=${counterScore - badScore >= 0 ? '+' : ''}${counterScore - badScore}`,
  );
  console.info(
    `[demo-ch1_06-diag]   durationSec: bad=${badResult.durationSec.toFixed(1)} ` +
      `counter=${counterResult.durationSec.toFixed(1)} baseline=${baseline.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-ch1_06-diag]   frontline damageTaken: guardian baseline=${guardianBaselineTaken} ` +
      `bad=${guardianBadTaken}; paladin counter=${paladinCounterTaken}`,
  );
  console.info(
    `[demo-ch1_06-diag]   bad at_assassin damageDealt=${assassinBadDealt}; ` +
      `baseline sp_cleric healingDealt=${clericBaselineHeal}`,
  );
  console.info(
    `[demo-ch1_06-diag]   read: bad wins with fewer survivors/HP → puzzle is soft if no-healer still clears; ` +
      `counter paladin improves margin (score delta ${counterScore - badScore}). ` +
      `6c candidate = raise stage pressure until bad=defeat while counter stays victory.`,
  );
}

/** Phase 6c — demo_ch1_07 finale exam margin (baseline too comfortable). */
export function logDemoCh1_07FinaleDiagnostics(
  quad: DemoStageQuadResults,
): void {
  const stageId = 'demo_ch1_07';
  const { baseline, badResult, universalResult, counterResult } = quad;

  const baselineHpPct =
    baseline.totalMaxHp > 0
      ? ((baseline.totalRemainingHp / baseline.totalMaxHp) * 100).toFixed(0)
      : 'n/a';
  const topBaselineDps = [...baseline.classStats].sort(
    (a, b) => b.damageDealt - a.damageDealt,
  )[0];
  const baselineGuardianTaken = statForClass(
    baseline.classStats,
    'df_guardian',
    'damageTaken',
  );
  const counterPaladinTaken = statForClass(
    counterResult.classStats,
    'df_paladin',
    'damageTaken',
  );
  const baselineRangerDealt = statForClass(
    baseline.classStats,
    'at_ranger',
    'damageDealt',
  );
  const counterRangerDealt = statForClass(
    counterResult.classStats,
    'at_ranger',
    'damageDealt',
  );
  const universalSorcerer = classStatRow(universalResult.classStats, 'at_sorcerer');
  const baselineClericHeal = statForClass(
    baseline.classStats,
    'sp_cleric',
    'healingDealt',
  );

  console.info(
    `[demo-ch1_07-diag] ${stageId} finale exam (counter uses demo-unlocked classes; enemy at_ballista pre-unlock):`,
  );
  console.info(
    `[demo-ch1_07-diag]   design target: default/bad/universal=defeat; baseline=defeat|marginal victory; counter=victory`,
  );
  console.info(
    `[demo-ch1_07-diag]   actual: baseline=${baseline.outcome}(hp=${baseline.totalRemainingHp}/${baseline.totalMaxHp} ${baselineHpPct}%, survivors=${baseline.survivingAllies}) ` +
      `bad=${badResult.outcome} universal=${universalResult.outcome} counter=${counterResult.outcome}(hp=${counterResult.totalRemainingHp})`,
  );
  console.info(
    `[demo-ch1_07-diag]   durationSec: baseline=${baseline.durationSec.toFixed(1)} ` +
      `counter=${counterResult.durationSec.toFixed(1)} bad=${badResult.durationSec.toFixed(1)} ` +
      `universal=${universalResult.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-ch1_07-diag]   baseline main DPS: ${topBaselineDps?.classId ?? 'none'} ` +
      `damageDealt=${topBaselineDps?.damageDealt ?? 0} ` +
      `at_ranger=${baselineRangerDealt}`,
  );
  console.info(
    `[demo-ch1_07-diag]   baseline df_guardian damageTaken=${baselineGuardianTaken}; ` +
      `sp_cleric healingDealt=${baselineClericHeal}; ` +
      `counter df_paladin damageTaken=${counterPaladinTaken}`,
  );
  console.info(
    `[demo-ch1_07-diag]   counter vs baseline ranger damageDealt: ${counterRangerDealt} vs ${baselineRangerDealt}; ` +
      `counter finishes faster=${counterResult.durationSec < baseline.durationSec}`,
  );
  console.info(
    `[demo-ch1_07-diag]   universal defeat: at_sorcerer damageDealt=${universalSorcerer?.damageDealt ?? 0} ` +
      `damageTaken=${universalSorcerer?.damageTaken ?? 0} ` +
      `durationSec=${universalResult.durationSec.toFixed(1)} — AoE lacks single-target burst vs Lv2 6-enemy wall`,
  );

  const enemyDurabilitySignal =
    baseline.durationSec > counterResult.durationSec * 1.5;
  const enemyFirepowerSignal =
    badResult.outcome === 'defeat' && badResult.durationSec < baseline.durationSec * 0.5;

  console.info(
    `[demo-ch1_07-diag]   enemy pressure read: ` +
      `durability-limited=${enemyDurabilitySignal} (long baseline ${baseline.durationSec.toFixed(0)}s); ` +
      `firepower-adequate=${enemyFirepowerSignal || badResult.outcome === 'defeat'} (bad wipes in ${badResult.durationSec.toFixed(0)}s)`,
  );

  console.info(`[demo-ch1_07-diag]   6c adjustment direction hints (not implemented):`);
  if (
    baseline.outcome === 'victory' &&
    baseline.totalRemainingHp > baseline.totalMaxHp * 0.4
  ) {
    console.info(
      `[demo-ch1_07-diag]     - baseline margin high (${baselineHpPct}% HP) → raise enemy atkScale/hpScale or reduce enemy def/res softening`,
    );
  }
  if (counterResult.outcome === 'victory' && baseline.outcome === 'victory') {
    console.info(
      `[demo-ch1_07-diag]     - counter faster/shorter (${counterResult.durationSec.toFixed(0)}s vs ${baseline.durationSec.toFixed(0)}s) → tune baseline down without breaking paladin counter`,
    );
  }
  console.info(
    `[demo-ch1_07-diag]     - keep counter=paladin (demo M1 class); do NOT require at_ballista player side`,
  );
}

export function logPaladinCounterDurability(
  stageId: string,
  baseline: DemoStageBattleResult,
  counter: DemoStageBattleResult,
): void {
  const guardianTaken = statForClass(
    baseline.classStats,
    'df_guardian',
    'damageTaken',
  );
  const paladinTaken = statForClass(
    counter.classStats,
    'df_paladin',
    'damageTaken',
  );

  console.info(
    `[demo-puzzle-compare] ${stageId} tank durability (damageTaken):`,
  );
  console.info(
    `[demo-puzzle-compare]   df_guardian(baseline): ${guardianTaken} ` +
      `outcome=${baseline.outcome} durationSec=${baseline.durationSec.toFixed(1)}`,
  );
  console.info(
    `[demo-puzzle-compare]   df_paladin(counter): ${paladinTaken} ` +
      `outcome=${counter.outcome} durationSec=${counter.durationSec.toFixed(1)}`,
  );
}

/** Standard demo party with cleric replaced by assassin (no healer). */
export function configureNoHealerParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[2] = createMemberFromClass('at_assassin', gameData);
}

/** Ranged-counter party: ranger slot uses sorcerer for AoE/ranged pressure. */
export function configureRangedCounterParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_sorcerer', gameData);
}

/** Universal party: guardian / swordsman / cleric / sorcerer (default ranger → sorcerer). */
export function configureUniversalParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_sorcerer', gameData);
}

/** Front row without a defender — fragile against pressure stages. */
export function configureNoGuardianParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[0] = createMemberFromClass('at_assassin', gameData);
}

/** Paladin replaces guardian for heavier sustain / mixed stages. */
export function configurePaladinTankParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[0] = createMemberFromClass('df_paladin', gameData);
}

/** Double melee — no back-line reach for ranged-heavy stages. */
export function configureDoubleMeleeParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_swordsman', gameData);
}

/** Diagnostic: ranger slot → assassin (finish/backline vs ch1_05-style targets). */
export function configureAssassinInsteadOfRangerParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_assassin', gameData);
}

/** Diagnostic: cleric + ranger both → assassin (double finish on ch1_05). */
export function configureAssassinDoubleFinishParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[2] = createMemberFromClass('at_assassin', gameData);
  save.party[3] = createMemberFromClass('at_assassin', gameData);
}

/** Diagnostic: cleric slot → swordsman (no-healer swordsman control for assassin comparison). */
export function configureNoHealerSwordsmanParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[2] = createMemberFromClass('at_swordsman', gameData);
}

/** Diagnostic: ranger slot → swordsman (same slot as configureAssassinInsteadOfRangerParty). */
export function configureSwordsmanInsteadOfRangerParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_swordsman', gameData);
}

export const MIN_DEMO_BATTLE_TICKS = 60;
export const MAX_DEMO_BATTLE_TICKS = 120_000;

/** Higher = better battle outcome for composition comparisons. */
export function demoStageOutcomeScore(result: DemoStageBattleResult): number {
  if (result.outcome === 'timeout') return -1;
  if (result.outcome === 'victory') return 1_000 + result.totalRemainingHp;
  return result.totalRemainingHp;
}
