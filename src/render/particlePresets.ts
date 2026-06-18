import { PARTICLE_PRESET_IDS } from '../battle/data/gameDataSchema.ts';

export type ParticlePresetId = (typeof PARTICLE_PRESET_IDS)[number];

export interface ParticlePresetConfig {
  durationSec: number;
  defaultCount: number;
  defaultTint: string;
}

export const PARTICLE_PRESET_CONFIGS: Record<
  ParticlePresetId,
  ParticlePresetConfig
> = {
  heal_holy_light: {
    durationSec: 0.8,
    defaultCount: 12,
    defaultTint: '#ffe066',
  },
};

export function isParticlePresetId(value: string): value is ParticlePresetId {
  return value in PARTICLE_PRESET_CONFIGS;
}

export function getParticlePresetConfig(
  presetId: ParticlePresetId,
): ParticlePresetConfig {
  return PARTICLE_PRESET_CONFIGS[presetId];
}
