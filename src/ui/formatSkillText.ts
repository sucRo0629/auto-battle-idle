import {
  defaultTargetForEffectType,
  formatTargetLabel,
} from "../battle/skills/targetSpec.ts";
import { resolveSkillTrigger } from "../battle/skillTrigger.ts";
import { KNOCKBACK_MOVE_LOCK_SEC } from "../battle/ccEffects.ts";
import {
  HERBAL_POTENCY_ACCUMULATE_SEC,
  HERBAL_POTENCY_CONSTITUTION_DISPLAY_NAME,
  HERBAL_POTENCY_HOT_TICK_SEC,
} from "../battle/herbalPotency.ts";
import { mergeSorcererFlameDotConfig } from "../battle/sorcererFlame.ts";
import {
  BUFF_SUB_KIND_LABELS,
  DEBUFF_FILTER_TAG_LABELS,
  DEBUFF_SUB_KIND_LABELS,
  DOT_FLAVOR_LABELS,
  EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS,
  DISPEL_PRIORITY_LABELS,
  FIRE_CONDITION_KIND_LABELS,
  HEAL_SUB_KIND_LABELS,
  SPECIAL_EFFECT_APPLY_TO_LABELS,
  TARGET_SHAPE_LABELS,
  TARGET_STAT_LABELS,
} from "../battle/data/gameDataSchema.ts";
import type {
  ActiveSkillDef,
  BuffTargetKind,
  CounterResponseDef,
  DamageIncreaseSpec,
  DamageIncreaseCondition,
  DamageType,
  DebuffFilterTag,
  FireCondition,
  PassiveSkillDef,
  PassiveEffectKind,
  ResourceAmountSpec,
  SkillEffectDef,
  SkillTriggerKind,
  DispelPriority,
  StatusEffectStat,
  StatBuffTarget,
  TargetShape,
  TargetSpec,
  TargetStat,
} from "../battle/types.ts";
import {
  asStatusEffectStatList,
  filterStatusEffectStats,
  filterStatBuffTargets,
  isStatusEffectStat,
} from "../battle/types.ts";
import {
  formatStatBuffModifierEntries,
  parseStatBuffModifiers,
} from "../battle/statBuffModifiers.ts";
import {
  PASSIVE_PERIODIC_TRIGGER_LABELS,
  resolvePassiveBarrierTrigger,
  resolvePassivePeriodicTrigger,
  usesHotAuraMode,
  usesPassiveTriggerChance,
} from "../battle/passivePeriodicTrigger.ts";
import type { PassivePeriodicTriggerKind } from "../battle/passivePeriodicTrigger.ts";
import { passiveBuffToEffectDef } from "../battle/passiveBuffBridge.ts";
import { passiveDebuffToEffectDef } from "../battle/passiveDebuffBridge.ts";
import { passiveDamageReductionToEffectDef } from "../battle/passiveDamageReductionBridge.ts";
import { passiveDispelToEffectDef } from "../battle/passiveDispelBridge.ts";
import { passiveHotToEffectDef } from "../battle/passiveHotBridge.ts";
import type { GameTermLocale } from "./gameTermGlossary.ts";
import {
  resolveGameTermTitle,
  resolveStatusEffectStatDisplayName,
} from "./gameTermGlossary.ts";
import {
  getSkillTextLocale,
  runWithSkillTextLocale,
  skillText,
  type SkillCardLocale,
} from "./skillTextLocale.ts";
import {
  formatSignedUiDistanceValue,
  formatUiDistanceValue,
} from "./formatUiDistance.ts";
import {
  phraseAtkBasedBarrier,
  phraseAtkBasedDamage,
  phraseAtkBasedDamageNoun,
  phraseAtkBasedHeal,
  phraseAtkBasedHealAmount,
  phraseBarrierAmountBonusOnLowHpAlly,
  phraseBarrierDepletionHeal,
  phraseBarrierDepletionWardExclusion,
  phraseBasicAttackMultiHit,
  phraseBlazingFlameDotPerStack,
  phraseBlazingFlameMagicTakenPerStack,
  phraseBlockChance,
  phraseBlockRate,
  phraseBlockRateBuff,
  phraseApplyDotAfterAttack,
  phraseChargesAvailable,
  phraseCounterLabel,
  phraseDamageIncreaseIfCondition,
  phraseDamageReductionRate,
  phraseDefenseIgnorePercent,
  phraseDefenseIgnoreRegPercent,
  phraseEvasionBuff,
  phraseFireConditionSelfHp,
  phraseFireConditionTargetHp,
  phraseFlatHeal,
  phraseHealPotencyBonusOnLowHpAlly,
  phraseHealSuffix,
  phraseIfTargetHasDebuff,
  phraseIfTargetHp,
  phraseKnockbackLabel,
  phraseMagicBlockEnable,
  phraseMaxStacks,
  phraseMoveBehindTargetThen,
  phraseMultiHitDamage,
  phraseMultiLockEffectSentence,
  phraseOverhealToBarrier,
  phraseScopeAllAllies,
  phraseScopeSelfOrigin,
  phraseSeedFlameDotPerStack,
  phraseSeedFlameStackOnHit,
  phraseSeedFlameUpgradeToBlazing,
  phraseSelfDamageReduction,
  phraseStunDuration,
  phraseSurroundingBlockRateBuff,
  phraseSurroundingDamageReduction,
  phraseSurroundingPrefix,
  phraseTargetHighestStatEnemy,
  phraseTargetLowestHpRatioEnemy,
  phraseTargetRangedEnemy,
  phraseTimedEvasionBuff,
  skillStat,
  skillStatBuffTarget,
  skillTargetStat,
  skillTerm,
} from "./skillTextPhrases.ts";

export type { SkillCardLocale };

function formatPassiveTriggerLabel(
  trigger: PassivePeriodicTriggerKind | undefined,
  fallback = "—"
): string {
  if (trigger === undefined) return fallback;
  return PASSIVE_PERIODIC_TRIGGER_LABELS[trigger];
}

function formatPassiveTriggerSummary(
  passive: PassiveSkillDef,
  trigger: PassivePeriodicTriggerKind | undefined,
  fallback?: string
): string {
  const triggerLabel = formatPassiveTriggerLabel(
    trigger,
    fallback ?? skillText().passiveAlways
  );
  if (!usesPassiveTriggerChance(passive)) return triggerLabel;
  const chance = passive.chance;
  if (chance !== undefined && chance < 1) {
    return `${triggerLabel} ${formatPercent(chance)}`;
  }
  return triggerLabel;
}

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  get physical() {
    return skillText().damagePhysical;
  },
  get magic() {
    return skillText().damageMagic;
  },
};

function formatStatFlatSuffix(flat: number): string {
  if (flat > 0) return `+${flat}`;
  if (flat < 0) return `${flat}`;
  return "";
}

function formatStatMultiplierSuffix(mul: number): string {
  if (mul > 1) return `+${formatPercent(mul - 1)}`;
  if (mul < 1) return `-${formatPercent(1 - mul)}`;
  return "";
}

function formatStatMultiplierLabel(
  stat: StatusEffectStat,
  mul: number
): string {
  const label = skillStat(stat);
  const suffix = formatStatMultiplierSuffix(mul);
  if (!suffix) return label;
  return `${label}${suffix}`;
}

function formatFireConditionSummary(condition: FireCondition): string {
  switch (condition.kind) {
    case "debuff": {
      const tags = condition.tags
        .map((tag) => DEBUFF_FILTER_TAG_LABELS[tag] ?? tag)
        .join("/");
      return condition.selfAppliedOnly
        ? `自付与デバフ:${tags}`
        : `デバフ:${tags}`;
    }
    case "targetHp": {
      const pct = Math.round(condition.maxHpRatio * 100);
      return phraseFireConditionTargetHp(pct, condition.compare);
    }
    case "selfHp": {
      const pct = Math.round(condition.maxHpRatio * 100);
      return phraseFireConditionSelfHp(pct, condition.compare);
    }
    case "minTargets":
      return `対象≥${condition.count}`;
    case "allyDamaged":
      return "味方被ダメ";
    case "waveStart":
      return FIRE_CONDITION_KIND_LABELS.waveStart;
    case "finalWaveStart":
      return FIRE_CONDITION_KIND_LABELS.finalWaveStart;
    case "waveEnd":
      return FIRE_CONDITION_KIND_LABELS.waveEnd;
    case "enemyCount": {
      const parts: string[] = [];
      if (condition.min !== undefined) parts.push(`≥${condition.min}`);
      if (condition.max !== undefined) parts.push(`≤${condition.max}`);
      const range = parts.length > 0 ? parts.join("") : "任意";
      const scope = condition.scope === "inRange" ? "射程内" : "生存";
      return `敵数${range}(${scope})`;
    }
    case "pendingIncomingDamage":
      return `先読み被ダメ≥${Math.round(condition.maxHpRatio * 100)}%/${formatSecondsLabel(
        condition.windowSec
      )}`;
    case "targetBarrierBelowGrant":
      return "付与量>現バリア";
    case "blockResonanceStacks":
      return `防壁≥${condition.min}`;
    case "hasDot":
      return FIRE_CONDITION_KIND_LABELS.hasDot;
  }
}

function formatFireConditionsSummary(
  conditions: FireCondition[] | undefined,
  match: "all" | "any" = "all"
): string {
  if (!conditions || conditions.length === 0) return "";
  const joiner = match === "any" ? " | " : " & ";
  return conditions.map(formatFireConditionSummary).join(joiner);
}

function formatSecondsLabel(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return skillText().seconds(rounded);
}

function joinSkillCardSegments(
  ...parts: Array<string | null | undefined | false>
): string {
  return parts.filter((part): part is string => Boolean(part)).join(" / ");
}

function formatCdLabel(kind: SkillTriggerKind, value: number): string {
  const st = skillText();
  switch (kind) {
    case "time":
      return value === 0 ? st.noCharge : formatSecondsLabel(value);
    case "basicAttackCount":
      return st.basicAttackCount(value);
    case "hitsTaken":
      return st.hitsTakenCount(value);
  }
}

function isSelfTargetSpec(spec: TargetSpec): boolean {
  return spec.kind === "self";
}

function isOmittableDefaultEnemyTarget(spec: TargetSpec): boolean {
  return (
    spec.kind === "distance" &&
    spec.side === "enemy" &&
    spec.order === "nearest"
  );
}

function isDefaultLowestHpAllyTarget(spec: TargetSpec): boolean {
  return (
    spec.kind === "stat" &&
    spec.side === "ally" &&
    spec.stat === "hp" &&
    spec.order === "ratio"
  );
}

function isAllAllyTarget(spec: TargetSpec): boolean {
  return spec.kind === "all" && spec.side === "ally";
}

function formatCompactAtkBasedHealSentence(
  amount: ResourceAmountSpec | undefined,
  targetSpec?: TargetSpec
): string {
  if (amount?.kind === "atkBased") {
    const pct = formatPercent(amount.atkScale ?? 1);
    const scope =
      targetSpec && isAllAllyTarget(targetSpec) ? "allAllies" : "ally";
    return phraseAtkBasedHeal(pct, scope);
  }
  return phraseFlatHeal(formatResourceAmount(amount));
}

function joinActiveSkillScopePrefix(
  scopePrefix: string | undefined,
  effectParts: string
): string {
  if (!scopePrefix || !effectParts) return effectParts;
  const allAllies = phraseScopeAllAllies();
  if (scopePrefix === allAllies && effectParts.startsWith(allAllies)) {
    return effectParts;
  }
  if (
    getSkillTextLocale() === "ja" &&
    scopePrefix === "味方全体" &&
    effectParts.startsWith("味方")
  ) {
    return effectParts;
  }
  if (
    getSkillTextLocale() === "en" &&
    scopePrefix === "All allies" &&
    effectParts.startsWith("Heals all allies")
  ) {
    return effectParts;
  }
  return `${scopePrefix} ${effectParts}`;
}

function formatPassiveSpecialEffectHeal(def: PassiveSkillDef): string {
  const spec = def.specialEffect;
  if (!spec) return "特効回復";
  const bonusPct = formatPercent((spec.scale ?? 1) - 1);
  for (const condition of spec.conditions ?? []) {
    if (condition.kind !== "targetHp") continue;
    const pct = Math.round(condition.maxHpRatio * 100);
    return phraseHealPotencyBonusOnLowHpAlly(
      pct,
      condition.compare === "gte" ? "gte" : "lte",
      bonusPct,
    );
  }
  return formatSpecialEffectSpec(def.specialEffectApplyTo, spec) || "特効回復";
}

function formatPassiveSpecialEffectBarrier(def: PassiveSkillDef): string {
  const spec = def.specialEffect;
  if (!spec) return "特効バリア";
  const bonusPct = formatPercent((spec.scale ?? 1) - 1);
  for (const condition of spec.conditions ?? []) {
    if (condition.kind !== "targetHp") continue;
    const pct = Math.round(condition.maxHpRatio * 100);
    return phraseBarrierAmountBonusOnLowHpAlly(
      pct,
      condition.compare === "gte" ? "gte" : "lte",
      bonusPct,
    );
  }
  return formatSpecialEffectSpec("barrier", spec) || "特効バリア";
}

function formatBarrierDepletionHealHealSentence(def: PassiveSkillDef): string {
  if (def.healAmount?.kind === "atkBased") {
    const pct = formatPercent(def.healAmount.atkScale ?? 1);
    return phraseAtkBasedHealAmount(pct);
  }
  return `${formatResourceAmount(def.healAmount)}${phraseHealSuffix()}`;
}

function formatBarrierDepletionHealEffectLines(def: PassiveSkillDef): string[] {
  const heal = formatBarrierDepletionHealHealSentence(def);
  return [
    phraseBarrierDepletionHeal(heal),
    phraseBarrierDepletionWardExclusion(),
  ];
}

function formatBarrierDepletionHealPassive(def: PassiveSkillDef): string {
  return formatBarrierDepletionHealEffectLines(def).join("、");
}

export type SkillCardListItem = {
  text: string;
  details?: string[];
};

export type SkillCardEffectList = {
  kind: "list";
  items: SkillCardListItem[];
};

export type SkillCardEffectLine = string | SkillCardEffectList;

export function isSkillCardEffectList(
  line: SkillCardEffectLine
): line is SkillCardEffectList {
  return typeof line === "object" && line.kind === "list";
}

export function flattenSkillCardEffectLines(
  lines: SkillCardEffectLine[]
): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (typeof line === "string") {
      out.push(line);
      continue;
    }
    for (const item of line.items) {
      out.push(item.text);
      if (item.details) {
        out.push(...item.details);
      }
    }
  }
  return out;
}

function formatSeedFlameOnActiveHitEffectLines(
  def: PassiveSkillDef
): SkillCardEffectLine[] {
  const config = mergeSorcererFlameDotConfig([def]);
  const seedFlameDotPct = formatPercent(config.seedFlameDotAtkScale);
  const blazingFlameDotPct = formatPercent(config.blazingFlameDotAtkScale);
  const blazingFlameMagicTakenPct = formatPercent(
    config.blazingFlameMagicTakenPerStack
  );

  return [
    phraseSeedFlameStackOnHit(),
    {
      kind: "list",
      items: [
        {
          text: phraseSeedFlameDotPerStack(
            config.seedFlameDurationSec,
            seedFlameDotPct,
          ),
          details: [
            phraseMaxStacks(config.seedFlameMaxStacks),
            phraseSeedFlameUpgradeToBlazing(config.blazingFlameMaxStacksDefault),
          ],
        },
        {
          text: phraseBlazingFlameDotPerStack(blazingFlameDotPct),
          details: [
            phraseBlazingFlameMagicTakenPerStack(blazingFlameMagicTakenPct),
            phraseMaxStacks(config.blazingFlameMaxStacksDefault),
          ],
        },
      ],
    },
  ];
}

function formatSeedFlameOnActiveHitPassive(def: PassiveSkillDef): string {
  return flattenSkillCardEffectLines(
    formatSeedFlameOnActiveHitEffectLines(def)
  ).join("、");
}

function formatExcessHealToBarrierPassive(def: PassiveSkillDef): string {
  const scalePct = formatPercent(def.barrierScale ?? 1);
  const sources = def.excessHealSources ?? ["outgoing"];
  if (sources.length === 1 && sources[0] === "outgoing") {
    return phraseOverhealToBarrier(scalePct);
  }
  const sourceLabels = sources.map((s) => (s === "outgoing" ? "与" : "被"));
  return `余剰回復バリア ${scalePct}（${sourceLabels.join("・")}）`;
}

function formatMultiLockEffectLines(
  effect: SkillEffectDef,
  targetSpec: TargetSpec,
): string[] | null {
  if ((effect.targetShape ?? "single") !== "multiLock") return null;
  const hitCount = effect.hitCount ?? 1;
  if (hitCount <= 1) return null;
  const side = targetSpec.side === "ally" ? "ally" : "enemy";

  let core: string | null = null;
  if (effect.type === "damage") {
    core = formatCompactAtkBasedDamageSentence(effect.amount, effect.damageType);
  } else if (effect.type === "heal") {
    core = formatCompactAtkBasedHealSentence(effect.amount, targetSpec);
  } else if (effect.type === "buff" && effect.buffSubKind === "barrier") {
    core = formatCompactBarrierBuffLabel(effect.amount, effect.barrierStack);
  }
  if (!core) return null;

  return [phraseMultiLockEffectSentence(core, hitCount, side)];
}

function formatCompactBarrierBuffLabel(
  amount: ResourceAmountSpec | undefined,
  stack?: boolean
): string {
  if (amount?.kind === "atkBased") {
    const pct = formatPercent(amount.atkScale ?? 1);
    return phraseAtkBasedBarrier(pct, stack);
  }
  const stackSuffix = stack
    ? getSkillTextLocale() === "en"
      ? " (stacking)"
      : "（加算）"
    : "";
  return `${formatResourceAmount(amount)}${stackSuffix}`;
}

function formatActiveSkillMaxChargesLine(def: ActiveSkillDef): string | null {
  if (def.maxCharges === undefined || def.maxCharges <= 0) return null;
  return phraseChargesAvailable(def.maxCharges);
}

function formatCompactAtkBasedDamageSentence(
  amount: ResourceAmountSpec | undefined,
  damageType?: DamageType
): string {
  if (amount?.kind === "atkBased") {
    const scale = amount.atkScale ?? 1;
    const pct = formatPercent(scale);
    return phraseAtkBasedDamageNoun(pct, damageType);
  }
  const dmgPrefix = damageType ? `${DAMAGE_TYPE_LABELS[damageType]} ` : "";
  if (getSkillTextLocale() === "en") {
    return `${dmgPrefix}${formatResourceAmount(amount)} damage`.trim();
  }
  return `${dmgPrefix.trim()}${formatResourceAmount(amount)}のダメージ`;
}

function formatCompactSingleTargetDamageSentence(
  effect: SkillEffectDef,
  targetSpec: TargetSpec
): string | null {
  if (effect.type !== "damage") return null;
  if ((effect.targetShape ?? "single") === "multiLock") return null;
  if (!isOmittableDefaultEnemyTarget(targetSpec)) return null;
  if (effect.amount?.kind !== "atkBased") return null;
  const sentence = formatCompactAtkBasedDamageSentence(
    effect.amount,
    effect.damageType
  );
  const hitCount = effect.hitCount ?? 1;
  if (hitCount > 1) {
    return phraseMultiHitDamage(hitCount, sentence);
  }
  return sentence;
}

function formatMultiLockDamageEffectLines(
  effect: SkillEffectDef,
  inheritTarget?: TargetSpec,
): string[] | null {
  const targetSpec = resolveEffectTargetSpec(effect, inheritTarget);
  return formatMultiLockEffectLines(effect, targetSpec);
}

function resolveTargetStatDisplayName(stat: TargetStat): string {
  if (isStatusEffectStat(stat)) {
    return skillStat(stat);
  }
  return skillTargetStat(stat);
}

function formatTargetRuleOverridePassive(def: PassiveSkillDef): string {
  const rule = def.targetRuleOverride;
  if (!rule) return "ターゲット上書き";
  if (
    rule.kind === "stat" &&
    rule.side === "enemy" &&
    rule.stat === "hp" &&
    rule.order === "ratio"
  ) {
    return phraseTargetLowestHpRatioEnemy();
  }
  if (
    rule.kind === "stat" &&
    rule.side === "enemy" &&
    rule.order === "highest"
  ) {
    const statLabel = resolveTargetStatDisplayName(rule.stat);
    return phraseTargetHighestStatEnemy(statLabel);
  }
  if (rule.kind === "attackType" && rule.ranged && !rule.melee) {
    return phraseTargetRangedEnemy();
  }
  const scope = def.targetRuleOverrideApplyTo ?? "enemy";
  const scopeLabel = scope === "ally" ? "味方向け" : "敵向け";
  return `${scopeLabel}ターゲット → ${formatTarget(rule, {
    kind: "distance",
    side: scope,
    order: "nearest",
  })}`;
}

function formatPassiveAlwaysSelfStatBuff(def: PassiveSkillDef): string | null {
  if (def.effect !== "buff" || (def.buffSubKind ?? "stat") !== "stat") {
    return null;
  }
  const target = def.buffTargetRule ?? { kind: "self" };
  if (target.kind !== "self") return null;
  if (resolvePassivePeriodicTrigger(def) !== undefined) return null;
  const label = formatBuffStatModifiersFromDef(def);
  if (!label || label === "—") return null;
  return compactStatEffectLabel(label);
}

function formatPassiveDefenseIgnore(def: PassiveSkillDef): string {
  const spec = def.defenseIgnore;
  if (!spec) return "防御無視";
  if (spec.chance !== undefined && spec.chance < 1) {
    return formatDefenseIgnoreSpec(spec) || "防御無視";
  }
  if (spec.def?.mode === "percent") {
    return phraseDefenseIgnorePercent(formatPercent(spec.def.amount));
  }
  if (spec.reg?.percent !== undefined) {
    return phraseDefenseIgnoreRegPercent(formatPercent(spec.reg.percent));
  }
  return formatDefenseIgnoreSpec(spec) || "防御無視";
}

function resolveEffectTargetSpec(
  effect: SkillEffectDef,
  inheritTarget?: TargetSpec
): TargetSpec {
  return (
    effect.target ?? inheritTarget ?? defaultTargetForEffectType(effect.type)
  );
}

function formatCompactTargetHint(spec: TargetSpec): string {
  switch (spec.kind) {
    case "distance":
      if (spec.order === "nearest") return "至近";
      if (spec.order === "selfOrigin") return "自身起点";
      return "";
    case "stat":
      if (
        spec.side === "ally" &&
        spec.stat === "hp" &&
        spec.order === "ratio"
      ) {
        return "最低HP味方";
      }
      return "";
    case "all":
      return spec.side === "ally" ? "味方全体" : "";
    default:
      return "";
  }
}

function resolveTargetSideLabel(spec: TargetSpec): "ally" | "enemy" | null {
  switch (spec.kind) {
    case "distance":
    case "stat":
    case "status":
    case "all":
      return spec.side;
    default:
      return null;
  }
}

function targetSideNoun(side: "ally" | "enemy"): string {
  if (getSkillTextLocale() === "en") {
    return side === "ally" ? "Allies" : "Enemies";
  }
  return side === "ally" ? "味方" : "敵";
}

function targetSidePossessivePrefix(side: "ally" | "enemy"): string {
  if (getSkillTextLocale() === "en") {
    return side === "ally" ? "Allied " : "Enemy ";
  }
  return `${targetSideNoun(side)}の`;
}

function targetSideApplyPrefix(side: "ally" | "enemy"): string {
  if (getSkillTextLocale() === "en") {
    return side === "ally" ? "To allies: " : "To enemies: ";
  }
  return `${targetSideNoun(side)}に`;
}

function resolveActiveSkillScopePrefix(
  def: ActiveSkillDef
): string | undefined {
  if (
    def.target?.kind === "distance" &&
    def.target.order === "selfOrigin" &&
    (def.targetShape ?? "single") === "aoe"
  ) {
    const radius = def.aoeRadiusPx;
    return phraseScopeSelfOrigin(radius);
  }
  if (def.effect.length > 0) {
    const allAllyAll = def.effect.every((effect) => {
      const target = resolveEffectTargetSpec(effect, def.target);
      return target.kind === "all" && target.side === "ally";
    });
    if (allAllyAll) return phraseScopeAllAllies();
  }
  return undefined;
}

function collectEffectDurationSec(
  effect: SkillEffectDef,
  visit: (sec: number) => void
): void {
  switch (effect.type) {
    case "buff":
      if (effect.buffDurationSec !== undefined && effect.buffDurationSec > 0) {
        visit(effect.buffDurationSec);
      }
      break;
    case "debuff":
      if (
        effect.debuffDurationSec !== undefined &&
        effect.debuffDurationSec > 0
      ) {
        visit(effect.debuffDurationSec);
      }
      if (effect.durationSec !== undefined && effect.durationSec > 0) {
        visit(effect.durationSec);
      }
      break;
    case "heal":
      if (effect.durationSec !== undefined && effect.durationSec > 0) {
        visit(effect.durationSec);
      }
      break;
    case "basicAttackTransform":
      if (effect.buffDurationSec !== undefined && effect.buffDurationSec > 0) {
        visit(effect.buffDurationSec);
      }
      break;
    case "conditionalEffect":
      for (const branch of [...effect.thenEffects, ...effect.elseEffects]) {
        collectEffectDurationSec(branch, visit);
      }
      break;
    default:
      break;
  }
}

function formatBlockResonanceStanceDurationLabel(
  def: ActiveSkillDef,
  options?: { useDurationFallback?: boolean }
): string {
  const fallback = options?.useDurationFallback
    ? def.useDurationSec || 2
    : 2;
  const base = def.blockResonanceStanceDurationBaseSec ?? fallback;
  return `${base}+防壁スタック数秒`;
}

function resolveActiveSkillDurationLabel(
  def: ActiveSkillDef
): string | undefined {
  if (def.effect.some((effect) => effect.type === "blockResonanceConsume")) {
    return formatBlockResonanceStanceDurationLabel(def);
  }
  let maxSec = 0;
  for (const effect of def.effect) {
    collectEffectDurationSec(effect, (sec) => {
      maxSec = Math.max(maxSec, sec);
    });
  }
  if (maxSec <= 0) return undefined;
  return formatSecondsLabel(maxSec);
}

function resolveActiveSkillLockDurationLabel(
  def: ActiveSkillDef
): string | undefined {
  const hasConsume = def.effect.some(
    (effect) => effect.type === "blockResonanceConsume"
  );
  const useSec = def.useDurationSec ?? 0;
  if (useSec <= 0 && !hasConsume) return undefined;

  if (hasConsume) {
    return formatBlockResonanceStanceDurationLabel(def, {
      useDurationFallback: true,
    });
  }
  return formatSecondsLabel(useSec);
}

function formatActiveSkillLockMetaParts(def: ActiveSkillDef): string[] {
  const durationLabel = resolveActiveSkillLockDurationLabel(def);
  if (!durationLabel) return [];

  const st = skillText();
  const parts = [`${st.skillLock}${st.labelColon}${durationLabel}`];
  if (def.useDurationPauseApproach) {
    parts.push(st.moveLockPresent);
  }
  return parts;
}

function formatBlockResonanceConsumeSkillEffect(def: ActiveSkillDef): string {
  const radius = def.blockResonanceOnBlockKnockbackRadiusPx ?? 50;
  const damage = def.blockResonanceOnBlockDamage;
  const defScale = damage?.kind === "defBased" ? damage.defScale ?? 1 : 1;
  return `「城塞の構え」：ブロック時半径${formatUiDistanceValue(radius)}内の敵に${formatDefScale(
    defScale
  )}のダメージ+ノックバック`;
}

function resolveActiveSkillSpecialEffectLines(
  def: ActiveSkillDef
): string[] | null {
  const hasConsume = def.effect.some(
    (effect) => effect.type === "blockResonanceConsume"
  );
  const mappableEffects = def.effect.filter(
    (effect) => effect.type !== "blockResonanceConsume"
  );
  if (hasConsume && mappableEffects.length === 0) {
    return [formatBlockResonanceConsumeSkillEffect(def)];
  }

  const polishedSequentialLines = tryFormatPolishedSequentialEffectLines(def);
  if (polishedSequentialLines) {
    const maxChargesLine = formatActiveSkillMaxChargesLine(def);
    return maxChargesLine
      ? [...polishedSequentialLines, maxChargesLine]
      : polishedSequentialLines;
  }
  return null;
}

type SkillCardFormatContext = {
  basicAttackRangePx?: number;
  showTargetFrame?: boolean;
};

function formatActiveSkillDefaultEffectLines(
  def: ActiveSkillDef,
  options?: { includeMaxCharges?: boolean } & SkillCardFormatContext
): string[] {
  const mappableEffects = def.effect.filter(
    (effect) => effect.type !== "blockResonanceConsume"
  );
  const scopePrefix = resolveActiveSkillScopePrefix(def);
  const lines: string[] = [];
  let scopeApplied = false;
  let pendingTargetFrameGroup: {
    frame: string;
    details: string[];
    targetSide: "ally" | "enemy" | null;
  } | null = null;

  const pushLine = (line: string, suppressScopePrefix = false): void => {
    if (scopePrefix && !scopeApplied && !suppressScopePrefix) {
      lines.push(joinActiveSkillScopePrefix(scopePrefix, line));
      scopeApplied = true;
    } else {
      lines.push(line);
      if (scopePrefix && suppressScopePrefix) scopeApplied = true;
    }
  };

  const flushTargetFrameGroup = (): void => {
    if (!pendingTargetFrameGroup) return;
    const group = pendingTargetFrameGroup;
    pendingTargetFrameGroup = null;
    if (group.details.length === 1) {
      pushLine(`${group.frame} / ${group.details[0]}`, true);
      return;
    }
    const strippedDetails = group.details.map((detail) =>
      stripGroupedTargetSidePrefix(detail, group.targetSide)
    );
    const detailSep = getSkillTextLocale() === "en" ? ", " : "、";
    pushLine(formatTargetFrameGroupIntro(group.frame, group.targetSide), true);
    lines.push(strippedDetails.join(detailSep));
  };

  for (const effect of mappableEffects) {
    if (!options?.showTargetFrame) {
      const multiLockLines = formatMultiLockDamageEffectLines(effect, def.target);
      if (multiLockLines) {
        flushTargetFrameGroup();
        if (scopePrefix && !scopeApplied) {
          lines.push(`${scopePrefix}${multiLockLines[0]}`);
          scopeApplied = true;
          lines.push(...multiLockLines.slice(1));
        } else {
          lines.push(...multiLockLines);
        }
        continue;
      }
    }

    const detailOptions: ActiveEffectDetailOptions = {
      compact: true,
      scopePrefix,
      inheritTarget: def.target,
      inheritTargetShape: def.targetShape,
      inheritRange: def.range,
      inheritAoeRadiusPx: def.aoeRadiusPx,
      inheritHitCount: def.hitCount,
      inheritPierceDurationSec: def.pierceDurationSec,
      basicAttackRangePx: options?.basicAttackRangePx,
      showTargetFrame: options?.showTargetFrame,
    };
    const line = formatActiveEffectDetail(effect, detailOptions);
    if (!line) continue;
    const targetFrame = options?.showTargetFrame
      ? formatTargetFrameLabel(effect, detailOptions)
      : null;
    if (targetFrame) {
      const prefix = `${targetFrame} / `;
      if (line.startsWith(prefix)) {
        const detail = line.slice(prefix.length);
        const targetSide = resolveTargetSideLabel(
          resolveEffectTargetSpec(effect, def.target)
        );
        if (
          pendingTargetFrameGroup?.frame === targetFrame &&
          pendingTargetFrameGroup.targetSide === targetSide
        ) {
          pendingTargetFrameGroup.details.push(detail);
        } else {
          flushTargetFrameGroup();
          pendingTargetFrameGroup = {
            frame: targetFrame,
            details: [detail],
            targetSide,
          };
        }
        continue;
      }
    }
    flushTargetFrameGroup();
    pushLine(line);
  }

  flushTargetFrameGroup();

  if (options?.includeMaxCharges) {
    const maxChargesLine = formatActiveSkillMaxChargesLine(def);
    if (maxChargesLine) {
      lines.push(maxChargesLine);
    }
  }
  return lines;
}

function formatActiveSkillEffectBody(def: ActiveSkillDef): string {
  const specialLines = resolveActiveSkillSpecialEffectLines(def);
  if (specialLines) {
    return specialLines.join("、");
  }
  return formatActiveSkillDefaultEffectLines(def, { showTargetFrame: true }).join(
    "、"
  );
}

function formatTarget(
  spec: TargetSpec | undefined,
  fallback: TargetSpec
): string {
  return formatTargetLabel(spec ?? fallback);
}

function formatDispelPriorityLabel(
  priority: DispelPriority | undefined
): string {
  if (!priority || priority === "longest") return "";
  return ` ${DISPEL_PRIORITY_LABELS[priority]}優先`;
}

function formatDispelTagsLabel(tags: DebuffFilterTag[] | undefined): string {
  if (tags && tags.length > 0) {
    return tags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・");
  }
  return "全デバフ";
}

function formatPercent(value: number): string {
  const pct = value * 100;
  const roundedInt = Math.round(pct);
  if (Math.abs(pct - roundedInt) < 1e-9) {
    return `${roundedInt}%`;
  }
  const roundedOne = Math.round(pct * 10) / 10;
  return `${roundedOne}%`;
}

/** damageTaken multiplier → ダメージ軽減N% / 被ダメージ増加N% */
function formatDamageTakenMultiplierLabel(mul: number): string {
  if (mul < 1) {
    return phraseDamageReductionRate(formatPercent(1 - mul));
  }
  if (mul > 1) {
    if (getSkillTextLocale() === "en") {
      return `${formatPercent(mul - 1)} ${skillTerm("damageIncrease")}`;
    }
    return `${skillTerm("damageIncrease")}${formatPercent(mul - 1)}`;
  }
  return skillStatBuffTarget("damageTaken");
}

/** wardBarrier 等: 軽減率そのもの（0.1 = 10% 軽減） */
function formatDamageTakenReductionRateLabel(rate: number): string {
  return phraseDamageReductionRate(formatPercent(rate));
}

function formatAtkScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return skillStat("atk");
  return `${skillStat("atk")}${formatPercent(s)}`;
}

function formatDefScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return skillStat("def");
  return `${skillStat("def")}${formatPercent(s)}`;
}

function formatResourceAmount(amount: ResourceAmountSpec | undefined): string {
  if (!amount) return "—";
  switch (amount.kind) {
    case "atkBased": {
      const scale = amount.atkScale ?? 1;
      const offset = amount.atkOffset ?? 0;
      if (offset === 0) return formatAtkScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(${skillStat("atk")}${sign}${offset})${formatPercent(
        scale
      )}`;
    }
    case "defBased": {
      const scale = amount.defScale ?? 1;
      const offset = amount.defOffset ?? 0;
      if (offset === 0) return formatDefScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(${skillStat("def")}${sign}${offset})${formatPercent(
        scale
      )}`;
    }
    case "flat":
      return `固定${amount.flatAmount ?? 0}`;
    case "percentMaxHp": {
      const prefix = amount.maxHpRef === "self" ? "自身maxHp" : "maxHp";
      return `${prefix}×${formatPercent(amount.percentOfMaxHp ?? 0)}`;
    }
  }
}

function formatStatusStats(
  stat: StatBuffTarget | StatBuffTarget[] | undefined
): string {
  return asStatusEffectStatList(stat)
    .map((s) => skillStatBuffTarget(s))
    .join("・");
}

function formatStatWithModifier(
  stat: StatBuffTarget,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  const mul = multiplier ?? 1;
  const flat = flatBonus ?? 0;

  if (stat === "damageTaken") {
    if (mul === 1 && flat === 0) {
      return skillStatBuffTarget("damageTaken");
    }
    if (flat === 0) return formatDamageTakenMultiplierLabel(mul);
    if (mul === 1) {
      return `${skillStatBuffTarget("damageTaken")}${formatStatFlatSuffix(
        flat
      )}`;
    }
    return `( ${skillStatBuffTarget("damageTaken")}${formatStatFlatSuffix(
      flat
    )} ) ${formatDamageTakenMultiplierLabel(mul)}`;
  }

  const label = skillStat(stat);

  if (mul === 1 && flat === 0) return label;
  if (flat === 0) return formatStatMultiplierLabel(stat, mul);
  if (mul === 1) return `${label}${formatStatFlatSuffix(flat)}`;
  return `(${label}${formatStatFlatSuffix(flat)})${formatStatMultiplierSuffix(
    mul
  )}`;
}

function formatStatsWithModifier(
  stat: StatBuffTarget | StatBuffTarget[] | undefined,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  return formatStatBuffModifierEntries(
    parseStatBuffModifiers({
      buffStat: stat,
      buffMultiplier: multiplier,
      buffFlatBonus: flatBonus,
    }),
    formatStatWithModifier
  );
}

function formatBuffStatModifiersFromDef(def: {
  buffStatModifiers?: import("../battle/types.ts").StatBuffModifierEntry[];
  buffStat?: BuffTargetKind | BuffTargetKind[];
  buffMultiplier?: number;
  buffFlatBonus?: number;
}): string {
  return formatStatBuffModifierEntries(
    parseStatBuffModifiers(def),
    formatStatWithModifier
  );
}

function formatDebuffFilterTagProseLabel(tag: DebuffFilterTag): string {
  switch (tag) {
    case "bleed":
      return skillTerm("bleed");
    case "poison":
      return skillTerm("poison");
    case "seedFlame":
      return skillTerm("seedFlame");
    case "dot":
      return skillTerm("dot");
    default:
      return DEBUFF_FILTER_TAG_LABELS[tag];
  }
}

function formatDamageIncreaseConditionProse(
  conditions: DamageIncreaseCondition[]
): string | null {
  if (conditions.length !== 1) return null;
  const condition = conditions[0];
  switch (condition.kind) {
    case "debuff": {
      if (condition.tags.length !== 1) return null;
      const tag = formatDebuffFilterTagProseLabel(condition.tags[0]);
      if (condition.selfAppliedOnly) {
        return getSkillTextLocale() === "en"
          ? `If the target has self-applied ${tag}`
          : `対象に自身付与の${tag}が付与されているなら`;
      }
      return phraseIfTargetHasDebuff(tag);
    }
    case "targetHp": {
      const pct = Math.round(condition.maxHpRatio * 100);
      return phraseIfTargetHp(
        pct,
        condition.compare === "gte" ? "gte" : "lte",
      );
    }
    default:
      return null;
  }
}

function formatCompactDamageIncreaseBonusLine(
  spec: DamageIncreaseSpec | undefined
): string | null {
  if (!spec) return null;
  const conditionText = formatDamageIncreaseConditionProse(spec.conditions);
  if (!conditionText) return null;
  return phraseDamageIncreaseIfCondition(
    conditionText,
    formatPercent(spec.scale),
  );
}

function formatCompactBleedDotApplyLine(effect: SkillEffectDef): string | null {
  if (effect.type !== "debuff" || effect.debuffSubKind !== "dot") return null;
  const duration = effect.durationSec ?? effect.debuffDurationSec ?? 0;
  const flavor =
    effect.dotFlavor && getSkillTextLocale() === "en"
      ? formatDebuffFilterTagProseLabel(effect.dotFlavor)
      : effect.buffDisplayName ??
        (effect.dotFlavor
          ? formatDebuffFilterTagProseLabel(effect.dotFlavor)
          : null);
  if (!flavor) return null;
  if (effect.amount?.kind !== "atkBased") return null;
  const pct = formatPercent(effect.amount.atkScale ?? 1);
  return phraseApplyDotAfterAttack(
    duration,
    pct,
    effect.damageType,
    flavor,
  );
}

function formatCompactTimedEvasionBuffLine(
  effect: SkillEffectDef
): string | null {
  if (effect.type !== "buff" || effect.buffSubKind !== "evasion") return null;
  const duration = effect.buffDurationSec ?? 0;
  return phraseTimedEvasionBuff(duration, formatPercent(effect.chance ?? 0));
}

function formatCompactMoveThenDamageLine(
  move: SkillEffectDef,
  damage: SkillEffectDef
): string | null {
  if (move.type !== "move" || damage.type !== "damage") return null;
  if (move.moveMode !== "toAnchor") return null;
  const dmgSentence = formatCompactAtkBasedDamageSentence(
    damage.amount,
    damage.damageType
  );
  return phraseMoveBehindTargetThen(dmgSentence);
}

function tryFormatDamageThenBleedDotLines(
  effects: SkillEffectDef[]
): string[] | null {
  if (effects.length !== 2) return null;
  const [first, second] = effects;
  if (first.type !== "damage" || second.type !== "debuff") return null;
  if (second.debuffSubKind !== "dot") return null;
  const bleedLine = formatCompactBleedDotApplyLine(second);
  if (!bleedLine) return null;

  const lines: string[] = [
    formatCompactAtkBasedDamageSentence(first.amount, first.damageType),
  ];
  const bonusLine = formatCompactDamageIncreaseBonusLine(first.damageIncrease);
  if (bonusLine) lines.push(bonusLine);
  lines.push(bleedLine);
  return lines;
}

function tryFormatEvasionMoveStrikeLines(
  effects: SkillEffectDef[]
): string[] | null {
  if (effects.length !== 3) return null;
  const [evasion, move, damage] = effects;
  if (evasion.type !== "buff" || evasion.buffSubKind !== "evasion") return null;
  if (move.type !== "move" || move.moveMode !== "toAnchor") return null;
  if (damage.type !== "damage") return null;

  const evasionLine = formatCompactTimedEvasionBuffLine(evasion);
  const strikeLine = formatCompactMoveThenDamageLine(move, damage);
  if (!evasionLine || !strikeLine) return null;

  const lines = [evasionLine, strikeLine];
  const bonusLine = formatCompactDamageIncreaseBonusLine(damage.damageIncrease);
  if (bonusLine) lines.push(bonusLine);
  return lines;
}

function tryFormatPolishedSequentialEffectLines(
  def: ActiveSkillDef
): string[] | null {
  const effects = def.effect.filter(
    (effect) => effect.type !== "blockResonanceConsume"
  );
  return (
    tryFormatDamageThenBleedDotLines(effects) ??
    tryFormatEvasionMoveStrikeLines(effects)
  );
}

function formatDamageIncreaseCondition(
  condition: DamageIncreaseCondition
): string {
  switch (condition.kind) {
    case "debuff": {
      const tags = condition.tags
        .map((t) => DEBUFF_FILTER_TAG_LABELS[t])
        .join("・");
      const prefix = condition.selfAppliedOnly ? "自身付与の" : "";
      return `${prefix}${tags}`;
    }
    case "targetHp":
      return `対象HP${formatPercent(condition.maxHpRatio)}以下`;
    case "attackType": {
      const parts: string[] = [];
      if (condition.physical) parts.push("物理");
      if (condition.magic) parts.push("魔法");
      if (condition.melee) parts.push("近接");
      if (condition.ranged) parts.push("遠隔");
      return parts.length > 0 ? `対象${parts.join("・")}` : "対象攻撃種別";
    }
  }
}

function formatDamageIncreaseSpec(
  spec: DamageIncreaseSpec | undefined
): string {
  if (!spec) return "";
  const cond = spec.conditions.map(formatDamageIncreaseCondition).join("・");
  const base = `特効×${spec.scale}`;
  return cond ? `${base}（${cond}）` : base;
}

function formatSpecialEffectSpec(
  applyTo: PassiveSkillDef["specialEffectApplyTo"] | undefined,
  spec: DamageIncreaseSpec | undefined
): string {
  if (!spec) return "";
  const head = `特効(${SPECIAL_EFFECT_APPLY_TO_LABELS[applyTo ?? "damage"]})`;
  const body = formatDamageIncreaseSpec(spec);
  return body ? `${head} ${body}` : head;
}

function formatBuffTargetStats(
  stat: BuffTargetKind | BuffTargetKind[] | undefined,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  const stats = filterStatBuffTargets(stat);
  if (stats.length === 0) return "—";
  return formatStatsWithModifier(stats, multiplier, flatBonus);
}

function compactStatEffectLabel(label: string): string {
  return label
    .replace(/\s+×/g, "×")
    .replace(/\s+\+/g, "+")
    .replace(/\+\s+/g, "+")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

function formatDefenseIgnoreModifierSegments(
  spec: PassiveSkillDef["defenseIgnore"] | SkillEffectDef["defenseIgnore"]
): string[] {
  if (!spec) return [];
  const segments: string[] = [];
  if (spec.def) {
    const value =
      spec.def.mode === "flat"
        ? String(spec.def.amount)
        : formatPercent(spec.def.amount);
    segments.push(
      getSkillTextLocale() === "en"
        ? `DEF Ignore ${value}`
        : `${resolveGameTermTitle("defenseIgnoreDef")} ${value}`
    );
  }
  if (spec.reg) {
    const value = formatPercent(spec.reg.percent);
    segments.push(
      getSkillTextLocale() === "en" ? `REG Ignore ${value}` : `REG無視 ${value}`
    );
  }
  if (spec.chance !== undefined && spec.chance < 1) {
    segments.unshift(
      getSkillTextLocale() === "en"
        ? `${formatPercent(spec.chance)} chance`
        : `${formatPercent(spec.chance)}で`
    );
  }
  return segments;
}

function formatDamagePierceModifierSegments(effect: SkillEffectDef): string[] {
  if (effect.type !== "damage") return [];
  const segments: string[] = [];
  if (effect.ignoreDamageTakenReduction) {
    segments.push(
      getSkillTextLocale() === "en" ? "DR Ignore" : "軽減無視"
    );
  }
  if (effect.pierceBlock) {
    segments.push(getSkillTextLocale() === "en" ? "Block Pierce" : "block貫通");
  }
  if (effect.pierceWard) {
    segments.push(getSkillTextLocale() === "en" ? "Ward Pierce" : "障壁貫通");
  }
  if (effect.pierceBarrier) {
    segments.push(getSkillTextLocale() === "en" ? "Barrier Pierce" : "バリア無視");
  }
  return segments;
}

function formatDefenseIgnoreSpec(
  spec: PassiveSkillDef["defenseIgnore"] | SkillEffectDef["defenseIgnore"]
): string {
  const segments = formatDefenseIgnoreModifierSegments(spec);
  if (segments.length === 0) return "";
  return segments.join(" ");
}

function formatTargetShape(effect: SkillEffectDef): string {
  const shape = effect.targetShape ?? "single";
  const parts: string[] = [TARGET_SHAPE_LABELS[shape]];

  switch (shape) {
    case "aoe":
      if (effect.aoeRadiusPx !== undefined) {
        parts.push(`±${formatUiDistanceValue(effect.aoeRadiusPx)}`);
      }
      break;
    case "single":
    case "multiLock":
      if (effect.hitCount !== undefined && effect.hitCount > 1) {
        parts.push(`×${effect.hitCount}`);
      }
      break;
    case "pierce":
      if (
        effect.pierceDurationSec !== undefined &&
        effect.pierceDurationSec > 0
      ) {
        parts.push(formatSecondsLabel(effect.pierceDurationSec));
      }
      break;
    case "chain":
      if (effect.chainCount !== undefined) {
        parts.push(`×${effect.chainCount}`);
      }
      break;
    case "scatter":
      if (effect.scatterHitCount !== undefined) {
        parts.push(`×${effect.scatterHitCount}`);
      }
      if (effect.scatterRadiusPx !== undefined) {
        parts.push(`半径${formatUiDistanceValue(effect.scatterRadiusPx)}`);
      }
      break;
  }

  return parts.join(" ");
}

type ActiveEffectDetailOptions = {
  compact?: boolean;
  scopePrefix?: string;
  inheritTarget?: TargetSpec;
  inheritTargetShape?: TargetShape;
  inheritRange?: number;
  inheritAoeRadiusPx?: number;
  inheritHitCount?: number;
  inheritPierceDurationSec?: number;
  basicAttackRangePx?: number;
};

function isSelfOriginDistanceTarget(
  spec: TargetSpec | undefined
): boolean {
  return spec?.kind === "distance" && spec.order === "selfOrigin";
}

function formatAoeOrSurroundingFrameLabel(
  radiusPx: number | undefined,
  targetSpec: TargetSpec | undefined
): string {
  const locale = getSkillTextLocale();
  const range =
    radiusPx !== undefined ? ` ${formatUiDistanceValue(radiusPx)}` : "";
  if (isSelfOriginDistanceTarget(targetSpec)) {
    return `${locale === "en" ? "Nearby" : "周囲"}${range}`;
  }
  return `AoE${range}`;
}

function formatPlacedFieldFrameLabel(
  effect: Extract<SkillEffectDef, { type: "placedField" }>
): string {
  const locale = getSkillTextLocale();
  const range =
    effect.fieldRadiusPx !== undefined
      ? ` ${formatUiDistanceValue(effect.fieldRadiusPx)}`
      : "";
  return locale === "en" ? `Field${range}` : `地点${range}`;
}

function formatTargetFrameLabel(
  effect: SkillEffectDef,
  options?: ActiveEffectDetailOptions
): string | null {
  const shape = effect.targetShape ?? options?.inheritTargetShape ?? "single";
  const locale = getSkillTextLocale();

  switch (shape) {
    case "multiLock": {
      const hitCount = effect.hitCount ?? options?.inheritHitCount;
      const count = hitCount !== undefined && hitCount > 1 ? ` ${hitCount}` : "";
      return `${locale === "en" ? "Multi-Lock" : "マルチロック"}${count}`;
    }
    case "aoe": {
      const targetSpec = resolveEffectTargetSpec(
        effect,
        options?.inheritTarget
      );
      return formatAoeOrSurroundingFrameLabel(
        effect.aoeRadiusPx ?? options?.inheritAoeRadiusPx,
        targetSpec
      );
    }
    case "pierce": {
      const explicitRange = effect.range ?? options?.inheritRange;
      const baseRange = options?.basicAttackRangePx;
      if (baseRange !== undefined) {
        const effectiveRange = explicitRange ?? baseRange;
        const rangeLabel = ` ${formatPierceRangeSummary(effectiveRange, locale)}`;
        return `${locale === "en" ? "Pierce" : "貫通"}${rangeLabel}`;
      }
      return locale === "en" ? "Pierce" : "貫通";
    }
    default:
      return null;
  }
}

function shouldShowTargetSideInFrameDetail(
  effect: SkillEffectDef,
  options?: ActiveEffectDetailOptions
): boolean {
  const shape = effect.targetShape ?? options?.inheritTargetShape ?? "single";
  return shape === "aoe" || shape === "multiLock";
}

function formatTargetFramedDetail(
  detail: string,
  effect: SkillEffectDef,
  targetSpec: TargetSpec,
  options?: ActiveEffectDetailOptions
): string {
  if (
    options?.compact &&
    (effect.type === "damage" ||
      effect.type === "dot" ||
      (effect.type === "buff" && effect.buffSubKind === "barrier") ||
      (effect.type === "heal" && effect.healSubKind === "hot"))
  ) {
    return detail;
  }
  if (!shouldShowTargetSideInFrameDetail(effect, options)) return detail;
  const side = resolveTargetSideLabel(targetSpec);
  if (!side) return detail;
  const noun = targetSideNoun(side);
  const possessive = targetSidePossessivePrefix(side);
  const apply = targetSideApplyPrefix(side);
  if (
    detail.startsWith(noun) ||
    detail.startsWith(possessive) ||
    detail.startsWith(apply)
  ) {
    return detail;
  }

  switch (effect.type) {
    case "buff":
      if (effect.buffSubKind === "barrier") {
        return `${apply}${detail}`;
      }
      return `${possessive}${detail}`;
    case "debuff":
      return `${possessive}${detail}`;
    case "heal":
    case "barrier":
      return `${apply}${detail}`;
    case "damage":
    case "dot":
    case "stun":
    case "knockback":
    case "dispel":
    case "block":
      return `${apply}${detail}`;
    default:
      return detail;
  }
}

function stripGroupedTargetSidePrefix(
  detail: string,
  side: "ally" | "enemy" | null
): string {
  if (!side) return detail;
  const prefixes = [targetSidePossessivePrefix(side), targetSideApplyPrefix(side)];
  for (const prefix of prefixes) {
    if (detail.startsWith(prefix)) return detail.slice(prefix.length);
  }
  return detail;
}

function formatTargetFrameGroupIntro(
  frame: string,
  side: "ally" | "enemy" | null
): string {
  if (side) {
    if (getSkillTextLocale() === "en") {
      return `${frame} / ${
        side === "ally" ? "Grants the following effects to allies" : "Applies the following effects to enemies"
      }`;
    }
    return `${frame} / ${targetSideNoun(side)}に以下の効果を${
      side === "ally" ? "付与" : "適用"
    }`;
  }
  return getSkillTextLocale() === "en"
    ? `${frame}: Applies the following effects`
    : `${frame}で以下の効果を適用する`;
}

function formatPassiveTargetFrame(
  shape: TargetShape | undefined,
  options?: {
    aoeRadiusPx?: number;
    hitCount?: number;
    pierceDurationSec?: number;
    targetRule?: TargetSpec;
  }
): string | null {
  switch (shape ?? "single") {
    case "multiLock": {
      const count =
        options?.hitCount !== undefined && options.hitCount > 1
          ? ` ${options.hitCount}`
          : "";
      return `${getSkillTextLocale() === "en" ? "Multi-Lock" : "マルチロック"}${count}`;
    }
    case "aoe": {
      return formatAoeOrSurroundingFrameLabel(
        options?.aoeRadiusPx,
        options?.targetRule
      );
    }
    case "pierce":
      return getSkillTextLocale() === "en" ? "Pierce" : "貫通";
    default:
      return null;
  }
}

function formatFramedPassiveLine(
  frame: string | null,
  targetRule: TargetSpec | undefined,
  detail: string
): string {
  if (!frame) return detail;
  const side = targetRule ? resolveTargetSideLabel(targetRule) : null;
  if (!side) return `${frame} / ${detail}`;
  return `${frame} / ${targetSidePossessivePrefix(side)}${detail}`;
}

/** 反撃射程: 0 / 未指定 = 持有者 traits.rangePx（エディタ +0 と同義） */
function formatCounterRangeSummary(range: number | undefined): string {
  if (range === undefined || range === 0) return "射程+0";
  return `射程${formatUiDistanceValue(range)}`;
}

/** Pierce 射程: 効果距離の絶対値（例: 貫通 3） */
function formatPierceRangeSummary(
  effectiveRangePx: number,
  _locale: ReturnType<typeof getSkillTextLocale> = getSkillTextLocale()
): string {
  return formatUiDistanceValue(effectiveRangePx);
}

function formatCounterResponse(response: CounterResponseDef): string {
  switch (response.kind) {
    case "damage": {
      if (response.amount?.kind === "atkBased") {
        return formatCompactAtkBasedDamageSentence(
          response.amount,
          response.damageType
        );
      }
      const dmgType = response.damageType
        ? DAMAGE_TYPE_LABELS[response.damageType]
        : "";
      const amount = formatResourceAmount(response.amount);
      return dmgType ? `${dmgType}${amount}` : amount;
    }
    case "debuff":
      return `デバフ${formatStatusStats(response.debuffStat)} ${formatSecondsLabel(
        response.debuffDurationSec
      )}`;
    case "dot":
      return `DoT×${response.powerMultiplier} ${formatSecondsLabel(
        response.durationSec
      )}`;
    case "stun":
      return phraseStunDuration(response.durationSec);
    case "knockback":
      return `ノック${formatUiDistanceValue(response.distancePx)}+移動硬直${formatSecondsLabel(
        KNOCKBACK_MOVE_LOCK_SEC
      )}`;
  }
}

function formatActiveEffectDetail(
  effect: SkillEffectDef,
  options?: ActiveEffectDetailOptions
): string {
  const compact = options?.compact ?? false;
  const inheritTarget = options?.inheritTarget;

  if (effect.type === "blockResonanceConsume") {
    return "";
  }
  if (effect.type === "conditionalEffect") {
    const conditionCount = effect.conditions.length;
    const thenSummary = effect.thenEffects
      .map((branch) => formatActiveEffectDetail(branch))
      .join(" / ");
    const elseSummary = effect.elseEffects
      .map((branch) => formatActiveEffectDetail(branch))
      .join(" / ");
    return `条件×${conditionCount} → 成立: ${thenSummary} / 不成立: ${elseSummary}`;
  }

  const targetSpec = resolveEffectTargetSpec(effect, inheritTarget);
  const target = formatTarget(
    effect.target ?? inheritTarget,
    defaultTargetForEffectType(effect.type)
  );
  const shape = formatTargetShape(effect);
  const targetFrame =
    compact && options?.showTargetFrame
      ? effect.type === "placedField"
        ? formatPlacedFieldFrameLabel(effect)
        : formatTargetFrameLabel(effect, options)
      : null;
  const extras: string[] = [];

  switch (effect.type) {
    case "damage": {
      const dmgType = effect.damageType
        ? DAMAGE_TYPE_LABELS[effect.damageType]
        : "";
      const amount = formatResourceAmount(effect.amount);
      if (compact) {
        const segments: string[] = [
          ...formatDefenseIgnoreModifierSegments(effect.defenseIgnore),
          ...formatDamagePierceModifierSegments(effect),
        ];
        if (targetFrame && effect.amount?.kind === "atkBased") {
          segments.push(
            formatCompactAtkBasedDamageSentence(effect.amount, effect.damageType)
          );
        } else if (
          effect.amount?.kind === "atkBased" &&
          isOmittableDefaultEnemyTarget(targetSpec)
        ) {
          const singleSentence = formatCompactSingleTargetDamageSentence(
            effect,
            targetSpec
          );
          segments.push(
            singleSentence ??
              formatCompactAtkBasedDamageSentence(
                effect.amount,
                effect.damageType
              )
          );
        } else {
          const hint = formatCompactTargetHint(targetSpec);
          segments.push(`${hint}${dmgType}${amount}`);
        }
        const inc =
          formatCompactDamageIncreaseBonusLine(effect.damageIncrease) ??
          formatDamageIncreaseSpec(effect.damageIncrease);
        if (inc) segments.push(inc);
        extras.push(...segments);
      } else {
        const power = dmgType ? `${dmgType} ${amount}` : amount;
        extras.push(power);
        const inc =
          formatCompactDamageIncreaseBonusLine(effect.damageIncrease) ??
          formatDamageIncreaseSpec(effect.damageIncrease);
        if (inc) extras.push(inc);
        const ign = formatDefenseIgnoreSpec(effect.defenseIgnore);
        if (ign) extras.push(ign);
        const pierceLabels: string[] = [];
        if (effect.ignoreDamageTakenReduction) pierceLabels.push("DR無視");
        if (effect.pierceBlock) pierceLabels.push("block貫通");
        if (effect.pierceWard) pierceLabels.push("障壁貫通");
        if (effect.pierceBarrier) pierceLabels.push("barrier貫通");
        if (pierceLabels.length > 0) extras.push(pierceLabels.join("・"));
      }
      break;
    }
    case "heal":
      if (effect.healSubKind === "hot") {
        extras.push(
          `${HEAL_SUB_KIND_LABELS.hot} ${formatResourceAmount(effect.amount)} ${formatSecondsLabel(
            effect.durationSec ?? 0
          )}`
        );
        if (effect.stackOnApply) {
          extras.push(`薬効+${effect.stackOnApply}`);
        }
        if (effect.potencyStackScale) {
          extras.push("消費スタック比例");
        }
        if (effect.buffDisplayName) {
          extras.push(effect.buffDisplayName);
        }
      } else if (effect.healSubKind === "dispel") {
        extras.push(
          `${HEAL_SUB_KIND_LABELS.dispel} ${formatDispelTagsLabel(
            effect.dispelTags
          )} ×${effect.dispelCount ?? 0}${formatDispelPriorityLabel(
            effect.dispelPriority
          )}`
        );
      } else if (compact) {
        if (
          (effect.healSubKind ?? "instant") === "instant" &&
          effect.amount?.kind === "atkBased" &&
          (isDefaultLowestHpAllyTarget(targetSpec) ||
            isAllAllyTarget(targetSpec))
        ) {
          extras.push(
            formatCompactAtkBasedHealSentence(effect.amount, targetSpec)
          );
        } else {
          const hint =
            isAllAllyTarget(targetSpec) ? "" : formatCompactTargetHint(targetSpec);
          extras.push(`${hint}${formatResourceAmount(effect.amount)}回復`);
        }
      } else {
        extras.push(
          `${
            HEAL_SUB_KIND_LABELS[effect.healSubKind ?? "instant"]
          } ${formatResourceAmount(effect.amount)}`
        );
      }
      const healInc = formatSpecialEffectSpec("heal", effect.damageIncrease);
      if (healInc) extras.push(healInc);
      break;
    case "buff":
      if (effect.buffSubKind === "barrier") {
        if (compact) {
          extras.push(
            formatCompactBarrierBuffLabel(effect.amount, effect.barrierStack)
          );
        } else {
          extras.push(
            `${BUFF_SUB_KIND_LABELS.barrier} ${formatResourceAmount(
              effect.amount
            )}${effect.barrierStack ? "（加算）" : ""}`
          );
        }
      } else if (effect.buffSubKind === "wardBarrier") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.wardBarrier} ×${
            effect.stacks ?? 1
          }（${formatDamageTakenReductionRateLabel(
            effect.damageReductionRatio ?? 0.1
          )}）`
        );
      } else if (effect.buffSubKind === "block") {
        if (compact) {
          extras.push(phraseBlockRateBuff(formatPercent(effect.chance ?? 0)));
        } else {
          extras.push(
            `${BUFF_SUB_KIND_LABELS.block} ${formatPercent(
              effect.chance ?? 0
            )} ${formatSecondsLabel(effect.buffDurationSec ?? 0)}`
          );
        }
      } else if (effect.buffSubKind === "evasion") {
        const evasionLine = formatCompactTimedEvasionBuffLine(effect);
        if (compact && evasionLine) {
          extras.push(evasionLine);
        } else {
          extras.push(
            `${BUFF_SUB_KIND_LABELS.evasion} ${formatPercent(
              effect.chance ?? 0
            )} ${formatSecondsLabel(effect.buffDurationSec ?? 0)}`
          );
        }
      } else if (effect.buffSubKind === "damageDelay") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.damageDelay} ${formatPercent(
            effect.ratio ?? 0
          )} ${formatSecondsLabel(effect.buffDurationSec ?? 0)}`
        );
      } else if (effect.buffSubKind === "allyAttackFollowUp") {
        const radius = effect.allyFollowUpRadiusPx ?? 70;
        extras.push(
          `${BUFF_SUB_KIND_LABELS.allyAttackFollowUp} ${formatSecondsLabel(
            effect.buffDurationSec ?? 8
          )} 半径${formatUiDistanceValue(radius)} ${formatStatMultiplierLabel(
            "def",
            effect.followUpDefDebuffMultiplier ?? 0.95
          )}`
        );
      } else {
        const statLabel = formatBuffTargetStats(
          effect.buffStat,
          effect.buffMultiplier,
          effect.buffFlatBonus
        );
        if (compact) {
          extras.push(compactStatEffectLabel(statLabel));
        } else {
          extras.push(
            `${
              BUFF_SUB_KIND_LABELS[effect.buffSubKind ?? "stat"]
            } ${statLabel} ${formatSecondsLabel(effect.buffDurationSec ?? 0)}`
          );
        }
      }
      break;
    case "basicAttackTransform": {
      if (compact) {
        const parts: string[] = [];
        if (
          effect.hitCountMultiplier !== undefined &&
          effect.hitCountMultiplier > 1
        ) {
          parts.push(
            phraseBasicAttackMultiHit(effect.hitCountMultiplier)
          );
        }
        if (effect.primaryEffectOverride !== undefined) {
          const override = effect.primaryEffectOverride;
          if (override.type === "damage") {
            const dmgType = override.damageType
              ? DAMAGE_TYPE_LABELS[override.damageType]
              : "";
            parts.push(
              `通常攻撃→${dmgType}${formatResourceAmount(override.amount)}`
            );
          } else if (override.type === "heal") {
            parts.push(`通常攻撃→${formatResourceAmount(override.amount)}回復`);
          }
        } else if (effect.primaryPatch !== undefined) {
          const patchParts: string[] = ["通常攻撃→"];
          if (effect.primaryPatch.damageType !== undefined) {
            patchParts.push(DAMAGE_TYPE_LABELS[effect.primaryPatch.damageType]);
          }
          if (effect.primaryPatch.amount?.atkScale !== undefined) {
            patchParts.push(
              formatAtkScale(effect.primaryPatch.amount.atkScale)
            );
          }
          if (effect.primaryPatch.amount?.defScale !== undefined) {
            patchParts.push(
              formatDefScale(effect.primaryPatch.amount.defScale)
            );
          }
          parts.push(patchParts.join(""));
        }
        if (
          effect.appendEffects !== undefined &&
          effect.appendEffects.length > 0
        ) {
          for (const appendEffect of effect.appendEffects) {
            parts.push(
              formatActiveEffectDetail(appendEffect, {
                compact: true,
                inheritTarget: appendEffect.target,
              })
            );
          }
        }
        extras.push(parts.filter(Boolean).join("、"));
      } else {
        const parts: string[] = [
          EDITOR_ACTIVE_EFFECT_CATEGORY_LABELS.basicAttackTransform,
        ];
        if (effect.hitCountMultiplier !== undefined) {
          parts.push(`${effect.hitCountMultiplier}回`);
        }
        if (effect.primaryEffectOverride !== undefined) {
          const overrideParts: string[] = [
            effect.primaryEffectOverride.type === "heal"
              ? "通常攻撃→回復"
              : "通常攻撃置換",
          ];
          if (
            effect.primaryEffectOverride.type === "damage" &&
            effect.primaryEffectOverride.damageType !== undefined
          ) {
            overrideParts.push(
              DAMAGE_TYPE_LABELS[effect.primaryEffectOverride.damageType]
            );
          }
          if (effect.primaryEffectOverride.amount?.atkScale !== undefined) {
            overrideParts.push(
              formatAtkScale(effect.primaryEffectOverride.amount.atkScale)
            );
          }
          if (effect.primaryEffectOverride.amount?.defScale !== undefined) {
            overrideParts.push(
              formatDefScale(effect.primaryEffectOverride.amount.defScale)
            );
          }
          parts.push(overrideParts.join(" "));
        }
        if (effect.primaryPatch !== undefined) {
          const patchParts: string[] = [];
          if (effect.primaryPatch.damageType !== undefined) {
            patchParts.push(DAMAGE_TYPE_LABELS[effect.primaryPatch.damageType]);
          }
          if (effect.primaryPatch.amount?.atkScale !== undefined) {
            patchParts.push(
              formatAtkScale(effect.primaryPatch.amount.atkScale)
            );
          }
          if (effect.primaryPatch.hitCount !== undefined) {
            patchParts.push(`${effect.primaryPatch.hitCount}Hit`);
          }
          if (effect.primaryPatch.hitDurationSec !== undefined) {
            patchParts.push(formatSecondsLabel(effect.primaryPatch.hitDurationSec));
          }
          if (patchParts.length > 0) {
            parts.push(patchParts.join(" "));
          }
        }
        if (
          effect.appendEffects !== undefined &&
          effect.appendEffects.length > 0
        ) {
          parts.push(`+${effect.appendEffects.length}効果`);
        }
        extras.push(`${parts.join(" ")} ${formatSecondsLabel(effect.buffDurationSec ?? 0)}`);
      }
      break;
    }
    case "debuff":
      if (effect.debuffSubKind === "dot") {
        const bleedApplyLine = compact
          ? formatCompactBleedDotApplyLine(effect)
          : null;
        if (bleedApplyLine) {
          extras.push(bleedApplyLine);
        } else {
          const dmgType = effect.damageType
            ? DAMAGE_TYPE_LABELS[effect.damageType]
            : "";
          const amountScale =
            effect.amount?.kind === "atkBased"
              ? effect.amount.atkScale
              : effect.powerMultiplier;
          const power = dmgType
            ? `${dmgType} ×${amountScale ?? 0}`
            : `×${amountScale ?? 0}`;
          const flavorLabel = effect.dotFlavor
            ? DOT_FLAVOR_LABELS[effect.dotFlavor]
            : DEBUFF_SUB_KIND_LABELS.dot;
          extras.push(`${flavorLabel} ${power} ${formatSecondsLabel(effect.durationSec ?? 0)}`);
          if (effect.buffDisplayName) {
            extras.push(effect.buffDisplayName);
          }
        }
        const inc =
          formatCompactDamageIncreaseBonusLine(effect.damageIncrease) ??
          formatDamageIncreaseSpec(effect.damageIncrease);
        if (inc) extras.push(inc);
        const ign = formatDefenseIgnoreSpec(effect.defenseIgnore);
        if (ign) extras.push(ign);
      } else if (effect.debuffSubKind === "stun") {
        extras.push(
          `${DEBUFF_SUB_KIND_LABELS.stun} ${formatSecondsLabel(effect.durationSec ?? 0)}`
        );
      } else {
        const statLabel = formatStatsWithModifier(
          effect.debuffStat,
          effect.debuffMultiplier,
          effect.debuffFlatBonus
        );
        extras.push(
          `${
            DEBUFF_SUB_KIND_LABELS[effect.debuffSubKind ?? "stat"]
          } ${statLabel} ${formatSecondsLabel(effect.debuffDurationSec ?? 0)}`
        );
      }
      break;
    case "dot": {
      const dmgType = effect.damageType
        ? DAMAGE_TYPE_LABELS[effect.damageType]
        : "";
      const power = dmgType
        ? `${dmgType} ×${effect.powerMultiplier}`
        : `×${effect.powerMultiplier}`;
      extras.push(`${power} ${formatSecondsLabel(effect.durationSec)}`);
      const inc = formatDamageIncreaseSpec(effect.damageIncrease);
      if (inc) extras.push(inc);
      const ign = formatDefenseIgnoreSpec(effect.defenseIgnore);
      if (ign) extras.push(ign);
      break;
    }
    case "barrier": {
      extras.push(formatResourceAmount(effect.amount));
      break;
    }
    case "move": {
      const mode =
        effect.moveMode === "toAnchor"
          ? effect.anchorOffsetPx !== undefined && effect.anchorOffsetPx !== 0
            ? `アンカー ${formatSignedUiDistanceValue(effect.anchorOffsetPx)}`
            : "アンカー"
          : "接敵";
      extras.push(`${mode} ${formatSecondsLabel(effect.moveDurationSec)}`);
      break;
    }
    case "stun":
      extras.push(
        compact
          ? phraseStunDuration(effect.durationSec)
          : formatSecondsLabel(effect.durationSec)
      );
      break;
    case "knockback":
      extras.push(
        compact
          ? phraseKnockbackLabel()
          : `${formatUiDistanceValue(effect.distancePx)}+移動硬直${formatSecondsLabel(
            KNOCKBACK_MOVE_LOCK_SEC
          )}`
      );
      break;
    case "dispel": {
      extras.push(
        `${formatDispelTagsLabel(effect.dispelTags)} ×${
          effect.dispelCount
        }${formatDispelPriorityLabel(effect.dispelPriority)}`
      );
      break;
    }
    case "block":
      extras.push(
        `${formatPercent(effect.blockChance)} ${formatSecondsLabel(effect.durationSec)}`
      );
      break;
    case "counter": {
      if (compact) {
        const responseParts = effect.responses.map(formatCounterResponse);
        extras.push(
          joinSkillCardSegments(
            phraseCounterLabel(),
            ...responseParts,
            effect.durationSec !== undefined
              ? formatSecondsLabel(effect.durationSec)
              : null,
            formatCounterRangeSummary(effect.range) || null
          )
        );
      } else {
        const responseParts = effect.responses.map(formatCounterResponse);
        extras.push(
          [
            responseParts.join(" / "),
            formatSecondsLabel(effect.durationSec),
            formatCounterRangeSummary(effect.range),
          ]
            .filter(Boolean)
            .join(" ")
        );
      }
      break;
    }
    case "enemyReelIn":
      break;
    case "arenaDominance": {
      if (effect.durationSec !== undefined) {
        extras.push(formatSecondsLabel(effect.durationSec));
      }
      extras.push("闘士の指名");
      extras.push(`闘技士以外${resolveGameTermTitle("damageReduction")}50%`);
      extras.push("味方支援拒否");
      if (effect.nonMarkDamageMultiplier !== undefined) {
        extras.push(
          `非指名${formatDamageTakenMultiplierLabel(
            effect.nonMarkDamageMultiplier
          )}`
        );
      }
      break;
    }
    case "grantNextOutgoingDamage": {
      if (effect.nextOutgoingDamageMultiplier !== undefined) {
        extras.push(`次与ダメ×${effect.nextOutgoingDamageMultiplier}`);
      }
      break;
    }
    case "placedField": {
      extras.push(
        `${formatUiDistanceValue(effect.fieldRadiusPx)}/${formatSecondsLabel(effect.fieldDurationSec)}`
      );
      if (effect.stayTickIntervalSec !== undefined) {
        extras.push(`滞在${formatSecondsLabel(effect.stayTickIntervalSec)}`);
      }
      break;
    }
    case "dotCompress":
      extras.push(`圧縮×${effect.compressRatio}`);
      break;
    case "dotExtend":
      extras.push(`延長×${effect.extendRatio}`);
      break;
    case "dotHarvest":
      extras.push(`収穫${Math.round(effect.harvestRatio * 100)}%`);
      break;
    case "poisonSpread":
      extras.push(
        `蔓延${formatUiDistanceValue(effect.spreadRadiusPx)}/${Math.round(
          effect.spreadDurationRatio * 100
        )}%`
      );
      break;
  }

  if (effect.range !== undefined && effect.type !== "counter" && !compact) {
    extras.push(`射程${formatUiDistanceValue(effect.range)}`);
  }

  const kindLabel = formatEffectKindLabel(effect.type);
  const detail = compact
    ? joinSkillCardSegments(...extras)
    : extras.filter(Boolean).join(" ");
  if (compact) {
    if (targetFrame) {
      return joinSkillCardSegments(
        targetFrame,
        formatTargetFramedDetail(detail, effect, targetSpec, options)
      );
    }
    if (
      options?.scopePrefix &&
      targetSpec.kind === "all" &&
      targetSpec.side === "ally"
    ) {
      return detail;
    }
    if (isSelfTargetSpec(targetSpec)) {
      return detail;
    }
    if (
      options?.scopePrefix &&
      targetSpec.kind === "distance" &&
      targetSpec.order === "selfOrigin"
    ) {
      return detail;
    }
    return detail;
  }
  return `${kindLabel} ${detail} → ${target} / ${shape}`.trim();
}

function formatEffectKindLabel(kind: SkillEffectDef["type"]): string {
  switch (kind) {
    case "damage":
      return "ダメージ";
    case "heal":
      return "回復";
    case "buff":
      return "バフ";
    case "debuff":
      return "デバフ";
    case "dot":
      return "DoT";
    case "barrier":
      return "バリア";
    case "move":
      return "移動";
    case "stun":
      return "スタン";
    case "knockback":
      return "ノックバック";
    case "dispel":
      return "デバフ解除";
    case "block":
      return "ブロック";
    case "counter":
      return "反撃";
    case "conditionalEffect":
      return "条件分岐";
    case "herbalPotencyConsume":
      return "薬効消費";
    case "blockResonanceConsume":
      return "迎撃消費";
    case "enemyReelIn":
      return "敵引き寄せ";
    case "arenaDominance":
      return "闘技場の掟";
    case "grantNextOutgoingDamage":
      return "次のダメージ増加";
    case "placedField":
      return "持続罠";
    case "dotCompress":
      return "DoT圧縮";
    case "dotExtend":
      return "DoT延長";
    case "dotHarvest":
      return "DoT収穫";
    case "poisonSpread":
      return "毒蔓延";
    case "basicAttackTransform":
      return "通常攻撃変形";
    default:
      return kind;
  }
}

function formatPassiveEffect(
  effect: PassiveEffectKind,
  def: PassiveSkillDef
): string {
  const legacy = def as PassiveSkillDef & {
    evasionChance?: number;
    blockChance?: number;
    damageIncrease?: DamageIncreaseSpec;
    percent?: number;
    extendSec?: number;
    durationMultiplier?: number;
    counterChance?: number;
  };
  switch (effect) {
    case "targetRuleOverride":
      return formatTargetRuleOverridePassive(def);
    case "evasionChance":
      return phraseEvasionBuff(formatPercent(legacy.evasionChance ?? 0));
    case "block":
      return phraseBlockChance(formatPercent(legacy.blockChance ?? 0));
    case "damageIncrease":
      return (
        formatSpecialEffectSpec("damage", legacy.damageIncrease) ||
        "特効ダメージ"
      );
    case "damageReduction": {
      const percent = def.damageReductionPercent ?? 0;
      const rule = def.damageReductionTargetRule ?? { kind: "self" };
      const shape = def.damageReductionTargetShape ?? "single";
      if (
        rule.kind === "distance" &&
        rule.side === "ally" &&
        rule.order === "selfOrigin" &&
        shape === "aoe"
      ) {
        return formatFramedPassiveLine(
          formatPassiveTargetFrame(shape, {
            aoeRadiusPx: def.damageReductionAoeRadiusPx,
            targetRule: rule,
          }),
          rule,
          phraseDamageReductionRate(formatPercent(percent))
        );
      }
      if (rule.kind === "self" && shape === "single") {
        return phraseSelfDamageReduction(formatPercent(percent));
      }
      return `${phraseDamageReductionRate(formatPercent(percent))} → ${formatTarget(rule, { kind: "self" })}（${[
        formatTargetShape(passiveDamageReductionToEffectDef(def)),
        def.damageReductionRange !== undefined
          ? formatUiDistanceValue(def.damageReductionRange)
          : null,
        "常時",
      ]
        .filter(Boolean)
        .join(" · ")}）`;
    }
    case "defenseIgnore":
      return formatPassiveDefenseIgnore(def);
    case "ignoredDefBonusDamage":
      return def.ignoredDefBonusScale !== undefined
        ? `無視防御力${formatPercent(def.ignoredDefBonusScale)} 追加ダメ`
        : "無視DEFボーナス";
    case "bonusBasicAttackOnHit": {
      const chance = def.chance ?? 0.5;
      const conditions = def.bonusBasicAttackConditions ?? [];
      const parts: string[] = [];
      if (conditions.length > 0) {
        parts.push(conditions.map(formatDamageIncreaseCondition).join("・"));
      }
      if (def.bonusBasicAttackHpRatio !== undefined) {
        parts.push(`HP≤${formatPercent(def.bonusBasicAttackHpRatio)}`);
      } else if (conditions.length === 0) {
        parts.push(`HP≤${formatPercent(0.3)}`);
      }
      const gate = parts.length > 0 ? parts.join("・") : "—";
      return `通常攻撃 Hit 後 ${gate} で ${formatPercent(
        chance
      )} 追加 Hit（非再帰）`;
    }
    case "periodicDispel": {
      const tags = formatDispelTagsLabel(def.dispelTags);
      const target = def.dispelTargetRule
        ? ` → ${formatTarget(def.dispelTargetRule, { kind: "self" })}`
        : "";
      const dispelMeta = [
        formatTargetShape(passiveDispelToEffectDef(def)),
        def.dispelRange !== undefined
          ? formatUiDistanceValue(def.dispelRange)
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const metaSuffix = dispelMeta ? ` · ${dispelMeta}` : "";
      const trigger = resolvePassivePeriodicTrigger(def);
      const triggerLabel = formatPassiveTriggerSummary(def, trigger);
      const limitLabel =
        def.dispelTriggerLimit !== undefined && def.dispelTriggerLimit > 0
          ? ` · ${def.dispelTriggerLimit}回/Wave`
          : "";
      return `デバフ解除 ${triggerLabel}（${tags} ×${
        def.dispelCount ?? 1
      }${formatDispelPriorityLabel(
        def.dispelPriority
      )}${limitLabel}）${target}${metaSuffix}`;
    }
    case "specialEffect": {
      if (def.specialEffectApplyTo === "heal" && def.specialEffect) {
        return formatPassiveSpecialEffectHeal(def);
      }
      if (def.specialEffectApplyTo === "barrier" && def.specialEffect) {
        return formatPassiveSpecialEffectBarrier(def);
      }
      const special =
        formatSpecialEffectSpec(def.specialEffectApplyTo, def.specialEffect) ||
        "特効効果";
      const ign = formatDefenseIgnoreSpec(def.defenseIgnore);
      return ign ? `${special} · 条件成立時 ${ign}` : special;
    }
    case "healReceivedIncrease":
      return (
        formatSpecialEffectSpec("heal", {
          scale: 1 + (legacy.percent ?? 0),
          conditions: [{ kind: "targetHp", maxHpRatio: 1 }],
        }) || `被回復 +${formatPercent(legacy.percent ?? 0)}`
      );
    case "hot":
    case "herbalPotency":
    case "blockResonance":
    case "lastStandInvulnerable":
    case "frontBlockAura":
    case "lastStandRecovery":
    case "lowHpCover":
    case "duelistPride":
    case "lastStandGuts":
    case "bloodlustDuelist":
    case "heal": {
      if (def.effect === "lowHpCover") {
        const ratio = def.coverHpRatioThreshold ?? 0.35;
        const limit = def.coverWaveLimit ?? 3;
        return `低HP味方(≤${formatPercent(
          ratio
        )})の被ダメ肩代わり · ${limit}回/Wave`;
      }
      if (def.effect === "duelistPride") {
        const minRatio = def.prideHpRatioMin ?? 0.5;
        const healMul = def.prideHealMultiplier ?? 0.25;
        return `HP≥${formatPercent(
          minRatio
        )} 被回復×${healMul}（バリア非対象）`;
      }
      if (def.effect === "lastStandGuts") {
        const duration = def.lastStandGutsDurationSec ?? 4;
        return `致死時 HP1維持 ${duration}s（Wave 1回）· 終了時敵全体スタン`;
      }
      if (def.effect === "bloodlustDuelist") {
        const block = def.bloodlustBlockChance ?? 0.05;
        const atkCurve = def.bloodlustAtkBuffCurveExponent;
        const curveNote =
          atkCurve !== undefined && atkCurve !== 1
            ? ` · ATK曲線^${atkCurve}`
            : "";
        return `block ${formatPercent(block)} · 低HP DEF/ATK 強化${curveNote}`;
      }
      if (def.effect === "lastStandInvulnerable") {
        return "HPが0以下になるダメージを受けた際、3秒無敵（Wave 1回まで）";
      }
      if (def.effect === "lastStandRecovery") {
        const hpRatio = def.lastStandRecoveryHpRatio ?? 0.5;
        const selfMul = def.lastStandRecoverySelfDamageTakenMultiplier ?? 0.5;
        const frontMul =
          def.lastStandRecoveryFrontAllyDamageTakenMultiplier ?? 0.75;
        const duration = def.lastStandRecoveryDurationSec ?? 5;
        return `HPが0以下になるダメージを受けた際、HP${formatPercent(
          hpRatio
        )}復活（Wave 1回まで）、自己${formatDamageTakenMultiplierLabel(
          selfMul
        )}、周囲${formatDamageTakenMultiplierLabel(
          frontMul
        )}、${formatSecondsLabel(duration)}`;
      }
      if (def.effect === "frontBlockAura") {
        const parts: string[] = [];
        if (def.chance !== undefined) {
          parts.push(phraseBlockRateBuff(formatPercent(def.chance)));
        } else {
          parts.push(phraseBlockRate());
        }
        if (def.frontBlockAuraMagicBlock) {
          parts.push(phraseMagicBlockEnable());
        }
        return formatFramedPassiveLine(
          formatPassiveTargetFrame("aoe", {
            aoeRadiusPx: def.frontBlockAuraRadiusPx ?? 50,
            targetRule: { kind: "distance", side: "ally", order: "selfOrigin" },
          }),
          { kind: "distance", side: "ally", order: "selfOrigin" },
          parts.join(getSkillTextLocale() === "en" ? ", " : "、")
        );
      }
      if (def.effect === "blockResonance") {
        const parts: string[] = [];
        if (def.chance !== undefined) {
          const rateLabel =
            getSkillTextLocale() === "en"
              ? `${phraseBlockRate()}+${formatPercent(def.chance)}`
              : `ブロック率+${formatPercent(def.chance)}`;
          parts.push(rateLabel);
        }
        const maxStacks = def.blockResonanceMaxStacks ?? 6;
        const perStack = def.blockResonanceDamageTakenPerStack ?? 0.03;
        const decay = def.blockResonanceDecayIntervalSec ?? 8;
        parts.push(
          `ブロック時「防壁」1スタック（上限${maxStacks})。「防壁」：1スタックごとに${formatDamageTakenReductionRateLabel(
            perStack
          )}。${decay}秒ごとに1スタック消失`
        );
        return parts.join("/");
      }
      if (def.effect === "heal" && (def.healSubKind ?? "hot") !== "hot") {
        return HEAL_SUB_KIND_LABELS[def.healSubKind ?? "instant"];
      }
      const duration = def.hotDurationSec ?? 0;
      const durationLabel = duration <= 0 ? "無限" : formatSecondsLabel(duration);
      const amount = def.hotAmount ? formatResourceAmount(def.hotAmount) : "—";
      const target = formatTarget(def.hotTargetRule, { kind: "self" });
      const hotMeta = [
        formatTargetShape(passiveHotToEffectDef(def)),
        def.hotRange !== undefined ? formatUiDistanceValue(def.hotRange) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const metaSuffix = hotMeta ? ` · ${hotMeta}` : "";
      const potencyParts: string[] = [];
      if (def.herbalPotencyMaxStacks !== undefined) {
        potencyParts.push(`上限${def.herbalPotencyMaxStacks} stack`);
      }
      if (def.herbalPotencyHotPerStackPercent !== undefined) {
        potencyParts.push(
          `HoT+${formatPercent(def.herbalPotencyHotPerStackPercent)}/stack`
        );
      }
      if (def.herbalPotencyConstitutionThresholds?.length) {
        const constitutionName =
          def.herbalPotencyConstitutionDisplayName ??
          HERBAL_POTENCY_CONSTITUTION_DISPLAY_NAME;
        potencyParts.push(
          `${constitutionName} ${def.herbalPotencyConstitutionThresholds.join("/")}`
        );
      }
      const hotTickSec =
        def.herbalPotencyHotTickSec ?? HERBAL_POTENCY_HOT_TICK_SEC;
      const accumulateSec =
        def.herbalPotencyAccumulateSec ?? HERBAL_POTENCY_ACCUMULATE_SEC;
      if (def.hotAmount) {
        potencyParts.push(`aura HoT ${formatSecondsLabel(hotTickSec)} tick`);
      }
      potencyParts.push(
        `薬効蓄積 ${formatSecondsLabel(
          accumulateSec
        )}（実時間・HoT tick 非連動）`
      );
      const potencySuffix =
        potencyParts.length > 0 ? ` · ${potencyParts.join(" · ")}` : "";
      if (usesHotAuraMode(def) || def.effect === "herbalPotency") {
        return `常時 HoT ${amount} → ${target}（${durationLabel}${metaSuffix}${potencySuffix}）`;
      }
      const trigger = resolvePassivePeriodicTrigger(def);
      const triggerLabel = formatPassiveTriggerSummary(def, trigger);
      return `HoT ${triggerLabel} ${amount} → ${target}（${durationLabel}${metaSuffix}）`;
    }
    case "excessHealToBarrier":
      return formatExcessHealToBarrierPassive(def);
    case "selfHpRatioBuff": {
      const statsLabel = formatStatsWithModifier(
        (def.buffStat as StatBuffTarget | StatBuffTarget[] | undefined) ??
          undefined,
        def.buffMultiplierMax,
        def.buffFlatBonusMax
      );
      const ratio = formatPercent(def.maxBuffAtHpRatio ?? 0);
      return `自HP比例バフ ${statsLabel}（残HP${ratio}以下時最大）`;
    }
    case "excessHealRedirect": {
      const sourceLabels = (def.excessHealSources ?? ["outgoing"]).map((s) =>
        s === "outgoing" ? "与" : "被"
      );
      return `余剰回復転送 ×${
        def.redirectScale ?? 0.5
      } → 次低HP味方（${sourceLabels.join("・")}）`;
    }
    case "targetHpRatioHealScale": {
      const ratio = formatPercent(def.maxScaleAtHpRatio ?? 0);
      return `対象HP比例回復 ×${
        def.healScaleMax ?? 1
      }（残HP${ratio}以下時最大）`;
    }
    case "targetHpRatioDamageScale": {
      const ratio = formatPercent(def.minScaleAtHpRatio ?? 0);
      return `対象HP比例ダメ ×${
        def.damageScaleMax ?? 1
      }（残HP${ratio}以下で×1）`;
    }
    case "idleAtkRamp": {
      const maxSec = def.rampToMaxSec ?? 2.5;
      const minMul = def.atkMulMin ?? 1.25;
      const maxMul = def.atkMulMax ?? 1.6;
      return `待機ATK蓄積 ${maxSec}秒で ×${minMul}〜×${maxMul}（SPD低下で上限上昇）`;
    }
    case "ballistaMark": {
      const radius = def.ballistaMarkSplashRadiusPx ?? 50;
      const splash = formatPercent(def.ballistaMarkSplashDamageScale ?? 0.3);
      const spd = def.ballistaMarkSelfAttackSpeedMul ?? 0.85;
      return `砲撃標的（着弾${formatUiDistanceValue(radius)}内飛散${splash} / 自身${formatStatMultiplierLabel(
        "attackSpeed",
        spd
      )}）`;
    }
    case "dotCompressAssist":
      return `DoT圧縮基準×${def.dotCompressRatio ?? 0.7}`;
    case "allyBasicAttackDotProc": {
      const chance = formatPercent(def.chance ?? 0.2);
      const dur = def.debuffDotDurationSec ?? 5;
      const amount = formatResourceAmount(
        def.debuffDotAmount ?? { kind: "flat", flatAmount: 10 }
      );
      return `味方物理basic ${chance}でpoison ${amount}/${formatSecondsLabel(dur)}`;
    }
    case "dotDurationMultiplierOnApply": {
      const dur = def.dotDurationMultiplierOnApply ?? 1.5;
      const heal = def.dottedEnemyHealReceivedMultiplier;
      const healPart = heal !== undefined ? ` / dot中被回復×${heal}` : "";
      return `味方dot付与duration×${dur}${healPart}`;
    }
    case "dottedEnemyHealReceivedDebuff":
      return `dot中被回復×${def.dottedEnemyHealReceivedMultiplier ?? 0.8}`;
    case "conditionalEnemyDamageTakenAura":
      return `仕留め aura（hasDot+HP≤50% → ${formatDamageTakenMultiplierLabel(
        def.enemyDamageTakenMultiplier ?? 1.2
      )}）`;
    case "seedFlameOnActiveHit":
      return formatSeedFlameOnActiveHitPassive(def);
    case "bonusActiveOnHit":
      return `active Hit 後 ${def.bonusActiveSkillId ?? "—"} 追撃（非再帰）`;
    case "blazingFlameDetonate": {
      const radius = def.blazingFlameDetonateSpreadRadiusPx ?? 50;
      const n = def.blazingFlameDetonatePerSeedScale ?? 0.5;
      const mul = def.blazingFlameDetonateMultiplier ?? 1.3;
      const uncap = def.blazingFlameUncap ? " / 熾火上限解除" : "";
      return `熾火起爆（(ATK+種火×ATK×${n})×${mul} / spread${formatUiDistanceValue(radius)}）${uncap}`;
    }
    case "healReservation": {
      const grant = formatPercent(def.grantOnHealMaxHpRatio ?? 1);
      const trigger = formatPercent(def.triggerHpRatio ?? 0.35);
      const duration = def.stackDurationSec ?? 8;
      const amount = formatResourceAmount(def.healAmount);
      const buffName = def.buffDisplayName ?? "治癒の残響";
      return `回復時 対象HP${grant}以下で「${buffName}」1スタック付与（${duration}秒 / 被ダメ後HP${trigger}以下で${amount}回復）`;
    }
    case "barrierBreakRegen": {
      const amount = formatResourceAmount(
        def.barrierAmount ?? { kind: "atkBased", atkScale: 0.85 }
      );
      return `バリア破壊時 ${amount} 再生成（対象1回限り・HP回復ではない）`;
    }
    case "barrierDepletionHeal":
      return formatBarrierDepletionHealPassive(def);
    case "buff": {
      const alwaysSelfStat = formatPassiveAlwaysSelfStatBuff(def);
      if (alwaysSelfStat) {
        return alwaysSelfStat;
      }
      const effectView = passiveBuffToEffectDef(def);
      const target = formatTarget(def.buffTargetRule, { kind: "self" });
      const shape = formatTargetShape(effectView);
      const range =
        def.buffRange !== undefined ? formatUiDistanceValue(def.buffRange) : null;
      const metaParts = [shape, range];
      if (def.buffSubKind === "block") {
        return phraseBlockRateBuff(formatPercent(def.chance ?? 0));
      }
      if (def.buffSubKind === "evasion") {
        const target = def.buffTargetRule ?? { kind: "self" };
        if (
          target.kind === "self" &&
          resolvePassivePeriodicTrigger(def) === undefined
        ) {
          return phraseEvasionBuff(formatPercent(def.chance ?? 0));
        }
      }
      if (def.buffSubKind === "evasion") {
        const triggerLabel = formatPassiveTriggerLabel(
          resolvePassivePeriodicTrigger(def),
          "常時"
        );
        metaParts.push(triggerLabel);
        return `バフ ${BUFF_SUB_KIND_LABELS.evasion} ${formatPercent(
          def.chance ?? 0
        )} → ${target}（${metaParts.filter(Boolean).join(" · ")}）`;
      }
      if (def.buffSubKind === "damageDelay") {
        const triggerLabel = formatPassiveTriggerSummary(
          def,
          resolvePassivePeriodicTrigger(def),
          "常時"
        );
        metaParts.push(triggerLabel);
        return `バフ ${BUFF_SUB_KIND_LABELS.damageDelay} ${formatPercent(
          def.ratio ?? 0
        )} → ${target}（${metaParts.filter(Boolean).join(" · ")}）`;
      }
      if (def.buffSubKind === "barrier") {
        const amount = def.barrierAmount
          ? formatResourceAmount(def.barrierAmount)
          : "—";
        const triggerLabel = formatPassiveTriggerSummary(
          def,
          resolvePassiveBarrierTrigger(def)
        );
        metaParts.push(triggerLabel);
        return `バフ ${
          BUFF_SUB_KIND_LABELS.barrier
        } ${triggerLabel} ${amount} → ${target}（${metaParts
          .filter(Boolean)
          .join(" · ")}）`;
      }
      const triggerLabel = formatPassiveTriggerSummary(
        def,
        resolvePassivePeriodicTrigger(def),
        "常時"
      );
      metaParts.push(triggerLabel);
      const framedBuff = formatFramedPassiveLine(
        formatPassiveTargetFrame(def.buffTargetShape, {
          aoeRadiusPx: def.buffAoeRadiusPx,
          hitCount: def.buffHitCount,
          pierceDurationSec: def.buffPierceDurationSec,
          targetRule: def.buffTargetRule,
        }),
        def.buffTargetRule,
        formatBuffStatModifiersFromDef(def)
      );
      if (framedBuff !== formatBuffStatModifiersFromDef(def)) {
        return framedBuff;
      }
      return `バフ ${formatBuffStatModifiersFromDef(
        def
      )} → ${target}（${metaParts.filter(Boolean).join(" · ")}）`;
    }
    case "debuff": {
      const effectView = passiveDebuffToEffectDef(def);
      const target = formatTarget(def.debuffTargetRule, {
        kind: "distance",
        side: "enemy",
        order: "nearest",
      });
      const shape = formatTargetShape(effectView);
      const range =
        def.debuffRange !== undefined
          ? formatUiDistanceValue(def.debuffRange)
          : null;
      const triggerLabel = formatPassiveTriggerSummary(
        def,
        resolvePassivePeriodicTrigger(def),
        "常時"
      );
      const meta = [shape, range, triggerLabel].filter(Boolean).join(" · ");
      const debuffDetail = formatStatsWithModifier(
        def.debuffStat,
        def.debuffMultiplier,
        def.debuffFlatBonus
      );
      const framedDebuff = formatFramedPassiveLine(
        formatPassiveTargetFrame(def.debuffTargetShape, {
          aoeRadiusPx: def.debuffAoeRadiusPx,
          hitCount: def.debuffHitCount,
          pierceDurationSec: def.debuffPierceDurationSec,
          targetRule: def.debuffTargetRule,
        }),
        def.debuffTargetRule,
        debuffDetail
      );
      if (framedDebuff !== debuffDetail) {
        return framedDebuff;
      }
      return `デバフ ${formatStatsWithModifier(
        def.debuffStat,
        def.debuffMultiplier,
        def.debuffFlatBonus
      )} → ${target}${meta ? `（${meta}）` : ""}`;
    }
    case "extendSelfAppliedDebuff": {
      const parts = [`付与デバフ +${formatSecondsLabel(legacy.extendSec ?? 0)}`];
      if (
        legacy.durationMultiplier !== undefined &&
        legacy.durationMultiplier !== 1
      ) {
        parts.push(`時間×${legacy.durationMultiplier}`);
      }
      return parts.join(" ");
    }
    case "aoeCrowdBonus":
      return `密集 +${def.perExtraTargetScale ?? 0}/体（上限 ${
        def.maxExtraTargets ?? 0
      }）`;
    case "skillAmountOverride": {
      const target = def.targetSkillId ?? "—";
      const amount = def.amount ? formatResourceAmount(def.amount) : "—";
      const scope =
        def.effectIndex !== undefined
          ? `（効果${def.effectIndex + 1}）`
          : def.passiveAmountField
          ? `（${def.passiveAmountField}）`
          : "";
      return `「${target}」の効果量${scope} → ${amount}`;
    }
    case "skillPropertyOverride": {
      const bonus = def.maxChargesBonus ?? 1;
      const targets = def.skillPropertyTargetSkillIds;
      const targetLabel =
        targets && targets.length > 0 ? targets.join(", ") : "全アクティブ";
      return `maxCharges +${bonus} → ${targetLabel}`;
    }
    case "counter":
    case "counterChance": {
      const responseParts = (def.counterResponses ?? []).map(
        formatCounterResponse
      );
      const range = formatCounterRangeSummary(def.counterRange);
      const bandParts: string[] = [];
      if (def.counterMelee) bandParts.push("近接");
      if (def.counterRanged) bandParts.push("遠隔");
      const band = bandParts.length > 0 ? `対象${bandParts.join("・")}` : "";
      const triggerLabel =
        def.counterTrigger === "frontAllyDamaged"
          ? "周囲の味方被弾時"
          : "被攻撃時";
      return [
        `${triggerLabel} ${formatPercent(
          def.chance ?? legacy.counterChance ?? 0
        )} で反撃`,
        responseParts.join(" / "),
        range,
        band,
      ]
        .filter(Boolean)
        .join(" / ");
    }
    default:
      return effect;
  }
}

function formatPassiveSkillEffectLines(def: PassiveSkillDef): SkillCardEffectLine[] {
  if (def.effect === "barrierDepletionHeal") {
    return formatBarrierDepletionHealEffectLines(def);
  }
  if (def.effect === "seedFlameOnActiveHit") {
    return formatSeedFlameOnActiveHitEffectLines(def);
  }
  return [formatPassiveEffect(def.effect, def)];
}

export type SkillCardLines = {
  metaLine: string;
  effectLines: SkillCardEffectLine[];
};

function isActiveSkillDef(
  def: ActiveSkillDef | PassiveSkillDef
): def is ActiveSkillDef {
  return Array.isArray(def.effect);
}

function formatActiveSkillMetaLine(def: ActiveSkillDef): string {
  const st = skillText();
  const trigger = resolveSkillTrigger(def);
  const parts: string[] = [
    `${st.recast}${st.labelColon}${formatCdLabel(trigger.kind, trigger.value)}`,
  ];

  const duration = resolveActiveSkillDurationLabel(def);
  if (duration) {
    parts.push(`${st.duration}${st.labelColon}${duration}`);
  }

  parts.push(...formatActiveSkillLockMetaParts(def));

  if ((def.firePolicy ?? "immediate") === "smart") {
    const condSummary = formatFireConditionsSummary(
      def.fireConditions,
      def.fireConditionMatch ?? "all"
    );
    if (condSummary) {
      parts.push(`${st.fireCondition}${st.labelColon}${condSummary}`);
    }
  }

  return parts.join(st.metaJoiner);
}

function formatActiveSkillEffectLines(
  def: ActiveSkillDef,
  context: SkillCardFormatContext = {}
): string[] {
  const specialLines = resolveActiveSkillSpecialEffectLines(def);
  if (specialLines) {
    return specialLines;
  }

  return formatActiveSkillDefaultEffectLines(def, {
    includeMaxCharges: true,
    ...context,
    showTargetFrame: true,
  });
}

function formatPassiveSkillMetaLine(def: PassiveSkillDef): string {
  const st = skillText();
  if (def.effect === "counter" || def.effect === "counterChance") {
    return def.counterTrigger === "frontAllyDamaged"
      ? st.passiveFrontAllyHit
      : st.passiveOnHit;
  }
  return formatPassiveTriggerSummary(def, resolvePassivePeriodicTrigger(def));
}

export function formatSkillCardLines(
  def: ActiveSkillDef | PassiveSkillDef,
  options: { locale: SkillCardLocale } & SkillCardFormatContext
): SkillCardLines {
  return runWithSkillTextLocale(options.locale, () => {
    if (isActiveSkillDef(def)) {
      return {
        metaLine: formatActiveSkillMetaLine(def),
        effectLines: formatActiveSkillEffectLines(def, options),
      };
    }

    return {
      metaLine: formatPassiveSkillMetaLine(def),
      effectLines: formatPassiveSkillEffectLines(def),
    };
  });
}

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return runWithSkillTextLocale(getSkillTextLocale(), () =>
    `${skillText().passiveEffectPrefix}${formatPassiveEffect(def.effect, def)}`,
  );
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  return runWithSkillTextLocale(getSkillTextLocale(), () => {
    const parts = [formatActiveSkillMetaLine(def)];

    const effects = formatActiveSkillEffectBody(def);
    if (effects) {
      parts.push(effects);
    }

    return `${parts.join(skillText().metaJoiner)} /`;
  });
}
