import { describe, expect, it } from 'vitest';
import type { DamageAppliedEvent } from './damageAppliedEvent.ts';
import {
  DF_GUARDIAN_M1_COMBAT_MODULE_ID,
  DF_GUARDIAN_M2_COMBAT_MODULE_ID,
  clearIronGuardianCombatModuleStatusEffects,
  resolveIronGuardianM2SelfHealFlatAmount,
  syncIronGuardianModuleStatusEffects,
  tryIronGuardianM2SelfHeal,
} from './ironGuardianM2.ts';
import { mockCombatant } from './testFixtures.ts';
import type { CombatModuleDef, GameData } from './types.ts';

const M2_FLAT = 20;

function makeRegistry(
  flatAmount: number = M2_FLAT,
): Record<string, CombatModuleDef> {
  return {
    [DF_GUARDIAN_M2_COMBAT_MODULE_ID]: {
      id: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
      classId: 'df_guardian',
      displayName: '不屈',
      description: 'test',
      attackIntervalSec: 3,
      runtimeEffect: {
        kind: 'healOnEnemyAttackHpHit',
        flatAmount,
      },
      action: {
        effect: [
          {
            target: { kind: 'self' },
            type: 'buff',
            buffSubKind: 'stat',
            buffStat: 'def',
            buffMultiplier: 1,
            buffDurationSec: 0.1,
          },
        ],
        targetShape: 'single',
      },
    },
  };
}

function makeGameData(
  flatAmount: number = M2_FLAT,
): Pick<GameData, 'combatModuleRegistry'> {
  return { combatModuleRegistry: makeRegistry(flatAmount) };
}

function makeEvent(
  partial: Partial<DamageAppliedEvent> = {},
): DamageAppliedEvent {
  return {
    attackerId: 'attacker',
    targetId: 'guardian',
    sourceKind: 'skillHit',
    attackKind: 'damage',
    hpDamage: 10,
    barrierDamage: 0,
    lethal: false,
    ...partial,
  };
}

function makeGuardian(overrides: Parameters<typeof mockCombatant>[0] = {}) {
  return mockCombatant({
    id: 'guardian',
    classId: 'df_guardian',
    hp: 40,
    maxHp: 100,
    isEnemy: false,
    cooldowns: [
      {
        skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    ...overrides,
  });
}

describe('ironGuardianM2 runtime (R12g-d1 data-owned heal)', () => {
  it('reads flatAmount from CombatModule runtimeEffect', () => {
    expect(resolveIronGuardianM2SelfHealFlatAmount(makeRegistry(17))).toBe(17);
  });

  it('triggers fixed self-heal on enemy attack hit with real hp damage', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent(),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(true);
    expect(result.healed).toBe(M2_FLAT);
    expect(target.hp).toBe(40 + M2_FLAT);
  });

  it('uses module data amount, not a runtime constant', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent(),
      attacker,
      target,
      makeGameData(33),
    );
    expect(result.healed).toBe(33);
    expect(target.hp).toBe(73);
  });

  it('also triggers for magic attack hits', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ attackMethod: 'ranged' }),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(true);
  });

  it('does not trigger on barrier-only hits', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian();
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 0, barrierDamage: 15 }),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(false);
    expect(target.hp).toBe(40);
  });

  it('does not trigger for dot / delayed / counter / derived', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const kinds: DamageAppliedEvent['sourceKind'][] = [
      'dotTick',
      'delayedPoolTick',
      'counter',
      'derived',
    ];
    for (const sourceKind of kinds) {
      const target = makeGuardian();
      const result = tryIronGuardianM2SelfHeal(
        makeEvent({ sourceKind }),
        attacker,
        target,
        makeGameData(),
      );
      expect(result.triggered).toBe(false);
      expect(target.hp).toBe(40);
    }
  });

  it('does not trigger on self damage or non-adversary damage', () => {
    const self = makeGuardian({ isEnemy: false });
    const selfHit = tryIronGuardianM2SelfHeal(
      makeEvent({ attackerId: self.id, targetId: self.id }),
      self,
      self,
      makeGameData(),
    );
    expect(selfHit.triggered).toBe(false);

    const allyAttacker = mockCombatant({ id: 'ally', isEnemy: false });
    const allyHit = tryIronGuardianM2SelfHeal(
      makeEvent(),
      allyAttacker,
      makeGuardian(),
      makeGameData(),
    );
    expect(allyHit.triggered).toBe(false);
  });

  it('does not trigger on lethal hits', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 5 });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent({ hpDamage: 5, lethal: true }),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(false);
  });

  it('does not trigger when M1 is selected', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({
      cooldowns: [
        {
          skillId: DF_GUARDIAN_M1_COMBAT_MODULE_ID,
          remaining: 0,
          slotKind: 'basic',
        },
      ],
    });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent(),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(false);
  });

  it('triggers once per multi-hit event', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 30 });
    tryIronGuardianM2SelfHeal(
      makeEvent({ hitIndex: 0, hpDamage: 5 }),
      attacker,
      target,
      makeGameData(),
    );
    tryIronGuardianM2SelfHeal(
      makeEvent({ hitIndex: 1, hpDamage: 5 }),
      attacker,
      target,
      makeGameData(),
    );
    expect(target.hp).toBe(30 + M2_FLAT * 2);
  });

  it('clamps heal to max HP and does not convert overflow to barrier', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: true });
    const target = makeGuardian({ hp: 95, maxHp: 100, barrierHp: 0 });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent(),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.healed).toBe(5);
    expect(target.hp).toBe(100);
    expect(target.barrierHp).toBe(0);
  });

  it('works for enemy iron guardian M2', () => {
    const attacker = mockCombatant({ id: 'attacker', isEnemy: false });
    const target = makeGuardian({ isEnemy: true });
    const result = tryIronGuardianM2SelfHeal(
      makeEvent(),
      attacker,
      target,
      makeGameData(),
    );
    expect(result.triggered).toBe(true);
    expect(result.healed).toBe(M2_FLAT);
  });

  it('clears module-owned status on sync when module switches', () => {
    const gameData = makeGameData();
    const target = makeGuardian({
      cooldowns: [
        {
          skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
          remaining: 0,
          slotKind: 'basic',
        },
      ],
      statusEffects: [
        {
          id: 'm1',
          kind: 'buff',
          stat: 'damageTaken',
          multiplier: 0.85,
          durationSec: Number.POSITIVE_INFINITY,
          remainingSec: Number.POSITIVE_INFINITY,
          skillId: DF_GUARDIAN_M1_COMBAT_MODULE_ID,
          damageTakenDamageTypes: ['physical'],
        },
      ],
    });
    syncIronGuardianModuleStatusEffects(target, {
      [DF_GUARDIAN_M1_COMBAT_MODULE_ID]: {
        id: DF_GUARDIAN_M1_COMBAT_MODULE_ID,
        classId: 'df_guardian',
        displayName: '物理堅守',
        description: 'test',
        attackIntervalSec: 3,
        runtimeEffect: {
          kind: 'physicalDamageTakenReduction',
          takenMultiplier: 0.85,
        },
        action: {
          effect: [
            {
              target: { kind: 'self' },
              type: 'buff',
              buffSubKind: 'stat',
              buffStat: 'def',
              buffMultiplier: 1,
              buffDurationSec: 0.1,
            },
          ],
          targetShape: 'single',
        },
      },
      ...gameData.combatModuleRegistry,
    });
    expect(
      target.statusEffects.some(
        (e) => e.skillId === DF_GUARDIAN_M1_COMBAT_MODULE_ID,
      ),
    ).toBe(false);
    clearIronGuardianCombatModuleStatusEffects(target);
    expect(target.statusEffects).toHaveLength(0);
  });
});
