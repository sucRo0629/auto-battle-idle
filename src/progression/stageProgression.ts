import type { GameData, SaveGameState, StageDef } from '../battle/types.ts';

export function resolveKnownStageId(
  stages: StageDef[],
  stageId: string,
): string | null {
  return stages.find((stage) => stage.id === stageId)?.id ?? stages[0]?.id ?? null;
}

export function resolveVictoryNextStageId(
  stages: StageDef[],
  currentStageId: string,
  loopStageId: string | null | undefined,
): string {
  if (loopStageId) return loopStageId;
  return getNextStageId(stages, currentStageId);
}

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

export function getPreviousStageId(
  stages: StageDef[],
  currentStageId: string,
): string {
  const index = stages.findIndex((stage) => stage.id === currentStageId);
  if (index <= 0) {
    return stages[0]?.id ?? currentStageId;
  }
  return stages[index - 1]!.id;
}

export function applyStageRollbackOnDefeat(
  save: SaveGameState,
  stages: StageDef[],
): string {
  const previousStageId = getPreviousStageId(
    stages,
    save.stageProgress.currentStageId,
  );
  save.stageProgress.currentStageId = previousStageId;
  return previousStageId;
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
