import './style.css';
import { loadGameData } from './battle/data/loadGameData.ts';
import type { ClassId, PartySlotState } from './battle/types.ts';
import { isElectronMenu } from './platform/electronApi.ts';
import { MetaMenuOverlay } from './ui/MetaMenuOverlay.ts';

const app = document.querySelector<HTMLDivElement>('#menu-app');
if (!app) {
  throw new Error('#menu-app not found');
}

const gameData = loadGameData();
let party: PartySlotState[] = [];
let unlockedClassIds: ClassId[] = [];
let overlay: MetaMenuOverlay | null = null;

function mountMenu(): void {
  if (!app) return;
  overlay?.destroy();
  overlay = new MetaMenuOverlay(
    app,
    gameData,
    () => party,
    () => unlockedClassIds,
    {
      onBuildChanged: (partyIndex, build) => {
        window.menuElectronAPI?.applyBuildChange(partyIndex, build);
      },
      onPartySlotChanged: (slotIndex, member) => {
        party[slotIndex] = member ? structuredClone(member) : null;
        window.menuElectronAPI?.applyPartySlotChange(slotIndex, member);
      },
      onClose: () => {
        window.menuElectronAPI?.close();
      },
    },
    {
      presentation: 'window',
      initialView: menuInitialView,
    },
  );
}

let menuInitialView: 'hub' | 'party' = 'hub';

if (isElectronMenu()) {
  window.menuElectronAPI?.onInit((payload) => {
    party = payload.party;
    unlockedClassIds = payload.unlockedClassIds;
    menuInitialView = payload.initialView ?? 'hub';
    mountMenu();
  });
} else {
  document.body.innerHTML =
    '<p style="padding:16px;color:#e8e8e8;">メニューウィンドウは Electron 起動時に使用します。</p>';
}
