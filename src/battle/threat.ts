import type { CombatantState } from "./types.ts";

/** maxHp 係数（statComponent = floor(maxHp×a + def×b)） */
export const THREAT_STAT_HP_WEIGHT = 0.1;
/** def 係数 */
export const THREAT_STAT_DEF_WEIGHT = 2;
/** 与ダメ・被ダメ 1 につき threat 増加 */
export const THREAT_DAMAGE_SCALE = 0.5;
/** debuff 付与成功時の基本 threat */
export const THREAT_DEBUFF_APPLY = 15;
/** 秒あたり baseThreat 方向への減衰量 */
export const THREAT_DECAY_PER_SEC = 20;
/** 敵ターゲット抽選: threat^N で重み付け（N>1 で低ヘイトの当選率を下げる） */
export const THREAT_TARGET_WEIGHT_EXPONENT = 3;

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
    ...frontOthers.map((unit) => 1 - unit.hp / unit.maxHp)
  );
  return Math.floor(statComponent * pressure);
}

export function computeAllyBaseThreat(
  ally: CombatantState,
  allies: CombatantState[],
): number {
  const statComponent = computeThreatStatComponent(ally);
  const pressureBonus = computeFrontRowPressureBonus(ally, allies);
  return statComponent + pressureBonus;
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
  const gain = Math.floor(amount * THREAT_DAMAGE_SCALE);
  if (gain <= 0) return;
  if (!actor.isEnemy && actor.isAlive) {
    actor.threat = (actor.threat ?? actor.baseThreat ?? 0) + gain;
  }
  if (!target.isEnemy && target.isAlive) {
    target.threat = (target.threat ?? target.baseThreat ?? 0) + gain;
  }
}

export function applyThreatFromDebuffApply(actor: CombatantState): void {
  if (actor.isEnemy || !actor.isAlive) return;
  actor.threat =
    (actor.threat ?? actor.baseThreat ?? 0) + THREAT_DEBUFF_APPLY;
}

function threatTargetWeight(threat: number): number {
  const value = Math.max(threat, 1);
  return Math.pow(value, THREAT_TARGET_WEIGHT_EXPONENT);
}

export function pickThreatWeightedAlly(
  pool: CombatantState[],
  random: () => number = Math.random
): CombatantState | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;

  const weights = pool.map((ally) => threatTargetWeight(ally.threat ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return pool[0]!;

  let roll = random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}
