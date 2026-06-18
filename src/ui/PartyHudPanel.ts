import { collectStatusEffectBadgeDisplays } from '../battle/statusEffectDisplay.ts';
import { MAX_ACTIVE_SLOTS } from '../progression/skillBuild.ts';
import { layoutHpBarBarrier } from '../render/hpBarBarrierLayout.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from '../render/battleHudTheme.ts';
import {
  drawStatusBadgeBlock,
  measureStatusBadgeBlock,
  orderBadgesForDraw,
  statusBadgeOutlinePad,
} from '../render/statusBadgeRenderer.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';

interface RecastCellElements {
  cell: HTMLElement;
  fill: HTMLElement;
  stockPips: HTMLElement;
}

interface SlotElements {
  root: HTMLElement;
  labelRow: HTMLElement;
  label: HTMLElement;
  icon: HTMLImageElement;
  hpFill: HTMLElement;
  barrierLayer: HTMLElement;
  statusCanvas: HTMLCanvasElement;
  recastCells: RecastCellElements[];
}

export class PartyHudPanel {
  private root!: HTMLElement;
  private readonly slots: SlotElements[] = [];
  private theme!: BattleHudTheme;

  constructor(private readonly themeHost: HTMLElement) {}

  mount(parent: HTMLElement): void {
    this.theme = readBattleHudTheme(this.themeHost);
    const root = document.createElement('div');
    this.root = root;
    root.className = 'party-hud-panel';

    for (let i = 0; i < 4; i++) {
      this.slots.push(this.createSlot());
      root.appendChild(this.slots[i].root);
    }

    parent.appendChild(root);
  }

  update(entries: (PartyHudEntry | null)[]): void {
    this.theme = readBattleHudTheme(this.themeHost);

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

  destroy(): void {
    this.root.remove();
  }

  private createSlot(): SlotElements {
    const root = document.createElement('div');
    root.className = 'party-hud-slot';

    const labelRow = document.createElement('div');
    labelRow.className = 'party-hud-label-row';
    root.appendChild(labelRow);

    const label = document.createElement('div');
    label.className = 'party-hud-label';
    labelRow.appendChild(label);

    const body = document.createElement('div');
    body.className = 'party-hud-body';
    root.appendChild(body);

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'party-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';
    body.appendChild(iconWrap);

    const icon = document.createElement('img');
    icon.className = 'party-hud-icon pixel-icon-img pixel-icon-img--24';
    const iconSize = this.theme.iconSize;
    icon.width = iconSize;
    icon.height = iconSize;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const bars = document.createElement('div');
    bars.className = 'party-hud-bars';
    body.appendChild(bars);

    const hpTrack = document.createElement('div');
    hpTrack.className = 'party-hud-hp-track';
    bars.appendChild(hpTrack);

    const hpFill = document.createElement('div');
    hpFill.className = 'party-hud-hp-fill';
    hpTrack.appendChild(hpFill);

    const barrierLayer = document.createElement('div');
    barrierLayer.className = 'party-hud-barrier-layer';
    hpTrack.appendChild(barrierLayer);

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'party-hud-status-badges';
    statusCanvas.hidden = true;
    labelRow.appendChild(statusCanvas);

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
      labelRow,
      label,
      icon,
      hpFill,
      barrierLayer,
      statusCanvas,
      recastCells,
    };
  }

  private updateSlot(slot: SlotElements, entry: PartyHudEntry): void {
    const theme = this.theme;
    slot.root.classList.toggle('party-hud-slot--dead', !entry.isAlive);
    slot.label.textContent = `${entry.displayName} Lv${entry.level}`;

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

    this.updateHpBar(slot, entry);
    this.updateStatusBadges(slot, entry);
    this.updateRecastGrid(slot, entry);
  }

  private updateHpBar(slot: SlotElements, entry: PartyHudEntry): void {
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
      atk: entry.atk,
      def: entry.def,
      reg: entry.reg,
    });
    const drawItems = orderBadgesForDraw(badges);
    const canvas = slot.statusCanvas;

    if (drawItems.length === 0) {
      canvas.hidden = true;
      return;
    }

    const theme = this.theme;
    const scale = 1;
    const badgeLayout = measureStatusBadgeBlock(
      drawItems,
      scale,
      theme.statusBadgeIconSize,
      theme.statusIconOutlineWidth,
      theme.statusBadgeOverlap,
    );
    const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
    const canvasW = badgeLayout.totalWidth + outlinePad * 2;
    const canvasH = badgeLayout.totalHeight + outlinePad * 2;

    canvas.width = canvasW;
    canvas.height = canvasH;
    canvas.hidden = false;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasW, canvasH);
    drawStatusBadgeBlock(
      ctx,
      outlinePad + badgeLayout.totalWidth / 2,
      outlinePad,
      drawItems,
      scale,
      {
        buffColor: theme.statusBuffColor,
        debuffColor: theme.statusDebuffColor,
        iconSize: theme.statusBadgeIconSize,
        rowOverlap: theme.statusBadgeOverlap,
        overlayColor: theme.statusBadgeOverlay,
        iconOutlineColor: theme.statusIconOutlineColor,
        passiveIconOutlineColor: theme.statusPassiveIconOutlineColor,
        iconOutlineWidth: theme.statusIconOutlineWidth,
        iconFallbackAlpha: theme.statusIconFallbackAlpha,
        resolveIconFallbackColor: (category) =>
          resolveStatusIconFallbackColor(category, theme),
      },
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

      cell.classList.toggle(
        'party-hud-recast-cell--fire-hold',
        cd.fireHold === true,
      );

      const activeEffectRemaining = cd.activeEffectRemaining ?? 0;
      const activeEffectTotal = cd.activeEffectTotal ?? 0;
      if (activeEffectRemaining > 0 && activeEffectTotal > 0) {
        const ratio = Math.max(
          0,
          Math.min(1, activeEffectRemaining / activeEffectTotal),
        );
        fill.style.width = `${ratio * 100}%`;
        fill.dataset.state = 'active';
        delete fill.dataset.pausedMax;
        continue;
      }

      const ready = cd.remaining <= 0;
      const chargeRatio = ready
        ? 1
        : Math.max(0, Math.min(1, 1 - cd.remaining / cd.triggerValue));
      if (entry.useLocked) {
        fill.style.width = `${chargeRatio * 100}%`;
        fill.dataset.state = 'paused';
        if (ready) {
          fill.dataset.pausedMax = 'true';
        } else {
          delete fill.dataset.pausedMax;
        }
        continue;
      }

      fill.style.width = `${chargeRatio * 100}%`;
      fill.dataset.state = ready ? 'ready' : 'charging';
      delete fill.dataset.pausedMax;
    }
  }
}
