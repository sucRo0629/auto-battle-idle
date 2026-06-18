import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef } from '../battle/types.ts';
import { resolveEffectApplyDelaySec } from '../render/skillAnimPlayback.ts';
import {
  buildSkillPresentationContext,
  playSkillHitFeedback,
  resolveSkillPresentation,
} from '../render/skillPresentation.ts';
import { resolveParticlePlaybackSec } from '../render/particlePlayback.ts';
import { buildSkillVfxContext, computePresentationTimeline } from './presentationTimeline.ts';

/**
 * PresentationPreviewRunner と BattleView / SkillExecutor が同じ resolve 経路を
 * 共有することを、モジュール参照と同一入力の出力一致で固定する。
 */
describe('presentation lab / battle parity', () => {
  const previewEntity = {
    entityId: 'df_guardian',
    role: 'defender' as const,
    rangePx: 0,
    damageType: 'physical' as const,
    basicAttackVfx: {},
    isEnemy: false,
  };

  const skill: ActiveSkillDef = {
    id: 'parity_shared',
    name: 'Parity Shared',
    trigger: { kind: 'manual' },
    effect: [
      {
        type: 'damage',
        target: { rule: 'frontEnemy' },
        amount: { kind: 'atkScale', scale: 1 },
        applyFrame: 2,
        vfx: { placement: { anchor: 'footActor' } },
      },
    ],
  };

  it('buildSkillVfxContext and buildSkillPresentationContext produce the same context', () => {
    const effect = skill.effect[0]!;
    const slotKind = 'active' as const;

    expect(
      buildSkillVfxContext(previewEntity, slotKind, effect, skill.id, 0),
    ).toEqual(
      buildSkillPresentationContext(
        previewEntity,
        slotKind,
        effect,
        skill.id,
        0,
      ),
    );
  });

  it('resolveSkillPresentation is the function used by playSkillHitFeedback callers', () => {
    const effect = skill.effect[0]!;
    const ctx = buildSkillPresentationContext(
      previewEntity,
      'active',
      effect,
      skill.id,
      0,
    );
    const presentation = resolveSkillPresentation(skill, effect, ctx);

    const canvas = {
      playSkillVfx: (
        _instanceId: string,
        actorId: string,
        targetId: string,
        vfx: { placement?: { anchor: string } },
      ) => {
        expect(actorId).toBe('preview_actor');
        expect(targetId).toBe('preview_target');
        expect(vfx.placement).toEqual({ anchor: 'footActor' });
      },
      showDamagePopup: () => {},
      showHealPopup: () => {},
    };

    playSkillHitFeedback(canvas, {
      sourceId: 'preview_actor',
      targetId: 'preview_target',
      presentation,
      effect,
      skillId: skill.id,
      effectIndex: 0,
    });
  });

  it('timeline applyDelaySec matches PresentationPreviewRunner delay resolver', () => {
    const effect = skill.effect[0]!;
    const timeline = computePresentationTimeline(skill, 0, previewEntity, 'active');
    const previewDelay = resolveEffectApplyDelaySec(skill.id, 0, effect);

    expect(timeline.applyDelaySec).toBe(previewDelay);
    expect(timeline.applyDelaySec).toBe(0.25);
  });

  it('timeline particleSec matches the resolved particle playback duration', () => {
    const particleSkill: ActiveSkillDef = {
      ...skill,
      id: 'parity_particles',
      effect: [
        {
          ...skill.effect[0]!,
          vfx: {
            particles: {
              preset: 'heal_normal',
              durationSec: 0.8,
            },
          },
        },
      ],
    };
    const effect = particleSkill.effect[0]!;
    const ctx = buildSkillPresentationContext(
      previewEntity,
      'active',
      effect,
      particleSkill.id,
      0,
    );
    const presentation = resolveSkillPresentation(particleSkill, effect, ctx);
    const timeline = computePresentationTimeline(particleSkill, 0, previewEntity, 'active');

    expect(timeline.particleSec).toBe(
      resolveParticlePlaybackSec(presentation.vfx!.particles!),
    );
    expect(timeline.particleSec).toBe(0.8);
  });
});
