import type { GameSession } from '../game/GameSession.ts';

export function bindElectronBattle(session: GameSession): void {
  if (!window.battleElectronAPI) return;

  window.__getPartySnapshot = () =>
    structuredClone(session.getSaveState().party);
}
