import { PARTICLE_PRESET_IDS } from "../battle/data/gameDataSchema.ts";

export type ParticlePresetId = (typeof PARTICLE_PRESET_IDS)[number];

export type ParticlePresetKind = "particles" | "ring" | "composite";

export type ParticleShape = "dot" | "cross" | "circle";

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
  endRadius: 20,
  ringStartSec: 0,
  ringEndSec: 0.35,
  fadeSec: 0.06,
  lineWidth: 1.5,
};

const DEFAULT_HEAL_NORMAL_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -54,
  vyMax: -28,
  vxSpread: 0.08,
  spawnXSpread: 11,
  spawnYMin: -2,
  spawnYMax: 4,
  lifeMinSec: 0.42,
  lifeMaxSec: 0.7,
  sizeMin: 5,
  sizeMax: 10,
};

const HEAL_NORMAL_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 0.75,
  defaultCount: 4,
  defaultTint: "#5ce88a",
  ring: DEFAULT_RING,
  particles: DEFAULT_HEAL_NORMAL_PARTICLES,
};

const HEAL_MAJOR_RING: RingPresetParams = {
  startRadius: 6,
  endRadius: 32,
  ringStartSec: 0,
  ringEndSec: 0.55,
  fadeSec: 0.08,
  lineWidth: 2,
};

const HEAL_MAJOR_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -58,
  vyMax: -30,
  vxSpread: 0.08,
  spawnXSpread: 14,
  spawnYMin: -3,
  spawnYMax: 5,
  lifeMinSec: 0.5,
  lifeMaxSec: 0.85,
  sizeMin: 7,
  sizeMax: 14,
};

const HEAL_MAJOR_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 1.1,
  defaultCount: 8,
  defaultTint: "#7dffaa",
  ring: HEAL_MAJOR_RING,
  particles: HEAL_MAJOR_PARTICLES,
};

const HEAL_AREA_RING: RingPresetParams = {
  startRadius: 5,
  endRadius: 30,
  ringStartSec: 0,
  ringEndSec: 0.4,
  fadeSec: 0.07,
  lineWidth: 2,
};

const HEAL_AREA_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -50,
  vyMax: -26,
  vxSpread: 0.08, // inferred from other presets
  spawnXSpread: 20,
  spawnYMin: -4,
  spawnYMax: 2,
  lifeMinSec: 0.4,
  lifeMaxSec: 0.65,
  sizeMin: 5,
  sizeMax: 9,
};

const HEAL_AREA_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 0.85,
  defaultCount: 7,
  defaultTint: "#5ce88a",
  ring: HEAL_AREA_RING,
  particles: HEAL_AREA_PARTICLES,
};

const HEAL_PARTY_RING: RingPresetParams = {
  startRadius: 6,
  endRadius: 38,
  ringStartSec: 0,
  ringEndSec: 0.5,
  fadeSec: 0.08,
  lineWidth: 2.2,
};

const HEAL_PARTY_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -52,
  vyMax: -28,
  vxSpread: 0.08,
  spawnXSpread: 26,
  spawnYMin: -5,
  spawnYMax: 3,
  lifeMinSec: 0.45,
  lifeMaxSec: 0.75,
  sizeMin: 5,
  sizeMax: 10,
};

const HEAL_PARTY_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 1.0,
  defaultCount: 10,
  defaultTint: "#62eb95",
  ring: HEAL_PARTY_RING,
  particles: HEAL_PARTY_PARTICLES,
};

const HEAL_MAJOR_PARTY_RING: RingPresetParams = {
  startRadius: 8,
  endRadius: 44,
  ringEndSec: 0.6,
  fadeSec: 0.1,
  lineWidth: 2.5,
  ringStartSec: 0,
};

const HEAL_MAJOR_PARTY_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -60,
  vyMax: -32,
  vxSpread: 0.08, // inferred from other presets
  spawnXSpread: 30,
  spawnYMin: -6,
  spawnYMax: 4,
  lifeMinSec: 0.5, // inferred
  lifeMaxSec: 0.9,
  sizeMin: 6,
  sizeMax: 12,
};

const HEAL_MAJOR_PARTY_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 1.25,
  defaultCount: 14,
  defaultTint: "#8affb8",
  ring: HEAL_MAJOR_PARTY_RING,
  particles: HEAL_MAJOR_PARTY_PARTICLES,
};







const HEAL_CAST_RING: RingPresetParams = {
  startRadius: 3,
  endRadius: 24,
  ringStartSec: 0,
  ringEndSec: 0.45,
  fadeSec: 0.07,
  lineWidth: 1.8,
};

const HEAL_CAST_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -48,
  vyMax: -24,
  vxSpread: 0.08, // Assuming a default value based on other presets, as it's not specified.
  spawnXSpread: 6,
  spawnYMin: -4,
  spawnYMax: 0,
  lifeMinSec: 0.35,
  lifeMaxSec: 0.55,
  sizeMin: 4,
  sizeMax: 7,
};

const HEAL_CAST_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "composite",
  durationSec: 0.65,
  defaultCount: 3,
  defaultTint: "#5ce88a",
  ring: HEAL_CAST_RING,
  particles: HEAL_CAST_PARTICLES,
};

const HEAL_MINOR_PARTICLES: ParticlesPresetParams = {
  shape: "cross",
  vyMin: -38,
  vyMax: -20,
  vxSpread: 0.06,
  spawnXSpread: 5,
  spawnYMin: -2,
  spawnYMax: 3,
  lifeMinSec: 0.28,
  lifeMaxSec: 0.42,
  sizeMin: 3,
  sizeMax: 5,
};

const HEAL_MINOR_PARTICLE_PRESET: ParticlePresetDef = {
  kind: "particles",
  durationSec: 0.4,
  defaultCount: 2,
  defaultTint: "#72f0a0",
  particles: HEAL_MINOR_PARTICLES,
};

export const PARTICLE_PRESET_DEFS: Record<ParticlePresetId, ParticlePresetDef> =
  {
    heal_normal: HEAL_NORMAL_PARTICLE_PRESET,
    heal_minor: HEAL_MINOR_PARTICLE_PRESET,
  heal_major: HEAL_MAJOR_PARTICLE_PRESET,
  heal_cast: HEAL_CAST_PARTICLE_PRESET,
  heal_area: HEAL_AREA_PARTICLE_PRESET,
  heal_party: HEAL_PARTY_PARTICLE_PRESET,
  heal_major_party: HEAL_MAJOR_PARTY_PARTICLE_PRESET,
};

/** @deprecated use PARTICLE_PRESET_DEFS */
export const PARTICLE_PRESET_CONFIGS = PARTICLE_PRESET_DEFS;

export function isParticlePresetId(value: string): value is ParticlePresetId {
  return value in PARTICLE_PRESET_DEFS;
}

export function getParticlePresetDef(
  presetId: ParticlePresetId
): ParticlePresetDef {
  return PARTICLE_PRESET_DEFS[presetId];
}

/** @deprecated use getParticlePresetDef */
export function getParticlePresetConfig(
  presetId: ParticlePresetId
): ParticlePresetDef {
  return getParticlePresetDef(presetId);
}
