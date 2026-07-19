import type {
  ActiveSkillDef,
  CombatantState,
  PassiveSkillDef,
  SkillCooldown,
  SkillTrigger,
  SkillTriggerKind,
} from './types.ts';
import { getPassiveAttackIntervalScale } from './passiveEffects.ts';

interface CooldownResolveOptions {
  unit?: CombatantState;
  passives?: Record<string, PassiveSkillDef>;
}

export function resolveSkillTrigger(skill: ActiveSkillDef): SkillTrigger {
  if (skill.trigger) return skill.trigger;
  throw new Error(`Skill ${skill.id} is missing trigger`);
}

export function isTimeTrigger(skill: ActiveSkillDef): boolean {
  return resolveSkillTrigger(skill).kind === 'time';
}

/** time trigger value 0 = チャージ不要（常時 remaining 0、CD tick なし） */
export function isNoChargeTimeTrigger(skill: ActiveSkillDef): boolean {
  const trigger = resolveSkillTrigger(skill);
  return trigger.kind === 'time' && trigger.value === 0;
}

export function resolveCooldownRemainingForSkill(
  skill: ActiveSkillDef,
  options: CooldownResolveOptions = {},
): number {
  const base = resolveSkillTrigger(skill).value;
  if (!options.unit || !options.passives) return base;
  if (skill.slotKind !== 'basic') return base;
  return base * getPassiveAttackIntervalScale(options.unit, options.passives);
}

/** finalWaveStart 等のイベント発動直前に CD を強制リセット */
export function forceActiveCooldownReady(cd: SkillCooldown): void {
  cd.remaining = 0;
  cd.fireHoldSinceSec = undefined;
}

export function isPausableActiveTriggerKind(kind: SkillTriggerKind): boolean {
  return kind === 'time' || kind === 'hitsTaken';
}

export function isPausableActiveTrigger(skill: ActiveSkillDef): boolean {
  return isPausableActiveTriggerKind(resolveSkillTrigger(skill).kind);
}

/** use lock は CD を止めず、time / hitsTaken の active も継続進行する */
export function shouldPauseActiveCooldown(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
): boolean {
  if (cd.slotKind !== 'active') return false;
  if (!isPausableActiveTrigger(skill)) return false;
  return false;
}

export function isCountTriggerKind(kind: SkillTriggerKind): boolean {
  return kind === 'basicAttackCount' || kind === 'hitsTaken';
}

export function isCountTriggerSkill(skill: ActiveSkillDef): boolean {
  return isCountTriggerKind(resolveSkillTrigger(skill).kind);
}

export function isCountTriggerReady(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
): boolean {
  return (
    cd.slotKind === 'active' &&
    cd.remaining === 0 &&
    isCountTriggerSkill(skill)
  );
}

export function chargeCountTrigger(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
): void {
  if (cd.slotKind !== 'active' || cd.remaining <= 0) return;
  if (!isCountTriggerSkill(skill)) return;
  cd.remaining = Math.max(0, cd.remaining - 1);
}

export function findReadyCountTriggerCooldowns(
  unit: CombatantState,
  kind: SkillTriggerKind,
  actives: Record<string, ActiveSkillDef>,
): SkillCooldown[] {
  return unit.cooldowns
    .filter((cd) => {
      if (cd.slotKind !== 'active' || cd.remaining !== 0) return false;
      const skill = actives[cd.skillId];
      if (!skill) return false;
      return resolveSkillTrigger(skill).kind === kind;
    })
    .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
}

export function resetCooldownAfterFire(
  cd: SkillCooldown,
  skill: ActiveSkillDef,
  options: CooldownResolveOptions = {},
): void {
  cd.remaining = resolveCooldownRemainingForSkill(skill, options);
}

/** ステージ開始時: 全スキル CD を未充填（remaining = trigger.value、0 は即 ready）にする */
export function initializeSkillCooldowns(
  unit: CombatantState,
  actives: Record<string, ActiveSkillDef>,
  options: Omit<CooldownResolveOptions, 'unit'> = {},
): void {
  for (const cd of unit.cooldowns) {
    const skill = actives[cd.skillId];
    if (!skill) continue;
    cd.remaining = resolveCooldownRemainingForSkill(skill, {
      unit,
      passives: options.passives,
    });
    if (cd.slotKind === 'active') {
      cd.storedCharges = 0;
      cd.fireHoldSinceSec = undefined;
    }
  }
}

export function shouldTickCooldown(
  skill: ActiveSkillDef,
  slotKind: SkillCooldown['slotKind'],
): boolean {
  if (slotKind === 'basic') return true;
  if (isNoChargeTimeTrigger(skill)) return false;
  return isTimeTrigger(skill);
}

/** カウントトリガーの充填のみ（remaining > 0 のとき 1 減算） */
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
    chargeCountTrigger(cd, skill);
  }
}

/** 通常攻撃ヒット1回分で、全 basicAttackCount アクティブを1カウント充填 */
export function chargeBasicAttackCountOnHit(
  actor: CombatantState,
  actives: Record<string, ActiveSkillDef>,
): void {
  tickCountTriggerCooldowns(actor.cooldowns, actives, 'basicAttackCount');
}

export interface PendingBasicAttackCountCharge {
  applyAtBattleSec: number;
  actorId: string;
}

/** ヒットタイミングに合わせて basicAttackCount を充填（1 tick あたり actor 1 回まで） */
export function tickPendingBasicAttackCountCharges(
  queue: PendingBasicAttackCountCharge[],
  battleSec: number,
  onCharge: (actorId: string) => void,
): PendingBasicAttackCountCharge[] {
  const chargedActors = new Set<string>();
  const remaining: PendingBasicAttackCountCharge[] = [];
  const sorted = [...queue].sort(
    (a, b) => a.applyAtBattleSec - b.applyAtBattleSec,
  );

  for (const entry of sorted) {
    if (entry.applyAtBattleSec <= battleSec) {
      if (chargedActors.has(entry.actorId)) {
        remaining.push(entry);
        continue;
      }
      onCharge(entry.actorId);
      chargedActors.add(entry.actorId);
    } else {
      remaining.push(entry);
    }
  }
  return remaining;
}
