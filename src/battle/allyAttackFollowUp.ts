import { getBattleX } from './combatPosition.ts';
import { resolveEffectiveBasicAttackSkill } from './resolveEffectiveBasicAttack.ts';
import type {
  CombatantState,
  GameData,
  PendingSkillHit,
  StatusEffect,
} from './types.ts';

export const ALLY_ATTACK_FOLLOW_UP_OVERLAY = 'allyAttackFollowUp' as const;

const DEFAULT_RADIUS_PX = 70;
const DEFAULT_DEF_DEBUFF_MULTIPLIER = 0.95;
const DEFAULT_DEF_DEBUFF_DURATION_SEC = 5;

export interface AllyAttackFollowUpConfig {
  radiusPx: number;
  defDebuffMultiplier: number;
  defDebuffDurationSec: number;
}

function configFromStatusEffect(
  effect: StatusEffect,
): AllyAttackFollowUpConfig | undefined {
  if (effect.overlay !== ALLY_ATTACK_FOLLOW_UP_OVERLAY) return undefined;
  if (effect.remainingSec <= 0) return undefined;
  return {
    radiusPx: effect.allyFollowUpRadiusPx ?? DEFAULT_RADIUS_PX,
    defDebuffMultiplier:
      effect.followUpDefDebuffMultiplier ?? DEFAULT_DEF_DEBUFF_MULTIPLIER,
    defDebuffDurationSec:
      effect.followUpDefDebuffDurationSec ?? DEFAULT_DEF_DEBUFF_DURATION_SEC,
  };
}

export function getAllyAttackFollowUpConfig(
  unit: CombatantState,
): AllyAttackFollowUpConfig | undefined {
  for (let i = unit.statusEffects.length - 1; i >= 0; i--) {
    const config = configFromStatusEffect(unit.statusEffects[i]!);
    if (config) return config;
  }
  return undefined;
}

export function allyWithinFollowUpRadiusPx(
  lancer: CombatantState,
  ally: CombatantState,
  radiusPx: number,
): boolean {
  return Math.abs(getBattleX(lancer) - getBattleX(ally)) <= radiusPx;
}

export function findFollowUpLancersForAllyBasic(
  attacker: CombatantState,
  allies: CombatantState[],
): CombatantState[] {
  return allies.filter((lancer) => {
    if (!lancer.isAlive) return false;
    if (lancer.id === attacker.id) return false;
    const config = getAllyAttackFollowUpConfig(lancer);
    if (!config) return false;
    return allyWithinFollowUpRadiusPx(lancer, attacker, config.radiusPx);
  });
}

export function applyFollowUpDefDebuffOnHit(
  actor: CombatantState,
  target: CombatantState,
  config: AllyAttackFollowUpConfig,
): boolean {
  const { defDebuffMultiplier, defDebuffDurationSec } = config;
  if (defDebuffMultiplier >= 1 || defDebuffDurationSec <= 0) return false;
  const appliedAt = Date.now();
  target.statusEffects.push({
    id: `follow_up_def_${actor.id}_${appliedAt}`,
    kind: 'debuff',
    stat: 'def',
    multiplier: defDebuffMultiplier,
    durationSec: defDebuffDurationSec,
    remainingSec: defDebuffDurationSec,
    sourceId: actor.id,
  });
  return true;
}

export function buildAllyAttackFollowUpPendingHit(
  lancer: CombatantState,
  targetId: string,
  gameData: GameData,
  applyAtBattleSec: number,
): PendingSkillHit | undefined {
  const basicCd = lancer.cooldowns.find((cd) => cd.slotKind === 'basic');
  const skillId = basicCd?.skillId;
  const baseSkill = skillId ? gameData.skillRegistry.actives[skillId] : undefined;
  if (!baseSkill) return undefined;
  const skill = resolveEffectiveBasicAttackSkill(lancer, baseSkill);
  const effectIndex = skill.effect.findIndex((entry) => entry.type !== 'move');
  if (effectIndex < 0) return undefined;
  const effectDef = skill.effect[effectIndex]!;
  if (effectDef.type !== 'damage') return undefined;
  return {
    applyAtBattleSec,
    actorId: lancer.id,
    skillId: skill.id,
    skillName: skill.name,
    effectDef,
    effectIndex,
    slotKind: 'basic',
    hitIndex: 0,
    suppressBonusBasicAttack: true,
    suppressAllyAttackFollowUp: true,
    targets: [{ targetId }],
  };
}
