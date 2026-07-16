import { describe, expect, it } from 'vitest';
import { getDamageTakenMultiplier, resolveDamage } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import {
  DF_GUARDIAN_M1_COMBAT_MODULE_ID,
  DF_GUARDIAN_M2_COMBAT_MODULE_ID,
  isIronGuardianM1Selected,
  resolveIronGuardianM1PhysicalTakenMultiplier,
  syncIronGuardianModuleStatusEffects,
} from './ironGuardianM2.ts';
import { mockCombatant } from './testFixtures.ts';

function makeM1Guardian(
  overrides: Parameters<typeof mockCombatant>[0] = {},
) {
  return mockCombatant({
    id: 'guardian',
    classId: 'df_guardian',
    hp: 200,
    maxHp: 200,
    def: 0,
    res: 0,
    isEnemy: false,
    cooldowns: [
      {
        skillId: DF_GUARDIAN_M1_COMBAT_MODULE_ID,
        remaining: 0,
        slotKind: 'basic',
      },
    ],
    statusEffects: [],
    ...overrides,
  });
}

describe('ironGuardianM1 permanent physical DR (R12g-d1)', () => {
  it('selects M1 by module id', () => {
    expect(isIronGuardianM1Selected(makeM1Guardian())).toBe(true);
    expect(
      isIronGuardianM1Selected(
        makeM1Guardian({
          cooldowns: [
            {
              skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
              remaining: 0,
              slotKind: 'basic',
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('reads takenMultiplier from CombatModule runtimeEffect', () => {
    const gameData = loadGameData();
    expect(
      resolveIronGuardianM1PhysicalTakenMultiplier(gameData.combatModuleRegistry),
    ).toBe(0.85);
  });

  it('sync applies permanent physical-only DR while M1 is selected', () => {
    const gameData = loadGameData();
    const guardian = makeM1Guardian();
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    expect(getDamageTakenMultiplier(guardian, 'physical')).toBeCloseTo(0.85, 5);
    expect(getDamageTakenMultiplier(guardian, 'magic')).toBeCloseTo(1, 5);
    const effect = guardian.statusEffects.find(
      (entry) => entry.skillId === DF_GUARDIAN_M1_COMBAT_MODULE_ID,
    );
    expect(effect?.remainingSec).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not reduce magic at the same rate', () => {
    const gameData = loadGameData();
    const guardian = makeM1Guardian();
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    const attacker = mockCombatant({ id: 'atk', atk: 100, isEnemy: true });
    const physical = resolveDamage(
      attacker,
      guardian,
      {
        type: 'damage',
        damageType: 'physical',
        amount: { kind: 'flat', flatAmount: 100 },
      },
      {},
    );
    const magic = resolveDamage(
      attacker,
      guardian,
      {
        type: 'damage',
        damageType: 'magic',
        amount: { kind: 'flat', flatAmount: 100 },
      },
      {},
    );
    expect(physical).toBeLessThan(magic);
    expect(magic).toBe(100);
  });

  it('does not apply to allies', () => {
    const ally = mockCombatant({
      id: 'ally',
      classId: 'sp_cleric',
      hp: 100,
      maxHp: 100,
      def: 0,
      statusEffects: [],
    });
    expect(getDamageTakenMultiplier(ally, 'physical')).toBe(1);
  });

  it('does not grant barrier, heal, or counter', () => {
    const gameData = loadGameData();
    const guardian = makeM1Guardian({ barrierHp: 0, hp: 150 });
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    expect(guardian.barrierHp).toBe(0);
    expect(guardian.hp).toBe(150);
    expect(
      guardian.statusEffects.some((effect) => effect.overlay === 'counter'),
    ).toBe(false);
  });

  it('does not stack when synced twice', () => {
    const gameData = loadGameData();
    const guardian = makeM1Guardian();
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    expect(
      guardian.statusEffects.filter(
        (effect) => effect.skillId === DF_GUARDIAN_M1_COMBAT_MODULE_ID,
      ),
    ).toHaveLength(1);
    expect(getDamageTakenMultiplier(guardian, 'physical')).toBeCloseTo(0.85, 5);
  });

  it('module switch to M2 clears permanent M1 DR', () => {
    const gameData = loadGameData();
    const guardian = makeM1Guardian();
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    guardian.cooldowns = [
      {
        skillId: DF_GUARDIAN_M2_COMBAT_MODULE_ID,
        remaining: 0,
        slotKind: 'basic',
      },
    ];
    syncIronGuardianModuleStatusEffects(
      guardian,
      gameData.combatModuleRegistry,
    );
    expect(getDamageTakenMultiplier(guardian, 'physical')).toBe(1);
    expect(
      guardian.statusEffects.some(
        (effect) => effect.skillId === DF_GUARDIAN_M1_COMBAT_MODULE_ID,
      ),
    ).toBe(false);
  });

  it('enemy M1 uses the same permanent physical-only DR', () => {
    const gameData = loadGameData();
    const enemy = makeM1Guardian({ isEnemy: true, id: 'enemy-guardian' });
    syncIronGuardianModuleStatusEffects(enemy, gameData.combatModuleRegistry);
    expect(getDamageTakenMultiplier(enemy, 'physical')).toBeCloseTo(0.85, 5);
    expect(getDamageTakenMultiplier(enemy, 'magic')).toBe(1);
  });
});
