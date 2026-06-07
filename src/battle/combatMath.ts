import type {
  ActiveSkillDef,
  CombatantState,
  DamageType,
  PassiveSkillDef,
  StatusEffect,
} from './types.ts';

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

function getStatMultiplier(
  effects: StatusEffect[],
  stat: StatusEffect['stat'],
): number {
  return effects
    .filter((e) => e.stat === stat)
    .reduce((acc, e) => acc * e.multiplier, 1);
}

export function getEffectiveAtk(combatant: CombatantState): number {
  const mul = getStatMultiplier(combatant.statusEffects, 'atk');
  return Math.max(0, combatant.atk * mul);
}

export function getEffectiveDef(combatant: CombatantState): number {
  const mul = getStatMultiplier(combatant.statusEffects, 'def');
  return Math.max(0, combatant.def * mul);
}

export function getDamageTakenMultiplier(combatant: CombatantState): number {
  const statusMul = getStatMultiplier(combatant.statusEffects, 'damageTaken');
  return statusMul;
}

export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  skill: ActiveSkillDef,
  passives: Record<string, PassiveSkillDef>,
): number {
  const attackerPassives = getPassiveDefs(attacker, passives);
  const targetPassives = getPassiveDefs(target, passives);
  const baseDamage = Math.floor(
    getEffectiveAtk(attacker) *
      (skill.powerMultiplier ?? 1) *
      getPassiveDamageMultiplier(attackerPassives),
  );
  const damageType: DamageType = skill.damageType ?? 'physical';
  const effectiveDef = getEffectiveDef(target);
  const effectiveReg = target.reg;

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
  skill: ActiveSkillDef,
  passives: Record<string, PassiveSkillDef>,
): number {
  const actorPassives = getPassiveDefs(actor, passives);
  return Math.floor(
    (getEffectiveAtk(actor) + getPassiveHealBonus(actorPassives)) *
      (skill.powerMultiplier ?? 1),
  );
}
