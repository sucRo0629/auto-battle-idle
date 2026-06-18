import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CombatantLayout } from './IBattleRenderer.ts';
import { BattleCanvas } from './BattleCanvas.ts';
import { ParticlePlaybackManager } from './ParticlePlaybackManager.ts';
import { VfxPlaybackManager } from './VfxPlaybackManager.ts';
import {
  __registerVfxAnimForTest,
  __resetVfxAnimsForTest,
} from './vfxAnimRegistry.ts';
import { getParticlePresetDef } from './particlePresets.ts';
import { SPRITE_LAYOUT_SIZE } from './spriteLayout.ts';

function mockImage(width: number): HTMLImageElement {
  return { width, height: 64 } as HTMLImageElement;
}

function layout(id: string, x: number, isEnemy: boolean): CombatantLayout {
  return {
    id,
    x,
    y: 200,
    spriteKey: 'test',
    hp: 100,
    maxHp: 100,
    barrierHp: 0,
    atk: 10,
    def: 5,
    reg: 0,
    isEnemy,
    isAlive: true,
    anim: 'idle',
    animFrame: 0,
    attackSheetKey: '',
    skillAnimKey: null,
    skillAnimFrame: 0,
    statusEffects: [],
  };
}

describe('BattleCanvas.playSkillVfx', () => {
  afterEach(() => {
    __resetVfxAnimsForTest();
    vi.restoreAllMocks();
  });

  it('spawns particles only when PNG vfx is absent', () => {
    const canvas = new BattleCanvas();
    const vfxSpawn = vi.spyOn(VfxPlaybackManager.prototype, 'spawn');
    const particleSpawn = vi.spyOn(ParticlePlaybackManager.prototype, 'spawn');

    canvas.setCombatants([
      layout('actor', 100, false),
      layout('target', 260, true),
    ]);

    canvas.playSkillVfx(
      'inst-1',
      'actor',
      'target',
      {
        particles: { preset: 'heal_holy_light' },
        placement: { anchor: 'footTarget', layer: 'front' },
      },
      { skillId: 'heal_only', effectIndex: 0, kind: 'main' },
    );

    expect(vfxSpawn).not.toHaveBeenCalled();
    expect(particleSpawn).toHaveBeenCalledOnce();
    expect(particleSpawn.mock.calls[0]?.[0]).toBe('inst-1:particles');
    expect(particleSpawn.mock.calls[0]?.[2]).toBe('front');
    expect(particleSpawn.mock.calls[0]?.[3]).toEqual({
      preset: 'heal_holy_light',
    });
    expect(particleSpawn.mock.calls[0]?.[4]).toEqual(
      getParticlePresetDef('heal_holy_light'),
    );
  });

  it('spawns PNG vfx and particles together', () => {
    __registerVfxAnimForTest('combo_skill_0_vfx', mockImage(192));
    const canvas = new BattleCanvas();
    const vfxSpawn = vi.spyOn(VfxPlaybackManager.prototype, 'spawn');
    const particleSpawn = vi.spyOn(ParticlePlaybackManager.prototype, 'spawn');

    canvas.setCombatants([
      layout('actor', 100, false),
      layout('target', 260, true),
    ]);

    canvas.playSkillVfx(
      'inst-2',
      'actor',
      'target',
      {
        particles: { preset: 'heal_holy_light' },
        placement: { anchor: 'footActor', layer: 'behind' },
      },
      { skillId: 'combo_skill', effectIndex: 0, kind: 'main' },
    );

    expect(vfxSpawn).toHaveBeenCalledOnce();
    expect(particleSpawn).toHaveBeenCalledOnce();
    expect(vfxSpawn.mock.calls[0]?.[1]).toBe('combo_skill_0_vfx');
    expect(vfxSpawn.mock.calls[0]?.[4]).toBe('behind');
    expect(particleSpawn.mock.calls[0]?.[2]).toBe('behind');
  });

  it('uses particles.placement when set', () => {
    const canvas = new BattleCanvas();
    const particleSpawn = vi.spyOn(ParticlePlaybackManager.prototype, 'spawn');

    canvas.setCombatants([
      layout('actor', 100, false),
      layout('target', 260, true),
    ]);

    canvas.playSkillVfx(
      'inst-3',
      'actor',
      'target',
      {
        placement: { anchor: 'footActor', layer: 'behind' },
        particles: {
          preset: 'heal_holy_light',
          placement: { anchor: 'footTarget', layer: 'front' },
        },
      },
      { skillId: 'placement_skill', effectIndex: 0, kind: 'main' },
    );

    const worldPos = particleSpawn.mock.calls[0]?.[1];
    expect(worldPos?.x).toBe(260 + SPRITE_LAYOUT_SIZE / 2);
    expect(particleSpawn.mock.calls[0]?.[2]).toBe('front');
  });

  it('skips unknown particle presets without blocking PNG vfx', () => {
    __registerVfxAnimForTest('png_only_0_vfx', mockImage(128));
    const canvas = new BattleCanvas();
    const vfxSpawn = vi.spyOn(VfxPlaybackManager.prototype, 'spawn');
    const particleSpawn = vi.spyOn(ParticlePlaybackManager.prototype, 'spawn');

    canvas.setCombatants([
      layout('actor', 100, false),
      layout('target', 260, true),
    ]);

    canvas.playSkillVfx(
      'inst-4',
      'actor',
      'target',
      {
        particles: { preset: 'not_a_preset' },
      },
      { skillId: 'png_only', effectIndex: 0, kind: 'main' },
    );

    expect(vfxSpawn).toHaveBeenCalledOnce();
    expect(particleSpawn).not.toHaveBeenCalled();
  });
});
