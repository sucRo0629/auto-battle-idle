import { projectStorageKey } from '../projectIdentity.ts';

export const BATTLE_X_DEBUG_DISPLAY_STORAGE_KEY = projectStorageKey(
  'battle-x-debug-display',
);

export function isBattleXDebugDisplayEnabled(): boolean {
  try {
    const raw = localStorage.getItem(BATTLE_X_DEBUG_DISPLAY_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setBattleXDebugDisplayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BATTLE_X_DEBUG_DISPLAY_STORAGE_KEY, String(enabled));
  } catch {
    // ignore quota errors
  }
}
