import type { MenuHost, MenuHostContext, MetaMenuInitialView } from './menuHost.ts';

export class ElectronBattleMenuHost implements MenuHost {
  private opened = false;

  constructor(private readonly context: MenuHostContext) {
    const api = window.battleElectronAPI;
    if (!api) return;

    api.onMenuBuildChanged((partyIndex, build) => {
      this.context.onBuildChanged(partyIndex, build);
    });

    api.onMenuPartySlotChanged((slotIndex, member) => {
      this.context.onPartySlotChanged(slotIndex, member);
    });

    api.onMenuClosed(() => {
      this.close();
    });
  }

  open(initialView: MetaMenuInitialView = 'hub'): void {
    if (this.opened) {
      this.dismiss();
    }
    const api = window.battleElectronAPI;
    if (!api) return;

    this.opened = true;
    this.context.onScreenChange('formation');
    void api.openMenu(initialView);
  }

  close(): void {
    if (!this.opened) return;
    this.dismiss();
    this.context.onScreenChange('battle');
  }

  dismiss(): void {
    if (!this.opened) return;
    this.opened = false;
  }

  isOpen(): boolean {
    return this.opened;
  }
}
