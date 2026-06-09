import type {
  CombatantState,
  DamageSkillEffect,
  DamageType,
  DefenseIgnoreSpec,
  PassiveSkillDef,
  ResourceAmountSpec,
  StatusEffect,
} from './types.ts';
import {
  applyDefenseIgnoreToDef,
  applyDefenseIgnoreToReg,
  getPassiveDefenseIgnoreSpec,
} from './defenseIgnore.ts';
import {
  getPassiveOutgoingDamageMultiplier,
  resolveEffectDamageIncreaseMultiplier,
  type PassiveDamageContext,
} from './passiveEffects.ts';
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

export interface DotTickOptions {
  effectDamageIncrease?: DamageIncreaseSpec;
  effectDefenseIgnore?: DefenseIgnoreSpec;
  statusEffect?: StatusEffect;
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
    {
      effectDamageIncrease: effect.damageIncrease,
      effectDefenseIgnore: effect.defenseIgnore,
      statusEffect: effect,
    },
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

export interface DamageResolveOptions {
  atkScaleOverride?: number;
  passiveContext?: PassiveDamageContext;
  effectDamageIncrease?: DamageIncreaseSpec;
  effectDefenseIgnore?: DefenseIgnoreSpec;
  statusDamageIncrease?: DamageIncreaseSpec;
  statusDefenseIgnore?: DefenseIgnoreSpec;
}

export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
  atkScaleOverride?: number,
  passiveContext: PassiveDamageContext = {},
): number;
export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
  options?: DamageResolveOptions,
): number;
export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
  optionsOrOverride?: number | DamageResolveOptions,
  passiveContext: PassiveDamageContext = {},
): number {
  const options: DamageResolveOptions =
    typeof optionsOrOverride === 'number'
      ? { atkScaleOverride: optionsOrOverride, passiveContext }
      : (optionsOrOverride ?? {});

  const atkScaleOverride = options.atkScaleOverride;
  const context = options.passiveContext ?? passiveContext;

  const increaseMul = resolveEffectDamageIncreaseMultiplier(
    attacker,
    target,
    options.effectDamageIncrease ?? effect.damageIncrease,
    options.statusDamageIncrease,
    passives,
  );

  const baseDamage = Math.floor(
    resolvePowerAmount(
      attacker,
      target,
      effect.amount,
      passives,
      atkScaleOverride,
    ) *
      getPassiveOutgoingDamageMultiplier(
        attacker,
        target,
        passives,
        context,
      ) *
      increaseMul,
  );

  const ignoreSpecs = [
    getPassiveDefenseIgnoreSpec(attacker, passives),
    options.effectDefenseIgnore ?? effect.defenseIgnore,
    options.statusDefenseIgnore,
  ];

  const damageType: DamageType = effect.damageType;
  const effectiveDef = applyDefenseIgnoreToDef(
    getEffectiveDef(target),
    ignoreSpecs,
  );
  const effectiveReg = applyDefenseIgnoreToReg(
    getEffectiveReg(target),
    ignoreSpecs,
  );

  let afterDefense: number;
  if (damageType === 'magic') {
    afterDefense = Math.floor((baseDamage * 100) / (100 + effectiveReg));
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
  options: DotTickOptions = {},
): number {
  const status = options.statusEffect;
  return resolveDamage(
    source,
    target,
    {
      type: 'damage',
      targetRule: 'frontEnemy',
      damageType,
      amount,
    },
    passives,
    {
      effectDamageIncrease:
        options.effectDamageIncrease ?? status?.damageIncrease,
      effectDefenseIgnore:
        options.effectDefenseIgnore ?? status?.defenseIgnore,
    },
  );
}

export type { StatusEffect };
