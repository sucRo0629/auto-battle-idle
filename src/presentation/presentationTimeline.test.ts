import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import { resolvePresentationLockSec } from '../battle/skills/presentationLock.ts';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from '../render/skillAnimRegistry.ts';
import {
  resolveEffectApplyDelaySec,
} from '../render/skillAnimPlayback.ts';
import {
  buildSkillPresentationContext,
  resolveSkillPresentation,
} from '../render/skillPresentation.ts';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from '../render/vfxAnimRegistry.ts';
import { resolveParticlePlaybackSec } from '../render/particlePlayback.ts';
import { resolveVfxPlaybackSec } from '../render/vfxAnimPlayback.ts';
import { resolveVfxAnimKey } from '../render/vfxAnimRegistry.ts';
import {
  buildSkillVfxContext,
  computePresentationTimeline,
} from './presentationTimeline.ts';

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

  it('reports applyDelaySec from applyFrame on the body strip', () => {
    __registerSkillAnimForTest('apply_frame', { width: 256, height: 48 } as HTMLImageElement);
    const skill: ActiveSkillDef = {
      id: 'apply_frame',
      name: 'Apply Frame',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          animStartFrame: 1,
          applyFrame: 3,
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    const expectedDelay = resolveEffectApplyDelaySec(
      skill.id,
      0,
      skill.effect[0]!,
    );
    expect(expectedDelay).toBe(0.25);
    expect(timeline.applyDelaySec).toBe(expectedDelay);
  });

  it('reports PNG vfxSec and hitVfxSec from registered strips', () => {
    __registerVfxAnimForTest('vfx_timing_0_vfx', mockImage(320));
    __registerVfxAnimForTest('vfx_timing_0_vfx_hit', mockImage(192));
    const skill: ActiveSkillDef = {
      id: 'vfx_timing',
      name: 'VFX Timing',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {},
          hitVfx: {},
        },
      ],
    };
    const effect = skill.effect[0]!;
    const ctx = buildSkillVfxContext(previewEntity, 'active', effect, skill.id, 0);
    const presentation = resolveSkillPresentation(skill, effect, ctx);

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    const mainKey = resolveVfxAnimKey(skill.id, 0, 'main');
    const hitKey = resolveVfxAnimKey(skill.id, 0, 'hit');

    expect(mainKey).toBe('vfx_timing_0_vfx');
    expect(hitKey).toBe('vfx_timing_0_vfx_hit');
    expect(timeline.vfxSec).toBe(resolveVfxPlaybackSec(presentation.vfx!, mainKey!));
    expect(timeline.hitVfxSec).toBe(resolveVfxPlaybackSec(presentation.hitVfx!, hitKey!));
    expect(timeline.particleSec).toBeNull();
    expect(timeline.hitParticleSec).toBeNull();
    expect(timeline.vfxSec).toBe(0.625);
    expect(timeline.hitVfxSec).toBe(0.375);
  });

  it('reports particleSec when only particles are active', () => {
    const skill: ActiveSkillDef = {
      id: 'particle_only',
      name: 'Particle Only',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'heal',
          target: { rule: 'mostDamagedAlly' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {
            particles: {
              preset: 'heal_holy_light',
              durationSec: 1.2,
            },
          },
        },
      ],
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    const effect = skill.effect[0]!;
    const presentation = resolveSkillPresentation(
      skill,
      effect,
      buildSkillVfxContext(previewEntity, 'active', effect, skill.id, 0),
    );

    expect(timeline.vfxSec).toBeNull();
    expect(timeline.particleSec).toBe(resolveParticlePlaybackSec(presentation.vfx!.particles!));
    expect(timeline.presentationLockSec).toBe(1.2);
  });

  it('matches battle presentationLockSec for the same skill JSON', () => {
    __registerSkillAnimForTest('lock_parity', { width: 256, height: 48 } as HTMLImageElement);
    __registerVfxAnimForTest('lock_parity_0_vfx', mockImage(320));
    const skill: ActiveSkillDef = {
      id: 'lock_parity',
      name: 'Lock Parity',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {},
        },
      ],
    };
    const actorStub = {
      role: previewEntity.role,
      traits: {
        rangePx: previewEntity.rangePx,
        damageType: previewEntity.damageType,
        basicAttackVfx: previewEntity.basicAttackVfx,
      },
    };

    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    expect(timeline.presentationLockSec).toBe(
      resolvePresentationLockSec(skill, actorStub as never, 'active'),
    );
    expect(timeline.presentationLockSec).toBe(0.625);
  });

  it('combines PNG and particle timing in presentationLock and timeline', () => {
    __registerVfxAnimForTest('particle_combo_0_vfx', mockImage(320));
    const skill: ActiveSkillDef = {
      id: 'particle_combo',
      name: 'Particle Combo',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {
            particles: {
              preset: 'heal_holy_light',
              durationSec: 1.2,
            },
          },
        },
      ],
    };
    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    const effect = skill.effect[0]!;
    const presentation = resolveSkillPresentation(
      skill,
      effect,
      buildSkillVfxContext(previewEntity, 'active', effect, skill.id, 0),
    );
    const mainKey = resolveVfxAnimKey(skill.id, 0, 'main');

    expect(timeline.vfxSec).toBe(resolveVfxPlaybackSec(presentation.vfx!, mainKey!));
    expect(timeline.particleSec).toBe(resolveParticlePlaybackSec(presentation.vfx!.particles!));
    expect(timeline.presentationLockSec).toBe(1.2);
  });

  it('lab and battle resolvers agree on vfxSec and applyDelay for the same JSON', () => {
    __registerSkillAnimForTest('parity_skill', { width: 256, height: 48 } as HTMLImageElement);
    __registerVfxAnimForTest('parity_skill_0_vfx', mockImage(256));
    const skill: ActiveSkillDef = {
      id: 'parity_skill',
      name: 'Parity',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          animStartFrame: 1,
          applyFrame: 2,
          vfx: {},
        },
      ],
    };
    const effect = skill.effect[0]!;
    const slotKind = 'active' as const;

    const labCtx = buildSkillVfxContext(previewEntity, slotKind, effect, skill.id, 0);
    const battleCtx = buildSkillPresentationContext(
      previewEntity,
      slotKind,
      effect,
      skill.id,
      0,
    );
    expect(battleCtx).toEqual(labCtx);

    const presentation = resolveSkillPresentation(skill, effect, battleCtx);
    const timeline = computePresentationTimeline(skill, 0, previewEntity, slotKind);
    const mainKey = resolveVfxAnimKey(skill.id, 0, 'main');

    expect(timeline.applyDelaySec).toBe(resolveEffectApplyDelaySec(skill.id, 0, effect));
    expect(timeline.vfxSec).toBe(resolveVfxPlaybackSec(presentation.vfx!, mainKey!));
  });
});
