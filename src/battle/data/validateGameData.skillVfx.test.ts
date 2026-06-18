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
});
