import { describe, expect, it } from 'vitest';
import type { StageDef } from '../battle/types.ts';
import {
  getNextStageId,
  resolveVictoryNextStageId,
} from './stageProgression.ts';

const stages: StageDef[] = [
  { id: '1', displayName: 'Stage 1', waves: [] },
  { id: '2', displayName: 'Stage 2', waves: [] },
];

describe('resolveVictoryNextStageId', () => {
  it('returns loop stage when pinned', () => {
    expect(resolveVictoryNextStageId(stages, '1', '2')).toBe('2');
    expect(resolveVictoryNextStageId(stages, '2', '1')).toBe('1');
  });

  it('falls back to normal progression when not pinned', () => {
    expect(resolveVictoryNextStageId(stages, '1', null)).toBe(
      getNextStageId(stages, '1'),
    );
    expect(resolveVictoryNextStageId(stages, '2', undefined)).toBe(
      getNextStageId(stages, '2'),
    );
  });
});
