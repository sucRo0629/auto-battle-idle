import { MetaMenuOverlay } from '../ui/MetaMenuOverlay.ts';
import type { MenuHost, MenuHostContext, MetaMenuInitialView } from './menuHost.ts';

export class DomFormationScreenHost implements MenuHost {
  private overlay: MetaMenuOverlay | null = null;
  private opened = false;

  constructor(private readonly context: MenuHostContext) {}

  open(initialView: MetaMenuInitialView = 'hub'): void {
    if (this.opened) return;
    this.opened = true;
    this.context.onScreenChange('formation');
    this.overlay = new MetaMenuOverlay(
      this.context.formationHost,
      this.context.gameData,
      this.context.levelCurves,
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
      {
        presentation: 'formation-screen',
        initialView,
        isVerifyMode: this.context.isVerifyMode,
        getFormationReturnOptions: this.context.getFormationReturnOptions,
      },
    );
  }

  close(): void {
    if (!this.opened) return;
    this.overlay?.destroy();
    this.overlay = null;
    this.opened = false;
    const nextScreen = this.context.resolveFormationCloseScreen?.() ?? 'battle';
    this.context.onScreenChange(nextScreen);
  }

  isOpen(): boolean {
    return this.opened;
  }
}

/** @deprecated Use DomFormationScreenHost */
export { DomFormationScreenHost as DomModalMenuHost };
