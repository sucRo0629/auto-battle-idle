import { currentHpRatio, getEffectiveDef, getEffectiveMaxHp, getPassiveDefs } from "./combatMath.ts";
import { getBattleX } from "./combatPosition.ts";
import type { CombatantState, PassiveSkillDef } from "./types.ts";

/** maxHp 係数（statComponent = floor(maxHp×a + def×b)） */
export const THREAT_STAT_HP_WEIGHT = 0.1;
/** def 係数 */
export const THREAT_STAT_DEF_WEIGHT = 2;
/** 与ダメ 1 につき actor 側 threat 増加 */
export const THREAT_DAMAGE_SCALE = 0.5;
/** defender の baseThreat 倍率（statComponent + pressure 適用後） */
export const THREAT_BASE_DEFENDER_MULTIPLIER = 1.2;
/** debuff 付与成功時の基本 threat */
export const THREAT_DEBUFF_APPLY = 15;
/** 秒あたり baseThreat 方向への減衰量 */
export const THREAT_DECAY_PER_SEC = 20;
/** 敵 chase / attack ターゲット切替に必要な threat 差（ヒステリシス） */
export const THREAT_TARGET_SWITCH_MARGIN = 50;

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

export function pickThreatTargetWithHysteresis(
  pool: CombatantState[],
  currentFocusId: string | undefined,
): { target: CombatantState | null; focusId: string | undefined } {
  if (pool.length === 0) {
    return { target: null, focusId: undefined };
  }

  const highest = pickHighestThreatAlly(pool);
  if (!highest) {
    return { target: null, focusId: undefined };
  }

  if (!currentFocusId) {
    return { target: highest, focusId: highest.id };
  }

  const current = pool.find(
    (unit) => unit.id === currentFocusId && unit.isAlive,
  );
  if (!current) {
    return { target: highest, focusId: highest.id };
  }

  if (current.id === highest.id) {
    return { target: current, focusId: current.id };
  }

  const margin = resolveThreatValue(highest) - resolveThreatValue(current);
  if (margin >= THREAT_TARGET_SWITCH_MARGIN) {
    return { target: highest, focusId: highest.id };
  }

  return { target: current, focusId: current.id };
}

export function computeThreatStatComponent(unit: CombatantState): number {
  return Math.floor(
    getEffectiveMaxHp(unit) * THREAT_STAT_HP_WEIGHT +
      getEffectiveDef(unit) * THREAT_STAT_DEF_WEIGHT,
  );
}

function computeFrontRowPressureBonus(
  ally: CombatantState,
  allies: CombatantState[],
): number {
  if (ally.formationRow !== "front") return 0;
  const statComponent = computeThreatStatComponent(ally);
  const frontOthers = allies.filter(
    (unit) =>
      unit.isAlive && unit.formationRow === "front" && unit.id !== ally.id,
  );
  if (frontOthers.length === 0) return 0;
  const pressure = Math.max(
    ...frontOthers.map((unit) => 1 - currentHpRatio(unit)),
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

function resolveThreatDecayMultiplier(
  passives: PassiveSkillDef[] | undefined,
): number {
  if (!passives || passives.length === 0) return 1;
  let multiplier = 1;
  for (const passive of passives) {
    if (passive.effect !== "threatControl") continue;
    if (passive.threatDecayMultiplier === undefined) continue;
    multiplier *= passive.threatDecayMultiplier;
  }
  return multiplier;
}

function resolveFrontThreatDecayMultiplier(
  ally: CombatantState,
  allies: CombatantState[],
  passivesRegistry: Record<string, PassiveSkillDef>,
): number {
  if (ally.formationRow !== "front") return 1;
  let multiplier = 1;
  for (const source of allies) {
    if (!source.isAlive || source.id === ally.id) continue;
    for (const passive of getPassiveDefs(source, passivesRegistry)) {
      if (passive.effect !== "threatControl") continue;
      if (passive.frontThreatDecayMultiplier === undefined) continue;
      multiplier *= passive.frontThreatDecayMultiplier;
    }
  }
  return multiplier;
}

export function resolveAllyThreatDecayMultiplier(
  ally: CombatantState,
  allies: CombatantState[],
  passivesRegistry: Record<string, PassiveSkillDef>,
  ownPassives?: PassiveSkillDef[],
): number {
  return (
    resolveThreatDecayMultiplier(ownPassives) *
    resolveFrontThreatDecayMultiplier(ally, allies, passivesRegistry)
  );
}

export function tickAllyThreatDecay(
  ally: CombatantState,
  deltaTime: number,
  decayMultiplier = 1,
): void {
  if (!ally.isAlive) return;
  const base = ally.baseThreat ?? 0;
  const current = ally.threat ?? base;
  if (current <= base) {
    ally.threat = base;
    return;
  }
  const decayRate = THREAT_DECAY_PER_SEC * deltaTime * decayMultiplier;
  ally.threat = Math.max(base, current - decayRate);
}

function addThreatGain(unit: CombatantState, gain: number): void {
  if (gain <= 0) return;
  unit.threat = (unit.threat ?? unit.baseThreat ?? 0) + gain;
}

export function applyThreatFromDamage(
  actor: CombatantState,
  _target: CombatantState,
  amount: number,
): void {
  if (amount <= 0) return;
  const actorGain = Math.floor(amount * THREAT_DAMAGE_SCALE);
  if (!actor.isEnemy && actor.isAlive && actorGain > 0) {
    addThreatGain(actor, actorGain);
  }
}

function resolveThreatControlGain(
  passives: PassiveSkillDef[],
  field: "onDamageTakenFlat" | "onDamageTakenScale" | "onBlockFlat",
  amount = 0,
): number {
  let gain = 0;
  for (const passive of passives) {
    if (passive.effect !== "threatControl") continue;
    if (field === "onDamageTakenFlat" && passive.onDamageTakenFlat !== undefined) {
      gain += passive.onDamageTakenFlat;
    }
    if (
      field === "onDamageTakenScale" &&
      passive.onDamageTakenScale !== undefined
    ) {
      gain += Math.floor(amount * passive.onDamageTakenScale);
    }
    if (field === "onBlockFlat" && passive.onBlockFlat !== undefined) {
      gain += passive.onBlockFlat;
    }
  }
  return gain;
}

export function applyThreatControlOnDamageTaken(
  target: CombatantState,
  amount: number,
  passives: PassiveSkillDef[],
): void {
  if (target.isEnemy || !target.isAlive || amount <= 0) return;
  const gain =
    resolveThreatControlGain(passives, "onDamageTakenFlat") +
    resolveThreatControlGain(passives, "onDamageTakenScale", amount);
  addThreatGain(target, gain);
}

export function applyThreatControlOnBlock(
  target: CombatantState,
  passives: PassiveSkillDef[],
): void {
  if (target.isEnemy || !target.isAlive) return;
  addThreatGain(target, resolveThreatControlGain(passives, "onBlockFlat"));
}

export function applyThreatFromDebuffApply(actor: CombatantState): void {
  if (actor.isEnemy || !actor.isAlive) return;
  addThreatGain(actor, THREAT_DEBUFF_APPLY);
}

export function applyThreatBurst(
  actor: CombatantState,
  appliedDamage: number,
  burst: { threatBurstFlat?: number; threatBurstScale?: number },
): void {
  if (actor.isEnemy || !actor.isAlive || appliedDamage <= 0) return;
  const flat = burst.threatBurstFlat ?? 0;
  const scaleGain =
    burst.threatBurstScale !== undefined && burst.threatBurstScale > 0
      ? Math.floor(appliedDamage * burst.threatBurstScale)
      : 0;
  addThreatGain(actor, flat + scaleGain);
}

export function applyFrontThreatFloor(
  allies: CombatantState[],
  passivesRegistry: Record<string, PassiveSkillDef>,
): void {
  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passivesRegistry)) {
      if (passive.effect !== "threatControl") continue;
      if (passive.frontThreatFloor === undefined) continue;
      const floor = Math.floor(
        resolveThreatValue(source) * passive.frontThreatFloor,
      );
      if (floor <= 0) continue;
      for (const ally of allies) {
        if (!ally.isAlive || ally.id === source.id) continue;
        if (ally.formationRow !== "front") continue;
        const current = ally.threat ?? ally.baseThreat ?? 0;
        if (current < floor) {
          ally.threat = floor;
        }
      }
    }
  }
}
