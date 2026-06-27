import type {
  BattleXDebugTraceEntry,
  BattleXDebugTraceReason,
  CombatantState,
  RuntimeBattlePhase,
} from "./types.ts";

export const BATTLE_X_DEBUG_TRACE_LIMIT = 50;
const ZERO_DELTA_EPSILON = 0.001;

export interface BattleXDebugTraceContext {
  phase: string;
  runtimePhase: RuntimeBattlePhase;
  battleTimeSec: number;
  tickIndex: number;
  warningThresholdPx: number;
}

export function createBattleXBeforeMap(
  units: readonly CombatantState[],
): Map<string, number> {
  return new Map(units.map((unit) => [unit.id, unit.battleX] as const));
}

export function recordBattleXTraceEntries(
  trace: BattleXDebugTraceEntry[],
  units: readonly CombatantState[],
  beforeById: ReadonlyMap<string, number>,
  reason: BattleXDebugTraceReason,
  context: BattleXDebugTraceContext,
  detailsById?: ReadonlyMap<string, BattleXDebugTraceEntry["details"]>,
  options?: { includeZeroDeltaWhenDetailed?: boolean },
): void {
  for (const unit of units) {
    const beforeX = beforeById.get(unit.id);
    if (beforeX === undefined) continue;
    recordBattleXTraceEntry(
      trace,
      unit,
      beforeX,
      reason,
      context,
      detailsById?.get(unit.id),
      options,
    );
  }
  trimBattleXDebugTrace(trace);
}

export function recordBattleXTraceEntry(
  trace: BattleXDebugTraceEntry[],
  unit: CombatantState,
  beforeX: number,
  reason: BattleXDebugTraceReason,
  context: BattleXDebugTraceContext,
  details?: BattleXDebugTraceEntry["details"],
  options?: { includeZeroDeltaWhenDetailed?: boolean },
): void {
  const afterX = unit.battleX;
  const deltaX = afterX - beforeX;
  const hasApproachDetails =
    details?.approachTargetX !== undefined ||
    details?.shouldSkipEngagedAutoApproach !== undefined;
  if (
    Math.abs(deltaX) <= ZERO_DELTA_EPSILON &&
    !(options?.includeZeroDeltaWhenDetailed && hasApproachDetails)
  ) {
    return;
  }

  trace.push({
    unitId: unit.id,
    unitName: unit.name,
    isEnemy: unit.isEnemy,
    phase: context.phase,
    runtimePhase: context.runtimePhase,
    reason,
    beforeX,
    afterX,
    deltaX,
    battleTimeSec: context.battleTimeSec,
    tickIndex: context.tickIndex,
    warning: Math.abs(deltaX) > context.warningThresholdPx,
    ...(details ? { details } : {}),
  });
  trimBattleXDebugTrace(trace);
}

function trimBattleXDebugTrace(trace: BattleXDebugTraceEntry[]): void {
  if (trace.length <= BATTLE_X_DEBUG_TRACE_LIMIT) return;
  trace.splice(0, trace.length - BATTLE_X_DEBUG_TRACE_LIMIT);
}
