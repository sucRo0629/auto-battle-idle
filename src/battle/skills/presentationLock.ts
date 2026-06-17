import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from '../types.ts';
import { resolvePresetDurationMs } from '../../render/skillVfx/presetDurations.ts';
import { resolveUseDurationSec } from './skillSequence.ts';

function vfxDurationSec(
  vfx: SkillVfxDef | null | undefined,
): number {
  if (!vfx?.preset) return 0;
  return resolvePresetDurationMs(vfx.preset, vfx.durationMs) / 1000;
}

function effectPresentationSec(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  slotKind: SkillSlotKind,
  basicAttackVfx: SkillVfxDef | null | undefined,
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
    const effectVfx =
      slotKind === 'basic' ? basicAttackVfx : effect.vfx ?? skill.vfx;
    sec = Math.max(sec, vfxDurationSec(effectVfx));
  }
  return sec;
}

export function resolvePresentationLockSec(
  skill: ActiveSkillDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): number {
  if (resolveUseDurationSec(skill) > 0) return 0;

  let maxSec = 0;
  for (const effect of skill.effect) {
    maxSec = Math.max(
      maxSec,
      effectPresentationSec(skill, effect, slotKind, actor.traits.basicAttackVfx),
    );
  }
  if (slotKind === 'basic' && skill.effect.length === 0) {
    maxSec = Math.max(maxSec, vfxDurationSec(actor.traits.basicAttackVfx));
  }
  return maxSec;
}
