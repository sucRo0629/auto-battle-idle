import type {
  BattleSnapshot,
  BattleXDebugTraceEntry,
  RuntimeBattlePhase,
} from "./types.ts";

export const BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY = 3600;

export interface BattleXDebugReplayFrame {
  tickIndex: number;
  battleTimeSec: number;
  waveIndex: number;
  runtimePhase: RuntimeBattlePhase;
  phase: string;
  snapshot: BattleSnapshot;
  traceEntries: BattleXDebugTraceEntry[];
  hasWarning: boolean;
  hasDelta: boolean;
}

export interface BattleXDebugTickMeta {
  tickIndex: number;
  battleTimeSec: number;
}

export function buildBattleXDebugReplayFrame(
  snapshot: BattleSnapshot,
): BattleXDebugReplayFrame | null {
  const meta = snapshot.battleXDebugTickMeta;
  if (!meta) return null;

  const traceEntries = snapshot.battleXDebugTickTrace ?? [];
  const {
    battleXDebugTrace: _trace,
    battleXDebugTickTrace: _tickTrace,
    battleXDebugTickMeta: _meta,
    ...rest
  } = snapshot;

  return {
    tickIndex: meta.tickIndex,
    battleTimeSec: meta.battleTimeSec,
    waveIndex: snapshot.waveIndex,
    runtimePhase: snapshot.runtimePhase,
    phase: snapshot.phase,
    snapshot: structuredClone(rest) as BattleSnapshot,
    traceEntries: structuredClone(traceEntries),
    hasWarning: traceEntries.some((entry) => entry.warning),
    hasDelta: traceEntries.length > 0,
  };
}

export class BattleXDebugReplayBuffer {
  private frames: BattleXDebugReplayFrame[] = [];
  private start = 0;
  private count = 0;
  private trackedWaveIndex: number | null = null;

  get size(): number {
    return this.count;
  }

  get latestIndex(): number {
    return Math.max(0, this.count - 1);
  }

  clear(): void {
    this.frames = [];
    this.start = 0;
    this.count = 0;
    this.trackedWaveIndex = null;
  }

  push(frame: BattleXDebugReplayFrame): void {
    if (
      this.trackedWaveIndex !== null &&
      frame.waveIndex !== this.trackedWaveIndex
    ) {
      this.clear();
    }
    this.trackedWaveIndex = frame.waveIndex;

    if (this.count < BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY) {
      this.frames.push(frame);
      this.count += 1;
      return;
    }

    this.frames[this.start] = frame;
    this.start = (this.start + 1) % BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY;
  }

  getFrame(index: number): BattleXDebugReplayFrame | null {
    if (index < 0 || index >= this.count) return null;
    const slot = (this.start + index) % BATTLE_X_DEBUG_REPLAY_BUFFER_CAPACITY;
    return this.frames[slot] ?? null;
  }

  collectWarningIndices(): number[] {
    const indices: number[] = [];
    for (let index = 0; index < this.count; index += 1) {
      const frame = this.getFrame(index);
      if (frame?.hasWarning) {
        indices.push(index);
      }
    }
    return indices;
  }

  findNearestWarningIndex(
    fromIndex: number,
    direction: -1 | 1,
  ): number | null {
    const warnings = this.collectWarningIndices();
    if (warnings.length === 0) return null;

    if (direction < 0) {
      for (let i = warnings.length - 1; i >= 0; i -= 1) {
        if (warnings[i]! < fromIndex) return warnings[i]!;
      }
      return warnings[warnings.length - 1] ?? null;
    }

    for (const index of warnings) {
      if (index > fromIndex) return index;
    }
    return warnings[0] ?? null;
  }
}
