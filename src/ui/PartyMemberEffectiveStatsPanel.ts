import '../styles/party-member-effective-stats.css';
import { clampElementToMountBounds } from './clampElementToMountBounds.ts';
import type { AttackSpeedTier, CombatantSnapshot } from '../battle/types.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
} from '../render/battleHudTheme.ts';
import {
  buildCombatantBattleStatRows,
  type CombatantBattleStatRow,
} from './combatantBattleStatsDisplay.ts';

export interface PartyMemberEffectiveStatsPanelData {
  displayName: string;
  iconKey: string;
  ally: CombatantSnapshot;
  attackSpeedTier: AttackSpeedTier;
}

export interface PartyMemberEffectiveStatsPanelOptions {
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  frameMount?: HTMLElement;
}

export class PartyMemberEffectiveStatsPanel {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly iconWrap: HTMLElement;
  private readonly iconImg: HTMLImageElement;
  private readonly gridEl: HTMLElement;
  private readonly themeHost: HTMLElement;
  private readonly storageHost: HTMLElement;
  private readonly frameMount: HTMLElement | null;
  private visible = false;
  private anchoredSlot: HTMLElement | null = null;
  private anchoredSlotIndex: number | null = null;

  constructor(
    storageHost: HTMLElement,
    themeHost: HTMLElement,
    options: PartyMemberEffectiveStatsPanelOptions = {},
  ) {
    this.themeHost = themeHost;
    this.storageHost = storageHost;
    this.frameMount = options.frameMount ?? null;

    this.root = document.createElement('aside');
    this.root.className = 'party-member-effective-stats';
    this.root.hidden = true;
    this.root.setAttribute('role', 'tooltip');
    this.root.setAttribute('aria-label', '戦闘中ステータス');
    this.root.addEventListener('mouseenter', () => {
      options.onHoverStart?.();
    });
    this.root.addEventListener('mouseleave', () => {
      options.onHoverEnd?.();
    });

    const header = document.createElement('div');
    header.className = 'party-member-effective-stats-header';

    this.iconWrap = document.createElement('span');
    this.iconWrap.className =
      'party-member-effective-stats-icon pixel-icon-frame pixel-icon-frame--24';

    this.iconImg = document.createElement('img');
    this.iconImg.className =
      'party-member-effective-stats-icon-img pixel-icon-img pixel-icon-img--24';
    this.iconImg.width = 24;
    this.iconImg.height = 24;
    this.iconImg.alt = '';
    this.iconImg.setAttribute('aria-hidden', 'true');
    this.iconWrap.appendChild(this.iconImg);

    this.titleEl = document.createElement('span');
    this.titleEl.className = 'party-member-effective-stats-title';

    header.append(this.iconWrap, this.titleEl);

    this.gridEl = document.createElement('dl');
    this.gridEl.className = 'party-member-effective-stats-grid';

    this.root.append(header, this.gridEl);
    if (this.frameMount) {
      this.frameMount.appendChild(this.root);
    } else {
      this.storageHost.appendChild(this.root);
    }
  }

  attachToSlot(slotElement: HTMLElement | null, slotIndex?: number): void {
    this.anchoredSlot = slotElement;
    this.anchoredSlotIndex = slotIndex ?? null;
    this.root.classList.toggle(
      'party-member-effective-stats--align-end',
      slotIndex !== undefined && slotIndex >= 2,
    );
    if (this.visible) {
      this.reposition();
    }
  }

  show(data: PartyMemberEffectiveStatsPanelData): void {
    this.visible = true;
    this.root.hidden = false;
    if (this.frameMount) {
      this.frameMount.appendChild(this.root);
    }
    this.render(data);
    this.reposition();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.hidden = true;
    this.anchoredSlot = null;
    this.anchoredSlotIndex = null;
  }

  isVisible(): boolean {
    return this.visible;
  }

  update(data: PartyMemberEffectiveStatsPanelData): void {
    if (!this.visible) return;
    this.render(data);
    this.reposition();
  }

  reposition(): void {
    if (!this.visible || !this.anchoredSlot || !this.frameMount) return;

    const frame = this.frameMount.getBoundingClientRect();
    const slot = this.anchoredSlot.getBoundingClientRect();
    const alignEnd = (this.anchoredSlotIndex ?? 0) >= 2;

    if (alignEnd) {
      this.root.style.left = `${slot.right - frame.left}px`;
    } else {
      this.root.style.left = `${slot.left - frame.left}px`;
    }
    this.root.style.top = `${slot.top - frame.top}px`;
    clampElementToMountBounds(this.root, this.frameMount);
  }

  destroy(): void {
    this.root.remove();
  }

  private render(data: PartyMemberEffectiveStatsPanelData): void {
    this.titleEl.textContent = data.displayName;
    this.syncIcon(data.iconKey);

    const rows = buildCombatantBattleStatRows(
      data.ally,
      data.attackSpeedTier,
    );
    this.gridEl.replaceChildren();
    for (const row of rows) {
      this.gridEl.appendChild(this.createRowElements(row));
    }
  }

  private syncIcon(iconKey: string): void {
    const theme = readBattleHudTheme(this.themeHost);
    const iconUrl = getClassIconUrl(iconKey);
    this.iconWrap.classList.remove('party-member-effective-stats-icon--empty');
    if (iconUrl) {
      this.iconImg.src = iconUrl;
      this.iconImg.hidden = false;
      this.iconWrap.style.backgroundColor = '';
      return;
    }

    this.iconImg.hidden = true;
    this.iconImg.removeAttribute('src');
    this.iconWrap.classList.add('party-member-effective-stats-icon--empty');
    this.iconWrap.style.backgroundColor = resolveClassIconPlaceholderColor(
      iconKey,
      theme,
    );
  }

  private createRowElements(row: CombatantBattleStatRow): DocumentFragment {
    const fragment = document.createDocumentFragment();

    const dt = document.createElement('dt');
    dt.className = 'party-member-effective-stats-label';
    if (row.latinLabel) {
      dt.classList.add('party-member-effective-stats-label--latin');
    }
    dt.textContent = row.label;

    const valueDd = document.createElement('dd');
    valueDd.className = 'party-member-effective-stats-value';
    valueDd.textContent = row.valueText;

    const deltaDd = document.createElement('dd');
    deltaDd.className = 'party-member-effective-stats-delta';
    if (row.deltaText && row.deltaKind) {
      deltaDd.textContent = row.deltaText;
      deltaDd.classList.add(
        row.deltaKind === 'up'
          ? 'party-member-effective-stats-delta--up'
          : 'party-member-effective-stats-delta--down',
      );
    }

    fragment.append(dt, valueDd, deltaDd);
    return fragment;
  }
}
