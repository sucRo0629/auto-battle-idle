import type {
  ActiveSkillDef,
  PassiveSkillDef,
  SkillCooldown,
} from '../types.ts';
import { resolveSkillTrigger } from '../skillTrigger.ts';

export const GLOBAL_MAX_CHARGES_CAP = 5;

export function resolveBaseMaxCharges(skill: ActiveSkillDef): number {
  return skill.maxCharges ?? 1;
}

export function resolveEffectiveMaxCharges(
  skill: ActiveSkillDef,
  passives: PassiveSkillDef[],
  learnedActiveIds?: string[],
): number {
  let bonus = 0;
  for (const passive of passives) {
    if (passive.effect !== 'skillPropertyOverride') continue;
    if (passive.maxChargesBonus === undefined) continue;
    const targets = passive.skillPropertyTargetSkillIds;
    if (targets && targets.length > 0 && !targets.includes(skill.id)) {
      continue;
    }
    if (
      targets === undefined &&
      learnedActiveIds &&
      learnedActiveIds.length > 0 &&
      !learnedActiveIds.includes(skill.id)
    ) {
      continue;
    }
    bonus += passive.maxChargesBonus;
  }
  return Math.min(
    GLOBAL_MAX_CHARGES_CAP,
    Math.max(1, resolveBaseMaxCharges(skill) + bonus),
  );
}

export function resolveFirePolicy(skill: ActiveSkillDef): 'immediate' | 'smart' {
  return skill.firePolicy ?? 'immediate';
}

export function hasAvailableActiveCharge(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
  passives: PassiveSkillDef[],
  learnedActiveIds?: string[],
): boolean {
  if (cd.slotKind !== 'active') return cd.remaining <= 0;
  const max = resolveEffectiveMaxCharges(skill, passives, learnedActiveIds);
  const stored = cd.storedCharges ?? 0;
  if (max <= 1) return cd.remaining <= 0;
  return stored > 0 || cd.remaining <= 0;
}

export function bankReadyChargeIfPossible(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
  passives: PassiveSkillDef[],
  learnedActiveIds?: string[],
): boolean {
  const max = resolveEffectiveMaxCharges(skill, passives, learnedActiveIds);
  if (max <= 1) return false;
  const stored = cd.storedCharges ?? 0;
  if (1 + stored >= max) return false;
  cd.storedCharges = stored + 1;
  cd.remaining = resolveSkillTrigger(skill).value;
  return true;
}

export function consumeActiveChargeOnFire(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
  passives: PassiveSkillDef[],
  learnedActiveIds?: string[],
): void {
  const max = resolveEffectiveMaxCharges(skill, passives, learnedActiveIds);
  cd.fireHoldSinceSec = undefined;
  if (max <= 1) {
    cd.remaining = resolveSkillTrigger(skill).value;
    return;
  }
  const stored = cd.storedCharges ?? 0;
  if (stored > 0) {
    cd.storedCharges = stored - 1;
  }
  cd.remaining = resolveSkillTrigger(skill).value;
}

export function isFireTimeoutExpired(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
  battleTimeSec: number,
): boolean {
  const timeout = skill.fireTimeoutSec;
  if (timeout === undefined || timeout <= 0) return false;
  const since = cd.fireHoldSinceSec;
  if (since === undefined) return false;
  return battleTimeSec - since >= timeout;
}
