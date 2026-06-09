import { TARGET_RULE_LABELS } from '../battle/data/gameDataSchema.ts';
import { resolveSkillTrigger } from '../battle/skillTrigger.ts';
import type {
  ActiveSkillDef,
  PassiveSkillDef,
  PassiveEffectKind,
  SkillEffectDef,
  SkillTriggerKind,
} from '../battle/types.ts';

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

function formatPassiveEffect(effect: PassiveEffectKind, def: PassiveSkillDef): string {
  switch (effect) {
    case 'targetRuleOverride':
      return `ターゲット → ${TARGET_RULE_LABELS[def.targetRuleOverride ?? 'frontEnemy']}`;
    case 'evasionChance':
      return `回避 +${def.evasionChance ?? 0}`;
    case 'damageIncrease':
      return `ダメージ増加 ×${def.damageIncrease?.scale ?? 1}`;
    case 'defenseIgnore':
      return '防御無視';
    case 'periodicDispel':
      return `定期デバフ解除 ${def.intervalSec ?? 0}s`;
    case 'damageTakenToHeal':
      return `被ダメの ${Math.round((def.ratio ?? 0) * 100)}% を即時回復`;
    case 'partyHotAura':
      return '味方全体 HoT';
    case 'excessHealToBarrier':
      return `余剰回復バリア ×${def.barrierScale ?? 1}`;
    case 'extendSelfAppliedDebuff':
      return '付与デバフ延長';
    case 'aoeCrowdBonus':
      return `密集 +${def.perExtraTargetScale ?? 0}/体（上限 ${def.maxExtraTargets ?? 0}）`;
    default:
      return effect;
  }
}

function formatEffectKind(effect: SkillEffectDef): string {
  switch (effect.type) {
    case 'damage':
      return 'ダメージ';
    case 'heal':
      return '回復';
    case 'buff':
      return 'buff';
    case 'debuff':
      return 'debuff';
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
  }
}

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return formatPassiveEffect(def.effect, def);
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  const effects = def.effect.map(formatEffectKind).join(' / ');
  const trigger = resolveSkillTrigger(def);
  return `${formatTriggerLabel(trigger.kind, trigger.value)} / ${effects}`;
}
