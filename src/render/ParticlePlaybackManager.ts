import type { VfxLayer } from '../battle/types.ts';
import type { ParticlePresetId, ParticleSpawnOptions } from './particlePlayback.ts';
import { isParticlePresetId } from './particlePresets.ts';

interface CrossParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
  size: number;
}

interface ParticleEmitter {
  instanceId: string;
  presetId: ParticlePresetId;
  worldX: number;
  worldY: number;
  layer: VfxLayer;
  elapsedSec: number;
  durationSec: number;
  tint: string;
  particles: CrossParticle[];
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

function spawnHealHolyLightParticles(count: number): CrossParticle[] {
  const particles: CrossParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const verticalArm = i % 2 === 0;
    const x = verticalArm ? rand(-3, 3) : rand(-14, 14);
    const y = verticalArm ? rand(-10, 2) : rand(-3, 3);
    particles.push({
      x,
      y,
      vx: rand(-0.15, 0.15),
      vy: rand(-42, -24),
      lifeSec: 0,
      maxLifeSec: rand(0.45, 0.75),
      size: rand(1.5, 3.5),
    });
  }
  return particles;
}

function drawExpandingRing(
  ctx: CanvasRenderingContext2D,
  worldX: number,
  worldY: number,
  elapsedSec: number,
  tint: string,
): void {
  const { r, g, b } = parseTint(tint);
  const ringStartSec = 0.04;
  const ringEndSec = 0.42;
  if (elapsedSec < ringStartSec || elapsedSec > ringEndSec + 0.18) return;

  const t = Math.min(
    1,
    Math.max(0, (elapsedSec - ringStartSec) / (ringEndSec - ringStartSec)),
  );
  const radius = 6 + t * 30;
  const fadeT = Math.min(1, Math.max(0, (elapsedSec - ringEndSec) / 0.18));
  const alpha = (1 - fadeT) * (0.55 + (1 - t) * 0.35);

  ctx.save();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(worldX, worldY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`;
  ctx.beginPath();
  ctx.arc(worldX, worldY, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrossParticles(
  ctx: CanvasRenderingContext2D,
  emitter: ParticleEmitter,
  scale: number,
): void {
  const { r, g, b } = parseTint(emitter.tint);
  for (const particle of emitter.particles) {
    const lifeT = particle.lifeSec / particle.maxLifeSec;
    if (lifeT >= 1) continue;
    const alpha = 1 - lifeT * lifeT;
    const size = particle.size * scale;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillRect(
      emitter.worldX + particle.x * scale - size / 2,
      emitter.worldY + particle.y * scale - size / 2,
      size,
      size,
    );
  }
}

export class ParticlePlaybackManager {
  private readonly emitters = new Map<string, ParticleEmitter>();

  spawn(
    instanceId: string,
    presetId: string,
    worldPos: { x: number; y: number },
    options: ParticleSpawnOptions = {},
    layer: VfxLayer = 'front',
  ): void {
    if (!isParticlePresetId(presetId)) return;

    const durationSec = options.durationSec ?? 0.8;
    const count = Math.max(1, Math.floor(options.count ?? 12));
    const tint = options.tint ?? '#ffffff';

    const particles =
      presetId === 'heal_holy_light'
        ? spawnHealHolyLightParticles(count)
        : [];

    this.emitters.set(instanceId, {
      instanceId,
      presetId,
      worldX: worldPos.x,
      worldY: worldPos.y,
      layer,
      elapsedSec: 0,
      durationSec,
      tint,
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
      emitter.elapsedSec += deltaSec;

      for (const particle of emitter.particles) {
        particle.lifeSec += deltaSec;
        particle.x += particle.vx * deltaSec * 60;
        particle.y += particle.vy * deltaSec;
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
      if (emitter.presetId === 'heal_holy_light') {
        drawExpandingRing(
          ctx,
          emitter.worldX,
          emitter.worldY,
          emitter.elapsedSec,
          emitter.tint,
        );
        drawCrossParticles(ctx, emitter, scale);
      }
    }
  }
}
