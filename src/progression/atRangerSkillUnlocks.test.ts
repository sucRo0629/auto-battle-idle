import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import {
  expectIntAtLeast,
  expectPositive,
  expectUnlockTiersMatchGameData,
} from '../test/gameDataResilience.ts';

describe('at_ranger passive / active unlock structure', () => {
  const gameData = loadGameData();
  const rangerClass = gameData.classRegistry['at_ranger'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected roles', () => {
    for (const id of rangerClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(rangerClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    expect(passives['at_ranger_passive_1']?.effect).toBe('targetRuleOverride');
    expect(passives['at_ranger_passive_1']?.targetRuleOverride).toEqual({
      kind: 'attackType',
      ranged: true,
      excludeRoles: ['supporter'],
    });

    const p2 = passives['at_ranger_passive_2'];
    expect(p2?.effect).toBe('buff');
    expect([p2?.buffStat].flat()).toContain('attackSpeed');
    expectPositive(p2?.buffMultiplier);

    const p3 = passives['at_ranger_passive_3'];
    expect(p3?.effect).toBe('specialEffect');
    expect(p3?.specialEffect?.scale).toBe(1.2);
    expect(p3?.specialEffect?.conditions?.[0]).toEqual({
      kind: 'attackType',
      ranged: true,
    });

    const p4 = passives['at_ranger_passive_4'];
    expect(p4?.effect).toBe('bonusBasicAttackOnHit');
    expect(p4?.chance).toBe(0.5);
    expect(p4?.bonusBasicAttackConditions?.[0]).toEqual({
      kind: 'attackType',
      ranged: true,
    });
    expect(p4?.bonusBasicAttackHpRatio).toBeUndefined();

    const a1 = actives['at_ranger_active_1'];
    expect(a1?.trigger?.kind).toBe('basicAttackCount');
    expectIntAtLeast(a1?.trigger?.value, 5);
    const a1Damage = a1?.effect[0];
    expect(a1Damage?.type).toBe('damage');
    if (a1Damage?.type === 'damage') {
      expectIntAtLeast(a1Damage.hitCount, 2);
    }

    const a2 = actives['at_ranger_active_2'];
    expect(a2?.effect.some((e) => e.type === 'basicAttackTransform')).toBe(true);

    const a3 = actives['at_ranger_active_3'];
    const a3Effect = a3?.effect[0];
    expect(a3Effect?.type).toBe('buff');
    if (a3Effect?.type === 'buff') {
      expectPositive(a3Effect.buffMultiplier);
    }

    const a4 = actives['at_ranger_active_4'];
    expect(a4?.trigger?.kind).toBe('basicAttackCount');
    expectIntAtLeast(a4?.trigger?.value, 10);
    const a4Damage = a4?.effect[0];
    expect(a4Damage?.type).toBe('damage');
    if (a4Damage?.type === 'damage') {
      expect(a4Damage.targetShape).toBe('scatter');
      expectPositive(a4Damage.scatterHitCount);
    }

    expect(actives['at_ranger_basic_attack']?.effect[0]?.type).toBe('damage');
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_ranger', gameData);
  });
});
