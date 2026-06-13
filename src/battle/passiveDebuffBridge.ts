import { resolveEffectTargets } from './skills/targeting.ts';
import type {
  CombatantState,
  DebuffSkillEffect,
  GameData,
  PassiveSkillDef,
  TargetSpec,
} from './types.ts';

/** アクティブ effect フィールド → パッシブ debuff フィールド */
export const PASSIVE_DEBUFF_TARGETING_FIELD_MAP = {
  targetShape: 'debuffTargetShape',
  range: 'debuffRange',
  aoeRadiusPx: 'debuffAoeRadiusPx',
  hitCount: 'debuffHitCount',
  hitDurationSec: 'debuffHitDurationSec',
  piercePowerStepMultiplier: 'debuffPiercePowerStepMultiplier',
  piercePowerStepMode: 'debuffPiercePowerStepMode',
  pierceDurationSec: 'debuffPierceDurationSec',
  chainCount: 'debuffChainCount',
  chainMaxDistancePx: 'debuffChainMaxDistancePx',
  chainPowerStepMultiplier: 'debuffChainPowerStepMultiplier',
  chainPowerStepMode: 'debuffChainPowerStepMode',
  chainDurationSec: 'debuffChainDurationSec',
  scatterRadiusPx: 'debuffScatterRadiusPx',
  scatterSpreadRadiusPx: 'debuffScatterSpreadRadiusPx',
  scatterHitCount: 'debuffScatterHitCount',
  scatterDurationSec: 'debuffScatterDurationSec',
  scatterSpreadRate: 'debuffScatterSpreadRate',
} as const satisfies Record<
  keyof Pick<
    DebuffSkillEffect,
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

type PassiveDebuffTargetingKey =
  (typeof PASSIVE_DEBUFF_TARGETING_FIELD_MAP)[keyof typeof PASSIVE_DEBUFF_TARGETING_FIELD_MAP];

function defaultDebuffTargetRule(): TargetSpec {
  return { kind: 'distance', side: 'enemy', order: 'nearest' };
}

/** パッシブ debuff 定義をアクティブ DebuffSkillEffect 形へ変換（ターゲット解決用） */
export function passiveDebuffToEffectDef(passive: PassiveSkillDef): DebuffSkillEffect {
  const effect: DebuffSkillEffect = {
    type: 'debuff',
    target: passive.debuffTargetRule ?? defaultDebuffTargetRule(),
    debuffSubKind: passive.debuffSubKind ?? 'stat',
    debuffStat: passive.debuffStat,
    debuffMultiplier: passive.debuffMultiplier,
    debuffFlatBonus: passive.debuffFlatBonus,
    debuffDurationSec: passive.debuffDurationSec,
    durationSec: passive.debuffStunDurationSec ?? passive.debuffDotDurationSec,
    amount: passive.debuffDotAmount,
    damageType: passive.debuffDotDamageType,
  };

  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DEBUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DEBUFF_TARGETING_FIELD_MAP, PassiveDebuffTargetingKey]
  >) {
    const value = passive[passiveKey];
    if (value !== undefined) {
      (effect as Record<string, unknown>)[effectKey] = value;
    }
  }

  return effect;
}

/** アクティブ DebuffSkillEffect のターゲット／形状／射程をパッシブへ反映 */
export function applyDebuffEffectToPassive(
  passive: PassiveSkillDef,
  effect: DebuffSkillEffect,
): void {
  passive.debuffTargetRule = effect.target;
  passive.debuffSubKind = effect.debuffSubKind ?? 'stat';
  passive.debuffStat = effect.debuffStat;
  passive.debuffMultiplier = effect.debuffMultiplier;
  passive.debuffFlatBonus = effect.debuffFlatBonus;
  passive.debuffDurationSec = effect.debuffDurationSec;

  const subKind = passive.debuffSubKind ?? 'stat';
  if (subKind === 'stun') {
    passive.debuffStunDurationSec = effect.durationSec;
  } else if (subKind === 'dot') {
    passive.debuffDotDurationSec = effect.durationSec;
    passive.debuffDotAmount = effect.amount;
    passive.debuffDotDamageType = effect.damageType;
  }

  for (const passiveKey of Object.values(PASSIVE_DEBUFF_TARGETING_FIELD_MAP)) {
    delete (passive as Record<string, unknown>)[passiveKey];
  }
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DEBUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DEBUFF_TARGETING_FIELD_MAP, PassiveDebuffTargetingKey]
  >) {
    const value = (effect as Record<string, unknown>)[effectKey];
    if (value !== undefined) {
      (passive as Record<string, unknown>)[passiveKey] = value;
    }
  }
  sanitizePassiveDebuffTargeting(passive);
}

function sanitizePassiveDebuffTargeting(passive: PassiveSkillDef): void {
  const shape = passive.debuffTargetShape ?? 'single';
  if (shape !== 'aoe') {
    delete passive.debuffAoeRadiusPx;
  }
  if (shape !== 'multiLock' && shape !== 'single' && shape !== 'aoe') {
    delete passive.debuffHitCount;
    delete passive.debuffHitDurationSec;
  }
  if (shape !== 'single' && shape !== 'aoe') {
    delete passive.debuffHitDurationSec;
  }
  if (shape !== 'chain') {
    delete passive.debuffChainCount;
    delete passive.debuffChainMaxDistancePx;
    delete passive.debuffChainPowerStepMultiplier;
    delete passive.debuffChainPowerStepMode;
    delete passive.debuffChainDurationSec;
  }
  if (shape !== 'scatter') {
    delete passive.debuffScatterRadiusPx;
    delete passive.debuffScatterSpreadRadiusPx;
    delete passive.debuffScatterHitCount;
    delete passive.debuffScatterDurationSec;
    delete passive.debuffScatterSpreadRate;
  }
  if (shape !== 'pierce') {
    delete passive.debuffPiercePowerStepMultiplier;
    delete passive.debuffPiercePowerStepMode;
    delete passive.debuffPierceDurationSec;
  }
}

export function resolvePassiveDebuffTargets(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
): CombatantState[] {
  return resolveEffectTargets(
    passiveDebuffToEffectDef(passive),
    source,
    allies,
    enemies,
    gameData,
  );
}

/** JSON 検証用: debuff 接頭辞フィールドを effect 形へリマップ */
export function remapPassiveDebuffTargetingToEffect(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DEBUFF_TARGETING_FIELD_MAP,
  )) {
    if (obj[passiveKey] !== undefined) {
      remapped[effectKey] = obj[passiveKey];
    }
  }
  return remapped;
}

/** JSON 検証用: effect 形の形状フィールドを debuff 接頭辞へリマップ */
export function remapEffectTargetingToPassiveDebuff(
  fields: Record<string, unknown>,
): Partial<PassiveSkillDef> {
  const result: Partial<PassiveSkillDef> = {};
  for (const [effectKey, passiveKey] of Object.entries(
    PASSIVE_DEBUFF_TARGETING_FIELD_MAP,
  ) as Array<
    [keyof typeof PASSIVE_DEBUFF_TARGETING_FIELD_MAP, PassiveDebuffTargetingKey]
  >) {
    if (fields[effectKey] !== undefined) {
      (result as Record<string, unknown>)[passiveKey] = fields[effectKey];
    }
  }
  return result;
}
