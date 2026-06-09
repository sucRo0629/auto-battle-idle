import { applyBarrierToTarget, getPassiveDefs } from './combatMath.ts';
import { resolveDamageIncreaseMultiplier } from './damageIncrease.ts';
import { resolveSkillTrigger } from './skillTrigger.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  DamageIncreaseSpec,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillCooldown,
  SkillEffectDef,
  StatusEffect,
  TargetShape,
} from './types.ts';

const PARTY_HOT_AURA_DURATION_SEC = 99999;

export interface PassiveDamageContext {
  skill?: ActiveSkillDef;
  slotKind?: SkillCooldown['slotKind'];
  crowdHitCount?: number;
  targetShape?: TargetShape;
}

export function initializeCountTriggerCooldowns(
  unit: CombatantState,
  actives: Record<string, ActiveSkillDef>,
): void {
  for (const cd of unit.cooldowns) {
    if (cd.slotKind !== 'active') continue;
    const skill = actives[cd.skillId];
    if (!skill) continue;
    const trigger = resolveSkillTrigger(skill);
    if (trigger.kind === 'time') continue;
    cd.remaining = trigger.value;
  }
}

export function rollsEvasion(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  const defs = getPassiveDefs(target, passives);
  let chance = 0;
  for (const passive of defs) {
    if (passive.effect === 'evasionChance') {
      chance += passive.evasionChance ?? 0;
    }
  }
  if (chance <= 0) return false;
  return Math.random() < Math.min(1, chance);
}

export function getPassiveDamageIncreaseMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = 1;
  for (const passive of getPassiveDefs(attacker, passives)) {
    if (passive.effect !== 'damageIncrease' || !passive.damageIncrease) continue;
    mul *= resolveDamageIncreaseMultiplier(
      attacker,
      target,
      passive.damageIncrease,
    );
  }
  return mul;
}

export function getPassiveOutgoingDamageMultiplier(
  attacker: CombatantState,
  _target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  context: PassiveDamageContext = {},
): number {
  const defs = getPassiveDefs(attacker, passives);
  let mul = 1;

  for (const passive of defs) {
    if (passive.effect !== 'aoeCrowdBonus') continue;
    const shape = context.targetShape;
    const hits = context.crowdHitCount ?? 0;
    if ((shape === 'aoe' || shape === 'scatter') && hits > 1) {
      const per = passive.perExtraTargetScale ?? 0;
      const cap = passive.maxExtraTargets ?? 0;
      const extra = Math.min(hits - 1, cap);
      mul *= 1 + extra * per;
    }
  }

  return mul;
}

export function resolveEffectDamageIncreaseMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  effectIncrease: DamageIncreaseSpec | undefined,
  statusIncrease: DamageIncreaseSpec | undefined,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = getPassiveDamageIncreaseMultiplier(attacker, target, passives);
  if (effectIncrease) {
    mul *= resolveDamageIncreaseMultiplier(attacker, target, effectIncrease);
  }
  if (statusIncrease) {
    mul *= resolveDamageIncreaseMultiplier(attacker, target, statusIncrease);
  }
  return mul;
}

export function applyDamageTakenToHeal(
  target: CombatantState,
  damage: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (!target.isAlive || damage <= 0) return 0;
  const defs = getPassiveDefs(target, passives);
  let heal = 0;
  for (const passive of defs) {
    if (passive.effect !== 'damageTakenToHeal') continue;
    heal += Math.floor(damage * (passive.ratio ?? 0));
  }
  if (heal <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + heal);
  return target.hp - before;
}

export function applyExcessHealToBarrierFromPassive(
  actor: CombatantState,
  target: CombatantState,
  attemptedHeal: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (attemptedHeal <= 0) return 0;
  const defs = getPassiveDefs(actor, passives);
  let scaleSum = 0;
  for (const passive of defs) {
    if (passive.effect !== 'excessHealToBarrier') continue;
    scaleSum += passive.barrierScale ?? 1;
  }
  if (scaleSum <= 0) return 0;

  const hpBefore = target.hp;
  const afterHealHp = Math.min(target.maxHp, hpBefore + attemptedHeal);
  const excess = attemptedHeal - (afterHealHp - hpBefore);
  if (excess <= 0) return 0;

  const grant = Math.floor(excess * scaleSum);
  if (grant <= 0) return 0;
  return applyBarrierToTarget(target, grant, false);
}

export function resolveDebuffDurationWithPassives(
  actor: CombatantState,
  durationSec: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  let duration = durationSec;
  for (const passive of getPassiveDefs(actor, passives)) {
    if (passive.effect !== 'extendSelfAppliedDebuff') continue;
    if (passive.extendSec !== undefined) {
      duration += passive.extendSec;
    }
    if (passive.durationMultiplier !== undefined) {
      duration *= passive.durationMultiplier;
    }
  }
  return duration;
}

export function syncPartyHotAuras(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const ally of allies) {
    ally.statusEffects = ally.statusEffects.filter(
      (effect) => !effect.id.startsWith('party_hot_'),
    );
  }

  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'partyHotAura' || !passive.partyHotAuraAmount) {
        continue;
      }
      for (const target of allies) {
        if (!target.isAlive) continue;
        target.statusEffects.push(
          createPartyHotAuraEffect(source, passive.partyHotAuraAmount),
        );
      }
    }
  }
}

function createPartyHotAuraEffect(
  source: CombatantState,
  amount: ResourceAmountSpec,
): StatusEffect {
  return {
    id: `party_hot_${source.id}`,
    kind: 'buff',
    overlay: 'hot',
    amount,
    sourceId: source.id,
    multiplier: 1,
    durationSec: PARTY_HOT_AURA_DURATION_SEC,
    remainingSec: PARTY_HOT_AURA_DURATION_SEC,
    tickSec: 1,
  };
}

export function stripPassivesAurasFromSource(
  sourceId: string,
  allies: CombatantState[],
): void {
  for (const ally of allies) {
    ally.statusEffects = ally.statusEffects.filter(
      (effect) =>
        effect.sourceId !== sourceId || !effect.id.startsWith('party_hot_'),
    );
  }
}

export function countDamageTargetsInResolution(
  effectDef: SkillEffectDef,
  waves: Array<{ targets: unknown[] }>,
): number {
  if (effectDef.type !== 'damage') return 0;
  return waves.reduce((sum, wave) => sum + wave.targets.length, 0);
}

export interface PeriodicDispelPassiveState {
  passiveId: string;
  remainingSec: number;
}

export function initializePeriodicDispelStates(
  unit: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): PeriodicDispelPassiveState[] {
  return getPassiveDefs(unit, passives)
    .filter((passive) => passive.effect === 'periodicDispel')
    .map((passive) => ({
      passiveId: passive.id,
      remainingSec: passive.intervalSec ?? 1,
    }));
}

export function tickPeriodicDispelStates(
  states: PeriodicDispelPassiveState[],
  passives: Record<string, PassiveSkillDef>,
  deltaTime: number,
): PeriodicDispelPassiveState[] {
  return states.map((state) => {
    const passive = passives[state.passiveId];
    const interval = passive?.intervalSec ?? 1;
    let remainingSec = state.remainingSec - deltaTime;
    if (remainingSec <= 0) {
      remainingSec = interval;
    }
    return { ...state, remainingSec };
  });
}

export function getPeriodicDispelReady(
  before: PeriodicDispelPassiveState[],
  after: PeriodicDispelPassiveState[],
): string[] {
  const ready: string[] = [];
  for (let i = 0; i < after.length; i++) {
    const prev = before[i];
    const next = after[i];
    if (!prev || !next) continue;
    if (next.remainingSec > prev.remainingSec) {
      ready.push(next.passiveId);
    }
  }
  return ready;
}
