import { currentHpRatio } from './combatMath.ts';
import type { CombatantState, PendingSkillHit, SkillEffectDef } from './types.ts';

/** 護法士 M2 danger targeting 用の read-only 集計スナップショット（R12g-c2） */
export interface DangerTargetSnapshot {
  targetId: string;
  currentAttackerCount: number;
  pendingAttackerCount: number;
  pendingHitCount: number;
  earliestPendingAtBattleSec: number | null;
  hpRatio: number;
}

export type ResolveCurrentAttackTarget = (
  attacker: CombatantState,
) => CombatantState | null;

export interface CollectDangerTargetSnapshotsParams {
  /** danger 評価対象（味方護法士なら味方、敵護法士なら敵） */
  candidates: readonly CombatantState[];
  /** candidates と敵対する攻撃側 combatant */
  opponents: readonly CombatantState[];
  pendingHits: readonly PendingSkillHit[];
  battleSec: number;
  windowSec: number;
  resolveCurrentAttackTarget: ResolveCurrentAttackTarget;
}

function areHostile(a: CombatantState, b: CombatantState): boolean {
  return a.isEnemy !== b.isEnemy;
}

/** 時間窓: battleSec <= applyAt <= battleSec + windowSec（両端含む） */
export function isPendingHitInDangerWindow(
  applyAtBattleSec: number,
  battleSec: number,
  windowSec: number,
): boolean {
  return (
    applyAtBattleSec >= battleSec &&
    applyAtBattleSec <= battleSec + windowSec
  );
}

/**
 * pending queue 上の derived / bonus 追撃 Hit。
 * DoT tick / delayed pool / counter は queue に入らない前提（R12g-c 調査）。
 */
export function isDerivedPendingSkillHit(hit: PendingSkillHit): boolean {
  return (
    hit.suppressBonusBasicAttack === true ||
    hit.suppressAllyAttackFollowUp === true ||
    hit.suppressBonusActiveOnHit === true
  );
}

function isDangerPendingDamageHit(effectDef: SkillEffectDef): boolean {
  return effectDef.type === 'damage';
}

function buildCombatantMap(
  candidates: readonly CombatantState[],
  opponents: readonly CombatantState[],
): Map<string, CombatantState> {
  const map = new Map<string, CombatantState>();
  for (const unit of [...candidates, ...opponents]) {
    map.set(unit.id, unit);
  }
  return map;
}

function createEmptySnapshot(target: CombatantState): DangerTargetSnapshot {
  return {
    targetId: target.id,
    currentAttackerCount: 0,
    pendingAttackerCount: 0,
    pendingHitCount: 0,
    earliestPendingAtBattleSec: null,
    hpRatio: currentHpRatio(target),
  };
}

/** 各 candidate の danger 集計。副作用なし。 */
export function collectDangerTargetSnapshots(
  params: CollectDangerTargetSnapshotsParams,
): DangerTargetSnapshot[] {
  const {
    candidates,
    opponents,
    pendingHits,
    battleSec,
    windowSec,
    resolveCurrentAttackTarget,
  } = params;

  const aliveCandidates = candidates.filter((unit) => unit.isAlive);
  const candidateIds = new Set(aliveCandidates.map((unit) => unit.id));
  const combatantsById = buildCombatantMap(candidates, opponents);

  const currentAttackerIds = new Map<string, Set<string>>();
  const pendingAttackerIds = new Map<string, Set<string>>();
  const pendingHitCounts = new Map<string, number>();
  const earliestPendingAt = new Map<string, number>();

  for (const candidate of aliveCandidates) {
    currentAttackerIds.set(candidate.id, new Set());
    pendingAttackerIds.set(candidate.id, new Set());
    pendingHitCounts.set(candidate.id, 0);
  }

  for (const attacker of opponents) {
    if (!attacker.isAlive) continue;

    const target = resolveCurrentAttackTarget(attacker);
    if (!target?.isAlive) continue;
    if (!areHostile(attacker, target)) continue;
    if (!candidateIds.has(target.id)) continue;

    currentAttackerIds.get(target.id)?.add(attacker.id);
  }

  for (const hit of pendingHits) {
    if (!isPendingHitInDangerWindow(hit.applyAtBattleSec, battleSec, windowSec)) {
      continue;
    }
    if (!isDangerPendingDamageHit(hit.effectDef)) continue;
    if (isDerivedPendingSkillHit(hit)) continue;

    const actor = combatantsById.get(hit.actorId);
    if (!actor?.isAlive) continue;

    for (const entry of hit.targets) {
      const target = combatantsById.get(entry.targetId);
      if (!target?.isAlive) continue;
      if (!areHostile(actor, target)) continue;
      if (!candidateIds.has(target.id)) continue;

      pendingAttackerIds.get(target.id)?.add(actor.id);
      pendingHitCounts.set(
        target.id,
        (pendingHitCounts.get(target.id) ?? 0) + 1,
      );

      const prevEarliest = earliestPendingAt.get(target.id);
      if (prevEarliest === undefined || hit.applyAtBattleSec < prevEarliest) {
        earliestPendingAt.set(target.id, hit.applyAtBattleSec);
      }
    }
  }

  return aliveCandidates.map((target) => {
    const snapshot = createEmptySnapshot(target);
    snapshot.currentAttackerCount = currentAttackerIds.get(target.id)?.size ?? 0;
    snapshot.pendingAttackerCount = pendingAttackerIds.get(target.id)?.size ?? 0;
    snapshot.pendingHitCount = pendingHitCounts.get(target.id) ?? 0;
    snapshot.earliestPendingAtBattleSec =
      earliestPendingAt.get(target.id) ?? null;
    return snapshot;
  });
}

function compareEarliestPending(
  a: number | null,
  b: number | null,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * danger 順位比較。負数 = a の方が危険（上位）。
 * 魔法 Attack 加点は含めない（R12g-c2）。
 */
export function compareDangerTargetSnapshots(
  a: DangerTargetSnapshot,
  b: DangerTargetSnapshot,
): number {
  if (a.currentAttackerCount !== b.currentAttackerCount) {
    return b.currentAttackerCount - a.currentAttackerCount;
  }
  if (a.pendingAttackerCount !== b.pendingAttackerCount) {
    return b.pendingAttackerCount - a.pendingAttackerCount;
  }
  if (a.pendingHitCount !== b.pendingHitCount) {
    return b.pendingHitCount - a.pendingHitCount;
  }

  const earliestCmp = compareEarliestPending(
    a.earliestPendingAtBattleSec,
    b.earliestPendingAtBattleSec,
  );
  if (earliestCmp !== 0) return earliestCmp;

  if (a.hpRatio !== b.hpRatio) {
    return a.hpRatio - b.hpRatio;
  }

  return a.targetId.localeCompare(b.targetId);
}

export function sortDangerTargetSnapshots(
  snapshots: readonly DangerTargetSnapshot[],
): DangerTargetSnapshot[] {
  return [...snapshots].sort(compareDangerTargetSnapshots);
}
