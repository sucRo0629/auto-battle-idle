export const DEBUG_LOOP_STAGE_STORAGE_KEY = 'auto-battle-idle:debug-loop-stage';
export const DEBUG_LOOP_WAVE_STORAGE_KEY = 'auto-battle-idle:debug-loop-wave';

export function getDebugLoopStageId(): string | null {
  try {
    const raw = localStorage.getItem(DEBUG_LOOP_STAGE_STORAGE_KEY);
    if (raw === null || raw === '') return null;
    return raw;
  } catch {
    return null;
  }
}

export function setDebugLoopStageId(stageId: string | null): void {
  try {
    if (stageId === null || stageId === '') {
      localStorage.removeItem(DEBUG_LOOP_STAGE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DEBUG_LOOP_STAGE_STORAGE_KEY, stageId);
  } catch {
    // ignore quota errors
  }
}

/** null = 全 Wave 周回、数値 = 0 始まりの Wave インデックス */
export function getDebugLoopWaveIndex(): number | null {
  try {
    const raw = localStorage.getItem(DEBUG_LOOP_WAVE_STORAGE_KEY);
    if (raw === null || raw === '') return null;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setDebugLoopWaveIndex(waveIndex: number | null): void {
  try {
    if (waveIndex === null) {
      localStorage.removeItem(DEBUG_LOOP_WAVE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DEBUG_LOOP_WAVE_STORAGE_KEY, String(waveIndex));
  } catch {
    // ignore quota errors
  }
}
