import {
  PLACEHOLDER_SPRITE_KEYS,
  resolvePlaceholderIconKey,
} from './classVisuals.ts';
import type {
  ActiveSkillDef,
  ClassId,
  ClassPreset,
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

function parseRoleFromSkillId(
  skillId: string,
): Pick<ClassPreset, 'role' | 'traits'> | undefined {
  if (skillId.startsWith('defender_')) {
    return { role: 'defender', traits: { attackRange: 'melee' } };
  }
  if (skillId.startsWith('supporter_')) {
    return { role: 'supporter', traits: { attackRange: 'melee' } };
  }
  if (skillId.startsWith('attacker_')) {
    const attackRange =
      skillId.startsWith('attacker_kyushi_') ||
      skillId.startsWith('attacker_jutsushi_')
        ? 'ranged'
        : 'melee';
    return { role: 'attacker', traits: { attackRange } };
  }
  return undefined;
}

function resolvePlaceholderFromClassPreset(
  preset: Pick<ClassPreset, 'role' | 'traits'>,
): string {
  return resolvePlaceholderIconKey(preset.role, preset.traits.attackRange);
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
