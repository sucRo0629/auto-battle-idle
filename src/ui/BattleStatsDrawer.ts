import '../styles/battle-stats-drawer.css';
import { subscribeLocaleChange } from '../i18n/locale.ts';
import { t } from '../i18n/t.ts';

export interface BattleStatsDrawerCallbacks {
  onOpenChange: (open: boolean) => void;
}

export interface BattleStatsDrawerOptions {
  defaultOpen?: boolean;
}

export class BattleStatsDrawer {
  private readonly root: HTMLElement;
  private readonly tabButton: HTMLButtonElement;
  private readonly tabIcon: HTMLElement;
  private readonly onEscapeKey: (event: KeyboardEvent) => void;
  private readonly unsubscribeLocale: () => void;
  private open: boolean;
  private mounted = false;

  constructor(
    private readonly callbacks: BattleStatsDrawerCallbacks,
    options: BattleStatsDrawerOptions = {},
  ) {
    this.open = options.defaultOpen ?? true;
    this.root = document.createElement('div');
    this.root.className = 'party-hud-drawer';

    this.tabButton = document.createElement('button');
    this.tabButton.type = 'button';
    this.tabButton.className = 'party-hud-drawer-tab';
    this.tabButton.setAttribute('aria-expanded', 'false');
    this.tabButton.addEventListener('click', () => {
      this.toggle();
    });

    this.tabIcon = document.createElement('span');
    this.tabIcon.className = 'party-hud-drawer-tab-chevron';
    this.tabIcon.setAttribute('aria-hidden', 'true');
    this.tabButton.appendChild(this.tabIcon);

    this.root.appendChild(this.tabButton);

    this.onEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !this.open) return;
      event.preventDefault();
      this.setOpen(false);
    };

    this.unsubscribeLocale = subscribeLocaleChange(() => {
      this.refreshTabAriaLabel();
    });
    this.refreshTabAriaLabel();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.mounted = true;
    this.applyOpenState(this.open, true);
  }

  isOpen(): boolean {
    return this.open;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.applyOpenState(open, true);
  }

  private refreshTabAriaLabel(): void {
    this.tabButton.setAttribute(
      'aria-label',
      this.open ? t('battle.statsClose') : t('battle.statsOpen'),
    );
  }

  private applyOpenState(open: boolean, notify: boolean): void {
    this.open = open;
    this.root.classList.toggle('party-hud-drawer--open', open);
    this.tabButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.refreshTabAriaLabel();
    this.tabIcon.classList.toggle("party-hud-drawer-tab-chevron--open", open);

    if (this.mounted) {
      if (open) {
        document.addEventListener('keydown', this.onEscapeKey);
      } else {
        document.removeEventListener('keydown', this.onEscapeKey);
      }
    }

    if (notify) {
      this.callbacks.onOpenChange(open);
    }
  }

  setDisabled(disabled: boolean): void {
    this.tabButton.disabled = disabled;
  }

  destroy(): void {
    this.unsubscribeLocale();
    document.removeEventListener('keydown', this.onEscapeKey);
    this.root.remove();
  }
}
