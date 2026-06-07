import type {
  ActiveSkillDef,
  PassiveSkillDef,
  PassiveEffectKind,
  SkillEffectDef,
} from '../battle/types.ts';

function formatPassiveEffect(effect: PassiveEffectKind, def: PassiveSkillDef): string {
  switch (effect) {
    case 'damageMultiplier':
      return `与ダメ ×${def.damageMultiplier ?? 1}`;
    case 'damageTakenMultiplier':
      return `被ダメ ×${def.damageTakenMultiplier ?? 1}`;
    case 'healBonus':
      return `回復 +${def.healBonus ?? 0}`;
    case 'targetRuleOverride':
      return `ターゲット → ${def.targetRuleOverride ?? '?'}`;
    case 'evasionChance':
      return `回避 +${def.evasionChance ?? 0}`;
    case 'activeCooldownRate':
      return `アクティブCD ×${def.activeCooldownRate ?? 1}`;
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
  }
}

export function formatPassiveDescription(def: PassiveSkillDef): string {
  return formatPassiveEffect(def.effect, def);
}

export function formatActiveDescription(def: ActiveSkillDef): string {
  const effects = def.effect.map(formatEffectKind).join(' / ');
  return `CD ${def.interval}s / ${effects}`;
}
