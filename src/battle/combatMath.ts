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

export function resolvePowerAmount(
  actor: CombatantState,
  target: CombatantState,
  spec: ResourceAmountSpec,
  _passives: Record<string, PassiveSkillDef>,
  atkScaleOverride?: number,
): number {
  switch (spec.kind) {
    case 'atkBased': {
      const offset = spec.atkOffset ?? 0;
      const scale = atkScaleOverride ?? spec.atkScale ?? 1;
      const base = (getEffectiveAtk(actor) + offset) * scale;
      return Math.floor(Math.max(0, base));
    }
    case 'flat':
      return Math.floor(Math.max(0, spec.flatAmount ?? 0));
    case 'percentMaxHp':
      return Math.floor(
        Math.max(0, target.maxHp * (spec.percentOfMaxHp ?? 0)),
      );
  }
}

export function resolveResourceAmount(
  actor: CombatantState,
  target: CombatantState,
  spec: ResourceAmountSpec,
  passives: Record<string, PassiveSkillDef>,
  atkScaleOverride?: number,
): number {
  return resolvePowerAmount(actor, target, spec, passives, atkScaleOverride);
}

export function resolveHotAmountFromStatus(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const spec =
    effect.amount ??
    ({ kind: 'atkBased', atkScale: effect.powerMultiplier ?? 1 } satisfies ResourceAmountSpec);
  return resolveResourceAmount(source, target, spec, passives);
}

export function resolveDotAmountFromStatus(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const spec =
    effect.amount ??
    ({ kind: 'atkBased', atkScale: effect.powerMultiplier ?? 1 } satisfies ResourceAmountSpec);
  return resolveDotTick(
    source,
    target,
    spec,
    effect.damageType ?? 'physical',
    passives,
  );
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
  atkScaleOverride?: number,
): number {
  const baseDamage = Math.floor(
    resolvePowerAmount(
      attacker,
      target,
      effect.amount,
      passives,
      atkScaleOverride,
    ),
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

  const takenMul = getDamageTakenMultiplier(target);
  return Math.max(1, Math.floor(afterDefense * takenMul));
}

export function resolveDotTick(
  source: CombatantState,
  target: CombatantState,
  amount: ResourceAmountSpec,
  damageType: DamageType,
  passives: Record<string, PassiveSkillDef>,
): number {
  return resolveDamage(
    source,
    target,
    {
      type: "damage",
      targetRule: "frontEnemy",
      damageType,
      amount,
    },
    passives,
  );
}

export type { StatusEffect };
