import type { GameSession } from '../game/GameSession.ts';

export function bindElectronBattle(session: GameSession): void {
  if (!window.battleElectronAPI) return;

  window.__getMenuSnapshot = () => {
    const save = session.getSaveState();
    return {
      party: structuredClone(save.party),
      unlockedClassIds: structuredClone(save.unlockedClassIds),
    };
  };
}
