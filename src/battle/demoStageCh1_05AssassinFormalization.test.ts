/**
 * demo_ch1_05 — at_assassin experience spotlight / counter formalization diagnostic.
 * Log-centric; does not change stage/class data or assert victory (RNG-sensitive).
 */
import { describe, expect, it } from 'vitest';
import type { ClassId, GameData, SaveGameState } from './types.ts';
import {
  buildCh1_05PuzzleQuadSnapshot,
  buildCh1_05SlotComparisonRow,
  logCh1_05AssassinFormalization,
  type Ch1_05AssassinFormalVerdict,
} from './test/ch1_05AssassinFormalizationReport.ts';
import {
  configureAssassinDoubleFinishParty,
  configureAssassinInsteadOfRangerParty,
  configureNoHealerParty,
  configureNoHealerSwordsmanParty,
  configurePaladinTankParty,
  configureRangedCounterParty,
  configureSwordsmanInsteadOfRangerParty,
  configureUniversalParty,
  createDemoStageGameData,
  runDemoStageBattle,
} from './test/demoStageSim.harness.ts';

type ConfigureSave = (save: SaveGameState, gameData: GameData) => void;

const STAGE_ID = 'demo_ch1_05' as const;

interface SlotProbe {
  partyLabel: string;
  slotIndex: number;
  slotClassId: ClassId;
  configureSave?: ConfigureSave;
}

const RANGER_SLOT_PROBES: SlotProbe[] = [
  {
    partyLabel: 'ranger-slot-baseline',
    slotIndex: 3,
    slotClassId: 'at_ranger',
  },
  {
    partyLabel: 'ranger-slot-assassin',
    slotIndex: 3,
    slotClassId: 'at_assassin',
    configureSave: configureAssassinInsteadOfRangerParty,
  },
  {
    partyLabel: 'ranger-slot-swordsman',
    slotIndex: 3,
    slotClassId: 'at_swordsman',
    configureSave: configureSwordsmanInsteadOfRangerParty,
  },
  {
    partyLabel: 'ranger-slot-sorcerer',
    slotIndex: 3,
    slotClassId: 'at_sorcerer',
    configureSave: configureRangedCounterParty,
  },
];

const CLERIC_SLOT_PROBES: SlotProbe[] = [
  {
    partyLabel: 'cleric-slot-baseline',
    slotIndex: 2,
    slotClassId: 'sp_cleric',
  },
  {
    partyLabel: 'cleric-slot-no-healer-assassin',
    slotIndex: 2,
    slotClassId: 'at_assassin',
    configureSave: configureNoHealerParty,
  },
  {
    partyLabel: 'cleric-slot-no-healer-swordsman',
    slotIndex: 2,
    slotClassId: 'at_swordsman',
    configureSave: configureNoHealerSwordsmanParty,
  },
];

const ACCEPTABLE_FORMAL_VERDICTS: Ch1_05AssassinFormalVerdict[] = [
  'EXPERIENCE_SPOTLIGHT_CANDIDATE',
  'EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK',
];

describe('demo_ch1_05 at_assassin formalization diagnostic', () => {
  const gameData = createDemoStageGameData();

  it('ranger-slot substitutes + puzzle quad → formalization verdict log', () => {
    const slotRows = RANGER_SLOT_PROBES.map((probe) => {
      const result = runDemoStageBattle(STAGE_ID, {
        gameData,
        configureSave: probe.configureSave,
      });
      return buildCh1_05SlotComparisonRow(
        probe.partyLabel,
        probe.slotIndex,
        probe.slotClassId,
        result,
      );
    });

    const baseline = runDemoStageBattle(STAGE_ID, { gameData });
    const badResult = runDemoStageBattle(STAGE_ID, {
      gameData,
      configureSave: configureNoHealerParty,
    });
    const universalResult = runDemoStageBattle(STAGE_ID, {
      gameData,
      configureSave: configureUniversalParty,
    });
    const counterResult = runDemoStageBattle(STAGE_ID, {
      gameData,
      configureSave: configurePaladinTankParty,
    });

    const puzzleQuad = buildCh1_05PuzzleQuadSnapshot({
      baseline,
      badResult,
      universalResult,
      counterResult,
    });

    const summary = logCh1_05AssassinFormalization({ slotRows, puzzleQuad });

    expect(summary.stageId).toBe(STAGE_ID);
    expect(summary.verdict).toBeTruthy();
    expect(summary.slotRows.length).toBe(RANGER_SLOT_PROBES.length);
    expect(summary.assassinSpotlightRoleOk).toBe(true);
    expect(summary.assassinExplainableInLogs).toBe(true);
    expect(ACCEPTABLE_FORMAL_VERDICTS).toContain(summary.verdict);
    expect(summary.puzzleDefaultLoses).toBe(false);
  });

  it('cleric-slot bad substitutes emit slot comparison (puzzle bad frame)', () => {
    for (const probe of CLERIC_SLOT_PROBES) {
      const result = runDemoStageBattle(STAGE_ID, {
        gameData,
        configureSave: probe.configureSave,
      });
      const row = buildCh1_05SlotComparisonRow(
        probe.partyLabel,
        probe.slotIndex,
        probe.slotClassId,
        result,
      );
      expect(row.outcome).toMatch(/^(victory|defeat|timeout)$/);
      if (probe.slotClassId === 'at_assassin' && row.assassinReport) {
        expect(row.assassinReport.priorityTargetDamageShare).toBeGreaterThanOrEqual(0.35);
      }
    }
  });

  it('assassin-double-finish spotlight probe (diagnostic only)', () => {
    const result = runDemoStageBattle(STAGE_ID, {
      gameData,
      configureSave: configureAssassinDoubleFinishParty,
    });
    const row = buildCh1_05SlotComparisonRow(
      'assassin-double-finish',
      2,
      'at_assassin',
      result,
    );
    expect(row.assassinReport?.roleVerdict).toBe('ROLE_OK');
    expect(row.assassinReport?.priorityTargetDamageShare).toBeGreaterThanOrEqual(0.35);
  });
});
