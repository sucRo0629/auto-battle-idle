import type { SkillVfxPresetId } from '../../battle/types.ts';

export const PRESET_DURATION_MS: Record<SkillVfxPresetId, number> = {
  slash: 320,
  slashHit: 320,
  orb: 380,
  arrow: 420,
  healRise: 520,
  chainLightning: 760,
  impale: 350,
};

export function resolvePresetDurationMs(
  preset: SkillVfxPresetId,
  durationMs?: number,
): number {
  return durationMs ?? PRESET_DURATION_MS[preset];
}
