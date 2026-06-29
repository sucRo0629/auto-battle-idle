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
import {
  BLAZING_FLAME_DOT_ATK_SCALE,
  BLAZING_FLAME_MAGIC_TAKEN_PER_STACK,
  BLAZING_FLAME_MAX_STACKS_DEFAULT,
  SEED_FLAME_DOT_ATK_SCALE,
  SEED_FLAME_DURATION_SEC,
  SEED_FLAME_MAX_STACKS,
} from "../battle/sorcererFlame.ts";
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
  TargetSpec,
  TargetStat,
} from "../battle/types.ts";
import {
  asStatusEffectStatList,
  filterStatusEffectStats,
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
import {
  resolveGameTermTitle,
  resolveStatusEffectStatDisplayName,
} from "./gameTermGlossary.ts";

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
  fallback = "常時"
): string {
  const triggerLabel = formatPassiveTriggerLabel(trigger, fallback);
  if (!usesPassiveTriggerChance(passive)) return triggerLabel;
  const chance = passive.chance;
  if (chance !== undefined && chance < 1) {
    return `${triggerLabel} ${formatPercent(chance)}`;
  }
  return triggerLabel;
}

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  physical: "物理",
  magic: "魔法",
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
  const label = resolveStatusEffectStatDisplayName(stat);
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
      return condition.compare === "gte"
        ? `対象のHPが${pct}%以上`
        : `対象のHPが${pct}%以下`;
    }
    case "selfHp": {
      const pct = Math.round(condition.maxHpRatio * 100);
      return condition.compare === "gte"
        ? `自身のHPが${pct}%以上`
        : `自身のHPが${pct}%以下`;
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
      return `先読み被ダメ≥${Math.round(condition.maxHpRatio * 100)}%/${
        condition.windowSec
      }s`;
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
  if (Number.isInteger(rounded)) {
    return `${rounded}秒`;
  }
  return `${rounded}秒`;
}

function formatCdLabel(kind: SkillTriggerKind, value: number): string {
  switch (kind) {
    case "time":
      return value === 0 ? "チャージなし" : formatSecondsLabel(value);
    case "basicAttackCount":
      return `通常攻撃${value}回`;
    case "hitsTaken":
      return `被攻撃${value}回`;
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
    if (targetSpec && isAllAllyTarget(targetSpec)) {
      return `味方全体のHPを攻撃力の${pct}で回復`;
    }
    return `味方のHPを攻撃力の${pct}で回復`;
  }
  return `${formatResourceAmount(amount)}回復`;
}

function joinActiveSkillScopePrefix(
  scopePrefix: string | undefined,
  effectParts: string
): string {
  if (!scopePrefix || !effectParts) return effectParts;
  if (scopePrefix === "味方全体" && effectParts.startsWith("味方")) {
    return effectParts;
  }
  return `${scopePrefix}${effectParts}`;
}

function formatPassiveSpecialEffectHeal(def: PassiveSkillDef): string {
  const spec = def.specialEffect;
  if (!spec) return "特効回復";
  const bonusPct = formatPercent((spec.scale ?? 1) - 1);
  for (const condition of spec.conditions ?? []) {
    if (condition.kind !== "targetHp") continue;
    const pct = Math.round(condition.maxHpRatio * 100);
    const suffix = condition.compare === "gte" ? "以上" : "以下";
    return `HPが${pct}%${suffix}の味方を回復時、HP回復効果+${bonusPct}`;
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
    const suffix = condition.compare === "gte" ? "以上" : "以下";
    return `HPが${pct}%${suffix}の味方にバリア付与時、バリア量+${bonusPct}`;
  }
  return formatSpecialEffectSpec("barrier", spec) || "特効バリア";
}

function formatBarrierDepletionHealHealSentence(def: PassiveSkillDef): string {
  if (def.healAmount?.kind === "atkBased") {
    const pct = formatPercent(def.healAmount.atkScale ?? 1);
    return `攻撃力の${pct}で回復`;
  }
  return `${formatResourceAmount(def.healAmount)}回復`;
}

function formatBarrierDepletionHealEffectLines(def: PassiveSkillDef): string[] {
  const heal = formatBarrierDepletionHealHealSentence(def);
  return [
    `味方に付与したバリアが完全に消失した時、対象を${heal}（味方ごとにWave1回まで）`,
    "この効果は「障壁」の消失では誘発しない",
  ];
}

function formatBarrierDepletionHealPassive(def: PassiveSkillDef): string {
  return formatBarrierDepletionHealEffectLines(def).join("、");
}

/** スキルカード effectLines のインデント行プレフィックス（表示時は CSS で字下げ） */
export const SKILL_CARD_INDENT_PREFIX = "\u3000";

function formatSkillCardIndentLine(text: string): string {
  return `${SKILL_CARD_INDENT_PREFIX}${text}`;
}

function formatSeedFlameOnActiveHitEffectLines(def: PassiveSkillDef): string[] {
  const seedFlameMaxStacks = def.seedFlameMaxStacks ?? SEED_FLAME_MAX_STACKS;
  const seedFlameDurationSec = def.seedFlameDurationSec ?? SEED_FLAME_DURATION_SEC;
  const seedFlameDotPct = formatPercent(
    def.seedFlameDotAtkScale ?? SEED_FLAME_DOT_ATK_SCALE
  );
  const blazingFlameDotPct = formatPercent(
    def.blazingFlameDotAtkScale ?? BLAZING_FLAME_DOT_ATK_SCALE
  );
  const blazingFlameMagicTakenPct = formatPercent(
    def.blazingFlameMagicTakenPerStack ?? BLAZING_FLAME_MAGIC_TAKEN_PER_STACK
  );
  const blazingFlameMaxStacks =
    def.blazingFlameMaxStacksDefault ?? BLAZING_FLAME_MAX_STACKS_DEFAULT;

  return [
    "敵に攻撃スキルが1回命中するごとに「種火」を1スタックする",
    `- 種火：1スタックごとに${seedFlameDurationSec}秒間毎秒攻撃力の${seedFlameDotPct}の魔法ダメージを与える`,
    formatSkillCardIndentLine(`最大スタック数：${seedFlameMaxStacks}`),
    `- 熾火：1スタックごとに無期限で毎秒攻撃力の${blazingFlameDotPct}の魔法ダメージを与える`,
    formatSkillCardIndentLine(
      `さらに1スタックごとに魔法攻撃の被ダメージを${blazingFlameMagicTakenPct}増加させる`
    ),
    formatSkillCardIndentLine(`最大スタック数：${blazingFlameMaxStacks}`),
  ];
}

function formatSeedFlameOnActiveHitPassive(def: PassiveSkillDef): string {
  return formatSeedFlameOnActiveHitEffectLines(def)
    .map((line) =>
      line.startsWith(SKILL_CARD_INDENT_PREFIX)
        ? line.slice(SKILL_CARD_INDENT_PREFIX.length)
        : line.replace(/^- /, "")
    )
    .join("、");
}

function formatExcessHealToBarrierPassive(def: PassiveSkillDef): string {
  const scalePct = formatPercent(def.barrierScale ?? 1);
  const sources = def.excessHealSources ?? ["outgoing"];
  if (sources.length === 1 && sources[0] === "outgoing") {
    return `味方を回復時、最大HPを超えた回復量の${scalePct}をバリアとして対象に付与する`;
  }
  const sourceLabels = sources.map((s) => (s === "outgoing" ? "与" : "被"));
  return `余剰回復バリア ${scalePct}（${sourceLabels.join("・")}）`;
}

const ACTIVE_SKILL_RECAST_META_LABEL = "再使用";

function formatMultiLockSubjectPrefix(
  hitCount: number,
  side: TargetSpec["side"],
): string {
  if (side === "ally") {
    return `味方${hitCount}体をマルチロックして`;
  }
  return `敵${hitCount}体をマルチロックして`;
}

function formatMultiLockEffectLine(
  effect: SkillEffectDef,
  targetSpec: TargetSpec,
): string | null {
  if ((effect.targetShape ?? "single") !== "multiLock") return null;
  const hitCount = effect.hitCount ?? 1;
  if (hitCount <= 1) return null;
  const prefix = formatMultiLockSubjectPrefix(hitCount, targetSpec.side);

  if (effect.type === "damage") {
    return `${prefix}${formatCompactAtkBasedDamageSentence(
      effect.amount,
      effect.damageType,
    )}`;
  }
  if (effect.type === "heal") {
    return `${prefix}${formatCompactAtkBasedHealSentence(
      effect.amount,
      targetSpec,
    )}`;
  }
  if (effect.type === "buff" && effect.buffSubKind === "barrier") {
    return `${prefix}${formatCompactBarrierBuffLabel(
      effect.amount,
      effect.barrierStack,
    )}`;
  }
  return null;
}

function formatCompactBarrierBuffLabel(
  amount: ResourceAmountSpec | undefined,
  stack?: boolean
): string {
  const stackSuffix = stack ? "（加算）" : "";
  if (amount?.kind === "atkBased") {
    const pct = formatPercent(amount.atkScale ?? 1);
    return `攻撃力の${pct}のバリア${stackSuffix}`;
  }
  return `${formatResourceAmount(amount)}${stackSuffix}`;
}

function formatSelfOriginAoeBuffCardLines(def: ActiveSkillDef): string[] | null {
  if (
    def.target?.kind !== "distance" ||
    def.target.order !== "selfOrigin" ||
    (def.targetShape ?? "single") !== "aoe"
  ) {
    return null;
  }
  if (def.effect.length <= 1 || !def.effect.every((effect) => effect.type === "buff")) {
    return null;
  }

  const lines: string[] = ["周囲に以下の効果を付与する"];
  for (const effect of def.effect) {
    if (effect.type !== "buff") continue;
    if (effect.buffSubKind === "barrier") {
      lines.push(formatCompactBarrierBuffLabel(effect.amount, effect.barrierStack));
      continue;
    }
    const statLabel = formatBuffTargetStats(
      effect.buffStat,
      effect.buffMultiplier,
      effect.buffFlatBonus
    );
    lines.push(compactStatEffectLabel(statLabel));
  }
  return lines;
}

function formatActiveSkillMaxChargesLine(def: ActiveSkillDef): string | null {
  if (def.maxCharges === undefined || def.maxCharges <= 0) return null;
  return `${def.maxCharges}回チャージ可能`;
}

function formatCompactAtkBasedDamageSentence(
  amount: ResourceAmountSpec | undefined,
  damageType?: DamageType
): string {
  if (amount?.kind === "atkBased") {
    const scale = amount.atkScale ?? 1;
    const pct = formatPercent(scale);
    const dmgLabel = damageType
      ? `${DAMAGE_TYPE_LABELS[damageType]}ダメージ`
      : "ダメージ";
    return `攻撃力の${pct}の${dmgLabel}を与える`;
  }
  const dmgPrefix = damageType ? `${DAMAGE_TYPE_LABELS[damageType]}` : "";
  return `${dmgPrefix}${formatResourceAmount(amount)}のダメージを与える`;
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
    return `${hitCount}回連続で${sentence}`;
  }
  return sentence;
}

function formatMultiLockDamageEffectLines(
  effect: SkillEffectDef,
  inheritTarget?: TargetSpec,
): string[] | null {
  const targetSpec = resolveEffectTargetSpec(effect, inheritTarget);
  const line = formatMultiLockEffectLine(effect, targetSpec);
  return line ? [line] : null;
}

function resolveTargetStatDisplayName(stat: TargetStat): string {
  if (isStatusEffectStat(stat)) {
    return resolveStatusEffectStatDisplayName(stat);
  }
  return TARGET_STAT_LABELS[stat];
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
    return "最もHP割合が低い敵を優先して攻撃する";
  }
  if (
    rule.kind === "stat" &&
    rule.side === "enemy" &&
    rule.order === "highest"
  ) {
    const statLabel = resolveTargetStatDisplayName(rule.stat);
    return `最も${statLabel}が高い敵を優先して攻撃する`;
  }
  if (rule.kind === "attackType" && rule.ranged && !rule.melee) {
    return "遠隔攻撃の敵を優先して攻撃する";
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
    return `攻撃時、対象の防御力を${formatPercent(spec.def.amount)}無視する`;
  }
  if (spec.reg?.percent !== undefined) {
    return `攻撃時、対象の${resolveStatusEffectStatDisplayName(
      "reg"
    )}を${formatPercent(spec.reg.percent)}無視する`;
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

function resolveActiveSkillScopePrefix(
  def: ActiveSkillDef
): string | undefined {
  if (
    def.target?.kind === "distance" &&
    def.target.order === "selfOrigin" &&
    (def.targetShape ?? "single") === "aoe"
  ) {
    const radius = def.aoeRadiusPx;
    return radius !== undefined ? `自身起点±${radius}px：` : "自身起点：";
  }
  if (def.effect.length > 0) {
    const allAllyAll = def.effect.every((effect) => {
      const target = resolveEffectTargetSpec(effect, def.target);
      return target.kind === "all" && target.side === "ally";
    });
    if (allAllyAll) return "味方全体";
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

function formatActiveSkillLockMetaPart(def: ActiveSkillDef): string | undefined {
  const hasConsume = def.effect.some(
    (effect) => effect.type === "blockResonanceConsume"
  );
  const useSec = def.useDurationSec ?? 0;
  if (useSec <= 0 && !hasConsume) return undefined;

  const durationLabel = hasConsume
    ? formatBlockResonanceStanceDurationLabel(def, {
        useDurationFallback: true,
      })
    : formatSecondsLabel(useSec);

  if (def.useDurationPauseApproach) {
    return `硬直・移動停止${durationLabel}`;
  }
  return `硬直${durationLabel}`;
}

function formatBlockResonanceConsumeSkillEffect(def: ActiveSkillDef): string {
  const radius = def.blockResonanceOnBlockKnockbackRadiusPx ?? 50;
  const damage = def.blockResonanceOnBlockDamage;
  const defScale = damage?.kind === "defBased" ? damage.defScale ?? 1 : 1;
  return `「城塞の構え」：ブロック時半径${radius}px内の敵に${formatDefScale(
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

function formatActiveSkillDefaultEffectLines(
  def: ActiveSkillDef,
  options?: { includeMaxCharges?: boolean }
): string[] {
  const mappableEffects = def.effect.filter(
    (effect) => effect.type !== "blockResonanceConsume"
  );
  const scopePrefix = resolveActiveSkillScopePrefix(def);
  const lines: string[] = [];
  let scopeApplied = false;

  for (const effect of mappableEffects) {
    const multiLockLines = formatMultiLockDamageEffectLines(effect, def.target);
    if (multiLockLines) {
      if (scopePrefix && !scopeApplied) {
        lines.push(`${scopePrefix}${multiLockLines[0]}`);
        scopeApplied = true;
        lines.push(...multiLockLines.slice(1));
      } else {
        lines.push(...multiLockLines);
      }
      continue;
    }

    const line = formatActiveEffectDetail(effect, {
      compact: true,
      scopePrefix,
      inheritTarget: def.target,
    });
    if (!line) continue;
    if (scopePrefix && !scopeApplied) {
      lines.push(joinActiveSkillScopePrefix(scopePrefix, line));
      scopeApplied = true;
    } else {
      lines.push(line);
    }
  }

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
  return formatActiveSkillDefaultEffectLines(def).join("、");
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
    return `${resolveGameTermTitle("damageReduction")}${formatPercent(1 - mul)}`;
  }
  if (mul > 1) {
    return `${resolveGameTermTitle("damageIncrease")}${formatPercent(mul - 1)}`;
  }
  return resolveStatusEffectStatDisplayName("damageTaken");
}

/** wardBarrier 等: 軽減率そのもの（0.1 = 10% 軽減） */
function formatDamageTakenReductionRateLabel(rate: number): string {
  return `${resolveGameTermTitle("damageReduction")}${formatPercent(rate)}`;
}

function formatAtkScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return resolveStatusEffectStatDisplayName("atk");
  return `${resolveStatusEffectStatDisplayName("atk")}${formatPercent(s)}`;
}

function formatDefScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return resolveStatusEffectStatDisplayName("def");
  return `${resolveStatusEffectStatDisplayName("def")}${formatPercent(s)}`;
}

function formatResourceAmount(amount: ResourceAmountSpec | undefined): string {
  if (!amount) return "—";
  switch (amount.kind) {
    case "atkBased": {
      const scale = amount.atkScale ?? 1;
      const offset = amount.atkOffset ?? 0;
      if (offset === 0) return formatAtkScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(${resolveStatusEffectStatDisplayName("atk")}${sign}${offset})${formatPercent(
        scale
      )}`;
    }
    case "defBased": {
      const scale = amount.defScale ?? 1;
      const offset = amount.defOffset ?? 0;
      if (offset === 0) return formatDefScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(${resolveStatusEffectStatDisplayName("def")}${sign}${offset})${formatPercent(
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
  stat: StatusEffectStat | StatusEffectStat[] | undefined
): string {
  return asStatusEffectStatList(stat)
    .map((s) => resolveStatusEffectStatDisplayName(s))
    .join("・");
}

function formatStatWithModifier(
  stat: StatusEffectStat,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  const mul = multiplier ?? 1;
  const flat = flatBonus ?? 0;

  if (stat === "damageTaken") {
    if (mul === 1 && flat === 0) {
      return resolveStatusEffectStatDisplayName("damageTaken");
    }
    if (flat === 0) return formatDamageTakenMultiplierLabel(mul);
    if (mul === 1) {
      return `${resolveStatusEffectStatDisplayName("damageTaken")}${formatStatFlatSuffix(
        flat
      )}`;
    }
    return `( ${resolveStatusEffectStatDisplayName("damageTaken")}${formatStatFlatSuffix(
      flat
    )} ) ${formatDamageTakenMultiplierLabel(mul)}`;
  }

  const label = resolveStatusEffectStatDisplayName(stat);

  if (mul === 1 && flat === 0) return label;
  if (flat === 0) return formatStatMultiplierLabel(stat, mul);
  if (mul === 1) return `${label}${formatStatFlatSuffix(flat)}`;
  return `(${label}${formatStatFlatSuffix(flat)})${formatStatMultiplierSuffix(
    mul
  )}`;
}

function formatStatsWithModifier(
  stat: StatusEffectStat | StatusEffectStat[] | undefined,
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

function formatDamageIncreaseConditionProse(
  conditions: DamageIncreaseCondition[]
): string | null {
  if (conditions.length !== 1) return null;
  const condition = conditions[0];
  switch (condition.kind) {
    case "debuff": {
      if (condition.tags.length !== 1) return null;
      const tag =
        DEBUFF_FILTER_TAG_LABELS[condition.tags[0]] ?? condition.tags[0];
      const prefix = condition.selfAppliedOnly ? "自身付与の" : "";
      return `対象に${prefix}${tag}が付与されているなら`;
    }
    case "targetHp": {
      const pct = Math.round(condition.maxHpRatio * 100);
      return condition.compare === "gte"
        ? `対象のHPが${pct}%以上なら`
        : `対象のHPが${pct}%以下なら`;
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
  return `${conditionText}、このダメージは+${formatPercent(spec.scale)}される`;
}

function formatCompactBleedDotApplyLine(effect: SkillEffectDef): string | null {
  if (effect.type !== "debuff" || effect.debuffSubKind !== "dot") return null;
  const duration = effect.durationSec ?? effect.debuffDurationSec ?? 0;
  const flavor =
    effect.buffDisplayName ??
    (effect.dotFlavor ? DOT_FLAVOR_LABELS[effect.dotFlavor] : null);
  if (!flavor) return null;
  const dmgLabel = effect.damageType
    ? `${DAMAGE_TYPE_LABELS[effect.damageType]}ダメージ`
    : "ダメージ";
  if (effect.amount?.kind !== "atkBased") return null;
  const pct = formatPercent(effect.amount.atkScale ?? 1);
  return `その後攻撃した対象に${duration}秒間毎秒攻撃力の${pct}の${dmgLabel}を与える${flavor}を付与する`;
}

function formatCompactTimedEvasionBuffLine(
  effect: SkillEffectDef
): string | null {
  if (effect.type !== "buff" || effect.buffSubKind !== "evasion") return null;
  const duration = effect.buffDurationSec ?? 0;
  return `${duration}秒間回避+${formatPercent(effect.chance ?? 0)}`;
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
  return `対象の背後に移動した後、${dmgSentence}`;
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
  const stats = filterStatusEffectStats(stat);
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

function formatDefenseIgnoreSpec(
  spec: PassiveSkillDef["defenseIgnore"] | SkillEffectDef["defenseIgnore"]
): string {
  if (!spec) return "";
  const parts: string[] = [];
  if (spec.def) {
    parts.push(
      spec.def.mode === "flat"
        ? `DEF無視${spec.def.amount}`
        : `DEF無視${formatPercent(spec.def.amount)}`
    );
  }
  if (spec.reg) {
    parts.push(`REG無視${formatPercent(spec.reg.percent)}`);
  }
  if (spec.chance !== undefined && spec.chance < 1) {
    parts.unshift(`${formatPercent(spec.chance)}で`);
  }
  return parts.join(" ");
}

function formatTargetShape(effect: SkillEffectDef): string {
  const shape = effect.targetShape ?? "single";
  const parts: string[] = [TARGET_SHAPE_LABELS[shape]];

  switch (shape) {
    case "aoe":
      if (effect.aoeRadiusPx !== undefined) {
        parts.push(`±${effect.aoeRadiusPx}px`);
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
        parts.push(`${effect.pierceDurationSec}s`);
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
        parts.push(`半径${effect.scatterRadiusPx}px`);
      }
      break;
  }

  return parts.join(" ");
}

/** 反撃射程: 0 / 未指定 = 持有者 traits.rangePx（エディタ +0 と同義） */
function formatCounterRangeSummary(range: number | undefined): string {
  if (range === undefined || range === 0) return "射程+0";
  return `射程${range}`;
}

function formatCounterResponse(response: CounterResponseDef): string {
  switch (response.kind) {
    case "damage": {
      const dmgType = response.damageType
        ? DAMAGE_TYPE_LABELS[response.damageType]
        : "";
      const amount = formatResourceAmount(response.amount);
      return dmgType ? `${dmgType}${amount}` : amount;
    }
    case "debuff":
      return `デバフ${formatStatusStats(response.debuffStat)} ${
        response.debuffDurationSec
      }s`;
    case "dot":
      return `DoT×${response.powerMultiplier} ${response.durationSec}s`;
    case "stun":
      return `スタン${response.durationSec}s`;
    case "knockback":
      return `ノック${response.distancePx}px+移動硬直${KNOCKBACK_MOVE_LOCK_SEC}s`;
  }
}

function formatActiveEffectDetail(
  effect: SkillEffectDef,
  options?: {
    compact?: boolean;
    scopePrefix?: string;
    inheritTarget?: TargetSpec;
  }
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
  const extras: string[] = [];

  switch (effect.type) {
    case "damage": {
      const dmgType = effect.damageType
        ? DAMAGE_TYPE_LABELS[effect.damageType]
        : "";
      const amount = formatResourceAmount(effect.amount);
      if (compact) {
        const multiLockLines = formatMultiLockDamageEffectLines(
          effect,
          inheritTarget,
        );
        if (
          multiLockLines &&
          isOmittableDefaultEnemyTarget(targetSpec)
        ) {
          extras.push(multiLockLines.join("、"));
        } else if (
          effect.amount?.kind === "atkBased" &&
          isOmittableDefaultEnemyTarget(targetSpec)
        ) {
          const singleSentence = formatCompactSingleTargetDamageSentence(
            effect,
            targetSpec
          );
          extras.push(
            singleSentence ??
              formatCompactAtkBasedDamageSentence(
                effect.amount,
                effect.damageType
              )
          );
        } else {
          const hint = formatCompactTargetHint(targetSpec);
          extras.push(`${hint}${dmgType}${amount}`);
        }
      } else {
        const power = dmgType ? `${dmgType} ${amount}` : amount;
        extras.push(power);
      }
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
      break;
    }
    case "heal":
      if (effect.healSubKind === "hot") {
        extras.push(
          `${HEAL_SUB_KIND_LABELS.hot} ${formatResourceAmount(effect.amount)} ${
            effect.durationSec ?? 0
          }s`
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
          extras.push(`ブロック率+${formatPercent(effect.chance ?? 0)}`);
        } else {
          extras.push(
            `${BUFF_SUB_KIND_LABELS.block} ${formatPercent(
              effect.chance ?? 0
            )} ${effect.buffDurationSec ?? 0}s`
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
            )} ${effect.buffDurationSec ?? 0}s`
          );
        }
      } else if (effect.buffSubKind === "damageDelay") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.damageDelay} ${formatPercent(
            effect.ratio ?? 0
          )} ${effect.buffDurationSec ?? 0}s`
        );
      } else if (effect.buffSubKind === "allyAttackFollowUp") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.allyAttackFollowUp} ${
            effect.buffDurationSec ?? 8
          }s 半径${
            effect.allyFollowUpRadiusPx ?? 70
          }px ${formatStatMultiplierLabel(
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
            } ${statLabel} ${effect.buffDurationSec ?? 0}s`
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
            `通常攻撃が${effect.hitCountMultiplier}回連続攻撃になる`
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
            patchParts.push(`${effect.primaryPatch.hitDurationSec}s`);
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
        extras.push(`${parts.join(" ")} ${effect.buffDurationSec ?? 0}s`);
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
          extras.push(`${flavorLabel} ${power} ${effect.durationSec ?? 0}s`);
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
          `${DEBUFF_SUB_KIND_LABELS.stun} ${effect.durationSec ?? 0}s`
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
          } ${statLabel} ${effect.debuffDurationSec ?? 0}s`
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
      extras.push(`${power} ${effect.durationSec}s`);
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
            ? `アンカー ${effect.anchorOffsetPx > 0 ? "+" : ""}${
                effect.anchorOffsetPx
              }px`
            : "アンカー"
          : "接敵";
      extras.push(`${mode} ${effect.moveDurationSec}s`);
      break;
    }
    case "stun":
      extras.push(`${effect.durationSec}s`);
      break;
    case "knockback":
      extras.push(`${effect.distancePx}px+移動硬直${KNOCKBACK_MOVE_LOCK_SEC}s`);
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
        `${formatPercent(effect.blockChance)} ${effect.durationSec}s`
      );
      break;
    case "counter": {
      const responseParts = effect.responses.map(formatCounterResponse);
      extras.push(
        [
          responseParts.join(" / "),
          `${effect.durationSec}s`,
          formatCounterRangeSummary(effect.range),
        ]
          .filter(Boolean)
          .join(" ")
      );
      break;
    }
    case "enemyReelIn":
      break;
    case "arenaDominance": {
      if (effect.durationSec !== undefined) {
        extras.push(`${effect.durationSec}s`);
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
      extras.push(`${effect.fieldRadiusPx}px/${effect.fieldDurationSec}s`);
      if (effect.stayTickIntervalSec !== undefined) {
        extras.push(`滞在${effect.stayTickIntervalSec}s`);
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
        `蔓延${effect.spreadRadiusPx}px/${Math.round(
          effect.spreadDurationRatio * 100
        )}%`
      );
      break;
  }

  if (effect.range !== undefined && effect.type !== "counter" && !compact) {
    extras.push(`射程${effect.range}px`);
  }

  const kindLabel = formatEffectKindLabel(effect.type);
  const detail = extras.filter(Boolean).join(" ");
  if (compact) {
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
      return `回避 +${formatPercent(legacy.evasionChance ?? 0)}`;
    case "block":
      return `ブロック ${formatPercent(legacy.blockChance ?? 0)}`;
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
        return `周囲の${formatDamageTakenReductionRateLabel(percent)}`;
      }
      if (rule.kind === "self" && shape === "single") {
        return `自身の${formatDamageTakenReductionRateLabel(percent)}`;
      }
      return `${resolveGameTermTitle("damageReduction")}${formatPercent(
        percent
      )} → ${formatTarget(rule, { kind: "self" })}（${[
        formatTargetShape(passiveDamageReductionToEffectDef(def)),
        def.damageReductionRange !== undefined
          ? `${def.damageReductionRange}px`
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
        def.dispelRange !== undefined ? `${def.dispelRange}px` : null,
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
          parts.push(`周囲のブロック率+${formatPercent(def.chance)}`);
        } else {
          parts.push("周囲のブロック率");
        }
        if (def.frontBlockAuraMagicBlock) {
          parts.push("魔法ブロックを可能にする");
        }
        return parts.join("、");
      }
      if (def.effect === "blockResonance") {
        const parts: string[] = [];
        if (def.chance !== undefined) {
          parts.push(`ブロック率+${formatPercent(def.chance)}`);
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
      const durationLabel = duration <= 0 ? "無限" : `${duration}s`;
      const amount = def.hotAmount ? formatResourceAmount(def.hotAmount) : "—";
      const target = formatTarget(def.hotTargetRule, { kind: "self" });
      const hotMeta = [
        formatTargetShape(passiveHotToEffectDef(def)),
        def.hotRange !== undefined ? `${def.hotRange}px` : null,
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
        (def.buffStat as StatusEffectStat | StatusEffectStat[] | undefined) ??
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
      return `砲撃標的（着弾${radius}px内飛散${splash} / 自身${formatStatMultiplierLabel(
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
      return `味方物理basic ${chance}でpoison ${amount}/${dur}s`;
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
      return `熾火起爆（(ATK+種火×ATK×${n})×${mul} / spread${radius}px）${uncap}`;
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
      const range = def.buffRange !== undefined ? `${def.buffRange}px` : null;
      const metaParts = [shape, range];
      if (def.buffSubKind === "block") {
        return `ブロック率+${formatPercent(def.chance ?? 0)}`;
      }
      if (def.buffSubKind === "evasion") {
        const target = def.buffTargetRule ?? { kind: "self" };
        if (
          target.kind === "self" &&
          resolvePassivePeriodicTrigger(def) === undefined
        ) {
          return `回避+${formatPercent(def.chance ?? 0)}`;
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
        def.debuffRange !== undefined ? `${def.debuffRange}px` : null;
      const triggerLabel = formatPassiveTriggerSummary(
        def,
        resolvePassivePeriodicTrigger(def),
        "常時"
      );
      const meta = [shape, range, triggerLabel].filter(Boolean).join(" · ");
      return `デバフ ${formatStatsWithModifier(
        def.debuffStat,
        def.debuffMultiplier,
        def.debuffFlatBonus
      )} → ${target}${meta ? `（${meta}）` : ""}`;
    }
    case "extendSelfAppliedDebuff": {
      const parts = [`付与デバフ +${legacy.extendSec ?? 0}s`];
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

function formatPassiveSkillEffectLines(def: PassiveSkillDef): string[] {
  if (def.effect === "barrierDepletionHeal") {
    return formatBarrierDepletionHealEffectLines(def);
  }
  if (def.effect === "seedFlameOnActiveHit") {
    return formatSeedFlameOnActiveHitEffectLines(def);
  }
  return [formatPassiveEffect(def.effect, def)];
}

export type SkillCardLocale = "ja";

export type SkillCardLines = {
  metaLine: string;
  effectLines: string[];
};

function isActiveSkillDef(
  def: ActiveSkillDef | PassiveSkillDef
): def is ActiveSkillDef {
  return Array.isArray(def.effect);
}

function formatActiveSkillMetaLine(def: ActiveSkillDef): string {
  const trigger = resolveSkillTrigger(def);
  const parts: string[] = [
    `${ACTIVE_SKILL_RECAST_META_LABEL}：${formatCdLabel(trigger.kind, trigger.value)}`,
  ];

  const duration = resolveActiveSkillDurationLabel(def);
  if (duration) {
    parts.push(`持続：${duration}`);
  }

  const lock = formatActiveSkillLockMetaPart(def);
  if (lock) {
    parts.push(lock);
  }

  if ((def.firePolicy ?? "immediate") === "smart") {
    const condSummary = formatFireConditionsSummary(
      def.fireConditions,
      def.fireConditionMatch ?? "all"
    );
    if (condSummary) {
      parts.push(`発動条件：${condSummary}`);
    }
  }

  return parts.join(" / ");
}

function formatActiveSkillEffectLines(def: ActiveSkillDef): string[] {
  const specialLines = resolveActiveSkillSpecialEffectLines(def);
  if (specialLines) {
    return specialLines;
  }

  const selfOriginAoeBuffLines = formatSelfOriginAoeBuffCardLines(def);
  if (selfOriginAoeBuffLines) {
    const maxChargesLine = formatActiveSkillMaxChargesLine(def);
    return maxChargesLine
      ? [...selfOriginAoeBuffLines, maxChargesLine]
      : selfOriginAoeBuffLines;
  }

  return formatActiveSkillDefaultEffectLines(def, { includeMaxCharges: true });
}

function formatPassiveSkillMetaLine(def: PassiveSkillDef): string {
  if (def.effect === "counter" || def.effect === "counterChance") {
    return def.counterTrigger === "frontAllyDamaged"
      ? "周囲の味方被弾時"
      : "被攻撃時";
  }
  return formatPassiveTriggerSummary(def, resolvePassivePeriodicTrigger(def));
}

export function formatSkillCardLines(
  def: ActiveSkillDef | PassiveSkillDef,
  options: { locale: SkillCardLocale }
): SkillCardLines {
  if (options.locale !== "ja") {
    throw new Error(`Unsupported skill card locale: ${options.locale}`);
  }

  if (isActiveSkillDef(def)) {
    return {
      metaLine: formatActiveSkillMetaLine(def),
      effectLines: formatActiveSkillEffectLines(def),
    };
  }

  return {
    metaLine: formatPassiveSkillMetaLine(def),
    effectLines: formatPassiveSkillEffectLines(def),
  };
}

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return `効果：${formatPassiveEffect(def.effect, def)}`;
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  const parts = [formatActiveSkillMetaLine(def)];

  const effects = formatActiveSkillEffectBody(def);
  if (effects) {
    parts.push(effects);
  }

  return `${parts.join(" / ")} /`;
}
