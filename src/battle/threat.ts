import { currentHpRatio } from "./combatMath.ts";
import { getBattleX } from "./combatPosition.ts";
import type { CombatantState } from "./types.ts";

/** maxHp 係数（statComponent = floor(maxHp×a + def×b)） */
export const THREAT_STAT_HP_WEIGHT = 0.1;
/** def 係数 */
export const THREAT_STAT_DEF_WEIGHT = 2;
/** 与ダメ・被ダメ 1 につき threat 増加（全ロール共通） */
export const THREAT_DAMAGE_SCALE = 0.5;
/** defender の baseThreat 倍率（statComponent + pressure 適用後） */
export const THREAT_BASE_DEFENDER_MULTIPLIER = 1.2;
/** debuff 付与成功時の基本 threat */
export const THREAT_DEBUFF_APPLY = 15;
/** 秒あたり baseThreat 方向への減衰量 */
export const THREAT_DECAY_PER_SEC = 20;

export function resolveThreatValue(unit: CombatantState): number {
  return unit.threat ?? unit.baseThreat ?? 0;
}

/** 敵デフォルトターゲット: ヘイト最大（同率は前線 battleX → id） */
export function compareThreatTargetPriority(
  a: CombatantState,
  b: CombatantState,
): number {
  const threatDiff = resolveThreatValue(b) - resolveThreatValue(a);
  if (threatDiff !== 0) return threatDiff;
  const xDiff = getBattleX(b) - getBattleX(a);
  if (xDiff !== 0) return xDiff;
  return a.id.localeCompare(b.id);
}

export function pickHighestThreatAlly(
  pool: CombatantState[],
): CombatantState | null {
  if (pool.length === 0) return null;
  return pool.reduce((best, unit) =>
    compareThreatTargetPriority(best, unit) > 0 ? unit : best,
  );
}

export function computeThreatStatComponent(unit: CombatantState): number {
  return Math.floor(
    unit.maxHp * THREAT_STAT_HP_WEIGHT + unit.def * THREAT_STAT_DEF_WEIGHT
  );
}

function computeFrontRowPressureBonus(
  ally: CombatantState,
  allies: CombatantState[]
): number {
  if (ally.formationRow !== "front") return 0;
  const statComponent = computeThreatStatComponent(ally);
  const frontOthers = allies.filter(
    (unit) =>
      unit.isAlive && unit.formationRow === "front" && unit.id !== ally.id
  );
  if (frontOthers.length === 0) return 0;
  const pressure = Math.max(
    ...frontOthers.map((unit) => 1 - currentHpRatio(unit))
  );
  return Math.floor(statComponent * pressure);
}

export function computeAllyBaseThreat(
  ally: CombatantState,
  allies: CombatantState[],
): number {
  const statComponent = computeThreatStatComponent(ally);
  const pressureBonus = computeFrontRowPressureBonus(ally, allies);
  let base = statComponent + pressureBonus;
  if (ally.role === "defender") {
    base = Math.floor(base * THREAT_BASE_DEFENDER_MULTIPLIER);
  }
  return base;
}

export function initializeAllyThreat(allies: CombatantState[]): void {
  for (const ally of allies) {
    const base = computeAllyBaseThreat(ally, allies);
    ally.baseThreat = base;
    ally.threat = base;
  }
}

export function refreshAlliesBaseThreat(allies: CombatantState[]): void {
  for (const ally of allies) {
    if (!ally.isAlive) continue;
    ally.baseThreat = computeAllyBaseThreat(ally, allies);
  }
}

export function tickAllyThreatDecay(
  ally: CombatantState,
  deltaTime: number
): void {
  if (!ally.isAlive) return;
  const base = ally.baseThreat ?? 0;
  const current = ally.threat ?? base;
  if (current <= base) {
    ally.threat = base;
    return;
  }
  ally.threat = Math.max(base, current - THREAT_DECAY_PER_SEC * deltaTime);
}

export function applyThreatFromDamage(
  actor: CombatantState,
  target: CombatantState,
  amount: number
): void {
  if (amount <= 0) return;
  const actorGain = Math.floor(amount * THREAT_DAMAGE_SCALE);
  const targetGain = Math.floor(amount * THREAT_DAMAGE_SCALE);
  if (!actor.isEnemy && actor.isAlive && actorGain > 0) {
    actor.threat = (actor.threat ?? actor.baseThreat ?? 0) + actorGain;
  }
  if (!target.isEnemy && target.isAlive && targetGain > 0) {
    target.threat = (target.threat ?? target.baseThreat ?? 0) + targetGain;
  }
}

export function applyThreatFromDebuffApply(actor: CombatantState): void {
  if (actor.isEnemy || !actor.isAlive) return;
  actor.threat =
    (actor.threat ?? actor.baseThreat ?? 0) + THREAT_DEBUFF_APPLY;
}

