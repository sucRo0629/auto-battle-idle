import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveOperationPassiveAcquireCost } from '../game/operationPassiveAcquireCost.ts';
import {
  configureUniversalParty,
  runDemoStageBattle,
  type DemoStageBattleResult,
} from './test/demoStageSim.harness.ts';

const STAGE_ID = 'r12_prototype';

const tacticalModulesBySlot = [
  'df_guardian_mod_guard_focus',
  'at_swordsman_mod_pierce_slash',
  'sp_cleric_mod_party_mend',
  'at_sorcerer_mod_chain',
] as const;

interface BalanceRow {
  label: string;
  outcome: DemoStageBattleResult['outcome'];
  finalWave: number;
  durationSec: number;
  survivingAllies: number;
  survivingEnemies: number;
  survivingAllyClasses: string;
  survivingEnemyClasses: string;
  remainingHpRatio: number;
  remainingEnemyHp: number;
  totalDamage: number;
  totalHealing: number;
}

function summarize(
  label: string,
  result: DemoStageBattleResult,
): BalanceRow {
  return {
    label,
    outcome: result.outcome,
    finalWave: result.finalWaveIndex + 1,
    durationSec: Number(result.durationSec.toFixed(1)),
    survivingAllies: result.survivingAllies,
    survivingEnemies: result.survivingEnemies,
    survivingAllyClasses: result.survivingAllyClassIds.join(','),
    survivingEnemyClasses: result.survivingEnemyClassIds.join(','),
    remainingHpRatio: Number(
      (result.totalRemainingHp / result.totalMaxHp).toFixed(3),
    ),
    remainingEnemyHp: result.totalRemainingEnemyHp,
    totalDamage: result.classStats.reduce(
      (sum, row) => sum + row.damageDealt,
      0,
    ),
    totalHealing: result.classStats.reduce(
      (sum, row) => sum + row.healingDealt,
      0,
    ),
  };
}

function runPath(
  label: string,
  modulesBySlot: readonly (string | undefined)[] | undefined,
  updatePassives: (
    nextWaveIndex: number,
    passivesBySlot: string[][],
  ) => void,
): BalanceRow {
  const passivesBySlot: string[][] = [[], [], [], []];
  const result = runDemoStageBattle(STAGE_ID, {
    gameData: loadGameData(),
    configureSave: configureUniversalParty,
    getSelectedCombatModuleId: modulesBySlot
      ? (slotIndex) => modulesBySlot[slotIndex]
      : undefined,
    getAcquiredOperationPassiveIds: (slotIndex) =>
      passivesBySlot[slotIndex] ?? [],
    beforeStartNextWave: (nextWaveIndex) => {
      updatePassives(nextWaveIndex, passivesBySlot);
    },
    maxTicks: 10_800,
  });
  return summarize(label, result);
}

describe('R12 prototype balance characterization', () => {
  it('compares no-spend, incremental-spend, and save-then-spend paths', () => {
    const catalog = loadGameData().operationPassiveCatalog;
    // Wave grant is 12; cheap ops are 1, expensive ops are 10 (R12l catalog).
    expect(
      resolveOperationPassiveAcquireCost(
        catalog,
        'df_guardian_op_block_rate_up',
        0,
      ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'at_swordsman_op_interval_reduction',
          0,
        ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'at_sorcerer_op_interval_reduction',
          0,
        ),
    ).toBe(3);
    expect(
      resolveOperationPassiveAcquireCost(
        catalog,
        'df_guardian_op_fortress_stance',
        0,
      ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'at_swordsman_op_physical_damage_up',
          0,
        ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'sp_cleric_op_heal_amount_up',
          0,
        ),
    ).toBe(12);
    expect(
      resolveOperationPassiveAcquireCost(
        catalog,
        'df_guardian_op_fortress_stance',
        0,
      ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'at_swordsman_passive_3',
          0,
        ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'at_sorcerer_op_ignition_damage',
          0,
        ) +
        resolveOperationPassiveAcquireCost(
          catalog,
          'sp_cleric_op_interval_reduction',
          0,
        ),
    ).toBe(22);

    const baseline = summarize(
      'standard modules / no passives',
      runDemoStageBattle(STAGE_ID, {
        gameData: loadGameData(),
        configureSave: configureUniversalParty,
        maxTicks: 10_800,
      }),
    );

    const incremental = runPath(
      'standard modules / spend each prep',
      undefined,
      (nextWaveIndex, passivesBySlot) => {
        if (nextWaveIndex === 1) {
          passivesBySlot[0] = ['df_guardian_op_block_rate_up'];
          passivesBySlot[1] = ['at_swordsman_op_interval_reduction'];
          passivesBySlot[3] = ['at_sorcerer_op_interval_reduction'];
        }
        if (nextWaveIndex === 2) {
          passivesBySlot[0] = [
            'df_guardian_op_block_rate_up',
            'df_guardian_op_fortress_stance',
          ];
          passivesBySlot[1] = [
            'at_swordsman_op_interval_reduction',
            'at_swordsman_op_physical_damage_up',
          ];
          passivesBySlot[2] = ['sp_cleric_op_heal_amount_up'];
        }
      },
    );

    const savedThenSpend = runPath(
      'standard modules / save then spend',
      undefined,
      (nextWaveIndex, passivesBySlot) => {
        if (nextWaveIndex !== 2) return;
        passivesBySlot[0] = ['df_guardian_op_fortress_stance'];
        passivesBySlot[1] = ['at_swordsman_passive_3'];
        passivesBySlot[3] = ['at_sorcerer_op_ignition_damage'];
        passivesBySlot[2] = ['sp_cleric_op_interval_reduction'];
      },
    );

    const alternateModules = runPath(
      'all alternate modules / no passives',
      tacticalModulesBySlot,
      () => {},
    );

    const singleAlternateRows = tacticalModulesBySlot.map(
      (moduleId, slotIndex) => {
        const modulesBySlot: (string | undefined)[] = [];
        modulesBySlot[slotIndex] = moduleId;
        return runPath(
          `alternate module slot ${slotIndex} / no passives`,
          modulesBySlot,
          () => {},
        );
      },
    );

    const rows = [
      baseline,
      incremental,
      savedThenSpend,
      alternateModules,
      ...singleAlternateRows,
    ];
    console.table(rows);

    expect(baseline.outcome).toBe('victory');
    for (const row of rows) {
      expect(row.finalWave).toBeGreaterThanOrEqual(1);
      expect(row.finalWave).toBeLessThanOrEqual(3);
    }
  });
});
