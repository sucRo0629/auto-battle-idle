import { PARTICLE_PRESET_IDS } from '../battle/data/gameDataSchema.ts';

export type ParticlePresetId = (typeof PARTICLE_PRESET_IDS)[number];

export type ParticlePresetKind = 'particles' | 'ring' | 'composite';

export type ParticleShape = 'dot' | 'cross' | 'circle';

export interface RingPresetParams {
  startRadius: number;
  endRadius: number;
  ringStartSec: number;
  ringEndSec: number;
  fadeSec: number;
  lineWidth: number;
}

export interface ParticlesPresetParams {
  shape: ParticleShape;
  vyMin: number;
  vyMax: number;
  vxSpread: number;
  spawnXSpread: number;
  spawnYMin: number;
  spawnYMax: number;
  lifeMinSec: number;
  lifeMaxSec: number;
  sizeMin: number;
  sizeMax: number;
}

export interface ParticlePresetDef {
  kind: ParticlePresetKind;
  durationSec: number;
  defaultCount: number;
  defaultTint: string;
  ring?: RingPresetParams;
  particles?: ParticlesPresetParams;
}

const DEFAULT_RING: RingPresetParams = {
  startRadius: 6,
  endRadius: 36,
  ringStartSec: 0.04,
  ringEndSec: 0.42,
  fadeSec: 0.18,
  lineWidth: 2,
};

const DEFAULT_HEAL_PARTICLES: ParticlesPresetParams = {
  shape: 'cross',
  vyMin: -42,
  vyMax: -24,
  vxSpread: 0.15,
  spawnXSpread: 14,
  spawnYMin: -10,
  spawnYMax: 2,
  lifeMinSec: 0.45,
  lifeMaxSec: 0.75,
  sizeMin: 1.5,
  sizeMax: 3.5,
};

export const PARTICLE_PRESET_DEFS: Record<ParticlePresetId, ParticlePresetDef> = {
  heal_holy_light: {
    kind: 'composite',
    durationSec: 0.8,
    defaultCount: 12,
    defaultTint: '#ffe066',
    ring: DEFAULT_RING,
    particles: DEFAULT_HEAL_PARTICLES,
  },
};

/** @deprecated use PARTICLE_PRESET_DEFS */
export const PARTICLE_PRESET_CONFIGS = PARTICLE_PRESET_DEFS;

export function isParticlePresetId(value: string): value is ParticlePresetId {
  return value in PARTICLE_PRESET_DEFS;
}

export function getParticlePresetDef(
  presetId: ParticlePresetId,
): ParticlePresetDef {
  return PARTICLE_PRESET_DEFS[presetId];
}

/** @deprecated use getParticlePresetDef */
export function getParticlePresetConfig(
  presetId: ParticlePresetId,
): ParticlePresetDef {
  return getParticlePresetDef(presetId);
}
