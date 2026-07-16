import type { DamageApplicationResult } from './combatMath.ts';
import type { DamageAppliedMeta } from './stageDamageStats.ts';
import type {
  AttackMethod,
  CombatantState,
  SkillSlotKind,
} from './types.ts';

/** R12g-b: damage 適用パイプライン上の source 分類（鉄衛士 M2 等の購読契約） */
export type DamagePipelineSourceKind =
  | 'skillHit'
  | 'dotTick'
  | 'delayedPoolTick'
  | 'counter'
  | 'derived'
  | 'other';

export type DamageAppliedAttackKind = 'damage' | 'dot';

export interface DamageAppliedEvent {
  attackerId: string;
  targetId: string;
  sourceKind: DamagePipelineSourceKind;
  attackKind: DamageAppliedAttackKind;
  hpDamage: number;
  barrierDamage: number;
  lethal: boolean;
  slotKind?: SkillSlotKind;
  skillId?: string;
  effectIndex?: number;
  hitIndex?: number;
  attackMethod?: AttackMethod;
  statusId?: string;
}

export interface DamageAppliedCallbackMeta extends DamageAppliedMeta {
  hpDamage?: number;
  barrierDamage?: number;
  lethal?: boolean;
  effectIndex?: number;
  hitIndex?: number;
  attackMethod?: AttackMethod;
  didBlock?: boolean;
  barrierHpBefore?: number;
  event: DamageAppliedEvent;
}

export type DamageAppliedCallback = (
  actor: CombatantState,
  target: CombatantState,
  amount: number,
  meta?: DamageAppliedCallbackMeta,
) => void;

export function damageAppliedAmount(event: DamageAppliedEvent): number {
  return event.hpDamage + event.barrierDamage;
}

export function buildDamageAppliedEvent(params: {
  attacker: CombatantState;
  target: CombatantState;
  sourceKind: DamagePipelineSourceKind;
  attackKind: DamageAppliedAttackKind;
  damageResult: DamageApplicationResult;
  slotKind?: SkillSlotKind;
  skillId?: string;
  effectIndex?: number;
  hitIndex?: number;
  attackMethod?: AttackMethod;
  statusId?: string;
}): DamageAppliedEvent {
  const { attacker, target, damageResult, ...rest } = params;
  return {
    attackerId: attacker.id,
    targetId: target.id,
    hpDamage: damageResult.hpDamage,
    barrierDamage: damageResult.barrierDamage,
    lethal: damageResult.lethal,
    ...rest,
  };
}

export function damageAppliedEventToLegacyMeta(
  event: DamageAppliedEvent,
  extras?: Pick<DamageAppliedCallbackMeta, 'didBlock' | 'barrierHpBefore'>,
): DamageAppliedCallbackMeta {
  return {
    attackKind: event.attackKind,
    slotKind: event.slotKind,
    skillId: event.skillId,
    statusId: event.statusId,
    isCounterDamage: event.sourceKind === 'counter',
    hpDamage: event.hpDamage,
    barrierDamage: event.barrierDamage,
    lethal: event.lethal,
    effectIndex: event.effectIndex,
    hitIndex: event.hitIndex,
    attackMethod: event.attackMethod,
    event,
    ...extras,
  };
}

export function notifyDamageApplied(
  callback: DamageAppliedCallback | undefined,
  attacker: CombatantState,
  target: CombatantState,
  event: DamageAppliedEvent,
  extras?: Pick<DamageAppliedCallbackMeta, 'didBlock' | 'barrierHpBefore'>,
): void {
  const amount = damageAppliedAmount(event);
  if (amount <= 0 && event.hpDamage <= 0 && event.barrierDamage <= 0) {
    return;
  }
  callback?.(
    attacker,
    target,
    amount,
    damageAppliedEventToLegacyMeta(event, extras),
  );
}

/** stageDamageStats 用: event 優先で legacy DamageSourceKind へ変換 */
export function damageAppliedEventToStatsMeta(
  event: DamageAppliedEvent,
): DamageAppliedMeta {
  return damageAppliedEventToLegacyMeta(event);
}

export function shouldTriggerCounterRetaliation(
  meta?: DamageAppliedCallbackMeta,
  amount = 0,
): boolean {
  if (amount <= 0) return false;
  const event = meta?.event;
  if (event) {
    return event.sourceKind === 'skillHit' && event.attackKind === 'damage';
  }
  return meta?.attackKind === 'damage' && meta.isCounterDamage !== true;
}

export function isCounterDamageMeta(meta?: DamageAppliedCallbackMeta): boolean {
  if (meta?.event) {
    return meta.event.sourceKind === 'counter';
  }
  return meta?.isCounterDamage === true;
}
