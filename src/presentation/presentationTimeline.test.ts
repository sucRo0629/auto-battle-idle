import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
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

  it('falls back to skill vfx when effect vfx preset is unset', () => {
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
    expect(timeline.vfxPreset).toBe('orb');
    expect(timeline.vfxSec).toBeGreaterThan(0);
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
