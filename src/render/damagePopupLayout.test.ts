import { describe, expect, it } from 'vitest';
import {
  computeDamagePopupBaseAnchorY,
  computeDamagePopupTops,
  computeSpriteDrawHeight,
  computeSpriteHeadTopY,
  defaultDamagePopupAnchorY,
  HEAD_GAP_ABOVE_SPRITE,
  type DamagePopupLayoutInput,
} from './damagePopupLayout.ts';

describe('computeSpriteHeadTopY', () => {
  it('places head top above a 32px layout box when draw height is 48px', () => {
    const layoutY = 100;
    const bob = 0;
    const spriteSize = 32;
    const drawH = 48;

    expect(computeSpriteHeadTopY(layoutY, bob, spriteSize, drawH)).toBe(84);
    expect(
      defaultDamagePopupAnchorY(
        computeSpriteHeadTopY(layoutY, bob, spriteSize, drawH),
        1,
        0,
        0,
      ),
    ).toBe(84 - HEAD_GAP_ABOVE_SPRITE);
  });
});

describe('computeDamagePopupBaseAnchorY', () => {
  it('uses sheet cell height for normal sprites and skill strip height during skill anim', () => {
    const baseLayout = {
      y: 100,
      spriteKey: 'at_warrior',
      anim: 'idle' as const,
      animFrame: 0,
    };

    expect(computeSpriteDrawHeight(baseLayout, 1)).toBe(48);
    expect(
      computeDamagePopupBaseAnchorY(baseLayout, 32, 1, 0, 0),
    ).toBe(100 + 32 - 48 - HEAD_GAP_ABOVE_SPRITE);

    expect(
      computeSpriteDrawHeight(
        { ...baseLayout, skillAnimKey: 'slash' },
        1,
      ),
    ).toBe(48);
    expect(
      computeDamagePopupBaseAnchorY(
        { ...baseLayout, skillAnimKey: 'slash' },
        32,
        1,
        0,
        0,
      ),
    ).toBe(100 + 32 - 48 - HEAD_GAP_ABOVE_SPRITE);
  });
});

describe('computeDamagePopupTops', () => {
  const baseY = 80;
  const textHeight = 20;

  function topsFor(
    popups: DamagePopupLayoutInput[],
    baseAnchorYById: Map<number, number>,
  ): Map<number, number> {
    return computeDamagePopupTops(popups, baseAnchorYById);
  }

  it('stacks horizontally overlapping popups upward by half height', () => {
    const popups: DamagePopupLayoutInput[] = [
      {
        id: 0,
        layoutX: 120,
        elapsedMs: 200,
        centerX: 136,
        textWidth: 40,
        textHeight,
      },
      {
        id: 1,
        layoutX: 120,
        elapsedMs: 50,
        centerX: 138,
        textWidth: 40,
        textHeight,
      },
    ];
    const baseAnchorYById = new Map([
      [0, baseY],
      [1, baseY],
    ]);

    const result = topsFor(popups, baseAnchorYById);
    expect(result.get(0)).toBe(baseY);
    expect(result.get(1)).toBeLessThan(baseY);
    expect(baseY - result.get(1)!).toBeCloseTo(textHeight / 2, 0);
  });

  it('does not offset popups that are horizontally separated', () => {
    const popups: DamagePopupLayoutInput[] = [
      {
        id: 0,
        layoutX: 80,
        elapsedMs: 200,
        centerX: 96,
        textWidth: 40,
        textHeight,
      },
      {
        id: 1,
        layoutX: 200,
        elapsedMs: 50,
        centerX: 216,
        textWidth: 40,
        textHeight,
      },
    ];
    const baseAnchorYById = new Map([
      [0, baseY],
      [1, baseY],
    ]);

    const result = topsFor(popups, baseAnchorYById);
    expect(result.get(0)).toBe(baseY);
    expect(result.get(1)).toBe(baseY);
  });
});
