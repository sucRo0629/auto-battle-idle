import {
  applyBarrierToTarget,
  currentHpRatio,
  getPassiveDefs,
} from './combatMath.ts';
import { resolveDamageIncreaseMultiplier } from './damageIncrease.ts';
import { pickTargets } from './skills/targeting.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  DamageIncreaseSpec,
  PassiveSkillDef,
  ResourceAmountSpec,
  SkillCooldown,
  SkillEffectDef,
  StatusEffect,
  StatusEffectStat,
  TargetShape,
} from './types.ts';
import { asStatusEffectStatList } from './types.ts';

const PASSIVE_AURA_DURATION_SEC = 99999;

export interface PassiveDamageContext {
  skill?: ActiveSkillDef;
  slotKind?: SkillCooldown['slotKind'];
  crowdHitCount?: number;
  targetShape?: TargetShape;
}

export function rollsEvasion(
  target: CombatantState,
  _passives: Record<string, PassiveSkillDef>,
): boolean {
  let chance = 0;
  for (const effect of target.statusEffects) {
    if (effect.remainingSec <= 0) continue;
    if (effect.overlay !== 'evasion') continue;
    chance += effect.evasionChance ?? 0;
  }
  if (chance <= 0) return false;
  return Math.random() < Math.min(1, chance);
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
  applyTo: 'damage' | 'heal',
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
): number {
  if (baseAmount <= 0) return 0;
  const mul = getPassiveSpecialEffectMultiplier('heal', target, target, passives);
  return Math.floor(Math.max(0, baseAmount * mul));
}

export function applyDamageTakenToHeal(
  target: CombatantState,
  damage: number,
  passives: Record<string, PassiveSkillDef>,
): number {
  if (!target.isAlive || damage <= 0) return 0;
  const defs = getPassiveDefs(target, passives);
  let heal = 0;
  for (const passive of defs) {
    if (passive.effect !== 'damageTakenToHeal') continue;
    heal += Math.floor(damage * (passive.ratio ?? 0));
  }
  if (heal <= 0) return 0;
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + heal);
  return target.hp - before;
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
  if (attemptedHeal <= 0) return 0;
  const defs = getPassiveDefs(owner, passives);
  let scaleSum = 0;
  for (const passive of defs) {
    if (passive.effect !== 'excessHealToBarrier') continue;
    if (!passiveExcessHealSources(passive).includes(source)) continue;
    scaleSum += passive.barrierScale ?? 1;
  }
  if (scaleSum <= 0) return 0;

  const hpBefore = target.hp;
  const afterHealHp = Math.min(target.maxHp, hpBefore + attemptedHeal);
  const excess = attemptedHeal - (afterHealHp - hpBefore);
  if (excess <= 0) return 0;

  const grant = Math.floor(excess * scaleSum);
  if (grant <= 0) return 0;
  return applyBarrierToTarget(target, grant, false);
}

export function syncHotAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  for (const ally of allies) {
    ally.statusEffects = ally.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_hot_'),
    );
  }

  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (
        passive.effect !== 'hot' ||
        !passive.hotAmount ||
        passive.intervalSec !== undefined
      ) {
        continue;
      }
      applyPassiveHotFromPassive(source, passive, allies, enemies);
    }
  }
}

export function syncBuffAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  const units = [...allies, ...enemies];
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_buff_'),
    );
  }

  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'buff') continue;
      const subKind = passive.buffSubKind ?? 'stat';
      const targetSpec = passive.buffTargetRule ?? { kind: 'self' as const };
      const targets = pickTargets(targetSpec, source, allies, enemies);
      if (subKind === 'block' || subKind === 'evasion') {
        const chance = passive.chance ?? 0;
        if (chance <= 0) continue;
        for (const target of targets) {
          target.statusEffects.push(
            createPassiveOverlayBuffEffect(
              source,
              passive.id,
              subKind,
              chance,
            ),
          );
        }
        continue;
      }
      const stats = asStatusEffectStatList(
        passive.buffStat as StatusEffectStat | StatusEffectStat[] | undefined,
      );
      const multiplier = passive.buffMultiplier;
      const flatBonus = passive.buffFlatBonus;
      if (stats.length === 0 || (multiplier === undefined && flatBonus === undefined)) {
        continue;
      }
      for (const target of targets) {
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i]!;
          target.statusEffects.push(
            createPassiveStatBuffEffect(
              source,
              passive.id,
              stat,
              i,
              multiplier,
              flatBonus,
            ),
          );
        }
      }
    }
  }
}

export function syncDebuffAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  const units = [...allies, ...enemies];
  for (const unit of units) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith('passive_debuff_'),
    );
  }

  for (const source of units) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'debuff') continue;
      const targetSpec = passive.debuffTargetRule ?? {
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      };
      const targets = pickTargets(targetSpec, source, allies, enemies);
      const stats = asStatusEffectStatList(passive.debuffStat);
      const multiplier = passive.debuffMultiplier;
      const flatBonus = passive.debuffFlatBonus;
      if (stats.length === 0 || (multiplier === undefined && flatBonus === undefined)) {
        continue;
      }
      for (const target of targets) {
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i]!;
          target.statusEffects.push({
            id: `passive_debuff_${source.id}_${passive.id}_${stat}_${i}`,
            kind: 'debuff',
            stat,
            multiplier: multiplier ?? 1,
            ...(flatBonus !== undefined ? { flatBonus: Math.abs(flatBonus) } : {}),
            sourceId: source.id,
            durationSec: PASSIVE_AURA_DURATION_SEC,
            remainingSec: PASSIVE_AURA_DURATION_SEC,
          });
        }
      }
    }
  }
}

export const syncBlockAuras = syncBuffAuras;
export const syncEvasionAuras = syncBuffAuras;

export function syncDamageReductionAuras(
  allies: CombatantState[],
  enemies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
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
      const spec = passive.damageReductionTargetRule ?? { kind: 'self' as const };
      const targets = pickTargets(spec, source, allies, enemies);
      for (const target of targets) {
        target.statusEffects.push(
          createPassiveDamageReductionEffect(source, passive.id, percent),
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
): StatusEffect {
  return {
    id: `passive_buff_${source.id}_${passiveId}_${subKind}`,
    kind: 'buff',
    overlay: subKind,
    ...(subKind === 'block'
      ? { blockChance: chance }
      : { evasionChance: chance }),
    sourceId: source.id,
    multiplier: 1,
    durationSec: PASSIVE_AURA_DURATION_SEC,
    remainingSec: PASSIVE_AURA_DURATION_SEC,
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
    id: `passive_buff_${source.id}_${passiveId}_${stat}_${index}`,
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
): StatusEffect {
  return {
    id: `passive_dmg_reduction_${source.id}_${passiveId}`,
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
  if (unit.maxHp <= 0) return 0;
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

      const stats = asStatusEffectStatList(
        Array.isArray(passive.buffStat)
          ? passive.buffStat.filter(
              (stat): stat is StatusEffectStat =>
                stat === 'atk' ||
                stat === 'def' ||
                stat === 'reg' ||
                stat === 'damageTaken' ||
                stat === 'attackSpeed',
            )
          : passive.buffStat === 'atk' ||
              passive.buffStat === 'def' ||
              passive.buffStat === 'reg' ||
              passive.buffStat === 'damageTaken' ||
              passive.buffStat === 'attackSpeed'
            ? passive.buffStat
            : undefined,
      );
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

function passiveHotEffectId(sourceId: string, passiveId: string): string {
  return `passive_hot_${sourceId}_${passiveId}`;
}

export function applyPassiveHotFromPassive(
  source: CombatantState,
  passive: PassiveSkillDef,
  allies: CombatantState[],
  enemies: CombatantState[],
): void {
  if (passive.effect !== 'hot' || !passive.hotAmount) return;
  const spec = passive.hotTargetRule ?? { kind: 'self' as const };
  const targets = pickTargets(spec, source, allies, enemies);
  const durationSec = resolvePassiveHotDurationSec(passive.hotDurationSec);
  const effectId = passiveHotEffectId(source.id, passive.id);
  for (const target of targets) {
    target.statusEffects = target.statusEffects.filter(
      (effect) => effect.id !== effectId,
    );
    target.statusEffects.push(
      createPassiveHotEffect(
        source,
        passive.id,
        passive.hotAmount,
        durationSec,
      ),
    );
  }
}

function createPassiveHotEffect(
  source: CombatantState,
  passiveId: string,
  amount: ResourceAmountSpec,
  durationSec: number = PASSIVE_AURA_DURATION_SEC,
): StatusEffect {
  return {
    id: passiveHotEffectId(source.id, passiveId),
    kind: 'buff',
    overlay: 'hot',
    amount,
    sourceId: source.id,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    tickSec: 1,
  };
}

export function stripPassivesAurasFromSource(
  sourceId: string,
  units: CombatantState[],
): void {
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

export interface PeriodicDispelPassiveState {
  passiveId: string;
  remainingSec: number;
}

export function initializePeriodicDispelStates(
  unit: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): PeriodicDispelPassiveState[] {
  return getPassiveDefs(unit, passives)
    .filter((passive) => passive.effect === 'periodicDispel')
    .map((passive) => ({
      passiveId: passive.id,
      remainingSec: passive.intervalSec ?? 1,
    }));
}

export function tickPeriodicDispelStates(
  states: PeriodicDispelPassiveState[],
  passives: Record<string, PassiveSkillDef>,
  deltaTime: number,
): PeriodicDispelPassiveState[] {
  return states.map((state) => {
    const passive = passives[state.passiveId];
    const interval = passive?.intervalSec ?? 1;
    let remainingSec = state.remainingSec - deltaTime;
    if (remainingSec <= 0) {
      remainingSec = interval;
    }
    return { ...state, remainingSec };
  });
}

export function getPeriodicDispelReady(
  before: PeriodicDispelPassiveState[],
  after: PeriodicDispelPassiveState[],
): string[] {
  return getPeriodicPassiveReady(before, after);
}

export type PeriodicHotPassiveState = PeriodicDispelPassiveState;

export function initializePeriodicHotStates(
  unit: CombatantState,
  passives: Record<string, PassiveSkillDef>,
): PeriodicHotPassiveState[] {
  return getPassiveDefs(unit, passives)
    .filter(
      (passive) =>
        passive.effect === 'hot' && passive.intervalSec !== undefined,
    )
    .map((passive) => ({
      passiveId: passive.id,
      remainingSec: 0,
    }));
}

export function tickPeriodicHotStates(
  states: PeriodicHotPassiveState[],
  passives: Record<string, PassiveSkillDef>,
  deltaTime: number,
): PeriodicHotPassiveState[] {
  return states.map((state) => {
    const passive = passives[state.passiveId];
    const interval = passive?.intervalSec ?? 1;
    let remainingSec = state.remainingSec - deltaTime;
    if (remainingSec <= 0) {
      remainingSec = interval;
    }
    return { ...state, remainingSec };
  });
}

export function getPeriodicHotReady(
  before: PeriodicHotPassiveState[],
  after: PeriodicHotPassiveState[],
): string[] {
  return getPeriodicPassiveReady(before, after);
}

function getPeriodicPassiveReady(
  before: PeriodicDispelPassiveState[],
  after: PeriodicDispelPassiveState[],
): string[] {
  const ready: string[] = [];
  for (let i = 0; i < after.length; i++) {
    const prev = before[i];
    const next = after[i];
    if (!prev || !next) continue;
    if (next.remainingSec > prev.remainingSec) {
      ready.push(next.passiveId);
    }
  }
  return ready;
}
