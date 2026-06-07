import type {
  CombatantState,
  DamageSkillEffect,
  DamageType,
  HealSkillEffect,
  PassiveSkillDef,
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

export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const attackerPassives = getPassiveDefs(attacker, passives);
  const targetPassives = getPassiveDefs(target, passives);
  const baseDamage = Math.floor(
    getEffectiveAtk(attacker) *
      effect.powerMultiplier *
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

export function resolveHeal(
  actor: CombatantState,
  effect: HealSkillEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const actorPassives = getPassiveDefs(actor, passives);
  return Math.floor(
    (getEffectiveAtk(actor) + getPassiveHealBonus(actorPassives)) *
      effect.powerMultiplier,
  );
}

export function resolveHotTick(
  source: CombatantState,
  powerMultiplier: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  return resolveHeal(source, { type: "heal", targetRule: "self", powerMultiplier }, passives);
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
