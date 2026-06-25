import { getEffectiveDef, getPassiveDefs } from './combatMath.ts';
import { applyKnockbackToTarget } from './ccEffects.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  PassiveSkillDef,
  ResourceAmountSpec,
  StatusEffect,
} from './types.ts';

export const BLOCK_RESONANCE_OVERLAY = 'blockResonance' as const;
export const BLOCK_RESONANCE_STANCE_OVERLAY = 'blockResonanceStance' as const;
const BLOCK_RESONANCE_STACKS_ID_PREFIX = 'block_resonance_stacks_';
const BLOCK_RESONANCE_BLOCK_ID_PREFIX = 'block_resonance_block_';
const BLOCK_RESONANCE_TAKEN_ID_PREFIX = 'block_resonance_taken_';
const BLOCK_RESONANCE_STANCE_ID_PREFIX = 'block_resonance_stance_';
const BLOCK_RESONANCE_AURA_DURATION_SEC = 99999;

export interface MergedBlockResonanceConfig {
  maxStacks: number;
  damageTakenPerStack: number;
  decayIntervalSec: number;
  blockChance: number;
}

export function isBlockResonancePassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'blockResonance';
}

export function mergeBlockResonancePassives(
  passives: PassiveSkillDef[],
): MergedBlockResonanceConfig {
  let maxStacks = 0;
  let damageTakenPerStack = 0;
  let decayIntervalSec = 8;
  let blockChance = 0;

  for (const passive of passives) {
    if (!isBlockResonancePassive(passive)) continue;
    if (passive.blockResonanceMaxStacks !== undefined) {
      maxStacks = Math.max(maxStacks, passive.blockResonanceMaxStacks);
    }
    if (passive.blockResonanceDamageTakenPerStack !== undefined) {
      damageTakenPerStack = passive.blockResonanceDamageTakenPerStack;
    }
    if (passive.blockResonanceDecayIntervalSec !== undefined) {
      decayIntervalSec = passive.blockResonanceDecayIntervalSec;
    }
    if (passive.chance !== undefined) {
      blockChance += passive.chance;
    }
  }

  return {
    maxStacks,
    damageTakenPerStack,
    decayIntervalSec,
    blockChance,
  };
}

export function resolveBlockResonanceConfigForUnit(
  unit: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): MergedBlockResonanceConfig {
  return mergeBlockResonancePassives(getPassiveDefs(unit, passives));
}

export function getBlockResonanceStacks(target: CombatantState): number {
  const effect = target.statusEffects.find(
    (e) => e.overlay === BLOCK_RESONANCE_OVERLAY && e.remainingSec > 0,
  );
  return effect?.stacks ?? 0;
}

export function setBlockResonanceStacks(
  target: CombatantState,
  stacks: number,
  sourceId: string,
): void {
  const clamped = Math.max(0, stacks);
  const effectId = `${BLOCK_RESONANCE_STACKS_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  if (clamped <= 0) return;
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: BLOCK_RESONANCE_OVERLAY,
    stacks: clamped,
    sourceId,
    multiplier: 1,
    durationSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    remainingSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    displayName: '迎撃',
  });
}

export function addBlockResonanceStacksOnBlock(
  target: CombatantState,
  config: MergedBlockResonanceConfig,
): number {
  if (config.maxStacks <= 0) return getBlockResonanceStacks(target);
  const current = getBlockResonanceStacks(target);
  const next = Math.min(config.maxStacks, current + 1);
  setBlockResonanceStacks(target, next, target.id);
  return next;
}

export function consumeBlockResonanceStacks(target: CombatantState): number {
  const consumed = getBlockResonanceStacks(target);
  setBlockResonanceStacks(target, 0, target.id);
  return consumed;
}

function syncBlockChanceAura(
  target: CombatantState,
  blockChance: number,
): void {
  const effectId = `${BLOCK_RESONANCE_BLOCK_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  if (blockChance <= 0) return;
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: 'block',
    blockChance,
    sourceId: target.id,
    multiplier: 1,
    durationSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    remainingSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    displayName: '迎撃態勢',
  });
}

function syncDamageTakenReductionAura(
  target: CombatantState,
  stacks: number,
  damageTakenPerStack: number,
): void {
  const effectId = `${BLOCK_RESONANCE_TAKEN_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  if (stacks <= 0 || damageTakenPerStack <= 0) return;
  const reduction = Math.min(0.9, stacks * damageTakenPerStack);
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    stat: 'damageTaken',
    multiplier: Math.max(0.1, 1 - reduction),
    sourceId: target.id,
    durationSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    remainingSec: BLOCK_RESONANCE_AURA_DURATION_SEC,
    displayName: '迎撃蓄積',
  });
}

export function syncBlockResonanceAuras(
  target: CombatantState,
  config: MergedBlockResonanceConfig,
): void {
  if (config.maxStacks <= 0) {
    const stacksId = `${BLOCK_RESONANCE_STACKS_ID_PREFIX}${target.id}`;
    const blockId = `${BLOCK_RESONANCE_BLOCK_ID_PREFIX}${target.id}`;
    const takenId = `${BLOCK_RESONANCE_TAKEN_ID_PREFIX}${target.id}`;
    target.statusEffects = target.statusEffects.filter(
      (e) => e.id !== stacksId && e.id !== blockId && e.id !== takenId,
    );
    return;
  }

  syncBlockChanceAura(target, config.blockChance);
  const stacks = getBlockResonanceStacks(target);
  syncDamageTakenReductionAura(
    target,
    stacks,
    config.damageTakenPerStack,
  );
}

export function tickBlockResonanceDecay(
  target: CombatantState,
  deltaTime: number,
  config: MergedBlockResonanceConfig,
): void {
  if (config.maxStacks <= 0 || config.decayIntervalSec <= 0) return;
  const stacks = getBlockResonanceStacks(target);
  if (stacks <= 0) {
    target.blockResonanceDecayTickSec = undefined;
    return;
  }

  if (target.blockResonanceDecayTickSec === undefined) {
    target.blockResonanceDecayTickSec = config.decayIntervalSec;
  }
  target.blockResonanceDecayTickSec -= deltaTime;
  while (
    target.blockResonanceDecayTickSec !== undefined &&
    target.blockResonanceDecayTickSec <= 0 &&
    getBlockResonanceStacks(target) > 0
  ) {
    setBlockResonanceStacks(
      target,
      getBlockResonanceStacks(target) - 1,
      target.id,
    );
    target.blockResonanceDecayTickSec += config.decayIntervalSec;
  }
  if (getBlockResonanceStacks(target) <= 0) {
    target.blockResonanceDecayTickSec = undefined;
  }
  syncDamageTakenReductionAura(
    target,
    getBlockResonanceStacks(target),
    config.damageTakenPerStack,
  );
}

export function hasBlockResonanceStance(target: CombatantState): boolean {
  return target.statusEffects.some(
    (effect) =>
      effect.overlay === BLOCK_RESONANCE_STANCE_OVERLAY &&
      effect.remainingSec > 0,
  );
}

function getBlockResonanceStanceEffect(
  target: CombatantState,
): StatusEffect | undefined {
  return target.statusEffects.find(
    (effect) =>
      effect.overlay === BLOCK_RESONANCE_STANCE_OVERLAY &&
      effect.remainingSec > 0,
  );
}

export function applyBlockResonanceStance(
  actor: CombatantState,
  skill: ActiveSkillDef,
  consumedStacks: number,
): void {
  const stacks = Math.max(1, consumedStacks);
  const durationBase = skill.blockResonanceStanceDurationBaseSec ?? 2;
  const durationSec = durationBase + stacks;
  const effectId = `${BLOCK_RESONANCE_STANCE_ID_PREFIX}${actor.id}`;

  actor.statusEffects = actor.statusEffects.filter((e) => e.id !== effectId);

  const defPerStack = skill.blockResonanceStanceDefPerStack ?? 0.05;
  const takenPerStack = skill.blockResonanceStanceDamageTakenPerStack ?? 0.04;
  const blockPerStack = skill.blockResonanceStanceBlockPerStack ?? 0.05;

  actor.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: BLOCK_RESONANCE_STANCE_OVERLAY,
    stacks,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    sourceId: actor.id,
    skillId: skill.id,
    displayName: '城塞の構え',
  });

  actor.statusEffects.push({
    id: `${effectId}_def`,
    kind: 'buff',
    stat: 'def',
    multiplier: 1 + defPerStack * stacks,
    sourceId: actor.id,
    skillId: skill.id,
    durationSec,
    remainingSec: durationSec,
    displayName: '城塞の構え',
  });
  actor.statusEffects.push({
    id: `${effectId}_taken`,
    kind: 'buff',
    stat: 'damageTaken',
    multiplier: Math.max(0.1, 1 - takenPerStack * stacks),
    sourceId: actor.id,
    skillId: skill.id,
    durationSec,
    remainingSec: durationSec,
    displayName: '城塞の構え',
  });
  actor.statusEffects.push({
    id: `${effectId}_block`,
    kind: 'buff',
    overlay: 'block',
    blockChance: Math.min(1, blockPerStack * stacks),
    multiplier: 1,
    sourceId: actor.id,
    skillId: skill.id,
    durationSec,
    remainingSec: durationSec,
    displayName: '城塞の構え',
  });
}

function livingEnemiesWithinRadius(
  actor: CombatantState,
  enemies: CombatantState[],
  radiusPx: number,
): CombatantState[] {
  return enemies.filter(
    (enemy) =>
      enemy.isAlive &&
      Math.abs(enemy.battleX - actor.battleX) <= radiusPx,
  );
}

export interface BlockResonanceOnBlockResult {
  damagedEnemyIds: string[];
  knockedBackEnemyIds: string[];
}

export function applyBlockResonanceStanceOnBlock(
  defender: CombatantState,
  enemies: CombatantState[],
  skill: ActiveSkillDef,
  passives: Record<string, PassiveSkillDef>,
  emitDamage: (
    defender: CombatantState,
    enemy: CombatantState,
    amount: number,
  ) => void,
): BlockResonanceOnBlockResult {
  const stance = getBlockResonanceStanceEffect(defender);
  if (!stance) {
    return { damagedEnemyIds: [], knockedBackEnemyIds: [] };
  }

  const radiusPx = skill.blockResonanceOnBlockKnockbackRadiusPx ?? 50;
  const knockbackPx = skill.blockResonanceOnBlockKnockbackDistancePx ?? 50;
  const damageSpec: ResourceAmountSpec = skill.blockResonanceOnBlockDamage ?? {
    kind: 'defBased',
    defScale: 1,
  };

  const damagedEnemyIds: string[] = [];
  const knockedBackEnemyIds: string[] = [];
  const targets = livingEnemiesWithinRadius(defender, enemies, radiusPx);

  for (const enemy of targets) {
    const offset = damageSpec.defOffset ?? 0;
    const scale = damageSpec.defScale ?? 1;
    const amount = Math.floor(
      Math.max(0, (getEffectiveDef(defender) + offset) * scale),
    );
    if (amount > 0) {
      emitDamage(defender, enemy, amount);
      damagedEnemyIds.push(enemy.id);
    }
    if (
      applyKnockbackToTarget(enemy, knockbackPx, {
        skillId: skill.id,
        sourceId: defender.id,
      })
    ) {
      knockedBackEnemyIds.push(enemy.id);
    }
  }

  return { damagedEnemyIds, knockedBackEnemyIds };
}

export function resolveEffectiveUseDurationSec(
  skill: ActiveSkillDef,
  actorId: string,
  consumedStacksByActor: ReadonlyMap<string, number>,
): number {
  const hasConsume = skill.effect.some(
    (effect) => effect.type === 'blockResonanceConsume',
  );
  if (!hasConsume) {
    return skill.useDurationSec ?? 0;
  }
  const stacks = consumedStacksByActor.get(actorId) ?? 0;
  const durationBase = skill.blockResonanceStanceDurationBaseSec ?? 2;
  return durationBase + stacks;
}
