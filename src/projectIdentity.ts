/** 開発名（UI・ドキュメント表示用） */
export const PROJECT_DISPLAY_NAME = 'Hensei Only';

/** npm / localStorage 等の slug */
export const PROJECT_SLUG = 'hensei-only';

/** 旧リポジトリ名。localStorage 移行のみに使用 */
export const LEGACY_PROJECT_SLUG = 'auto-battle-idle';

const LEGACY_STORAGE_SUFFIXES = [
  'save',
  'save:verify',
  'save:release',
  'verify-mode',
  'debug-loop-stage',
  'debug-loop-wave',
  'editor-session',
] as const;

export function projectStorageKey(suffix: string): string {
  return `${PROJECT_SLUG}:${suffix}`;
}

function legacyStorageKey(suffix: string): string {
  return `${LEGACY_PROJECT_SLUG}:${suffix}`;
}

function migrateLegacyStorageKey(suffix: string): void {
  const newKey = projectStorageKey(suffix);
  const legacyKey = legacyStorageKey(suffix);
  try {
    if (localStorage.getItem(newKey) !== null) return;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy === null) return;
    localStorage.setItem(newKey, legacy);
    localStorage.removeItem(legacyKey);
  } catch {
    // ignore quota / privacy errors
  }
}

/** 旧 `auto-battle-idle:*` キーを新 slug へ一度だけ移行する */
export function migrateLegacyProjectStorage(): void {
  for (const suffix of LEGACY_STORAGE_SUFFIXES) {
    migrateLegacyStorageKey(suffix);
  }
}
