import { collectStatusEffectBadgeDisplays } from '../battle/statusEffectDisplay.ts';
import { layoutHpBarBarrier } from '../render/hpBarBarrierLayout.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import { onStatusIconsReady } from '../render/StatusIconRegistry.ts';
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
  type BattleHudTheme,
} from '../render/battleHudTheme.ts';
import { statusBadgeOutlinePad } from '../render/statusBadgeRenderer.ts';
import type { EnemyHudEntry } from './enemyHudTypes.ts';
import {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
  drawEnemyHudStatusRow,
  measureEnemyHudStatusRow,
  resolveEnemyHudAllStatusTooltipLabel,
  selectEnemyHudStatusBadges,
  syncEnemyHudStatusBadgeHits,
} from './enemyHudStatusRow.ts';
import type { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';
import { snapHudCanvasCssSize } from './battleRootScale.ts';
import type { GameTermPanel } from './GameTermPanel.ts';
import { getLocale } from '../i18n/locale.ts';
import type { GameTermLocale } from './gameTermGlossary.ts';

interface SlotElements {
  root: HTMLElement;
  slotIndex: number;
  label: HTMLElement;
  body: HTMLElement;
  iconWrap: HTMLElement;
  icon: HTMLImageElement;
  hpFill: HTMLElement;
  barrierLayer: HTMLElement;
  statusBadgeWrap: HTMLElement;
  statusCanvas: HTMLCanvasElement;
  statusBadgeHitLayer: HTMLElement;
  statusBadgeRenderSignature: string | null;
  statusBadgeHitSignature: string | null;
  hpBarSignature: string | null;
  dangerTelegraph: HTMLElement;
  dangerTelegraphFill: HTMLElement;
}

export interface EnemyHudPanelOptions {
  floatingTooltip?: PartyHudFloatingTooltip;
  gameTermPanel?: GameTermPanel;
  onHoverHighlightStart?: (unitId: string) => void;
  onHoverHighlightEnd?: () => void;
}

export class EnemyHudPanel {
  private root!: HTMLElement;
  private slotsBody!: HTMLElement;
  private readonly slots: SlotElements[] = [];
  private theme!: BattleHudTheme;
  private lastEntries: EnemyHudEntry[] = [];
  private hoverHighlightUnitId: string | null = null;
  private targetIndicatorUnitIds = new Set<string>();
  private readonly unsubscribeStatusIconsReady: () => void;

  constructor(
    private readonly themeHost: HTMLElement,
    private readonly options: EnemyHudPanelOptions = {},
  ) {
    this.unsubscribeStatusIconsReady = onStatusIconsReady(() => {
      this.invalidateStatusRenderSignatures();
      if (this.lastEntries.length > 0) {
        this.update(this.lastEntries);
      }
    });
  }

  mount(parent: HTMLElement): void {
    this.theme = readBattleHudTheme(this.themeHost);
    const root = document.createElement('div');
    this.root = root;
    root.className = 'enemy-hud-panel';

    const slotsBody = document.createElement('div');
    slotsBody.className = 'enemy-hud-panel-slots';
    this.slotsBody = slotsBody;

    root.appendChild(slotsBody);
    parent.appendChild(root);
  }

  update(entries: EnemyHudEntry[]): void {
    this.lastEntries = entries;

    while (this.slots.length < entries.length) {
      const slot = this.createSlot(this.slots.length);
      this.slots.push(slot);
      this.slotsBody.appendChild(slot.root);
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const entry = entries[i];
      if (!entry) {
        slot.root.hidden = true;
        continue;
      }
      slot.root.hidden = false;
      slot.root.dataset.enemyUnitId = entry.id;
      this.updateSlot(slot, entry);
      this.syncSlotHighlightClasses(slot, entry.id);
    }
  }

  setHoverHighlightUnitId(unitId: string | null): void {
    this.hoverHighlightUnitId = unitId;
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.lastEntries[i];
      if (!entry) continue;
      this.syncSlotHighlightClasses(this.slots[i], entry.id);
    }
  }

  setTargetIndicatorUnitIds(unitIds: readonly string[]): void {
    this.targetIndicatorUnitIds = new Set(unitIds);
    for (let i = 0; i < this.slots.length; i++) {
      const entry = this.lastEntries[i];
      if (!entry) continue;
      this.syncSlotHighlightClasses(this.slots[i], entry.id);
    }
  }

  destroy(): void {
    this.unsubscribeStatusIconsReady();
    this.root.remove();
  }

  private invalidateStatusRenderSignatures(): void {
    for (const slot of this.slots) {
      slot.statusBadgeRenderSignature = null;
    }
  }

  private createSlot(slotIndex: number): SlotElements {
    const root = document.createElement('div');
    root.className = 'enemy-hud-slot';
    root.dataset.enemyHudSlotIndex = String(slotIndex);

    const main = document.createElement('div');
    main.className = 'enemy-hud-slot-main';

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'enemy-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';

    const icon = document.createElement('img');
    icon.className = 'enemy-hud-icon pixel-icon-img pixel-icon-img--24';
    const iconSize = this.theme.iconSize;
    icon.width = iconSize;
    icon.height = iconSize;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'enemy-hud-slot-body';

    const label = document.createElement('div');
    label.className = 'enemy-hud-label';

    const hpTrack = document.createElement('div');
    hpTrack.className = 'enemy-hud-hp-track';

    const hpFill = document.createElement('div');
    hpFill.className = 'enemy-hud-hp-fill';
    hpTrack.appendChild(hpFill);

    const barrierLayer = document.createElement('div');
    barrierLayer.className = 'enemy-hud-barrier-layer';
    hpTrack.appendChild(barrierLayer);

    const statusBadgeWrap = document.createElement('div');
    statusBadgeWrap.className = 'enemy-hud-status-badges-wrap';

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'enemy-hud-status-badges status-badge-canvas';
    statusBadgeWrap.appendChild(statusCanvas);

    const statusBadgeHitLayer = document.createElement('div');
    statusBadgeHitLayer.className = 'party-hud-status-badge-hits';
    statusBadgeWrap.appendChild(statusBadgeHitLayer);

    const dangerTelegraph = document.createElement('div');
    dangerTelegraph.className = 'enemy-hud-danger-telegraph enemy-hud-danger-telegraph--inactive';
    const dangerTelegraphFill = document.createElement('div');
    dangerTelegraphFill.className = 'enemy-hud-danger-telegraph-fill';
    dangerTelegraph.appendChild(dangerTelegraphFill);

    body.append(label, hpTrack, statusBadgeWrap, dangerTelegraph);
    main.append(iconWrap, body);
    root.appendChild(main);

    this.bindSlotStatusTooltip(body, slotIndex);
    this.bindFieldLinkHover(root, slotIndex);

    return {
      root,
      slotIndex,
      label,
      body,
      iconWrap,
      icon,
      hpFill,
      barrierLayer,
      statusBadgeWrap,
      statusCanvas,
      statusBadgeHitLayer,
      statusBadgeRenderSignature: null,
      statusBadgeHitSignature: null,
      hpBarSignature: null,
      dangerTelegraph,
      dangerTelegraphFill,
    };
  }

  private bindSlotStatusTooltip(body: HTMLElement, slotIndex: number): void {
    body.addEventListener('mouseenter', () => {
      const floatingTooltip = this.options.floatingTooltip;
      if (!floatingTooltip) return;

      const entry = this.lastEntries[slotIndex];
      if (!entry) return;

      const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
        baseMaxHp: entry.baseMaxHp,
        atk: entry.atk,
        def: entry.def,
        reg: entry.reg,
      });
      const text = resolveEnemyHudAllStatusTooltipLabel(
        badges,
        getLocale() as GameTermLocale,
      );
      if (!text) return;
      floatingTooltip.show(body, text, { wide: true, alignEnd: true, placement: 'below' });
    });
    body.addEventListener('mouseleave', () => {
      this.options.floatingTooltip?.hide();
    });
  }

  private updateSlot(slot: SlotElements, entry: EnemyHudEntry): void {
    slot.root.classList.toggle('enemy-hud-slot--dead', !entry.isAlive);
    slot.root.dataset.enemyId = entry.id;
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

    this.updateHpBar(slot, entry);
    this.updateStatusBadges(slot, entry);
    this.updateDangerTelegraph(slot, entry);
  }

  private updateHpBar(slot: SlotElements, entry: EnemyHudEntry): void {
    const signature = `${entry.hp}|${entry.maxHp}|${entry.barrierHp}|${entry.isAlive}`;
    if (signature === slot.hpBarSignature) return;
    slot.hpBarSignature = signature;

    const layout = layoutHpBarBarrier(0, 100, entry.hp, entry.maxHp, entry.barrierHp);
    slot.hpFill.style.width = layout ? `${layout.hpWidth}%` : '0%';

    slot.barrierLayer.replaceChildren();
    if (!layout) return;

    for (const segment of layout.tier1) {
      const seg = document.createElement('div');
      seg.className = 'enemy-hud-barrier-seg';
      seg.style.left = `${segment.x}%`;
      seg.style.width = `${segment.width}%`;
      slot.barrierLayer.appendChild(seg);
    }

    if (entry.maxHp > 0 && entry.barrierHp > entry.maxHp) {
      const overflow = document.createElement('div');
      overflow.className = 'enemy-hud-barrier-overflow';
      overflow.style.width = `${((entry.barrierHp - entry.maxHp) / entry.maxHp) * 100}%`;
      slot.barrierLayer.appendChild(overflow);
    }
  }

  private updateStatusBadges(slot: SlotElements, entry: EnemyHudEntry): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      reg: entry.reg,
    });
    const { visible, overflowCount } = selectEnemyHudStatusBadges(badges);
    const canvas = slot.statusCanvas;
    const theme = this.theme;
    const scale = 1;
    const rowLayout = measureEnemyHudStatusRow(scale, theme, overflowCount);
    const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
    const canvasW = snapHudCanvasCssSize(rowLayout.totalWidth + outlinePad * 2);
    const canvasH = snapHudCanvasCssSize(rowLayout.totalHeight + outlinePad * 2);
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
      drawEnemyHudStatusRow(
        ctx,
        outlinePad,
        outlinePad,
        visible,
        overflowCount,
        scale,
        theme,
      );
    }

    if (badges.length === 0) {
      slot.statusBadgeHitLayer.replaceChildren();
      slot.statusBadgeHitSignature = null;
      return;
    }

    if (!hitsUnchanged) {
      slot.statusBadgeHitSignature = hitSignature;
      syncEnemyHudStatusBadgeHits(
        slot.statusBadgeHitLayer,
        badges,
        visible,
        overflowCount,
        theme,
        slot.slotIndex,
        {
          floatingTooltip: this.options.floatingTooltip ?? null,
          gameTermPanel: this.options.gameTermPanel ?? null,
        },
      );
    }
  }

  private updateDangerTelegraph(slot: SlotElements, entry: EnemyHudEntry): void {
    const active = entry.dangerTelegraphActive === true;
    const progress = Math.max(
      0,
      Math.min(1, entry.dangerTelegraphProgress ?? 0),
    );

    slot.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--active',
      active,
    );
    slot.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--inactive',
      !active,
    );
    slot.dangerTelegraphFill.style.width = active ? `${progress * 100}%` : '0%';
  }

  private bindFieldLinkHover(root: HTMLElement, slotIndex: number): void {
    root.addEventListener('mouseenter', () => {
      const entry = this.lastEntries[slotIndex];
      if (!entry) return;
      this.options.onHoverHighlightStart?.(entry.id);
    });
    root.addEventListener('mouseleave', () => {
      this.options.onHoverHighlightEnd?.();
    });
  }

  private syncSlotHighlightClasses(slot: SlotElements, unitId: string): void {
    slot.root.classList.toggle(
      'enemy-hud-slot--hover-highlight',
      this.hoverHighlightUnitId === unitId,
    );
    slot.root.classList.toggle(
      'enemy-hud-slot--target-indicator',
      this.targetIndicatorUnitIds.has(unitId),
    );
  }
}
