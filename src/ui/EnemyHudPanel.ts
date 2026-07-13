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
import type { EnemyHudEntry, EnemyHudGroup } from './enemyHudTypes.ts';
import {
  ENEMY_HUD_CARD_HEIGHT,
  ENEMY_HUD_CARD_STACK_OFFSET_X,
  ENEMY_HUD_CARD_STACK_OFFSET_Y,
  ENEMY_HUD_CARD_WIDTH,
  ENEMY_HUD_CARD_PAD_BOTTOM,
  ENEMY_HUD_HP_TRACK_LEFT_IN_CARD,
  ENEMY_HUD_HP_TRACK_WIDTH,
  ENEMY_HUD_MAX_VISIBLE_STACK,
  computeEnemyHudExpandedFootprint,
  enemyHudCardStackOffset,
  enemyHudExpandedCardOffset,
  enemyHudHpTrackLeftInCard,
  resolveEnemyHudCardStackLayout,
} from './enemyHudCardStack.ts';
import {
  ENEMY_HUD_STATUS_ROW_HEIGHT,
} from './enemyHudStatusRow.ts';
import {
  buildPartyHudStatusBadgeCanvasSignature,
  buildPartyHudStatusBadgeHitSignature,
  drawEnemyHudStatusRow,
  measureEnemyHudStatusRow,
  selectEnemyHudStatusBadges,
  syncEnemyHudStatusBadgeHits,
} from './enemyHudStatusRow.ts';
import type { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';
import { snapHudCanvasCssSize } from './battleRootScale.ts';
import {
  computeEnemyHudPanelHeight,
  ENEMY_HUD_SLOT_GAP,
  ENEMY_HUD_SLOT_HEIGHT,
  ENEMY_HUD_SLOT_WIDTH,
} from './battleRootLayout.ts';
import type { GameTermPanel } from './GameTermPanel.ts';
import {
  captureEnemyHudGroupRects,
  hasEnemyHudGroupOrderChanged,
  playEnemyHudGroupSlide,
  resetEnemyHudGroupSlideTransforms,
} from './enemyHudGroupSlide.ts';

interface EnemyCardElements {
  root: HTMLElement;
  variant: 'front' | 'back';
  labelName: HTMLElement;
  countBadge: HTMLElement;
  icon: HTMLImageElement;
  hpFill: HTMLElement;
  barrierLayer: HTMLElement;
  statusBadgeWrap: HTMLElement;
  statusCanvas: HTMLCanvasElement;
  statusBadgeHitLayer: HTMLElement;
  statusBadgeRenderSignature: string | null;
  statusBadgeHitSignature: string | null;
  hpBarSignature: string | null;
  statusMiniWrap: HTMLElement;
  statusMiniCanvas: HTMLCanvasElement;
  statusMiniSignature: string | null;
  dangerTelegraph: HTMLElement;
  dangerTelegraphFill: HTMLElement;
}

interface GroupSlotElements {
  root: HTMLElement;
  slotIndex: number;
  stackRoot: HTMLElement;
  stackOverflow: HTMLElement;
  frontCard: EnemyCardElements;
  backCards: EnemyCardElements[];
  extraCards: EnemyCardElements[];
}

type HpBarHost = Pick<
  EnemyCardElements,
  'hpFill' | 'barrierLayer' | 'hpBarSignature'
>;

export type EnemyHudGroupClickAction = 'expand' | 'collapse';

export interface EnemyHudPanelOptions {
  layout?: 'overlay-top';
  floatingTooltip?: PartyHudFloatingTooltip;
  gameTermPanel?: GameTermPanel;
  onHoverHighlightStart?: (unitIds: readonly string[]) => void;
  onHoverHighlightEnd?: () => void;
  onGroupClick?: (groupId: string, action: EnemyHudGroupClickAction) => void;
}

export interface EnemyHudUpdateContext {
  waveIndex: number;
}

const ENEMY_HUD_PANEL_TRANSITION_MS = 260;

export class EnemyHudPanel {
  private root!: HTMLElement;
  private slotsBody!: HTMLElement;
  private readonly slots: GroupSlotElements[] = [];
  private theme!: BattleHudTheme;
  private lastDisplayedGroups: EnemyHudGroup[] = [];
  private lastWaveIndex = -1;
  private panelCollapseTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverHighlightUnitIds: ReadonlySet<string> = new Set();
  private expandedGroupIds: ReadonlySet<string> = new Set();
  private readonly unsubscribeStatusIconsReady: () => void;

  constructor(
    private readonly themeHost: HTMLElement,
    private readonly options: EnemyHudPanelOptions = {},
  ) {
    this.unsubscribeStatusIconsReady = onStatusIconsReady(() => {
      this.invalidateStatusRenderSignatures();
      if (this.lastDisplayedGroups.length > 0) {
        this.updateDisplayedGroups(this.lastDisplayedGroups, null);
      }
    });
  }

  mount(parent: HTMLElement): void {
    this.theme = readBattleHudTheme(this.themeHost);
    const root = document.createElement('div');
    this.root = root;
    root.className = 'enemy-hud-panel';
    if (this.options.layout === 'overlay-top') {
      root.classList.add('enemy-hud-panel--overlay-top');
      root.style.setProperty('--enemy-hud-slot-gap', `${ENEMY_HUD_SLOT_GAP}px`);
      root.style.setProperty('--enemy-hud-slot-w', `${ENEMY_HUD_SLOT_WIDTH}px`);
      root.style.setProperty('--enemy-hud-slot-h', `${ENEMY_HUD_SLOT_HEIGHT}px`);
      root.style.setProperty('--enemy-hud-card-w', `${ENEMY_HUD_CARD_WIDTH}px`);
      root.style.setProperty('--enemy-hud-card-h', `${ENEMY_HUD_CARD_HEIGHT}px`);
      root.style.setProperty(
        '--enemy-hud-status-h',
        `${ENEMY_HUD_STATUS_ROW_HEIGHT}px`,
      );
      root.style.setProperty(
        '--enemy-hud-stack-offset-x',
        `${ENEMY_HUD_CARD_STACK_OFFSET_X}px`,
      );
      root.style.setProperty(
        '--enemy-hud-stack-offset-y',
        `${ENEMY_HUD_CARD_STACK_OFFSET_Y}px`,
      );
      root.style.setProperty(
        '--enemy-hud-hp-track-w',
        `${ENEMY_HUD_HP_TRACK_WIDTH}px`,
      );
      root.style.setProperty(
        '--enemy-hud-card-pad-bottom',
        `${ENEMY_HUD_CARD_PAD_BOTTOM}px`,
      );
    }

    const slotsBody = document.createElement('div');
    slotsBody.className = 'enemy-hud-panel-slots';
    this.slotsBody = slotsBody;

    root.appendChild(slotsBody);
    parent.appendChild(root);
  }

  update(groups: EnemyHudGroup[], context?: EnemyHudUpdateContext): void {
    const waveIndex = context?.waveIndex ?? this.lastWaveIndex;
    const aliveGroups = groups.filter((group) => group.count > 0);
    const prevAliveCount = this.lastDisplayedGroups.length;
    const nextAliveCount = aliveGroups.length;
    const waveChanged =
      waveIndex !== this.lastWaveIndex && this.lastWaveIndex >= 0;
    const waveInitialized = this.lastWaveIndex >= 0;
    const groupOrderChanged = hasEnemyHudGroupOrderChanged(
      this.lastDisplayedGroups.map((group) => group.groupId),
      aliveGroups.map((group) => group.groupId),
    );
    const slideGroups =
      waveInitialized &&
      !waveChanged &&
      groupOrderChanged &&
      this.lastDisplayedGroups.length > 0;
    const slotRoots = this.slots.map((slot) => slot.root);
    let groupRectsBeforeUpdate: Map<string, DOMRect> | null = null;
    if (slideGroups) {
      resetEnemyHudGroupSlideTransforms(slotRoots);
      groupRectsBeforeUpdate = captureEnemyHudGroupRects(slotRoots);
    }

    if (waveChanged || (!waveInitialized && nextAliveCount > 0)) {
      this.clearPanelCollapseTimer();
      this.root.classList.remove('enemy-hud-panel--collapsed');
      this.root.classList.add('enemy-hud-panel--expanding');
    } else if (prevAliveCount > 0 && nextAliveCount === 0) {
      this.triggerPanelCollapse();
    }

    this.lastWaveIndex = waveIndex;
    this.updateDisplayedGroups(aliveGroups, groupRectsBeforeUpdate);
  }

  setHoverHighlightUnitId(unitId: string | null): void {
    this.setHoverHighlightUnitIds(unitId ? [unitId] : []);
  }

  setHoverHighlightUnitIds(unitIds: readonly string[]): void {
    this.hoverHighlightUnitIds = new Set(unitIds);
    for (const group of this.lastDisplayedGroups) {
      const slot = this.findSlotForGroupId(group.groupId);
      if (slot) this.syncSlotHighlightClasses(slot, group);
    }
  }

  setExpandedGroupIds(groupIds: ReadonlySet<string>): void {
    const next = new Set(groupIds);
    if (areSetsEqual(this.expandedGroupIds, next)) return;
    this.expandedGroupIds = next;
    if (this.lastDisplayedGroups.length > 0) {
      this.updateDisplayedGroups(this.lastDisplayedGroups, null);
    }
  }

  destroy(): void {
    this.clearPanelCollapseTimer();
    this.unsubscribeStatusIconsReady();
    this.root.remove();
  }

  private clearPanelCollapseTimer(): void {
    if (this.panelCollapseTimer === null) return;
    clearTimeout(this.panelCollapseTimer);
    this.panelCollapseTimer = null;
  }

  private triggerPanelCollapse(): void {
    this.clearPanelCollapseTimer();
    this.root.classList.add('enemy-hud-panel--collapsing');
    this.root.classList.remove('enemy-hud-panel--expanding');
    this.syncPanelLayout(0);
    this.panelCollapseTimer = setTimeout(() => {
      this.panelCollapseTimer = null;
      this.root.classList.add('enemy-hud-panel--collapsed');
      this.root.classList.remove('enemy-hud-panel--collapsing');
    }, ENEMY_HUD_PANEL_TRANSITION_MS);
  }

  private updateDisplayedGroups(
    aliveGroups: EnemyHudGroup[],
    groupRectsBeforeUpdate: Map<string, DOMRect> | null,
  ): void {
    this.lastDisplayedGroups = aliveGroups;

    while (this.slots.length < aliveGroups.length) {
      const slot = this.createGroupSlot(this.slots.length);
      this.slots.push(slot);
      this.slotsBody.appendChild(slot.root);
    }

    // Slots stay in index order, so never re-append connected slot roots here:
    // detaching a node between mousedown and mouseup makes Chromium suppress
    // the click, which broke group expand/pause for real mouse presses.
    for (let i = 0; i < aliveGroups.length; i++) {
      const slot = this.slots[i];
      const group = aliveGroups[i];
      slot.root.hidden = false;
      slot.root.dataset.enemyGroupId = group.groupId;
      slot.root.dataset.enemyUnitId = group.representativeEnemy.id;
      this.updateGroupSlot(slot, group);
      this.syncSlotHighlightClasses(slot, group);
    }

    for (let i = aliveGroups.length; i < this.slots.length; i++) {
      this.slots[i].root.hidden = true;
    }

    if (aliveGroups.length > 0) {
      this.syncPanelLayout(aliveGroups.length);
      this.root.classList.remove('enemy-hud-panel--collapsed');
      window.requestAnimationFrame(() => {
        this.root.classList.remove('enemy-hud-panel--expanding');
        if (groupRectsBeforeUpdate) {
          playEnemyHudGroupSlide(
            this.slots.map((slot) => slot.root),
            groupRectsBeforeUpdate,
          );
        }
      });
    }
  }

  private findSlotForGroupId(groupId: string): GroupSlotElements | undefined {
    return this.slots.find(
      (slot) => !slot.root.hidden && slot.root.dataset.enemyGroupId === groupId,
    );
  }

  private syncPanelLayout(aliveCount: number): void {
    const height = computeEnemyHudPanelHeight(aliveCount);
    if (this.options.layout === 'overlay-top') {
      if (aliveCount <= 0) {
        this.root.style.setProperty('--enemy-hud-panel-h', '0px');
      }
      return;
    }
    this.root.style.setProperty('--enemy-hud-panel-h', `${height}px`);
  }

  private invalidateStatusRenderSignatures(): void {
    for (const slot of this.slots) {
      slot.frontCard.statusBadgeRenderSignature = null;
      for (const back of slot.backCards) {
        back.statusMiniSignature = null;
      }
      for (const extra of slot.extraCards) {
        extra.statusBadgeRenderSignature = null;
      }
    }
  }

  private createGroupSlot(slotIndex: number): GroupSlotElements {
    const root = document.createElement('div');
    root.className = 'enemy-hud-slot enemy-hud-group';
    root.dataset.enemyHudSlotIndex = String(slotIndex);

    const stackRoot = document.createElement('div');
    stackRoot.className = 'enemy-hud-card-stack';

    const stackOverflow = document.createElement('span');
    stackOverflow.className = 'enemy-hud-stack-overflow';
    stackOverflow.hidden = true;

    const backCards: EnemyCardElements[] = [];
    for (let i = 0; i < ENEMY_HUD_MAX_VISIBLE_STACK - 1; i++) {
      backCards.push(this.createEnemyCard('back'));
    }

    const frontCard = this.createEnemyCard('front');
    stackRoot.append(
      stackOverflow,
      ...backCards.map((card) => card.root),
      frontCard.root,
    );
    root.appendChild(stackRoot);

    this.bindFieldLinkHover(root, slotIndex);
    this.bindGroupClick(root);

    return {
      root,
      slotIndex,
      stackRoot,
      stackOverflow,
      frontCard,
      backCards,
      extraCards: [],
    };
  }

  private createEnemyCard(variant: 'front' | 'back'): EnemyCardElements {
    const root = document.createElement('div');
    root.className =
      variant === 'front'
        ? 'enemy-hud-card enemy-hud-card--front'
        : 'enemy-hud-card enemy-hud-card--back';

    const main = document.createElement('div');
    main.className = 'enemy-hud-card-main';

    const iconWrap = document.createElement('div');
    iconWrap.className =
      'enemy-hud-icon-wrap pixel-icon-frame pixel-icon-frame--24';

    const icon = document.createElement('img');
    icon.className = 'enemy-hud-icon pixel-icon-img pixel-icon-img--24';
    icon.width = 24;
    icon.height = 24;
    icon.alt = '';
    iconWrap.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'enemy-hud-card-body';

    const info = document.createElement('div');
    info.className = 'enemy-hud-card-info';

    const label = document.createElement('div');
    label.className = 'enemy-hud-label';

    const labelName = document.createElement('span');
    labelName.className = 'enemy-hud-label-name';

    const countBadge = document.createElement('span');
    countBadge.className = 'enemy-hud-count-badge';
    countBadge.hidden = true;
    label.append(labelName, countBadge);

    const statusBadgeWrap = document.createElement('div');
    statusBadgeWrap.className = 'enemy-hud-status-badges-wrap';

    const statusCanvas = document.createElement('canvas');
    statusCanvas.className = 'enemy-hud-status-badges status-badge-canvas';
    statusBadgeWrap.appendChild(statusCanvas);

    const statusBadgeHitLayer = document.createElement('div');
    statusBadgeHitLayer.className = 'party-hud-status-badge-hits';
    statusBadgeWrap.appendChild(statusBadgeHitLayer);

    const dangerTelegraph = document.createElement('div');
    dangerTelegraph.className =
      'enemy-hud-danger-telegraph enemy-hud-danger-telegraph--inactive';
    const dangerTelegraphFill = document.createElement('div');
    dangerTelegraphFill.className = 'enemy-hud-danger-telegraph-fill';
    dangerTelegraph.appendChild(dangerTelegraphFill);

    info.append(label, statusBadgeWrap, dangerTelegraph);

    const hpRow = document.createElement('div');
    hpRow.className = 'enemy-hud-hp-row';

    const hpTrack = document.createElement('div');
    hpTrack.className = 'enemy-hud-hp-track';

    const hpFill = document.createElement('div');
    hpFill.className = 'enemy-hud-hp-fill';
    hpTrack.appendChild(hpFill);

    const barrierLayer = document.createElement('div');
    barrierLayer.className = 'enemy-hud-barrier-layer';
    hpTrack.appendChild(barrierLayer);

    const statusMiniWrap = document.createElement('div');
    statusMiniWrap.className = 'enemy-hud-card-status-mini';

    const statusMiniCanvas = document.createElement('canvas');
    statusMiniCanvas.className = 'enemy-hud-card-status-mini-canvas';
    statusMiniWrap.appendChild(statusMiniCanvas);

    hpRow.append(hpTrack, statusMiniWrap);
    body.append(info, hpRow);
    main.append(iconWrap, body);
    root.appendChild(main);

    return {
      root,
      variant,
      labelName,
      countBadge,
      icon,
      hpFill,
      barrierLayer,
      statusBadgeWrap,
      statusCanvas,
      statusBadgeHitLayer,
      statusBadgeRenderSignature: null,
      statusBadgeHitSignature: null,
      hpBarSignature: null,
      statusMiniWrap,
      statusMiniCanvas,
      statusMiniSignature: null,
      dangerTelegraph,
      dangerTelegraphFill,
    };
  }

  private updateGroupSlot(slot: GroupSlotElements, group: EnemyHudGroup): void {
    const expanded = this.expandedGroupIds.has(group.groupId);
    slot.root.classList.toggle('enemy-hud-group--expanded', expanded);
    slot.stackRoot.classList.toggle('enemy-hud-card-stack--expanded', expanded);

    if (expanded) {
      this.updateExpandedGroupSlot(slot, group);
      return;
    }

    this.updateCollapsedGroupSlot(slot, group);
  }

  private updateCollapsedGroupSlot(
    slot: GroupSlotElements,
    group: EnemyHudGroup,
  ): void {
    slot.root.style.removeProperty('--enemy-hud-expanded-slot-h');
    slot.root.style.height = '';
    slot.root.style.minHeight = '';
    slot.root.style.maxHeight = '';

    for (const card of slot.extraCards) {
      card.root.hidden = true;
    }

    const stackLayout = resolveEnemyHudCardStackLayout(group.count);
    const { footprint, visibleCount, hiddenCount } = stackLayout;

    slot.stackRoot.style.width = '100%';
    slot.stackRoot.style.height = '100%';

    if (hiddenCount > 0) {
      slot.stackOverflow.hidden = false;
      slot.stackOverflow.textContent = `+${hiddenCount}`;
    } else {
      slot.stackOverflow.hidden = true;
      slot.stackOverflow.textContent = '';
    }

    const backCount = Math.max(0, visibleCount - 1);
    for (let i = 0; i < slot.backCards.length; i++) {
      const card = slot.backCards[i]!;
      if (i < backCount) {
        const entry = group.enemies[i + 1]!;
        this.positionStackCard(card.root, i + 1, visibleCount);
        card.root.hidden = false;
        card.root.classList.remove('enemy-hud-card--expanded-individual');
        card.root.classList.remove('enemy-hud-card--expanded-top');
        this.updateBackCard(card, entry);
      } else {
        card.root.hidden = true;
      }
    }

    this.positionStackCard(slot.frontCard.root, 0, visibleCount);
    slot.frontCard.root.classList.remove('enemy-hud-card--expanded-individual');
    this.updateFrontCard(slot, group);

    slot.root.dataset.enemyId = group.representativeEnemy.id;
  }

  private updateExpandedGroupSlot(
    slot: GroupSlotElements,
    group: EnemyHudGroup,
  ): void {
    const footprint = computeEnemyHudExpandedFootprint(group.count);
    slot.stackRoot.style.width = `${footprint.width}px`;
    slot.stackRoot.style.height = `${footprint.height}px`;
    slot.stackOverflow.hidden = true;
    slot.stackOverflow.textContent = '';

    slot.root.style.setProperty('--enemy-hud-expanded-slot-h', `${footprint.height}px`);
    slot.root.style.height = `${footprint.height}px`;
    slot.root.style.minHeight = `${footprint.height}px`;
    slot.root.style.maxHeight = 'none';

    const cards = this.ensureExpandedCardPool(slot, group.count);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]!;
      if (i < group.count) {
        const entry = group.enemies[i]!;
        const offset = enemyHudExpandedCardOffset(i);
        card.root.hidden = false;
        card.root.classList.add('enemy-hud-card--expanded-individual');
        if (i === 0) {
          card.root.classList.add('enemy-hud-card--expanded-top');
        } else {
          card.root.classList.remove('enemy-hud-card--expanded-top');
        }
        card.root.style.left = `${offset.x}px`;
        card.root.style.top = `${offset.y}px`;
        card.root.style.zIndex = String(i + 1);
        card.root.style.setProperty(
          '--enemy-hud-hp-track-left',
          `${enemyHudHpTrackLeftInCard(0)}px`,
        );
        card.root.style.setProperty('--enemy-hud-hp-track-z', '1');
        card.root.dataset.enemyUnitId = entry.id;
        this.updateExpandedIndividualCard(slot, card, group, entry, i);
        this.bindExpandedCardHover(card);
      } else {
        card.root.hidden = true;
        card.root.classList.remove('enemy-hud-card--expanded-individual');
        card.root.classList.remove('enemy-hud-card--expanded-top');
        card.root.removeAttribute('data-enemy-unit-id');
      }
    }

    slot.root.dataset.enemyId = group.representativeEnemy.id;
  }

  private ensureExpandedCardPool(
    slot: GroupSlotElements,
    count: number,
  ): EnemyCardElements[] {
    const pool = [slot.frontCard, ...slot.backCards, ...slot.extraCards];
    while (pool.length < count) {
      const card = this.createEnemyCard('front');
      slot.extraCards.push(card);
      slot.stackRoot.appendChild(card.root);
      pool.push(card);
    }
    return pool;
  }

  private updateExpandedIndividualCard(
    slot: GroupSlotElements,
    card: EnemyCardElements,
    group: EnemyHudGroup,
    entry: EnemyHudEntry,
    memberIndex: number,
  ): void {
    card.labelName.textContent =
      group.count > 1
        ? `${group.representativeName} ${memberIndex + 1}`
        : group.representativeName;
    card.countBadge.hidden = true;
    card.countBadge.textContent = '';

    const iconUrl = getClassIconUrl(group.representativeIcon);
    if (iconUrl) {
      card.icon.src = iconUrl;
      card.icon.style.backgroundColor = '';
    } else {
      card.icon.removeAttribute('src');
      card.icon.style.backgroundColor = resolveClassIconPlaceholderColor(
        group.representativeIcon,
        this.theme,
      );
    }

    this.updateHpBar(card, entry);
    card.statusMiniWrap.hidden = true;
    card.statusMiniCanvas.hidden = true;
    this.updateIndividualStatusBadges(slot, card, entry, memberIndex);
    this.updateEntryDangerTelegraph(card, entry);
  }

  private updateIndividualStatusBadges(
    slot: GroupSlotElements,
    card: EnemyCardElements,
    entry: EnemyHudEntry,
    memberIndex: number,
  ): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      res: entry.res,
    });
    const { visible, overflowCount } = selectEnemyHudStatusBadges(badges);
    const canvas = card.statusCanvas;
    const theme = this.theme;
    const scale = 1;
    const rowLayout = measureEnemyHudStatusRow(scale, theme, overflowCount);
    const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
    const canvasW = snapHudCanvasCssSize(rowLayout.totalWidth + outlinePad * 2);
    const canvasH = snapHudCanvasCssSize(rowLayout.totalHeight + outlinePad * 2);
    const statusSlotKey = slot.slotIndex * 100 + memberIndex;
    const canvasSignature = buildPartyHudStatusBadgeCanvasSignature(
      visible,
      overflowCount,
      statusSlotKey,
      canvasW,
      canvasH,
    );
    const hitSignature = buildPartyHudStatusBadgeHitSignature(
      visible,
      overflowCount,
      statusSlotKey,
    );
    const canvasUnchanged = canvasSignature === card.statusBadgeRenderSignature;
    const hitsUnchanged = hitSignature === card.statusBadgeHitSignature;
    if (canvasUnchanged && hitsUnchanged) {
      return;
    }

    if (!canvasUnchanged) {
      card.statusBadgeRenderSignature = canvasSignature;
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
      card.statusBadgeHitLayer.replaceChildren();
      card.statusBadgeHitSignature = null;
      canvas.hidden = true;
      return;
    }

    if (!hitsUnchanged) {
      card.statusBadgeHitSignature = hitSignature;
      syncEnemyHudStatusBadgeHits(
        card.statusBadgeHitLayer,
        badges,
        visible,
        overflowCount,
        theme,
        statusSlotKey,
        {
          floatingTooltip: this.options.floatingTooltip ?? null,
          gameTermPanel: this.options.gameTermPanel ?? null,
        },
      );
    }
  }

  private updateEntryDangerTelegraph(
    card: EnemyCardElements,
    entry: EnemyHudEntry,
  ): void {
    const active = entry.dangerTelegraphActive === true;
    const progress = Math.max(0, Math.min(1, entry.dangerTelegraphProgress ?? 0));

    card.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--active',
      active,
    );
    card.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--inactive',
      !active,
    );
    card.dangerTelegraphFill.style.width = active ? `${progress * 100}%` : '0%';
  }

  private positionStackCard(
    card: HTMLElement,
    depth: number,
    visibleCount: number,
  ): void {
    const offset = enemyHudCardStackOffset(depth);
    card.style.left = `${offset.x}px`;
    card.style.top = `${offset.y}px`;
    card.style.zIndex = String(visibleCount - depth);
    card.style.setProperty(
      '--enemy-hud-hp-track-left',
      `${enemyHudHpTrackLeftInCard(depth)}px`,
    );
    card.style.setProperty('--enemy-hud-hp-track-z', String(depth + 1));
  }

  private updateFrontCard(slot: GroupSlotElements, group: EnemyHudGroup): void {
    const card = slot.frontCard;
    const entry = group.representativeEnemy;

    card.labelName.textContent = group.representativeName;
    if (group.count > 1) {
      card.countBadge.hidden = false;
      card.countBadge.textContent = `×${group.count}`;
    } else {
      card.countBadge.hidden = true;
      card.countBadge.textContent = '';
    }

    const iconUrl = getClassIconUrl(group.representativeIcon);
    if (iconUrl) {
      card.icon.src = iconUrl;
      card.icon.style.backgroundColor = '';
    } else {
      card.icon.removeAttribute('src');
      card.icon.style.backgroundColor = resolveClassIconPlaceholderColor(
        group.representativeIcon,
        this.theme,
      );
    }

    this.updateHpBar(card, entry);
    card.statusMiniWrap.hidden = true;
    card.statusMiniCanvas.hidden = true;
    this.updateFrontStatusBadges(slot, group);
    this.updateDangerTelegraph(card, group);
  }

  private updateBackCard(card: EnemyCardElements, entry: EnemyHudEntry): void {
    this.updateHpBar(card, entry);
    this.updateBackStatusMini(card, entry);
  }

  private updateHpBar(host: HpBarHost, entry: EnemyHudEntry): void {
    const signature = `${entry.hp}|${entry.maxHp}|${entry.barrierHp}|${entry.isAlive}`;
    if (signature === host.hpBarSignature) return;
    host.hpBarSignature = signature;

    const layout = layoutHpBarBarrier(0, 100, entry.hp, entry.maxHp, entry.barrierHp);
    host.hpFill.style.width = layout ? `${layout.hpWidth}%` : '0%';

    host.barrierLayer.replaceChildren();
    if (!layout) return;

    for (const segment of layout.tier1) {
      const seg = document.createElement('div');
      seg.className = 'enemy-hud-barrier-seg';
      seg.style.left = `${segment.x}%`;
      seg.style.width = `${segment.width}%`;
      host.barrierLayer.appendChild(seg);
    }

    if (entry.maxHp > 0 && entry.barrierHp > entry.maxHp) {
      const overflow = document.createElement('div');
      overflow.className = 'enemy-hud-barrier-overflow';
      overflow.style.width = `${((entry.barrierHp - entry.maxHp) / entry.maxHp) * 100}%`;
      host.barrierLayer.appendChild(overflow);
    }
  }

  private updateFrontStatusBadges(
    slot: GroupSlotElements,
    group: EnemyHudGroup,
  ): void {
    const card = slot.frontCard;
    const entry = group.representativeEnemy;
    const badges = collectStatusEffectBadgeDisplays(group.importantStates, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      res: entry.res,
    });
    const { visible, overflowCount } = selectEnemyHudStatusBadges(badges);
    const canvas = card.statusCanvas;
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
    const canvasUnchanged = canvasSignature === card.statusBadgeRenderSignature;
    const hitsUnchanged = hitSignature === card.statusBadgeHitSignature;
    if (canvasUnchanged && hitsUnchanged) {
      return;
    }

    if (!canvasUnchanged) {
      card.statusBadgeRenderSignature = canvasSignature;
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
      card.statusBadgeHitLayer.replaceChildren();
      card.statusBadgeHitSignature = null;
      canvas.hidden = true;
      return;
    }

    if (!hitsUnchanged) {
      card.statusBadgeHitSignature = hitSignature;
      syncEnemyHudStatusBadgeHits(
        card.statusBadgeHitLayer,
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

  private updateBackStatusMini(card: EnemyCardElements, entry: EnemyHudEntry): void {
    const badges = collectStatusEffectBadgeDisplays(entry.statusEffects, {
      baseMaxHp: entry.baseMaxHp,
      atk: entry.atk,
      def: entry.def,
      res: entry.res,
    });
    const signature = badges.map((b) => b.id).join('|');
    if (signature === card.statusMiniSignature) return;
    card.statusMiniSignature = signature;

    const canvas = card.statusMiniCanvas;
    if (badges.length === 0) {
      canvas.hidden = true;
      card.statusMiniWrap.hidden = true;
      return;
    }

    card.statusMiniWrap.hidden = false;
    canvas.hidden = false;
    const theme = this.theme;
    const scale = 1;
    const miniVisible = badges.slice(0, 2);
    const miniOverflow = badges.length > 2 ? badges.length - 2 : 0;
    const rowLayout = measureEnemyHudStatusRow(scale, theme, miniOverflow);
    const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
    const canvasW = snapHudCanvasCssSize(rowLayout.totalWidth + outlinePad * 2);
    const canvasH = snapHudCanvasCssSize(rowLayout.totalHeight + outlinePad * 2);
    canvas.width = canvasW;
    canvas.height = canvasH;
    const w = `${canvasW}px`;
    const h = `${canvasH}px`;
    canvas.style.width = w;
    canvas.style.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasW, canvasH);
    drawEnemyHudStatusRow(
      ctx,
      outlinePad,
      outlinePad,
      miniVisible,
      miniOverflow,
      scale,
      theme,
    );
  }

  private updateDangerTelegraph(
    card: EnemyCardElements,
    group: EnemyHudGroup,
  ): void {
    const active = group.dangerState.telegraphActive === true;
    const progress = Math.max(
      0,
      Math.min(1, group.dangerState.telegraphProgress),
    );

    card.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--active',
      active,
    );
    card.dangerTelegraph.classList.toggle(
      'enemy-hud-danger-telegraph--inactive',
      !active,
    );
    card.dangerTelegraphFill.style.width = active ? `${progress * 100}%` : '0%';
  }

  private bindFieldLinkHover(root: HTMLElement, _slotIndex: number): void {
    root.addEventListener('mouseenter', () => {
      const groupId = root.dataset.enemyGroupId;
      if (!groupId) return;
      const group = this.lastDisplayedGroups.find((g) => g.groupId === groupId);
      if (!group) return;
      this.options.onHoverHighlightStart?.(
        group.enemies.map((enemy) => enemy.id),
      );
    });
    root.addEventListener('mouseleave', (event) => {
      if (this.shouldRetainFieldLinkHover(event.relatedTarget)) return;
      this.options.onHoverHighlightEnd?.();
    });
  }

  /**
   * Capture-phase listener on the group root so pointer-events:none cards and
   * badge hit overlays still share one expand/collapse path (battle-field.md §8.11.2).
   */
  private bindGroupClick(root: HTMLElement): void {
    root.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('.party-hud-status-badge-hit--interactive')) return;

        const groupId = root.dataset.enemyGroupId;
        if (!groupId) return;

        if (this.expandedGroupIds.has(groupId)) {
          if (!target.closest('.enemy-hud-card--expanded-top')) return;
          event.stopPropagation();
          this.options.onGroupClick?.(groupId, 'collapse');
          return;
        }

        event.stopPropagation();
        this.options.onGroupClick?.(groupId, 'expand');
      },
      true,
    );
  }

  private bindExpandedCardHover(card: EnemyCardElements): void {
    if (card.root.dataset.expandedHoverBound === '1') return;
    card.root.dataset.expandedHoverBound = '1';

    card.root.addEventListener('mouseenter', () => {
      const unitId = card.root.dataset.enemyUnitId;
      if (!unitId) return;
      this.options.onHoverHighlightStart?.([unitId]);
    });
    card.root.addEventListener('mouseleave', (event) => {
      if (this.shouldRetainFieldLinkHover(event.relatedTarget)) return;
      const related = event.relatedTarget;
      if (related instanceof Element) {
        const slotRoot = card.root.closest('.enemy-hud-group');
        if (
          slotRoot?.contains(related) &&
          related.closest('.enemy-hud-card--expanded-individual')
        ) {
          return;
        }
        if (slotRoot?.contains(related)) {
          const groupId = slotRoot.dataset.enemyGroupId;
          const group = groupId
            ? this.lastDisplayedGroups.find((g) => g.groupId === groupId)
            : undefined;
          if (group) {
            this.options.onHoverHighlightStart?.(
              group.enemies.map((enemy) => enemy.id),
            );
            return;
          }
        }
      }
      this.options.onHoverHighlightEnd?.();
    });
  }

  private shouldRetainFieldLinkHover(relatedTarget: EventTarget | null): boolean {
    if (!(relatedTarget instanceof Element)) return false;
    return (
      relatedTarget.closest('.party-hud-floating-tooltip') !== null ||
      relatedTarget.closest('.game-term-panel--hud-layer') !== null
    );
  }

  private syncSlotHighlightClasses(
    slot: GroupSlotElements,
    group: EnemyHudGroup,
  ): void {
    const expanded = this.expandedGroupIds.has(group.groupId);
    const highlightedIds = group.enemies.filter((enemy) =>
      this.hoverHighlightUnitIds.has(enemy.id),
    );
    const hasHighlight = highlightedIds.length > 0;
    const isIndividualHover =
      expanded && hasHighlight && this.hoverHighlightUnitIds.size === 1;

    slot.root.classList.toggle(
      'enemy-hud-slot--hover-highlight',
      hasHighlight && !isIndividualHover,
    );

    if (!expanded) return;

    const cards = this.ensureExpandedCardPool(slot, group.count);
    for (let i = 0; i < group.count; i++) {
      const card = cards[i];
      const entry = group.enemies[i];
      if (!card || !entry) continue;
      const strong = isIndividualHover && this.hoverHighlightUnitIds.has(entry.id);
      const light = hasHighlight && !isIndividualHover && this.hoverHighlightUnitIds.has(entry.id);
      card.root.classList.toggle('enemy-hud-card--hover-highlight-strong', strong);
      card.root.classList.toggle('enemy-hud-card--hover-highlight-light', light);
    }
  }
}

function areSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}
