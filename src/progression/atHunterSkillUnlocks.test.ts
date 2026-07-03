import { describe, expect, it } from 'vitest';
import { loadGameData } from '../battle/data/loadGameData.ts';
import { getClassSkillIds } from './skillUnlocks.ts';
import { expectUnlockTiersMatchGameData } from '../test/gameDataResilience.ts';
import {
  collectAllyBasicAttackDotProcs,
  syncPoisonWeaponAuras,
} from '../battle/allyBasicAttackDotProc.ts';
import {
  compressDotEffect,
  extendDotEffect,
  harvestDotRemainingDamage,
  hasActiveDot,
} from '../battle/dotMechanics.ts';
import { collectStatusEffectBadgeDisplays } from '../battle/statusEffectDisplay.ts';
import { resolvePartyFinisherDamageMultiplier } from '../battle/hunterPassives.ts';
import { mockCombatant } from '../battle/testFixtures.ts';
import type { CombatantState, StatusEffect } from '../battle/types.ts';

function mockHunter(id: string, passives: string[] = []): CombatantState {
  return mockCombatant(
    {
      classId: 'at_hunter',
      formationRow: 'back',
      traits: { rangePx: 300, damageType: 'physical' },
      atk: 30,
      build: {
        learnedPassiveIds: passives,
        learnedActiveIds: [],
        equippedActiveSlots: [],
      },
    },
    id,
  );
}

describe('at_hunter passive / active unlock structure', () => {
  const gameData = loadGameData();
  const hunterClass = gameData.classRegistry['at_hunter'];
  const { passives, actives } = gameData.skillRegistry;

  it('loads class skills with expected shapes', () => {
    for (const id of hunterClass.passiveIds ?? []) {
      expect(passives[id]?.id).toBe(id);
    }
    for (const id of getClassSkillIds(hunterClass.skills)) {
      expect(passives[id] ?? actives[id]).toBeDefined();
    }

    expect(passives['at_hunter_passive_1']?.effect).toBe('dotCompressAssist');
    expect(passives['at_hunter_passive_1']?.dotCompressRatio).toBe(0.7);

    const p2 = passives['at_hunter_passive_2'];
    expect(p2?.effect).toBe('allyBasicAttackDotProc');
    expect(p2?.chance).toBe(0.2);

    const p3 = passives['at_hunter_passive_3'];
    expect(p3?.dotDurationMultiplierOnApply).toBe(1.5);
    expect(p3?.dottedEnemyHealReceivedMultiplier).toBe(0.8);

    const p4 = passives['at_hunter_passive_4'];
    expect(p4?.effect).toBe('conditionalEnemyDamageTakenAura');
    expect(p4?.enemyDamageTakenMultiplier).toBe(1.2);

    const a1 = actives['at_hunter_active_1'];
    expect(a1?.name).toBe('毒罠');
    expect(a1?.effect[0]?.type).toBe('placedField');

    expect(actives['at_hunter_active_2']?.name).toBe('粘着罠');
    expect(actives['at_hunter_active_3']?.name).toBe('追い込み');

    const a4 = actives['at_hunter_active_4'];
    expect(a4?.name).toBe('再利用');
    expect(a4?.firePolicy).toBe('smart');
    expect(a4?.effect.some((e) => e.type === 'dotHarvest')).toBe(true);
    expect(a4?.effect.some((e) => e.type === 'poisonSpread')).toBe(true);
  });

  it('syncs member build with resolveLearnedSkills at each unlock tier', () => {
    expectUnlockTiersMatchGameData('at_hunter', gameData);
  });
});

describe('at_hunter combat helpers', () => {
  const gameData = loadGameData();
  const passives = gameData.skillRegistry.passives;

  it('compressDotEffect shortens duration and amplifies tick budget', () => {
    const dot: StatusEffect = {
      id: 'dot1',
      kind: 'debuff',
      overlay: 'dot',
      multiplier: 1,
      durationSec: 10,
      remainingSec: 10,
      amount: { kind: 'flat', flatAmount: 10 },
      tickSec: 1,
    };
    compressDotEffect(dot, 0.5);
    expect(dot.remainingSec).toBe(5);
    expect(dot.dotTickDamageMul).toBeCloseTo(2, 5);
  });

  it('extendDotEffect lengthens remaining duration', () => {
    const dot: StatusEffect = {
      id: 'dot2',
      kind: 'debuff',
      overlay: 'dot',
      multiplier: 1,
      durationSec: 8,
      remainingSec: 8,
      amount: { kind: 'flat', flatAmount: 5 },
      tickSec: 1,
    };
    extendDotEffect(dot, 1.25);
    expect(dot.remainingSec).toBeCloseTo(10, 5);
  });

  it('P4 finisher aura applies when target has dot and low HP', () => {
    const hunter = mockHunter('h1', ['at_hunter_passive_4']);
    const enemy = mockHunter('e1');
    enemy.isEnemy = true;
    enemy.hp = 40;
    enemy.maxHp = 100;
    enemy.statusEffects.push({
      id: 'poison',
      kind: 'debuff',
      overlay: 'dot',
      multiplier: 1,
      durationSec: 5,
      remainingSec: 5,
      dotFlavor: 'poison',
      tickSec: 1,
      amount: { kind: 'flat', flatAmount: 5 },
    });
    expect(hasActiveDot(enemy)).toBe(true);
    expect(
      resolvePartyFinisherDamageMultiplier(enemy, [hunter], passives),
    ).toBeCloseTo(1.2, 5);
  });

  it('dotHarvest estimates remaining damage without consuming dot', () => {
    const hunter = mockHunter('h2');
    const enemy = mockHunter('e2');
    enemy.isEnemy = true;
    enemy.statusEffects.push({
      id: 'poison2',
      kind: 'debuff',
      overlay: 'dot',
      multiplier: 1,
      durationSec: 5,
      remainingSec: 5,
      dotFlavor: 'poison',
      sourceId: hunter.id,
      tickSec: 1,
      amount: { kind: 'flat', flatAmount: 10 },
      damageType: 'magic',
    });
    const before = enemy.statusEffects.length;
    expect(
      harvestDotRemainingDamage(hunter, enemy, passives, 0.1),
    ).toBeGreaterThan(0);
    expect(enemy.statusEffects.length).toBe(before);
  });

  it('syncPoisonWeaponAuras shows passive poisonWeapon badge on allies', () => {
    const hunter = mockHunter('h3', ['at_hunter_passive_2']);
    const ally = mockHunter('a3');
    syncPoisonWeaponAuras([hunter, ally], passives);

    for (const unit of [hunter, ally]) {
      expect(
        unit.statusEffects.some((effect) => effect.overlay === 'poisonWeapon'),
      ).toBe(true);
    }

    const badges = collectStatusEffectBadgeDisplays(hunter.statusEffects, {
      baseMaxHp: 100,
      atk: 30,
      def: 10,
      res: 0,
    });
    expect(badges.some((badge) => badge.category === 'poisonWeapon')).toBe(
      true,
    );
    expect(
      badges.find((badge) => badge.category === 'poisonWeapon')?.isPassive,
    ).toBe(true);

    hunter.isAlive = false;
    syncPoisonWeaponAuras([hunter, ally], passives);
    expect(ally.statusEffects.some((e) => e.overlay === 'poisonWeapon')).toBe(
      false,
    );
  });

  it('collectAllyBasicAttackDotProcs gathers hunter P2 config', () => {
    const hunter = mockHunter('h4', ['at_hunter_passive_2']);
    const configs = collectAllyBasicAttackDotProcs([hunter], passives);
    expect(configs).toHaveLength(1);
    expect(configs[0]?.passiveId).toBe('at_hunter_passive_2');
    expect(configs[0]?.chance).toBe(0.2);
  });
});
