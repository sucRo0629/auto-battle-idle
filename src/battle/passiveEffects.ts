import { getPassiveDefs } from './combatMath.ts';
import { resolveSkillTrigger } from './skillTrigger.ts';
import type {
  ActiveSkillDef,
  CombatantState,
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

export function feedBasicAttackToActives(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  actives: Record<string, ActiveSkillDef>,
): void {
  const defs = getPassiveDefs(actor, passives).filter(
    (p) => p.effect === 'basicAttackFeedsActive',
  );
  if (defs.length === 0) return;

  const feedSkillIds = new Set(
    defs
      .map((p) => p.feedActiveSkillId)
      .filter((id): id is string => Boolean(id)),
  );
  const filterBySkillId = feedSkillIds.size > 0;

  for (const cd of actor.cooldowns) {
    if (cd.slotKind !== 'active' || cd.remaining <= 0) continue;
    const skill = actives[cd.skillId];
    if (!skill) continue;
    if (resolveSkillTrigger(skill).kind !== 'basicAttackCount') continue;
    if (filterBySkillId && !feedSkillIds.has(cd.skillId)) continue;
    cd.remaining = Math.max(0, cd.remaining - 1);
  }
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

function hasDotFromSource(
  target: CombatantState,
  sourceId: string,
  selfAppliedOnly: boolean,
): boolean {
  return target.statusEffects.some(
    (effect) =>
      effect.overlay === 'dot' &&
      effect.remainingSec > 0 &&
      (!selfAppliedOnly || effect.sourceId === sourceId),
  );
}

function hasAnyDot(target: CombatantState): boolean {
  return target.statusEffects.some(
    (effect) => effect.overlay === 'dot' && effect.remainingSec > 0,
  );
}

export function getPassiveOutgoingDamageMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  context: PassiveDamageContext = {},
): number {
  const defs = getPassiveDefs(attacker, passives);
  let mul = 1;

  for (const passive of defs) {
    switch (passive.effect) {
      case 'selfLowHpDamageScale': {
        const scale = passive.scale ?? 0;
        const maxMul = passive.maxMul ?? 1;
        const missingRatio = 1 - attacker.hp / attacker.maxHp;
        mul *= Math.min(maxMul, 1 + scale * missingRatio);
        break;
      }
      case 'heavyStrikeDamageScale': {
        const skill = context.skill;
        if (
          skill &&
          resolveSkillTrigger(skill).kind === 'basicAttackCount'
        ) {
          mul *= passive.scale ?? 1;
        }
        break;
      }
      case 'damageVsDotTarget': {
        const selfOnly = passive.selfAppliedOnly ?? false;
        const dotted = selfOnly
          ? hasDotFromSource(target, attacker.id, true)
          : hasAnyDot(target);
        if (dotted) {
          mul *= passive.scale ?? 1;
        }
        break;
      }
      case 'aoeCrowdBonus': {
        const shape = context.targetShape;
        const hits = context.crowdHitCount ?? 0;
        if (
          (shape === 'aoe' || shape === 'scatter') &&
          hits > 1
        ) {
          const per = passive.perExtraTargetScale ?? 0;
          const cap = passive.maxExtraTargets ?? 0;
          const extra = Math.min(hits - 1, cap);
          mul *= 1 + extra * per;
        }
        break;
      }
    }
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

export function applyHealBarrierFromPassive(
  actor: CombatantState,
  target: CombatantState,
  healAmount: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (healAmount <= 0) return 0;
  const defs = getPassiveDefs(actor, passives);
  let grant = 0;
  for (const passive of defs) {
    if (passive.effect !== 'healAppliesBarrier') continue;
    grant += Math.floor(healAmount * (passive.barrierScale ?? 1));
  }
  if (grant <= 0) return 0;
  target.barrierHp += grant;
  return grant;
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
