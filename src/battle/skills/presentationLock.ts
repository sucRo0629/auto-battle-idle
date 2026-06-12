import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from '../types.ts';
import { resolvePresetDurationMs } from '../../render/skillVfx/presetDurations.ts';
import { resolveSkillVfx } from '../../render/skillVfx/resolveSkillVfx.ts';
import type { SkillVfxContext } from '../../render/skillVfx/types.ts';
import { resolveUseDurationSec } from './skillSequence.ts';

function vfxDurationSec(
  skillId: string,
  vfx: SkillVfxDef | null | undefined,
  ctx: SkillVfxContext,
): number {
  const resolved = vfx ?? resolveSkillVfx(skillId, ctx);
  return resolvePresetDurationMs(resolved.preset, resolved.durationMs) / 1000;
}

function effectPresentationSec(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  ctx: SkillVfxContext,
): number {
  let sec = 0;
  if (effect.type === 'move') {
    sec = Math.max(sec, effect.moveDurationSec);
  }
  if (
    effect.type === 'damage' ||
    effect.type === 'dot' ||
    (effect.type === 'heal' && (effect.healSubKind ?? 'instant') !== 'dispel')
  ) {
    const effectVfx = effect.vfx ?? skill.vfx;
    sec = Math.max(sec, vfxDurationSec(skill.id, effectVfx, ctx));
  }
  return sec;
}

export function resolvePresentationLockSec(
  skill: ActiveSkillDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): number {
  if (resolveUseDurationSec(skill) > 0) return 0;

  const ctx: SkillVfxContext = {
    slotKind,
    role: actor.role,
    rangePx: actor.traits.rangePx,
    damageType: actor.traits.damageType,
    basicAttackVfx:
      slotKind === 'basic' ? actor.traits.basicAttackVfx : undefined,
  };

  let maxSec = 0;
  for (const effect of skill.effect) {
    maxSec = Math.max(maxSec, effectPresentationSec(skill, effect, ctx));
  }
  if (slotKind === 'basic' && skill.effect.length === 0) {
    maxSec = Math.max(maxSec, vfxDurationSec(skill.id, actor.traits.basicAttackVfx, ctx));
  }
  return maxSec;
}
