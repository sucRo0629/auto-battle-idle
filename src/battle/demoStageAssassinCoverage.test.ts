/**
 * at_assassin role diagnostics — demo_ch1_04〜07 (M1 scope).
 * Log-centric; does not assert stage balance or victory.
 */
import { describe, expect, it } from 'vitest';
import type { GameData, SaveGameState } from './types.ts';
import {
  configureAssassinDoubleFinishParty,
  configureAssassinInsteadOfRangerParty,
  configureNoHealerParty,
  configurePaladinTankParty,
  configureUniversalParty,
  createDemoStageGameData,
  logDemoAssassinRoleReportsForQuad,
  logDemoAssassinRoleReportsForRuns,
  runDemoStageBattle,
  type DemoStageId,
} from './test/demoStageSim.harness.ts';

type ConfigureSave = (save: SaveGameState, gameData: GameData) => void;

const ASSASSIN_DIAG_STAGES = [
  'demo_ch1_04',
  'demo_ch1_05',
  'demo_ch1_06',
  'demo_ch1_07',
] as const satisfies readonly DemoStageId[];

interface AssassinDiagComposition {
  partyLabel: string;
  configureSave?: ConfigureSave;
}

function runAssassinDiagnosticCompositions(
  stageId: DemoStageId,
  gameData: GameData,
  compositions: AssassinDiagComposition[],
) {
  const runs = compositions.map(({ partyLabel, configureSave }) => ({
    partyLabel,
    result: runDemoStageBattle(stageId, { gameData, configureSave }),
  }));
  return logDemoAssassinRoleReportsForRuns(stageId, runs);
}

describe('demo stage at_assassin role diagnostics (ch1_04〜07)', () => {
  const gameData = createDemoStageGameData();

  it.each(ASSASSIN_DIAG_STAGES.map((stageId) => [stageId, stageId] as const))(
    '%s: puzzle quad assassin coverage (baseline / no-healer / universal / counter)',
    (stageId) => {
      const baseline = runDemoStageBattle(stageId, { gameData });
      const bad = runDemoStageBattle(stageId, {
        gameData,
        configureSave: configureNoHealerParty,
      });
      const universal = runDemoStageBattle(stageId, {
        gameData,
        configureSave: configureUniversalParty,
      });
      const counter = runDemoStageBattle(stageId, {
        gameData,
        configureSave: configurePaladinTankParty,
      });

      const entries = logDemoAssassinRoleReportsForQuad(stageId, {
        baseline,
        badResult: bad,
        universalResult: universal,
        counterResult: counter,
      });

      const assassinEntries = entries.filter((e) => e.hasAssassin && e.report);
      expect(assassinEntries.length).toBeGreaterThan(0);
      for (const entry of assassinEntries) {
        expect(entry.report!.damageDealt).toBeGreaterThanOrEqual(0);
        expect(entry.report!.roleVerdict).toBeTruthy();
      }
    },
  );

  it('demo_ch1_05: assassin spotlight compositions (stage receptacle probe)', () => {
    const compositions: AssassinDiagComposition[] = [
      { partyLabel: 'baseline' },
      { partyLabel: 'no-healer', configureSave: configureNoHealerParty },
      {
        partyLabel: 'assassin-ranger-slot',
        configureSave: configureAssassinInsteadOfRangerParty,
      },
      {
        partyLabel: 'assassin-double-finish',
        configureSave: configureAssassinDoubleFinishParty,
      },
      { partyLabel: 'counter-paladin', configureSave: configurePaladinTankParty },
    ];

    const entries = runAssassinDiagnosticCompositions(
      'demo_ch1_05',
      gameData,
      compositions,
    );

    const spotlight = entries.filter(
      (e) =>
        e.hasAssassin &&
        e.report &&
        (e.partyLabel === 'assassin-ranger-slot' ||
          e.partyLabel === 'assassin-double-finish'),
    );
    expect(spotlight.length).toBe(2);
    for (const entry of spotlight) {
      expect(entry.report!.basicActionCount).toBeGreaterThanOrEqual(0);
    }
  });
});
