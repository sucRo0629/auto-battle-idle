import { getSkillAnimFrameCount } from './skillAnimRegistry.ts';

/** strip 内の再生開始コマ（default 0）。先頭 idle 参照コマ skip 時は 1 等 */
export function normalizeAnimStartFrame(
  startFrame: number | undefined,
  stripFrameCount: number,
): number {
  const raw = startFrame ?? 0;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), Math.max(0, stripFrameCount - 1));
}

/** strip 全体のコマ数（幅 ÷ 64） */
export function getSkillAnimStripFrameCount(skillAnimKey: string): number {
  return getSkillAnimFrameCount(skillAnimKey);
}

/** startFrame から終端までの再生コマ数 */
export function getSkillAnimPlaybackFrameCount(
  stripFrameCount: number,
  startFrame: number,
): number {
  return Math.max(1, stripFrameCount - startFrame);
}

export function resolveSkillAnimPlayback(
  skillAnimKey: string,
  animStartFrame?: number,
): {
  startFrame: number;
  stripFrameCount: number;
  playbackFrameCount: number;
} {
  const stripFrameCount = getSkillAnimStripFrameCount(skillAnimKey);
  const startFrame = normalizeAnimStartFrame(animStartFrame, stripFrameCount);
  return {
    startFrame,
    stripFrameCount,
    playbackFrameCount: getSkillAnimPlaybackFrameCount(
      stripFrameCount,
      startFrame,
    ),
  };
}
