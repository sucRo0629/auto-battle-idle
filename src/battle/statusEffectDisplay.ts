import type { StatusEffect } from "./types.ts";

export type StatusDisplayCategory =
  | "hp"
  | "atk"
  | "def"
  | "res"
  | "attackSpeed"
  | "moveSpeed"
  | "damageReduction"
  | "damageIncrease"
  | "hot"
  | "healReservation"
  | "dot"
  | "bleed"
  | "poison"
  | "evasion"
  | "block"
  | "counter"
  | "stun"
  | "moveLock"
  | "damageDelay"
  | "wardBarrier"
  | "herbalPotency"
  | "blockResonance"
  | "blockResonanceStance"
  | "basicAttackTransform"
  | "invulnerable"
  | "lastStandGuts"
  | "arenaDominance"
  | "duelistPride"
  | "windMark"
  | "earthMark"
  | "arenaMark"
  | "seedFlame"
  | "blazingFlame"
  | "ballistaMark"
  | "allyAttackFollowUp"
  | "poisonWeapon"
  | "nextOutgoingDamage";

export const STATUS_BADGE_SLOT_ORDER: StatusDisplayCategory[] = [
  "hp",
  "atk",
  "def",
  "res",
  "attackSpeed",
  "moveSpeed",
  "damageReduction",
  "damageIncrease",
  "hot",
  "healReservation",
  "damageDelay",
  "wardBarrier",
  "herbalPotency",
  "blockResonance",
  "blockResonanceStance",
  "basicAttackTransform",
  "invulnerable",
  "lastStandGuts",
  "arenaDominance",
  "duelistPride",
  "windMark",
  "earthMark",
  "arenaMark",
  "seedFlame",
  "blazingFlame",
  "ballistaMark",
  "allyAttackFollowUp",
  "poisonWeapon",
  "nextOutgoingDamage",
  "dot",
  "bleed",
  "poison",
  "evasion",
  "block",
  "counter",
  "stun",
  "moveLock",
];

export const STATUS_BADGE_SLOT_COUNT = STATUS_BADGE_SLOT_ORDER.length;

const NEUTRAL_EPSILON = 0.001;

function resolveDotDisplayCategory(
  effect: StatusEffect
): "dot" | "bleed" | "poison" | "seedFlame" | "blazingFlame" {
  if (effect.dotFlavor === "bleed") return "bleed";
  if (effect.dotFlavor === "poison") return "poison";
  if (effect.dotFlavor === "seedFlame") return "seedFlame";
  if (effect.dotFlavor === "blazingFlame") return "blazingFlame";
  return "dot";
}

export interface StatAggregation {
  netFlat: number;
  netMul: number;
}

export interface AggregatedCategoryEffect {
  category: StatusDisplayCategory;
  netFlat: number;
  netMul: number;
  kind: "buff" | "debuff";
  /** 1 = 残り時間満タン / 0 = 切れ */
  remainingRatio: number;
}

export interface StatBadgeBaseStats {
  baseMaxHp: number;
  atk: number;
  def: number;
  res: number;
}

export interface StatusEffectBadgeDisplay {
  category: StatusDisplayCategory;
  kind: "buff" | "debuff";
  remainingRatio: number;
  isPassive: boolean;
  /** stacks>1 または同一カテゴリ複数 instance のときのみ（1 は非表示） */
  stackCount?: number;
}

const STACK_OVERLAY_CATEGORIES = new Set<StatusEffect["overlay"]>([
  "herbalPotency",
  "blockResonance",
  "windMark",
  "earthMark",
  "arenaMark",
  "wardBarrier",
]);

function effectStackContribution(effect: StatusEffect): number {
  if (
    effect.overlay !== undefined &&
    STACK_OVERLAY_CATEGORIES.has(effect.overlay) &&
    effect.stacks !== undefined
  ) {
    return effect.stacks;
  }
  return 1;
}

function isStackOverlayWithNoStacks(effect: StatusEffect): boolean {
  return (
    effect.overlay !== undefined &&
    STACK_OVERLAY_CATEGORIES.has(effect.overlay) &&
    (effect.stacks ?? 0) <= 0
  );
}

/** パッシブオーラ同期で付与された効果（aggregateStatStatusEffects 集計から除外） */
export function isPassiveAuraStatusEffect(effect: StatusEffect): boolean {
  return effect.id.startsWith("passive_");
}

function isPassiveDisplayedStatusEffect(effect: StatusEffect): boolean {
  return isPassiveAuraStatusEffect(effect);
}

function statusEffectRemainingRatio(effect: StatusEffect): number {
  const duration =
    effect.durationSec > 0 ? effect.durationSec : effect.remainingSec;
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, effect.remainingSec / duration));
}

function effectKindFromEffectiveStat(
  base: number,
  effective: number,
  reversed = false
): "buff" | "debuff" | null {
  if (Math.abs(effective - base) < NEUTRAL_EPSILON) return null;
  if (reversed) {
    return effective < base ? "buff" : "debuff";
  }
  return effective > base ? "buff" : "debuff";
}

function statusEffectBadgeForStat(
  effect: StatusEffect,
  base: number,
  category: "hp" | "atk" | "def" | "res" | "attackSpeed" | "moveSpeed"
): StatusEffectBadgeDisplay | null {
  const agg = aggregateStatEffects([effect], category);
  const kind = effectKindFromEffectiveStat(
    base,
    computeEffectiveStat(base, agg)
  );
  if (!kind) return null;
  return {
    category,
    kind,
    remainingRatio: statusEffectRemainingRatio(effect),
    isPassive: isPassiveDisplayedStatusEffect(effect),
  };
}

function statusEffectBadgeForDamageTaken(
  effect: StatusEffect
): StatusEffectBadgeDisplay | null {
  const agg = aggregateStatEffects([effect], "damageTaken");
  const effective = computeEffectiveStat(1, agg);
  const kind = effectKindFromEffectiveStat(1, effective, true);
  if (!kind) return null;
  return {
    category: effective < 1 ? "damageReduction" : "damageIncrease",
    kind,
    remainingRatio: statusEffectRemainingRatio(effect),
    isPassive: isPassiveDisplayedStatusEffect(effect),
  };
}

function statusEffectBadgeForOverlay(
  effect: StatusEffect
): StatusEffectBadgeDisplay | null {
  switch (effect.overlay) {
    case "hot":
      return {
        category: "hot",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "healReservation":
      return {
        category: "healReservation",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "dot":
      return {
        category: resolveDotDisplayCategory(effect),
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "evasion":
      return {
        category: "evasion",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "block":
      return {
        category: "block",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "counter":
      return {
        category: "counter",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "stun":
      return {
        category: "stun",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "moveLock":
      return {
        category: "moveLock",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "damageDelay":
      return {
        category: "damageDelay",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "wardBarrier":
      return {
        category: "wardBarrier",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "herbalPotency":
      return {
        category: "herbalPotency",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "blockResonance":
      return {
        category: "blockResonance",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "basicAttackTransform":
      return {
        category: "basicAttackTransform",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "blockResonanceStance":
      return {
        category: "blockResonanceStance",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "invulnerable":
      return {
        category: "invulnerable",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "lastStandGuts":
      return {
        category: "lastStandGuts",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "arenaDominance":
      return {
        category: "arenaDominance",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "duelistPride":
      return {
        category: "duelistPride",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "arenaMark":
      return {
        category: "arenaMark",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "windMark":
      return {
        category: "windMark",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "earthMark":
      return {
        category: "earthMark",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "ballistaMark":
      return {
        category: "ballistaMark",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "allyAttackFollowUp":
      return {
        category: "allyAttackFollowUp",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "poisonWeapon":
      return {
        category: "poisonWeapon",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    case "nextOutgoingDamage":
      return {
        category: "nextOutgoingDamage",
        kind: "buff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    default:
      return null;
  }
}

function statusEffectBadgeForEffect(
  effect: StatusEffect,
  baseStats: StatBadgeBaseStats
): StatusEffectBadgeDisplay | null {
  if (effect.stat === "hp") {
    return statusEffectBadgeForStat(effect, baseStats.baseMaxHp, "hp");
  }
  if (effect.stat === "atk") {
    return statusEffectBadgeForStat(effect, baseStats.atk, "atk");
  }
  if (effect.stat === "def") {
    return statusEffectBadgeForStat(effect, baseStats.def, "def");
  }
  if (effect.stat === "res") {
    return statusEffectBadgeForStat(effect, baseStats.res, "res");
  }
  if (effect.stat === "attackSpeed") {
    return statusEffectBadgeForStat(effect, 1, "attackSpeed");
  }
  if (effect.stat === "moveSpeed") {
    return statusEffectBadgeForStat(effect, 1, "moveSpeed");
  }
  if (effect.stat === "damageTaken") {
    return statusEffectBadgeForDamageTaken(effect);
  }
  return statusEffectBadgeForOverlay(effect);
}

export function collectStatusEffectBadgeDisplays(
  effects: StatusEffect[],
  baseStats: StatBadgeBaseStats
): StatusEffectBadgeDisplay[] {
  const entries: Array<{
    badge: StatusEffectBadgeDisplay;
    index: number;
    effect: StatusEffect;
  }> = [];

  effects.forEach((effect, index) => {
    if (isStackOverlayWithNoStacks(effect)) return;

    const badge = statusEffectBadgeForEffect(effect, baseStats);
    if (badge) entries.push({ badge, index, effect });
  });

  const groups = new Map<
    StatusDisplayCategory,
    Array<(typeof entries)[number]>
  >();
  for (const entry of entries) {
    const group = groups.get(entry.badge.category) ?? [];
    group.push(entry);
    groups.set(entry.badge.category, group);
  }

  const aggregated: Array<{
    badge: StatusEffectBadgeDisplay;
    minIndex: number;
  }> = [];

  for (const [category, group] of groups) {
    let stackCount = 0;
    for (const { effect } of group) {
      stackCount += effectStackContribution(effect);
    }

    // 代表値: 同一カテゴリに active 由来が 1 つでもあれば active 表示
    const isPassive = group.every(({ badge }) => badge.isPassive);
    const kind = group[0]!.badge.kind;
    const minIndex = Math.min(...group.map(({ index }) => index));

    aggregated.push({
      minIndex,
      badge: {
        category,
        kind,
        isPassive,
        remainingRatio: categoryRemainingRatio(effects, category),
        ...(stackCount > 1 ? { stackCount } : {}),
      },
    });
  }

  return aggregated
    .sort((a, b) => {
      if (a.badge.isPassive !== b.badge.isPassive) {
        return a.badge.isPassive ? -1 : 1;
      }
      return a.minIndex - b.minIndex;
    })
    .map((entry) => entry.badge);
}

function effectsForCategory(
  effects: StatusEffect[],
  category: StatusDisplayCategory
): StatusEffect[] {
  if (category === "hot") {
    return effects.filter((effect) => effect.overlay === "hot");
  }
  if (category === "healReservation") {
    return effects.filter((effect) => effect.overlay === "healReservation");
  }
  if (category === "dot") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && !effect.dotFlavor
    );
  }
  if (category === "bleed") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && effect.dotFlavor === "bleed"
    );
  }
  if (category === "poison") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && effect.dotFlavor === "poison"
    );
  }
  if (category === "seedFlame") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && effect.dotFlavor === "seedFlame"
    );
  }
  if (category === "blazingFlame") {
    return effects.filter(
      (effect) =>
        effect.overlay === "dot" && effect.dotFlavor === "blazingFlame"
    );
  }
  if (category === "hp") {
    return effects.filter((effect) => effect.stat === "hp");
  }
  if (category === "atk") {
    return effects.filter((effect) => effect.stat === "atk");
  }
  if (category === "def") {
    return effects.filter((effect) => effect.stat === "def");
  }
  if (category === "res") {
    return effects.filter((effect) => effect.stat === "res");
  }
  if (category === "attackSpeed") {
    return effects.filter((effect) => effect.stat === "attackSpeed");
  }
  if (category === "moveSpeed") {
    return effects.filter((effect) => effect.stat === "moveSpeed");
  }
  if (category === "damageReduction" || category === "damageIncrease") {
    return effects.filter((effect) => effect.stat === "damageTaken");
  }
  if (category === "block") {
    return effects.filter((effect) => effect.overlay === "block");
  }
  if (category === "evasion") {
    return effects.filter((effect) => effect.overlay === "evasion");
  }
  if (category === "counter") {
    return effects.filter((effect) => effect.overlay === "counter");
  }
  if (category === "stun") {
    return effects.filter((effect) => effect.overlay === "stun");
  }
  if (category === "moveLock") {
    return effects.filter((effect) => effect.overlay === "moveLock");
  }
  if (category === "damageDelay") {
    return effects.filter((effect) => effect.overlay === "damageDelay");
  }
  if (category === "wardBarrier") {
    return effects.filter((effect) => effect.overlay === "wardBarrier");
  }
  if (category === "herbalPotency") {
    return effects.filter((effect) => effect.overlay === "herbalPotency");
  }
  if (category === "blockResonance") {
    return effects.filter((effect) => effect.overlay === "blockResonance");
  }
  if (category === "windMark") {
    return effects.filter((effect) => effect.overlay === "windMark");
  }
  if (category === "earthMark") {
    return effects.filter((effect) => effect.overlay === "earthMark");
  }
  if (category === "blockResonanceStance") {
    return effects.filter(
      (effect) => effect.overlay === "blockResonanceStance"
    );
  }
  if (category === "invulnerable") {
    return effects.filter((effect) => effect.overlay === "invulnerable");
  }
  if (category === "lastStandGuts") {
    return effects.filter((effect) => effect.overlay === "lastStandGuts");
  }
  if (category === "arenaDominance") {
    return effects.filter((effect) => effect.overlay === "arenaDominance");
  }
  if (category === "duelistPride") {
    return effects.filter((effect) => effect.overlay === "duelistPride");
  }
  if (category === "arenaMark") {
    return effects.filter((effect) => effect.overlay === "arenaMark");
  }
  if (category === "basicAttackTransform") {
    return effects.filter(
      (effect) => effect.overlay === "basicAttackTransform"
    );
  }
  if (category === "ballistaMark") {
    return effects.filter((effect) => effect.overlay === "ballistaMark");
  }
  if (category === "allyAttackFollowUp") {
    return effects.filter((effect) => effect.overlay === "allyAttackFollowUp");
  }
  if (category === "poisonWeapon") {
    return effects.filter((effect) => effect.overlay === "poisonWeapon");
  }
  if (category === "nextOutgoingDamage") {
    return effects.filter((effect) => effect.overlay === "nextOutgoingDamage");
  }
  return [];
}

export function categoryRemainingRatio(
  effects: StatusEffect[],
  category: StatusDisplayCategory
): number {
  const relevant = effectsForCategory(effects, category);
  if (relevant.length === 0) return 1;

  let minRatio = 1;
  for (const effect of relevant) {
    const duration =
      effect.durationSec > 0 ? effect.durationSec : effect.remainingSec;
    if (duration <= 0) continue;
    const ratio = Math.max(0, Math.min(1, effect.remainingSec / duration));
    minRatio = Math.min(minRatio, ratio);
  }
  return minRatio;
}

function aggregateStatCategory(
  effects: StatusEffect[],
  category: "hp" | "atk" | "def" | "res" | "attackSpeed",
  base: number
): AggregatedCategoryEffect | null {
  const agg = aggregateStatEffects(effects, category);
  const kind = statEffectKind(base, category, agg);
  if (!kind) return null;

  return {
    category,
    netFlat: agg.netFlat,
    netMul: agg.netMul,
    kind,
    remainingRatio: categoryRemainingRatio(effects, category),
  };
}

function aggregateOverlayCategory(
  effects: StatusEffect[],
  category:
    | "hot"
    | "dot"
    | "bleed"
    | "poison"
    | "evasion"
    | "block"
    | "counter"
    | "stun"
    | "moveLock"
    | "damageDelay"
): AggregatedCategoryEffect | null {
  const relevant = effectsForCategory(effects, category);
  if (relevant.length === 0) return null;

  return {
    category,
    netFlat: 0,
    netMul: 1,
    kind:
      category === "hot" ||
      category === "evasion" ||
      category === "block" ||
      category === "counter" ||
      category === "damageDelay"
        ? "buff"
        : "debuff",
    remainingRatio: categoryRemainingRatio(effects, category),
  };
}

export function aggregateStatEffects(
  effects: StatusEffect[],
  stat: StatusEffect["stat"]
): StatAggregation {
  let netFlat = 0;
  let netMul = 1;

  for (const effect of effects) {
    if (effect.stat !== stat) continue;
    const flat = effect.flatBonus ?? 0;
    netFlat += effect.kind === "buff" ? flat : -flat;
    netMul *= effect.multiplier;
  }

  return { netFlat, netMul };
}

export function computeEffectiveStat(
  base: number,
  aggregation: StatAggregation
): number {
  return Math.max(0, (base + aggregation.netFlat) * aggregation.netMul);
}

export function isStatNeutral(
  base: number,
  aggregation: StatAggregation
): boolean {
  const effective = computeEffectiveStat(base, aggregation);
  return Math.abs(effective - base) < NEUTRAL_EPSILON;
}

export function statEffectKind(
  base: number,
  stat: NonNullable<StatusEffect["stat"]>,
  aggregation: StatAggregation
): "buff" | "debuff" | null {
  if (isStatNeutral(base, aggregation)) return null;

  const effective = computeEffectiveStat(base, aggregation);
  if (stat === "damageTaken") {
    return effective < base ? "buff" : "debuff";
  }
  return effective > base ? "buff" : "debuff";
}

function aggregateDamageTakenCategory(
  effects: StatusEffect[]
): AggregatedCategoryEffect | null {
  const agg = aggregateStatEffects(effects, "damageTaken");
  const kind = statEffectKind(1, "damageTaken", agg);
  if (!kind) return null;

  return {
    category: kind === "buff" ? "damageReduction" : "damageIncrease",
    netFlat: agg.netFlat,
    netMul: agg.netMul,
    kind,
    remainingRatio: categoryRemainingRatio(effects, "damageReduction"),
  };
}

export function aggregateStatStatusEffects(
  effects: StatusEffect[],
  baseStats: StatBadgeBaseStats
): AggregatedCategoryEffect[] {
  const displayEffects = effects.filter(
    (effect) => !isPassiveAuraStatusEffect(effect)
  );
  const result: AggregatedCategoryEffect[] = [];

  const hpBadge = aggregateStatCategory(
    displayEffects,
    "hp",
    baseStats.baseMaxHp
  );
  if (hpBadge) result.push(hpBadge);

  for (const category of ["atk", "def", "res"] as const) {
    const badge = aggregateStatCategory(
      displayEffects,
      category,
      baseStats[category]
    );
    if (badge) result.push(badge);
  }

  const attackSpeedBadge = aggregateStatCategory(
    displayEffects,
    "attackSpeed",
    1
  );
  if (attackSpeedBadge) result.push(attackSpeedBadge);

  const moveSpeedBadge = aggregateStatCategory(displayEffects, "moveSpeed", 1);
  if (moveSpeedBadge) result.push(moveSpeedBadge);

  const damageTakenBadge = aggregateDamageTakenCategory(displayEffects);
  if (damageTakenBadge) result.push(damageTakenBadge);

  for (const category of [
    "hot",
    "dot",
    "bleed",
    "poison",
    "evasion",
    "block",
    "counter",
    "stun",
    "moveLock",
    "damageDelay",
  ] as const) {
    const badge = aggregateOverlayCategory(displayEffects, category);
    if (badge) result.push(badge);
  }

  return result;
}

export function isCategoryEffectVisible(
  agg: AggregatedCategoryEffect
): boolean {
  return agg.kind === "buff" || agg.kind === "debuff";
}

const COMPACT_TIER1_CC: ReadonlySet<StatusDisplayCategory> = new Set([
  "stun",
  "moveLock",
  "damageDelay",
]);

const COMPACT_TIER3_DOT: ReadonlySet<StatusDisplayCategory> = new Set([
  "dot",
  "bleed",
  "poison",
  "seedFlame",
  "blazingFlame",
]);

function statusBadgeSlotOrderIndex(category: StatusDisplayCategory): number {
  const index = STATUS_BADGE_SLOT_ORDER.indexOf(category);
  return index >= 0 ? index : STATUS_BADGE_SLOT_ORDER.length;
}

/** 簡易表示（Party HUD / 敵頭上）用の優先度 tier。小さいほど先に表示。 */
export function assignCompactBadgeTier(
  badge: StatusEffectBadgeDisplay
): number {
  if (COMPACT_TIER1_CC.has(badge.category)) return 1;

  if (
    (badge.category === "def" || badge.category === "res") &&
    badge.kind === "debuff"
  ) {
    return 2;
  }

  if (COMPACT_TIER3_DOT.has(badge.category) && badge.kind === "debuff") {
    return 3;
  }

  if (badge.category === "damageIncrease" && badge.kind === "debuff") {
    return 3;
  }

  if (badge.kind === "debuff") return 4;

  return 5;
}

export function sortBadgesForCompactView(
  badges: StatusEffectBadgeDisplay[]
): StatusEffectBadgeDisplay[] {
  return badges.slice().sort((a, b) => {
    const tierDiff = assignCompactBadgeTier(a) - assignCompactBadgeTier(b);
    if (tierDiff !== 0) return tierDiff;
    return (
      statusBadgeSlotOrderIndex(a.category) -
      statusBadgeSlotOrderIndex(b.category)
    );
  });
}

export function sortBadgesForDetailView(
  badges: StatusEffectBadgeDisplay[]
): StatusEffectBadgeDisplay[] {
  return badges.slice().sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "debuff" ? -1 : 1;
    }
    return (
      statusBadgeSlotOrderIndex(a.category) -
      statusBadgeSlotOrderIndex(b.category)
    );
  });
}

export interface CompactStatusBadgeSelection {
  visible: StatusEffectBadgeDisplay[];
  overflowCount: number;
}

/** 敵頭上等のフィールド簡易表示: 3 +N（計 4 スロット） */
export const FIELD_COMPACT_STATUS_VISIBLE_COUNT = 3;

/** Party HUD 簡易表示: 省略なし時は最大 4、+N 時は 3 + 第 4 枠 */
export const PARTY_HUD_COMPACT_STATUS_MAX_VISIBLE = 4;

/** Party HUD 簡易表示: +N 発生時の表示バッジ数 */
export const PARTY_HUD_COMPACT_STATUS_OVERFLOW_VISIBLE = 3;

/** Party HUD overlay: 2 行 × 10 列の固定状態スロット数 */
export const PARTY_HUD_OVERLAY_STATUS_ROWS = 2;
export const PARTY_HUD_OVERLAY_STATUS_COLS = 10;
export const PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT =
  PARTY_HUD_OVERLAY_STATUS_ROWS * PARTY_HUD_OVERLAY_STATUS_COLS;

/** Party HUD overlay: +N 用に確保する末尾スロット数 */
export const PARTY_HUD_OVERLAY_STATUS_OVERFLOW_RESERVE = 1;

/** @deprecated PARTY_HUD_COMPACT_STATUS_MAX_VISIBLE を参照 */
export const PARTY_HUD_COMPACT_STATUS_VISIBLE_COUNT =
  PARTY_HUD_COMPACT_STATUS_MAX_VISIBLE;

export interface CompactStatusBadgeSelectOptions {
  visibleCount?: number;
}

/** 簡易表示: 最大 visibleCount バッジ + overflowCount（最終枠は +N 専用）。 */
export function selectCompactStatusBadges(
  badges: StatusEffectBadgeDisplay[],
  options: CompactStatusBadgeSelectOptions = {}
): CompactStatusBadgeSelection {
  const visibleCount =
    options.visibleCount ?? FIELD_COMPACT_STATUS_VISIBLE_COUNT;
  const sorted = sortBadgesForCompactView(badges);
  const overflowCount = Math.max(0, sorted.length - visibleCount);
  return {
    visible: sorted.slice(0, visibleCount),
    overflowCount,
  };
}

/** Party HUD 簡易表示: 4 件以下は全表示、5 件以上は 3 +N（計 4 スロット幅）。 */
export function selectPartyHudCompactStatusBadges(
  badges: StatusEffectBadgeDisplay[],
): CompactStatusBadgeSelection {
  const sorted = sortBadgesForCompactView(badges);
  if (sorted.length <= PARTY_HUD_COMPACT_STATUS_MAX_VISIBLE) {
    return {
      visible: sorted.slice(0, PARTY_HUD_COMPACT_STATUS_MAX_VISIBLE),
      overflowCount: 0,
    };
  }
  return {
    visible: sorted.slice(0, PARTY_HUD_COMPACT_STATUS_OVERFLOW_VISIBLE),
    overflowCount:
      sorted.length - PARTY_HUD_COMPACT_STATUS_OVERFLOW_VISIBLE,
  };
}

/** Party HUD overlay: 20 枠固定。21 件以上は 19 +N。 */
export function selectPartyHudOverlayStatusBadges(
  badges: StatusEffectBadgeDisplay[],
): CompactStatusBadgeSelection {
  const sorted = sortBadgesForCompactView(badges);
  if (sorted.length <= PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT) {
    return {
      visible: sorted.slice(0, PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT),
      overflowCount: 0,
    };
  }

  const visibleCount =
    PARTY_HUD_OVERLAY_STATUS_SLOT_COUNT -
    PARTY_HUD_OVERLAY_STATUS_OVERFLOW_RESERVE;
  return {
    visible: sorted.slice(0, visibleCount),
    overflowCount: sorted.length - visibleCount,
  };
}
