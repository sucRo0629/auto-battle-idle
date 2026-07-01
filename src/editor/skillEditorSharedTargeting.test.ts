import { describe, expect, it } from 'vitest';
import {
  hasSkillSharedTargeting,
  mergeEffectWithSkillTargeting,
} from '../battle/skills/skillSharedTargeting.ts';
import type { ActiveSkillDef } from '../battle/types.ts';
import { targetSpecForPierceShape } from './skillEditorCombatFields.ts';

describe('skill editor shared targeting helpers', () => {
  it('targetSpecForPierceShape keeps enemy side and forces selfOrigin', () => {
    expect(
      targetSpecForPierceShape({
        kind: 'distance',
        side: 'enemy',
        order: 'nearest',
      }),
    ).toEqual({
      kind: 'distance',
      side: 'enemy',
      order: 'selfOrigin',
    });
  });

  it('targetSpecForPierceShape keeps ally side and includeSelf', () => {
    expect(
      targetSpecForPierceShape({
        kind: 'distance',
        side: 'ally',
        order: 'nearest',
        includeSelf: true,
      }),
    ).toEqual({
      kind: 'distance',
      side: 'ally',
      order: 'selfOrigin',
      includeSelf: true,
    });
  });

  it('mergeEffectWithSkillTargeting inherits enemy pierce from skill (崩勢型)', () => {
    const skill: ActiveSkillDef = {
      id: 'test_lancer',
      name: '崩勢',
      trigger: { kind: 'time', value: 14 },
      target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
      targetShape: 'pierce',
      pierceDurationSec: 0.1,
      effect: [
        {
          type: 'debuff',
          debuffSubKind: 'stun',
          durationSec: 2,
        },
        {
          type: 'knockback',
          distancePx: 25,
        },
        {
          type: 'damage',
          amount: { kind: 'atkBased', atkScale: 0.2 },
        },
      ],
    };
    expect(hasSkillSharedTargeting(skill)).toBe(true);
    for (const effect of skill.effect) {
      const merged = mergeEffectWithSkillTargeting(skill, effect);
      expect(merged.target).toEqual(skill.target);
      expect(merged.targetShape).toBe('pierce');
      expect(merged.pierceDurationSec).toBe(0.1);
    }
  });
});
