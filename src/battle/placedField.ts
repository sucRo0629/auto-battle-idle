import { resolveEnemyClusterCenterX } from './clusterCenter.ts';
import {
  compressAllDotsOnUnit,
  extendAllDotsOnUnit,
  findUnitsInRadius,
  resolveDotDurationOnApply,
  resolveHunterDotCompressRatio,
} from './dotMechanics.ts';
import { getBattleX } from './combatPosition.ts';
import { applyStunToTarget } from './ccEffects.ts';
import { resolveEffectiveAmountSpecForActiveEffect } from './skillAmountOverride.ts';
import { resolveSkillDamageType } from './skills/damageTypeUtils.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  PassiveSkillDef,
  PlacedFieldInstance,
  SkillEffectDef,
  SkillCooldown,
} from './types.ts';

export type PlacedFieldEffectApplier = (
  actor: CombatantState,
  target: CombatantState,
  skill: ActiveSkillDef,
  effectDef: SkillEffectDef,
  cd: SkillCooldown,
  effectIndex: number,
) => boolean;

export function spawnPlacedField(
  actor: CombatantState,
  skill: ActiveSkillDef,
  effectDef: Extract<SkillEffectDef, { type: 'placedField' }>,
  centerX: number,
  effectIndex: number,
  players: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  actives: Record<string, ActiveSkillDef>,
  onDebuff?: (target: CombatantState) => void,
): PlacedFieldInstance {
  const field = createPlacedFieldInstance(
    actor,
    skill,
    effectDef,
    centerX,
    effectIndex,
  );
  const allies = actor.isEnemy ? enemies : players;
  const hostiles = actor.isEnemy ? players : enemies;
  const inRadius = findUnitsInRadius(field.centerX, hostiles, field.radiusPx);
  for (const unit of inRadius) {
    field.enteredUnitIds.add(unit.id);
  }
  applyFieldEffectsToUnits(
    field,
    actor,
    skill,
    field.enterEffects,
    inRadius,
    allies,
    passives,
    actives,
    onDebuff,
  );
  return field;
}

function createPlacedFieldInstance(
  actor: CombatantState,
  skill: ActiveSkillDef,
  effectDef: Extract<SkillEffectDef, { type: 'placedField' }>,
  centerX: number,
  effectIndex: number,
): PlacedFieldInstance {
  return {
    id: `${skill.id}_field_${Date.now()}_${effectIndex}`,
    sourceId: actor.id,
    skillId: skill.id,
    effectIndex,
    centerX,
    radiusPx: effectDef.fieldRadiusPx,
    remainingSec: effectDef.fieldDurationSec,
    stayTickIntervalSec: effectDef.stayTickIntervalSec ?? 1,
    stayTickAccumulator: 0,
    stayCompressRatioBonus: 0,
    stayCompressRatioBonusPerTick: effectDef.stayCompressRatioBonusPerTick,
    enterEffects: effectDef.enterEffects ?? [],
    stayEffects: effectDef.stayEffects ?? [],
    enteredUnitIds: new Set<string>(),
  };
}

export function resolvePlacedFieldCenterX(
  actor: CombatantState,
  effectDef: Extract<SkillEffectDef, { type: 'placedField' }>,
  enemies: CombatantState[],
): number | null {
  const rangePx = effectDef.range ?? actor.traits.rangePx;
  return resolveEnemyClusterCenterX(
    actor,
    enemies,
    rangePx,
    effectDef.fieldRadiusPx,
  );
}

function applyFieldDot(
  actor: CombatantState,
  target: CombatantState,
  skill: ActiveSkillDef,
  effectDef: Extract<SkillEffectDef, { type: 'debuff' }>,
  effectIndex: number,
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): boolean {
  if (effectDef.debuffSubKind !== 'dot') return false;
  const baseDuration = effectDef.durationSec ?? 0;
  const duration = resolveDotDurationOnApply(
    allies,
    passives,
    baseDuration,
  );
  const baseSpec = effectDef.amount;
  if (duration <= 0 || baseSpec === undefined) return false;
  const amountSpec = resolveEffectiveAmountSpecForActiveEffect(
    actor,
    passives,
    skill,
    effectDef,
    effectIndex,
    baseSpec,
  );
  const appliedAt = Date.now();
  target.statusEffects.push({
    id: `${skill.id}_field_dot_${appliedAt}`,
    kind: 'debuff',
    overlay: 'dot',
    multiplier: 1,
    durationSec: duration,
    remainingSec: duration,
    amount: amountSpec,
    sourceId: actor.id,
    skillId: skill.id,
    effectIndex,
    damageType: resolveSkillDamageType(actor, effectDef),
    tickSec: 1,
    ...(effectDef.dotFlavor ? { dotFlavor: effectDef.dotFlavor } : {}),
  });
  return true;
}

function applyFieldStun(
  actor: CombatantState,
  target: CombatantState,
  skill: ActiveSkillDef,
  effectDef: Extract<SkillEffectDef, { type: 'debuff' }>,
  actives: Record<string, ActiveSkillDef>,
): boolean {
  if (effectDef.debuffSubKind !== 'stun') return false;
  const duration = effectDef.durationSec ?? 0;
  if (duration <= 0) return false;
  return applyStunToTarget(
    target,
    duration,
    { skillId: skill.id, sourceId: actor.id },
    { actives },
  );
}

function applyFieldNestedEffect(
  actor: CombatantState,
  target: CombatantState,
  skill: ActiveSkillDef,
  nested: SkillEffectDef,
  nestedIndex: number,
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  actives: Record<string, ActiveSkillDef>,
  stayBonus: number,
): boolean {
  if (nested.type === 'debuff') {
    const sub = nested.debuffSubKind ?? 'stat';
    if (sub === 'dot') {
      return applyFieldDot(actor, target, skill, nested, nestedIndex, allies, passives);
    }
    if (sub === 'stun') {
      return applyFieldStun(actor, target, skill, nested, actives);
    }
  }
  if (nested.type === 'dotCompress') {
    const ratio = resolveHunterDotCompressRatio(
      actor,
      passives,
      nested.compressRatio,
      stayBonus,
    );
    return compressAllDotsOnUnit(target, ratio) > 0;
  }
  if (nested.type === 'dotExtend') {
    return extendAllDotsOnUnit(target, nested.extendRatio) > 0;
  }
  return false;
}

function applyFieldEffectsToUnits(
  field: PlacedFieldInstance,
  actor: CombatantState,
  skill: ActiveSkillDef,
  effects: SkillEffectDef[],
  units: CombatantState[],
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  actives: Record<string, ActiveSkillDef>,
  onDebuff?: (target: CombatantState) => void,
): void {
  for (const unit of units) {
    for (let i = 0; i < effects.length; i++) {
      const nested = effects[i]!;
      if (
        applyFieldNestedEffect(
          actor,
          unit,
          skill,
          nested,
          i,
          allies,
          passives,
          actives,
          field.stayCompressRatioBonus,
        )
      ) {
        onDebuff?.(unit);
      }
    }
  }
}

export interface PlacedFieldTickCallbacks {
  onDebuffApplied?: (target: CombatantState) => void;
}

export function tickPlacedFields(
  fields: PlacedFieldInstance[],
  players: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  actives: Record<string, ActiveSkillDef>,
  deltaTime: number,
  callbacks: PlacedFieldTickCallbacks = {},
): PlacedFieldInstance[] {
  const kept: PlacedFieldInstance[] = [];
  const actorById = (id: string) =>
    [...players, ...enemies].find((unit) => unit.id === id);

  for (const field of fields) {
    field.remainingSec -= deltaTime;
    if (field.remainingSec <= 0) continue;

    const actor = actorById(field.sourceId);
    const skill = actives[field.skillId];
    if (!actor?.isAlive || !skill) {
      continue;
    }

    const allies = actor.isEnemy ? enemies : players;
    const hostiles = actor.isEnemy ? players : enemies;
    const inRadius = findUnitsInRadius(field.centerX, hostiles, field.radiusPx);

    for (const unit of inRadius) {
      if (!field.enteredUnitIds.has(unit.id)) {
        field.enteredUnitIds.add(unit.id);
        applyFieldEffectsToUnits(
          field,
          actor,
          skill,
          field.enterEffects,
          [unit],
          allies,
          passives,
          actives,
          callbacks.onDebuffApplied,
        );
      }
    }

    if (field.stayEffects.length > 0 && field.stayTickIntervalSec > 0) {
      field.stayTickAccumulator += deltaTime;
      while (
        field.stayTickAccumulator >= field.stayTickIntervalSec &&
        field.remainingSec > 0
      ) {
        field.stayTickAccumulator -= field.stayTickIntervalSec;
        if (field.stayCompressRatioBonusPerTick !== undefined) {
          field.stayCompressRatioBonus += field.stayCompressRatioBonusPerTick;
        }
        applyFieldEffectsToUnits(
          field,
          actor,
          skill,
          field.stayEffects,
          inRadius,
          allies,
          passives,
          actives,
          callbacks.onDebuffApplied,
        );
      }
    }

    kept.push(field);
  }
  return kept;
}

export function isUnitInPlacedField(
  unit: CombatantState,
  fields: PlacedFieldInstance[],
): boolean {
  const x = getBattleX(unit);
  return fields.some(
    (field) =>
      field.remainingSec > 0 &&
      Math.abs(x - field.centerX) <= field.radiusPx,
  );
}
