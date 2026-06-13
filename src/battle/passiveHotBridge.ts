import { resolveEffectTargets } from './skills/targeting.ts';
import type {
  CombatantState,
  GameData,
  HealSkillEffect,
  PassiveSkillDef,
  TargetSpec,
} from './types.ts';

/** アクティブ heal(hot) effect フィールド → パッシブ HoT フィールド */
export const PASSIVE_HOT_TARGETING_FIELD_MAP = {
  targetShape: 'hotTargetShape',
  range: 'hotRange',
  aoeRadiusPx: 'hotAoeRadiusPx',
  hitCount: 'hotHitCount',
  hitDurationSec: 'hotHitDurationSec',
  piercePowerStepMultiplier: 'hotPiercePowerStepMultiplier',
  piercePowerStepMode: 'hotPiercePowerStepMode',
  pierceDurationSec: 'hotPierceDurationSec',
  chainCount: 'hotChainCount',
  chainMaxDistancePx: 'hotChainMaxDistancePx',
  chainPowerStepMultiplier: 'hotChainPowerStepMultiplier',
  chainPowerStepMode: 'hotChainPowerStepMode',
  chainDurationSec: 'hotChainDurationSec',
  scatterRadiusPx: 'hotScatterRadiusPx',
  scatterSpreadRadiusPx: 'hotScatterSpreadRadiusPx',
  scatterHitCount: 'hotScatterHitCount',
  scatterDurationSec: 'hotScatterDurationSec',
  scatterSpreadRate: 'hotScatterSpreadRate',
} as const satisfies Record<
  keyof Pick<
    HealSkillEffect,
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

type PassiveHotTargetingKey =
  (typeof PASSIVE_HOT_TARGETING_FIELD_MAP)[keyof typeof PASSIVE_HOT_TARGETING_FIELD_MAP];

function defaultHotTargetRule(): TargetSpec {
  return { kind: 'self' };
}

export function passiveHotToEffectDef(passive: PassiveSkillDef): HealSkillEffect {
  const effect: HealSkillEffect = {
    type: 'heal',
    healSubKind: 'hot',
    target: passive.hotTargetRule ?? defaultHotTargetRule(),
    amount: passive.hotAmount,
    durationSec: passive.hotDurationSec,
  };

  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_HOT_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_HOT_TARGETING_FIELD_MAP, PassiveHotTargetingKey]
  >) {
    const value = passive[passiveKey];
    if (value !== undefined) {
      (effect as Record<string, unknown>)[effectKey] = value;
    }
  }

  return effect;
}

export function applyHotEffectToPassive(
  passive: PassiveSkillDef,
  effect: HealSkillEffect,
): void {
  passive.hotTargetRule = effect.target;
  passive.hotAmount = effect.amount;
  passive.hotDurationSec = effect.durationSec;

  for (const passiveKey of Object.values(PASSIVE_HOT_TARGETING_FIELD_MAP)) {
    delete (passive as Record<string, unknown>)[passiveKey];
  }
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_HOT_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_HOT_TARGETING_FIELD_MAP, PassiveHotTargetingKey]
  >) {
    const value = (effect as Record<string, unknown>)[effectKey];
    if (value !== undefined) {
      (passive as Record<string, unknown>)[passiveKey] = value;
    }
  }
  sanitizePassiveHotTargeting(passive);
}

function sanitizePassiveHotTargeting(passive: PassiveSkillDef): void {
  const shape = passive.hotTargetShape ?? 'single';
  if (shape !== 'aoe') delete passive.hotAoeRadiusPx;
  if (shape !== 'multiLock' && shape !== 'single' && shape !== 'aoe') {
    delete passive.hotHitCount;
    delete passive.hotHitDurationSec;
  }
  if (shape !== 'single' && shape !== 'aoe') delete passive.hotHitDurationSec;
  if (shape !== 'chain') {
    delete passive.hotChainCount;
    delete passive.hotChainMaxDistancePx;
    delete passive.hotChainPowerStepMultiplier;
    delete passive.hotChainPowerStepMode;
    delete passive.hotChainDurationSec;
  }
  if (shape !== 'scatter') {
    delete passive.hotScatterRadiusPx;
    delete passive.hotScatterSpreadRadiusPx;
    delete passive.hotScatterHitCount;
    delete passive.hotScatterDurationSec;
    delete passive.hotScatterSpreadRate;
  }
  if (shape !== 'pierce') {
    delete passive.hotPiercePowerStepMultiplier;
    delete passive.hotPiercePowerStepMode;
    delete passive.hotPierceDurationSec;
  }
}

export function resolvePassiveHotTargets(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState[] {
  return resolveEffectTargets(
    passiveHotToEffectDef(passive),
    source,
    allies,
    enemies,
    gameData,
  );
}

export function remapPassiveHotTargetingToEffect(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_HOT_TARGETING_FIELD_MAP,
  )) {
    if (obj[passiveKey] !== undefined) {
      remapped[effectKey] = obj[passiveKey];
    }
  }
  return remapped;
}

export function remapEffectTargetingToPassiveHot(
  fields: Record<string, unknown>,
): Partial<PassiveSkillDef> {
  const result: Partial<PassiveSkillDef> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_HOT_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_HOT_TARGETING_FIELD_MAP, PassiveHotTargetingKey]
  >) {
    if (fields[effectKey] !== undefined) {
      (result as Record<string, unknown>)[passiveKey] = fields[effectKey];
    }
  }
  return result;
}
