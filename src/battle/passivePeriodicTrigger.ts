import type { PassiveSkillDef } from "./types.ts";
import { isPassiveHot } from "./types.ts";

export type PassivePeriodicTriggerKind =
  | "stageStart"
  | "waveStart"
  | "onDebuffReceived";

export const PASSIVE_PERIODIC_TRIGGER_KINDS: PassivePeriodicTriggerKind[] = [
  "stageStart",
  "waveStart",
  "onDebuffReceived",
];

/** periodicDispel 専用（Stage/Wave 開始以外） */
export const PASSIVE_DISPEL_TRIGGER_KINDS = [
  "stageStart",
  "waveStart",
  "onDebuffReceived",
] as const satisfies readonly PassivePeriodicTriggerKind[];

export type PassiveDispelTriggerKind =
  (typeof PASSIVE_DISPEL_TRIGGER_KINDS)[number];

export const PASSIVE_PERIODIC_TRIGGER_LABELS: Record<
  PassivePeriodicTriggerKind,
  string
> = {
  stageStart: "Stage開始時",
  waveStart: "Wave開始時",
  onDebuffReceived: "対象がデバフを受けた時",
};

export function resolvePassivePeriodicTrigger(
  passive: PassiveSkillDef
): PassivePeriodicTriggerKind | undefined {
  return passive.periodicTrigger;
}

export function usesHotAuraMode(passive: PassiveSkillDef): boolean {
  return (
    isPassiveHot(passive) &&
    resolvePassivePeriodicTrigger(passive) === undefined
  );
}

export function usesDebuffAuraMode(passive: PassiveSkillDef): boolean {
  return (
    passive.effect === "debuff" &&
    resolvePassivePeriodicTrigger(passive) === undefined
  );
}

export function usesBuffAuraMode(passive: PassiveSkillDef): boolean {
  if (passive.effect !== "buff") return false;
  if (isPassiveBarrierBuff(passive)) return false;
  return resolvePassivePeriodicTrigger(passive) === undefined;
}

export function isPassiveBarrierBuff(passive: PassiveSkillDef): boolean {
  return passive.effect === "buff" && passive.buffSubKind === "barrier";
}

/** 未指定時は Stage 開始（常時 はバリアに非適用） */
export function resolvePassiveBarrierTrigger(
  passive: PassiveSkillDef
): PassivePeriodicTriggerKind {
  if (!isPassiveBarrierBuff(passive)) return "stageStart";
  return resolvePassivePeriodicTrigger(passive) ?? "stageStart";
}

/** @deprecated 時間間隔トリガーは廃止。読み込み時に除去される。 */
export function usesIntervalPeriodicTrigger(
  _passive: PassiveSkillDef
): boolean {
  return false;
}

/** block/evasion/counter は chance が効果率・反撃率として別用途 */
export function usesPassiveTriggerChance(passive: PassiveSkillDef): boolean {
  if (passive.effect === "counter" || passive.effect === "counterChance") {
    return false;
  }
  if (passive.effect === "buff") {
    const subKind = passive.buffSubKind ?? "stat";
    if (subKind === "block" || subKind === "evasion") return false;
  }
  return true;
}

/** Stage/Wave 開始パッシブの発動確率。未指定 = 1 */
export function resolvePassiveTriggerChance(passive: PassiveSkillDef): number {
  if (!usesPassiveTriggerChance(passive)) return 1;
  return passive.chance ?? 1;
}

export function rollPassiveTriggerChance(passive: PassiveSkillDef): boolean {
  const chance = resolvePassiveTriggerChance(passive);
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return Math.random() < chance;
}
