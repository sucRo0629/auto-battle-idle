import { getEffectiveAtk, getPassiveDefs } from './combatMath.ts';
import { findUnitsInRadius } from './dotMechanics.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  PassiveSkillDef,
  PendingSkillHit,
  StatusEffect,
} from './types.ts';

export const SEED_FLAME_MAX_STACKS = 5;
export const SEED_FLAME_DURATION_SEC = 10;
export const SEED_FLAME_DOT_ATK_SCALE = 0.05;
export const BLAZING_FLAME_MAX_STACKS_DEFAULT = 1;
export const BLAZING_FLAME_DOT_ATK_SCALE = 0.35;
export const BLAZING_FLAME_MAGIC_TAKEN_PER_STACK = 0.1;
export const BLAZING_FLAME_DURATION_SEC = 99999;
export const SEED_FLAME_ID_PREFIX = 'seed_flame_';
export const BLAZING_FLAME_ID_PREFIX = 'blazing_flame_';
export const SEED_FLAME_DISPLAY_NAME = '種火';
export const BLAZING_FLAME_DISPLAY_NAME = '熾火';

export interface BlazingFlameDetonateConfig {
  spreadRadiusPx: number;
  perSeedAtkScale: number;
  explosionMultiplier: number;
}

export interface SorcererActiveHitOutcome {
  pendingHits: PendingSkillHit[];
  explosionDamageByTargetId: Map<string, number>;
  debuffChanged: boolean;
}

function seedFlameEffectId(targetId: string): string {
  return `${SEED_FLAME_ID_PREFIX}${targetId}`;
}

function blazingFlameEffectId(targetId: string): string {
  return `${BLAZING_FLAME_ID_PREFIX}${targetId}`;
}

export function getSeedFlameStacks(target: CombatantState): number {
  const effect = target.statusEffects.find(
    (e) => e.id === seedFlameEffectId(target.id) && e.remainingSec > 0,
  );
  return effect?.stacks ?? 0;
}

export function getBlazingFlameStacks(target: CombatantState): number {
  const effect = target.statusEffects.find(
    (e) => e.id === blazingFlameEffectId(target.id) && e.remainingSec > 0,
  );
  return effect?.stacks ?? 0;
}

export function hasSeedFlame(target: CombatantState): boolean {
  return getSeedFlameStacks(target) > 0;
}

export function hasBlazingFlameUncap(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  return getPassiveDefs(actor, passives).some(
    (p) => p.effect === 'blazingFlameDetonate' && p.blazingFlameUncap === true,
  );
}

export function getBlazingFlameMaxStacks(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (hasBlazingFlameUncap(actor, passives)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return BLAZING_FLAME_MAX_STACKS_DEFAULT;
}

function mergeBlazingFlameDetonateConfig(
  passives: PassiveSkillDef[],
): BlazingFlameDetonateConfig | undefined {
  for (const passive of passives) {
    if (passive.effect !== 'blazingFlameDetonate') continue;
    return {
      spreadRadiusPx: passive.blazingFlameDetonateSpreadRadiusPx ?? 50,
      perSeedAtkScale: passive.blazingFlameDetonatePerSeedScale ?? 0.5,
      explosionMultiplier: passive.blazingFlameDetonateMultiplier ?? 1.3,
    };
  }
  return undefined;
}

function createSeedFlameEffect(
  source: CombatantState,
  target: CombatantState,
): StatusEffect {
  return {
    id: seedFlameEffectId(target.id),
    kind: 'debuff',
    overlay: 'dot',
    dotFlavor: 'seedFlame',
    stacks: 1,
    sourceId: source.id,
    damageType: 'magic',
    amount: { kind: 'atkBased', atkScale: SEED_FLAME_DOT_ATK_SCALE },
    multiplier: 1,
    durationSec: SEED_FLAME_DURATION_SEC,
    remainingSec: SEED_FLAME_DURATION_SEC,
    tickSec: 1,
    displayName: SEED_FLAME_DISPLAY_NAME,
  };
}

function createBlazingFlameEffect(
  source: CombatantState,
  target: CombatantState,
  stacks: number,
): StatusEffect {
  return {
    id: blazingFlameEffectId(target.id),
    kind: 'debuff',
    overlay: 'dot',
    dotFlavor: 'blazingFlame',
    dotCompressImmune: true,
    stacks,
    sourceId: source.id,
    damageType: 'magic',
    amount: { kind: 'atkBased', atkScale: BLAZING_FLAME_DOT_ATK_SCALE },
    multiplier: 1,
    durationSec: BLAZING_FLAME_DURATION_SEC,
    remainingSec: BLAZING_FLAME_DURATION_SEC,
    tickSec: 1,
    displayName: BLAZING_FLAME_DISPLAY_NAME,
  };
}

export function removeSeedFlame(target: CombatantState): number {
  const id = seedFlameEffectId(target.id);
  const effect = target.statusEffects.find((e) => e.id === id);
  const stacks = effect?.stacks ?? 0;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== id);
  return stacks;
}

export function consumeBlazingFlameStack(target: CombatantState): boolean {
  const id = blazingFlameEffectId(target.id);
  const effect = target.statusEffects.find((e) => e.id === id);
  if (!effect || (effect.stacks ?? 0) <= 0) return false;
  const next = (effect.stacks ?? 1) - 1;
  if (next <= 0) {
    target.statusEffects = target.statusEffects.filter((e) => e.id !== id);
  } else {
    effect.stacks = next;
  }
  return true;
}

export function applyBlazingFlameStack(
  source: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
  amount: number,
): boolean {
  if (amount <= 0) return false;
  const max = getBlazingFlameMaxStacks(source, passives);
  const id = blazingFlameEffectId(target.id);
  const existing = target.statusEffects.find((e) => e.id === id);
  const current = existing?.stacks ?? 0;
  if (current >= max) return false;

  const next = Math.min(max, current + amount);
  if (existing) {
    existing.stacks = next;
    existing.remainingSec = BLAZING_FLAME_DURATION_SEC;
    existing.durationSec = BLAZING_FLAME_DURATION_SEC;
  } else {
    target.statusEffects.push(createBlazingFlameEffect(source, target, next));
  }
  return true;
}

export function tryConvertSeedFlameToBlazingFlame(
  source: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  const seedStacks = getSeedFlameStacks(target);
  if (seedStacks < SEED_FLAME_MAX_STACKS) return false;

  const maxBlazing = getBlazingFlameMaxStacks(source, passives);
  if (getBlazingFlameStacks(target) >= maxBlazing) {
    return false;
  }

  removeSeedFlame(target);
  applyBlazingFlameStack(source, target, passives, 1);
  return true;
}

export function applySeedFlameStack(
  source: CombatantState,
  target: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  const id = seedFlameEffectId(target.id);
  let effect = target.statusEffects.find((e) => e.id === id);

  if (effect) {
    const max = SEED_FLAME_MAX_STACKS;
    effect.stacks = Math.min(max, (effect.stacks ?? 0) + 1);
    effect.remainingSec = SEED_FLAME_DURATION_SEC;
    effect.durationSec = SEED_FLAME_DURATION_SEC;
  } else {
    effect = createSeedFlameEffect(source, target);
    target.statusEffects.push(effect);
  }

  if ((effect.stacks ?? 0) >= SEED_FLAME_MAX_STACKS) {
    tryConvertSeedFlameToBlazingFlame(source, target, passives);
  }
  return true;
}

export function resolveBlazingFlameMagicDamageTakenMultiplier(
  target: CombatantState,
): number {
  const stacks = getBlazingFlameStacks(target);
  if (stacks <= 0) return 1;
  return 1 + stacks * BLAZING_FLAME_MAGIC_TAKEN_PER_STACK;
}

export function resolveDetonateExplosionDamage(
  actor: CombatantState,
  consumedSeedStacks: number,
  config: BlazingFlameDetonateConfig,
): number {
  const atk = getEffectiveAtk(actor);
  const n = atk * config.perSeedAtkScale;
  const base = atk + consumedSeedStacks * n;
  return Math.max(1, Math.floor(base * config.explosionMultiplier));
}

function findBonusActiveSkillId(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): string | undefined {
  for (const passive of getPassiveDefs(actor, passives)) {
    if (passive.effect !== 'bonusActiveOnHit') continue;
    if (passive.bonusActiveSkillId) return passive.bonusActiveSkillId;
  }
  return undefined;
}

export function buildBonusActivePendingHit(
  actor: CombatantState,
  target: CombatantState,
  bonusActiveSkillId: string,
  gameData: GameData,
  battleTimeSec: number,
): PendingSkillHit | null {
  const skill: ActiveSkillDef | undefined =
    gameData.skillRegistry.actives[bonusActiveSkillId];
  if (!skill) return null;
  const effectIndex = skill.effect.findIndex((e) => e.type === 'damage');
  if (effectIndex < 0) return null;
  const effectDef = skill.effect[effectIndex]!;
  return {
    applyAtBattleSec: battleTimeSec,
    actorId: actor.id,
    skillId: skill.id,
    skillName: skill.name,
    effectDef,
    effectIndex,
    slotKind: 'active',
    hitIndex: 0,
    suppressBonusActiveOnHit: true,
    targets: [{ targetId: target.id }],
  };
}

function spreadSeedFlameFromDetonate(
  source: CombatantState,
  primaryTarget: CombatantState,
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  radiusPx: number,
): void {
  const centerX = primaryTarget.battleX;
  const inRadius = findUnitsInRadius(centerX, enemies, radiusPx);
  const recipients = new Set<CombatantState>([primaryTarget, ...inRadius]);
  for (const unit of recipients) {
    if (!unit.isAlive) continue;
    applySeedFlameStack(source, unit, passives);
  }
}

export function processSorcererActiveDamageHit(
  actor: CombatantState,
  target: CombatantState,
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
  gameData: GameData,
  options: {
    battleTimeSec: number;
    suppressBonusActiveOnHit?: boolean;
  },
): SorcererActiveHitOutcome {
  const outcome: SorcererActiveHitOutcome = {
    pendingHits: [],
    explosionDamageByTargetId: new Map(),
    debuffChanged: false,
  };

  const actorPassives = getPassiveDefs(actor, passives);
  if (actorPassives.length === 0) return outcome;

  const detonateConfig = mergeBlazingFlameDetonateConfig(actorPassives);
  const hasP2 = actorPassives.some((p) => p.effect === 'seedFlameOnActiveHit');

  if (
    detonateConfig &&
    target.isEnemy &&
    target.isAlive &&
    getBlazingFlameStacks(target) > 0
  ) {
    const consumedSeed = removeSeedFlame(target);
    consumeBlazingFlameStack(target);
    const explosionDamage = resolveDetonateExplosionDamage(
      actor,
      consumedSeed,
      detonateConfig,
    );
    outcome.explosionDamageByTargetId.set(target.id, explosionDamage);
    spreadSeedFlameFromDetonate(
      actor,
      target,
      enemies,
      passives,
      detonateConfig.spreadRadiusPx,
    );
    outcome.debuffChanged = true;
  }

  if (hasP2 && target.isEnemy && target.isAlive) {
    applySeedFlameStack(actor, target, passives);
    outcome.debuffChanged = true;
  }

  if (!options.suppressBonusActiveOnHit) {
    const bonusActiveId = findBonusActiveSkillId(actor, passives);
    if (bonusActiveId) {
      const pending = buildBonusActivePendingHit(
        actor,
        target,
        bonusActiveId,
        gameData,
        options.battleTimeSec,
      );
      if (pending) outcome.pendingHits.push(pending);
    }
  }

  void allies;
  return outcome;
}

export function actorHasSorcererFlamePassives(
  actor: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): boolean {
  return getPassiveDefs(actor, passives).some(
    (p) =>
      p.effect === 'seedFlameOnActiveHit' ||
      p.effect === 'bonusActiveOnHit' ||
      p.effect === 'blazingFlameDetonate',
  );
}
