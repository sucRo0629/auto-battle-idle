import {
  defaultTargetForEffectType,
  formatTargetLabel,
} from '../battle/skills/targetSpec.ts';
import { resolveSkillTrigger } from '../battle/skillTrigger.ts';
import {
  DEBUFF_FILTER_TAG_LABELS,
  TARGET_SHAPE_LABELS,
} from '../battle/data/gameDataSchema.ts';
import type {
  ActiveSkillDef,
  DamageIncreaseCondition,
  DamageType,
  PassiveSkillDef,
  PassiveEffectKind,
  ResourceAmountSpec,
  SkillEffectDef,
  SkillTriggerKind,
  StatusEffectStat,
  TargetSpec,
} from '../battle/types.ts';
import { asStatusEffectStatList } from '../battle/types.ts';

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  physical: '物理',
  magic: '魔法',
};

const STATUS_STAT_SHORT: Record<StatusEffectStat, string> = {
  atk: 'ATK',
  def: 'DEF',
  reg: '耐魔',
  damageTaken: '被ダメ',
};

function formatTriggerLabel(kind: SkillTriggerKind, value: number): string {
  switch (kind) {
    case 'time':
      return `${value}s`;
    case 'basicAttackCount':
      return `${value}攻撃`;
    case 'hitsTaken':
      return `被攻撃${value}回`;
  }
}

function formatTarget(spec: TargetSpec | undefined, fallback: TargetSpec): string {
  return formatTargetLabel(spec ?? fallback);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatAtkScale(scale: number | undefined): string {
  const s = scale ?? 1;
  if (s === 1) return 'ATK';
  return `ATK×${s}`;
}

function formatResourceAmount(amount: ResourceAmountSpec | undefined): string {
  if (!amount) return '—';
  switch (amount.kind) {
    case 'atkBased': {
      const scale = amount.atkScale ?? 1;
      const offset = amount.atkOffset ?? 0;
      if (offset === 0) return formatAtkScale(scale);
      const sign = offset > 0 ? '+' : '';
      return `(ATK${sign}${offset})×${scale}`;
    }
    case 'flat':
      return `固定${amount.flatAmount ?? 0}`;
    case 'percentMaxHp':
      return `maxHp×${formatPercent(amount.percentOfMaxHp ?? 0)}`;
  }
}

function formatStatusStats(
  stat: StatusEffectStat | StatusEffectStat[] | undefined,
): string {
  return asStatusEffectStatList(stat)
    .map((s) => STATUS_STAT_SHORT[s])
    .join('・');
}

function formatStatModifier(
  multiplier: number | undefined,
  flatBonus: number | undefined,
): string {
  const parts: string[] = [];
  if (multiplier !== undefined && multiplier !== 1) {
    parts.push(`×${multiplier}`);
  }
  if (flatBonus !== undefined && flatBonus !== 0) {
    const sign = flatBonus > 0 ? '+' : '';
    parts.push(`${sign}${flatBonus}`);
  }
  return parts.length > 0 ? parts.join(' ') : '—';
}

function formatDamageIncreaseCondition(condition: DamageIncreaseCondition): string {
  switch (condition.kind) {
    case 'debuff': {
      const tags = condition.tags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join('・');
      const prefix = condition.selfAppliedOnly ? '自分付与の' : '';
      return `${prefix}${tags}`;
    }
    case 'targetHp':
      return `対象HP${formatPercent(condition.maxHpRatio)}以下`;
    case 'selfHp':
      if (condition.mode === 'scaling' && condition.maxMul !== undefined) {
        return `自HP低下（最大×${condition.maxMul}）`;
      }
      return `自HP${formatPercent(condition.maxHpRatio)}以下`;
  }
}

function formatDamageIncreaseSpec(
  spec: PassiveSkillDef['damageIncrease'] | SkillEffectDef['damageIncrease'],
): string {
  if (!spec) return '';
  const cond = spec.conditions.map(formatDamageIncreaseCondition).join('・');
  const base = `特効×${spec.scale}`;
  return cond ? `${base}（${cond}）` : base;
}

function formatDefenseIgnoreSpec(
  spec: PassiveSkillDef['defenseIgnore'] | SkillEffectDef['defenseIgnore'],
): string {
  if (!spec) return '';
  const parts: string[] = [];
  if (spec.def) {
    parts.push(
      spec.def.mode === 'flat'
        ? `DEF無視${spec.def.amount}`
        : `DEF無視${formatPercent(spec.def.amount)}`,
    );
  }
  if (spec.reg) {
    parts.push(`耐魔無視${formatPercent(spec.reg.percent)}`);
  }
  return parts.join(' ');
}

function formatTargetShape(effect: SkillEffectDef): string {
  const shape = effect.targetShape ?? 'single';
  const parts: string[] = [TARGET_SHAPE_LABELS[shape]];

  switch (shape) {
    case 'aoe':
      if (effect.aoeRadiusPx !== undefined) {
        parts.push(`±${effect.aoeRadiusPx}px`);
      }
      break;
    case 'single':
    case 'multiLock':
      if (effect.hitCount !== undefined && effect.hitCount > 1) {
        parts.push(`×${effect.hitCount}`);
      }
      break;
    case 'pierce':
      if (effect.pierceDurationSec !== undefined && effect.pierceDurationSec > 0) {
        parts.push(`${effect.pierceDurationSec}s`);
      }
      break;
    case 'chain':
      if (effect.chainCount !== undefined) {
        parts.push(`×${effect.chainCount}`);
      }
      break;
    case 'scatter':
      if (effect.scatterHitCount !== undefined) {
        parts.push(`×${effect.scatterHitCount}`);
      }
      if (effect.scatterRadiusPx !== undefined) {
        parts.push(`半径${effect.scatterRadiusPx}px`);
      }
      break;
  }

  return parts.join(' ');
}

function formatActiveEffectDetail(effect: SkillEffectDef): string {
  const target = formatTarget(
    effect.target,
    defaultTargetForEffectType(effect.type),
  );
  const shape = formatTargetShape(effect);
  const extras: string[] = [];

  switch (effect.type) {
    case 'damage': {
      const dmgType = effect.damageType
        ? DAMAGE_TYPE_LABELS[effect.damageType]
        : '';
      const amount = formatResourceAmount(effect.amount);
      const power = dmgType ? `${dmgType} ${amount}` : amount;
      extras.push(power);
      const inc = formatDamageIncreaseSpec(effect.damageIncrease);
      if (inc) extras.push(inc);
      const ign = formatDefenseIgnoreSpec(effect.defenseIgnore);
      if (ign) extras.push(ign);
      break;
    }
    case 'heal':
      extras.push(formatResourceAmount(effect.amount));
      break;
    case 'buff':
      extras.push(
        `${formatStatusStats(effect.buffStat)} ${formatStatModifier(effect.buffMultiplier, effect.buffFlatBonus)} ${effect.buffDurationSec}s`,
      );
      break;
    case 'debuff':
      extras.push(
        `${formatStatusStats(effect.debuffStat)} ${formatStatModifier(effect.debuffMultiplier, effect.debuffFlatBonus)} ${effect.debuffDurationSec}s`,
      );
      break;
    case 'hot':
      extras.push(
        `${formatResourceAmount(effect.amount)} ${effect.durationSec}s`,
      );
      break;
    case 'dot': {
      const dmgType = effect.damageType
        ? DAMAGE_TYPE_LABELS[effect.damageType]
        : '';
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
    case 'barrier': {
      const stack = effect.barrierStack ? '加算' : '置換';
      extras.push(`${formatResourceAmount(effect.amount)}（${stack}）`);
      break;
    }
    case 'move': {
      const mode =
        effect.moveMode === 'behindTarget'
          ? '背後'
          : effect.moveMode === 'toAnchor'
            ? 'アンカー'
            : '接敵';
      extras.push(`${mode} ${effect.moveDurationSec}s`);
      break;
    }
    case 'stun':
      extras.push(`${effect.durationSec}s`);
      break;
    case 'knockback':
      extras.push(`${effect.distancePx}px`);
      break;
    case 'dispel': {
      const tags =
        effect.dispelTags && effect.dispelTags.length > 0
          ? effect.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join('・')
          : '全デバフ';
      extras.push(`${tags} ×${effect.dispelCount}`);
      break;
    }
    case 'block':
      extras.push(`${formatPercent(effect.blockChance)} ${effect.durationSec}s`);
      break;
  }

  if (effect.range !== undefined) {
    extras.push(`射程${effect.range}px`);
  }

  const kindLabel = formatEffectKindLabel(effect.type);
  const detail = extras.filter(Boolean).join(' ');
  return `${kindLabel} ${detail} → ${target} / ${shape}`.trim();
}

function formatEffectKindLabel(kind: SkillEffectDef['type']): string {
  switch (kind) {
    case 'damage':
      return 'ダメージ';
    case 'heal':
      return '回復';
    case 'buff':
      return 'バフ';
    case 'debuff':
      return 'デバフ';
    case 'hot':
      return 'HoT';
    case 'dot':
      return 'DoT';
    case 'barrier':
      return 'バリア';
    case 'move':
      return '移動';
    case 'stun':
      return 'スタン';
    case 'knockback':
      return 'ノックバック';
    case 'dispel':
      return 'デバフ解除';
    case 'block':
      return 'ブロック';
  }
}

function formatPassiveEffect(effect: PassiveEffectKind, def: PassiveSkillDef): string {
  switch (effect) {
    case 'targetRuleOverride':
      return `ターゲット → ${formatTarget(def.targetRuleOverride, { kind: 'distance', side: 'enemy', order: 'nearest' })}`;
    case 'evasionChance':
      return `回避 +${formatPercent(def.evasionChance ?? 0)}`;
    case 'block':
      return `ブロック ${formatPercent(def.blockChance ?? 0)}`;
    case 'damageIncrease':
      return formatDamageIncreaseSpec(def.damageIncrease) || '特効ダメージ';
    case 'damageReduction':
      return `被ダメ軽減 ${formatPercent(def.damageReductionPercent ?? 0)} → ${formatTarget(def.damageReductionTargetRule, { kind: 'self' })}`;
    case 'defenseIgnore':
      return formatDefenseIgnoreSpec(def.defenseIgnore) || '防御無視';
    case 'periodicDispel': {
      const tags =
        def.dispelTags && def.dispelTags.length > 0
          ? def.dispelTags.map((t) => DEBUFF_FILTER_TAG_LABELS[t]).join('・')
          : '全デバフ';
      const target = def.dispelTargetRule
        ? ` → ${formatTarget(def.dispelTargetRule, { kind: 'self' })}`
        : '';
      return `定期デバフ解除 ${def.intervalSec ?? 0}s（${tags} ×${def.dispelCount ?? 1}）${target}`;
    }
    case 'damageTakenToHeal':
      return `被ダメの ${formatPercent(def.ratio ?? 0)} を即時回復`;
    case 'healReceivedIncrease':
      return `被回復 +${formatPercent(def.percent ?? 0)}`;
    case 'hot': {
      const interval = def.intervalSec ?? 0;
      const duration = def.hotDurationSec ?? 0;
      const durationLabel = duration <= 0 ? '無限' : `${duration}s`;
      const amount = def.hotAmount
        ? formatResourceAmount(def.hotAmount)
        : '—';
      return `HoT ${interval}s毎 ${amount} → ${formatTarget(def.hotTargetRule, { kind: 'self' })}（${durationLabel}）`;
    }
    case 'excessHealToBarrier':
      return `余剰回復バリア ×${def.barrierScale ?? 1}`;
    case 'extendSelfAppliedDebuff': {
      const parts = [`付与デバフ +${def.extendSec ?? 0}s`];
      if (def.durationMultiplier !== undefined && def.durationMultiplier !== 1) {
        parts.push(`時間×${def.durationMultiplier}`);
      }
      return parts.join(' ');
    }
    case 'aoeCrowdBonus':
      return `密集 +${def.perExtraTargetScale ?? 0}/体（上限 ${def.maxExtraTargets ?? 0}）`;
    default:
      return effect;
  }
}

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return formatPassiveEffect(def.effect, def);
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  const trigger = resolveSkillTrigger(def);
  const effects = def.effect.map(formatActiveEffectDetail).join(' / ');
  return `${formatTriggerLabel(trigger.kind, trigger.value)} / ${effects}`;
}
