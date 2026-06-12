import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData.ts';
import { waveHasTrainingDummy } from './trainingStage.ts';

describe('trainingStage', () => {
  const gameData = loadGameData();

  it('detects test stage training dummies', () => {
    expect(waveHasTrainingDummy(gameData, 'test', 0)).toBe(true);
  });

  it('returns false for normal stages', () => {
    expect(waveHasTrainingDummy(gameData, '1', 0)).toBe(false);
  });
});
