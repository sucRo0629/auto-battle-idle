import {
  collectStatusEffectBadgeDisplays,
  selectPartyHudCompactStatusBadges,
} from '../battle/statusEffectDisplay.ts';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot } from '../battle/types.ts';
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
  resolvePartyHudCompactStatusBadgeLayout,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  statusBadgeOutlinePad,
} from '../render/statusBadgeRenderer.ts';
import type { PartyHudEntry } from './partyHudTypes.ts';
import { resolveRecastFillView } from './partyHudRecast.ts';
import { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';
import type { GameTermPanel } from './GameTermPanel.ts';
import { syncPartyHudStatusBadgeHits, buildPartyHudStatusBadgeCanvasSignature, buildPartyHudStatusBadgeHitSignature } from './partyHudStatusBadgeHits.ts';
import {
  buildDownBySlot,
  createStatusBadgeGroupWithHits,
  syncDamageBars,
  syncStatusBadges,
  buildDetailDamageBarElements,
  type DamageBarRefs,
  type StatusBadgeRefs,
} from './PartyMemberStatsDisplay.ts';
import { t } from '../i18n/t.ts';

interface RecastCellElements {
  cell: HTMLElement;
  fill: HTMLElement;
  chargeMarkers: HTMLElement;
}

interface SlotElements {
  root: HTMLElement;
  slotIndex: number;
  label: HTMLElement;
  detailTop: HTMLElement;
  classCol: HTMLElement;
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
  recastGrid: HTMLElement;
  recastCells: RecastCellElements[];
  damage: DamageBarRefs;
  detailStatus: StatusBadgeRefs;
}

export type PartyHudPanelMode = 'compact' | 'detail';

export interface PartyHudDetailFrame {
  snapshots: CombatantSnapshot[];
  displayRows: StageDamageDisplayRow[];
}

export interface PartyHudPanelOptions {
  onMemberStatsHoverStart?: (slotIndex: number) => void;
  onMemberStatsHoverEnd?: () => void;
  floatingTooltip?: PartyHudFloatingTooltip;
  gameTermPanel?: GameTermPanel;
  onScrollReposition?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createDetailStatusBadges(): StatusBadgeRefs {
  const statusEl = el('div', 'party-stats-status party-hud-detail-status');
  const debuffGroup = createStatusBadgeGroupWithHits(t('hud.debuff'));
  const buffGroup = createStatusBadgeGroupWithHits(t('hud.buff'));
  statusEl.append(debuffGroup.group, buffGroup.group);
  return {
    root: statusEl,
    debuffCanvas: debuffGroup.canvas,
    buffCanvas: buffGroup.canvas,
    debuffHitLayer: debuffGroup.hitLayer,
    buffHitLayer: buffGroup.hitLayer,
  };
}

function createDetailDamageBar(): DamageBarRefs {
  const damageEl = el('div', 'party-stats-damage party-hud-detail-damage');
  const {
    bars,
    dealtFill,
    takenFill,
    dealtValue,
    takenValue,
    label,
  } = buildDetailDamageBarElements();
  damageEl.append(bars, label);
  return { root: damageEl, dealtFill, takenFill, dealtValue, takenValue, label };
}

export class PartyHudPanel {
  private root!: HTMLElement;
  private slotsBody!: HTMLElement;
  private readonly slots: SlotElements[] = [];
  private theme!: BattleHudTheme;
  private lastEntries: (PartyHudEntry | null)[] = [];
  private mode: PartyHudPanelMode = 'detail';
  private lastDetailFrame: PartyHudDetailFrame | null = null;
  private readonly unsubscribeStatusIconsReady: () => void;

  constructor(
    private readonly themeHost: HTMLElement,
    private readonly options: PartyHudPanelOptions = {},
  ) {
    this.unsubscribeStatusIconsReady = onStatusIconsReady(() => {
      this.invalidateCompactStatusRenderSignatures();
      if (this.lastEntries.length > 0) {
        this.update(this.lastEntries);
      }
      if (this.mode === 'detail' && this.lastDetailFrame) {
        this.invalidateDetailStatusSignatures();
        this.updateDetailMetrics(this.lastDetailFrame);
      }
    });
  }

  mount(parent: HTMLElement): void {
    this.theme = readBattleHudTheme(this.themeHost);
    const root = document.createElement('div');
    this.root = root;
    root.className = 'party-hud-panel';
    root.classList.toggle('party-hud-panel--detail', this.mode === 'detail');

    const slotsBody = document.createElement('div');
    slotsBody.className = 'party-hud-panel-slots';
    this.slotsBody = slotsBody;

    for (let i = 0; i < 4; i++) {
      this.slots.push(this.createSlot(i));
      slotsBody.appendChild(this.slots[i].root);
    }

    root.appendChild(slotsBody);
    parent.appendChild(root);

    this.slotsBody.addEventListener('scroll', () => {
      this.options.floatingTooltip?.reposition();
      this.options.onScrollReposition?.();
    });
  }

  setMode(mode: PartyHudPanelMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.root.classList.toggle('party-hud-panel--detail', mode === 'detail');
    if (mode === 'compact') {
      this.invalidateCompactStatusRenderSignatures();
      if (this.lastEntries.length > 0) {
        this.update(this.lastEntries);
      }
      return;
    }
    if (this.lastDetailFrame) {
      this.updateDetailMetrics(this.lastDetailFrame);
    }
  }

  getMode(): PartyHudPanelMode {
    return this.mode;
  }

  refreshLocale(): void {
    for (const slot of this.slots) {
      slot.damage.label.textContent = t('hud.damageEmpty');
      slot.damage.lastSyncKey = undefined;
      if (slot.damage.dealtValue) {
        slot.damage.dealtValue.textContent = '—';
      }
      if (slot.damage.takenValue) {
        slot.damage.takenValue.textContent = '—';
      }
      const damageTags = slot.damage.root.querySelectorAll(
        '.party-stats-damage-bar-tag',
      );
      if (damageTags[0] instanceof HTMLElement) {
        damageTags[0].textContent = t('hud.damageDealtShort');
      }
      if (damageTags[1] instanceof HTMLElement) {
        damageTags[1].textContent = t('hud.damageTakenShort');
      }
      slot.statusBadgeHitSignature = null;
      slot.detailStatus.debuffHitSignature = undefined;
      slot.detailStatus.buffHitSignature = undefined;
      const statusLabels = slot.detailStatus.root.querySelectorAll(
        '.party-stats-status-label',
      );
      if (statusLabels[0] instanceof HTMLElement) {
        statusLabels[0].textContent = t('hud.debuff');
      }
      if (statusLabels[1] instanceof HTMLElement) {
        statusLabels[1].textContent = t('hud.buff');
      }
    }
    this.invalidateCompactStatusRenderSignatures();
    this.invalidateDetailStatusSignatures();
    if (this.lastEntries.length > 0) {
      this.update(this.lastEntries);
    }
    if (this.mode === 'detail' && this.lastDetailFrame) {
      this.updateDetailMetrics(this.lastDetailFrame);
    }
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

  updateDetailMetrics(frame: PartyHudDetailFrame): void {
    this.lastDetailFrame = frame;
    if (this.mode !== 'detail') return;

    const damageByPartyIndex = new Map(
      this.slots.map((slot) => [slot.slotIndex, slot.damage] as const),
    );
    const statusByPartyIndex = new Map(
      this.slots.map((slot) => [slot.slotIndex, slot.detailStatus] as const),
    );
    const downBySlot = buildDownBySlot(frame.snapshots);

    syncDamageBars(damageByPartyIndex, frame.displayRows, downBySlot);
    syncStatusBadges(
      statusByPartyIndex,
      frame.snapshots,
      this.theme,
      {
        floatingTooltip: this.options.floatingTooltip ?? null,
        gameTermPanel: this.options.gameTermPanel ?? null,
      },
      { preserveEmptyGroups: true },
    );
  }

  getSlotRoot(slotIndex: number): HTMLElement | null {
    return this.slots[slotIndex]?.root ?? null;
  }

  destroy(): void {
    this.unsubscribeStatusIconsReady();
    this.root.remove();
  }

  private invalidateCompactStatusRenderSignatures(): void {
    for (const slot of this.slots) {
      slot.statusBadgeRenderSignature = null;
    }
  }

  private invalidateDetailStatusSignatures(): void {
    for (const slot of this.slots) {
      slot.detailStatus.debuffRenderSignature = undefined;
      slot.detailStatus.buffRenderSignature = undefined;
      slot.detailStatus.debuffHitSignature = undefined;
      slot.detailStatus.buffHitSignature = undefined;
    }
  }

  private bindMemberStatsHover(element: HTMLElement, slotIndex: number): void {
    element.addEventListener('mouseenter', () => {
      this.options.onMemberStatsHoverStart?.(slotIndex);
    });
    element.addEventListener('mouseleave', () => {
      this.options.onMemberStatsHoverEnd?.();
    });
  }

  private createSlot(slotIndex: number): SlotElements {
    const root = document.createElement('div');
    root.className = 'party-hud-slot';

    const statusBadgeWrap = document.createElement('div');
    statusBadgeWrap.className = 'party-hud-status-badges-wrap';
    root.appendChild(statusBadgeWrap);

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'party-hud-status-badges status-badge-canvas';
    statusBadgeWrap.appendChild(statusCanvas);

    const statusBadgeHitLayer = document.createElement('div');
    statusBadgeHitLayer.className = 'party-hud-status-badge-hits';
    statusBadgeWrap.appendChild(statusBadgeHitLayer);

    const detailTop = document.createElement('div');
    detailTop.className = 'party-hud-detail-top';
    root.appendChild(detailTop);

    const classCol = document.createElement('div');
    classCol.className = 'party-hud-detail-class-col';
    detailTop.appendChild(classCol);

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'party-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';
    classCol.appendChild(iconWrap);

    const label = document.createElement('div');
    label.className = 'party-hud-label';
    classCol.appendChild(label);

    const icon = document.createElement('img');
    icon.className = 'party-hud-icon pixel-icon-img pixel-icon-img--24';
    const iconSize = this.theme.iconSize;
    icon.width = iconSize;
    icon.height = iconSize;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const bars = document.createElement('div');
    bars.className = 'party-hud-bars';
    detailTop.appendChild(bars);

    this.bindMemberStatsHover(iconWrap, slotIndex);
    this.bindMemberStatsHover(bars, slotIndex);

    const hpRow = document.createElement('div');
    hpRow.className = 'party-hud-hp-row';
    bars.appendChild(hpRow);

    const hpTrack = document.createElement('div');
    hpTrack.className = 'party-hud-hp-track';
    hpRow.appendChild(hpTrack);

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

      const chargeMarkers = document.createElement('div');
      chargeMarkers.className = 'party-hud-recast-charge-markers';
      track.appendChild(chargeMarkers);

      cell.appendChild(track);

      recastGrid.appendChild(cell);
      recastCells.push({ cell, fill, chargeMarkers });
    }

    const damage = createDetailDamageBar();
    bars.appendChild(damage.root);

    const detailStatus = createDetailStatusBadges();
    root.appendChild(detailStatus.root);

    return {
      root,
      slotIndex,
      label,
      detailTop,
      classCol,
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
      recastGrid,
      recastCells,
      damage,
      detailStatus,
    };
  }

  private updateSlot(slot: SlotElements, entry: PartyHudEntry): void {
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
        this.theme,
      );
    }

    if (this.mode === 'compact') {
      this.updateCompactStatusBadges(slot, entry);
    }
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

  private updateCompactStatusBadges(slot: SlotElements, entry: PartyHudEntry): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      reg: entry.reg,
    });
    const { visible, overflowCount } = selectPartyHudCompactStatusBadges(badges);
    const canvas = slot.statusCanvas;
    const theme = this.theme;
    const scale = 1;
    const badgeLayoutConfig = resolvePartyHudCompactStatusBadgeLayout(
      overflowCount,
    );

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
    const canvasSignature = buildPartyHudStatusBadgeCanvasSignature(
      visible,
      overflowCount,
      slot.slotIndex,
      canvasW,
      canvasH,
    );
    const hitSignature = buildPartyHudStatusBadgeHitSignature(
      visible,
      overflowCount,
      slot.slotIndex,
    );
    const canvasUnchanged = canvasSignature === slot.statusBadgeRenderSignature;
    const hitsUnchanged = hitSignature === slot.statusBadgeHitSignature;
    if (canvasUnchanged && hitsUnchanged) {
      return;
    }

    if (!canvasUnchanged) {
      slot.statusBadgeRenderSignature = canvasSignature;

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
        canvas.style.minWidth = w;
        canvas.style.maxWidth = w;
      }
      canvas.hidden = badges.length === 0;

      if (badges.length > 0) {
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
      }
    }

    if (badges.length === 0) {
      slot.statusBadgeHitLayer.replaceChildren();
      slot.statusBadgeHitSignature = null;
      return;
    }

    if (!hitsUnchanged) {
      slot.statusBadgeHitSignature = hitSignature;
      syncPartyHudStatusBadgeHits(
        slot.statusBadgeHitLayer,
        badges,
        visible,
        overflowCount,
        badgeLayoutConfig,
        theme,
        slot.slotIndex,
        {
          floatingTooltip: this.options.floatingTooltip ?? null,
          gameTermPanel: this.options.gameTermPanel ?? null,
        },
      );
    }
  }

  private updateRecastGrid(slot: SlotElements, entry: PartyHudEntry): void {
    const slotCount = entry.unlockedActiveSlotCount;
    const bySlot = new Map(
      entry.activeCooldowns.map((cd) => [cd.slotIndex, cd] as const),
    );

    for (let i = 0; i < slot.recastCells.length; i++) {
      const { cell, fill, chargeMarkers } = slot.recastCells[i];
      chargeMarkers.replaceChildren();

      if (i >= slotCount) {
        cell.classList.add('party-hud-recast-cell--locked');
        fill.style.width = '0%';
        fill.dataset.state = 'empty';
        delete fill.dataset.pausedMax;
        cell.classList.remove('party-hud-recast-cell--fire-hold');
        continue;
      }

      cell.classList.remove('party-hud-recast-cell--locked');
      const cd = bySlot.get(i);
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
        for (let charge = 0; charge < storedCharges; charge++) {
          const el = document.createElement('div');
          el.className = 'party-hud-recast-charge-marker';
          chargeMarkers.appendChild(el);
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
