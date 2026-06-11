import type { PassiveSkillDef } from './types.ts';
import { isPassiveHot } from './types.ts';

export type PassivePeriodicTriggerKind = 'interval' | 'stageStart' | 'waveStart';

export const PASSIVE_PERIODIC_TRIGGER_KINDS: PassivePeriodicTriggerKind[] = [
  'interval',
  'stageStart',
  'waveStart',
];

export const PASSIVE_PERIODIC_TRIGGER_LABELS: Record<
  PassivePeriodicTriggerKind,
  string
> = {
  interval: '時間間隔',
  stageStart: 'Stage開始時',
  waveStart: 'Wave開始時',
};

/** intervalSec のみ指定時は interval とみなす。hot で未指定なら常時 aura。 */
export function resolvePassivePeriodicTrigger(
  passive: PassiveSkillDef,
): PassivePeriodicTriggerKind | undefined {
  if (passive.periodicTrigger) return passive.periodicTrigger;
  if (passive.intervalSec !== undefined) return 'interval';
  return undefined;
}

export function usesHotAuraMode(passive: PassiveSkillDef): boolean {
  return isPassiveHot(passive) && resolvePassivePeriodicTrigger(passive) === undefined;
}

export function usesIntervalPeriodicTrigger(passive: PassiveSkillDef): boolean {
  return resolvePassivePeriodicTrigger(passive) === 'interval';
}

export function isPassiveBarrierBuff(passive: PassiveSkillDef): boolean {
  return passive.effect === 'buff' && passive.buffSubKind === 'barrier';
}

/** 未指定時は Stage 開始（常時 aura はバリアに非適用） */
export function resolvePassiveBarrierTrigger(
  passive: PassiveSkillDef,
): PassivePeriodicTriggerKind {
  if (!isPassiveBarrierBuff(passive)) return 'stageStart';
  return resolvePassivePeriodicTrigger(passive) ?? 'stageStart';
}
