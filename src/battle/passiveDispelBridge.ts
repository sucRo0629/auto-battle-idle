import { resolveEffectTargets } from './skills/targeting.ts';
import type {
  CombatantState,
  DispelSkillEffect,
  GameData,
  PassiveSkillDef,
  TargetSpec,
} from './types.ts';

/** アクティブ dispel effect フィールド → パッシブ periodicDispel フィールド */
export const PASSIVE_DISPEL_TARGETING_FIELD_MAP = {
  targetShape: 'dispelTargetShape',
  range: 'dispelRange',
  aoeRadiusPx: 'dispelAoeRadiusPx',
  hitCount: 'dispelHitCount',
  hitDurationSec: 'dispelHitDurationSec',
  piercePowerStepMultiplier: 'dispelPiercePowerStepMultiplier',
  piercePowerStepMode: 'dispelPiercePowerStepMode',
  pierceDurationSec: 'dispelPierceDurationSec',
  chainCount: 'dispelChainCount',
  chainMaxDistancePx: 'dispelChainMaxDistancePx',
  chainPowerStepMultiplier: 'dispelChainPowerStepMultiplier',
  chainPowerStepMode: 'dispelChainPowerStepMode',
  chainDurationSec: 'dispelChainDurationSec',
  scatterRadiusPx: 'dispelScatterRadiusPx',
  scatterSpreadRadiusPx: 'dispelScatterSpreadRadiusPx',
  scatterHitCount: 'dispelScatterHitCount',
  scatterDurationSec: 'dispelScatterDurationSec',
  scatterSpreadRate: 'dispelScatterSpreadRate',
} as const satisfies Record<
  keyof Pick<
    DispelSkillEffect,
    | 'targetShape'
    | 'range'
    | 'aoeRadiusPx'
    | 'hitCount'
    | 'hitDurationSec'
    | 'piercePowerStepMultiplier'
    | 'piercePowerStepMode'
    | 'pierceDurationSec'
    | 'chainCount'
    | 'chainMaxDistancePx'
    | 'chainPowerStepMultiplier'
    | 'chainPowerStepMode'
    | 'chainDurationSec'
    | 'scatterRadiusPx'
    | 'scatterSpreadRadiusPx'
    | 'scatterHitCount'
    | 'scatterDurationSec'
    | 'scatterSpreadRate'
  >,
  keyof PassiveSkillDef
>;

type PassiveDispelTargetingKey =
  (typeof PASSIVE_DISPEL_TARGETING_FIELD_MAP)[keyof typeof PASSIVE_DISPEL_TARGETING_FIELD_MAP];

function defaultDispelTargetRule(): TargetSpec {
  return { kind: 'self' };
}

export function passiveDispelToEffectDef(
  passive: PassiveSkillDef,
): DispelSkillEffect {
  const effect: DispelSkillEffect = {
    type: 'dispel',
    target: passive.dispelTargetRule ?? defaultDispelTargetRule(),
    dispelCount: passive.dispelCount ?? 0,
    dispelTags: passive.dispelTags,
    dispelPriority: passive.dispelPriority,
  };

  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DISPEL_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DISPEL_TARGETING_FIELD_MAP, PassiveDispelTargetingKey]
  >) {
    const value = passive[passiveKey];
    if (value !== undefined) {
      (effect as Record<string, unknown>)[effectKey] = value;
    }
  }

  return effect;
}

export function applyDispelEffectToPassive(
  passive: PassiveSkillDef,
  effect: DispelSkillEffect,
): void {
  passive.dispelTargetRule = effect.target;

  for (const passiveKey of Object.values(PASSIVE_DISPEL_TARGETING_FIELD_MAP)) {
    delete (passive as Record<string, unknown>)[passiveKey];
  }
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DISPEL_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DISPEL_TARGETING_FIELD_MAP, PassiveDispelTargetingKey]
  >) {
    const value = (effect as Record<string, unknown>)[effectKey];
    if (value !== undefined) {
      (passive as Record<string, unknown>)[passiveKey] = value;
    }
  }
  sanitizePassiveDispelTargeting(passive);
}

function sanitizePassiveDispelTargeting(passive: PassiveSkillDef): void {
  const shape = passive.dispelTargetShape ?? 'single';
  if (shape !== 'aoe') delete passive.dispelAoeRadiusPx;
  if (shape !== 'multiLock' && shape !== 'single' && shape !== 'aoe') {
    delete passive.dispelHitCount;
    delete passive.dispelHitDurationSec;
  }
  if (shape !== 'single' && shape !== 'aoe') {
    delete passive.dispelHitDurationSec;
  }
  if (shape !== 'chain') {
    delete passive.dispelChainCount;
    delete passive.dispelChainMaxDistancePx;
    delete passive.dispelChainPowerStepMultiplier;
    delete passive.dispelChainPowerStepMode;
    delete passive.dispelChainDurationSec;
  }
  if (shape !== 'scatter') {
    delete passive.dispelScatterRadiusPx;
    delete passive.dispelScatterSpreadRadiusPx;
    delete passive.dispelScatterHitCount;
    delete passive.dispelScatterDurationSec;
    delete passive.dispelScatterSpreadRate;
  }
  if (shape !== 'pierce') {
    delete passive.dispelPiercePowerStepMultiplier;
    delete passive.dispelPiercePowerStepMode;
    delete passive.dispelPierceDurationSec;
  }
}

export function resolvePassiveDispelTargets(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState[] {
  return resolveEffectTargets(
    passiveDispelToEffectDef(passive),
    source,
    allies,
    enemies,
    gameData,
  );
}

export function remapPassiveDispelTargetingToEffect(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DISPEL_TARGETING_FIELD_MAP,
  )) {
    if (obj[passiveKey] !== undefined) {
      remapped[effectKey] = obj[passiveKey];
    }
  }
  return remapped;
}

export function remapEffectTargetingToPassiveDispel(
  fields: Record<string, unknown>,
): Partial<PassiveSkillDef> {
  const result: Partial<PassiveSkillDef> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DISPEL_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DISPEL_TARGETING_FIELD_MAP, PassiveDispelTargetingKey]
  >) {
    if (fields[effectKey] !== undefined) {
      (result as Record<string, unknown>)[passiveKey] = fields[effectKey];
    }
  }
  return result;
}
