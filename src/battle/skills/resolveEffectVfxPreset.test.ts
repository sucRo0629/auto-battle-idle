import { describe, expect, it } from 'vitest';
import { resolveEffectVfxPreset, usesStagedChainVfx } from './resolveEffectVfxPreset.ts';
import type { ActiveSkillDef, CombatantState, SkillEffectDef } from '../types.ts';

const actor = {
  role: 'attacker',
  traits: {
    rangePx: 150,
    damageType: 'magic',
    basicAttackVfx: { preset: 'chainLightning' },
  },
} as CombatantState;

const chainEffect = {
  type: 'damage',
  targetShape: 'chain',
  chainCount: 3,
  chainMaxDistancePx: 80,
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'magic',
  amount: { kind: 'atkBased', atkScale: 1 },
} as SkillEffectDef;

const skill = {
  id: 'at_enchanter_active_1',
  name: '連符',
  trigger: { kind: 'time', value: 9 },
  effect: [chainEffect],
} as ActiveSkillDef;

describe('resolveEffectVfxPreset', () => {
  it('uses explicit basicAttackVfx preset for basic slot', () => {
    expect(
      resolveEffectVfxPreset(skill, chainEffect, actor, 'basic'),
    ).toBe('chainLightning');
  });

  it('uses effect vfx preset for active slot', () => {
    const activeEffect = {
      ...chainEffect,
      vfx: { preset: 'orb' },
    } as SkillEffectDef;
    expect(
      resolveEffectVfxPreset(skill, activeEffect, actor, 'active'),
    ).toBe('orb');
  });

  it('returns null when active slot has no explicit VFX', () => {
    expect(
      resolveEffectVfxPreset(
        { ...skill, effect: [{ ...chainEffect, vfx: undefined }] },
        { ...chainEffect, vfx: undefined },
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'active',
      ),
    ).toBeNull();
  });

  it('returns null for basic slot when basicAttackVfx is unset', () => {
    expect(
      resolveEffectVfxPreset(
        skill,
        chainEffect,
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'basic',
      ),
    ).toBeNull();
  });

  it('detects staged chain only for explicit chain lightning', () => {
    expect(
      usesStagedChainVfx(skill, chainEffect, actor, 'basic'),
    ).toBe(true);
    expect(
      usesStagedChainVfx(
        skill,
        { ...chainEffect, type: 'buff', buffStat: 'attackSpeed' } as SkillEffectDef,
        actor,
        'basic',
      ),
    ).toBe(false);
    expect(
      usesStagedChainVfx(
        skill,
        { ...chainEffect, vfx: undefined },
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'active',
      ),
    ).toBe(false);
  });
});
