import {
  PLACEHOLDER_SPRITE_KEYS,
  resolvePlaceholderIconKey,
} from './classVisuals.ts';
import type {
  ActiveSkillDef,
  ClassId,
  ClassPreset,
  NormalizedEntityTraits,
  PassiveSkillDef,
} from './types.ts';

export interface SkillIconContext {
  classPreset?: Pick<ClassPreset, 'role' | 'traits'>;
  classRegistry?: Record<ClassId, ClassPreset>;
}

type SkillIconSource = Pick<
  PassiveSkillDef | ActiveSkillDef,
  'id' | 'iconKey'
> & {
  allowedClassIds?: ClassId[];
};

const RANGED_ATTACKER_SKILL_PREFIXES = [
  'at_ranger_',
  'at_sniper_',
  'at_hunter_',
  'at_sorcerer_',
  'at_enchanter_',
  'at_geomancer_',
  'attacker_kyushi_',
  'attacker_jutsushi_',
] as const;

function placeholderTraits(rangePx: number): NormalizedEntityTraits {
  return {
    rangePx,
    damageType: 'physical',
    basicAttackVfx: { preset: rangePx >= 25 ? 'arrow' : 'slash' },
  };
}

function parseRoleFromSkillId(
  skillId: string,
): Pick<ClassPreset, 'role' | 'traits'> | undefined {
  if (skillId.startsWith('df_') || skillId.startsWith('defender_')) {
    return { role: 'defender', traits: placeholderTraits(0) };
  }
  if (skillId.startsWith('sp_') || skillId.startsWith('supporter_')) {
    return { role: 'supporter', traits: placeholderTraits(0) };
  }
  if (skillId.startsWith('at_') || skillId.startsWith('attacker_')) {
    const rangePx = RANGED_ATTACKER_SKILL_PREFIXES.some((prefix) =>
      skillId.startsWith(prefix),
    )
      ? 50
      : 0;
    return { role: 'attacker', traits: placeholderTraits(rangePx) };
  }
  return undefined;
}

function resolvePlaceholderFromClassPreset(
  preset: Pick<ClassPreset, 'role' | 'traits'>,
): string {
  return resolvePlaceholderIconKey(preset.role, preset.traits.rangePx);
}

export function resolveSkillIconKey(
  skill: SkillIconSource,
  context?: SkillIconContext,
): string {
  if (skill.iconKey) {
    return skill.iconKey;
  }

  const allowedClassId = skill.allowedClassIds?.[0];
  if (allowedClassId && context?.classRegistry?.[allowedClassId]) {
    return resolvePlaceholderFromClassPreset(
      context.classRegistry[allowedClassId],
    );
  }

  if (context?.classPreset) {
    return resolvePlaceholderFromClassPreset(context.classPreset);
  }

  const roleFromId = parseRoleFromSkillId(skill.id);
  if (roleFromId) {
    return resolvePlaceholderFromClassPreset(roleFromId);
  }

  return PLACEHOLDER_SPRITE_KEYS.supporter;
}
