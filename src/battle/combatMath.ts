import type {
  CombatantState,
  DamageIncreaseSpec,
  DamageSkillEffect,
  DamageType,
  DefenseIgnoreSpec,
  HpRatioCompare,
  PassiveSkillDef,
  ResourceAmountSpec,
  StatusEffect,
} from './types.ts';
import {
  applyDefenseIgnoreToDef,
  applyDefenseIgnoreToRes,
  getPassiveDefenseIgnoreSpec,
  getPassiveIgnoredDefBonusScale,
  rollDefenseIgnoreSpec,
} from './defenseIgnore.ts';
import {
  getPassiveOutgoingDamageMultiplier,
  resolveEffectDamageIncreaseMultiplier,
  resolveOutgoingHealSpecialMultiplier,
  resolveIncomingHealAmount,
  type PassiveDamageContext,
} from './passiveEffects.ts';
import { resolveEffectiveAmountSpec } from './skillAmountOverride.ts';
import {
  aggregateStatEffects,
  computeEffectiveStat,
} from './statusEffectDisplay.ts';
import { isInvulnerable } from './invulnerable.ts';
import { resolveDamageIncreaseMultiplier } from './damageIncrease.ts';
import { resolveIdleAtkRampMultiplier } from './idleAtkRamp.ts';
import { consumeNextOutgoingDamageMultiplier } from './nextOutgoingDamage.ts';
import { resolveTargetHpRatioDamageScale } from './targetHpRatioDamageScale.ts';
import { resolvePartyFinisherDamageMultiplier } from './hunterPassives.ts';
import { resolveBlazingFlameMagicDamageTakenMultiplier } from './sorcererFlame.ts';
import { resolveDfPaladinM2MagicExtraDamageTakenMultiplier } from './dfPaladinM2.ts';

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

export function getEffectiveRes(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'res');
  return computeEffectiveStat(combatant.res, agg);
}

export function getEffectiveMaxHp(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'hp');
  return computeEffectiveStat(combatant.maxHp, agg);
}

export function clampHpToEffectiveMax(combatant: CombatantState): void {
  const maxHp = getEffectiveMaxHp(combatant);
  if (combatant.hp > maxHp) {
    combatant.hp = maxHp;
  }
}

export function getDamageTakenMultiplier(combatant: CombatantState): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'damageTaken');
  return computeEffectiveStat(1, agg);
}

/** 現在 HP 割合（0〜1）。barrierHp は含めない。maxHp はバフ反映後。 */
export function currentHpRatio(unit: CombatantState): number {
  const maxHp = getEffectiveMaxHp(unit);
  if (maxHp <= 0) return 0;
  return unit.hp / maxHp;
}

export function matchesHpRatioThreshold(
  ratio: number,
  threshold: number,
  compare: HpRatioCompare = "lte",
): boolean {
  return compare === "gte" ? ratio >= threshold : ratio <= threshold;
}

export function getEffectiveAttackSpeedMultiplier(
  combatant: CombatantState,
): number {
  const agg = aggregateStatEffects(combatant.statusEffects, 'attackSpeed');
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
      const idleRampMul = resolveIdleAtkRampMultiplier(actor, _passives);
      const base = (getEffectiveAtk(actor) + offset) * scale * idleRampMul;
      return Math.floor(Math.max(0, base));
    }
    case 'defBased': {
      const offset = spec.defOffset ?? 0;
      const scale = spec.defScale ?? 1;
      const base = (getEffectiveDef(actor) + offset) * scale;
      return Math.floor(Math.max(0, base));
    }
    case 'flat':
      return Math.floor(Math.max(0, spec.flatAmount ?? 0));
    case 'percentMaxHp': {
      const ref = spec.maxHpRef ?? 'target';
      const maxHp =
        ref === 'self'
          ? getEffectiveMaxHp(actor)
          : getEffectiveMaxHp(target);
      return Math.floor(Math.max(0, maxHp * (spec.percentOfMaxHp ?? 0)));
    }
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

export interface HealResolveOptions {
  atkScaleOverride?: number;
  effectSpecialIncrease?: DamageIncreaseSpec;
  gameData?: Pick<import('./types.ts').GameData, 'skillRegistry' | 'combatModuleRegistry'>;
}

/** 直接 heal 用。damageIncrease（パッシブ + effect）→ healReceivedIncrease の順。HoT 非対象。 */
export function resolveHealAmount(
  actor: CombatantState,
  target: CombatantState,
  amount: ResourceAmountSpec,
  passives: Record<string, PassiveSkillDef>,
  options: HealResolveOptions = {},
): number {
  const increaseMul = resolveOutgoingHealSpecialMultiplier(actor, target, passives);
  const effectMul = options.effectSpecialIncrease
    ? resolveDamageIncreaseMultiplier(
        actor,
        target,
        options.effectSpecialIncrease,
        options.gameData,
      )
    : 1;
  const baseAmount = Math.floor(
    resolvePowerAmount(
      actor,
      target,
      amount,
      passives,
      options.atkScaleOverride,
    ) *
      increaseMul *
      effectMul,
  );
  return resolveIncomingHealAmount(target, baseAmount, passives);
}

export function resolveHotAmountFromStatus(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
): number {
  const baseSpec =
    effect.amount ??
    ({ kind: 'atkBased', atkScale: effect.powerMultiplier ?? 1 } satisfies ResourceAmountSpec);
  const spec =
    effect.skillId !== undefined
      ? resolveEffectiveAmountSpec(source, passives, baseSpec, {
          skillId: effect.skillId,
          ...(effect.effectIndex !== undefined
            ? { effectIndex: effect.effectIndex }
            : effect.id.startsWith('passive_hot_')
              ? { passiveAmountField: 'hotAmount' as const }
              : {}),
        })
      : baseSpec;
  return resolveResourceAmount(source, target, spec, passives);
}

export interface DotTickOptions {
  effectDamageIncrease?: DamageIncreaseSpec;
  effectDefenseIgnore?: DefenseIgnoreSpec;
  statusEffect?: StatusEffect;
  dotTickDamageMul?: number;
  allies?: CombatantState[];
  /** seedFlame / blazingFlame: stack 数で tick 量を乗算 */
  stackMultiplier?: number;
}

export function resolveDotAmountFromStatus(
  source: CombatantState,
  target: CombatantState,
  effect: StatusEffect,
  passives: Record<string, PassiveSkillDef>,
  allies: CombatantState[] = [],
): number {
  const baseSpec =
    effect.amount ??
    ({ kind: 'atkBased', atkScale: effect.powerMultiplier ?? 1 } satisfies ResourceAmountSpec);
  const spec =
    effect.skillId !== undefined
      ? resolveEffectiveAmountSpec(source, passives, baseSpec, {
          skillId: effect.skillId,
          ...(effect.effectIndex !== undefined ? { effectIndex: effect.effectIndex } : {}),
        })
      : baseSpec;
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
      dotTickDamageMul: effect.dotTickDamageMul,
      allies,
      stackMultiplier:
        effect.dotFlavor === 'seedFlame' ||
        effect.dotFlavor === 'blazingFlame'
          ? Math.max(1, effect.stacks ?? 1)
          : 1,
    },
  );
}

export function applyHealToTarget(
  target: CombatantState,
  amount: number,
): number {
  const before = target.hp;
  target.hp = Math.min(getEffectiveMaxHp(target), target.hp + amount);
  return target.hp - before;
}

/** 直接 heal の試行量から maxHp 超過分（余剰）を算出。HP はまだ変えない。 */
export function computeInstantHealExcess(
  target: CombatantState,
  attemptedHeal: number,
): number {
  if (attemptedHeal <= 0) return 0;
  const hpBefore = target.hp;
  const afterHealHp = Math.min(
    getEffectiveMaxHp(target),
    hpBefore + attemptedHeal,
  );
  return Math.max(0, attemptedHeal - (afterHealHp - hpBefore));
}

/** `barrierStack: true` のみ加算。未指定は max(既存, grant) */
export function resolveBarrierStack(barrierStack?: boolean): boolean {
  return barrierStack === true;
}

export function applyBarrierToTarget(
  target: CombatantState,
  grant: number,
  stack?: boolean,
): number {
  if (grant <= 0) return 0;
  if (resolveBarrierStack(stack)) {
    target.barrierHp += grant;
  } else {
    target.barrierHp = Math.max(target.barrierHp, grant);
  }
  return grant;
}

export interface DamageApplicationResult {
  hpDamage: number;
  barrierDamage: number;
  lethal: boolean;
}

export function applyDefenseMitigation(
  rawDamage: number,
  defender: CombatantState,
  damageType: DamageType,
): number {
  if (rawDamage <= 0) return 0;

  const effectiveDef = getEffectiveDef(defender);
  const effectiveRes = getEffectiveRes(defender);

  let afterDefense: number;
  if (damageType === 'magic') {
    afterDefense = Math.floor((rawDamage * 100) / (100 + effectiveRes));
  } else {
    const afterSubtract = rawDamage - effectiveDef;
    if (afterSubtract <= 0) {
      return 0;
    }
    afterDefense = Math.floor((afterSubtract * 100) / (100 + effectiveDef));
  }

  const takenMul = getDamageTakenMultiplier(defender);
  return Math.floor(afterDefense * takenMul);
}

export function applyDamageToTarget(
  target: CombatantState,
  rawDamage: number,
): DamageApplicationResult {
  if (isInvulnerable(target)) {
    return { hpDamage: 0, barrierDamage: 0, lethal: false };
  }
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

/** 確定済みダメージを HP のみに適用（Barrier / DEF 等は再適用しない） */
export function applyConfirmedHpDamage(
  target: CombatantState,
  amount: number,
): DamageApplicationResult {
  if (amount <= 0) {
    return { hpDamage: 0, barrierDamage: 0, lethal: false };
  }
  if (isInvulnerable(target)) {
    return { hpDamage: 0, barrierDamage: 0, lethal: false };
  }
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return {
    hpDamage: hpBefore - target.hp,
    barrierDamage: 0,
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
  /** damage effect: resolveDamage 内で damageTakenMul を 1.0 として計算 */
  ignoreDamageTakenReduction?: boolean;
  gameData?: Pick<import('./types.ts').GameData, 'skillRegistry' | 'combatModuleRegistry'>;
}

export function resolveDamage(
  attacker: CombatantState,
  target: CombatantState,
  effect: DamageSkillEffect,
  passives: Record<string, PassiveSkillDef>,
  atkScaleOverride?: number,
  passiveContext?: PassiveDamageContext,
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
    options.gameData,
  );

  const chargeMul = consumeNextOutgoingDamageMultiplier(attacker);
  const hpRatioDamageMul = resolveTargetHpRatioDamageScale(
    target,
    passives,
    attacker,
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
      increaseMul *
      chargeMul *
      hpRatioDamageMul,
  );

  const ignoreSpecs = [
    getPassiveDefenseIgnoreSpec(attacker, target, passives),
    rollDefenseIgnoreSpec(
      options.effectDefenseIgnore ?? effect.defenseIgnore,
    ),
    rollDefenseIgnoreSpec(options.statusDefenseIgnore),
  ];

  const damageType: DamageType = effect.damageType ?? attacker.traits.damageType;
  const ignoreDr = options.ignoreDamageTakenReduction === true;
  const rawDef = getEffectiveDef(target);
  const effectiveDef = applyDefenseIgnoreToDef(rawDef, ignoreSpecs);
  const effectiveRes = applyDefenseIgnoreToRes(
    getEffectiveRes(target),
    ignoreSpecs,
  );

  let afterDefense: number;
  let ignoredDefBonus = 0;
  if (damageType === 'magic') {
    afterDefense = Math.floor((baseDamage * 100) / (100 + effectiveRes));
  } else {
    const ignoredDef = Math.max(0, rawDef - effectiveDef);
    ignoredDefBonus = Math.floor(
      ignoredDef * getPassiveIgnoredDefBonusScale(attacker, passives),
    );
    const afterSubtract = baseDamage - effectiveDef;
    if (afterSubtract <= 0) {
      afterDefense = 0;
    } else {
      afterDefense = Math.floor(
        (afterSubtract * 100) / (100 + effectiveDef),
      );
    }
  }

  const subtotal = afterDefense + ignoredDefBonus;
  const finisherMul =
    target.isEnemy && context.allies && context.allies.length > 0
      ? resolvePartyFinisherDamageMultiplier(
          target,
          context.allies,
          passives,
        )
      : 1;
  const takenMul = ignoreDr
    ? 1
    : getDamageTakenMultiplier(target) *
      (damageType === 'magic'
        ? resolveBlazingFlameMagicDamageTakenMultiplier(target) *
          resolveDfPaladinM2MagicExtraDamageTakenMultiplier(target)
        : 1);
  return Math.max(1, Math.floor(subtotal * takenMul * finisherMul));
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
  const tickMul = options.dotTickDamageMul ?? 1;
  const stackMul = options.stackMultiplier ?? 1;
  const scaledAmount: ResourceAmountSpec =
    (tickMul === 1 && stackMul === 1) || amount.kind !== 'atkBased'
      ? amount
      : {
          ...amount,
          atkScale: (amount.atkScale ?? 1) * tickMul * stackMul,
        };
  return resolveDamage(
    source,
    target,
    {
      type: 'damage',
      target: { kind: 'distance', side: 'enemy', order: 'nearest' },
      damageType,
      amount: scaledAmount,
    },
    passives,
    {
      effectDamageIncrease:
        options.effectDamageIncrease ?? status?.damageIncrease,
      effectDefenseIgnore:
        options.effectDefenseIgnore ?? status?.defenseIgnore,
      passiveContext: {
        allies: options.allies,
      },
    },
  );
}

export type { StatusEffect };
