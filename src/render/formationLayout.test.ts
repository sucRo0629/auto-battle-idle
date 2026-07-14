import { describe, expect, it } from 'vitest';
import { BATTLE_CANVAS_HEIGHT } from '../battle/battleConstants.ts';
import {
  BATTLE_FIELD_SPRITE_SCALE,
  GRASS_BAND_H,
  battleFieldTopPad,
  groundLineY,
  groundY,
} from './formationLayout.ts';
import { SPRITE_LAYOUT_SIZE } from './spriteLayout.ts';
import { MAX_VISUAL_DEPTH_OFFSET } from './spriteVisualDepth.ts';

describe('formationLayout', () => {
  it('places ground line at canvas bottom grass band', () => {
    expect(groundLineY(BATTLE_CANVAS_HEIGHT)).toBe(
      BATTLE_CANVAS_HEIGHT - GRASS_BAND_H,
    );
    expect(groundY(BATTLE_CANVAS_HEIGHT, BATTLE_FIELD_SPRITE_SCALE)).toBe(
      groundLineY(BATTLE_CANVAS_HEIGHT) -
        SPRITE_LAYOUT_SIZE * BATTLE_FIELD_SPRITE_SCALE,
    );
  });

  it('keeps unit sprites inside the shorter battle lane canvas', () => {
    const scale = BATTLE_FIELD_SPRITE_SCALE;
    const feetY = groundY(BATTLE_CANVAS_HEIGHT, scale);
    const headTopAtMaxDepth = feetY - MAX_VISUAL_DEPTH_OFFSET * scale;
    expect(feetY).toBeLessThanOrEqual(BATTLE_CANVAS_HEIGHT - GRASS_BAND_H);
    expect(headTopAtMaxDepth).toBeGreaterThanOrEqual(0);
    expect(battleFieldTopPad(scale)).toBeGreaterThan(0);
  });
});
