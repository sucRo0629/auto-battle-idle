import {
  getEntityAnimLayout,
  getEntityAnimSpriteDef,
  hasEntityBodyAtlas,
  type EntityBodyAnim,
} from '../render/entityAtlas.ts';

export interface EntityBodyTimeline {
  anim: EntityBodyAnim;
  entityId: string;
  frames: number;
  fps: number;
  loop: boolean;
  playbackSec: number;
  hasBodyAtlas: boolean;
  cellWidth: number;
  cellHeight: number;
}

export function computeEntityBodyTimeline(
  entityId: string,
  anim: EntityBodyAnim,
): EntityBodyTimeline {
  const layout = getEntityAnimLayout();
  const def = getEntityAnimSpriteDef(anim);
  return {
    anim,
    entityId,
    frames: def.frames,
    fps: def.fps,
    loop: def.loop,
    playbackSec: def.frames / def.fps,
    hasBodyAtlas: hasEntityBodyAtlas(entityId),
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
  };
}
