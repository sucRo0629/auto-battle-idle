import type { AnimPhaseFields, SkillVfxDef, VfxLayer, VfxPlacement } from '../battle/types.ts';
import {
  resolveAnimPlayback,
  type SkillAnimPlaybackOptions,
} from './skillAnimPlayback.ts';
import { getVfxAnimFrameCount } from './vfxAnimRegistry.ts';

export type VfxPlaybackKind = 'main' | 'hit';

export type VfxPlaybackOptions = SkillAnimPlaybackOptions;

const DEFAULT_MAIN_PLACEMENT: VfxPlacement = {
  anchor: 'footActor',
  layer: 'front',
};

const DEFAULT_HIT_PLACEMENT: VfxPlacement = {
  anchor: 'footTarget',
  layer: 'front',
};

export function resolveVfxPlacement(
  vfxDef: SkillVfxDef,
  kind: VfxPlaybackKind,
): VfxPlacement {
  if (vfxDef.placement) return vfxDef.placement;
  return kind === 'hit' ? DEFAULT_HIT_PLACEMENT : DEFAULT_MAIN_PLACEMENT;
}

export function resolveVfxLayer(placement: VfxPlacement): VfxLayer {
  return placement.layer ?? 'front';
}

export function resolveVfxAnimPlayback(
  vfxKey: string,
  fields: AnimPhaseFields = {},
  holdSec = 0,
): ReturnType<typeof resolveAnimPlayback> {
  return resolveAnimPlayback(getVfxAnimFrameCount(vfxKey), fields, holdSec);
}

export function resolveVfxPlaybackSec(
  vfxDef: SkillVfxDef,
  vfxKey: string,
  holdSec = 0,
): number {
  return resolveVfxAnimPlayback(vfxKey, vfxDef, holdSec).totalPlaybackSec;
}

export function toVfxPlaybackOptions(
  vfxDef: SkillVfxDef,
  overrides: VfxPlaybackOptions = {},
): VfxPlaybackOptions {
  return {
    animStartFrame: overrides.animStartFrame ?? vfxDef.animStartFrame,
    animIntroEndFrame: overrides.animIntroEndFrame ?? vfxDef.animIntroEndFrame,
    animLoopFrame: overrides.animLoopFrame ?? vfxDef.animLoopFrame,
    animLoopEndFrame: overrides.animLoopEndFrame ?? vfxDef.animLoopEndFrame,
    animOutroStartFrame: overrides.animOutroStartFrame ?? vfxDef.animOutroStartFrame,
    holdSec: overrides.holdSec,
  };
}
