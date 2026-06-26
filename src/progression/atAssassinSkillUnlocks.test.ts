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

    const a3 = actives['at_assassin_active_3'];
    expect(a3?.firePolicy).toBe('smart');
    expect(a3?.fireConditions).toEqual([{ kind: 'debuff', tags: ['bleed'] }]);
    const a3Effect = a3?.effect[0];
    expect(a3Effect?.type).toBe('debuff');
    if (a3Effect?.type === 'debuff') {
      expect(a3Effect.debuffSubKind).toBe('stat');
      expect(a3Effect.debuffStat).toBe('damageTaken');
      expect(a3Effect.debuffMultiplier).toBeGreaterThan(1);
    }

    const a1Dot = actives['at_assassin_active_1']?.effect[1];
    expect(a1Dot?.type).toBe('debuff');
    if (a1Dot?.type === 'debuff') {
      expect(a1Dot.debuffSubKind).toBe('dot');
      expect(a1Dot.dotFlavor).toBe('bleed');
    }
    const a1Damage = actives['at_assassin_active_1']?.effect[0];
    if (a1Damage?.type === 'damage') {
      expect(a1Damage.damageIncrease?.conditions?.[0]).toEqual({
        kind: 'debuff',
        tags: ['bleed'],
      });
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
