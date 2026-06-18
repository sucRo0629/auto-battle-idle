import type { VfxParticleDef } from '../battle/types.ts';
import { isParticlePresetId } from './particlePresets.ts';
import {
  resolveParticleSpawn,
  type ResolvedParticleSpawn,
} from './particlePresetResolve.ts';

export type { ParticlePresetId } from './particlePresets.ts';
export type { ResolvedParticleSpawn } from './particlePresetResolve.ts';
export { mergeParticleDefWithPreset, resolveParticleSpawn } from './particlePresetResolve.ts';

/** @deprecated use ResolvedParticleSpawn */
export type ParticleSpawnOptions = Pick<
  ResolvedParticleSpawn,
  'count' | 'durationSec' | 'tint'
> & { presetId?: ResolvedParticleSpawn['presetId'] };

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
): ResolvedParticleSpawn {
  const resolved = resolveParticleSpawn(particles);
  if (!resolved) {
    throw new Error(`Unknown particle preset: ${particles.preset}`);
  }
  return resolved;
}

export function resolveParticlePlaybackSec(
  particles: VfxParticleDef,
): number {
  if (!isParticleDefActive(particles)) return 0;
  const resolved = resolveParticleSpawnOptions(particles);
  return resolved.delaySec + resolved.durationSec;
}
