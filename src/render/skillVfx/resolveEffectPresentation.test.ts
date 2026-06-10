import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, MoveSkillEffect } from '../../battle/types.ts';
import {
  resolveEffectPresentation,
  shouldPlayActorAnim,
} from './resolveEffectPresentation.ts';

const skill: ActiveSkillDef = {
  id: 'test_skill',
  name: 'test',
  trigger: { kind: 'time', value: 5 },
  vfx: { preset: 'orb' },
  effect: [],
};

const ctx = {
  rangePx: 0,
  damageType: 'physical' as const,
  slotKind: 'active' as const,
  effectKind: 'damage' as const,
};

describe('resolveEffectPresentation', () => {
  it('defaults move to dash without vfx', () => {
    const effect: MoveSkillEffect = {
      type: 'move',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      moveDurationSec: 0.25,
    };
    const result = resolveEffectPresentation('test_skill', effect, skill, {
      ...ctx,
      effectKind: 'move',
    });
    expect(result.anim).toBe('dash');
    expect(result.vfx).toBeNull();
  });

  it('uses effect anim override', () => {
    const effect: MoveSkillEffect = {
      type: 'move',
      target: { kind: "distance", side: "ally", order: "nearest" },
      moveMode: 'toAnchor',
      moveDurationSec: 0.3,
      anim: 'idle',
    };
    const result = resolveEffectPresentation('test_skill', effect, skill, {
      ...ctx,
      effectKind: 'move',
    });
    expect(result.anim).toBe('idle');
  });

  it('uses effect vfx override before skill vfx', () => {
    const result = resolveEffectPresentation(
      'test_skill',
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
        vfx: { preset: 'slash' },
      },
      skill,
      ctx,
    );
    expect(result.anim).toBe('attack');
    expect(result.vfx?.preset).toBe('slash');
  });

  it('falls back to skill vfx when effect vfx is unset', () => {
    const result = resolveEffectPresentation(
      'test_skill',
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      skill,
      ctx,
    );
    expect(result.vfx?.preset).toBe('orb');
  });

  it('returns none anim as null', () => {
    const result = resolveEffectPresentation(
      'test_skill',
      {
        type: 'buff',
        target: { kind: "self" },
        buffStat: 'atk',
        buffMultiplier: 1.2,
        buffDurationSec: 5,
        anim: 'none',
      },
      skill,
      { ...ctx, effectKind: 'buff' },
    );
    expect(result.anim).toBeNull();
    expect(result.vfx).toBeNull();
  });
});

describe('shouldPlayActorAnim', () => {
  it('skips ranged basic attack anim', () => {
    expect(shouldPlayActorAnim('attack', 55, 'basic')).toBe(false);
    expect(shouldPlayActorAnim('attack', 50, 'basic')).toBe(true);
    expect(shouldPlayActorAnim('attack', 55, 'active')).toBe(true);
    expect(shouldPlayActorAnim('dash', 0, 'active')).toBe(true);
  });
});
