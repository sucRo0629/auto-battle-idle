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
  startRadius: 4,
  endRadius: 30,
  ringStartSec: 0,
  ringEndSec: 0.35,
  fadeSec: 0.06,
  lineWidth: 1.5,
};

const DEFAULT_HEAL_PARTICLES: ParticlesPresetParams = {
  shape: 'cross',
  vyMin: -54,
  vyMax: -28,
  vxSpread: 0.08,
  spawnXSpread: 8,
  spawnYMin: -2,
  spawnYMax: 4,
  lifeMinSec: 0.42,
  lifeMaxSec: 0.7,
  sizeMin: 1.8,
  sizeMax: 3.2,
};

export const PARTICLE_PRESET_DEFS: Record<ParticlePresetId, ParticlePresetDef> = {
  heal_holy_light: {
    kind: 'composite',
    durationSec: 0.75,
    defaultCount: 10,
    defaultTint: '#e8fff1',
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
