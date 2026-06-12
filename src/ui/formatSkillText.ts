import {
  defaultTargetForEffectType,
  formatTargetLabel,
} from "../battle/skills/targetSpec.ts";
import { resolveSkillTrigger } from "../battle/skillTrigger.ts";
import {
  BUFF_SUB_KIND_LABELS,
  DEBUFF_FILTER_TAG_LABELS,
  DEBUFF_SUB_KIND_LABELS,
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
import { asStatusEffectStatList } from "../battle/types.ts";
import {
  PASSIVE_PERIODIC_TRIGGER_LABELS,
  resolvePassiveBarrierTrigger,
  resolvePassivePeriodicTrigger,
  usesHotAuraMode,
} from "../battle/passivePeriodicTrigger.ts";

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  physical: "物理",
  magic: "魔法",
};

const STATUS_STAT_SHORT: Record<StatusEffectStat, string> = {
  atk: "ATK",
  def: "DEF",
  reg: "REG",
  damageTaken: "被ダメ",
  attackSpeed: "SPD",
};

function formatTriggerLabel(kind: SkillTriggerKind, value: number): string {
  switch (kind) {
    case "time":
      return `${value}s`;
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
    case "waveEnd":
      return FIRE_CONDITION_KIND_LABELS.waveEnd;
    case "enemyCount": {
      const parts: string[] = [];
      if (condition.min !== undefined) parts.push(`≥${condition.min}`);
      if (condition.max !== undefined) parts.push(`≤${condition.max}`);
      const range = parts.length > 0 ? parts.join("") : "任意";
      const scope =
        condition.scope === "inRange" ? "射程内" : "生存";
      return `敵数${range}(${scope})`;
    }
  }
}

function formatFireConditionsSummary(
  conditions: FireCondition[] | undefined,
): string {
  if (!conditions || conditions.length === 0) return "";
  return conditions.map(formatFireConditionSummary).join(" & ");
}

function formatTarget(
  spec: TargetSpec | undefined,
  fallback: TargetSpec
): string {
  return formatTargetLabel(spec ?? fallback);
}

function formatDispelPriorityLabel(
  priority: DispelPriority | undefined,
): string {
  if (!priority || priority === "longest") return "";
  return ` ${DISPEL_PRIORITY_LABELS[priority]}優先`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
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
      const prefix =
        amount.maxHpRef === "self" ? "自身maxHp" : "maxHp";
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
  const list = Array.isArray(stat) ? stat : stat ? [stat] : [];
  const stats = list.filter(
    (entry): entry is StatusEffectStat =>
      entry === "atk" ||
      entry === "def" ||
      entry === "reg" ||
      entry === "damageTaken" ||
      entry === "attackSpeed"
  );
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
    parts.push(`耐魔無視${formatPercent(spec.reg.percent)}`);
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
      return `ノック${response.distancePx}px`;
  }
}

function formatActiveEffectDetail(effect: SkillEffectDef): string {
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
      break;
    }
    case "heal":
      if (effect.healSubKind === "hot") {
        extras.push(
          `${HEAL_SUB_KIND_LABELS.hot} ${formatResourceAmount(effect.amount)} ${
            effect.durationSec ?? 0
          }s`
        );
      } else if (effect.healSubKind === "dispel") {
        const tags =
          effect.dispelTags && effect.dispelTags.length > 0
            ? effect.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・")
            : "全デバフ";
        extras.push(
          `${HEAL_SUB_KIND_LABELS.dispel} ${tags} ×${effect.dispelCount ?? 0}${formatDispelPriorityLabel(effect.dispelPriority)}`
        );
      } else {
        extras.push(
          `${HEAL_SUB_KIND_LABELS[effect.healSubKind ?? "instant"]} ${formatResourceAmount(
            effect.amount
          )}`
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
          )}`
        );
      } else if (effect.buffSubKind === "block") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.block} ${formatPercent(effect.chance ?? 0)} ${
            effect.buffDurationSec ?? 0
          }s`
        );
      } else if (effect.buffSubKind === "evasion") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.evasion} ${formatPercent(effect.chance ?? 0)} ${
            effect.buffDurationSec ?? 0
          }s`
        );
      } else if (effect.buffSubKind === "damageTakenToHeal") {
        extras.push(
          `${BUFF_SUB_KIND_LABELS.damageTakenToHeal} ${formatPercent(
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
    case "debuff":
      if (effect.debuffSubKind === "dot") {
        const dmgType = effect.damageType
          ? DAMAGE_TYPE_LABELS[effect.damageType]
          : "";
        const power = dmgType
          ? `${dmgType} ×${effect.powerMultiplier ?? 0}`
          : `×${effect.powerMultiplier ?? 0}`;
        extras.push(
          `${DEBUFF_SUB_KIND_LABELS.dot} ${power} ${effect.durationSec ?? 0}s`
        );
        const inc = formatDamageIncreaseSpec(effect.damageIncrease);
        if (inc) extras.push(inc);
        const ign = formatDefenseIgnoreSpec(effect.defenseIgnore);
        if (ign) extras.push(ign);
      } else if (effect.debuffSubKind === "stun") {
        extras.push(`${DEBUFF_SUB_KIND_LABELS.stun} ${effect.durationSec ?? 0}s`);
      } else {
        const statLabel = formatStatsWithModifier(
          effect.debuffStat,
          effect.debuffMultiplier,
          effect.debuffFlatBonus
        );
        extras.push(
          `${DEBUFF_SUB_KIND_LABELS[effect.debuffSubKind ?? "stat"]} ${statLabel} ${
            effect.debuffDurationSec ?? 0
          }s`
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
        effect.moveMode === "behindTarget"
          ? "背後"
          : effect.moveMode === "toAnchor"
          ? "アンカー"
          : "接敵";
      extras.push(`${mode} ${effect.moveDurationSec}s`);
      break;
    }
    case "stun":
      extras.push(`${effect.durationSec}s`);
      break;
    case "knockback":
      extras.push(`${effect.distancePx}px`);
      break;
    case "dispel": {
      const tags =
        effect.dispelTags && effect.dispelTags.length > 0
          ? effect.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・")
          : "全デバフ";
      extras.push(
        `${tags} ×${effect.dispelCount}${formatDispelPriorityLabel(effect.dispelPriority)}`
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
      const range = effect.range !== undefined ? `射程${effect.range}` : "";
      extras.push(
        [responseParts.join(" / "), `${effect.durationSec}s`, range]
          .filter(Boolean)
          .join(" ")
      );
      break;
    }
  }

  if (effect.range !== undefined) {
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
        formatSpecialEffectSpec("damage", legacy.damageIncrease) || "特効ダメージ"
      );
    case "damageReduction":
      return `被ダメ軽減 ${formatPercent(
        def.damageReductionPercent ?? 0
      )} → ${formatTarget(def.damageReductionTargetRule, { kind: "self" })}`;
    case "defenseIgnore":
      return formatDefenseIgnoreSpec(def.defenseIgnore) || "防御無視";
    case "periodicDispel": {
      const tags =
        def.dispelTags && def.dispelTags.length > 0
          ? def.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join("・")
          : "全デバフ";
      const target = def.dispelTargetRule
        ? ` → ${formatTarget(def.dispelTargetRule, { kind: "self" })}`
        : "";
      const trigger = resolvePassivePeriodicTrigger(def);
      const triggerLabel =
        trigger === "interval"
          ? `${def.intervalSec ?? 0}s毎`
          : trigger
            ? PASSIVE_PERIODIC_TRIGGER_LABELS[trigger]
            : `${def.intervalSec ?? 0}s毎`;
      return `定期デバフ解除 ${triggerLabel}（${tags} ×${
        def.dispelCount ?? 1
      }${formatDispelPriorityLabel(def.dispelPriority)}）${target}`;
    }
    case "damageTakenToHeal":
      return `被ダメの ${formatPercent(def.ratio ?? 0)} を即時回復`;
    case "specialEffect":
      return (
        formatSpecialEffectSpec(def.specialEffectApplyTo, def.specialEffect) ||
        "特効効果"
      );
    case "healReceivedIncrease":
      return (
        formatSpecialEffectSpec("heal", {
          scale: 1 + (legacy.percent ?? 0),
          conditions: [{ kind: "targetHp", maxHpRatio: 1 }],
        }) || `被回復 +${formatPercent(legacy.percent ?? 0)}`
      );
    case "hot":
    case "heal": {
      if (def.effect === "heal" && (def.healSubKind ?? "hot") !== "hot") {
        return HEAL_SUB_KIND_LABELS[def.healSubKind ?? "instant"];
      }
      const duration = def.hotDurationSec ?? 0;
      const durationLabel = duration <= 0 ? "無限" : `${duration}s`;
      const amount = def.hotAmount ? formatResourceAmount(def.hotAmount) : "—";
      const target = formatTarget(def.hotTargetRule, { kind: "self" });
      if (usesHotAuraMode(def)) {
        return `常時 HoT ${amount} → ${target}（${durationLabel}）`;
      }
      const trigger = resolvePassivePeriodicTrigger(def);
      const triggerLabel =
        trigger === "interval"
          ? `${def.intervalSec ?? 0}s毎`
          : trigger
            ? PASSIVE_PERIODIC_TRIGGER_LABELS[trigger]
            : `${def.intervalSec ?? 0}s毎`;
      return `HoT ${triggerLabel} ${amount} → ${target}（${durationLabel}）`;
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
    case "buff": {
      const target = formatTarget(def.buffTargetRule, { kind: "self" });
      if (def.buffSubKind === "block") {
        return `バフ ${BUFF_SUB_KIND_LABELS.block} ${formatPercent(
          def.chance ?? 0
        )} → ${target}`;
      }
      if (def.buffSubKind === "evasion") {
        return `バフ ${BUFF_SUB_KIND_LABELS.evasion} ${formatPercent(
          def.chance ?? 0
        )} → ${target}`;
      }
      if (def.buffSubKind === "damageTakenToHeal") {
        return `バフ ${BUFF_SUB_KIND_LABELS.damageTakenToHeal} ${formatPercent(
          def.ratio ?? 0
        )} → ${target}`;
      }
      if (def.buffSubKind === "barrier") {
        const amount = def.barrierAmount
          ? formatResourceAmount(def.barrierAmount)
          : "—";
        const trigger = resolvePassiveBarrierTrigger(def);
        const triggerLabel =
          trigger === "interval"
            ? `${def.intervalSec ?? 0}s毎`
            : PASSIVE_PERIODIC_TRIGGER_LABELS[trigger];
        return `バフ ${BUFF_SUB_KIND_LABELS.barrier} ${triggerLabel} ${amount} → ${target}`;
      }
      return `バフ ${formatBuffTargetStats(
        def.buffStat,
        def.buffMultiplier,
        def.buffFlatBonus
      )} → ${target}`;
    }
    case "debuff": {
      const target = formatTarget(def.debuffTargetRule, {
        kind: "distance",
        side: "enemy",
        order: "nearest",
      });
      return `デバフ ${formatStatsWithModifier(
        def.debuffStat,
        def.debuffMultiplier,
        def.debuffFlatBonus
      )} → ${target}`;
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
      const range =
        def.counterRange !== undefined ? `射程${def.counterRange}` : "";
      const bandParts: string[] = [];
      if (def.counterMelee) bandParts.push("近接");
      if (def.counterRanged) bandParts.push("遠隔");
      const band =
        bandParts.length > 0 ? `対象${bandParts.join("・")}` : "";
      return [
        `被攻撃時 ${formatPercent(def.chance ?? legacy.counterChance ?? 0)} で反撃`,
        responseParts.join(" / "),
        range,
        band,
      ]
        .filter(Boolean)
        .join(" ");
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
  const headerParts = [`${formatTriggerLabel(trigger.kind, trigger.value)}毎`];
  const stopSec = def.useDurationSec ?? 0;
  if (stopSec > 0) {
    headerParts.push(`停止${stopSec}s`);
  }
  if ((def.firePolicy ?? "immediate") === "smart") {
    const condSummary = formatFireConditionsSummary(def.fireConditions);
    headerParts.push(condSummary ? `smart: ${condSummary}` : "smart");
    if (def.fireTimeoutSec !== undefined && def.fireTimeoutSec > 0) {
      headerParts.push(`待機上限${def.fireTimeoutSec}s`);
    }
  }
  if ((def.maxCharges ?? 1) > 1) {
    headerParts.push(`ストック上限${def.maxCharges}`);
  }
  const effects = def.effect.map(formatActiveEffectDetail).join(" / ");
  return `${headerParts.join(" / ")} / ${effects}`;
}
