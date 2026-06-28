import { resolveEffectTargets } from "./skills/targeting.ts";
import type {
  BuffSkillEffect,
  CombatantState,
  GameData,
  PassiveSkillDef,
  TargetSpec,
} from "./types.ts";

/** アクティブ effect フィールド → パッシブ damageReduction フィールド */
export const PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP = {
  targetShape: "damageReductionTargetShape",
  range: "damageReductionRange",
  aoeRadiusPx: "damageReductionAoeRadiusPx",
  hitCount: "damageReductionHitCount",
  hitDurationSec: "damageReductionHitDurationSec",
  piercePowerStepMultiplier: "damageReductionPiercePowerStepMultiplier",
  piercePowerStepMode: "damageReductionPiercePowerStepMode",
  pierceDurationSec: "damageReductionPierceDurationSec",
  chainCount: "damageReductionChainCount",
  chainMaxDistancePx: "damageReductionChainMaxDistancePx",
  chainPowerStepMultiplier: "damageReductionChainPowerStepMultiplier",
  chainPowerStepMode: "damageReductionChainPowerStepMode",
  chainDurationSec: "damageReductionChainDurationSec",
  scatterRadiusPx: "damageReductionScatterRadiusPx",
  scatterSpreadRadiusPx: "damageReductionScatterSpreadRadiusPx",
  scatterHitCount: "damageReductionScatterHitCount",
  scatterDurationSec: "damageReductionScatterDurationSec",
  scatterSpreadRate: "damageReductionScatterSpreadRate",
} as const satisfies Record<
  keyof Pick<
    BuffSkillEffect,
    | "targetShape"
    | "range"
    | "aoeRadiusPx"
    | "hitCount"
    | "hitDurationSec"
    | "piercePowerStepMultiplier"
    | "piercePowerStepMode"
    | "pierceDurationSec"
    | "chainCount"
    | "chainMaxDistancePx"
    | "chainPowerStepMultiplier"
    | "chainPowerStepMode"
    | "chainDurationSec"
    | "scatterRadiusPx"
    | "scatterSpreadRadiusPx"
    | "scatterHitCount"
    | "scatterDurationSec"
    | "scatterSpreadRate"
  >,
  keyof PassiveSkillDef
>;

type PassiveDamageReductionTargetingKey =
  (typeof PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP)[keyof typeof PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP];

function defaultDamageReductionTargetRule(): TargetSpec {
  return { kind: "self" };
}

/** ターゲット解決用（常時 のダメージ軽減） */
export function passiveDamageReductionToEffectDef(
  passive: PassiveSkillDef
): BuffSkillEffect {
  const effect: BuffSkillEffect = {
    type: "buff",
    target:
      passive.damageReductionTargetRule ?? defaultDamageReductionTargetRule(),
    buffStat: "damageTaken",
    buffMultiplier: Math.max(0, 1 - (passive.damageReductionPercent ?? 0)),
  };

  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP
  ) as Array<
    [
      keyof typeof PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP,
      PassiveDamageReductionTargetingKey
    ]
  >) {
    const value = passive[passiveKey];
    if (value !== undefined) {
      (effect as Record<string, unknown>)[effectKey] = value;
    }
  }

  return effect;
}

export function applyDamageReductionEffectToPassive(
  passive: PassiveSkillDef,
  effect: BuffSkillEffect
): void {
  passive.damageReductionTargetRule = effect.target;

  for (const passiveKey of Object.values(
    PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP
  )) {
    delete (passive as Record<string, unknown>)[passiveKey];
  }
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP
  ) as Array<
    [
      keyof typeof PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP,
      PassiveDamageReductionTargetingKey
    ]
  >) {
    const value = (effect as Record<string, unknown>)[effectKey];
    if (value !== undefined) {
      (passive as Record<string, unknown>)[passiveKey] = value;
    }
  }
  sanitizePassiveDamageReductionTargeting(passive);
}

function sanitizePassiveDamageReductionTargeting(
  passive: PassiveSkillDef
): void {
  const shape = passive.damageReductionTargetShape ?? "single";
  if (shape !== "aoe") delete passive.damageReductionAoeRadiusPx;
  if (shape !== "multiLock" && shape !== "single" && shape !== "aoe") {
    delete passive.damageReductionHitCount;
    delete passive.damageReductionHitDurationSec;
  }
  if (shape !== "single" && shape !== "aoe") {
    delete passive.damageReductionHitDurationSec;
  }
  if (shape !== "chain") {
    delete passive.damageReductionChainCount;
    delete passive.damageReductionChainMaxDistancePx;
    delete passive.damageReductionChainPowerStepMultiplier;
    delete passive.damageReductionChainPowerStepMode;
    delete passive.damageReductionChainDurationSec;
  }
  if (shape !== "scatter") {
    delete passive.damageReductionScatterRadiusPx;
    delete passive.damageReductionScatterSpreadRadiusPx;
    delete passive.damageReductionScatterHitCount;
    delete passive.damageReductionScatterDurationSec;
    delete passive.damageReductionScatterSpreadRate;
  }
  if (shape !== "pierce") {
    delete passive.damageReductionPiercePowerStepMultiplier;
    delete passive.damageReductionPiercePowerStepMode;
    delete passive.damageReductionPierceDurationSec;
  }
}

export function resolvePassiveDamageReductionTargets(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData
): CombatantState[] {
  return resolveEffectTargets(
    passiveDamageReductionToEffectDef(passive),
    source,
    allies,
    enemies,
    gameData
  );
}

export function remapPassiveDamageReductionTargetingToEffect(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP
  )) {
    if (obj[passiveKey] !== undefined) {
      remapped[effectKey] = obj[passiveKey];
    }
  }
  return remapped;
}

export function remapEffectTargetingToPassiveDamageReduction(
  fields: Record<string, unknown>
): Partial<PassiveSkillDef> {
  const result: Partial<PassiveSkillDef> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP
  ) as Array<
    [
      keyof typeof PASSIVE_DAMAGE_REDUCTION_TARGETING_FIELD_MAP,
      PassiveDamageReductionTargetingKey
    ]
  >) {
    if (fields[effectKey] !== undefined) {
      (result as Record<string, unknown>)[passiveKey] = fields[effectKey];
    }
  }
  return result;
}
