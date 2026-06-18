import { describe, expect, it } from 'vitest';
import { parseSkillVfx } from './validateGameData.ts';

describe('parseSkillVfx', () => {
  it('accepts PNG strip SkillVfxDef fields', () => {
    expect(
      parseSkillVfx(
        {
          enabled: true,
          animStartFrame: 1,
          animLoopFrame: 2,
          placement: { anchor: 'target', layer: 'front' },
        },
        'traits.basicAttackVfx',
      ),
    ).toEqual({
      enabled: true,
      animStartFrame: 1,
      animLoopFrame: 2,
      placement: { anchor: 'target', layer: 'front' },
    });
  });

  it('rejects deprecated preset field', () => {
    expect(() =>
      parseSkillVfx({ preset: 'slash' }, 'effect[0].vfx'),
    ).toThrow(/preset.*deprecated.*effect\[0\]\.vfx/);
  });

  it('rejects deprecated arc and durationMs fields', () => {
    expect(() =>
      parseSkillVfx({ arc: true }, 'traits.basicAttackVfx'),
    ).toThrow(/arc.*deprecated.*traits\.basicAttackVfx/);
    expect(() =>
      parseSkillVfx({ durationMs: 500 }, 'traits.basicAttackVfx'),
    ).toThrow(/durationMs.*deprecated.*traits\.basicAttackVfx/);
  });

  it('accepts particles preset with overrides', () => {
    expect(
      parseSkillVfx(
        {
          particles: {
            preset: 'heal_holy_light',
            count: 16,
            tint: '#aabbcc',
          },
        },
        'effect[0].vfx',
      ),
    ).toEqual({
      particles: {
        preset: 'heal_holy_light',
        count: 16,
        tint: '#aabbcc',
      },
    });
  });

  it('rejects unknown particle preset', () => {
    expect(() =>
      parseSkillVfx(
        { particles: { preset: 'spark_burst' } },
        'effect[0].vfx',
      ),
    ).toThrow(/effect\[0\]\.vfx\.particles/);
  });

  it('rejects invalid particle tint', () => {
    expect(() =>
      parseSkillVfx(
        { particles: { preset: 'heal_holy_light', tint: 'gold' } },
        'effect[0].vfx',
      ),
    ).toThrow(/tint.*effect\[0\]\.vfx\.particles/);
  });
});
