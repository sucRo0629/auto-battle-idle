import { describe, expect, it } from "vitest";
import {
  BattleXDebugReplayBuffer,
  BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY,
  buildBattleXDebugReplayFrame,
} from "./battleXDebugReplayBuffer.ts";
import type { BattleSnapshot } from "./types.ts";

function makeSnapshot(
  overrides: Partial<BattleSnapshot> = {},
): BattleSnapshot {
  return {
    phase: "running",
    runtimePhase: "Engaged",
    engaged: true,
    waveIndex: 0,
    waveCount: 3,
    worldOffsetX: 0,
    waveAnnouncementActive: false,
    waveAnnouncementElapsedMs: 0,
    partyDeployActive: false,
    partyDeploySettled: true,
    formationResetActive: false,
    alliesOffScreen: false,
    victoryUseTimerFade: false,
    victoryAwaitExitMarch: false,
    awaitingNextWave: false,
    allyRangePassiveBands: [],
    players: [],
    allies: [],
    enemies: [],
    ...overrides,
  };
}

describe("battleX debug replay buffer", () => {
  it("builds a replay frame from debug tick metadata", () => {
    const frame = buildBattleXDebugReplayFrame(
      makeSnapshot({
        battleXDebugTickMeta: { tickIndex: 12, battleTimeSec: 0.6 },
        battleXDebugTickTrace: [
          {
            unitId: "a1",
            unitName: "Ally",
            isEnemy: false,
            phase: "running",
            runtimePhase: "Engaged",
            reason: "approach",
            beforeX: 10,
            afterX: 14,
            deltaX: 4,
            battleTimeSec: 0.6,
            tickIndex: 12,
            warning: false,
          },
        ],
      }),
    );

    expect(frame).toMatchObject({
      tickIndex: 12,
      battleTimeSec: 0.6,
      waveIndex: 0,
      hasDelta: true,
      hasWarning: false,
    });
    expect(frame?.snapshot.battleXDebugTickMeta).toBeUndefined();
    expect(frame?.traceEntries).toHaveLength(1);
  });

  it("stores frames in a ring buffer and clears on wave change", () => {
    const buffer = new BattleXDebugReplayBuffer();

    for (let i = 0; i < 5; i += 1) {
      buffer.push({
        tickIndex: i,
        battleTimeSec: i * 0.05,
        waveIndex: 0,
        runtimePhase: "Engaged",
        phase: "running",
        snapshot: makeSnapshot(),
        traceEntries: [],
        hasWarning: false,
        hasDelta: false,
      });
    }

    expect(buffer.size).toBe(5);
    expect(buffer.getFrame(0)?.tickIndex).toBe(0);
    expect(buffer.getFrame(4)?.tickIndex).toBe(4);

    buffer.push({
      tickIndex: 99,
      battleTimeSec: 4.95,
      waveIndex: 1,
      runtimePhase: "PartyDeploy",
      phase: "running",
      snapshot: makeSnapshot({ waveIndex: 1 }),
      traceEntries: [],
      hasWarning: false,
      hasDelta: false,
    });

    expect(buffer.size).toBe(1);
    expect(buffer.getFrame(0)?.tickIndex).toBe(99);
  });

  it("wraps when capacity is exceeded", () => {
    const buffer = new BattleXDebugReplayBuffer();

    for (let i = 0; i < BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY + 2; i += 1) {
      buffer.push({
        tickIndex: i,
        battleTimeSec: i * 0.05,
        waveIndex: 0,
        runtimePhase: "Engaged",
        phase: "running",
        snapshot: makeSnapshot(),
        traceEntries: [],
        hasWarning: i % 17 === 0,
        hasDelta: false,
      });
    }

    expect(buffer.size).toBe(BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY);
    expect(buffer.getFrame(0)?.tickIndex).toBe(2);
    expect(buffer.getFrame(buffer.latestIndex)?.tickIndex).toBe(
      BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY + 1,
    );
  });

  it("finds warning indices relative to the current selection", () => {
    const buffer = new BattleXDebugReplayBuffer();
    for (let i = 0; i < 10; i += 1) {
      buffer.push({
        tickIndex: i,
        battleTimeSec: i * 0.05,
        waveIndex: 0,
        runtimePhase: "Engaged",
        phase: "running",
        snapshot: makeSnapshot(),
        traceEntries: [],
        hasWarning: i === 2 || i === 7,
        hasDelta: false,
      });
    }

    expect(buffer.collectWarningIndices()).toEqual([2, 7]);
    expect(buffer.findNearestWarningIndex(5, -1)).toBe(2);
    expect(buffer.findNearestWarningIndex(5, 1)).toBe(7);
    expect(buffer.findNearestWarningIndex(8, 1)).toBe(2);
  });
});
