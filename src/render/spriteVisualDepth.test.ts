import { describe, expect, it } from 'vitest';
import {
  assignVisualDepthOffsets,
  MAX_VISUAL_DEPTH_RISE,
  spriteDrawY,
  VISUAL_DEPTH_STEP_PX,
} from './spriteVisualDepth.ts';

describe('spriteVisualDepth', () => {
  it('offsets back units upward without changing foot anchor math', () => {
    expect(spriteDrawY({ y: 100, depthOffsetY: 20 })).toBe(80);
    expect(spriteDrawY({ y: 100 })).toBe(100);
  });

  it('assigns larger offsets to units drawn earlier within a faction', () => {
    const layouts = [
      {
        id: 'supporter',
        x: 50,
        isEnemy: false,
        role: 'supporter' as const,
      },
      {
        id: 'melee',
        x: 50,
        isEnemy: false,
        role: 'attacker' as const,
        attackMethod: 'melee' as const,
      },
    ];
    const offsets = assignVisualDepthOffsets(layouts, 1);
    expect(offsets.get('supporter')).toBe(VISUAL_DEPTH_STEP_PX);
    expect(offsets.get('melee')).toBe(0);
  });

  it('scales depth step with sprite scale', () => {
    const layouts = [
      { id: 'back', x: 20, isEnemy: false, role: 'supporter' as const },
      { id: 'front', x: 84, isEnemy: false, role: 'attacker' as const, attackMethod: 'melee' as const },
    ];
    const offsets = assignVisualDepthOffsets(layouts, 2);
    expect(offsets.get('back')).toBe(VISUAL_DEPTH_STEP_PX * 2);
    expect(offsets.get('front')).toBe(0);
  });

  it('assigns enemy depth by range then battleX', () => {
    const layouts = [
      { id: 'long', x: 300, isEnemy: true, rangePx: 120 },
      { id: 'short', x: 280, isEnemy: true, rangePx: 20 },
    ];
    const offsets = assignVisualDepthOffsets(layouts, 1);
    expect(offsets.get('long')).toBe(VISUAL_DEPTH_STEP_PX);
    expect(offsets.get('short')).toBe(0);
  });

  it('separates same-x allies by role band depth', () => {
    const layouts = [
      { id: 'supporter', x: 50, isEnemy: false, role: 'supporter' as const },
      { id: 'defender', x: 50, isEnemy: false, role: 'defender' as const },
      {
        id: 'ranged',
        x: 50,
        isEnemy: false,
        role: 'attacker' as const,
        attackMethod: 'ranged' as const,
      },
      { id: 'melee', x: 50, isEnemy: false, role: 'attacker' as const, attackMethod: 'melee' as const },
    ];
    const offsets = assignVisualDepthOffsets(layouts, 1);
    expect(offsets.get('supporter')).toBe(VISUAL_DEPTH_STEP_PX * 3);
    expect(offsets.get('defender')).toBe(VISUAL_DEPTH_STEP_PX * 2);
    expect(offsets.get('ranged')).toBe(VISUAL_DEPTH_STEP_PX);
    expect(offsets.get('melee')).toBe(0);
  });

  it('keeps max ally depth offset below grass rise so feet stay inside grass', () => {
    const layouts = [
      { id: 'supporter', x: 50, isEnemy: false, role: 'supporter' as const },
      { id: 'defender', x: 50, isEnemy: false, role: 'defender' as const },
      {
        id: 'ranged',
        x: 50,
        isEnemy: false,
        role: 'attacker' as const,
        attackMethod: 'ranged' as const,
      },
      { id: 'melee', x: 50, isEnemy: false, role: 'attacker' as const, attackMethod: 'melee' as const },
    ];
    const offsets = assignVisualDepthOffsets(layouts, 1);
    const maxOffset = Math.max(...offsets.values());
    expect(maxOffset).toBeLessThan(MAX_VISUAL_DEPTH_RISE);
  });

  it('keeps alive enemy depth when fallen enemies stay in the reference pool', () => {
    const enemyDepthReference = [
      { id: 'rear', x: 340, isEnemy: true as const, rangePx: 20 },
      { id: 'middle', x: 310, isEnemy: true as const, rangePx: 20 },
      { id: 'front', x: 280, isEnemy: true as const, rangePx: 120 },
    ];
    const fullWaveOffsets = assignVisualDepthOffsets(
      enemyDepthReference,
      1,
      { enemyDepthReference },
    );
    const aliveOnlyLayouts = [
      { id: 'rear', x: 340, isEnemy: true as const, rangePx: 20 },
      { id: 'front', x: 280, isEnemy: true as const, rangePx: 120 },
    ];
    const aliveOnlyOffsets = assignVisualDepthOffsets(aliveOnlyLayouts, 1, {
      enemyDepthReference,
    });

    expect(aliveOnlyOffsets.get('front')).toBe(fullWaveOffsets.get('front'));
    expect(aliveOnlyOffsets.get('rear')).toBe(fullWaveOffsets.get('rear'));
    expect(aliveOnlyOffsets.get('front')).not.toBe(
      assignVisualDepthOffsets(aliveOnlyLayouts, 1).get('front'),
    );
  });

  it('reindexes enemy depth when reference pool is omitted', () => {
    const enemyDepthReference = [
      { id: 'rear', x: 340, isEnemy: true as const, rangePx: 20 },
      { id: 'middle', x: 310, isEnemy: true as const, rangePx: 20 },
      { id: 'front', x: 280, isEnemy: true as const, rangePx: 120 },
    ];
    const aliveOnlyLayouts = [
      { id: 'rear', x: 340, isEnemy: true as const, rangePx: 20 },
      { id: 'front', x: 280, isEnemy: true as const, rangePx: 120 },
    ];
    const stableOffsets = assignVisualDepthOffsets(aliveOnlyLayouts, 1, {
      enemyDepthReference,
    });
    const reindexedOffsets = assignVisualDepthOffsets(aliveOnlyLayouts, 1);
    expect(stableOffsets.get('front')).not.toBe(reindexedOffsets.get('front'));
    expect(stableOffsets.get('rear')).not.toBe(reindexedOffsets.get('rear'));
  });
});
