import { describe, expect, it } from 'vitest';
import {
  __registerEntityBodyForTest,
  __resetEntityAtlasForTest,
} from '../render/entityAtlas.ts';
import { computeEntityBodyTimeline } from './entityBodyTimeline.ts';

function mockImage(width: number, height: number): HTMLImageElement {
  return { width, height } as HTMLImageElement;
}

describe('computeEntityBodyTimeline', () => {
  it('reports layout-derived playback for idle', () => {
    const timeline = computeEntityBodyTimeline('__missing_entity__', 'idle');
    expect(timeline.frames).toBe(4);
    expect(timeline.fps).toBe(8);
    expect(timeline.loop).toBe(true);
    expect(timeline.playbackSec).toBe(0.5);
    expect(timeline.cellWidth).toBe(48);
    expect(timeline.cellHeight).toBe(48);
    expect(timeline.hasBodyAtlas).toBe(false);
  });

  it('reflects registered body atlas', () => {
    __registerEntityBodyForTest('df_guardian', mockImage(192, 144));
    try {
      expect(
        computeEntityBodyTimeline('df_guardian', 'death').hasBodyAtlas,
      ).toBe(true);
      expect(computeEntityBodyTimeline('df_guardian', 'death').frames).toBe(3);
      expect(computeEntityBodyTimeline('df_guardian', 'death').playbackSec).toBe(
        0.375,
      );
    } finally {
      __resetEntityAtlasForTest();
    }
  });
});
