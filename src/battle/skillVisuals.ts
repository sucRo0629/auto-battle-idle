import {
  PLACEHOLDER_SPRITE_KEYS,
  resolvePlaceholderIconKey,
} from './classVisuals.ts';
import { resolveClassIconKey } from '../render/entityVisuals.ts';
import type {
  ActiveSkillDef,
  ClassId,
  ClassPreset,
  NormalizedEntityTraits,
  PassiveSkillDef,
} from './types.ts';

export interface SkillIconContext {
  classPreset?: Pick<ClassPreset, 'id' | 'role' | 'traits'>;
  classRegistry?: Record<ClassId, ClassPreset>;
}

type SkillIconSource = Pick<
  PassiveSkillDef | ActiveSkillDef,
  'id' | 'iconKey'
> & {
  allowedClassIds?: ClassId[];
};

const RANGED_PHYSICAL_ATTACKER_SKILL_PREFIXES = [
  'at_ranger_',
  'at_ballista_',
  'at_hunter_',
  'attacker_kyushi_',
] as const;

const RANGED_MAGIC_ATTACKER_SKILL_PREFIXES = [
  'at_sorcerer_',
  'at_sigilist_',
  'at_geomancer_',
  'attacker_jutsushi_',
] as const;

function placeholderTraits(
  rangePx: number,
  damageType: NormalizedEntityTraits['damageType'] = 'physical',
): NormalizedEntityTraits {
  return {
    rangePx,
    damageType,
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
    const isMagic = RANGED_MAGIC_ATTACKER_SKILL_PREFIXES.some((prefix) =>
      skillId.startsWith(prefix),
    );
    const isRanged =
      isMagic ||
      RANGED_PHYSICAL_ATTACKER_SKILL_PREFIXES.some((prefix) =>
        skillId.startsWith(prefix),
      );
    return {
      role: 'attacker',
      traits: placeholderTraits(isRanged ? 50 : 0, isMagic ? 'magic' : 'physical'),
    };
  }
  return undefined;
}

function resolvePlaceholderFromClassPreset(
  preset: Pick<ClassPreset, 'role' | 'traits'>,
): string {
  return resolvePlaceholderIconKey(
    preset.role,
    preset.traits.rangePx,
    preset.traits.damageType,
  );
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
    if (context.classPreset.id) {
      return resolveClassIconKey(context.classPreset);
    }
    return resolvePlaceholderFromClassPreset(context.classPreset);
  }

  const roleFromId = parseRoleFromSkillId(skill.id);
  if (roleFromId) {
    return resolvePlaceholderFromClassPreset(roleFromId);
  }

  return PLACEHOLDER_SPRITE_KEYS.supporter;
}
