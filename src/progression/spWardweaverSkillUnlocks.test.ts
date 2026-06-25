import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import { expectUnlockTiersMatchGameData } from '../test/gameDataResilience.ts';

describe('sp_wardweaver passive / active unlock structure', () => {
  const gameData = loadGameData();
  const wardweaverClass = gameData.classRegistry['sp_wardweaver'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with non-empty display names', () => {
    for (const id of getClassSkillIds(wardweaverClass.skills)) {
      const skill = passives[id] ?? actives[id];
      expect(skill?.name).toBeTruthy();
    }
    for (const id of wardweaverClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
  });

  it('keeps Stability-focused active roles (barrier-first, heal as support)', () => {
    const basic = actives['sp_wardweaver_basic_attack']!;
    expect(basic.effect.length).toBeGreaterThan(0);
    expect(basic.effect[0]?.type).toBe('heal');

    const active1 = actives['sp_wardweaver_active_1']!;
    expect(active1.effect.some((e) => e.type === 'heal')).toBe(true);
    expect(
      active1.effect.some((e) => e.type === 'buff' && e.buffSubKind === 'barrier'),
    ).toBe(true);

    const active2 = actives['sp_wardweaver_active_2']!;
    expect(active2.firePolicy).toBe('smart');
    expect(active2.effect.some(
      (e) =>
        e.type === 'buff' &&
        e.buffSubKind === 'barrier' &&
        e.targetShape === 'multiLock',
    )).toBe(true);

    const active3 = actives['sp_wardweaver_active_3']!;
    expect(active3.effect.some(
      (e) => e.type === 'buff' && e.buffSubKind === 'barrier' && e.barrierStack === true,
    )).toBe(true);

    const active4 = actives['sp_wardweaver_active_4']!;
    expect(active4.fireConditionMatch).toBe('any');
    expect(
      active4.effect.some(
        (e) => e.type === 'buff' && e.buffSubKind === 'wardBarrier',
      ),
    ).toBe(true);
    expect(
      active4.effect.some(
        (e) =>
          e.type === 'buff' &&
          e.buffSubKind === 'barrier' &&
          e.target?.kind === 'all',
      ),
    ).toBe(true);
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('sp_wardweaver', gameData);
  });
});
