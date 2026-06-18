import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, MoveSkillEffect } from '../../battle/types.ts';
import {
  resolveEffectPresentation,
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

const basicCtx = {
  ...ctx,
  slotKind: 'basic' as const,
};

describe('resolveEffectPresentation', () => {
  it('defaults move to none without vfx', () => {
    const effect: MoveSkillEffect = {
      type: 'move',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      moveDurationSec: 0.25,
    };
    const result = resolveEffectPresentation(effect, skill, {
      ...ctx,
      effectKind: 'move',
    });
    expect(result.anim).toBeNull();
    expect(result.vfx).toBeNull();
  });

  it('defaults heal to none', () => {
    const result = resolveEffectPresentation(
      {
        type: 'heal',
        target: { kind: 'stat', side: 'ally', stat: 'hp', order: 'ratio' },
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      skill,
      { ...ctx, effectKind: 'heal' },
    );
    expect(result.anim).toBeNull();
  });

  it('maps legacy dash anim to none', () => {
    const effect: MoveSkillEffect = {
      type: 'move',
      target: { kind: "distance", side: "enemy", order: "nearest" },
      moveDurationSec: 0.25,
      anim: 'dash',
    };
    const result = resolveEffectPresentation(effect, skill, {
      ...ctx,
      effectKind: 'move',
    });
    expect(result.anim).toBeNull();
  });

  it('uses effect anim override', () => {
    const effect: MoveSkillEffect = {
      type: 'move',
      target: { kind: "distance", side: "ally", order: "nearest" },
      moveMode: 'toAnchor',
      moveDurationSec: 0.3,
      anim: 'idle',
    };
    const result = resolveEffectPresentation(effect, skill, {
      ...ctx,
      effectKind: 'move',
    });
    expect(result.anim).toBe('idle');
  });

  it('uses effect vfx override before skill vfx', () => {
    const result = resolveEffectPresentation(
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
    expect(result.hitVfx?.preset).toBe('slashHit');
  });

  it('uses explicit basicAttackVfx for basic attacks', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      { ...skill, vfx: undefined },
      { ...basicCtx, basicAttackVfx: { preset: 'slash' } },
    );
    expect(result.vfx?.preset).toBe('slash');
    expect(result.hitVfx?.preset).toBe('slashHit');
  });

  it('returns no VFX for basic attacks without basicAttackVfx', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      skill,
      { ...basicCtx, basicAttackVfx: undefined },
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('does not default melee damage to a VFX', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      { ...skill, vfx: undefined },
      ctx,
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('does not default pierce damage to a VFX', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        targetShape: 'pierce',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      { ...skill, vfx: undefined },
      { ...ctx, targetShape: 'pierce' },
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('does not default chain damage to a VFX', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        targetShape: 'chain',
        chainCount: 3,
        chainMaxDistancePx: 80,
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'magic',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      { ...skill, vfx: undefined },
      { ...ctx, effectKind: 'damage', targetShape: 'chain' },
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('does not default skill vfx when effect vfx is unset', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      skill,
      ctx,
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('suppresses skill vfx fallback when effectVfxOnly is set', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      skill,
      { ...ctx, effectVfxOnly: true },
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('uses no VFX when neither effect nor skill preset is set', () => {
    const result = resolveEffectPresentation(
      {
        type: 'damage',
        target: { kind: "distance", side: "enemy", order: "nearest" },
        damageType: 'physical',
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      { ...skill, vfx: undefined },
      ctx,
    );
    expect(result.vfx).toBeNull();
    expect(result.hitVfx).toBeNull();
  });

  it('uses explicit effect vfx in presentation lab when preset is set', () => {
    const result = resolveEffectPresentation(
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
    expect(result.vfx?.preset).toBe('slash');
  });

  it('returns none anim as null', () => {
    const result = resolveEffectPresentation(
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
