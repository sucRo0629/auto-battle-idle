import levelCurvesJson from '../../../data/levelCurves.json';
import { BattleEngine } from '../BattleEngine.ts';
import { loadGameData } from '../data/loadGameData.ts';
import type { ClassId } from '../types.ts';
import { createMemberFromClass } from '../../progression/partyCompose.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { reconcileMemberBuildFromGameData } from '../../progression/skillBuild.ts';
import { TICK_DT, waitForEngaged } from './battleFieldSpec.harness.ts';

const SIM_SEC = 90;
const SIM_TICKS = Math.ceil(SIM_SEC / TICK_DT);

export function findGuardian(snap: ReturnType<BattleEngine['getSnapshot']>) {
  return snap.allies.find((a) => a.partySlotIndex === 0);
}

export function guardianEffectiveHp(
  snap: ReturnType<BattleEngine['getSnapshot']>,
): number | null {
  const guardian = findGuardian(snap);
  if (!guardian || guardian.hp <= 0) return null;
  return guardian.hp + (guardian.barrierHp ?? 0);
}

export function runGuardianSupporterSim(
  supporterClassId: ClassId | null,
  level: number,
): ReturnType<BattleEngine['getSnapshot']> & {
  minGuardianEffectiveHp: number;
  avgGuardianEffectiveHp: number;
} {
  const gameData = structuredClone(loadGameData());
  const levelCurves = loadLevelCurves(levelCurvesJson);
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = '1';

  const guardian = createMemberFromClass('df_guardian', gameData);
  guardian.progress.level = level;
  reconcileMemberBuildFromGameData(guardian, gameData);

  const supporter = supporterClassId
    ? (() => {
        const member = createMemberFromClass(supporterClassId, gameData);
        member.progress.level = level;
        reconcileMemberBuildFromGameData(member, gameData);
        return member;
      })()
    : null;

  save.party = [guardian, supporter, null, null];

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();
  waitForEngaged(engine);

  let minGuardianEffectiveHp = Infinity;
  let guardianEffectiveHpSum = 0;
  let guardianEffectiveHpSamples = 0;
  for (let i = 0; i < SIM_TICKS; i++) {
    engine.tick(TICK_DT);
    const eff = guardianEffectiveHp(engine.getSnapshot());
    if (eff !== null) {
      if (eff < minGuardianEffectiveHp) {
        minGuardianEffectiveHp = eff;
      }
      guardianEffectiveHpSum += eff;
      guardianEffectiveHpSamples += 1;
    }
  }

  const snap = engine.getSnapshot();
  return Object.assign(snap, {
    minGuardianEffectiveHp:
      minGuardianEffectiveHp === Infinity ? 0 : minGuardianEffectiveHp,
    avgGuardianEffectiveHp:
      guardianEffectiveHpSamples > 0
        ? guardianEffectiveHpSum / guardianEffectiveHpSamples
        : 0,
  });
}
