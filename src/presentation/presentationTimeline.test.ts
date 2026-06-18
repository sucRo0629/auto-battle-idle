import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from '../render/skillAnimRegistry.ts';
import { computePresentationTimeline } from './presentationTimeline.ts';

const previewEntity = {
  entityId: 'df_guardian',
  role: 'defender' as const,
  rangePx: 0,
  damageType: 'physical' as const,
  basicAttackVfx: { preset: 'slash' as const },
  isEnemy: false,
};

describe('computePresentationTimeline', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
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
          vfx: { preset: 'slash', durationMs: 500 },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.presentationLockSec).toBe(0.5);
    expect(timeline.bodyPlaybackSec).toBe(0.25);
    expect(timeline.bodyHoldSec).toBe(0);
  });

  it('reports move duration for move effects', () => {
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
          vfx: { preset: 'slash', durationMs: 500 },
        },
      ],
    };

    const moveTimeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(moveTimeline.moveDurationSec).toBe(0.4);

    const damageTimeline = computePresentationTimeline(skill, 1, previewEntity, 'active');
    expect(damageTimeline.vfxPreset).toBe('slash');
    expect(damageTimeline.vfxSec).toBe(0.5);
  });

  it('suppresses skill vfx fallback when effectVfxOnly is enabled', () => {
    const skill: ActiveSkillDef = {
      id: 'test_damage',
      name: 'Damage',
      trigger: { kind: 'manual' },
      vfx: { preset: 'orb' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.vfxPreset).toBeNull();
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
