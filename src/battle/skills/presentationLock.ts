import type {
  ActiveSkillDef,
  CombatantState,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from '../types.ts';
import {
  isVfxDefActive,
  resolveEffectPresentation,
} from '../../render/skillVfx/resolveEffectPresentation.ts';
import type { SkillVfxContext } from '../../render/skillVfx/types.ts';
import { resolveSkillBodyPlaybackSec } from '../../render/skillAnimPlayback.ts';
import { resolveVfxAnimKey } from '../../render/vfxAnimRegistry.ts';
import { resolveVfxPlaybackSec } from '../../render/vfxAnimPlayback.ts';
import { resolveUseDurationSec } from './skillSequence.ts';

function buildLockVfxContext(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  effectIndex: number,
  slotKind: SkillSlotKind,
  basicAttackVfx: SkillVfxDef | null | undefined,
): SkillVfxContext {
  return {
    rangePx: 0,
    damageType: 'physical',
    basicAttackVfx: basicAttackVfx ?? undefined,
    slotKind,
    effectKind: effect.type === 'move' ? 'move' : effect.type,
    targetShape: effect.targetShape,
    effectVfxOnly: false,
    skillId: skill.id,
    effectIndex,
  };
}

function vfxPlaybackSec(
  skillId: string,
  effectIndex: number,
  vfx: SkillVfxDef | null | undefined,
  kind: 'main' | 'hit',
): number {
  if (!isVfxDefActive(vfx)) return 0;
  const key = resolveVfxAnimKey(skillId, effectIndex, kind);
  if (!key) return 0;
  return resolveVfxPlaybackSec(vfx, key);
}

function effectPresentationSec(
  skill: ActiveSkillDef,
  effect: SkillEffectDef,
  effectIndex: number,
  slotKind: SkillSlotKind,
  basicAttackVfx: SkillVfxDef | null | undefined,
): number {
  let sec = 0;
  if (effect.type === 'move') {
    sec = Math.max(sec, effect.moveDurationSec);
  }

  sec = Math.max(
    sec,
    resolveSkillBodyPlaybackSec(skill.id, effectIndex, effect),
  );

  const presentation = resolveEffectPresentation(
    effect,
    skill,
    buildLockVfxContext(skill, effect, effectIndex, slotKind, basicAttackVfx),
  );
  sec = Math.max(
    sec,
    vfxPlaybackSec(skill.id, effectIndex, presentation.vfx, 'main'),
  );
  sec = Math.max(
    sec,
    vfxPlaybackSec(skill.id, effectIndex, presentation.hitVfx, 'hit'),
  );
  return sec;
}

export function resolvePresentationLockSec(
  skill: ActiveSkillDef,
  actor: CombatantState,
  slotKind: SkillSlotKind,
): number {
  if (resolveUseDurationSec(skill) > 0) return 0;

  let maxSec = 0;
  for (let effectIndex = 0; effectIndex < skill.effect.length; effectIndex++) {
    maxSec = Math.max(
      maxSec,
      effectPresentationSec(
        skill,
        skill.effect[effectIndex]!,
        effectIndex,
        slotKind,
        actor.traits.basicAttackVfx,
      ),
    );
  }
  if (slotKind === 'basic' && skill.effect.length === 0) {
    maxSec = Math.max(
      maxSec,
      vfxPlaybackSec(skill.id, 0, actor.traits.basicAttackVfx, 'main'),
    );
  }
  return maxSec;
}
