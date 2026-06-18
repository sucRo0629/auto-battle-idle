import { afterEach, describe, expect, it } from 'vitest';
import { resolveEffectHasVfx } from './resolveEffectHasVfx.ts';
import type { ActiveSkillDef, CombatantState, SkillEffectDef } from '../types.ts';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from '../../render/vfxAnimRegistry.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

const actor = {
  role: 'attacker',
  traits: {
    rangePx: 150,
    damageType: 'magic',
    basicAttackVfx: {},
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

describe('resolveEffectHasVfx', () => {
  afterEach(() => {
    __resetVfxAnimsForTest();
  });

  it('uses explicit basicAttackVfx for basic slot', () => {
    __registerVfxAnimForTest('at_enchanter_active_1_0_vfx', mockImage(128));
    expect(
      resolveEffectHasVfx(skill, chainEffect, actor, 'basic', 0),
    ).toBe(true);
  });

  it('uses effect vfx for active slot', () => {
    __registerVfxAnimForTest('at_enchanter_active_1_0_vfx', mockImage(128));
    const activeEffect = {
      ...chainEffect,
      vfx: {},
    } as SkillEffectDef;
    expect(
      resolveEffectHasVfx(skill, activeEffect, actor, 'active', 0),
    ).toBe(true);
  });

  it('returns false when active slot has no explicit VFX and no PNG', () => {
    expect(
      resolveEffectHasVfx(
        { ...skill, effect: [{ ...chainEffect, vfx: undefined }] },
        { ...chainEffect, vfx: undefined },
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'active',
        0,
      ),
    ).toBe(false);
  });

  it('returns false for basic slot when basicAttackVfx is unset', () => {
    expect(
      resolveEffectHasVfx(
        skill,
        chainEffect,
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'basic',
        0,
      ),
    ).toBe(false);
  });

  it('detects hit vfx from PNG naming', () => {
    __registerVfxAnimForTest('at_enchanter_active_1_0_vfx_hit', mockImage(128));
    expect(
      resolveEffectHasVfx(
        skill,
        { ...chainEffect, vfx: undefined },
        { ...actor, traits: { ...actor.traits, basicAttackVfx: undefined } },
        'active',
        0,
      ),
    ).toBe(true);
  });
});
