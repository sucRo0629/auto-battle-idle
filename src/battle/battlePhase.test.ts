import { describe, expect, it } from 'vitest';
import { resolveRuntimeBattlePhase } from './battlePhase.ts';

describe('resolveRuntimeBattlePhase', () => {
  it('maps running combat states to field FSM phases', () => {
    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        waveAnnouncementActive: true,
        partyDeployActive: false,
        postCombatSettling: false,
        waveExitMarchActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('WaveAnnouncement');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        waveAnnouncementActive: false,
        partyDeployActive: true,
        postCombatSettling: false,
        waveExitMarchActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('PartyDeploy');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: true,
        waveAnnouncementActive: false,
        partyDeployActive: false,
        postCombatSettling: false,
        waveExitMarchActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('Engaged');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        waveAnnouncementActive: false,
        partyDeployActive: false,
        postCombatSettling: true,
        waveExitMarchActive: false,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('PostCombatSettle');

    expect(
      resolveRuntimeBattlePhase({
        phase: 'running',
        engaged: false,
        waveAnnouncementActive: false,
        partyDeployActive: false,
        postCombatSettling: false,
        waveExitMarchActive: true,
        victoryAwaitExitMarch: false,
      }),
    ).toBe('VictoryExit');
  });
});
