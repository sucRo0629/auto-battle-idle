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
import {
  getSkillAnimIntroSec,
  getSkillAnimOutroSec,
  resolveEffectApplyDelaySec,
  resolveSkillBodyPlayback,
} from '../render/skillAnimPlayback.ts';
import { resolveVfxAnimKey } from '../render/vfxAnimRegistry.ts';
import { resolveVfxPlaybackSec } from '../render/vfxAnimPlayback.ts';
import type { SkillVfxContext } from '../render/skillVfx/types.ts';
import { resolveSkillPresentation } from '../render/skillPresentation.ts';

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
  vfxKey: string | null;
  vfxSec: number | null;
  hitVfxSec: number | null;
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
  skillId: string,
  effectIndex: number,
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
    skillId,
    effectIndex,
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
      vfxKey: null,
      vfxSec: null,
      hitVfxSec: null,
      moveDurationSec: null,
      applyDelaySec: 0,
      presentationLockSec: 0,
      useDurationSec: resolveUseDurationSec(skill),
    };
  }

  const ctx = buildSkillVfxContext(entity, slotKind, effect, skill.id, effectIndex);
  const presentation = resolveSkillPresentation(skill, effect, ctx);

  const actorStub = previewActorStub(entity);
  const presentationLockSec = resolvePresentationLockSec(
    skill,
    actorStub as Parameters<typeof resolvePresentationLockSec>[1],
    slotKind,
  );
  const useDurationSec = resolveUseDurationSec(skill);
  const applyDelaySec = resolveEffectApplyDelaySec(skill.id, effectIndex, effect);

  let bodyPlaybackFrames: number | null = null;
  let bodyPlaybackSec: number | null = null;
  let bodyIntroSec: number | null = null;
  let bodyHoldSec: number | null = null;
  let bodyOutroSec: number | null = null;
  const playback = resolveSkillBodyPlayback(skill.id, effectIndex, effect, {
    useDurationSec,
  });
  if (playback) {
    bodyPlaybackFrames = playback.playbackFrameCount;
    bodyPlaybackSec = playback.totalPlaybackSec;
    if (playback.phased) {
      bodyIntroSec = getSkillAnimIntroSec(playback.phased);
      bodyHoldSec = playback.phased.holdSec;
      bodyOutroSec = getSkillAnimOutroSec(playback.phased);
    }
  }

  let vfxKey: string | null = null;
  let vfxSec: number | null = null;
  let hitVfxSec: number | null = null;
  if (presentation.vfx) {
    vfxKey = resolveVfxAnimKey(skill.id, effectIndex, 'main');
    if (vfxKey) {
      vfxSec = resolveVfxPlaybackSec(presentation.vfx, vfxKey);
    }
  }
  if (presentation.hitVfx) {
    const hitKey = resolveVfxAnimKey(skill.id, effectIndex, 'hit');
    if (hitKey) {
      hitVfxSec = resolveVfxPlaybackSec(presentation.hitVfx, hitKey);
    }
  }

  return {
    bodyPlaybackFrames,
    bodyPlaybackSec,
    bodyIntroSec,
    bodyHoldSec,
    bodyOutroSec,
    vfxKey,
    vfxSec,
    hitVfxSec,
    moveDurationSec: effect.type === 'move' ? effect.moveDurationSec : null,
    applyDelaySec,
    presentationLockSec,
    useDurationSec,
  };
}
