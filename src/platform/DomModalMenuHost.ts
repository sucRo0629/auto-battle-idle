import { MetaMenuOverlay } from '../ui/MetaMenuOverlay.ts';
import type { MenuHost, MenuHostContext } from './menuHost.ts';

export class DomModalMenuHost implements MenuHost {
  private overlay: MetaMenuOverlay | null = null;
  private opened = false;

  constructor(private readonly context: MenuHostContext) {}

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.context.onOpenChange(true);
    this.overlay = new MetaMenuOverlay(
      document.body,
      this.context.gameData,
      this.context.getParty,
      {
        onBuildChanged: (partyIndex, build) => {
          this.context.onBuildChanged(partyIndex, build);
        },
        onClose: () => this.close(),
      },
      'modal',
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
