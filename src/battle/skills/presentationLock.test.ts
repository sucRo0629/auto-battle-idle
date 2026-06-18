import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveSkillDef, CombatantState } from '../types.ts';
import { resolvePresentationLockSec } from './presentationLock.ts';
import {
  __registerSkillAnimForTest,
  __resetSkillAnimsForTest,
} from '../../render/skillAnimRegistry.ts';
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
    rangePx: 0,
    damageType: 'physical',
    basicAttackVfx: undefined,
  },
} as CombatantState;

describe('resolvePresentationLockSec', () => {
  afterEach(() => {
    __resetSkillAnimsForTest();
    __resetVfxAnimsForTest();
  });

  it('returns max of body, main vfx, hit vfx, and move durations', () => {
    __registerSkillAnimForTest('lock_skill', { width: 256, height: 48 } as HTMLImageElement);
    __registerVfxAnimForTest('lock_skill_0_vfx', mockImage(320));
    __registerVfxAnimForTest('lock_skill_0_vfx_hit', mockImage(192));

    const skill: ActiveSkillDef = {
      id: 'lock_skill',
      name: 'Lock',
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

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0.625);
  });

  it('uses hit vfx duration when longer than main vfx', () => {
    __registerVfxAnimForTest('lock_hit_0_vfx', mockImage(128));
    __registerVfxAnimForTest('lock_hit_0_vfx_hit', mockImage(384));

    const skill: ActiveSkillDef = {
      id: 'lock_hit',
      name: 'Lock Hit',
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

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0.75);
  });

  it('includes move duration', () => {
    const skill: ActiveSkillDef = {
      id: 'lock_move',
      name: 'Lock Move',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'move',
          target: { rule: 'frontEnemy' },
          moveDurationSec: 0.6,
        },
      ],
    };

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0.6);
  });

  it('returns 0 when useDurationSec is set', () => {
    const skill: ActiveSkillDef = {
      id: 'lock_use',
      name: 'Lock Use',
      trigger: { kind: 'manual' },
      useDurationSec: 1,
      effect: [
        {
          type: 'damage',
          target: { rule: 'frontEnemy' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {},
        },
      ],
    };
    __registerVfxAnimForTest('lock_use_0_vfx', mockImage(320));

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0);
  });

  it('includes particle duration when longer than PNG vfx', () => {
    __registerVfxAnimForTest('lock_particle_0_vfx', mockImage(128));

    const skill: ActiveSkillDef = {
      id: 'lock_particle',
      name: 'Lock Particle',
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

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(1.2);
  });

  it('includes particle-only vfx without PNG strip', () => {
    const skill: ActiveSkillDef = {
      id: 'lock_particle_only',
      name: 'Lock Particle Only',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'heal',
          target: { rule: 'mostDamagedAlly' },
          amount: { kind: 'atkScale', scale: 1 },
          vfx: {
            particles: { preset: 'heal_holy_light' },
          },
        },
      ],
    };

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0.75);
  });

  it('includes heal hitVfx particles in presentation lock', () => {
    const skill: ActiveSkillDef = {
      id: 'lock_heal_hit_particle',
      name: 'Lock Heal Hit Particle',
      trigger: { kind: 'manual' },
      effect: [
        {
          type: 'heal',
          target: { rule: 'mostDamagedAlly' },
          amount: { kind: 'atkScale', scale: 1 },
          hitVfx: {
            particles: { preset: 'heal_holy_light' },
          },
        },
      ],
    };

    expect(resolvePresentationLockSec(skill, actor, 'active')).toBe(0.75);
  });
});
