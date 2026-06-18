import type { VfxLayer } from '../battle/types.ts';
import { SHARED_ANIM_FPS } from './SpriteRegistry.ts';
import { drawVfxFrameAtAnchor } from './spriteFrameDraw.ts';
import { getVfxAnimFrameCount } from './vfxAnimRegistry.ts';
import {
  resolveVfxAnimPlayback,
  type VfxPlaybackOptions,
} from './vfxAnimPlayback.ts';
import type { SkillAnimPhaseConfig } from './skillAnimPlayback.ts';

type VfxAnimPhase = 'intro' | 'loop' | 'outro';

interface VfxInstance {
  instanceId: string;
  vfxKey: string;
  worldX: number;
  worldY: number;
  layer: VfxLayer;
  startFrame: number;
  frame: number;
  frameElapsedSec: number;
  phased: boolean;
  phase: VfxAnimPhase | null;
  phaseConfig: SkillAnimPhaseConfig | null;
  holdElapsedSec: number;
  finished: boolean;
}

export class VfxPlaybackManager {
  private readonly instances = new Map<string, VfxInstance>();

  spawn(
    instanceId: string,
    vfxKey: string,
    worldPos: { x: number; y: number },
    playbackOptions: VfxPlaybackOptions = {},
    layer: VfxLayer = 'front',
  ): void {
    const holdSec = playbackOptions.holdSec ?? 0;
    const playback = resolveVfxAnimPlayback(vfxKey, playbackOptions, holdSec);
    const phased = playback.phased;

    this.instances.set(instanceId, {
      instanceId,
      vfxKey,
      worldX: worldPos.x,
      worldY: worldPos.y,
      layer,
      startFrame: playback.startFrame,
      frame: playback.startFrame,
      frameElapsedSec: 0,
      phased: phased !== null,
      phase: phased ? 'intro' : null,
      phaseConfig: phased,
      holdElapsedSec: 0,
      finished: false,
    });
  }

  remove(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  has(instanceId: string): boolean {
    return this.instances.has(instanceId);
  }

  getFrame(instanceId: string): number | undefined {
    return this.instances.get(instanceId)?.frame;
  }

  tick(deltaMs: number): void {
    for (const instance of this.instances.values()) {
      if (instance.finished) continue;
      if (instance.phased && instance.phaseConfig) {
        this.tickPhased(instance, deltaMs, instance.phaseConfig);
      } else {
        this.tickLinear(instance, deltaMs);
      }
    }

    for (const [id, instance] of this.instances) {
      if (instance.finished) {
        this.instances.delete(id);
      }
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    layer: VfxLayer,
    scale: number,
  ): void {
    for (const instance of this.instances.values()) {
      if (instance.layer !== layer || instance.finished) continue;
      drawVfxFrameAtAnchor(
        ctx,
        instance.vfxKey,
        instance.frame,
        instance.worldX,
        instance.worldY,
        scale,
      );
    }
  }

  private tickLinear(instance: VfxInstance, deltaMs: number): void {
    const frameCount = getVfxAnimFrameCount(instance.vfxKey);
    const frameDuration = 1 / SHARED_ANIM_FPS;
    instance.frameElapsedSec += deltaMs / 1000;

    while (instance.frameElapsedSec >= frameDuration) {
      instance.frameElapsedSec -= frameDuration;
      instance.frame += 1;
      if (instance.frame >= frameCount) {
        instance.frame = frameCount - 1;
        instance.finished = true;
        return;
      }
    }
  }

  private tickPhased(
    instance: VfxInstance,
    deltaMs: number,
    config: SkillAnimPhaseConfig,
  ): void {
    const frameCount = config.stripFrameCount;
    const frameDuration = 1 / SHARED_ANIM_FPS;
    const deltaSec = deltaMs / 1000;

    if (instance.phase === 'intro') {
      instance.frameElapsedSec += deltaSec;
      while (instance.frameElapsedSec >= frameDuration) {
        instance.frameElapsedSec -= frameDuration;
        instance.frame += 1;
        if (instance.frame > config.introEndFrame) {
          instance.frame = config.loopFrame;
          instance.phase = 'loop';
          instance.holdElapsedSec = 0;
          instance.frameElapsedSec = 0;
          if (config.holdSec <= 0) {
            this.beginOutro(instance, config, frameCount);
          }
          return;
        }
      }
      return;
    }

    if (instance.phase === 'loop') {
      instance.holdElapsedSec += deltaSec;
      if (config.loopEndFrame > config.loopFrame) {
        instance.frameElapsedSec += deltaSec;
        while (instance.frameElapsedSec >= frameDuration) {
          instance.frameElapsedSec -= frameDuration;
          if (instance.frame < config.loopEndFrame) {
            instance.frame += 1;
          } else {
            instance.frame = config.loopFrame;
          }
        }
      }
      if (instance.holdElapsedSec >= config.holdSec) {
        this.beginOutro(instance, config, frameCount);
      }
      return;
    }

    if (instance.phase === 'outro') {
      instance.frameElapsedSec += deltaSec;
      while (instance.frameElapsedSec >= frameDuration) {
        instance.frameElapsedSec -= frameDuration;
        instance.frame += 1;
        if (instance.frame >= frameCount) {
          instance.frame = frameCount - 1;
          instance.finished = true;
          return;
        }
      }
    }
  }

  private beginOutro(
    instance: VfxInstance,
    config: SkillAnimPhaseConfig,
    frameCount: number,
  ): void {
    if (config.outroStartFrame >= frameCount) {
      instance.finished = true;
      return;
    }
    instance.phase = 'outro';
    instance.frame = config.outroStartFrame;
    instance.frameElapsedSec = 0;
  }
}
