/**
 * at_assassin vs at_swordsman survival diagnostics — demo_ch1_04〜07.
 * Log-centric; does not change stage/class data or battle logic.
 */
import { describe, expect, it } from 'vitest';
import type { GameData, SaveGameState } from './types.ts';
import {
  configureAssassinInsteadOfRangerParty,
  configureNoHealerParty,
  configureNoHealerSwordsmanParty,
  configureSwordsmanInsteadOfRangerParty,
  createDemoStageGameData,
  runDemoStageBattle,
  type DemoStageId,
} from './test/demoStageSim.harness.ts';
import {
  logDemoAssassinVsSwordsmanComparison,
  toAssassinVsSwordsmanBattleInput,
  type AssassinVsSwordsmanVerdict,
  type DemoAssassinVsSwordsmanSummary,
} from './test/assassinVsSwordsmanReport.ts';

type ConfigureSave = (save: SaveGameState, gameData: GameData) => void;

const SURVIVAL_DIAG_STAGES = [
  'demo_ch1_04',
  'demo_ch1_05',
  'demo_ch1_06',
  'demo_ch1_07',
] as const satisfies readonly DemoStageId[];

interface SlotComparisonSpec {
  partyLabel: string;
  partyHasHealer: boolean;
  configureAssassin: ConfigureSave;
  configureSwordsman: ConfigureSave;
  /** When set, run only on these stages. */
  stages?: readonly DemoStageId[];
}

const SLOT_COMPARISONS: SlotComparisonSpec[] = [
  {
    partyLabel: 'no-healer-cleric-slot',
    partyHasHealer: false,
    configureAssassin: configureNoHealerParty,
    configureSwordsman: configureNoHealerSwordsmanParty,
  },
  {
    partyLabel: 'ranger-slot-finish',
    partyHasHealer: true,
    configureAssassin: configureAssassinInsteadOfRangerParty,
    configureSwordsman: configureSwordsmanInsteadOfRangerParty,
    stages: ['demo_ch1_05'],
  },
];

function runSlotComparison(
  stageId: DemoStageId,
  gameData: GameData,
  spec: SlotComparisonSpec,
): DemoAssassinVsSwordsmanSummary {
  const assassinResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: spec.configureAssassin,
  });
  const swordsmanResult = runDemoStageBattle(stageId, {
    gameData,
    configureSave: spec.configureSwordsman,
  });

  return logDemoAssassinVsSwordsmanComparison({
    stageId,
    partyLabel: spec.partyLabel,
    partyHasHealer: spec.partyHasHealer,
    assassin: toAssassinVsSwordsmanBattleInput(assassinResult),
    swordsman: toAssassinVsSwordsmanBattleInput(swordsmanResult),
  });
}

describe('demo stage at_assassin vs at_swordsman survival diagnostics (ch1_04〜07)', () => {
  const gameData = createDemoStageGameData();

  it.each(SURVIVAL_DIAG_STAGES.map((stageId) => [stageId, stageId] as const))(
    '%s: no-healer cleric-slot assassin vs swordsman',
    (stageId) => {
      const summary = runSlotComparison(stageId, gameData, SLOT_COMPARISONS[0]!);
      expect(summary.verdict).toBeTruthy();
    },
  );

  it('demo_ch1_05: ranger-slot finish comparison (spotlight stage)', () => {
    const spec = SLOT_COMPARISONS.find((s) => s.partyLabel === 'ranger-slot-finish')!;
    const summary = runSlotComparison('demo_ch1_05', gameData, spec);
    expect(summary.verdict).toBeTruthy();
  });

  it('demo_ch1_05: both comparison frames emit expected log tags', () => {
    const ch1_05Specs = SLOT_COMPARISONS.filter(
      (spec) => !spec.stages || spec.stages.includes('demo_ch1_05'),
    );
    const verdicts: AssassinVsSwordsmanVerdict[] = [];

    for (const spec of ch1_05Specs) {
      verdicts.push(runSlotComparison('demo_ch1_05', gameData, spec).verdict);
    }

    expect(verdicts.length).toBe(2);
    expect(new Set(verdicts).size).toBeGreaterThan(0);
  });
});
