import {
  defaultTargetForEffectType,
  formatTargetLabel,
} from "../battle/skills/targetSpec.ts";
import { resolveSkillTrigger } from "../battle/skillTrigger.ts";
import { KNOCKBACK_MOVE_LOCK_SEC } from "../battle/ccEffects.ts";
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
      return `迎撃stack≥${condition.min}`;
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
  const stats = asStatusEffectStatList(stat);
  if (stats.length === 0) return "—";
  return stats
    .map((s) => formatStatWithModifier(s, multiplier, flatBonus))
    .join("・");
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

function formatActiveEffectDetail(effect: SkillEffectDef): string {
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

  const target = formatTarget(
    effect.target,
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
      const power = dmgType ? `${dmgType} ${amount}` : amount;
      extras.push(power);
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
        extras.push(
          `${BUFF_SUB_KIND_LABELS.barrier} ${formatResourceAmount(
            effect.amount
          )}${effect.barrierStack ? "（加算）" : ""}`
        );
      } else if (effect.buffSubKind === "wardBarrier") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.wardBarrier} ×${
            effect.stacks ?? 1
          }（被ダメ×${formatPercent(effect.damageReductionRatio ?? 0.1)}）`
        );
      } else if (effect.buffSubKind === "block") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.block} ${formatPercent(effect.chance ?? 0)} ${
            effect.buffDurationSec ?? 0
          }s`
        );
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
      } else {
        const statLabel = formatBuffTargetStats(
          effect.buffStat,
          effect.buffMultiplier,
          effect.buffFlatBonus
        );
        extras.push(
          `${BUFF_SUB_KIND_LABELS[effect.buffSubKind ?? "stat"]} ${statLabel} ${
            effect.buffDurationSec ?? 0
          }s`
        );
      }
      break;
    case "basicAttackTransform": {
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
  }

  if (effect.range !== undefined && effect.type !== "counter") {
    extras.push(`射程${effect.range}px`);
  }

  const kindLabel = formatEffectKindLabel(effect.type);
  const detail = extras.filter(Boolean).join(" ");
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
      const ratio = def.bonusBasicAttackHpRatio ?? 0.3;
      const chance = def.chance ?? 0.5;
      return `通常攻撃 Hit 後 HP≤${formatPercent(ratio)} で ${formatPercent(chance)} 追加 Hit（非再帰）`;
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
        return "致死時 3秒無敵（Wave 1回・HP≤25%）";
      }
      if (def.effect === "lastStandRecovery") {
        const hpRatio = def.lastStandRecoveryHpRatio ?? 0.5;
        const selfMul = def.lastStandRecoverySelfDamageTakenMultiplier ?? 0.5;
        const frontMul =
          def.lastStandRecoveryFrontAllyDamageTakenMultiplier ?? 0.75;
        const duration = def.lastStandRecoveryDurationSec ?? 5;
        return `致死時 HP${formatPercent(
          hpRatio
        )}復活（Wave 1回）· 自己被ダメ×${selfMul} · 前列×${frontMul} · ${duration}s`;
      }
      if (def.effect === "frontBlockAura") {
        const parts: string[] = ["前列 block aura"];
        if (def.chance !== undefined) {
          parts.push(`+${formatPercent(def.chance)}`);
        }
        if (def.frontBlockAuraMagicBlock) {
          parts.push("魔法 block");
        }
        return parts.join(" · ");
      }
      if (def.effect === "blockResonance") {
        const parts: string[] = [];
        if (def.chance !== undefined) {
          parts.push(`ブロック +${formatPercent(def.chance)}`);
        }
        if (def.blockResonanceMaxStacks !== undefined) {
          parts.push(`上限${def.blockResonanceMaxStacks} stack`);
        }
        if (def.blockResonanceDamageTakenPerStack !== undefined) {
          parts.push(
            `被ダメ-${formatPercent(
              def.blockResonanceDamageTakenPerStack
            )}/stack`
          );
        }
        if (def.blockResonanceDecayIntervalSec !== undefined) {
          parts.push(`減衰 ${def.blockResonanceDecayIntervalSec}s`);
        }
        return parts.length > 0 ? parts.join(" · ") : "迎撃態勢";
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
          `体質 ${def.herbalPotencyConstitutionThresholds.join("/")}`
        );
      }
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
        const triggerLabel = formatPassiveTriggerLabel(
          resolvePassivePeriodicTrigger(def),
          "常時"
        );
        metaParts.push(triggerLabel);
        return `バフ ${BUFF_SUB_KIND_LABELS.block} ${formatPercent(
          def.chance ?? 0
        )} → ${target}（${metaParts.filter(Boolean).join(" · ")}）`;
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
      return `バフ ${formatBuffTargetStats(
        def.buffStat,
        def.buffMultiplier,
        def.buffFlatBonus
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
      return [
        `被攻撃時 ${formatPercent(
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

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return formatPassiveEffect(def.effect, def);
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  const trigger = resolveSkillTrigger(def);
  const triggerHeader =
    trigger.kind === "time" && trigger.value === 0
      ? "チャージなし"
      : `${formatTriggerLabel(trigger.kind, trigger.value)}毎`;
  const headerParts = [triggerHeader];
  const stopSec = def.useDurationSec ?? 0;
  if (stopSec > 0) {
    headerParts.push(`停止${stopSec}s`);
  }
  if ((def.firePolicy ?? "immediate") === "smart") {
    const condSummary = formatFireConditionsSummary(
      def.fireConditions,
      def.fireConditionMatch ?? "all"
    );
    headerParts.push(condSummary ? `smart: ${condSummary}` : "smart");
    if (def.fireTimeoutSec !== undefined && def.fireTimeoutSec > 0) {
      headerParts.push(`待機上限${def.fireTimeoutSec}s`);
    }
  }
  if ((def.maxCharges ?? 0) > 0) {
    headerParts.push(`ストック上限${def.maxCharges}`);
  }
  const effects = def.effect.map(formatActiveEffectDetail).join(" / ");
  return `${headerParts.join(" / ")} / ${effects}`;
}
