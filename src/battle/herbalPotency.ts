import {
  clampHpToEffectiveMax,
  getEffectiveMaxHp,
  getPassiveDefs,
} from './combatMath.ts';
import {
  resolvePassiveAuraHotTargets,
} from './passiveHotBridge.ts';
import type {
  CombatantState,
  GameData,
  PassiveSkillDef,
  ResourceAmountSpec,
  StatusEffect,
} from './types.ts';

export const HERBAL_POTENCY_HOT_TICK_SEC = 1;
export const HERBAL_POTENCY_ACCUMULATE_SEC = 3;
export const HERBAL_POTENCY_AURA_PREFIX = 'herbal_potency_aura_';
export const HERBAL_POTENCY_STACKS_ID_PREFIX = 'herbal_potency_stacks_';
export const HERBAL_POTENCY_CONSTITUTION_ID_PREFIX = 'herbal_potency_constitution_';
const HERBAL_POTENCY_AURA_DURATION_SEC = 99999;

export interface MergedHerbalPotencyConfig {
  maxStacks: number;
  hotPerStackPercent: number;
  hotTickSec: number;
  accumulateSec: number;
  auraAmount?: ResourceAmountSpec;
  auraPassive?: PassiveSkillDef;
  constitutionThresholds: number[];
  constitutionHpMultipliers: number[];
}

export function isHerbalPotencyPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'herbalPotency';
}

export function isHerbalistOriginatedHot(
  source: CombatantState | undefined,
  skillId: string | undefined,
): boolean {
  if (source?.classId === 'sp_alchemist') return true;
  if (skillId?.startsWith('sp_alchemist')) return true;
  return false;
}

export function allyHasHerbalistHot(
  target: CombatantState,
  allUnits: CombatantState[],
): boolean {
  const sourceById = new Map(allUnits.map((u) => [u.id, u]));
  return target.statusEffects.some((effect) => {
    if (effect.overlay !== 'hot' || effect.remainingSec <= 0) return false;
    const source = effect.sourceId ? sourceById.get(effect.sourceId) : undefined;
    return isHerbalistOriginatedHot(source, effect.skillId);
  });
}

export function mergeHerbalPotencyPassives(
  passives: PassiveSkillDef[],
): MergedHerbalPotencyConfig {
  let maxStacks = 0;
  let hotPerStackPercent = 0;
  let hotTickSec = HERBAL_POTENCY_HOT_TICK_SEC;
  let accumulateSec = HERBAL_POTENCY_ACCUMULATE_SEC;
  let auraAmount: ResourceAmountSpec | undefined;
  let auraPassive: PassiveSkillDef | undefined;
  const constitutionThresholds: number[] = [];
  const constitutionHpMultipliers: number[] = [];

  for (const passive of passives) {
    if (!isHerbalPotencyPassive(passive)) continue;
    if (passive.herbalPotencyMaxStacks !== undefined) {
      maxStacks = Math.max(maxStacks, passive.herbalPotencyMaxStacks);
    }
    if (passive.herbalPotencyHotPerStackPercent !== undefined) {
      hotPerStackPercent = passive.herbalPotencyHotPerStackPercent;
    }
    if (passive.herbalPotencyHotTickSec !== undefined) {
      hotTickSec = passive.herbalPotencyHotTickSec;
    }
    if (passive.herbalPotencyAccumulateSec !== undefined) {
      accumulateSec = passive.herbalPotencyAccumulateSec;
    }
    if (passive.hotAmount) {
      auraAmount = passive.hotAmount;
      auraPassive = passive;
    }
    if (passive.herbalPotencyConstitutionThresholds) {
      for (const t of passive.herbalPotencyConstitutionThresholds) {
        if (!constitutionThresholds.includes(t)) {
          constitutionThresholds.push(t);
        }
      }
    }
    if (passive.herbalPotencyConstitutionHpMultipliers) {
      for (const m of passive.herbalPotencyConstitutionHpMultipliers) {
        constitutionHpMultipliers.push(m);
      }
    }
  }

  constitutionThresholds.sort((a, b) => a - b);

  return {
    maxStacks,
    hotPerStackPercent,
    hotTickSec,
    accumulateSec,
    auraAmount,
    auraPassive,
    constitutionThresholds,
    constitutionHpMultipliers,
  };
}

export function resolvePartyHerbalPotencyConfig(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): MergedHerbalPotencyConfig {
  const herbalPotencyPassives: PassiveSkillDef[] = [];
  for (const ally of allies) {
    if (!ally.isAlive || ally.classId !== 'sp_alchemist') continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (isHerbalPotencyPassive(passive)) {
        herbalPotencyPassives.push(passive);
      }
    }
  }
  return mergeHerbalPotencyPassives(herbalPotencyPassives);
}

export function getHerbalPotencyStacks(target: CombatantState): number {
  const effect = target.statusEffects.find(
    (e) => e.overlay === 'herbalPotency' && e.remainingSec > 0,
  );
  return effect?.stacks ?? 0;
}

export function setHerbalPotencyStacks(
  target: CombatantState,
  stacks: number,
  sourceId: string,
): void {
  const clamped = Math.max(0, stacks);
  const effectId = `${HERBAL_POTENCY_STACKS_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter(
    (e) => e.id !== effectId,
  );
  if (clamped <= 0) return;
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: 'herbalPotency',
    stacks: clamped,
    sourceId,
    multiplier: 1,
    durationSec: HERBAL_POTENCY_AURA_DURATION_SEC,
    remainingSec: HERBAL_POTENCY_AURA_DURATION_SEC,
    displayName: '薬効',
  });
}

export function addHerbalPotencyStacks(
  target: CombatantState,
  amount: number,
  maxStacks: number,
  sourceId: string,
): number {
  if (amount <= 0 || maxStacks <= 0) return getHerbalPotencyStacks(target);
  const current = getHerbalPotencyStacks(target);
  const next = Math.min(maxStacks, current + amount);
  setHerbalPotencyStacks(target, next, sourceId);
  return next;
}

export function consumeHerbalPotencyStacks(target: CombatantState): number {
  const consumed = getHerbalPotencyStacks(target);
  setHerbalPotencyStacks(target, 0, target.id);
  return consumed;
}

export function resolveHerbalPotencyHotBonus(
  target: CombatantState,
  config: MergedHerbalPotencyConfig,
): number {
  const stacks = getHerbalPotencyStacks(target);
  if (stacks <= 0 || config.hotPerStackPercent <= 0) return 0;
  return Math.floor(
    getEffectiveMaxHp(target) * config.hotPerStackPercent * stacks,
  );
}

function resolveConstitutionTier(
  stacks: number,
  thresholds: readonly number[],
): number {
  let tier = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (stacks >= thresholds[i]!) tier = i + 1;
  }
  return tier;
}

function syncConstitutionBuff(
  target: CombatantState,
  tier: number,
  multiplier: number,
): void {
  const effectId = `${HERBAL_POTENCY_CONSTITUTION_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  if (tier <= 0 || multiplier <= 1) return;
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    stat: 'hp',
    multiplier,
    sourceId: target.id,
    durationSec: HERBAL_POTENCY_AURA_DURATION_SEC,
    remainingSec: HERBAL_POTENCY_AURA_DURATION_SEC,
    displayName: '薬効体質',
  });
}

function updateConstitutionTier(
  target: CombatantState,
  config: MergedHerbalPotencyConfig,
): void {
  const stacks = getHerbalPotencyStacks(target);
  const tierFromStacks = resolveConstitutionTier(
    stacks,
    config.constitutionThresholds,
  );
  const achieved = target.herbalPotencyConstitutionTier ?? 0;
  if (tierFromStacks > achieved) {
    target.herbalPotencyConstitutionTier = tierFromStacks;
  }
  const tier = target.herbalPotencyConstitutionTier ?? 0;
  if (tier <= 0) return;
  const multiplier =
    config.constitutionHpMultipliers[tier - 1] ?? 1;
  syncConstitutionBuff(target, tier, multiplier);
}

function applyHerbalPotencyAura(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  if (!passive.hotAmount) return;
  const targets = resolvePassiveAuraHotTargets(
    source,
    passive,
    allies,
    enemies,
  );
  const effectId = `${HERBAL_POTENCY_AURA_PREFIX}${source.id}_${passive.id}`;
  const amount = passive.hotAmount;
  for (const target of targets) {
    target.statusEffects = target.statusEffects.filter(
      (e) => e.id !== effectId,
    );
    target.statusEffects.push({
      id: effectId,
      kind: 'buff',
      overlay: 'hot',
      amount,
      sourceId: source.id,
      skillId: passive.id,
      multiplier: 1,
      durationSec: HERBAL_POTENCY_AURA_DURATION_SEC,
      remainingSec: HERBAL_POTENCY_AURA_DURATION_SEC,
      tickSec:
        passive.herbalPotencyHotTickSec ?? HERBAL_POTENCY_HOT_TICK_SEC,
    });
  }
}

export function syncHerbalPotencyAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
): void {
  const config = resolvePartyHerbalPotencyConfig(allies, passives);

  for (const unit of allies) {
    unit.statusEffects = unit.statusEffects.filter(
      (e) => !e.id.startsWith(HERBAL_POTENCY_AURA_PREFIX),
    );
  }

  for (const source of allies) {
    if (!source.isAlive || source.classId !== 'sp_alchemist') continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (!isHerbalPotencyPassive(passive) || !passive.hotAmount) continue;
      applyHerbalPotencyAura(
        source,
        passive,
        allies,
        enemies,
        passives,
        gameData,
      );
    }
  }

  for (const target of allies) {
    if (!target.isAlive) continue;
    updateConstitutionTier(target, config);
    clampHpToEffectiveMax(target);
  }
}

export function tickHerbalPotencyAccumulation(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  deltaTime: number,
): void {
  const config = resolvePartyHerbalPotencyConfig(allies, passives);
  if (config.maxStacks <= 0) return;

  const herbalistSource = allies.find(
    (a) => a.isAlive && a.classId === 'sp_alchemist',
  );
  if (!herbalistSource) return;

  const allUnits = allies;

  for (const target of allies) {
    if (!target.isAlive) continue;
    if (!allyHasHerbalistHot(target, allUnits)) {
      target.herbalPotencyAccumTickSec = undefined;
      continue;
    }

    if (target.herbalPotencyAccumTickSec === undefined) {
      target.herbalPotencyAccumTickSec = config.accumulateSec;
    }
    target.herbalPotencyAccumTickSec -= deltaTime;

    while (
      target.herbalPotencyAccumTickSec !== undefined &&
      target.herbalPotencyAccumTickSec <= 0
    ) {
      const before = getHerbalPotencyStacks(target);
      addHerbalPotencyStacks(
        target,
        1,
        config.maxStacks,
        herbalistSource.id,
      );
      const after = getHerbalPotencyStacks(target);
      if (after > before) {
        updateConstitutionTier(target, config);
      }
      target.herbalPotencyAccumTickSec += config.accumulateSec;
      if (after >= config.maxStacks) break;
    }
  }
}

export function consumeAllAllyHerbalPotencyStacks(
  allies: CombatantState[],
  targets: CombatantState[],
): Map<string, number> {
  const consumed = new Map<string, number>();
  for (const target of targets) {
    if (!allies.some((a) => a.id === target.id)) continue;
    const count = consumeHerbalPotencyStacks(target);
    if (count > 0) consumed.set(target.id, count);
  }
  return consumed;
}

export function stripHerbalPotencyAurasFromSource(
  sourceId: string,
  units: CombatantState[],
): void {
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (e) =>
        !(
          e.sourceId === sourceId &&
          (e.id.startsWith(HERBAL_POTENCY_AURA_PREFIX) ||
            e.id.startsWith(HERBAL_POTENCY_STACKS_ID_PREFIX))
        ),
    );
  }
}
