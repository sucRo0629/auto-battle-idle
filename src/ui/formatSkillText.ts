import {
  defaultTargetForEffectType,
  formatTargetLabel,
} from "../battle/skills/targetSpec.ts";
import { resolveSkillTrigger } from "../battle/skillTrigger.ts";
import { KNOCKBACK_MOVE_LOCK_SEC } from "../battle/ccEffects.ts";
import {
  HERBAL_POTENCY_ACCUMULATE_SEC,
  HERBAL_POTENCY_HOT_TICK_SEC,
} from "../battle/herbalPotency.ts";
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
} from "../battle/data/gameDataSchema.ts";
import type {
  ActiveSkillDef,
  BuffTargetKind,
  CounterResponseDef,
  DamageIncreaseSpec,
  DamageIncreaseCondition,
  DamageType,
  FireCondition,
  PassiveSkillDef,
  PassiveEffectKind,
  ResourceAmountSpec,
  SkillEffectDef,
  SkillTriggerKind,
  DispelPriority,
  StatusEffectStat,
  TargetSpec,
} from "../battle/types.ts";
import {
  asStatusEffectStatList,
  filterStatusEffectStats,
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

const STATUS_STAT_SHORT: Record<StatusEffectStat, string> = {
  hp: "HP",
  atk: "ATK",
  def: "DEF",
  reg: "REG",
  damageTaken: "被ダメ",
  attackSpeed: "SPD",
};

function formatTriggerLabel(kind: SkillTriggerKind, value: number): string {
  switch (kind) {
    case "time":
      return value === 0 ? "チャージなし" : `${value}s`;
    case "basicAttackCount":
      return `${value}攻撃`;
    case "hitsTaken":
      return `${value}被攻撃`;
  }
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
      const op = condition.compare === "gte" ? "≥" : "≤";
      return `対象HP${op}${Math.round(condition.maxHpRatio * 100)}%`;
    }
    case "selfHp": {
      const op = condition.compare === "gte" ? "≥" : "≤";
      return `自HP${op}${Math.round(condition.maxHpRatio * 100)}%`;
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
      return `攻撃${value}`;
    case "hitsTaken":
      return `被撃${value}`;
  }
}

function isSelfTargetSpec(spec: TargetSpec): boolean {
  return spec.kind === "self";
}

function resolveEffectTargetSpec(
  effect: SkillEffectDef,
  inheritTarget?: TargetSpec,
): TargetSpec {
  return effect.target ?? inheritTarget ?? defaultTargetForEffectType(effect.type);
}

function formatCompactTargetHint(spec: TargetSpec): string {
  switch (spec.kind) {
    case "distance":
      if (spec.order === "nearest") return "至近";
      if (spec.order === "selfOrigin") return "自身起点";
      return "";
    case "stat":
      if (spec.side === "ally" && spec.stat === "hp" && spec.order === "ratio") {
        return "最低HP味方";
      }
      return "";
    case "all":
      return spec.side === "ally" ? "味方全体" : "";
    default:
      return "";
  }
}

function resolveActiveSkillScopePrefix(def: ActiveSkillDef): string | undefined {
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
  visit: (sec: number) => void,
): void {
  switch (effect.type) {
    case "buff":
      if (effect.buffDurationSec !== undefined && effect.buffDurationSec > 0) {
        visit(effect.buffDurationSec);
      }
      break;
    case "debuff":
      if (effect.debuffDurationSec !== undefined && effect.debuffDurationSec > 0) {
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

function resolveActiveSkillDurationLabel(
  def: ActiveSkillDef,
): string | undefined {
  if (def.effect.some((effect) => effect.type === "blockResonanceConsume")) {
    const base = def.blockResonanceStanceDurationBaseSec ?? 2;
    return `${base}+防壁スタック数秒`;
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

function resolveActiveSkillLockLabel(def: ActiveSkillDef): string | undefined {
  const hasConsume = def.effect.some(
    (effect) => effect.type === "blockResonanceConsume",
  );
  const useSec = def.useDurationSec ?? 0;
  if (useSec <= 0 && !hasConsume) return undefined;

  let label: string;
  if (hasConsume) {
    const base = def.blockResonanceStanceDurationBaseSec ?? (useSec || 2);
    label = `${base}+防壁スタック数秒`;
  } else {
    label = formatSecondsLabel(useSec);
  }
  if (def.useDurationPauseApproach) {
    label += "・移動停止";
  }
  return label;
}

function formatBlockResonanceConsumeSkillEffect(
  def: ActiveSkillDef,
): string {
  const radius = def.blockResonanceOnBlockKnockbackRadiusPx ?? 50;
  const damage = def.blockResonanceOnBlockDamage;
  const defScale =
    damage?.kind === "defBased" ? (damage.defScale ?? 1) : 1;
  return `「城塞の構え」：ブロック時半径${radius}px内の敵にDEF×${defScale}ダメ+ノックバック`;
}

function formatActiveSkillEffectBody(def: ActiveSkillDef): string {
  if (def.effect.some((effect) => effect.type === "blockResonanceConsume")) {
    return formatBlockResonanceConsumeSkillEffect(def);
  }
  const scopePrefix = resolveActiveSkillScopePrefix(def);
  const effectParts = def.effect
    .map((effect) =>
      formatActiveEffectDetail(effect, {
        compact: true,
        scopePrefix,
        inheritTarget: def.target,
      }),
    )
    .filter(Boolean)
    .join("、");
  if (scopePrefix && effectParts) {
    return `${scopePrefix}${effectParts}`;
  }
  return effectParts;
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

function formatPercent(value: number): string {
  const pct = value * 100;
  const roundedInt = Math.round(pct);
  if (Math.abs(pct - roundedInt) < 1e-9) {
    return `${roundedInt}%`;
  }
  const roundedOne = Math.round(pct * 10) / 10;
  return `${roundedOne}%`;
}

function formatAtkScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return "ATK";
  return `ATK×${s}`;
}

function formatDefScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return "DEF";
  return `DEF×${s}`;
}

function formatResourceAmount(amount: ResourceAmountSpec | undefined): string {
  if (!amount) return "—";
  switch (amount.kind) {
    case "atkBased": {
      const scale = amount.atkScale ?? 1;
      const offset = amount.atkOffset ?? 0;
      if (offset === 0) return formatAtkScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(ATK${sign}${offset})×${scale}`;
    }
    case "defBased": {
      const scale = amount.defScale ?? 1;
      const offset = amount.defOffset ?? 0;
      if (offset === 0) return formatDefScale(scale);
      const sign = offset > 0 ? "+" : "";
      return `(DEF${sign}${offset})×${scale}`;
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
    .map((s) => STATUS_STAT_SHORT[s])
    .join("・");
}

function formatFlatBonus(flat: number): string {
  if (flat > 0) return `+ ${flat}`;
  if (flat < 0) return `- ${Math.abs(flat)}`;
  return "0";
}

function formatStatWithModifier(
  stat: StatusEffectStat,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  const label = STATUS_STAT_SHORT[stat];
  const mul = multiplier ?? 1;
  const flat = flatBonus ?? 0;

  if (mul === 1 && flat === 0) return label;
  if (flat === 0) return `${label} ×${mul}`;
  if (mul === 1) return `${label} ${formatFlatBonus(flat)}`;
  return `( ${label} ${formatFlatBonus(flat)} ) ×${mul}`;
}

function formatStatsWithModifier(
  stat: StatusEffectStat | StatusEffectStat[] | undefined,
  multiplier: number | undefined,
  flatBonus: number | undefined
): string {
  return formatStatBuffModifierEntries(
    parseStatBuffModifiers({ buffStat: stat, buffMultiplier: multiplier, buffFlatBonus: flatBonus }),
    formatStatWithModifier,
  );
}

function formatBuffStatModifiersFromDef(
  def: {
    buffStatModifiers?: import("../battle/types.ts").StatBuffModifierEntry[];
    buffStat?: BuffTargetKind | BuffTargetKind[];
    buffMultiplier?: number;
    buffFlatBonus?: number;
  },
): string {
  return formatStatBuffModifierEntries(
    parseStatBuffModifiers(def),
    formatStatWithModifier,
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
      const prefix = condition.selfAppliedOnly ? "自分付与の" : "";
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
  },
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
    defaultTargetForEffectType(effect.type),
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
        const hint = formatCompactTargetHint(targetSpec);
        extras.push(`${hint}${dmgType}${amount}`);
      } else {
        const power = dmgType ? `${dmgType} ${amount}` : amount;
        extras.push(power);
      }
      const inc = formatDamageIncreaseSpec(effect.damageIncrease);
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
        const tags =
          effect.dispelTags && effect.dispelTags.length > 0
            ? effect.dispelTags
                .map((t) => DEBUFF_FILTER_TAG_LABELS[t])
                .join("・")
            : "全デバフ";
        extras.push(
          `${HEAL_SUB_KIND_LABELS.dispel} ${tags} ×${
            effect.dispelCount ?? 0
          }${formatDispelPriorityLabel(effect.dispelPriority)}`
        );
      } else if (compact) {
        const hint = formatCompactTargetHint(targetSpec);
        extras.push(`${hint}${formatResourceAmount(effect.amount)}回復`);
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
            `${formatResourceAmount(effect.amount)}${
              effect.barrierStack ? "（加算）" : ""
            }`,
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
          }（被ダメ×${formatPercent(effect.damageReductionRatio ?? 0.1)}）`
        );
      } else if (effect.buffSubKind === "block") {
        if (compact) {
          extras.push(`ブロック率+${formatPercent(effect.chance ?? 0)}`);
        } else {
          extras.push(
            `${BUFF_SUB_KIND_LABELS.block} ${formatPercent(effect.chance ?? 0)} ${
              effect.buffDurationSec ?? 0
            }s`
          );
        }
      } else if (effect.buffSubKind === "evasion") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.evasion} ${formatPercent(
            effect.chance ?? 0
          )} ${effect.buffDurationSec ?? 0}s`
        );
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
          }s 半径${effect.allyFollowUpRadiusPx ?? 70}px DEF×${(
            effect.followUpDefDebuffMultiplier ?? 0.95
          ).toFixed(2)}`
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
            `${BUFF_SUB_KIND_LABELS[effect.buffSubKind ?? "stat"]} ${statLabel} ${
              effect.buffDurationSec ?? 0
            }s`
          );
        }
      }
      break;
    case "basicAttackTransform": {
      if (compact) {
        const parts: string[] = [];
        if (effect.primaryEffectOverride !== undefined) {
          const override = effect.primaryEffectOverride;
          if (override.type === "damage") {
            const dmgType = override.damageType
              ? DAMAGE_TYPE_LABELS[override.damageType]
              : "";
            parts.push(
              `通常攻撃→${dmgType}${formatResourceAmount(override.amount)}`,
            );
          } else if (override.type === "heal") {
            parts.push(
              `通常攻撃→${formatResourceAmount(override.amount)}回復`,
            );
          }
        } else if (effect.primaryPatch !== undefined) {
          const patchParts: string[] = ["通常攻撃→"];
          if (effect.primaryPatch.damageType !== undefined) {
            patchParts.push(DAMAGE_TYPE_LABELS[effect.primaryPatch.damageType]);
          }
          if (effect.primaryPatch.amount?.atkScale !== undefined) {
            patchParts.push(`ATK×${effect.primaryPatch.amount.atkScale}`);
          }
          if (effect.primaryPatch.amount?.defScale !== undefined) {
            patchParts.push(`DEF×${effect.primaryPatch.amount.defScale}`);
          }
          parts.push(patchParts.join(""));
        }
        if (effect.appendEffects !== undefined && effect.appendEffects.length > 0) {
          for (const appendEffect of effect.appendEffects) {
            parts.push(
              formatActiveEffectDetail(appendEffect, {
                compact: true,
                inheritTarget: appendEffect.target,
              }),
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
              `ATK×${effect.primaryEffectOverride.amount.atkScale}`
            );
          }
          if (effect.primaryEffectOverride.amount?.defScale !== undefined) {
            overrideParts.push(
              `DEF×${effect.primaryEffectOverride.amount.defScale}`
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
            patchParts.push(`ATK×${effect.primaryPatch.amount.atkScale}`);
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
        const inc = formatDamageIncreaseSpec(effect.damageIncrease);
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
      const tags =
        effect.dispelTags && effect.dispelTags.length > 0
          ? effect.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・")
          : "全デバフ";
      extras.push(
        `${tags} ×${effect.dispelCount}${formatDispelPriorityLabel(
          effect.dispelPriority
        )}`
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
      extras.push("闘技士以外被ダメ−50%");
      extras.push("味方支援拒否");
      if (effect.nonMarkDamageMultiplier !== undefined) {
        extras.push(`非指名被ダメ×${effect.nonMarkDamageMultiplier}`);
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
      extras.push(`蔓延${effect.spreadRadiusPx}px/${Math.round(effect.spreadDurationRatio * 100)}%`);
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
      return "次与ダメ増加";
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
    case "targetRuleOverride": {
      const scope = def.targetRuleOverrideApplyTo ?? "enemy";
      const scopeLabel = scope === "ally" ? "味方向け" : "敵向け";
      return `${scopeLabel}ターゲット → ${formatTarget(def.targetRuleOverride, {
        kind: "distance",
        side: scope,
        order: "nearest",
      })}`;
    }
    case "evasionChance":
      return `回避 +${formatPercent(legacy.evasionChance ?? 0)}`;
    case "block":
      return `ブロック ${formatPercent(legacy.blockChance ?? 0)}`;
    case "damageIncrease":
      return (
        formatSpecialEffectSpec("damage", legacy.damageIncrease) ||
        "特効ダメージ"
      );
    case "damageReduction":
      return `被ダメ軽減 ${formatPercent(
        def.damageReductionPercent ?? 0
      )} → ${formatTarget(def.damageReductionTargetRule, { kind: "self" })}（${[
        formatTargetShape(passiveDamageReductionToEffectDef(def)),
        def.damageReductionRange !== undefined
          ? `${def.damageReductionRange}px`
          : null,
        "常時",
      ]
        .filter(Boolean)
        .join(" · ")}）`;
    case "defenseIgnore":
      return formatDefenseIgnoreSpec(def.defenseIgnore) || "防御無視";
    case "ignoredDefBonusDamage":
      return def.ignoredDefBonusScale !== undefined
        ? `無視DEF×${formatPercent(def.ignoredDefBonusScale)} 追加ダメ`
        : "無視DEFボーナス";
    case "bonusBasicAttackOnHit": {
      const chance = def.chance ?? 0.5;
      const conditions = def.bonusBasicAttackConditions ?? [];
      const parts: string[] = [];
      if (conditions.length > 0) {
        parts.push(
          conditions.map(formatDamageIncreaseCondition).join("・"),
        );
      }
      if (def.bonusBasicAttackHpRatio !== undefined) {
        parts.push(`HP≤${formatPercent(def.bonusBasicAttackHpRatio)}`);
      } else if (conditions.length === 0) {
        parts.push(`HP≤${formatPercent(0.3)}`);
      }
      const gate = parts.length > 0 ? parts.join("・") : "—";
      return `通常攻撃 Hit 後 ${gate} で ${formatPercent(chance)} 追加 Hit（非再帰）`;
    }
    case "periodicDispel": {
      const tags =
        def.dispelTags && def.dispelTags.length > 0
          ? def.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・")
          : "全デバフ";
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
          hpRatio,
        )}復活（Wave 1回まで）、自己被ダメ×${selfMul}、前列被ダメ×${frontMul}、${formatSecondsLabel(
          duration,
        )}`;
      }
      if (def.effect === "frontBlockAura") {
        const parts: string[] = [];
        if (def.chance !== undefined) {
          parts.push(`前列ブロック率+${formatPercent(def.chance)}`);
        } else {
          parts.push("前列ブロック率");
        }
        if (def.frontBlockAuraMagicBlock) {
          parts.push("魔法ブロック");
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
          `ブロック時「防壁」1スタック（上限${maxStacks})。「防壁」：1スタックごとに被ダメ-${formatPercent(perStack)}。${decay}秒ごとに1スタック消失`,
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
        potencyParts.push(
          `薬効体質 ${def.herbalPotencyConstitutionThresholds.join("/")}`
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
        `薬効蓄積 ${formatSecondsLabel(accumulateSec)}（実時間・HoT tick 非連動）`
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
    case "excessHealToBarrier": {
      const sourceLabels = (def.excessHealSources ?? ["outgoing"]).map((s) =>
        s === "outgoing" ? "与" : "被"
      );
      return `余剰回復バリア ×${def.barrierScale ?? 1}（${sourceLabels.join(
        "・"
      )}）`;
    }
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
      return `砲撃標的（着弾${radius}px内飛散${splash} / 自身SPD×${spd}）`;
    }
    case "dotCompressAssist":
      return `DoT圧縮基準×${def.dotCompressRatio ?? 0.7}`;
    case "allyBasicAttackDotProc": {
      const chance = formatPercent(def.chance ?? 0.2);
      const dur = def.debuffDotDurationSec ?? 5;
      const amount = formatResourceAmount(
        def.debuffDotAmount ?? { kind: "flat", flatAmount: 10 },
      );
      return `味方物理basic ${chance}でpoison ${amount}/${dur}s`;
    }
    case "dotDurationMultiplierOnApply": {
      const dur = def.dotDurationMultiplierOnApply ?? 1.5;
      const heal = def.dottedEnemyHealReceivedMultiplier;
      const healPart =
        heal !== undefined ? ` / dot中被回復×${heal}` : "";
      return `味方dot付与duration×${dur}${healPart}`;
    }
    case "dottedEnemyHealReceivedDebuff":
      return `dot中被回復×${def.dottedEnemyHealReceivedMultiplier ?? 0.8}`;
    case "conditionalEnemyDamageTakenAura":
      return `仕留め aura（hasDot+HP≤50% → 被ダメ×${def.enemyDamageTakenMultiplier ?? 1.2}）`;
    case "seedFlameOnActiveHit":
      return "active ダメージ Hit ごとに種火 +1 stack";
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
      const buffName = def.buffDisplayName ?? "癒しの残響";
      return `ヒール予約（回復時 対象HP${grant}以下で「${buffName}」付与 / ${duration}秒 / 被ダメ後HP${trigger}以下で${amount}回復）`;
    }
    case "barrierBreakRegen": {
      const amount = formatResourceAmount(
        def.barrierAmount ?? { kind: "atkBased", atkScale: 0.85 }
      );
      return `バリア破壊時 ${amount} 再生成（対象1回限り・HP回復ではない）`;
    }
    case "barrierDepletionHeal": {
      const amount = formatResourceAmount(
        def.healAmount ?? { kind: "atkBased", atkScale: 0.65 }
      );
      return `バリア完全消失時 ${amount} 即時回復（味方1回限り/Wave・障壁消費では発火しない）`;
    }
    case "buff": {
      const effectView = passiveBuffToEffectDef(def);
      const target = formatTarget(def.buffTargetRule, { kind: "self" });
      const shape = formatTargetShape(effectView);
      const range = def.buffRange !== undefined ? `${def.buffRange}px` : null;
      const metaParts = [shape, range];
      if (def.buffSubKind === "block") {
        return `ブロック率+${formatPercent(def.chance ?? 0)}`;
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
      return `バフ ${formatBuffStatModifiersFromDef(def)} → ${target}（${metaParts.filter(Boolean).join(" · ")}）`;
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
          ? "前列味方被弾時"
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
    case "threatControl": {
      const parts: string[] = [];
      if (
        def.onDamageTakenFlat !== undefined ||
        def.onDamageTakenScale !== undefined ||
        def.onBlockFlat !== undefined
      ) {
        parts.push("被ダメ・ブロック成功でヘイト上昇");
      }
      if (
        def.threatDecayMultiplier !== undefined &&
        def.threatDecayMultiplier < 1
      ) {
        parts.push("ヘイト減衰速度低下");
      }
      if (def.frontThreatFloor !== undefined) {
        parts.push(`前列ヘイト下限${formatPercent(def.frontThreatFloor)}`);
      }
      if (
        def.frontThreatDecayMultiplier !== undefined &&
        def.frontThreatDecayMultiplier < 1
      ) {
        parts.push("前列ヘイト減衰速度低下");
      }
      return parts.length > 0 ? parts.join("、") : "ヘイト制御";
    }
    default:
      return effect;
  }
}

export type SkillCardLocale = "ja";

export type SkillCardLines = {
  metaLine: string;
  effectLines: string[];
};

function isActiveSkillDef(
  def: ActiveSkillDef | PassiveSkillDef,
): def is ActiveSkillDef {
  return Array.isArray(def.effect);
}

function formatActiveSkillMetaLine(def: ActiveSkillDef): string {
  const trigger = resolveSkillTrigger(def);
  const parts: string[] = [`CD：${formatCdLabel(trigger.kind, trigger.value)}`];

  const duration = resolveActiveSkillDurationLabel(def);
  if (duration) {
    parts.push(`持続：${duration}`);
  }

  const lock = resolveActiveSkillLockLabel(def);
  if (lock) {
    parts.push(`硬直${lock}`);
  }

  if ((def.firePolicy ?? "immediate") === "smart") {
    const condSummary = formatFireConditionsSummary(
      def.fireConditions,
      def.fireConditionMatch ?? "all",
    );
    if (condSummary) {
      parts.push(`条件：${condSummary}`);
    }
  }

  return parts.join(" / ");
}

function formatActiveSkillEffectLines(def: ActiveSkillDef): string[] {
  const hasConsume = def.effect.some(
    (effect) => effect.type === "blockResonanceConsume",
  );
  const mappableEffects = def.effect.filter(
    (effect) => effect.type !== "blockResonanceConsume",
  );
  if (hasConsume && mappableEffects.length === 0) {
    return [formatBlockResonanceConsumeSkillEffect(def)];
  }

  const scopePrefix = resolveActiveSkillScopePrefix(def);
  const lines = mappableEffects
    .map((effect) =>
      formatActiveEffectDetail(effect, {
        compact: true,
        scopePrefix,
        inheritTarget: def.target,
      }),
    )
    .filter(Boolean);
  if (scopePrefix && lines.length > 0) {
    lines[0] = `${scopePrefix}${lines[0]}`;
  }
  return lines;
}

function formatPassiveSkillMetaLine(def: PassiveSkillDef): string {
  if (def.effect === "counter" || def.effect === "counterChance") {
    return def.counterTrigger === "frontAllyDamaged"
      ? "前列味方被弾時"
      : "被攻撃時";
  }
  return formatPassiveTriggerSummary(def, resolvePassivePeriodicTrigger(def));
}

export function formatSkillCardLines(
  def: ActiveSkillDef | PassiveSkillDef,
  options: { locale: SkillCardLocale },
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
    effectLines: [formatPassiveEffect(def.effect, def)],
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
