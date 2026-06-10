import { describe, expect, it } from 'vitest';
import { resolveRuntimeBattlePhase } from './battlePhase.ts';

describe('resolveRuntimeBattlePhase', () => {
  it('maps running combat states to field FSM phases', () => {
    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        formationResetActive: false,
        waveIntermissionActive: true,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('WaveApproach');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: true,
        formationResetActive: false,
        waveIntermissionActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('Engaged');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        formationResetActive: true,
        waveIntermissionActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('FormationReset');
  });
});
