import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import { expectUnlockTiersMatchGameData } from '../test/gameDataResilience.ts';

describe('at_swordsman passive / active unlock structure', () => {
  const gameData = loadGameData();
  const warriorClass = gameData.classRegistry['at_swordsman'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected roles', () => {
    expect(warriorClass.passiveIds).toEqual(['at_swordsman_passive_2']);
    expect(
      warriorClass.skills.flatMap((entry) => entry.skillIds).filter((id) =>
        id.startsWith('at_swordsman_passive_'),
      ),
    ).toEqual([]);
    for (const id of warriorClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(warriorClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    expect(actives['at_swordsman_basic_attack']?.effect[0]?.type).toBe('damage');
    expect(passives['at_swordsman_passive_1']?.defenseIgnore?.def?.amount).toBe(0.05);
    expect(passives['at_swordsman_passive_2']?.effect).toBe('targetRuleOverride');
    expect(passives['at_swordsman_passive_3']?.effect).toBe('defenseIgnore');
    expect(passives['at_swordsman_passive_4']?.effect).toBe('ignoredDefBonusDamage');
    expect(actives['at_swordsman_active_3']?.trigger?.kind).toBe('basicAttackCount');
    expect(actives['at_swordsman_active_4']?.effect[0]?.type).toBe('damage');
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_swordsman', gameData);
  });

  it('active_4 sets all pierce flags for full mitigation bypass', () => {
    const damage = actives['at_swordsman_active_4']!.effect[0];
    expect(damage?.type).toBe('damage');
    if (damage?.type !== 'damage') return;
    expect(damage.pierceBarrier).toBe(true);
    expect(damage.pierceWard).toBe(true);
    expect(damage.pierceBlock).toBe(true);
    expect(damage.ignoreDamageTakenReduction).toBe(true);
  });
});
