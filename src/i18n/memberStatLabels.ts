import type { AttackSpeedTier } from '../battle/types.ts';
import { getLocale, type AppLocale } from './locale.ts';
import { UI_MESSAGES } from './uiMessages.ts';
import type { UiMessageKey } from './uiMessages.ts';

export interface MemberStatLabels {
  hp: string;
  atk: string;
  def: string;
  reg: string;
  spd: string;
  range: string;
  basicAttack: string;
}

function messageForLocale(locale: AppLocale, key: UiMessageKey): string {
  return UI_MESSAGES[locale][key] ?? UI_MESSAGES.ja[key];
}

export function getMemberStatLabels(
  locale: AppLocale = getLocale(),
): MemberStatLabels {
  return {
    hp: messageForLocale(locale, 'stat.hp'),
    atk: messageForLocale(locale, 'stat.atk'),
    def: messageForLocale(locale, 'stat.def'),
    reg: messageForLocale(locale, 'stat.reg'),
    spd: messageForLocale(locale, 'stat.spd'),
    range: messageForLocale(locale, 'stat.range'),
    basicAttack: messageForLocale(locale, 'stat.basicAttack'),
  };
}

const ATTACK_SPEED_TIER_KEYS = {
  slow: 'attackSpeed.slow',
  somewhatSlow: 'attackSpeed.somewhatSlow',
  normal: 'attackSpeed.normal',
  somewhatFast: 'attackSpeed.somewhatFast',
  fast: 'attackSpeed.fast',
} as const satisfies Record<AttackSpeedTier, UiMessageKey>;

export function getAttackSpeedTierLabel(
  tier: AttackSpeedTier,
  locale: AppLocale = getLocale(),
): string {
  return messageForLocale(locale, ATTACK_SPEED_TIER_KEYS[tier]);
}

const BASIC_ATTACK_ATTRIBUTE_KEYS = {
  physical: 'basicAttackAttribute.physical',
  magic: 'basicAttackAttribute.magic',
  heal: 'basicAttackAttribute.heal',
} as const satisfies Record<'physical' | 'magic' | 'heal', UiMessageKey>;

export function getBasicAttackAttributeLabel(
  attribute: keyof typeof BASIC_ATTACK_ATTRIBUTE_KEYS,
  locale: AppLocale = getLocale(),
): string {
  return messageForLocale(locale, BASIC_ATTACK_ATTRIBUTE_KEYS[attribute]);
}
