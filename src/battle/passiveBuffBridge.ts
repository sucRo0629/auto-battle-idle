import { resolveEffectTargets } from './skills/targeting.ts';
import type {
  BarrierSkillEffect,
  BuffSkillEffect,
  CombatantState,
  GameData,
  PassiveSkillDef,
  SkillEffectDef,
  TargetSpec,
} from './types.ts';

/** アクティブ effect フィールド → パッシブ buff フィールド */
export const PASSIVE_BUFF_TARGETING_FIELD_MAP = {
  targetShape: 'buffTargetShape',
  range: 'buffRange',
  aoeRadiusPx: 'buffAoeRadiusPx',
  hitCount: 'buffHitCount',
  hitDurationSec: 'buffHitDurationSec',
  piercePowerStepMultiplier: 'buffPiercePowerStepMultiplier',
  piercePowerStepMode: 'buffPiercePowerStepMode',
  pierceDurationSec: 'buffPierceDurationSec',
  chainCount: 'buffChainCount',
  chainMaxDistancePx: 'buffChainMaxDistancePx',
  chainPowerStepMultiplier: 'buffChainPowerStepMultiplier',
  chainPowerStepMode: 'buffChainPowerStepMode',
  chainDurationSec: 'buffChainDurationSec',
  scatterRadiusPx: 'buffScatterRadiusPx',
  scatterSpreadRadiusPx: 'buffScatterSpreadRadiusPx',
  scatterHitCount: 'buffScatterHitCount',
  scatterDurationSec: 'buffScatterDurationSec',
  scatterSpreadRate: 'buffScatterSpreadRate',
} as const satisfies Record<
  keyof Pick<
    SkillEffectDef,
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

type PassiveBuffTargetingKey =
  (typeof PASSIVE_BUFF_TARGETING_FIELD_MAP)[keyof typeof PASSIVE_BUFF_TARGETING_FIELD_MAP];

function defaultBuffTargetRule(): TargetSpec {
  return { kind: 'self' };
}

function applyTargetingFieldsToEffect(
  effect: Record<string, unknown>,
  passive: PassiveSkillDef,
): void {
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_BUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_BUFF_TARGETING_FIELD_MAP, PassiveBuffTargetingKey]
  >) {
    const value = passive[passiveKey];
    if (value !== undefined) {
      effect[effectKey] = value;
    }
  }
}

/** パッシブ buff 定義をアクティブ effect 形へ変換（ターゲット解決用） */
export function passiveBuffToEffectDef(
  passive: PassiveSkillDef,
): BuffSkillEffect | BarrierSkillEffect {
  const target = passive.buffTargetRule ?? defaultBuffTargetRule();
  const subKind = passive.buffSubKind ?? 'stat';

  if (subKind === 'barrier') {
    const effect: BarrierSkillEffect = {
      type: 'barrier',
      target,
      amount: passive.barrierAmount ?? { kind: 'flat', flatAmount: 0 },
      barrierStack: passive.barrierStack,
    };
    applyTargetingFieldsToEffect(effect, passive);
    return effect;
  }

  const effect: BuffSkillEffect = {
    type: 'buff',
    target,
    buffSubKind: subKind,
    buffStat: passive.buffStat,
    buffMultiplier: passive.buffMultiplier,
    buffFlatBonus: passive.buffFlatBonus,
    buffDurationSec: passive.buffDurationSec,
    chance: passive.chance,
    ratio: passive.ratio,
  };
  applyTargetingFieldsToEffect(effect, passive);
  return effect;
}

/** アクティブ buff effect のターゲット／形状／射程をパッシブへ反映 */
export function applyBuffEffectToPassive(
  passive: PassiveSkillDef,
  effect: BuffSkillEffect | BarrierSkillEffect,
): void {
  passive.buffTargetRule = effect.target;

  if (effect.type === 'barrier') {
    passive.buffSubKind = 'barrier';
    passive.barrierAmount = effect.amount;
    passive.barrierStack = effect.barrierStack;
  } else {
    passive.buffSubKind = effect.buffSubKind ?? 'stat';
    passive.buffStat = effect.buffStat;
    passive.buffMultiplier = effect.buffMultiplier;
    passive.buffFlatBonus = effect.buffFlatBonus;
    passive.buffDurationSec = effect.buffDurationSec;
    passive.chance = effect.chance;
    passive.ratio = effect.ratio;
  }

  for (const passiveKey of Object.values(PASSIVE_BUFF_TARGETING_FIELD_MAP)) {
    delete (passive as Record<string, unknown>)[passiveKey];
  }
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_BUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_BUFF_TARGETING_FIELD_MAP, PassiveBuffTargetingKey]
  >) {
    const value = (effect as Record<string, unknown>)[effectKey];
    if (value !== undefined) {
      (passive as Record<string, unknown>)[passiveKey] = value;
    }
  }
  sanitizePassiveBuffTargeting(passive);
}

function sanitizePassiveBuffTargeting(passive: PassiveSkillDef): void {
  const shape = passive.buffTargetShape ?? 'single';
  if (shape !== 'aoe') {
    delete passive.buffAoeRadiusPx;
  }
  if (shape !== 'multiLock' && shape !== 'single' && shape !== 'aoe') {
    delete passive.buffHitCount;
    delete passive.buffHitDurationSec;
  }
  if (shape !== 'single' && shape !== 'aoe') {
    delete passive.buffHitDurationSec;
  }
  if (shape !== 'chain') {
    delete passive.buffChainCount;
    delete passive.buffChainMaxDistancePx;
    delete passive.buffChainPowerStepMultiplier;
    delete passive.buffChainPowerStepMode;
    delete passive.buffChainDurationSec;
  }
  if (shape !== 'scatter') {
    delete passive.buffScatterRadiusPx;
    delete passive.buffScatterSpreadRadiusPx;
    delete passive.buffScatterHitCount;
    delete passive.buffScatterDurationSec;
    delete passive.buffScatterSpreadRate;
  }
  if (shape !== 'pierce') {
    delete passive.buffPiercePowerStepMultiplier;
    delete passive.buffPiercePowerStepMode;
    delete passive.buffPierceDurationSec;
  }
}

export function resolvePassiveBuffTargets(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState[] {
  return resolveEffectTargets(
    passiveBuffToEffectDef(passive),
    source,
    allies,
    enemies,
    gameData,
  );
}

export function remapPassiveBuffTargetingToEffect(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_BUFF_TARGETING_FIELD_MAP,
  )) {
    if (obj[passiveKey] !== undefined) {
      remapped[effectKey] = obj[passiveKey];
    }
  }
  return remapped;
}

export function remapEffectTargetingToPassiveBuff(
  fields: Record<string, unknown>,
): Partial<PassiveSkillDef> {
  const result: Partial<PassiveSkillDef> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_BUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_BUFF_TARGETING_FIELD_MAP, PassiveBuffTargetingKey]
  >) {
    if (fields[effectKey] !== undefined) {
      (result as Record<string, unknown>)[passiveKey] = fields[effectKey];
    }
  }
  return result;
}
