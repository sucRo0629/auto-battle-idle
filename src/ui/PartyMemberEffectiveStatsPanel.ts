import '../styles/party-member-effective-stats.css';
import { clampElementToMountBounds } from './clampElementToMountBounds.ts';
import {
  bindGameUiOverlayClosed,
  setGameUiFragmentHidden,
  setGameUiOverlayOpen,
} from './gameUiOverlay.ts';
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
import { resolveHudPointerTooltipAlignEnd } from './resolveHudPointerTooltipAlignEnd.ts';

export interface PartyMemberEffectiveStatsPanelData {
  displayName: string;
  iconKey: string;
  ally: CombatantSnapshot;
  attackSpeedTier: AttackSpeedTier;
  /**
   * R9.5b: CombatModule 兵科の攻撃間隔（秒）。指定時は tier「攻撃速度」の代わりに
   * 秒単位の「攻撃間隔」を表示する。legacy 兵科は未指定。
   */
  attackIntervalSec?: number;
}

export interface PartyMemberEffectiveStatsPointer {
  clientX: number;
  clientY: number;
}

export interface PartyMemberEffectiveStatsPanelOptions {
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  frameMount?: HTMLElement;
}

/** Offset from cursor so the panel clears the pointer on small HUD hits. */
const POINTER_ANCHOR_GAP_PX = 12;

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
  private pointerAnchor: PartyMemberEffectiveStatsPointer | null = null;

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
    bindGameUiOverlayClosed(this.root);
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

  attachToSlot(slotElement: HTMLElement | null): void {
    this.anchoredSlot = slotElement;
    if (this.visible) {
      this.reposition();
    }
  }

  setPointerAnchor(pointer: PartyMemberEffectiveStatsPointer | null): void {
    this.pointerAnchor = pointer;
  }

  show(data: PartyMemberEffectiveStatsPanelData): void {
    this.visible = true;
    setGameUiOverlayOpen(this.root, true);
    if (this.frameMount) {
      this.frameMount.appendChild(this.root);
    }
    this.render(data);
    this.reposition();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    setGameUiOverlayOpen(this.root, false);
    this.anchoredSlot = null;
    this.pointerAnchor = null;
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
    if (!this.visible || !this.frameMount) return;

    if (this.pointerAnchor) {
      this.repositionNearPointer();
      return;
    }

    if (!this.anchoredSlot) return;

    const frame = this.frameMount.getBoundingClientRect();
    const slot = this.anchoredSlot.getBoundingClientRect();
    const scale = this.readMountCoordinateScale();
    const slotCenterLocalX =
      ((slot.left + slot.right) / 2 - frame.left) / scale;
    const alignEnd = resolveHudPointerTooltipAlignEnd(
      slotCenterLocalX,
      this.frameMount.clientWidth || this.frameMount.offsetWidth,
    );

    if (alignEnd) {
      this.root.style.left = `${(slot.right - frame.left) / scale}px`;
      this.root.classList.add('party-member-effective-stats--align-end');
    } else {
      this.root.style.left = `${(slot.left - frame.left) / scale}px`;
      this.root.classList.remove('party-member-effective-stats--align-end');
    }
    this.root.style.top = `${(slot.top - frame.top) / scale}px`;
    this.root.classList.toggle('party-member-effective-stats--slot-above', true);
    clampElementToMountBounds(this.root, this.frameMount);
  }

  private readMountCoordinateScale(): number {
    if (!this.frameMount) return 1;
    const frame = this.frameMount.getBoundingClientRect();
    const localWidth = this.frameMount.clientWidth || this.frameMount.offsetWidth;
    if (localWidth <= 0) return 1;
    return frame.width / localWidth;
  }

  private repositionNearPointer(): void {
    if (!this.frameMount || !this.pointerAnchor) return;

    const frame = this.frameMount.getBoundingClientRect();
    const scale = this.readMountCoordinateScale();
    const mountWidth =
      this.frameMount.clientWidth || this.frameMount.offsetWidth;
    const localX = (this.pointerAnchor.clientX - frame.left) / scale;
    const localY = (this.pointerAnchor.clientY - frame.top) / scale;

    this.root.classList.remove('party-member-effective-stats--slot-above');

    // Measure with a provisional placement so offsetWidth / offsetHeight are valid.
    this.root.style.left = `${localX + POINTER_ANCHOR_GAP_PX}px`;
    this.root.style.top = `${localY + POINTER_ANCHOR_GAP_PX}px`;
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const alignEnd = resolveHudPointerTooltipAlignEnd(
      localX,
      mountWidth,
      width,
      POINTER_ANCHOR_GAP_PX,
    );
    this.root.classList.toggle(
      'party-member-effective-stats--align-end',
      alignEnd,
    );

    const left = alignEnd
      ? localX - width - POINTER_ANCHOR_GAP_PX
      : localX + POINTER_ANCHOR_GAP_PX;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${localY - height - POINTER_ANCHOR_GAP_PX}px`;

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
      data.attackIntervalSec,
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
      setGameUiFragmentHidden(this.iconImg, false);
      this.iconWrap.style.backgroundColor = '';
      return;
    }

    setGameUiFragmentHidden(this.iconImg, true);
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
