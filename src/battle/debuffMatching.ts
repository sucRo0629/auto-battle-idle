import { DEBUFF_FILTER_TAG_OPTIONS } from './data/gameDataSchema.ts';
import type {
  CombatantState,
  DebuffFilterTag,
  StatusEffect,
  StatusEffectStat,
} from './types.ts';

const STAT_TAGS = new Set<StatusEffectStat>(['atk', 'def', 'reg', 'damageTaken']);

export function isDebuffFilterTag(value: string): value is DebuffFilterTag {
  return (DEBUFF_FILTER_TAG_OPTIONS as readonly string[]).includes(value);
}

function matchesDebuffTag(
  effect: StatusEffect,
  tag: DebuffFilterTag,
  selfSourceId?: string,
  selfAppliedOnly?: boolean,
): boolean {
  if (effect.remainingSec <= 0) return false;

  if (STAT_TAGS.has(tag as StatusEffectStat)) {
    return effect.kind === 'debuff' && effect.stat === tag;
  }

  if (tag === 'dot') {
    if (effect.overlay !== 'dot') return false;
    if (selfAppliedOnly && selfSourceId !== undefined) {
      return effect.sourceId === selfSourceId;
    }
    return true;
  }

  if (tag === 'stun') {
    return effect.overlay === 'stun' || (effect.kind === 'cc' && effect.overlay === 'stun');
  }

  return false;
}

export function hasMatchingDebuff(
  unit: CombatantState,
  tags: DebuffFilterTag[],
  options?: { selfSourceId?: string; selfAppliedOnly?: boolean },
): boolean {
  if (tags.length === 0) return false;
  const { selfSourceId, selfAppliedOnly } = options ?? {};
  return unit.statusEffects.some((effect) =>
    tags.some((tag) =>
      matchesDebuffTag(effect, tag, selfSourceId, selfAppliedOnly),
    ),
  );
}

export function resolveDispelTags(
  tags: DebuffFilterTag[] | undefined,
): DebuffFilterTag[] {
  if (tags && tags.length > 0) return tags;
  return [...DEBUFF_FILTER_TAG_OPTIONS];
}
