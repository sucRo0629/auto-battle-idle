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
  it('uses basicAttackVfx preset for basic slot', () => {
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

  it('detects staged chain for enchanter chain lightning', () => {
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
  });
});
