import type { BattleXDebugTraceEntry } from "./types.ts";

const ZERO_DELTA_EPSILON = 0.001;

function hasApproachDebugDetails(
  details: NonNullable<BattleXDebugTraceEntry["details"]>,
): boolean {
  return (
    details.approachTargetX !== undefined ||
    details.shouldSkipEngagedAutoApproach !== undefined ||
    details.priorityHealTargetId !== undefined ||
    details.frontlineContactX !== undefined ||
    details.frontlineOwnerIds !== undefined ||
    details.healWithholdReason !== undefined
  );
}

/** trace 表に載せる行か（移動あり、または approach の PHT / withhold 等） */
export function isBattleXTraceTableRowVisible(
  entry: BattleXDebugTraceEntry,
): boolean {
  if (Math.abs(entry.deltaX) > ZERO_DELTA_EPSILON) return true;
  if (entry.reason !== "approach") return false;
  const details = entry.details;
  return details !== undefined && hasApproachDebugDetails(details);
}

export function isBattleXTraceApproachIdleRow(
  entry: BattleXDebugTraceEntry,
): boolean {
  return (
    entry.reason === "approach" &&
    Math.abs(entry.deltaX) <= ZERO_DELTA_EPSILON &&
    entry.details !== undefined &&
    hasApproachDebugDetails(entry.details)
  );
}

function formatPx(value: number): string {
  return value.toFixed(1);
}

/** 表の details 列と row.title 共用 */
export function formatBattleXTraceDetails(entry: BattleXDebugTraceEntry): string {
  const details = entry.details;
  if (!details) return `${entry.phase} / ${entry.runtimePhase}`;
  const parts = [
    `phase=${entry.phase}`,
    `runtime=${entry.runtimePhase}`,
    details.approachTargetX === undefined
      ? null
      : `target=${formatPx(details.approachTargetX)}`,
    details.shouldSkipEngagedAutoApproach === undefined
      ? null
      : `skip=${details.shouldSkipEngagedAutoApproach}`,
    details.priorityHealTargetId === undefined
      ? null
      : `pht=${details.priorityHealTargetId}`,
    details.frontlineContactX === undefined
      ? null
      : `frontline=${formatPx(details.frontlineContactX)}`,
    details.frontlineOwnerIds === undefined
      ? null
      : `frontlineOwners=${details.frontlineOwnerIds}`,
    details.healWithholdReason === undefined
      ? null
      : `withhold=${details.healWithholdReason}`,
    details.bodyAnimMarching === undefined
      ? null
      : `march=${details.bodyAnimMarching}`,
    details.isActorUseLocked === undefined
      ? null
      : `useLock=${details.isActorUseLocked}`,
    details.isActorInSkillMotion === undefined
      ? null
      : `skillMotion=${details.isActorInSkillMotion}`,
    details.isActorAnimLocked === undefined
      ? null
      : `animLock=${details.isActorAnimLocked}`,
  ].filter((part): part is string => part !== null);
  return parts.join(" | ");
}
