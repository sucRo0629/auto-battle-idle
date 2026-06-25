import { getEffectiveAtk } from "./combatMath.ts";
import type {
  ActiveSkillDef,
  CombatantState,
  ArenaDominanceSkillEffect,
} from "./types.ts";

export const ARENA_DOMINANCE_OVERLAY = "arenaDominance" as const;
export const ARENA_MARK_OVERLAY = "arenaMark" as const;
export const ARENA_MARK_DISPLAY_NAME = "闘士の指名";
export const ARENA_DOMINANCE_DURATION_SEC_DEFAULT = 15;
export const ARENA_DOMINANCE_NON_MARK_DAMAGE_MULTIPLIER_DEFAULT = 0.5;
export const ARENA_MARK_NON_DUELIST_DAMAGE_MULTIPLIER_DEFAULT = 0.5;

const ARENA_DOMINANCE_ID_PREFIX = "arena_dominance_";
const ARENA_MARK_ID_PREFIX = "arena_mark_";

export function isArenaDominanceActive(duelist: CombatantState): boolean {
  return duelist.statusEffects.some(
    (effect) =>
      effect.overlay === ARENA_DOMINANCE_OVERLAY && effect.remainingSec > 0
  );
}

export function isArenaMarked(enemy: CombatantState): boolean {
  return enemy.statusEffects.some(
    (effect) => effect.overlay === ARENA_MARK_OVERLAY && effect.remainingSec > 0
  );
}

export function resolveArenaDominanceDurationSec(
  effect: ArenaDominanceSkillEffect,
  skill: ActiveSkillDef
): number {
  return (
    effect.durationSec ??
    skill.arenaDominanceDurationSec ??
    ARENA_DOMINANCE_DURATION_SEC_DEFAULT
  );
}

export function resolveArenaDominanceNonMarkMultiplier(
  effect: ArenaDominanceSkillEffect,
  skill: ActiveSkillDef
): number {
  return (
    effect.nonMarkDamageMultiplier ??
    skill.arenaDominanceNonMarkDamageMultiplier ??
    ARENA_DOMINANCE_NON_MARK_DAMAGE_MULTIPLIER_DEFAULT
  );
}

export function pickHighestAtkEnemy(
  enemies: CombatantState[]
): CombatantState | null {
  const living = enemies.filter((enemy) => enemy.isAlive);
  if (living.length === 0) return null;
  return living.reduce((best, enemy) =>
    getEffectiveAtk(enemy) > getEffectiveAtk(best) ? enemy : best
  );
}

export function grantArenaDominance(
  duelist: CombatantState,
  skillId: string,
  durationSec: number
): void {
  const effectId = `${ARENA_DOMINANCE_ID_PREFIX}${duelist.id}`;
  duelist.statusEffects = duelist.statusEffects.filter(
    (e) => e.id !== effectId
  );
  duelist.statusEffects.push({
    id: effectId,
    kind: "buff",
    overlay: ARENA_DOMINANCE_OVERLAY,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    sourceId: duelist.id,
    skillId,
    displayName: "闘技場の掟",
  });
}

export function grantArenaMark(
  enemy: CombatantState,
  sourceId: string,
  skillId: string,
  durationSec: number
): void {
  const effectId = `${ARENA_MARK_ID_PREFIX}${enemy.id}`;
  enemy.statusEffects = enemy.statusEffects.filter((e) => e.id !== effectId);
  enemy.statusEffects.push({
    id: effectId,
    kind: "debuff",
    overlay: ARENA_MARK_OVERLAY,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    sourceId,
    skillId,
    displayName: ARENA_MARK_DISPLAY_NAME,
    stacks: 1,
  });
}

export function clearArenaDominanceMarks(enemies: CombatantState[]): void {
  for (const enemy of enemies) {
    enemy.statusEffects = enemy.statusEffects.filter(
      (effect) => effect.overlay !== ARENA_MARK_OVERLAY
    );
  }
}

/** 闘技場の掟中: マーク以外の敵からの被ダメを軽減 */
export function applyArenaDominanceDamageMitigation(
  duelist: CombatantState,
  attacker: CombatantState,
  damage: number,
  nonMarkMultiplier: number
): number {
  if (damage <= 0 || !isArenaDominanceActive(duelist)) return damage;
  if (!attacker.isEnemy || isArenaMarked(attacker)) return damage;
  return Math.floor(damage * nonMarkMultiplier);
}

function resolveArenaMarkSourceId(
  markedEnemy: CombatantState
): string | undefined {
  return markedEnemy.statusEffects.find(
    (effect) => effect.overlay === ARENA_MARK_OVERLAY && effect.remainingSec > 0
  )?.sourceId;
}

/** 闘士の指名: 闘技士以外からの被ダメを軽減 */
export function applyArenaMarkDamageMitigation(
  target: CombatantState,
  attacker: CombatantState,
  damage: number,
  multiplier: number = ARENA_MARK_NON_DUELIST_DAMAGE_MULTIPLIER_DEFAULT
): number {
  if (damage <= 0 || !target.isEnemy || !isArenaMarked(target)) return damage;
  const duelistId = resolveArenaMarkSourceId(target);
  if (!duelistId || attacker.id === duelistId) return damage;
  return Math.floor(damage * multiplier);
}

/** 闘技場の掟中: 味方（自身以外）からの回復・バリア・HoT を拒否 */
export function isAllySupportBlockedDuringArenaDominance(
  target: CombatantState,
  source: CombatantState
): boolean {
  if (!isArenaDominanceActive(target)) return false;
  if (source.isEnemy || source.id === target.id) return false;
  return true;
}

export function handleArenaDominanceEnd(enemies: CombatantState[]): void {
  clearArenaDominanceMarks(enemies);
}

export function hasActiveStageTriggerRemaining(
  actor: CombatantState,
  skill: ActiveSkillDef
): boolean {
  const limit = skill.stageTriggerLimit;
  if (limit === undefined) return true;
  const remaining = actor.activeStageRemainingTriggers?.[skill.id] ?? limit;
  return remaining > 0;
}

export function consumeActiveStageTrigger(
  actor: CombatantState,
  skill: ActiveSkillDef
): void {
  const limit = skill.stageTriggerLimit;
  if (limit === undefined) return;
  const current = actor.activeStageRemainingTriggers?.[skill.id] ?? limit;
  actor.activeStageRemainingTriggers ??= {};
  actor.activeStageRemainingTriggers[skill.id] = Math.max(0, current - 1);
}

export function initActiveStageTriggerLimits(
  units: CombatantState[],
  actives: Record<string, ActiveSkillDef>
): void {
  for (const unit of units) {
    let remaining: Record<string, number> | undefined;
    for (const cd of unit.cooldowns) {
      const skill = actives[cd.skillId];
      if (!skill?.stageTriggerLimit) continue;
      remaining ??= {};
      remaining[skill.id] = skill.stageTriggerLimit;
    }
    if (remaining !== undefined) {
      unit.activeStageRemainingTriggers = remaining;
    } else {
      delete unit.activeStageRemainingTriggers;
    }
  }
}
