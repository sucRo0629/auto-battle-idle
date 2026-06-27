import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveApproachHealDebugDetails } from './battleXHealDebug.ts';
import {
  evaluateHealWithholdReason,
  resolveEffectResolution,
  resolvePriorityHealTarget,
} from './skills/targeting.ts';
import { mockTargetingGameData, mockUnit } from './skills/targeting.fixtures.ts';
import type { CombatantState } from './types.ts';

const ratioAllyTarget = {
  kind: 'stat',
  side: 'ally',
  stat: 'hp',
  order: 'ratio',
} as const;

function mockCleric(battleX: number, overrides: Partial<CombatantState> = {}) {
  return mockUnit('cleric', battleX, {
    rangePx: 128,
    classId: 'sp_cleric',
    ...overrides,
  });
}

describe('PHT regression — sp_cleric and related paths', () => {
  const gameData = loadGameData();

  it('sp_cleric basic resolves PHT when in range', () => {
    const cleric = mockCleric(200);
    const pht = mockUnit('wounded', 180, { hp: 30, maxHp: 100 });
    const healthy = mockUnit('healthy', 160);
    const basic = gameData.skillRegistry.actives['sp_cleric_basic_attack']?.effect[0];
    expect(basic?.type).toBe('heal');

    const resolution = resolveEffectResolution(
      basic!,
      cleric,
      [cleric, pht, healthy],
      [],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('wounded');
    expect(resolvePriorityHealTarget([cleric, pht, healthy])?.id).toBe('wounded');
  });

  it('sp_cleric basic withholds when PHT is out of range', () => {
    const cleric = mockCleric(52, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const lighter = mockUnit('sorcerer', 20, { hp: 76, maxHp: 80 });
    const basic = gameData.skillRegistry.actives['sp_cleric_basic_attack']?.effect[0]!;

    expect(
      evaluateHealWithholdReason(
        basic,
        cleric,
        [cleric, pht, lighter],
        [],
        gameData,
      ),
    ).toBe('pht_out_of_range');
    expect(
      resolveEffectResolution(
        basic,
        cleric,
        [cleric, pht, lighter],
        [],
        gameData,
      ),
    ).toBeNull();
  });

  it('sp_cleric all-ally active resolves when any ally is damaged', () => {
    const cleric = mockCleric(20, { rangePx: 80 });
    const pht = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const active3 = gameData.skillRegistry.actives['sp_cleric_active_3'];
    const healEffect = active3?.effect.find((entry) => entry.type === 'heal');
    expect(healEffect).toBeDefined();

    const resolution = resolveEffectResolution(
      healEffect!,
      cleric,
      [cleric, pht],
      [],
      gameData,
      Math.random,
      undefined,
      active3!.effect,
      undefined,
      active3,
    );
    expect(resolution).not.toBeNull();
    expect(
      evaluateHealWithholdReason(
        healEffect!,
        cleric,
        [cleric, pht],
        [],
        gameData,
        undefined,
        active3,
      ),
    ).toBeNull();
  });

  it('multiLock ally hp ratio still ignores full-HP allies', () => {
    const healer = mockUnit('healer', 200);
    const wounded = mockUnit('wounded', 180, { hp: 20, maxHp: 100 });
    const healthy = mockUnit('healthy', 160);
    const mockData = mockTargetingGameData(200);

    const resolution = resolveEffectResolution(
      {
        type: 'heal',
        target: ratioAllyTarget,
        targetShape: 'multiLock',
        hitCount: 2,
        amount: { kind: 'atkBased', atkScale: 1 },
      },
      healer,
      [healer, wounded, healthy],
      [],
      mockData,
    );
    expect(resolution?.waves[0]?.targets.map((hit) => hit.unit.id)).toEqual([
      'wounded',
      'wounded',
    ]);
  });
});

describe('resolveApproachHealDebugDetails', () => {
  const gameData = loadGameData();

  it('reports PHT id and active withhold reason for alchemist', () => {
    const alchemist = mockUnit('alchemist', 52, {
      rangePx: 80,
      classId: 'sp_alchemist',
    });
    alchemist.role = 'supporter';
    alchemist.formationRow = 'front';
    alchemist.build = {
      learnedPassiveIds: [],
      learnedActiveIds: ['sp_alchemist_active_1'],
      equippedActiveSlots: ['sp_alchemist_active_1'],
    };
    alchemist.cooldowns = [
      { skillId: 'sp_alchemist_basic_attack', remaining: 0, slotKind: 'basic' },
      {
        skillId: 'sp_alchemist_active_1',
        remaining: 0,
        slotKind: 'active',
        slotIndex: 0,
      },
    ];

    const guardian = mockUnit('guardian', 224, { hp: 47, maxHp: 235 });
    const sorcerer = mockUnit('sorcerer', 20, { hp: 76, maxHp: 80 });
    const party = [alchemist, guardian, sorcerer];

    const details = resolveApproachHealDebugDetails(
      alchemist,
      party,
      [],
      gameData,
    );
    expect(details?.priorityHealTargetId).toBe('guardian');
    expect(details?.healWithholdReason).toContain('basic:pht_out_of_range');
    expect(details?.healWithholdReason).toContain(
      'sp_alchemist_active_1:pht_outside_aoe',
    );
  });
});
