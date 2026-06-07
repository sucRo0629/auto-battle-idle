import type {
  CombatantState,
  DamageSkillEffect,
  DamageType,
  PassiveSkillDef,
  ResourceAmountSpec,
  StatusEffect,
} from './types.ts';
import {
  aggregateStatEffects,
  computeEffectiveStat,
} from './statusEffectDisplay.ts';

export function getPassiveDefs(
  combatant: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): PassiveSkillDef[] {
  return combatant.build.learnedPassiveIds
    .map((id) => passives[id])
    .filter((p): p is PassiveSkillDef => p !== undefined);
}

export function getPassiveDamageMultiplier(passives: PassiveSkillDef[]): number {
  return passives.reduce((acc, p) => acc * (p.damageMultiplier ?? 1), 1);
}

export function getPassiveDamageTakenMultiplier(
  passives: PassiveSkillDef[],
): number {
  return passives.reduce((acc, p) => acc * (p.damageTakenMultiplier ?? 1), 1);
}

export function getPassiveHealBonus(passives: PassiveSkillDef[]): number {
  return passives.reduce((acc, p) => acc + (p.healBonus ?? 0), 0);
}

export function getActiveCooldownRate(passives: PassiveSkillDef[]): number {
  return passives.reduce((acc, p) => acc * (p.activeCooldownRate ?? 1), 1);
}

export function getEffectiveAtk(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'atk');
  return computeEffectiveStat(combatant.atk, agg);
}

export function getEffectiveDef(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'def');
  return computeEffectiveStat(combatant.def, agg);
}

export function getEffectiveReg(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'reg');
  return computeEffectiveStat(combatant.reg, agg);
}

export function getDamageTakenMultiplier(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'damageTaken');
  return computeEffectiveStat(1, agg);
}

export function resolveResourceAmount(
  actor: CombatantState,
  target: CombatantState,
  spec: ResourceAmountSpec,
  passives: Record<string, PassiveSkillDef>,
  powerMultiplierOverride?: number,
): number {
  const actorPassives = getPassiveDefs(actor, passives);
  const healBonus = getPassiveHealBonus(actorPassives);

  switch (spec.kind) {
    case 'atkBased': {
      const add = spec.atkAdd ?? 0;
      const multiply = powerMultiplierOverride ?? spec.atkMultiply ?? 1;
      const divide = spec.atkDivide ?? 1;
      const subtract = spec.atkSubtract ?? 0;
      const base =
        ((getEffectiveAtk(actor) + healBonus + add) * multiply) / divide -
        subtract;
      return Math.floor(Math.max(0, base));
    }
    case 'flat':
      return Math.floor(Math.max(0, (spec.flatAmount ?? 0) + healBonus));
    case 'percentMaxHp':
      return Math.floor(
        Math.max(0, target.maxHp * (spec.percentOfMaxHp ?? 0) + healBonus),
      );
  }
}

export function resolveHotAmountFromStatus(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const spec =
    effect.amount ??
    ({ kind: 'atkBased', atkMultiply: effect.powerMultiplier ?? 1 } satisfies ResourceAmountSpec);
  return resolveResourceAmount(source, target, spec, passives);
}

export function applyHealToTarget(
  target: CombatantState,
  amount: number,
): number {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - before;
}

export function applyBarrierToTarget(
  target: CombatantState,
  grant: number,
  stack: boolean,
): number {
  if (stack) {
    target.barrierHp += grant;
  } else {
    target.barrierHp = grant;
  }
  return grant;
}

export interface DamageApplicationResult {
  hpDamage: number;
  barrierDamage: number;
  lethal: boolean;
}

export function applyDamageToTarget(
  target: CombatantState,
  rawDamage: number,
): DamageApplicationResult {
  let remaining = rawDamage;
  const absorbed = Math.min(target.barrierHp, remaining);
  target.barrierHp -= absorbed;
  remaining -= absorbed;
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - remaining);
  return {
    hpDamage: hpBefore - target.hp,
    barrierDamage: absorbed,
    lethal: target.hp <= 0,
  };
}

export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
  powerMultiplierOverride?: number,
): number {
  const attackerPassives = getPassiveDefs(attacker, passives);
  const targetPassives = getPassiveDefs(target, passives);
  const powerMultiplier = powerMultiplierOverride ?? effect.powerMultiplier;
  const baseDamage = Math.floor(
    getEffectiveAtk(attacker) *
      powerMultiplier *
      getPassiveDamageMultiplier(attackerPassives),
  );
  const damageType: DamageType = effect.damageType;
  const effectiveDef = getEffectiveDef(target);
  const effectiveReg = getEffectiveReg(target);

  let afterDefense: number;
  if (damageType === 'magic') {
    afterDefense = Math.floor(
      (baseDamage * 100) / (100 + effectiveReg),
    );
  } else {
    const afterSubtract = baseDamage - effectiveDef;
    if (afterSubtract <= 0) {
      afterDefense = 0;
    } else {
      afterDefense = Math.floor(
        (afterSubtract * 100) / (100 + effectiveDef),
      );
    }
  }

  const takenMul =
    getDamageTakenMultiplier(target) *
    getPassiveDamageTakenMultiplier(targetPassives);
  return Math.max(1, Math.floor(afterDefense * takenMul));
}

export function resolveDotTick(
  source: CombatantState,
  target: CombatantState,
  powerMultiplier: number,
  damageType: DamageType,
  passives: Record<string, PassiveSkillDef>,
): number {
  return resolveDamage(
    source,
    target,
    { type: "damage", targetRule: "frontEnemy", damageType, powerMultiplier },
    passives,
  );
}

export type { StatusEffect };
