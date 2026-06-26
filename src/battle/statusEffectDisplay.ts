import type { StatusEffect } from "./types.ts";

export type StatusDisplayCategory =
  | "atk"
  | "def"
  | "reg"
  | "attackSpeed"
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
  | "mark"
  | "arenaMark";

export const STATUS_BADGE_SLOT_ORDER: StatusDisplayCategory[] = [
  "atk",
  "def",
  "reg",
  "attackSpeed",
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
  "mark",
  "arenaMark",
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
  effect: StatusEffect,
): "dot" | "bleed" | "poison" {
  if (effect.dotFlavor === "bleed") return "bleed";
  if (effect.dotFlavor === "poison") return "poison";
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
  atk: number;
  def: number;
  reg: number;
}

export interface StatusEffectBadgeDisplay {
  category: StatusDisplayCategory;
  kind: "buff" | "debuff";
  remainingRatio: number;
  isPassive: boolean;
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
  reversed = false,
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
  category: "atk" | "def" | "reg" | "attackSpeed",
): StatusEffectBadgeDisplay | null {
  const agg = aggregateStatEffects([effect], category);
  const kind = effectKindFromEffectiveStat(base, computeEffectiveStat(base, agg));
  if (!kind) return null;
  return {
    category,
    kind,
    remainingRatio: statusEffectRemainingRatio(effect),
    isPassive: isPassiveDisplayedStatusEffect(effect),
  };
}

function statusEffectBadgeForDamageTaken(
  effect: StatusEffect,
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
  effect: StatusEffect,
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
    case "mark":
      return {
        category: "mark",
        kind: "debuff",
        remainingRatio: statusEffectRemainingRatio(effect),
        isPassive: isPassiveDisplayedStatusEffect(effect),
      };
    default:
      return null;
  }
}

function statusEffectBadgeForEffect(
  effect: StatusEffect,
  baseStats: StatBadgeBaseStats,
): StatusEffectBadgeDisplay | null {
  if (effect.stat === "atk") {
    return statusEffectBadgeForStat(effect, baseStats.atk, "atk");
  }
  if (effect.stat === "def") {
    return statusEffectBadgeForStat(effect, baseStats.def, "def");
  }
  if (effect.stat === "reg") {
    return statusEffectBadgeForStat(effect, baseStats.reg, "reg");
  }
  if (effect.stat === "attackSpeed") {
    return statusEffectBadgeForStat(effect, 1, "attackSpeed");
  }
  if (effect.stat === "damageTaken") {
    return statusEffectBadgeForDamageTaken(effect);
  }
  return statusEffectBadgeForOverlay(effect);
}

export function collectStatusEffectBadgeDisplays(
  effects: StatusEffect[],
  baseStats: StatBadgeBaseStats,
): StatusEffectBadgeDisplay[] {
  const entries: Array<{ badge: StatusEffectBadgeDisplay; index: number }> = [];

  effects.forEach((effect, index) => {
    if (
      effect.overlay === "herbalPotency" ||
      effect.overlay === "blockResonance" ||
      effect.overlay === "mark" ||
      effect.overlay === "arenaMark"
    ) {
      const stackCount = effect.stacks ?? 0;
      if (stackCount <= 0) return;
      const badge = statusEffectBadgeForOverlay(effect);
      if (!badge) return;
      for (let i = 0; i < stackCount; i++) {
        entries.push({
          badge: {
            ...badge,
            isPassive: isPassiveDisplayedStatusEffect(effect),
          },
          index,
        });
      }
      return;
    }

    const badge = statusEffectBadgeForEffect(effect, baseStats);
    if (badge) entries.push({ badge, index });
  });

  return entries
    .sort((a, b) => {
      if (a.badge.isPassive !== b.badge.isPassive) {
        return a.badge.isPassive ? -1 : 1;
      }
      return a.index - b.index;
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
      (effect) => effect.overlay === "dot" && !effect.dotFlavor,
    );
  }
  if (category === "bleed") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && effect.dotFlavor === "bleed",
    );
  }
  if (category === "poison") {
    return effects.filter(
      (effect) => effect.overlay === "dot" && effect.dotFlavor === "poison",
    );
  }
  if (category === "atk") {
    return effects.filter((effect) => effect.stat === "atk");
  }
  if (category === "def") {
    return effects.filter((effect) => effect.stat === "def");
  }
  if (category === "reg") {
    return effects.filter((effect) => effect.stat === "reg");
  }
  if (category === "attackSpeed") {
    return effects.filter((effect) => effect.stat === "attackSpeed");
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
  if (category === "blockResonanceStance") {
    return effects.filter(
      (effect) => effect.overlay === "blockResonanceStance",
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
      (effect) => effect.overlay === "basicAttackTransform",
    );
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
  category: "atk" | "def" | "reg" | "attackSpeed",
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

  for (const category of ["atk", "def", "reg"] as const) {
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
