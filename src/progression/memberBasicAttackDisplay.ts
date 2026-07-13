import type { AppLocale } from '../i18n/locale.ts';
import { getLocale } from '../i18n/locale.ts';
import { getBasicAttackAttributeLabel } from '../i18n/memberStatLabels.ts';
import { formatAttackMethodLabel } from '../battle/rangeLimits.ts';
import { resolvePresetBasicAttackMethod } from '../battle/data/resolveUnitAttackMethod.ts';
import { formatUiDistanceValue } from '../ui/formatUiDistance.ts';
import type {
  ActiveSkillDef,
  ClassPreset,
  DamageType,
  SkillEffectDef,
  SkillRegistry,
} from '../battle/types.ts';

export type MemberBasicAttackAttribute = 'physical' | 'magic' | 'heal';

/** @deprecated use {@link getBasicAttackAttributeLabel} */
export const MEMBER_BASIC_ATTACK_ATTRIBUTE_LABELS: Record<
  MemberBasicAttackAttribute,
  string
> = {
  physical: '物理',
  magic: '魔法',
  heal: '回復',
};

export interface MemberBasicAttackDisplay {
  rangeLabel: string;
  attributeLabel: string;
}

function getBasicAttackPrimaryEffect(
  skill: ActiveSkillDef,
): SkillEffectDef | undefined {
  return skill.effect.find(
    (effect) => effect.type !== 'move' && effect.type !== 'counter',
  );
}

function resolveBasicAttackRangePx(
  preset: ClassPreset,
  skill: ActiveSkillDef,
): number {
  const effect = getBasicAttackPrimaryEffect(skill);
  return effect?.range ?? preset.traits.rangePx;
}

export function resolveMemberBasicAttackAttribute(
  preset: ClassPreset,
  skill: ActiveSkillDef,
): MemberBasicAttackAttribute {
  const effect = getBasicAttackPrimaryEffect(skill);
  if (effect?.type === 'heal') return 'heal';
  if (effect?.type === 'damage') {
    const damageType: DamageType =
      effect.damageType ?? preset.traits.damageType ?? 'physical';
    return damageType === 'magic' ? 'magic' : 'physical';
  }
  return preset.traits.damageType === 'magic' ? 'magic' : 'physical';
}

export function resolveMemberBasicAttackDisplay(
  preset: ClassPreset,
  skillRegistry: SkillRegistry,
  locale: AppLocale = getLocale(),
): MemberBasicAttackDisplay | null {
  const skill = skillRegistry.actives[preset.basicAttackSkillId];
  if (!skill) return null;

  const rangePx = resolveBasicAttackRangePx(preset, skill);
  const attribute = resolveMemberBasicAttackAttribute(preset, skill);
  const attackMethod = resolvePresetBasicAttackMethod(preset, skillRegistry);
  const methodLabel = formatAttackMethodLabel(attackMethod, locale);
  const rangeDisplay = formatUiDistanceValue(rangePx);

  return {
    rangeLabel:
      locale === 'en'
        ? `${rangeDisplay} (${methodLabel})`
        : `${rangeDisplay}（${methodLabel}）`,
    attributeLabel: getBasicAttackAttributeLabel(attribute, locale),
  };
}

export function resolveMemberBasicAttackRangeLabel(
  preset: ClassPreset,
  skillRegistry: SkillRegistry,
  locale: AppLocale = getLocale(),
): string | null {
  return resolveMemberBasicAttackDisplay(preset, skillRegistry, locale)?.rangeLabel ?? null;
}
