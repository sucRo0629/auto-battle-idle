import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { resolveEffectResolution } from './skills/targeting.ts';
import { mockTargetingGameData, mockUnit } from './testFixtures.ts';
import { RANGED_ATTACK_MIN_PX, isMeleeRangePx } from './types.ts';
import {
  asBattleEngineInternals,
  TICK_DT,
} from './test/battleFieldSpec.harness.ts';
import { BattleEngine } from './BattleEngine.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import levelCurvesJson from '../../data/levelCurves.json';
import { createDefaultSave } from '../progression/victoryRewards.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import { reconcileMemberBuildFromGameData } from '../progression/skillBuild.ts';
import { isWithinSkillRange } from './skills/rangeUtils.ts';
import { waitForEngaged } from './test/battleFieldSpec.harness.ts';

function createAlchemistGuardianEngine(): BattleEngine {
  const gameData = structuredClone(loadGameData());
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';

  const guardian = createMemberFromClass('df_guardian', gameData);
  const alchemist = createMemberFromClass('sp_alchemist', gameData);
  reconcileMemberBuildFromGameData(guardian, gameData);
  reconcileMemberBuildFromGameData(alchemist, gameData);
  save.party = [guardian, alchemist, null, null];

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  return engine;
}

describe('sp_alchemist_active_1 enemy debuff targeting', () => {
  const gameData = mockTargetingGameData();
  const debuffEffect =
    loadGameData().skillRegistry.actives['sp_alchemist_active_1']!.effect[1]!;

  it('does not reach enemies from back row when debuff range is too short', () => {
    const alchemist = mockUnit('alc', 20, { rangePx: RANGED_ATTACK_MIN_PX - 10 });
    const enemy = mockUnit('e1', 180, { isEnemy: true });
    const shortRangeDebuff = { ...debuffEffect, range: 90 };

    const resolution = resolveEffectResolution(
      shortRangeDebuff,
      alchemist,
      [alchemist],
      [enemy],
      gameData,
    );
    expect(resolution).toBeNull();
  });

  it('reaches nearest enemy from back row when debuff effect range covers battlefield', () => {
    const alchemist = mockUnit('alc', 20, { rangePx: RANGED_ATTACK_MIN_PX - 10 });
    const enemy = mockUnit('e1', 440, { isEnemy: true });
    const debuffWithRange = { ...debuffEffect, range: 460 };

    const resolution = resolveEffectResolution(
      debuffWithRange,
      alchemist,
      [alchemist],
      [enemy],
      gameData,
    );
    expect(resolution?.waves[0]?.targets[0]?.unit.id).toBe('e1');
  });

  it('class data uses melee band as front-row supporter', () => {
    const alchemistClass = loadGameData().classRegistry['sp_alchemist'];
    expect(isMeleeRangePx(alchemistClass?.traits.rangePx ?? 0)).toBe(true);
    expect(alchemistClass?.formationRow).toBe('front');
  });

  it('active debuff effect uses aoeRadiusPx around melee anchor', () => {
    const debuff =
      loadGameData().skillRegistry.actives['sp_alchemist_active_1']!.effect[1]!;
    expect(debuff.targetShape).toBe('aoe');
    expect(debuff.aoeRadiusPx).toBe(70);
    expect(debuff.range).toBeUndefined();
  });

  it('applies atk debuff to enemies during stage 1 engage sim', () => {
    const engine = createAlchemistGuardianEngine();
    const internal = asBattleEngineInternals(engine);
    waitForEngaged(engine);

    const alchemist = internal.players.find((p) => p.classId === 'sp_alchemist');
    const enemy = internal.enemies.find((e) => e.isAlive);
    expect(alchemist).toBeDefined();
    expect(enemy).toBeDefined();

    const anchorRangePx = alchemist!.traits.rangePx;
    alchemist!.battleX = enemy!.battleX - anchorRangePx + 10;
    expect(isWithinSkillRange(alchemist!, enemy!, anchorRangePx)).toBe(true);

    const activeCd = alchemist!.cooldowns.find(
      (cd) => cd.skillId === 'sp_alchemist_active_1',
    );
    expect(activeCd).toBeDefined();
    activeCd!.remaining = 0;

    internal.runUnitSkills!([alchemist!]);

    for (let t = 0; t < 120; t++) {
      engine.tick(TICK_DT);
    }

    const debuffApplied = internal.enemies.some((e) =>
      e.statusEffects.some(
        (fx) => fx.kind === 'debuff' && fx.stat === 'atk' && fx.multiplier === 0.85,
      ),
    );
    expect(debuffApplied).toBe(true);
  });
});
