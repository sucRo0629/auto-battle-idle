import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import {
  expectIntAtLeast,
  expectPositive,
  expectUnlockTiersMatchGameData,
} from '../test/gameDataResilience.ts';

describe('at_assassin passive / active unlock structure', () => {
  const gameData = loadGameData();
  const assassinClass = gameData.classRegistry['at_assassin'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected roles', () => {
    for (const id of assassinClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(assassinClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    const basic = actives['at_assassin_basic_attack']?.effect[0];
    expect(basic?.type).toBe('damage');
    if (basic?.type === 'damage') {
      expectIntAtLeast(basic.hitCount, 2);
    }

    const p3 = passives['at_assassin_passive_3'];
    expect(p3?.effect).toBe('specialEffect');
    expect(p3?.specialEffect?.scale).toBeGreaterThan(1);

    expect(passives['at_assassin_passive_4']?.effect).toBe('bonusBasicAttackOnHit');

    const a3 = actives['at_assassin_active_3']?.effect[0];
    expect(a3?.type).toBe('basicAttackTransform');
    if (a3?.type === 'basicAttackTransform') {
      expectIntAtLeast(a3.primaryPatch?.hitCount, 2);
    }
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_assassin', gameData);
  });

  it('active_4 uses multiLock with low HP priority targeting', () => {
    const damage = actives['at_assassin_active_4']!.effect[0];
    expect(damage?.type).toBe('damage');
    if (damage?.type !== 'damage') return;
    expect(damage.targetShape).toBe('multiLock');
    expectPositive(damage.range);
    expectIntAtLeast(damage.hitCount, 2);
    expect(damage.target).toMatchObject({
      kind: 'stat',
      side: 'enemy',
      stat: 'hp',
      order: 'ratio',
    });
    expect(actives['at_assassin_active_4']?.trigger?.kind).toBe('basicAttackCount');
    expectPositive(actives['at_assassin_active_4']?.trigger?.value);
  });
});
