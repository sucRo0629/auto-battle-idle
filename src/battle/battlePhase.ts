import type { BattlePhase } from './types.ts';

/** 戦闘フィールド FSM（battle-field.md §4.1） */
export type RuntimeBattlePhase =
  | 'WaveApproach'
  | 'PreEngage'
  | 'Engaged'
  | 'FormationReset'
  | 'VictoryExit'
  | 'Defeat'
  | 'Respawn'
  | 'Idle';

export interface RuntimeBattlePhaseInput {
  phase: BattlePhase;
  engaged: boolean;
  formationResetActive: boolean;
  waveIntermissionActive: boolean;
  victoryAwaitExitMarch: boolean;
}

export function resolveRuntimeBattlePhase(
  input: RuntimeBattlePhaseInput,
): RuntimeBattlePhase {
  if (input.phase === 'idle') return 'Idle';
  if (input.phase === 'defeat') return 'Defeat';
  if (input.phase === 'victory') {
    return input.victoryAwaitExitMarch ? 'VictoryExit' : 'Respawn';
  }
  if (input.formationResetActive) return 'FormationReset';
  if (input.waveIntermissionActive) return 'WaveApproach';
  if (input.engaged) return 'Engaged';
  return 'PreEngage';
}
