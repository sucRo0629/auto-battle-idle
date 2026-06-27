import {
  applyBarrierToTarget,
  clampHpToEffectiveMax,
  computeInstantHealExcess,
  currentHpRatio,
  getEffectiveMaxHp,
  getPassiveDefs,
  resolveResourceAmount,
} from './combatMath.ts';
import { isAllySupportBlockedDuringArenaDominance } from './arenaDominance.ts';
import { dispelDebuffsOnTarget } from './debuffDispel.ts';
import { resolvePassiveDebuffTargets } from './passiveDebuffBridge.ts';
import { resolvePassiveBuffTargets } from './passiveBuffBridge.ts';
import { parseStatBuffModifiers } from './statBuffModifiers.ts';
import { resolvePassiveDamageReductionTargets } from './passiveDamageReductionBridge.ts';
import { resolvePassiveAuraHotTargets, resolvePassiveHotTargets } from './passiveHotBridge.ts';
import {
  resolvePassiveDispelTargets,
} from './passiveDispelBridge.ts';
import {
  stripHerbalPotencyAurasFromSource,
} from './herbalPotency.ts';
import {
  isPassiveBarrierBuff,
  resolvePassiveBarrierTrigger,
  resolvePassivePeriodicTrigger,
  rollPassiveTriggerChance,
  usesBuffAuraMode,
  usesDebuffAuraMode,
  usesHotAuraMode,
} from './passivePeriodicTrigger.ts';
import { resolveDottedEnemyHealReceivedMultiplier } from './hunterPassives.ts';
import { resolveDuelistPrideIncomingHealMultiplier } from './duelistPride.ts';
import { resolveDamageIncreaseMultiplier } from './damageIncrease.ts';
import { resolveEffectivePassiveAmountSpec } from './skillAmountOverride.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  DamageIncreaseSpec,
  GameData,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillCooldown,
  SkillEffectDef,
  StatusEffect,
  StatusEffectStat,
  TargetShape,
} from './types.ts';
import {
  asStatusEffectStatList,
  filterStatusEffectStats,
  isPassiveHot,
} from './types.ts';

const PASSIVE_AURA_DURATION_SEC = 99999;
const PASSIVE_HOT_AURA_PREFIX = 'passive_hot_aura_';
const PASSIVE_BUFF_AURA_PREFIX = 'passive_buff_aura_';
const PASSIVE_DEBUFF_AURA_PREFIX = 'passive_debuff_aura_';

function snapshotEffectsByPrefix(
  units: CombatantState[],
  prefix: string,
): Map<string, Map<string, StatusEffect>> {
  const snapshot = new Map<string, Map<string, StatusEffect>>();
  for (const unit of units) {
    const effects = unit.statusEffects.filter((effect) =>
      effect.id.startsWith(prefix),
    );
    if (effects.length > 0) {
      snapshot.set(unit.id, new Map(effects.map((effect) => [effect.id, effect])));
    }
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith(prefix),
    );
  }
  return snapshot;
}

function restoreAuraTickState(
  effect: StatusEffect,
  previous?: StatusEffect,
): StatusEffect {
  if (previous?.tickSec !== undefined) {
    effect.tickSec = previous.tickSec;
  }
  return effect;
}

export interface PassiveDamageContext {
  skill?: ActiveSkillDef;
  slotKind?: SkillCooldown['slotKind'];
  crowdHitCount?: number;
  targetShape?: TargetShape;
  /** bonusBasicAttackOnHit 追加 Hit — 再帰発火を抑止 */
  suppressBonusBasicAttack?: boolean;
  /** allyAttackFollowUp 追撃 Hit — 再帰追撃を抑止 */
  suppressAllyAttackFollowUp?: boolean;
  /** bonusActiveOnHit 追撃 Hit — P3 再帰を抑止 */
  suppressBonusActiveOnHit?: boolean;
  /** 味方一覧（仕留め aura 等） */
  allies?: CombatantState[];
}

export function getEvasionChance(
  target: CombatantState,
  _passives: Record<string, PassiveSkillDef>,
): number {
  let chance = 0;
  for (const effect of target.statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.overlay !== 'evasion') continue;
    chance += effect.evasionChance ?? 0;
  }
  return Math.min(1, chance);
}

export function rollsEvasion(
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  const chance = getEvasionChance(target, passives);
  if (chance <= 0) return false;
  return Math.random() < chance;
}

/** @deprecated use getPassiveSpecialEffectMultiplier('damage', ...) */
export function getPassiveDamageIncreaseMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  return getPassiveSpecialEffectMultiplier('damage', attacker, target, passives);
}

export function getPassiveSpecialEffectMultiplier(
  applyTo: 'damage' | 'heal' | 'barrier',
  attacker: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = 1;
  for (const passive of getPassiveDefs(attacker, passives)) {
    if (
      passive.effect === 'specialEffect' &&
      passive.specialEffectApplyTo === applyTo &&
      passive.specialEffect
    ) {
      mul *= resolveDamageIncreaseMultiplier(attacker, target, passive.specialEffect);
    }
  }
  return mul;
}

export function getPassiveOutgoingDamageMultiplier(
  attacker: CombatantState,
  _target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  context: PassiveDamageContext = {},
): number {
  const defs = getPassiveDefs(attacker, passives);
  let mul = 1;

  for (const passive of defs) {
    if (passive.effect !== 'aoeCrowdBonus') continue;
    const shape = context.targetShape;
    const hits = context.crowdHitCount ?? 0;
    if ((shape === 'aoe' || shape === 'scatter') && hits > 1) {
      const per = passive.perExtraTargetScale ?? 0;
      const cap = passive.maxExtraTargets ?? 0;
      const extra = Math.min(hits - 1, cap);
      mul *= 1 + extra * per;
    }
  }

  return mul;
}

export function resolveEffectDamageIncreaseMultiplier(
  attacker: CombatantState,
  target: CombatantState,
  effectIncrease: DamageIncreaseSpec | undefined,
  statusIncrease: DamageIncreaseSpec | undefined,
  passives: Record<string, PassiveSkillDef>,
): number {
  let mul = getPassiveSpecialEffectMultiplier('damage', attacker, target, passives);
  if (effectIncrease) {
    mul *= resolveDamageIncreaseMultiplier(attacker, target, effectIncrease);
  }
  if (statusIncrease) {
    mul *= resolveDamageIncreaseMultiplier(attacker, target, statusIncrease);
  }
  return mul;
}

export function resolveIncomingHealAmount(
  target: CombatantState,
  baseAmount: number,
  passives: Record<string, PassiveSkillDef>,
  allies: CombatantState[] = [],
): number {
  if (baseAmount <= 0) return 0;
  const mul =
    getPassiveSpecialEffectMultiplier('heal', target, target, passives) *
    resolveDuelistPrideIncomingHealMultiplier(target, passives) *
    resolveDottedEnemyHealReceivedMultiplier(target, allies, passives);
  return Math.floor(Math.max(0, baseAmount * mul));
}

export type ExcessHealSource = 'outgoing' | 'incoming';

function passiveExcessHealSources(
  passive: PassiveSkillDef,
): ExcessHealSource[] {
  const sources = passive.excessHealSources;
  if (!sources || sources.length === 0) return ['outgoing'];
  return sources;
}

export function applyExcessHealToBarrierFromPassive(
  owner: CombatantState,
  target: CombatantState,
  attemptedHeal: number,
  passives: Record<string, PassiveSkillDef>,
  source: ExcessHealSource,
): number {
  const excess = computeInstantHealExcess(target, attemptedHeal);
  return applyExcessHealToBarrierFromExcess(
    owner,
    target,
    excess,
    passives,
    source,
  );
}

export function applyExcessHealToBarrierFromExcess(
  owner: CombatantState,
  target: CombatantState,
  excess: number,
  passives: Record<string, PassiveSkillDef>,
  source: ExcessHealSource,
): number {
  if (excess <= 0) return 0;
  const defs = getPassiveDefs(owner, passives);
  let scaleSum = 0;
  for (const passive of defs) {
    if (passive.effect !== 'excessHealToBarrier') continue;
    if (!passiveExcessHealSources(passive).includes(source)) continue;
    scaleSum += passive.barrierScale ?? 1;
  }
  if (scaleSum <= 0) return 0;

  const grant = Math.floor(excess * scaleSum);
  if (grant <= 0) return 0;
  return applyBarrierToTarget(target, grant, false);
}

export function syncHotAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const previousEffects = snapshotEffectsByPrefix(
    allies,
    PASSIVE_HOT_AURA_PREFIX,
  );

  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (
        !isPassiveHot(passive) ||
        !passive.hotAmount ||
        !usesHotAuraMode(passive)
      ) {
        continue;
      }
      applyPassiveHotFromPassive(
        source,
        passive,
        allies,
        enemies,
        passives,
        gameData,
        PASSIVE_HOT_AURA_PREFIX,
        previousEffects,
      );
    }
  }
}

export function syncBuffAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const units = [...allies, ...enemies];
  snapshotEffectsByPrefix(units, PASSIVE_BUFF_AURA_PREFIX);

  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'buff' || !usesBuffAuraMode(passive)) continue;
      applyPassiveBuffFromPassive(
        source,
        passive,
        allies,
        enemies,
        passives,
        gameData,
        PASSIVE_AURA_DURATION_SEC,
        PASSIVE_BUFF_AURA_PREFIX,
      );
    }
  }

  for (const unit of units) {
    clampHpToEffectiveMax(unit);
  }
}

function applyPassiveBuffOverlayToTarget(
  source: CombatantState,
  target: CombatantState,
  passive: PassiveSkillDef,
  subKind: 'block' | 'evasion',
  durationSec: number,
): void {
  const chance = passive.chance ?? 0;
  if (chance <= 0) return;
  target.statusEffects.push(
    createPassiveOverlayBuffEffect(
      source,
      passive.id,
      subKind,
      chance,
      durationSec,
    ),
  );
}

export function applyPassiveBuffFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  _passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
  durationSec: number,
  idPrefix = 'passive_buff_periodic_',
): void {
  if (passive.effect !== 'buff') return;
  const subKind = passive.buffSubKind ?? 'stat';
  if (subKind === 'barrier') return;

  const targets = resolvePassiveBuffTargets(
    source,
    passive,
    allies,
    enemies,
    gameData,
  );

  if (subKind === 'block' || subKind === 'evasion') {
    for (const target of targets) {
      applyPassiveBuffOverlayToTarget(source, target, passive, subKind, durationSec);
    }
    return;
  }

  const modifiers = parseStatBuffModifiers(passive);
  if (modifiers.length === 0) {
    return;
  }

  for (const target of targets) {
    for (let i = 0; i < modifiers.length; i++) {
      const entry = modifiers[i]!;
      const multiplier = entry.multiplier;
      const flatBonus = entry.flatBonus;
      if (multiplier === undefined && flatBonus === undefined) continue;
      target.statusEffects.push({
        ...createPassiveStatBuffEffect(
          source,
          passive.id,
          entry.stat,
          i,
          multiplier,
          flatBonus,
        ),
        id: `${idPrefix}${source.id}_${passive.id}_${entry.stat}_${i}`,
        durationSec,
        remainingSec: durationSec,
      });
    }
  }
}

export function syncDebuffAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const units = [...allies, ...enemies];
  snapshotEffectsByPrefix(units, PASSIVE_DEBUFF_AURA_PREFIX);

  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'debuff' || !usesDebuffAuraMode(passive)) continue;
      applyPassiveDebuffFromPassive(
        source,
        passive,
        allies,
        enemies,
        passives,
        gameData,
        PASSIVE_AURA_DURATION_SEC,
        PASSIVE_DEBUFF_AURA_PREFIX,
      );
    }
  }
}

function applyPassiveStatDebuffToTarget(
  source: CombatantState,
  target: CombatantState,
  passive: PassiveSkillDef,
  durationSec: number,
  idPrefix: string,
  onDebuffReceived?: (target: CombatantState) => void,
): void {
  const subKind = passive.debuffSubKind ?? 'stat';
  if (subKind !== 'stat') return;
  const stats = asStatusEffectStatList(passive.debuffStat);
  const multiplier = passive.debuffMultiplier;
  const flatBonus = passive.debuffFlatBonus;
  if (stats.length === 0 || (multiplier === undefined && flatBonus === undefined)) {
    return;
  }
  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i]!;
    target.statusEffects.push({
      id: `${idPrefix}${source.id}_${passive.id}_${stat}_${i}`,
      kind: 'debuff',
      stat,
      multiplier: multiplier ?? 1,
      ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
      sourceId: source.id,
      durationSec,
      remainingSec: durationSec,
    });
  }
  if (idPrefix !== 'passive_debuff_') {
    onDebuffReceived?.(target);
  }
}

export function applyPassiveDebuffFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
  durationSec: number,
  idPrefix = 'passive_debuff_periodic_',
): void {
  if (passive.effect !== 'debuff') return;
  const subKind = passive.debuffSubKind ?? 'stat';
  if (subKind !== 'stat') return;
  const targets = resolvePassiveDebuffTargets(
    source,
    passive,
    allies,
    enemies,
    gameData,
  );
  for (const target of targets) {
    applyPassiveStatDebuffToTarget(
      source,
      target,
      passive,
      durationSec,
      idPrefix,
    );
  }
}

export const syncBlockAuras = syncBuffAuras;
export const syncEvasionAuras = syncBuffAuras;

export function syncDamageReductionAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const units = [...allies, ...enemies];
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_dmg_reduction_'),
    );
  }

  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'damageReduction') continue;
      const percent = passive.damageReductionPercent ?? 0;
      if (percent <= 0) continue;
      const targets = resolvePassiveDamageReductionTargets(
        source,
        passive,
        allies,
        enemies,
        gameData,
      );
      for (const target of targets) {
        target.statusEffects.push(
          createPassiveDamageReductionEffect(source, passive.id, percent),
        );
      }
    }
  }
}

export function syncFrontThreatControlAuras(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const unit of allies) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_front_threat_dmg_reduction_'),
    );
  }

  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'threatControl') continue;
      const percent = passive.frontDamageTakenReduction;
      if (percent === undefined || percent <= 0) continue;
      for (const target of allies) {
        if (!target.isAlive || target.formationRow !== 'front') continue;
        target.statusEffects.push(
          createPassiveDamageReductionEffect(
            source,
            passive.id,
            percent,
            'passive_front_threat_dmg_reduction_',
          ),
        );
      }
    }
  }
}

function createPassiveOverlayBuffEffect(
  source: CombatantState,
  passiveId: string,
  subKind: 'block' | 'evasion',
  chance: number,
  durationSec: number = PASSIVE_AURA_DURATION_SEC,
): StatusEffect {
  return {
    id: `passive_buff_aura_${source.id}_${passiveId}_${subKind}`,
    kind: 'buff',
    overlay: subKind,
    ...(subKind === 'block'
      ? { blockChance: chance }
      : { evasionChance: chance }),
    sourceId: source.id,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
  };
}

function createPassiveStatBuffEffect(
  source: CombatantState,
  passiveId: string,
  stat: StatusEffectStat,
  index: number,
  multiplier?: number,
  flatBonus?: number,
): StatusEffect {
  return {
    id: `passive_buff_aura_${source.id}_${passiveId}_${stat}_${index}`,
    kind: 'buff',
    stat,
    multiplier: multiplier ?? 1,
    ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
    sourceId: source.id,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
  };
}

function createPassiveDamageReductionEffect(
  source: CombatantState,
  passiveId: string,
  percent: number,
  idPrefix = 'passive_dmg_reduction_',
): StatusEffect {
  return {
    id: `${idPrefix}${source.id}_${passiveId}`,
    kind: 'buff',
    stat: 'damageTaken',
    multiplier: Math.max(0, 1 - percent),
    sourceId: source.id,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
  };
}

const SELF_HP_BUFF_NEUTRAL_EPSILON = 0.001;

export function resolveSelfHpRatioBuffScale(
  unit: CombatantState,
  maxBuffAtHpRatio: number,
): number {
  if (getEffectiveMaxHp(unit) <= 0) return 0;
  if (maxBuffAtHpRatio >= 1) return 0;
  const hpRatio = currentHpRatio(unit);
  const denom = 1 - maxBuffAtHpRatio;
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(1, (1 - hpRatio) / denom));
}

function createSelfHpRatioBuffEffect(
  unit: CombatantState,
  passive: PassiveSkillDef,
  stat: StatusEffectStat,
  multiplier: number,
  flatBonus?: number,
): StatusEffect {
  return {
    id: `passive_self_hp_buff_${unit.id}_${passive.id}_${stat}`,
    kind: 'buff',
    stat,
    multiplier,
    ...(flatBonus !== undefined && flatBonus > 0 ? { flatBonus } : {}),
    sourceId: unit.id,
    skillId: passive.id,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
  };
}

export function syncSelfHpRatioBuffAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  const units = [...allies, ...enemies];
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_self_hp_buff_'),
    );
  }

  for (const unit of units) {
    if (!unit.isAlive) continue;
    for (const passive of getPassiveDefs(unit, passives)) {
      if (passive.effect !== 'selfHpRatioBuff') continue;
      const maxBuffAtHpRatio = passive.maxBuffAtHpRatio ?? 0;
      const t = resolveSelfHpRatioBuffScale(unit, maxBuffAtHpRatio);
      if (t <= 0) continue;

      const stats = filterStatusEffectStats(passive.buffStat);
      if (stats.length === 0) continue;

      for (const stat of stats) {
        let multiplier = 1;
        let flatBonus: number | undefined;

        if (passive.buffMultiplierMax !== undefined) {
          multiplier = 1 + (passive.buffMultiplierMax - 1) * t;
        }
        if (passive.buffFlatBonusMax !== undefined) {
          flatBonus = passive.buffFlatBonusMax * t;
        }

        const hasMul =
          Math.abs(multiplier - 1) >= SELF_HP_BUFF_NEUTRAL_EPSILON;
        const hasFlat = flatBonus !== undefined && flatBonus > 0;
        if (!hasMul && !hasFlat) continue;

        unit.statusEffects.push(
          createSelfHpRatioBuffEffect(
            unit,
            passive,
            stat,
            multiplier,
            flatBonus,
          ),
        );
      }
    }
  }
}

function resolvePassiveHotDurationSec(hotDurationSec: number | undefined): number {
  if (hotDurationSec === undefined || hotDurationSec <= 0) {
    return PASSIVE_AURA_DURATION_SEC;
  }
  return hotDurationSec;
}

function passiveHotEffectId(
  sourceId: string,
  passiveId: string,
  idPrefix = 'passive_hot_periodic_',
): string {
  return `${idPrefix}${sourceId}_${passiveId}`;
}

export function applyPassiveBarrierFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  if (!isPassiveBarrierBuff(passive) || !passive.barrierAmount) return;
  const targets = resolvePassiveBuffTargets(
    source,
    passive,
    allies,
    enemies,
    gameData,
  );
  const barrierAmount = resolveEffectivePassiveAmountSpec(
    source,
    passives,
    passive.id,
    'barrierAmount',
    passive.barrierAmount,
  );
  for (const target of targets) {
    if (isAllySupportBlockedDuringArenaDominance(target, source)) continue;
    const grant = resolveResourceAmount(
      source,
      target,
      barrierAmount,
      passives,
    );
    if (grant <= 0) continue;
    applyBarrierToTarget(target, grant, passive.barrierStack);
  }
}

export function applyPassiveHotFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
  idPrefix = 'passive_hot_periodic_',
  previousEffectsByTarget?: Map<string, Map<string, StatusEffect>>,
): void {
  if (!isPassiveHot(passive) || !passive.hotAmount) return;
  const targets = resolvePassiveAuraHotTargets(
    source,
    passive,
    allies,
    enemies,
  );
  const durationSec = resolvePassiveHotDurationSec(passive.hotDurationSec);
  const effectId = passiveHotEffectId(source.id, passive.id, idPrefix);
  const hotAmount = resolveEffectivePassiveAmountSpec(
    source,
    passives,
    passive.id,
    'hotAmount',
    passive.hotAmount,
  );
  for (const target of targets) {
    if (isAllySupportBlockedDuringArenaDominance(target, source)) continue;
    target.statusEffects = target.statusEffects.filter(
      (effect) => effect.id !== effectId,
    );
    const previousEffect = previousEffectsByTarget?.get(target.id)?.get(effectId);
    target.statusEffects.push(
      restoreAuraTickState(
        createPassiveHotEffect(
          source,
          passive.id,
          hotAmount,
          durationSec,
        ),
        previousEffect,
      ),
    );
  }
}

function createPassiveHotEffect(
  source: CombatantState,
  passiveId: string,
  amount: ResourceAmountSpec,
  durationSec: number = PASSIVE_AURA_DURATION_SEC,
  idPrefix = 'passive_hot_periodic_',
): StatusEffect {
  return {
    id: passiveHotEffectId(source.id, passiveId, idPrefix),
    kind: 'buff',
    overlay: 'hot',
    amount,
    sourceId: source.id,
    skillId: passiveId,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    tickSec: 1,
  };
}

export function applyPassiveDispelFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  gameData: GameData,
  options?: { onlyTarget?: CombatantState },
): void {
  if (passive.effect !== 'periodicDispel') return;
  const targets = resolvePassiveDispelTargets(
    source,
    passive,
    allies,
    enemies,
    gameData,
  );
  const onlyTarget = options?.onlyTarget;
  for (const target of targets) {
    if (onlyTarget !== undefined && target.id !== onlyTarget.id) continue;
    dispelDebuffsOnTarget(
      target,
      passive.dispelCount ?? 0,
      passive.dispelTags,
      source.id,
      passive.dispelPriority,
    );
  }
}

export function resetPassiveDispelTriggerLimits(
  units: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const unit of units) {
    let remaining: Record<string, number> | undefined;
    for (const passive of getPassiveDefs(unit, passives)) {
      if (passive.effect !== 'periodicDispel') continue;
      const limit = passive.dispelTriggerLimit;
      if (limit === undefined) continue;
      remaining ??= {};
      remaining[passive.id] = limit;
    }
    if (remaining !== undefined) {
      unit.passiveDispelRemainingTriggers = remaining;
    } else {
      delete unit.passiveDispelRemainingTriggers;
    }
  }
}

function hasPassiveDispelTriggerRemaining(
  source: CombatantState,
  passive: PassiveSkillDef,
): boolean {
  const limit = passive.dispelTriggerLimit;
  if (limit === undefined) return true;
  const remaining =
    source.passiveDispelRemainingTriggers?.[passive.id] ?? limit;
  return remaining > 0;
}

function consumePassiveDispelTrigger(
  source: CombatantState,
  passive: PassiveSkillDef,
): void {
  const limit = passive.dispelTriggerLimit;
  if (limit === undefined) return;
  const current =
    source.passiveDispelRemainingTriggers?.[passive.id] ?? limit;
  if (source.passiveDispelRemainingTriggers === undefined) {
    source.passiveDispelRemainingTriggers = {};
  }
  source.passiveDispelRemainingTriggers[passive.id] = Math.max(0, current - 1);
}

export function handlePassiveDispelOnDebuffReceived(
  debuffTarget: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const allUnits = [...allies, ...enemies];
  for (const source of allUnits) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'periodicDispel') continue;
      if (resolvePassivePeriodicTrigger(passive) !== 'onDebuffReceived') {
        continue;
      }
      if (!hasPassiveDispelTriggerRemaining(source, passive)) continue;

      const targets = resolvePassiveDispelTargets(
        source,
        passive,
        allies,
        enemies,
        gameData,
      );
      if (!targets.some((target) => target.id === debuffTarget.id)) continue;
      if (!rollPassiveTriggerChance(passive)) continue;

      applyPassiveDispelFromPassive(
        source,
        passive,
        allies,
        enemies,
        gameData,
        { onlyTarget: debuffTarget },
      );
      consumePassiveDispelTrigger(source, passive);
    }
  }
}

export function stripPassivesAurasFromSource(
  sourceId: string,
  units: CombatantState[],
): void {
  stripHerbalPotencyAurasFromSource(sourceId, units);
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) =>
        effect.sourceId !== sourceId ||
        (!effect.id.startsWith('passive_hot_') &&
          !effect.id.startsWith('passive_dmg_reduction_') &&
          !effect.id.startsWith('passive_block_') &&
          !effect.id.startsWith('passive_buff_') &&
          !effect.id.startsWith('passive_debuff_')),
    );
  }
}

export function resolveOutgoingHealSpecialMultiplier(
  actor: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  return getPassiveSpecialEffectMultiplier('heal', actor, target, passives);
}

export function countDamageTargetsInResolution(
  effectDef: SkillEffectDef,
  waves: Array<{ targets: unknown[] }>,
): number {
  if (effectDef.type !== 'damage') return 0;
  return waves.reduce((sum, wave) => sum + wave.targets.length, 0);
}

export function firePeriodicPassivesForTrigger(
  trigger: 'stageStart' | 'waveStart',
  units: CombatantState[],
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      const periodicTrigger = isPassiveBarrierBuff(passive)
        ? resolvePassiveBarrierTrigger(passive)
        : resolvePassivePeriodicTrigger(passive);
      if (periodicTrigger !== trigger) continue;
      if (!rollPassiveTriggerChance(passive)) continue;

      if (isPassiveHot(passive) && passive.hotAmount) {
        applyPassiveHotFromPassive(
          source,
          passive,
          allies,
          enemies,
          passives,
          gameData,
        );
        continue;
      }
      if (isPassiveBarrierBuff(passive) && passive.barrierAmount) {
        applyPassiveBarrierFromPassive(
          source,
          passive,
          allies,
          enemies,
          passives,
          gameData,
        );
        continue;
      }
      if (
        passive.effect === 'buff' &&
        !usesBuffAuraMode(passive) &&
        !isPassiveBarrierBuff(passive) &&
        resolvePassivePeriodicTrigger(passive) === trigger
      ) {
        const durationSec = passive.buffDurationSec ?? 0;
        if (durationSec <= 0) continue;
        applyPassiveBuffFromPassive(
          source,
          passive,
          allies,
          enemies,
          passives,
          gameData,
          durationSec,
        );
        continue;
      }
      if (passive.effect === 'periodicDispel') {
        if (!hasPassiveDispelTriggerRemaining(source, passive)) continue;
        if (!rollPassiveTriggerChance(passive)) continue;
        applyPassiveDispelFromPassive(
          source,
          passive,
          allies,
          enemies,
          gameData,
        );
        consumePassiveDispelTrigger(source, passive);
        continue;
      }
      if (
        passive.effect === 'debuff' &&
        !usesDebuffAuraMode(passive) &&
        resolvePassivePeriodicTrigger(passive) === trigger
      ) {
        const durationSec = passive.debuffDurationSec ?? 0;
        if (durationSec <= 0) continue;
        applyPassiveDebuffFromPassive(
          source,
          passive,
          allies,
          enemies,
          passives,
          gameData,
          durationSec,
        );
      }
    }
  }
}
