import { MetaMenuOverlay } from '../ui/MetaMenuOverlay.ts';
import type { MenuHost, MenuHostContext, MetaMenuInitialView } from './menuHost.ts';

export class DomModalMenuHost implements MenuHost {
  private overlay: MetaMenuOverlay | null = null;
  private opened = false;

  constructor(private readonly context: MenuHostContext) {}

  open(initialView: MetaMenuInitialView = 'hub'): void {
    if (this.opened) return;
    this.opened = true;
    this.context.onOpenChange(true);
    this.overlay = new MetaMenuOverlay(
      document.body,
      this.context.gameData,
      this.context.getParty,
      this.context.getUnlockedClassIds,
      {
        onBuildChanged: (partyIndex, build) => {
          this.context.onBuildChanged(partyIndex, build);
        },
        onPartySlotChanged: (slotIndex, member) => {
          this.context.onPartySlotChanged(slotIndex, member);
        },
        onClose: () => this.close(),
      },
      { presentation: 'modal', initialView },
    );
  }

  close(): void {
    if (!this.opened) return;
    this.overlay?.destroy();
    this.overlay = null;
    this.opened = false;
    this.context.onOpenChange(false);
  }

  isOpen(): boolean {
    return this.opened;
  }
}
