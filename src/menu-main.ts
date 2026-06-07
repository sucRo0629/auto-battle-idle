import './style.css';
import { loadGameData } from './battle/data/loadGameData.ts';
import type { PartyMemberState } from './battle/types.ts';
import { isElectronMenu } from './platform/electronApi.ts';
import { MetaMenuOverlay } from './ui/MetaMenuOverlay.ts';

const app = document.querySelector<HTMLDivElement>('#menu-app');
if (!app) {
  throw new Error('#menu-app not found');
}

const gameData = loadGameData();
let party: PartyMemberState[] = [];
let overlay: MetaMenuOverlay | null = null;

function mountMenu(): void {
  if (!app) return;
  overlay?.destroy();
  overlay = new MetaMenuOverlay(
    app,
    gameData,
    () => party,
    {
      onBuildChanged: (partyIndex, build) => {
        window.menuElectronAPI?.applyBuildChange(partyIndex, build);
      },
      onClose: () => {
        window.menuElectronAPI?.close();
      },
    },
    'window',
  );
}

if (isElectronMenu()) {
  window.menuElectronAPI?.onInit((initialParty) => {
    party = initialParty;
    mountMenu();
  });
} else {
  document.body.innerHTML =
    '<p style="padding:16px;color:#e8e8e8;">メニューウィンドウは Electron 起動時に使用します。</p>';
}
