import {
  collectStatusEffectBadgeDisplays,
  PARTY_HUD_COMPACT_STATUS_VISIBLE_COUNT,
  selectCompactStatusBadges,
} from '../battle/statusEffectDisplay.ts';
import { MAX_ACTIVE_SLOTS } from '../progression/skillBuild.ts';
import { layoutHpBarBarrier } from '../render/hpBarBarrierLayout.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import { onStatusIconsReady } from '../render/StatusIconRegistry.ts';
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from '../render/battleHudTheme.ts';
import {
  drawCompactStatusBadgeRow,
  measureCompactStatusBadgeRow,
  PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusBadgeOutlinePad,
} from '../render/statusBadgeRenderer.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';
import { resolveRecastFillView } from './partyHudRecast.ts';
import { syncPartyHudStatusBadgeHits, buildPartyHudStatusBadgeHitSignature } from './partyHudStatusBadgeHits.ts';

interface RecastCellElements {
  cell: HTMLElement;
  fill: HTMLElement;
  stockPips: HTMLElement;
}

interface SlotElements {
  root: HTMLElement;
  slotIndex: number;
  label: HTMLElement;
  bodyRow: HTMLElement;
  iconWrap: HTMLElement;
  icon: HTMLImageElement;
  hpFill: HTMLElement;
  barrierLayer: HTMLElement;
  statusBadgeWrap: HTMLElement;
  statusCanvas: HTMLCanvasElement;
  statusBadgeHitLayer: HTMLElement;
  statusBadgeHitSignature: string | null;
  statusBadgeRenderSignature: string | null;
  hpBarSignature: string | null;
  recastCells: RecastCellElements[];
}

export interface PartyHudPanelOptions {
  onMemberStatsHoverStart?: (slotIndex: number) => void;
  onMemberStatsHoverEnd?: () => void;
}

export class PartyHudPanel {
  private root!: HTMLElement;
  private readonly slots: SlotElements[] = [];
  private theme!: BattleHudTheme;
  private lastEntries: (PartyHudEntry | null)[] = [];
  private readonly unsubscribeStatusIconsReady: () => void;

  constructor(
    private readonly themeHost: HTMLElement,
    private readonly options: PartyHudPanelOptions = {},
  ) {
    this.unsubscribeStatusIconsReady = onStatusIconsReady(() => {
      if (this.lastEntries.length > 0) {
        this.update(this.lastEntries);
      }
    });
  }

  mount(parent: HTMLElement): void {
    this.theme = readBattleHudTheme(this.themeHost);
    const root = document.createElement('div');
    this.root = root;
    root.className = 'party-hud-panel';

    for (let i = 0; i < 4; i++) {
      this.slots.push(this.createSlot(i));
      root.appendChild(this.slots[i].root);
    }

    parent.appendChild(root);
  }

  update(entries: (PartyHudEntry | null)[]): void {
    this.lastEntries = entries;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const entry = entries[i];
      if (!entry) {
        slot.root.hidden = true;
        continue;
      }
      slot.root.hidden = false;
      this.updateSlot(slot, entry);
    }
  }

  getSlotRoot(slotIndex: number): HTMLElement | null {
    return this.slots[slotIndex]?.root ?? null;
  }

  destroy(): void {
    this.unsubscribeStatusIconsReady();
    this.root.remove();
  }

  private createSlot(slotIndex: number): SlotElements {
    const root = document.createElement('div');
    root.className = 'party-hud-slot';

    const head = document.createElement('div');
    head.className = 'party-hud-head';
    root.appendChild(head);

    const label = document.createElement('div');
    label.className = 'party-hud-label';
    label.addEventListener('mouseenter', () => {
      this.options.onMemberStatsHoverStart?.(slotIndex);
    });
    label.addEventListener('mouseleave', () => {
      this.options.onMemberStatsHoverEnd?.();
    });
    head.appendChild(label);

    const statusBadgeWrap = document.createElement('div');
    statusBadgeWrap.className = 'party-hud-status-badges-wrap';
    head.appendChild(statusBadgeWrap);

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'party-hud-status-badges status-badge-canvas';
    statusBadgeWrap.appendChild(statusCanvas);

    const statusBadgeHitLayer = document.createElement('div');
    statusBadgeHitLayer.className = 'party-hud-status-badge-hits';
    statusBadgeWrap.appendChild(statusBadgeHitLayer);

    const bodyRow = document.createElement('div');
    bodyRow.className = 'party-hud-body-row';
    bodyRow.addEventListener('mouseenter', () => {
      this.options.onMemberStatsHoverStart?.(slotIndex);
    });
    bodyRow.addEventListener('mouseleave', () => {
      this.options.onMemberStatsHoverEnd?.();
    });
    root.appendChild(bodyRow);

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'party-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';
    bodyRow.appendChild(iconWrap);

    const icon = document.createElement('img');
    icon.className = 'party-hud-icon pixel-icon-img pixel-icon-img--24';
    const iconSize = this.theme.iconSize;
    icon.width = iconSize;
    icon.height = iconSize;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const bars = document.createElement('div');
    bars.className = 'party-hud-bars';
    bodyRow.appendChild(bars);

    const hpTrack = document.createElement('div');
    hpTrack.className = 'party-hud-hp-track';
    bars.appendChild(hpTrack);

    const hpFill = document.createElement('div');
    hpFill.className = 'party-hud-hp-fill';
    hpTrack.appendChild(hpFill);

    const barrierLayer = document.createElement('div');
    barrierLayer.className = 'party-hud-barrier-layer';
    hpTrack.appendChild(barrierLayer);

    const recastGrid = document.createElement('div');
    recastGrid.className = 'party-hud-recast-grid';
    bars.appendChild(recastGrid);

    const recastCells: RecastCellElements[] = [];
    for (let slot = 0; slot < MAX_ACTIVE_SLOTS; slot++) {
      const cell = document.createElement('div');
      cell.className = 'party-hud-recast-cell';

      const track = document.createElement('div');
      track.className = 'party-hud-recast-fill-track';
      const fill = document.createElement('div');
      fill.className = 'party-hud-recast-fill';
      track.appendChild(fill);
      cell.appendChild(track);

      const stockPips = document.createElement('div');
      stockPips.className = 'party-hud-recast-stock-pips';
      cell.appendChild(stockPips);

      recastGrid.appendChild(cell);
      recastCells.push({ cell, fill, stockPips });
    }

    return {
      root,
      slotIndex,
      label,
      bodyRow,
      iconWrap,
      icon,
      hpFill,
      barrierLayer,
      statusBadgeWrap,
      statusCanvas,
      statusBadgeHitLayer,
      statusBadgeHitSignature: null,
      statusBadgeRenderSignature: null,
      hpBarSignature: null,
      recastCells,
    };
  }

  private updateSlot(slot: SlotElements, entry: PartyHudEntry): void {
    const theme = this.theme;
    slot.root.classList.toggle('party-hud-slot--dead', !entry.isAlive);
    slot.label.textContent = entry.displayName;

    const iconUrl = getClassIconUrl(entry.iconKey);
    if (iconUrl) {
      slot.icon.src = iconUrl;
      slot.icon.style.backgroundColor = '';
    } else {
      slot.icon.removeAttribute('src');
      slot.icon.style.backgroundColor = resolveClassIconPlaceholderColor(
        entry.iconKey,
        theme,
      );
    }

    this.updateStatusBadges(slot, entry);
    this.updateHpBar(slot, entry);
    this.updateRecastGrid(slot, entry);
  }

  private updateHpBar(slot: SlotElements, entry: PartyHudEntry): void {
    const signature = `${entry.hp}|${entry.maxHp}|${entry.barrierHp}|${entry.isAlive}`;
    if (signature === slot.hpBarSignature) return;
    slot.hpBarSignature = signature;

    const layout = layoutHpBarBarrier(0, 100, entry.hp, entry.maxHp, entry.barrierHp);
    slot.hpFill.style.width = layout ? `${layout.hpWidth}%` : '0%';

    slot.barrierLayer.replaceChildren();
    if (!layout) return;

    for (const segment of layout.tier1) {
      const seg = document.createElement('div');
      seg.className = 'party-hud-barrier-seg';
      seg.style.left = `${segment.x}%`;
      seg.style.width = `${segment.width}%`;
      slot.barrierLayer.appendChild(seg);
    }

    if (entry.maxHp > 0 && entry.barrierHp > entry.maxHp) {
      const overflow = document.createElement('div');
      overflow.className = 'party-hud-barrier-overflow';
      overflow.style.width = `${((entry.barrierHp - entry.maxHp) / entry.maxHp) * 100}%`;
      slot.barrierLayer.appendChild(overflow);
    }
  }

  private updateStatusBadges(slot: SlotElements, entry: PartyHudEntry): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      reg: entry.reg,
    });
    const { visible, overflowCount } = selectCompactStatusBadges(badges, {
      visibleCount: PARTY_HUD_COMPACT_STATUS_VISIBLE_COUNT,
    });
    const canvas = slot.statusCanvas;
    const theme = this.theme;
    const scale = 1;
    const badgeLayoutConfig = PARTY_HUD_COMPACT_STATUS_BADGE_LAYOUT;

    const badgeLayout = measureCompactStatusBadgeRow(
      scale,
      PARTY_HUD_STATUS_BADGE_ICON_SIZE,
      theme.statusIconOutlineWidth,
      theme.statusBadgeOverlap,
      badgeLayoutConfig,
    );
    const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
    const canvasW = badgeLayout.totalWidth + outlinePad * 2;
    const canvasH = badgeLayout.totalHeight + outlinePad * 2;
    const renderSignature = buildPartyHudStatusBadgeHitSignature(
      visible,
      overflowCount,
      slot.slotIndex,
      canvasW,
      canvasH,
    );
    if (renderSignature === slot.statusBadgeRenderSignature) {
      return;
    }
    slot.statusBadgeRenderSignature = renderSignature;

    canvas.width = canvasW;
    canvas.height = canvasH;
    if (badges.length === 0) {
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.style.minWidth = '';
      canvas.style.maxWidth = '';
    } else {
      const w = `${canvasW}px`;
      const h = `${canvasH}px`;
      canvas.style.width = w;
      canvas.style.height = h;
      // .status-badge-canvas の max-width:100% による縮小を防ぐ
      canvas.style.minWidth = w;
      canvas.style.maxWidth = w;
    }
    canvas.hidden = badges.length === 0;
    if (badges.length === 0) {
      slot.statusBadgeHitLayer.replaceChildren();
      slot.statusBadgeHitSignature = null;
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasW, canvasH);

    drawCompactStatusBadgeRow(
      ctx,
      outlinePad,
      outlinePad,
      visible,
      overflowCount,
      scale,
      {
        iconSize: PARTY_HUD_STATUS_BADGE_ICON_SIZE,
        rowOverlap: theme.statusBadgeOverlap,
        overlayColor: theme.statusBadgeOverlay,
        iconOutlineColor: theme.statusIconOutlineColor,
        iconOutlineWidth: theme.statusIconOutlineWidth,
        iconFallbackAlpha: theme.statusIconFallbackAlpha,
        resolveIconFallbackColor: (category) =>
          resolveStatusIconFallbackColor(category, theme),
      },
      badgeLayoutConfig,
    );

    slot.statusBadgeHitSignature = renderSignature;
    syncPartyHudStatusBadgeHits(
      slot.statusBadgeHitLayer,
      badges,
      visible,
      overflowCount,
      PARTY_HUD_COMPACT_STATUS_VISIBLE_COUNT,
      theme,
      slot.slotIndex,
    );
  }

  private updateRecastGrid(slot: SlotElements, entry: PartyHudEntry): void {
    const bySlot = new Map(
      entry.activeCooldowns.map((cd) => [cd.slotIndex, cd] as const),
    );

    for (let i = 0; i < slot.recastCells.length; i++) {
      const { cell, fill, stockPips } = slot.recastCells[i];
      const cd = bySlot.get(i);
      stockPips.replaceChildren();

      if (!cd) {
        fill.style.width = '0%';
        fill.dataset.state = 'empty';
        delete fill.dataset.pausedMax;
        cell.classList.remove('party-hud-recast-cell--fire-hold');
        continue;
      }

      const maxCharges = cd.maxCharges ?? 0;
      const storedCharges = cd.storedCharges ?? 0;
      if (maxCharges > 0 && storedCharges > 0) {
        for (let pip = 0; pip < storedCharges; pip++) {
          const el = document.createElement('div');
          el.className = 'party-hud-recast-stock-pip';
          stockPips.appendChild(el);
        }
      }

      const fillView = resolveRecastFillView(cd, entry.useLocked);
      cell.classList.toggle(
        'party-hud-recast-cell--fire-hold',
        fillView.showFireHold,
      );
      fill.style.width = `${fillView.widthPct}%`;
      fill.dataset.state = fillView.state;
      if (fillView.pausedMax) {
        fill.dataset.pausedMax = 'true';
      } else {
        delete fill.dataset.pausedMax;
      }
    }
  }
}
