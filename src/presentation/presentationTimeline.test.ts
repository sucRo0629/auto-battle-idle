import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from '../render/skillAnimRegistry.ts';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from '../render/vfxAnimRegistry.ts';
import { computePresentationTimeline } from './presentationTimeline.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

const previewEntity = {
  entityId: 'df_guardian',
  role: 'defender' as const,
  rangePx: 0,
  damageType: 'physical' as const,
  basicAttackVfx: {},
  isEnemy: false,
};

describe('computePresentationTimeline', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
    __resetVfxAnimsForTest();
  });

  it('includes body playback when skill strip exists', () => {
    const skill: ActiveSkillDef = {
      id: 'test_skill',
      name: 'Test',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.bodyPlaybackFrames).toBeNull();
    expect(timeline.useDurationSec).toBe(0);
  });

  it('ignores presentationLock when resolving body playback sec', () => {
    __registerSkillAnimForTest('test_body', { width: 256, height: 48 } as HTMLImageElement);
    __registerVfxAnimForTest('test_body_0_vfx', mockImage(320));
    const skill: ActiveSkillDef = {
      id: 'test_body',
      name: 'Body',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          animStartFrame: 0,
          animLoopFrame: 1,
          vfx: {},
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.presentationLockSec).toBe(0.625);
    expect(timeline.bodyPlaybackSec).toBe(0.25);
    expect(timeline.bodyHoldSec).toBe(0);
  });

  it('reports move duration for move effects', () => {
    __registerVfxAnimForTest('test_move_1_vfx', mockImage(320));
    const skill: ActiveSkillDef = {
      id: 'test_move',
      name: 'Move',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'move',
          target: { rule: 'frontEnemy' },
          moveDurationSec: 0.4,
        },
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {},
        },
      ],
    };

    const moveTimeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(moveTimeline.moveDurationSec).toBe(0.4);

    const damageTimeline = computePresentationTimeline(skill, 1, previewEntity, 'active');
    expect(damageTimeline.vfxKey).toBe('test_move_1_vfx');
    expect(damageTimeline.vfxSec).toBe(0.625);
  });

  it('suppresses skill vfx fallback when effectVfxOnly is enabled', () => {
    const skill: ActiveSkillDef = {
      id: 'test_damage',
      name: 'Damage',
      trigger: { kind: 'manual' },
      vfx: {},
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.vfxKey).toBeNull();
    expect(timeline.vfxSec).toBeNull();
  });

  it('uses skill useDurationSec when set', () => {
    const skill: ActiveSkillDef = {
      id: 'test_use',
      name: 'Use',
      trigger: { kind: 'manual' },
      useDurationSec: 1.2,
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.useDurationSec).toBe(1.2);
    expect(timeline.presentationLockSec).toBe(0);
  });
});
