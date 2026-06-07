import type { GameData, StageDef } from '../battle/types.ts';

export function getNextStageId(
  stages: StageDef[],
  currentStageId: string,
): string {
  const index = stages.findIndex((stage) => stage.id === currentStageId);
  if (index < 0) {
    return stages[0]?.id ?? currentStageId;
  }
  const next = stages[index + 1];
  return next?.id ?? currentStageId;
}

export function getStageById(
  stages: StageDef[],
  stageId: string,
): StageDef | undefined {
  return stages.find((stage) => stage.id === stageId);
}

/** ステージ内の全敵の exp 合計（撃破報酬） */
export function computeStageExpReward(
  gameData: GameData,
  stageId: string,
): number {
  const stage = getStageById(gameData.stages, stageId);
  if (!stage) return 0;

  let total = 0;
  for (const wave of stage.waves) {
    for (const { templateId } of wave.enemies) {
      const template = gameData.enemyRegistry[templateId];
      if (template) {
        total += template.exp;
      }
    }
  }
  return total;
}
