import { projectStorageKey } from '../projectIdentity.ts';

export const VERIFY_MODE_STORAGE_KEY = projectStorageKey('verify-mode');
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
    ? projectStorageKey('save:verify')
    : projectStorageKey('save:release');
}
