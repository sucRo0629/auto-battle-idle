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
import { snapHudCanvasCssSize } from './battleRootScale.ts';
import { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';
import type { GameTermPanel } from './GameTermPanel.ts';
import { syncPartyHudStatusBadgeHits, buildPartyHudStatusBadgeCanvasSignature, buildPartyHudStatusBadgeHitSignature } from './partyHudStatusBadgeHits.ts';
import {
  drawPartyHudOverlayStatusGrid,
  measurePartyHudOverlayStatusGrid,
  selectPartyHudOverlayStatusBadges,
  syncPartyHudOverlayStatusBadgeHits,
} from './partyHudOverlayStatusGrid.ts';
import {
  buildDownBySlot,
  createStatusBadgeGroupWithHits,
  syncDamageBars,
  syncStatusBadges,
  buildDetailDamageBarElements,
  syncDamageBarTagAriaLabels,
  type DamageBarRefs,
  type StatusBadgeRefs,
} from './PartyMemberStatsDisplay.ts';
import { t } from '../i18n/t.ts';

interface RecastCellElements {
  cell: HTMLElement;
  track: HTMLElement;
  fill: HTMLElement;
  chargeMarkers: HTMLElement;
  cellIndex: number;
}

interface SlotElements {
  root: HTMLElement;
  slotIndex: number;
  label: HTMLElement;
  unitPlate: HTMLElement;
  classCol?: HTMLElement;
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
  detailStatus?: StatusBadgeRefs;
}

export type PartyHudPanelMode = 'compact' | 'detail';

export interface PartyHudDetailFrame {
  snapshots: CombatantSnapshot[];
  displayRows: StageDamageDisplayRow[];
}

export type PartyHudPanelLayout = 'lane' | 'overlay';

export interface PartyHudPanelOptions {
  layout?: PartyHudPanelLayout;
  onMemberStatsHoverStart?: (slotIndex: number) => void;
  onMemberStatsHoverEnd?: () => void;
  onHoverHighlightStart?: (unitId: string) => void;
  onHoverHighlightEnd?: () => void;
  floatingTooltip?: PartyHudFloatingTooltip;
  gameTermPanel?: GameTermPanel;
  onScrollReposition?: () => void;
}

/** リキャスト 2×2 の最大行数。2 スロット時は 1 行にし、差分は HP バー高さが吸収する。 */
export function resolvePartyHudRecastSlotRows(unlockedActiveSlotCount: number): number {
  return unlockedActiveSlotCount <= 2 ? 1 : 2;
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
  debuffGroup.group.classList.add('party-stats-status-group--debuff');
  const buffGroup = createStatusBadgeGroupWithHits(t('hud.buff'));
  buffGroup.group.classList.add('party-stats-status-group--buff');
  statusEl.append(buffGroup.group, debuffGroup.group);
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
    dealtBar,
    dealtFill,
    takenFill,
    dealtValue,
    takenValue,
    label,
  } = buildDetailDamageBarElements();
  damageEl.append(bars, label);
  return { root: damageEl, dealtBar, dealtFill, takenFill, dealtValue, takenValue, label };
}

export class PartyHudPanel {
  private root!: HTMLElement;
  private slotsBody!: HTMLElement;
  private readonly slots: SlotElements[] = [];
  private theme!: BattleHudTheme;
  private lastEntries: (PartyHudEntry | null)[] = [];
  private mode: PartyHudPanelMode = 'detail';
  private lastDetailFrame: PartyHudDetailFrame | null = null;
  private hoverHighlightUnitId: string | null = null;
  private hoveredFieldLinkSlotIndex: number | null = null;
  private readonly layout: PartyHudPanelLayout;
  private readonly unsubscribeStatusIconsReady: () => void;

  constructor(
    private readonly themeHost: HTMLElement,
    private readonly options: PartyHudPanelOptions = {},
  ) {
    this.layout = options.layout ?? 'lane';
    if (this.layout === 'overlay') {
      this.mode = 'compact';
    }
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
    root.classList.toggle('party-hud-panel--overlay', this.layout === 'overlay');

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
    this.bindPanelFieldLinkHover();
  }

  setMode(mode: PartyHudPanelMode): void {
    if (this.layout === 'overlay') return;
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
        slot.damage.dealtValue.removeAttribute('title');
        slot.damage.dealtValue.removeAttribute('aria-label');
      }
      if (slot.damage.takenValue) {
        slot.damage.takenValue.textContent = '—';
        slot.damage.takenValue.removeAttribute('title');
        slot.damage.takenValue.removeAttribute('aria-label');
      }
      syncDamageBarTagAriaLabels(slot.damage.root);
      slot.statusBadgeHitSignature = null;
      if (slot.detailStatus) {
        slot.detailStatus.debuffHitSignature = undefined;
        slot.detailStatus.buffHitSignature = undefined;
        const statusLabels = slot.detailStatus.root.querySelectorAll(
          '.party-stats-status-label',
        );
        if (statusLabels[0] instanceof HTMLElement) {
          statusLabels[0].textContent = t('hud.buff');
        }
        if (statusLabels[1] instanceof HTMLElement) {
          statusLabels[1].textContent = t('hud.debuff');
        }
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
      slot.root.dataset.partyUnitId = entry.unitId;
      this.updateSlot(slot, entry);
      this.syncSlotHighlightClasses(slot, entry.unitId);
    }
  }

  setHoverHighlightUnitId(unitId: string | null): void {
    this.hoverHighlightUnitId = unitId;
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.lastEntries[i];
      if (!entry) continue;
      this.syncSlotHighlightClasses(this.slots[i], entry.unitId);
    }
  }

  updateDetailMetrics(frame: PartyHudDetailFrame): void {
    this.lastDetailFrame = frame;

    const damageByPartyIndex = new Map<number, DamageBarRefs>();
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.lastEntries[i];
      if (entry) {
        damageByPartyIndex.set(entry.partySlotIndex, this.slots[i].damage);
      }
    }
    const downBySlot = buildDownBySlot(frame.snapshots);
    syncDamageBars(damageByPartyIndex, frame.displayRows, downBySlot);

    if (this.layout === 'overlay' || this.mode !== 'detail') return;

    const statusByPartyIndex = new Map<number, StatusBadgeRefs>();
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.lastEntries[i];
      if (entry && this.slots[i].detailStatus) {
        statusByPartyIndex.set(entry.partySlotIndex, this.slots[i].detailStatus!);
      }
    }
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
      if (!slot.detailStatus) continue;
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
    if (this.layout === 'overlay') {
      return this.createOverlaySlot(slotIndex);
    }
    return this.createLaneSlot(slotIndex);
  }

  private createHpRow(slotIndex: number): {
    hpRow: HTMLElement;
    hpFill: HTMLElement;
    barrierLayer: HTMLElement;
  } {
    const hpRow = document.createElement('div');
    hpRow.className = 'party-hud-hp-row';
    this.bindMemberStatsHover(hpRow, slotIndex);

    const hpTrack = document.createElement('div');
    hpTrack.className = 'party-hud-hp-track';
    hpRow.appendChild(hpTrack);

    const hpFill = document.createElement('div');
    hpFill.className = 'party-hud-hp-fill';
    hpTrack.appendChild(hpFill);

    const barrierLayer = document.createElement('div');
    barrierLayer.className = 'party-hud-barrier-layer';
    hpTrack.appendChild(barrierLayer);

    return { hpRow, hpFill, barrierLayer };
  }

  private createRecastGrid(): {
    recastGrid: HTMLElement;
    recastCells: RecastCellElements[];
  } {
    const recastGrid = document.createElement('div');
    recastGrid.className = 'party-hud-recast-grid';
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
      recastCells.push({ cell, track, fill, chargeMarkers, cellIndex: slot });
      this.bindRecastCellHoverGuard(track);
    }

    return { recastGrid, recastCells };
  }

  private createStatusBadgeWrap(): {
    statusBadgeWrap: HTMLElement;
    statusCanvas: HTMLCanvasElement;
    statusBadgeHitLayer: HTMLElement;
  } {
    const statusBadgeWrap = document.createElement('div');
    statusBadgeWrap.className = 'party-hud-status-badges-wrap';

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'party-hud-status-badges status-badge-canvas';
    statusBadgeWrap.appendChild(statusCanvas);

    const statusBadgeHitLayer = document.createElement('div');
    statusBadgeHitLayer.className = 'party-hud-status-badge-hits';
    statusBadgeWrap.appendChild(statusBadgeHitLayer);

    return { statusBadgeWrap, statusCanvas, statusBadgeHitLayer };
  }

  /** §8.7 allyCard — 縦 4 段: 識別+HP / 状態 / スキルゲージ / 与被ダメ */
  private createOverlaySlot(slotIndex: number): SlotElements {
    const root = document.createElement('div');
    root.className = 'party-hud-slot';

    const unitPlate = document.createElement('div');
    unitPlate.className = 'party-hud-unit party-hud-card';
    root.appendChild(unitPlate);

    const headerRow = document.createElement('div');
    headerRow.className = 'party-hud-header-row';
    unitPlate.appendChild(headerRow);

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'party-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';
    headerRow.appendChild(iconWrap);
    this.bindMemberStatsHover(iconWrap, slotIndex);

    const label = document.createElement('div');
    label.className = 'party-hud-label';
    headerRow.appendChild(label);

    const icon = document.createElement('img');
    icon.className = 'party-hud-icon pixel-icon-img pixel-icon-img--24';
    const iconSize = this.theme.iconSize;
    icon.width = iconSize;
    icon.height = iconSize;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const { hpRow, hpFill, barrierLayer } = this.createHpRow(slotIndex);
    headerRow.appendChild(hpRow);

    const { statusBadgeWrap, statusCanvas, statusBadgeHitLayer } =
      this.createStatusBadgeWrap();
    unitPlate.appendChild(statusBadgeWrap);

    const { recastGrid, recastCells } = this.createRecastGrid();
    unitPlate.appendChild(recastGrid);

    const damage = createDetailDamageBar();
    unitPlate.appendChild(damage.root);

    return {
      root,
      slotIndex,
      label,
      unitPlate,
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
    };
  }

  private createLaneSlot(slotIndex: number): SlotElements {
    const root = document.createElement('div');
    root.className = 'party-hud-slot';

    const { statusBadgeWrap, statusCanvas, statusBadgeHitLayer } =
      this.createStatusBadgeWrap();
    root.appendChild(statusBadgeWrap);

    const unitPlate = document.createElement('div');
    unitPlate.className = 'party-hud-unit';
    root.appendChild(unitPlate);

    const classCol = document.createElement('div');
    classCol.className = 'party-hud-detail-class-col';
    unitPlate.appendChild(classCol);

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
    unitPlate.appendChild(bars);

    this.bindMemberStatsHover(iconWrap, slotIndex);

    const { hpRow, hpFill, barrierLayer } = this.createHpRow(slotIndex);
    bars.appendChild(hpRow);

    const { recastGrid, recastCells } = this.createRecastGrid();
    bars.appendChild(recastGrid);

    const damage = createDetailDamageBar();
    unitPlate.appendChild(damage.root);

    const detailStatus = createDetailStatusBadges();
    unitPlate.appendChild(detailStatus.root);

    return {
      root,
      slotIndex,
      label,
      unitPlate,
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

    if (this.mode === 'compact' && this.layout === 'overlay') {
      this.updateOverlayStatusBadges(slot, entry);
    } else if (this.mode === 'compact') {
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
    const canvasW = snapHudCanvasCssSize(badgeLayout.totalWidth + outlinePad * 2);
    const canvasH = snapHudCanvasCssSize(badgeLayout.totalHeight + outlinePad * 2);
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
    const isOverlay = this.layout === 'overlay';
    const recastSlotRows = isOverlay
      ? 2
      : resolvePartyHudRecastSlotRows(slotCount);
    slot.recastGrid.parentElement?.style.setProperty(
      '--hud-recast-slot-rows',
      String(recastSlotRows),
    );
    const bySlot = new Map(
      entry.activeCooldowns.map((cd) => [cd.slotIndex, cd] as const),
    );

    for (let i = 0; i < slot.recastCells.length; i++) {
      const { cell, fill, chargeMarkers } = slot.recastCells[i];
      chargeMarkers.replaceChildren();
      const inactive = i >= slotCount;

      if (inactive) {
        cell.classList.toggle('party-hud-recast-cell--locked', !isOverlay);
        cell.classList.toggle('party-hud-recast-cell--inactive', isOverlay);
        fill.style.width = '0%';
        fill.dataset.state = 'empty';
        delete fill.dataset.pausedMax;
        cell.classList.remove('party-hud-recast-cell--fire-hold');
        continue;
      }

      cell.classList.remove('party-hud-recast-cell--locked');
      cell.classList.remove('party-hud-recast-cell--inactive');
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

  private dismissHudHoverOverlays(): void {
    this.options.onMemberStatsHoverEnd?.();
    this.options.floatingTooltip?.hide();
  }

  private bindRecastCellHoverGuard(track: HTMLElement): void {
    track.addEventListener('mouseenter', () => {
      this.dismissHudHoverOverlays();
    });
  }

  private updateOverlayStatusBadges(slot: SlotElements, entry: PartyHudEntry): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      reg: entry.reg,
    });
    const { visible, overflowCount } = selectPartyHudOverlayStatusBadges(badges);
    const canvas = slot.statusCanvas;
    const theme = this.theme;
    const scale = 1;
    const gridLayout = measurePartyHudOverlayStatusGrid(
      scale,
      PARTY_HUD_STATUS_BADGE_ICON_SIZE,
      theme.statusIconOutlineWidth,
      theme.statusBadgeOverlap,
    );
    const canvasW = snapHudCanvasCssSize(gridLayout.totalWidth);
    const canvasH = snapHudCanvasCssSize(gridLayout.totalHeight);
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
      const w = `${canvasW}px`;
      const h = `${canvasH}px`;
      canvas.style.width = w;
      canvas.style.height = h;
      canvas.style.minWidth = w;
      canvas.style.maxWidth = w;
      canvas.hidden = false;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvasW, canvasH);
      drawPartyHudOverlayStatusGrid(
        ctx,
        0,
        0,
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
      );
    }

    if (badges.length === 0) {
      slot.statusBadgeHitLayer.replaceChildren();
      slot.statusBadgeHitSignature = null;
      return;
    }

    if (!hitsUnchanged) {
      slot.statusBadgeHitSignature = hitSignature;
      syncPartyHudOverlayStatusBadgeHits(
        slot.statusBadgeHitLayer,
        badges,
        visible,
        overflowCount,
        theme,
        {
          floatingTooltip: this.options.floatingTooltip ?? null,
          gameTermPanel: this.options.gameTermPanel ?? null,
        },
      );
    }
  }

  private bindPanelFieldLinkHover(): void {
    this.slotsBody.addEventListener('mouseover', (event) => {
      const slot = (event.target as Element).closest('.party-hud-slot');
      if (!slot || !this.slotsBody.contains(slot)) return;
      const slotIndex = this.slots.findIndex((candidate) => candidate.root === slot);
      if (slotIndex < 0 || this.hoveredFieldLinkSlotIndex === slotIndex) return;
      const entry = this.lastEntries[slotIndex];
      if (!entry) return;
      this.hoveredFieldLinkSlotIndex = slotIndex;
      this.options.onHoverHighlightStart?.(entry.unitId);
    });
    this.slotsBody.addEventListener('mouseout', (event) => {
      const slot = (event.target as Element).closest('.party-hud-slot');
      if (!slot) return;
      const related = event.relatedTarget;
      if (related instanceof Node && slot.contains(related)) return;
      if (this.shouldRetainFieldLinkHover(related)) return;
      if (related instanceof Element) {
        const relatedSlot = related.closest('.party-hud-slot');
        if (relatedSlot && this.slotsBody.contains(relatedSlot)) return;
      }
      if (this.hoveredFieldLinkSlotIndex === null) return;
      this.hoveredFieldLinkSlotIndex = null;
      this.options.onHoverHighlightEnd?.();
    });
  }

  /** Keep field link while pointer moves to HUD-linked overlays (stats / tooltips). */
  private shouldRetainFieldLinkHover(relatedTarget: EventTarget | null): boolean {
    if (!(relatedTarget instanceof Element)) return false;
    return (
      relatedTarget.closest('.party-member-effective-stats') !== null ||
      relatedTarget.closest('.party-hud-floating-tooltip') !== null ||
      relatedTarget.closest('.game-term-panel--hud-layer') !== null
    );
  }

  private syncSlotHighlightClasses(slot: SlotElements, unitId: string): void {
    slot.root.classList.toggle(
      'party-hud-slot--hover-highlight',
      this.hoverHighlightUnitId === unitId,
    );
  }
}
