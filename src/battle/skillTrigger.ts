import type {
  ActiveSkillDef,
  CombatantState,
  SkillCooldown,
  SkillTrigger,
  SkillTriggerKind,
} from './types.ts';

export function resolveSkillTrigger(skill: ActiveSkillDef): SkillTrigger {
  if (skill.trigger) return skill.trigger;
  const legacy = skill.interval;
  if (typeof legacy === 'number' && !Number.isNaN(legacy)) {
    return { kind: 'time', value: legacy };
  }
  return { kind: 'time', value: 1 };
}

export function isTimeTrigger(skill: ActiveSkillDef): boolean {
  return resolveSkillTrigger(skill).kind === 'time';
}

export function resetCooldownAfterFire(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
): void {
  cd.remaining = resolveSkillTrigger(skill).value;
}

/** ステージ開始時: 全スキル CD を未充填（remaining = trigger.value）にする */
export function initializeSkillCooldowns(
  unit: CombatantState,
  actives: Record<string, ActiveSkillDef>,
): void {
  for (const cd of unit.cooldowns) {
    const skill = actives[cd.skillId];
    if (!skill) continue;
    cd.remaining = resolveSkillTrigger(skill).value;
  }
}

export function shouldTickCooldown(
  skill: ActiveSkillDef,
  slotKind: SkillCooldown['slotKind'],
): boolean {
  if (slotKind === 'basic') return true;
  return isTimeTrigger(skill);
}

export function tickCountTriggerCooldowns(
  cooldowns: SkillCooldown[],
  skillById: Record<string, ActiveSkillDef>,
  kind: SkillTriggerKind,
): void {
  for (const cd of cooldowns) {
    if (cd.slotKind !== 'active' || cd.remaining <= 0) continue;
    const skill = skillById[cd.skillId];
    if (!skill) continue;
    if (resolveSkillTrigger(skill).kind !== kind) continue;
    cd.remaining = Math.max(0, cd.remaining - 1);
  }
}
