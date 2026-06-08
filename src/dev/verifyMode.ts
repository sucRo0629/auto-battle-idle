export const VERIFY_MODE_STORAGE_KEY = 'auto-battle-idle:verify-mode';
export const RELEASE_PARTY_ID = 'demo';

export function isVerifyModeEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VERIFY_MODE_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function setVerifyModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VERIFY_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // ignore quota errors
  }
}

export function partyIdForVerifyMode(_verifyMode: boolean): string {
  return RELEASE_PARTY_ID;
}

export function saveStorageKey(verifyMode: boolean): string {
  return verifyMode
    ? 'auto-battle-idle:save:verify'
    : 'auto-battle-idle:save:release';
}
