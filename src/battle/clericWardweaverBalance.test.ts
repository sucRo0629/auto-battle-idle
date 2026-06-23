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

describe('cleric vs wardweaver balance (iron guard + supporter, stage 1 wave 1)', () => {
  it('Lv10: iron guard survives 90s with cleric or wardweaver', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 10);
    const wardweaverSnap = runGuardianSupporterSim('sp_wardweaver', 10);

    expect(findGuardian(clericSnap)?.hp).toBeGreaterThan(0);
    expect(findGuardian(wardweaverSnap)?.hp).toBeGreaterThan(0);
  });

  it('Lv10: wardweaver Stability kit keeps guardian effective HP at least comparable to cleric', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 10);
    const wardweaverSnap = runGuardianSupporterSim('sp_wardweaver', 10);

    const clericEff = guardianEffectiveHp(clericSnap);
    const wardweaverEff = guardianEffectiveHp(wardweaverSnap);
    expect(clericEff).not.toBeNull();
    expect(wardweaverEff).not.toBeNull();

    const ratio = wardweaverEff! / clericEff!;
    expect(ratio).toBeGreaterThanOrEqual(1 - PARITY_TOLERANCE);
  });

  it('Lv10: sp_wardweaver_passive_3 wave-start barrier on all allies', () => {
    const gameData = loadGameData();
    const levelCurves = loadLevelCurves(levelCurvesJson);

    const guardianMember = createMemberFromClass('df_guardian', gameData);
    guardianMember.progress.level = 1;
    reconcileMemberBuildFromGameData(guardianMember, gameData);

    const wardweaverMember = createMemberFromClass('sp_wardweaver', gameData);
    wardweaverMember.progress.level = 10;
    reconcileMemberBuildFromGameData(wardweaverMember, gameData);
    wardweaverMember.build.learnedPassiveIds = ['sp_wardweaver_passive_3'];

    const allies = createAlliesFromPartyState(
      gameData,
      [guardianMember, wardweaverMember, null, null],
      levelCurves,
    );
    const guardian = allies[0]!;
    const wardweaver = allies[1]!;
    guardian.barrierHp = 0;

    firePeriodicPassivesForTrigger(
      'waveStart',
      allies,
      allies,
      [],
      gameData.skillRegistry.passives,
      gameData,
    );

    expect(guardian.barrierHp).toBe(Math.floor(wardweaver.atk * 0.5));
  });

  it('Lv1 reference: wardweaver may trail cleric without passive_3', () => {
    const clericSnap = runGuardianSupporterSim('sp_cleric', 1);
    const wardweaverSnap = runGuardianSupporterSim('sp_wardweaver', 1);

    const clericEff = guardianEffectiveHp(clericSnap);
    const wardweaverEff = guardianEffectiveHp(wardweaverSnap);
    expect(clericEff).not.toBeNull();
    expect(wardweaverEff).not.toBeNull();
    expect(clericEff!).toBeGreaterThan(0);
    expect(wardweaverEff!).toBeGreaterThan(0);
  });
});
