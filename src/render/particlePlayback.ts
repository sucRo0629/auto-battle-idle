import type { VfxParticleDef } from '../battle/types.ts';
import {
  getParticlePresetConfig,
  isParticlePresetId,
  type ParticlePresetId,
} from './particlePresets.ts';

export type { ParticlePresetId };

export interface ParticleSpawnOptions {
  count?: number;
  durationSec?: number;
  tint?: string;
}

export function isParticleDefActive(
  particles: VfxParticleDef | null | undefined,
): particles is VfxParticleDef {
  return (
    particles != null &&
    particles.enabled !== false &&
    isParticlePresetId(particles.preset)
  );
}

export function resolveParticleSpawnOptions(
  particles: VfxParticleDef,
): Required<ParticleSpawnOptions> & { presetId: ParticlePresetId } {
  const presetId = particles.preset as ParticlePresetId;
  const config = getParticlePresetConfig(presetId);
  return {
    presetId,
    count: particles.count ?? config.defaultCount,
    durationSec: particles.durationSec ?? config.durationSec,
    tint: particles.tint ?? config.defaultTint,
  };
}

export function resolveParticlePlaybackSec(
  particles: VfxParticleDef,
): number {
  if (!isParticleDefActive(particles)) return 0;
  return resolveParticleSpawnOptions(particles).durationSec;
}
