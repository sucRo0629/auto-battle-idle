import type { VfxParticleDef } from '../battle/types.ts';
import {
  getParticlePresetDef,
  isParticlePresetId,
  type ParticlePresetDef,
  type ParticlePresetId,
} from './particlePresets.ts';

export interface ResolvedParticleSpawn {
  presetId: ParticlePresetId;
  durationSec: number;
  delaySec: number;
  count: number;
  tint: string;
  preset: ParticlePresetDef;
}

export function mergeParticleDefWithPreset(
  def: VfxParticleDef,
  presetDefaults: ParticlePresetDef,
): Omit<ResolvedParticleSpawn, 'presetId'> & { presetId?: ParticlePresetId } {
  return {
    durationSec: def.durationSec ?? presetDefaults.durationSec,
    delaySec: def.delaySec ?? 0,
    count: def.count ?? presetDefaults.defaultCount,
    tint: def.tint ?? presetDefaults.defaultTint,
    preset: presetDefaults,
  };
}

export function resolveParticleSpawn(
  def: VfxParticleDef,
): ResolvedParticleSpawn | null {
  if (!isParticlePresetId(def.preset)) return null;
  const presetId = def.preset;
  const presetDefaults = getParticlePresetDef(presetId);
  return {
    presetId,
    ...mergeParticleDefWithPreset(def, presetDefaults),
  };
}
