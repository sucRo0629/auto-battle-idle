import type { VfxLayer, VfxParticleDef } from '../battle/types.ts';
import { isParticleDefActive } from './particlePlayback.ts';
import { mergeParticleDefWithPreset } from './particlePresetResolve.ts';
import type {
  ParticlePresetDef,
  ParticleShape,
  ParticlesPresetParams,
  RingPresetParams,
} from './particlePresets.ts';

export const MAX_PARTICLE_EMITTERS = 32;
export const MAX_PARTICLES_PER_EMITTER = 64;
export const MAX_TOTAL_PARTICLES = 256;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
  size: number;
  shape: ParticleShape;
  crossVertical: boolean;
}

interface ParticleEmitter {
  instanceId: string;
  worldX: number;
  worldY: number;
  layer: VfxLayer;
  elapsedSec: number;
  durationSec: number;
  tint: string;
  ring: RingPresetParams | null;
  particles: Particle[];
  finished: boolean;
}

function parseTint(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function countActiveParticles(emitters: Iterable<ParticleEmitter>): number {
  let total = 0;
  for (const emitter of emitters) {
    total += emitter.particles.length;
  }
  return total;
}

function createParticles(
  config: ParticlesPresetParams,
  count: number,
  remainingBudget: number,
): Particle[] {
  const cappedCount = Math.min(
    Math.max(1, Math.floor(count)),
    MAX_PARTICLES_PER_EMITTER,
    remainingBudget,
  );
  const particles: Particle[] = [];
  for (let i = 0; i < cappedCount; i += 1) {
    const crossVertical = config.shape === 'cross' ? i % 2 === 0 : false;
    const x =
      config.shape === 'cross' && crossVertical
        ? rand(-3, 3)
        : rand(-config.spawnXSpread, config.spawnXSpread);
    const y =
      config.shape === 'cross' && crossVertical
        ? rand(config.spawnYMin, config.spawnYMax)
        : rand(-3, 3);
    particles.push({
      x,
      y,
      vx: rand(-config.vxSpread, config.vxSpread),
      vy: rand(config.vyMin, config.vyMax),
      lifeSec: 0,
      maxLifeSec: rand(config.lifeMinSec, config.lifeMaxSec),
      size: rand(config.sizeMin, config.sizeMax),
      shape: config.shape,
      crossVertical,
    });
  }
  return particles;
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  elapsedSec: number,
  tint: string,
  config: RingPresetParams,
): void {
  const { r, g, b } = parseTint(tint);
  const tailSec = config.fadeSec;
  if (
    elapsedSec < config.ringStartSec ||
    elapsedSec > config.ringEndSec + tailSec
  ) {
    return;
  }

  const t = Math.min(
    1,
    Math.max(
      0,
      (elapsedSec - config.ringStartSec) /
        (config.ringEndSec - config.ringStartSec),
    ),
  );
  const radius =
    config.startRadius + t * (config.endRadius - config.startRadius);
  const fadeT = Math.min(
    1,
    Math.max(0, (elapsedSec - config.ringEndSec) / tailSec),
  );
  const alpha = (1 - fadeT) * (0.55 + (1 - t) * 0.35);

  ctx.save();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.lineWidth = config.lineWidth;
  ctx.beginPath();
  ctx.arc(worldX, worldY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`;
  ctx.beginPath();
  ctx.arc(worldX, worldY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  emitter: ParticleEmitter,
  particle: Particle,
  scale: number,
  rgb: { r: number; g: number; b: number },
): void {
  const lifeT = particle.lifeSec / particle.maxLifeSec;
  if (lifeT >= 1) return;

  const alpha = 1 - lifeT * lifeT;
  const size = particle.size * scale;
  const px = emitter.worldX + particle.x * scale;
  const py = emitter.worldY + particle.y * scale;
  const { r, g, b } = rgb;

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  if (particle.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(px, py, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (particle.shape === 'cross') {
    const arm = size * 1.4;
    const thickness = Math.max(1, size * 0.45);
    if (particle.crossVertical) {
      ctx.fillRect(px - thickness / 2, py - arm / 2, thickness, arm);
    } else {
      ctx.fillRect(px - arm / 2, py - thickness / 2, arm, thickness);
    }
    return;
  }

  ctx.fillRect(px - size / 2, py - size / 2, size, size);
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  emitter: ParticleEmitter,
  scale: number,
): void {
  const rgb = parseTint(emitter.tint);
  for (const particle of emitter.particles) {
    drawParticle(ctx, emitter, particle, scale, rgb);
  }
}

export class ParticlePlaybackManager {
  private readonly emitters = new Map<string, ParticleEmitter>();

  spawn(
    instanceId: string,
    worldPos: { x: number; y: number },
    layer: VfxLayer,
    def: VfxParticleDef,
    presetDefaults: ParticlePresetDef,
  ): void {
    if (!isParticleDefActive(def)) return;
    if (this.emitters.size >= MAX_PARTICLE_EMITTERS) return;

    const resolved = mergeParticleDefWithPreset(def, presetDefaults);
    const ring =
      presetDefaults.kind === 'ring' || presetDefaults.kind === 'composite'
        ? (presetDefaults.ring ?? null)
        : null;
    const particleConfig =
      presetDefaults.kind === 'particles' ||
      presetDefaults.kind === 'composite'
        ? (presetDefaults.particles ?? null)
        : null;

    const remainingBudget =
      MAX_TOTAL_PARTICLES - countActiveParticles(this.emitters.values());
    const particles = particleConfig
      ? createParticles(particleConfig, resolved.count, remainingBudget)
      : [];

    this.emitters.set(instanceId, {
      instanceId,
      worldX: worldPos.x,
      worldY: worldPos.y,
      layer,
      elapsedSec: -resolved.delaySec,
      durationSec: resolved.durationSec,
      tint: resolved.tint,
      ring,
      particles,
      finished: false,
    });
  }

  remove(instanceId: string): void {
    this.emitters.delete(instanceId);
  }

  has(instanceId: string): boolean {
    return this.emitters.has(instanceId);
  }

  tick(deltaMs: number): void {
    const deltaSec = deltaMs / 1000;
    for (const emitter of this.emitters.values()) {
      if (emitter.finished) continue;
      const prevElapsedSec = emitter.elapsedSec;
      emitter.elapsedSec += deltaSec;

      const activeDeltaSec =
        Math.max(0, emitter.elapsedSec) - Math.max(0, prevElapsedSec);

      if (activeDeltaSec > 0) {
        for (const particle of emitter.particles) {
          particle.lifeSec += activeDeltaSec;
          particle.x += particle.vx * activeDeltaSec * 60;
          particle.y += particle.vy * activeDeltaSec;
        }
      }

      if (emitter.elapsedSec >= emitter.durationSec) {
        emitter.finished = true;
      }
    }

    for (const [id, emitter] of this.emitters) {
      if (emitter.finished) {
        this.emitters.delete(id);
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layer: VfxLayer,
    scale: number,
  ): void {
    for (const emitter of this.emitters.values()) {
      if (emitter.layer !== layer || emitter.finished) continue;
      if (emitter.elapsedSec < 0) continue;
      if (emitter.ring) {
        drawRing(
          ctx,
          emitter.worldX,
          emitter.worldY,
          emitter.elapsedSec,
          emitter.tint,
          emitter.ring,
        );
      }
      if (emitter.particles.length > 0) {
        drawParticles(ctx, emitter, scale);
      }
    }
  }
}
