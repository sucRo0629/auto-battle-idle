export type ViewMode = 'full' | 'ambient';

export function getViewMode(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'ambient' ? 'ambient' : 'full';
}

export function applyViewMode(mode: ViewMode): void {
  document.documentElement.dataset.viewMode = mode;
}
