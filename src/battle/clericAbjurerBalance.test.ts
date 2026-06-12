import { describe, expect, it } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { loadGameData } from './data/loadGameData.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';
import { createAlliesFromPartyState } from './entities.ts';
import { firePeriodicPassivesForTrigger } from './passiveEffects.ts';
import {
  findGuardian,
  guardianEffectiveHp,
  runGuardianSupporterSim,
} from './test/guardianSupporterSim.harness.ts';

const PARITY_TOLERANCE = 0.25;

describe('cleric vs abjurer balance (iron guard + supporter, stage 1 wave 1)', () => {
  it('Lv10: iron guard survives 90s with cleric or abjurer', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 10);
    const abjurerSnap = runGuardianSupporterSim('sp_abjurer', 10);

    expect(findGuardian(clericSnap)?.hp).toBeGreaterThan(0);
    expect(findGuardian(abjurerSnap)?.hp).toBeGreaterThan(0);
  });

  it('Lv10: guardian effective HP within 25% between cleric and abjurer', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 10);
    const abjurerSnap = runGuardianSupporterSim('sp_abjurer', 10);

    const clericEff = guardianEffectiveHp(clericSnap);
    const abjurerEff = guardianEffectiveHp(abjurerSnap);
    expect(clericEff).not.toBeNull();
    expect(abjurerEff).not.toBeNull();

    const ratio = abjurerEff! / clericEff!;
    expect(ratio).toBeGreaterThanOrEqual(1 - PARITY_TOLERANCE);
    expect(ratio).toBeLessThanOrEqual(1 + PARITY_TOLERANCE);
  });

  it('Lv10: sp_abjurer_passive_1 wave-start barrier on highest-HP ally', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);

    const guardianMember = createMemberFromClass('df_guardian', gameData);
    guardianMember.progress.level = 1;
    reconcileMemberBuildFromGameData(guardianMember, gameData);

    const abjurerMember = createMemberFromClass('sp_abjurer', gameData);
    abjurerMember.progress.level = 10;
    reconcileMemberBuildFromGameData(abjurerMember, gameData);

    const allies = createAlliesFromPartyState(
      gameData,
      [guardianMember, abjurerMember, null, null],
      levelCurves,
    );
    const guardian = allies[0]!;
    const abjurer = allies[1]!;
    guardian.barrierHp = 0;

    firePeriodicPassivesForTrigger(
      'waveStart',
      allies,
      allies,
      [],
      gameData.skillRegistry.passives,
    );

    expect(guardian.barrierHp).toBe(Math.floor(abjurer.atk * 1.5));
  });

  it('Lv1 reference: abjurer may trail cleric without passive_3', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 1);
    const abjurerSnap = runGuardianSupporterSim('sp_abjurer', 1);

    const clericEff = guardianEffectiveHp(clericSnap);
    const abjurerEff = guardianEffectiveHp(abjurerSnap);
    expect(clericEff).not.toBeNull();
    expect(abjurerEff).not.toBeNull();
    expect(clericEff!).toBeGreaterThan(0);
    expect(abjurerEff!).toBeGreaterThan(0);
  });
});
