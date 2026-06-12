import type { BattleEventListener } from './events.ts';
import {
  applyKnockbackToTarget,
  applyStunToTarget,
} from './ccEffects.ts';
import {
  applyDamageToTarget,
  applyDefenseMitigation,
  getPassiveDefs,
  resolveResourceAmount,
} from './combatMath.ts';
import {
  stripPassivesAurasFromSource,
} from './passiveEffects.ts';
import { isRangedAttack } from './data/entityTraits.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import type {
  CombatantState,
  CounterAttackRangeBandFilter,
  CounterResponseDef,
  DamageType,
  PassiveSkillDef,
  StatusEffect,
} from './types.ts';
import { asStatusEffectStatList } from './types.ts';

export type CounterAttackKind = 'damage' | 'dot';

export interface CounterRetaliationContext {
  attackKind: CounterAttackKind;
  appliedDamage: number;
  isCounterDamage?: boolean;
  /** 被攻撃の実効射程（px）。未指定時は帯フィルタを適用しない */
  attackRangePx?: number;
}

export interface CounterRetaliationCallbacks {
  emit: BattleEventListener;
  getAllCombatants: () => CombatantState[];
  onDamageApplied?: (
    actor: CombatantState,
    target: CombatantState,
    amount: number,
    meta?: {
      attackKind: CounterAttackKind;
      isCounterDamage?: boolean;
      hpDamage?: number;
    },
  ) => void;
  getSkillName?: (skillId: string) => string;
  onUnitDied?: (unit: CombatantState) => void;
  onDebuffApplied?: (actor: CombatantState) => void;
}

export interface GrantCounterStatusParams {
  responses: CounterResponseDef[];
  durationSec: number;
  range?: number;
  counterMelee?: boolean;
  counterRanged?: boolean;
  skillId: string;
  sourceId?: string;
}

export function matchesCounterAttackRangeBand(
  attackRangePx: number | undefined,
  filter: CounterAttackRangeBandFilter,
): boolean {
  const { counterMelee, counterRanged } = filter;
  if (!counterMelee && !counterRanged) return true;
  if (attackRangePx === undefined) return true;
  const rangeFilters: boolean[] = [];
  if (counterMelee) {
    rangeFilters.push(!isRangedAttack(attackRangePx));
  }
  if (counterRanged) {
    rangeFilters.push(isRangedAttack(attackRangePx));
  }
  return rangeFilters.some((value) => value);
}

/** 反撃射程: 未指定または 0 のときは持有者 traits.rangePx */
export function resolveCounterRangePx(
  configuredRange: number | undefined,
  victim: CombatantState,
): number {
  if (configuredRange !== undefined && configuredRange !== 0) {
    return configuredRange;
  }
  return victim.traits.rangePx;
}

export function grantCounterStatus(
  unit: CombatantState,
  params: GrantCounterStatusParams,
): StatusEffect {
  const appliedAt = Date.now();
  const effect: StatusEffect = {
    id: `${params.skillId}_counter_${appliedAt}`,
    kind: 'buff',
    overlay: 'counter',
    responses: params.responses,
    counterRangePx: params.range,
    ...(params.counterMelee ? { counterMelee: true } : {}),
    ...(params.counterRanged ? { counterRanged: true } : {}),
    multiplier: 1,
    durationSec: params.durationSec,
    remainingSec: params.durationSec,
    sourceId: params.sourceId ?? unit.id,
    skillId: params.skillId,
  };
  unit.statusEffects.push(effect);
  return effect;
}

export function isCounterInTriggerRange(
  counterEffect: StatusEffect,
  victim: CombatantState,
  attacker: CombatantState,
): boolean {
  if (attacker.id === victim.id) return false;
  const rangePx = resolveCounterRangePx(
    counterEffect.counterRangePx,
    victim,
  );
  return isWithinSkillRange(attacker, victim, rangePx);
}

function isPassiveCounterInRange(
  passive: PassiveSkillDef,
  victim: CombatantState,
  attacker: CombatantState,
): boolean {
  if (attacker.id === victim.id) return false;
  const rangePx = resolveCounterRangePx(passive.counterRange, victim);
  return isWithinSkillRange(attacker, victim, rangePx);
}

function emitCounterSkillEvent(
  callbacks: CounterRetaliationCallbacks,
  victim: CombatantState,
  attacker: CombatantState,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  statusLabel: string,
  amount?: number,
): void {
  const skillId = counterEffect.skillId ?? '';
  callbacks.emit({
    type: 'skill',
    actorId: victim.id,
    targetId: attacker.id,
    skillId,
    skillName: callbacks.getSkillName?.(skillId) ?? '反撃',
    effect: 'counter',
    ...(amount !== undefined ? { amount } : {}),
    statusLabel,
  });
}

function applyCounterDamageResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: Extract<CounterResponseDef, { kind: 'damage' }>,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  passives: Record<string, PassiveSkillDef>,
  callbacks: CounterRetaliationCallbacks,
): void {
  const rawAmount = resolveResourceAmount(
    victim,
    attacker,
    response.amount,
    passives,
  );
  if (rawAmount <= 0) return;

  const damageType: DamageType = response.damageType ?? 'physical';
  const mitigated = applyDefenseMitigation(rawAmount, attacker, damageType);
  if (mitigated <= 0) return;

  const damageResult = applyDamageToTarget(attacker, mitigated);
  const appliedCounter =
    damageResult.hpDamage + damageResult.barrierDamage;
  if (appliedCounter <= 0) return;

  callbacks.onDamageApplied?.(victim, attacker, appliedCounter, {
    attackKind: 'damage',
    isCounterDamage: true,
    hpDamage: damageResult.hpDamage,
  });

  emitCounterSkillEvent(
    callbacks,
    victim,
    attacker,
    counterEffect,
    'damage',
    mitigated,
  );
  callbacks.emit({ type: 'hurt', targetId: attacker.id });

  if (damageResult.lethal) {
    attacker.isAlive = false;
    if (!attacker.isEnemy) {
      stripPassivesAurasFromSource(
        attacker.id,
        callbacks.getAllCombatants(),
      );
    }
    callbacks.onUnitDied?.(attacker);
  }
}

function applyCounterDebuffResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: Extract<CounterResponseDef, { kind: 'debuff' }>,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  _passives: Record<string, PassiveSkillDef>,
  callbacks: CounterRetaliationCallbacks,
): void {
  const stats = asStatusEffectStatList(response.debuffStat);
  const multiplier = response.debuffMultiplier;
  const flatBonus = response.debuffFlatBonus;
  if (
    stats.length === 0 ||
    (multiplier === undefined && flatBonus === undefined)
  ) {
    return;
  }

  const duration = response.debuffDurationSec;

  const appliedAt = Date.now();
  const skillId = counterEffect.skillId ?? 'counter';
  const statusLabels: string[] = [];

  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i]!;
    attacker.statusEffects.push({
      id: `${skillId}_counter_debuff_${stat}_${appliedAt}_${i}`,
      kind: 'debuff',
      stat,
      multiplier: multiplier ?? 1,
      durationSec: duration,
      remainingSec: duration,
      ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
      sourceId: victim.id,
      skillId,
    });
    statusLabels.push(stat);
  }

  if (!victim.isEnemy && attacker.isEnemy) {
    callbacks.onDebuffApplied?.(victim);
  }

  emitCounterSkillEvent(
    callbacks,
    victim,
    attacker,
    counterEffect,
    `debuff:${statusLabels.join(',')}`,
  );
}

function applyCounterDotResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: Extract<CounterResponseDef, { kind: 'dot' }>,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  callbacks: CounterRetaliationCallbacks,
): void {
  const appliedAt = Date.now();
  const skillId = counterEffect.skillId ?? 'counter';
  attacker.statusEffects.push({
    id: `${skillId}_counter_dot_${appliedAt}`,
    kind: 'debuff',
    overlay: 'dot',
    multiplier: 1,
    durationSec: response.durationSec,
    remainingSec: response.durationSec,
    powerMultiplier: response.powerMultiplier,
    sourceId: victim.id,
    skillId,
    damageType: response.damageType ?? 'physical',
    ...(response.damageIncrease
      ? { damageIncrease: response.damageIncrease }
      : {}),
    ...(response.defenseIgnore
      ? { defenseIgnore: response.defenseIgnore }
      : {}),
    tickSec: 1,
  });

  emitCounterSkillEvent(
    callbacks,
    victim,
    attacker,
    counterEffect,
    'dot',
  );
}

function applyCounterStunResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: Extract<CounterResponseDef, { kind: 'stun' }>,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  callbacks: CounterRetaliationCallbacks,
): void {
  const skillId = counterEffect.skillId ?? 'counter';
  const applied = applyStunToTarget(attacker, response.durationSec, {
    skillId,
    sourceId: victim.id,
  });
  if (!applied) return;

  emitCounterSkillEvent(
    callbacks,
    victim,
    attacker,
    counterEffect,
    'stun',
  );
}

function applyCounterKnockbackResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: Extract<CounterResponseDef, { kind: 'knockback' }>,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  callbacks: CounterRetaliationCallbacks,
): void {
  const applied = applyKnockbackToTarget(attacker, response.distancePx);
  if (!applied) return;

  emitCounterSkillEvent(
    callbacks,
    victim,
    attacker,
    counterEffect,
    'knockback',
  );
}

function applyCounterResponse(
  victim: CombatantState,
  attacker: CombatantState,
  response: CounterResponseDef,
  counterEffect: Pick<StatusEffect, 'skillId'>,
  passives: Record<string, PassiveSkillDef>,
  callbacks: CounterRetaliationCallbacks,
): void {
  switch (response.kind) {
    case 'damage':
      applyCounterDamageResponse(
        victim,
        attacker,
        response,
        counterEffect,
        passives,
        callbacks,
      );
      break;
    case 'debuff':
      applyCounterDebuffResponse(
        victim,
        attacker,
        response,
        counterEffect,
        passives,
        callbacks,
      );
      break;
    case 'dot':
      applyCounterDotResponse(
        victim,
        attacker,
        response,
        counterEffect,
        callbacks,
      );
      break;
    case 'stun':
      applyCounterStunResponse(
        victim,
        attacker,
        response,
        counterEffect,
        callbacks,
      );
      break;
    case 'knockback':
      applyCounterKnockbackResponse(
        victim,
        attacker,
        response,
        counterEffect,
        callbacks,
      );
      break;
  }
}

export function applyPassiveCounterRetaliation(
  victim: CombatantState,
  attacker: CombatantState,
  ctx: CounterRetaliationContext,
  passives: Record<string, PassiveSkillDef>,
  callbacks: CounterRetaliationCallbacks,
): void {
  if (ctx.isCounterDamage) return;
  if (!victim.isAlive || !attacker.isAlive) return;
  if (ctx.appliedDamage <= 0) return;
  if (ctx.attackKind !== 'damage' && ctx.attackKind !== 'dot') return;

  for (const passive of getPassiveDefs(victim, passives)) {
    if (passive.effect !== 'counter') continue;
    const chance = passive.chance ?? 0;
    const responses = passive.counterResponses;
    if (chance <= 0 || !responses?.length) continue;
    if (!isPassiveCounterInRange(passive, victim, attacker)) continue;
    if (
      !matchesCounterAttackRangeBand(ctx.attackRangePx, {
        counterMelee: passive.counterMelee,
        counterRanged: passive.counterRanged,
      })
    ) {
      continue;
    }
    if (Math.random() >= chance) continue;

    const counterRef = { skillId: passive.id };
    for (const response of responses) {
      applyCounterResponse(
        victim,
        attacker,
        response,
        counterRef,
        passives,
        callbacks,
      );
    }
  }
}

export function applyCounterRetaliation(
  victim: CombatantState,
  attacker: CombatantState,
  ctx: CounterRetaliationContext,
  passives: Record<string, PassiveSkillDef>,
  callbacks: CounterRetaliationCallbacks,
): void {
  if (ctx.isCounterDamage) return;
  if (!victim.isAlive || !attacker.isAlive) return;
  if (ctx.appliedDamage <= 0) return;
  if (ctx.attackKind !== 'damage' && ctx.attackKind !== 'dot') return;

  const counters = victim.statusEffects.filter(
    (effect) =>
      effect.overlay === 'counter' &&
      effect.remainingSec > 0 &&
      effect.responses &&
      effect.responses.length > 0,
  );
  if (counters.length === 0) return;

  for (const counterEffect of counters) {
    if (!isCounterInTriggerRange(counterEffect, victim, attacker)) continue;
    if (
      !matchesCounterAttackRangeBand(ctx.attackRangePx, {
        counterMelee: counterEffect.counterMelee,
        counterRanged: counterEffect.counterRanged,
      })
    ) {
      continue;
    }

    for (const response of counterEffect.responses!) {
      applyCounterResponse(
        victim,
        attacker,
        response,
        counterEffect,
        passives,
        callbacks,
      );
    }
  }
}
