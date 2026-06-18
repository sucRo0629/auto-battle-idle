import type { ActiveSkillDef, CombatantState, DamageType, Role, SkillEffectDef, SkillSlotKind, SkillVfxDef } from '../battle/types.ts';
import { resolvePresentationLockSec } from '../battle/skills/presentationLock.ts';
import { resolveUseDurationSec } from '../battle/skills/skillSequence.ts';
import { SHARED_ANIM_FPS } from './SpriteRegistry.ts';
import { getSkillAnimFrameCount, resolveSkillAnimKey } from './skillAnimRegistry.ts';

/** strip 内の再生開始コマ（default 0）。先頭 idle 参照コマ skip 時は 1 等 */
export function normalizeAnimStartFrame(
  startFrame: number | undefined,
  stripFrameCount: number,
): number {
  const raw = startFrame ?? 0;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), Math.max(0, stripFrameCount - 1));
}

export type EffectApplyFrameFields = Pick<
  SkillEffectDef,
  'applyFrame' | 'animStartFrame'
>;

/** applyFrame から発動起点までの遅延秒。省略 / 再生開始以前 = 0 */
export function resolveEffectApplyDelaySec(
  skillId: string,
  effectIndex: number,
  effect: EffectApplyFrameFields,
): number {
  if (effect.applyFrame === undefined) return 0;
  const skillAnimKey = resolveSkillAnimKey(skillId, effectIndex);
  const playbackStartFrame = skillAnimKey
    ? normalizeAnimStartFrame(
        effect.animStartFrame,
        getSkillAnimStripFrameCount(skillAnimKey),
      )
    : 0;
  const delayFrames = Math.max(0, effect.applyFrame - playbackStartFrame);
  return delayFrames / SHARED_ANIM_FPS;
}

function clampAnimFrame(frame: number, stripFrameCount: number): number {
  if (!Number.isFinite(frame) || frame < 0) return 0;
  return Math.min(Math.floor(frame), Math.max(0, stripFrameCount - 1));
}

/** strip 全体のコマ数（幅 ÷ 64） */
export function getSkillAnimStripFrameCount(skillAnimKey: string): number {
  return getSkillAnimFrameCount(skillAnimKey);
}

/** startFrame から終端までの再生コマ数（線形再生用） */
export function getSkillAnimPlaybackFrameCount(
  stripFrameCount: number,
  startFrame: number,
): number {
  return Math.max(1, stripFrameCount - startFrame);
}

export interface SkillAnimPlaybackOptions {
  animStartFrame?: number;
  animIntroEndFrame?: number;
  animLoopFrame?: number;
  animLoopEndFrame?: number;
  animOutroStartFrame?: number;
  holdSec?: number;
}

export interface SkillAnimPhaseConfig {
  startFrame: number;
  introEndFrame: number;
  loopFrame: number;
  loopEndFrame: number;
  outroStartFrame: number;
  stripFrameCount: number;
  holdSec: number;
}

export type SkillAnimPhaseFields = Pick<
  SkillEffectDef,
  | 'animStartFrame'
  | 'animIntroEndFrame'
  | 'animLoopFrame'
  | 'animLoopEndFrame'
  | 'animOutroStartFrame'
>;

export function isPhasedSkillAnim(
  fields: SkillAnimPhaseFields,
): fields is SkillAnimPhaseFields & { animLoopFrame: number } {
  return fields.animLoopFrame !== undefined;
}

function hasSkillBodyAnimFields(fields: SkillAnimPhaseFields): boolean {
  return (
    fields.animStartFrame !== undefined ||
    fields.animIntroEndFrame !== undefined ||
    fields.animLoopFrame !== undefined ||
    fields.animLoopEndFrame !== undefined ||
    fields.animOutroStartFrame !== undefined
  );
}

/** 多 effect スキルでは body strip を持つ effect の anim フィールドを正本とする */
export function resolveSkillBodyAnimFields(
  skill: ActiveSkillDef,
  effectIndex: number,
): SkillAnimPhaseFields {
  const current = skill.effect[effectIndex];
  if (current && hasSkillBodyAnimFields(current)) return current;
  for (const effect of skill.effect) {
    if (hasSkillBodyAnimFields(effect)) return effect;
  }
  return current ?? skill.effect[0] ?? {};
}

export function toSkillAnimPlaybackOptions(
  effect: SkillAnimPhaseFields,
  holdSec: number,
): SkillAnimPlaybackOptions {
  return {
    animStartFrame: effect.animStartFrame,
    animIntroEndFrame: effect.animIntroEndFrame,
    animLoopFrame: effect.animLoopFrame,
    animLoopEndFrame: effect.animLoopEndFrame,
    animOutroStartFrame: effect.animOutroStartFrame,
    holdSec,
  };
}

export interface SkillAnimHoldActor {
  role?: Role;
  rangePx: number;
  damageType: DamageType;
  basicAttackVfx?: SkillVfxDef;
}

export function resolveSkillAnimHoldSec(
  skill: ActiveSkillDef,
  actor: SkillAnimHoldActor,
  slotKind: SkillSlotKind,
): number {
  const useSec = resolveUseDurationSec(skill);
  if (useSec > 0) return useSec;
  const actorStub = {
    role: actor.role ?? 'attacker',
    traits: {
      rangePx: actor.rangePx,
      damageType: actor.damageType,
      basicAttackVfx: actor.basicAttackVfx,
    },
  } as CombatantState;
  return resolvePresentationLockSec(skill, actorStub, slotKind);
}

export function resolveSkillAnimPhaseConfig(
  skillAnimKey: string,
  options: SkillAnimPlaybackOptions,
): SkillAnimPhaseConfig | null {
  if (options.animLoopFrame === undefined) return null;

  const stripFrameCount = getSkillAnimStripFrameCount(skillAnimKey);
  if (stripFrameCount <= 0) return null;

  const startFrame = normalizeAnimStartFrame(
    options.animStartFrame,
    stripFrameCount,
  );
  const loopFrame = clampAnimFrame(options.animLoopFrame, stripFrameCount);
  const loopEndFrame = clampAnimFrame(
    options.animLoopEndFrame ?? loopFrame,
    stripFrameCount,
  );
  const introEndFrame = clampAnimFrame(
    options.animIntroEndFrame ?? loopFrame,
    stripFrameCount,
  );
  const outroStartFrame = clampAnimFrame(
    options.animOutroStartFrame ?? loopEndFrame + 1,
    stripFrameCount,
  );

  const orderedIntroEnd = Math.max(startFrame, introEndFrame);
  const orderedLoop = Math.max(loopFrame, orderedIntroEnd);
  const orderedLoopEnd = Math.max(orderedLoop, loopEndFrame);
  const orderedOutroStart = Math.max(
    orderedLoopEnd + 1,
    outroStartFrame,
  );

  return {
    startFrame,
    introEndFrame: orderedIntroEnd,
    loopFrame: orderedLoop,
    loopEndFrame: orderedLoopEnd,
    outroStartFrame: Math.min(orderedOutroStart, stripFrameCount - 1),
    stripFrameCount,
    holdSec: Math.max(0, options.holdSec ?? 0),
  };
}

export function getSkillAnimIntroSec(config: SkillAnimPhaseConfig): number {
  const frameSteps = Math.max(0, config.introEndFrame - config.startFrame);
  return frameSteps / SHARED_ANIM_FPS;
}

export function getSkillAnimOutroSec(config: SkillAnimPhaseConfig): number {
  const frameSteps = Math.max(
    0,
    config.stripFrameCount - 1 - config.outroStartFrame,
  );
  return frameSteps / SHARED_ANIM_FPS;
}

export function getSkillAnimPhasedTotalSec(
  config: SkillAnimPhaseConfig,
): number {
  return (
    getSkillAnimIntroSec(config) +
    config.holdSec +
    getSkillAnimOutroSec(config)
  );
}

export function resolveSkillAnimPlayback(
  skillAnimKey: string,
  fields: SkillAnimPhaseFields = {},
  holdSec = 0,
): {
  startFrame: number;
  stripFrameCount: number;
  playbackFrameCount: number;
  phased: SkillAnimPhaseConfig | null;
  totalPlaybackSec: number;
} {
  const stripFrameCount = getSkillAnimStripFrameCount(skillAnimKey);
  const startFrame = normalizeAnimStartFrame(
    fields.animStartFrame,
    stripFrameCount,
  );
  const phased = resolveSkillAnimPhaseConfig(skillAnimKey, {
    ...fields,
    holdSec,
  });
  const playbackFrameCount = getSkillAnimPlaybackFrameCount(
    stripFrameCount,
    startFrame,
  );
  const totalPlaybackSec = phased
    ? getSkillAnimPhasedTotalSec(phased)
    : playbackFrameCount / SHARED_ANIM_FPS;

  return {
    startFrame,
    stripFrameCount,
    playbackFrameCount,
    phased,
    totalPlaybackSec,
  };
}

export interface SkillBodyPlaybackOptions {
  useDurationSec?: number;
}

function resolveSkillBodyHoldSec(useDurationSec?: number): number {
  return useDurationSec !== undefined && useDurationSec > 0
    ? useDurationSec
    : 0;
}

/** body strip の総再生秒数。hold は現時点では useDurationSec のみを反映する */
export function resolveSkillBodyPlayback(
  skillId: string,
  effectIndex: number,
  effect: SkillAnimPhaseFields,
  options: SkillBodyPlaybackOptions = {},
): ReturnType<typeof resolveSkillAnimPlayback> | null {
  const skillAnimKey = resolveSkillAnimKey(skillId, effectIndex);
  if (!skillAnimKey) return null;
  return resolveSkillAnimPlayback(
    skillAnimKey,
    effect,
    resolveSkillBodyHoldSec(options.useDurationSec),
  );
}

/** body strip の総再生秒数だけ欲しいときの薄い便宜関数 */
export function resolveSkillBodyPlaybackSec(
  skillId: string,
  effectIndex: number,
  effect: SkillAnimPhaseFields,
  options: SkillBodyPlaybackOptions = {},
): number {
  return (
    resolveSkillBodyPlayback(skillId, effectIndex, effect, options)
      ?.totalPlaybackSec ?? 0
  );
}
