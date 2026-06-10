import type { BattlePhase } from './types.ts';

/** 戦闘フィールド FSM（battle-field.md §4.1） */
export type RuntimeBattlePhase =
  | 'WaveAnnouncement'
  | 'PartyDeploy'
  | 'Engaged'
  | 'PostCombatSettle'
  | 'VictoryExit'
  | 'Defeat'
  | 'Respawn'
  | 'Idle';

export interface RuntimeBattlePhaseInput {
  phase: BattlePhase;
  engaged: boolean;
  waveAnnouncementActive: boolean;
  partyDeployActive: boolean;
  postCombatSettling: boolean;
  waveExitMarchActive: boolean;
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
  if (input.postCombatSettling) return 'PostCombatSettle';
  if (input.waveExitMarchActive) return 'VictoryExit';
  if (input.waveAnnouncementActive) return 'WaveAnnouncement';
  if (input.partyDeployActive) return 'PartyDeploy';
  if (input.engaged) return 'Engaged';
  return 'PartyDeploy';
}
