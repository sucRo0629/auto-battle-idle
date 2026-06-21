import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  PassiveSkillDef,
  SkillCooldown,
} from '../types.ts';
import {
  evaluateConditions,
  resolveSkillConditionReferenceEffect,
} from './effectConditions.ts';
import {
  isFireTimeoutExpired,
  resolveFirePolicy,
} from './chargeBank.ts';

export interface FireGateContext {
  actor: CombatantState;
  allies: CombatantState[];
  enemies: CombatantState[];
  skill: ActiveSkillDef;
  passives: PassiveSkillDef[];
  gameData: GameData;
  battleTimeSec: number;
  cd?: SkillCooldown;
  isWaveStartPhase: boolean;
  isWaveEndPhase: boolean;
}

function toConditionEvalContext(ctx: FireGateContext) {
  return {
    actor: ctx.actor,
    allies: ctx.allies,
    enemies: ctx.enemies,
    passives: ctx.passives,
    gameData: ctx.gameData,
    isWaveStartPhase: ctx.isWaveStartPhase,
    isWaveEndPhase: ctx.isWaveEndPhase,
    referenceEffect: resolveSkillConditionReferenceEffect(ctx.skill),
  };
}

export function shouldFireActiveSkill(ctx: FireGateContext): boolean {
  if (ctx.cd && isFireTimeoutExpired(ctx.cd, ctx.skill, ctx.battleTimeSec)) {
    return true;
  }
  if (resolveFirePolicy(ctx.skill) !== 'smart') return true;
  const conditions = ctx.skill.fireConditions;
  if (!conditions || conditions.length === 0) return true;
  return evaluateConditions(toConditionEvalContext(ctx), conditions);
}

export function isActiveFireHold(ctx: FireGateContext): boolean {
  if (resolveFirePolicy(ctx.skill) !== 'smart') return false;
  if (shouldFireActiveSkill(ctx)) return false;
  const cd = ctx.cd;
  if (!cd) return false;
  return cd.remaining <= 0 || (cd.storedCharges ?? 0) > 0;
}
