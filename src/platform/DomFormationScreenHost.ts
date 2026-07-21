import { MetaMenuOverlay } from '../ui/MetaMenuOverlay.ts';
import type { MenuHost, MenuHostContext, MetaMenuInitialView } from './menuHost.ts';

export class DomFormationScreenHost implements MenuHost {
  private overlay: MetaMenuOverlay | null = null;
  private opened = false;

  constructor(private readonly context: MenuHostContext) {}

  open(initialView: MetaMenuInitialView = 'hub'): void {
    if (this.opened) {
      this.dismiss();
    }
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
        getPartySlotCombatModule: this.context.getPartySlotCombatModule,
        onPartySlotCombatModuleChanged:
          this.context.onPartySlotCombatModuleChanged,
        onClose: () => this.close(),
      },
      {
        presentation: 'formation-screen',
        initialView,
        isVerifyMode: this.context.isVerifyMode,
        getFormationReturnOptions: this.context.getFormationReturnOptions,
        getFormationAllowedClassIds: this.context.getFormationAllowedClassIds,
      },
    );
  }

  close(): void {
    if (!this.opened) return;
    this.dismiss();
    const nextScreen = this.context.resolveFormationCloseScreen?.() ?? 'battle';
    this.context.onScreenChange(nextScreen);
  }

  dismiss(): void {
    if (!this.opened) return;
    this.overlay?.destroy();
    this.overlay = null;
    this.opened = false;
  }

  isOpen(): boolean {
    return this.opened;
  }
}

/** @deprecated Use DomFormationScreenHost */
export { DomFormationScreenHost as DomModalMenuHost };
