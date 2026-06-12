import type { GameData } from './types.ts';

export const TRAINING_DUMMY_TEMPLATE_ID = 'test_dummy';

/** Wave に訓練用ダミーが1体でもいれば true */
export function waveHasTrainingDummy(
  gameData: GameData,
  stageId: string,
  waveIndex: number,
): boolean {
  const stage = gameData.stages.find((s) => s.id === stageId);
  const wave = stage?.waves[waveIndex];
  if (!wave) return false;
  return wave.enemies.some(
    ({ templateId }) => templateId === TRAINING_DUMMY_TEMPLATE_ID,
  );
}
