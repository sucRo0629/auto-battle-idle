import type {
  ActiveSkillDef,
  DamageType,
  Role,
  SkillEffectDef,
  SkillSlotKind,
  SkillVfxDef,
} from '../battle/types.ts';
import { resolvePresentationLockSec } from '../battle/skills/presentationLock.ts';
import { resolveUseDurationSec } from '../battle/skills/skillSequence.ts';
import { resolveSkillAnimKey } from '../render/skillAnimRegistry.ts';
import {
  getSkillAnimIntroSec,
  getSkillAnimOutroSec,
  resolveEffectApplyDelaySec,
  resolveSkillAnimPlayback,
} from '../render/skillAnimPlayback.ts';
import { resolveEffectPresentation } from '../render/skillVfx/resolveEffectPresentation.ts';
import { resolvePresetDurationMs } from '../render/skillVfx/presetDurations.ts';
import type { SkillVfxContext } from '../render/skillVfx/types.ts';
export interface PreviewEntity {
  entityId: string;
  role?: Role;
  rangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
  isEnemy: boolean;
}

export interface PresentationTimeline {
  bodyPlaybackFrames: number | null;
  bodyPlaybackSec: number | null;
  bodyIntroSec: number | null;
  bodyHoldSec: number | null;
  bodyOutroSec: number | null;
  vfxPreset: string | null;
  vfxSec: number | null;
  moveDurationSec: number | null;
  applyDelaySec: number;
  presentationLockSec: number;
  useDurationSec: number;
}

function previewActorStub(entity: PreviewEntity): {
  role: NonNullable<PreviewEntity['role']>;
  traits: {
    rangePx: number;
    damageType: PreviewEntity['damageType'];
    basicAttackVfx?: SkillVfxDef;
  };
} {
  return {
    role: entity.role ?? 'attacker',
    traits: {
      rangePx: entity.rangePx,
      damageType: entity.damageType,
      basicAttackVfx: entity.basicAttackVfx,
    },
  };
}

function effectKindForTimeline(effect: SkillEffectDef): SkillVfxContext['effectKind'] {
  if (effect.type === 'move') return 'move';
  return effect.type;
}

export function buildSkillVfxContext(
  entity: PreviewEntity,
  slotKind: SkillSlotKind,
  effect: SkillEffectDef,
): SkillVfxContext {
  return {
    role: entity.role,
    rangePx: entity.rangePx,
    damageType: entity.damageType,
    basicAttackVfx: entity.basicAttackVfx,
    slotKind,
    effectKind: effectKindForTimeline(effect),
    targetShape: effect.targetShape,
    effectVfxOnly: true,
  };
}

export function computePresentationTimeline(
  skill: ActiveSkillDef,
  effectIndex: number,
  entity: PreviewEntity,
  slotKind: SkillSlotKind,
): PresentationTimeline {
  const effect = skill.effect[effectIndex];
  if (!effect) {
    return {
      bodyPlaybackFrames: null,
      bodyPlaybackSec: null,
      bodyIntroSec: null,
      bodyHoldSec: null,
      bodyOutroSec: null,
      vfxPreset: null,
      vfxSec: null,
      moveDurationSec: null,
      applyDelaySec: 0,
      presentationLockSec: 0,
      useDurationSec: resolveUseDurationSec(skill),
    };
  }

  const ctx = buildSkillVfxContext(entity, slotKind, effect);
  const presentation = resolveEffectPresentation(effect, skill, ctx);

  const actorStub = previewActorStub(entity);
  const presentationLockSec = resolvePresentationLockSec(
    skill,
    actorStub as Parameters<typeof resolvePresentationLockSec>[1],
    slotKind,
  );
  const useDurationSec = resolveUseDurationSec(skill);
  const applyDelaySec = resolveEffectApplyDelaySec(skill.id, effectIndex, effect);
  const holdSec =
    useDurationSec > 0 ? useDurationSec : presentationLockSec;

  let bodyPlaybackFrames: number | null = null;
  let bodyPlaybackSec: number | null = null;
  let bodyIntroSec: number | null = null;
  let bodyHoldSec: number | null = null;
  let bodyOutroSec: number | null = null;
  const skillAnimKey = resolveSkillAnimKey(skill.id, effectIndex);
  if (skillAnimKey) {
    const playback = resolveSkillAnimPlayback(skillAnimKey, effect, holdSec);
    bodyPlaybackFrames = playback.playbackFrameCount;
    bodyPlaybackSec = playback.totalPlaybackSec;
    if (playback.phased) {
      bodyIntroSec = getSkillAnimIntroSec(playback.phased);
      bodyHoldSec = playback.phased.holdSec;
      bodyOutroSec = getSkillAnimOutroSec(playback.phased);
    }
  }

  let vfxPreset: string | null = null;
  let vfxSec: number | null = null;
  if (presentation.vfx) {
    vfxPreset = presentation.vfx.preset;
    vfxSec =
      resolvePresetDurationMs(
        presentation.vfx.preset,
        presentation.vfx.durationMs,
      ) / 1000;
  }

  return {
    bodyPlaybackFrames,
    bodyPlaybackSec,
    bodyIntroSec,
    bodyHoldSec,
    bodyOutroSec,
    vfxPreset,
    vfxSec,
    moveDurationSec: effect.type === 'move' ? effect.moveDurationSec : null,
    applyDelaySec,
    presentationLockSec,
    useDurationSec,
  };
}
