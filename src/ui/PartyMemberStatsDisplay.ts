import '../styles/party-member-stats.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot } from '../battle/types.ts';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import {
  collectStatusEffectBadgeDisplays,
  sortBadgesForDetailView,
} from '../battle/statusEffectDisplay.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import { onStatusIconsReady } from '../render/StatusIconRegistry.ts';
import {
  readBattleHudTheme,
  resolveClassIconPlaceholderColor,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from '../render/battleHudTheme.ts';
import {
  drawStatusBadgeWrap,
  measureStatusBadgeWrap,
  PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  prepareStatusBadgeCanvasContext,
  quantizeBadgeOverlayStep,
  statusBadgeOutlinePad,
} from '../render/statusBadgeRenderer.ts';
import {
  DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
  buildDetailStatusBadgeHitSignature,
  syncDetailStatusBadgeHits,
} from './partyHudStatusBadgeHits.ts';
import type { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';

export interface PartyMemberStatsFrame {
  snapshots: CombatantSnapshot[];
  displayRows: StageDamageDisplayRow[];
}

export interface PartyMemberStatsRowSpec {
  slotIndex: number;
  displayName: string;
  iconKey?: string;
}

export interface PartyMemberStatsDataSource {
  getDisplayRows: () => StageDamageDisplayRow[];
  getAllySnapshots: () => CombatantSnapshot[];
}

export interface MemberRowRefs {
  root: HTMLElement;
}

export interface ThreatBarRefs {
  root: HTMLElement;
  fill: HTMLElement;
  baseMarker: HTMLElement;
  label: HTMLElement;
  lastSyncKey?: string;
}

export interface DamageBarRefs {
  root: HTMLElement;
  dealtFill: HTMLElement;
  takenFill: HTMLElement;
  label: HTMLElement;
  lastSyncKey?: string;
}

export interface StatusBadgeRefs {
  root: HTMLElement;
  debuffCanvas: HTMLCanvasElement;
  buffCanvas: HTMLCanvasElement;
  debuffHitLayer: HTMLElement;
  buffHitLayer: HTMLElement;
  debuffRenderSignature?: string;
  buffRenderSignature?: string;
  debuffHitSignature?: string;
  buffHitSignature?: string;
}

export function buildDetailStatusBadgeSignature(
  badges: StatusEffectBadgeDisplay[],
): string {
  if (badges.length === 0) return '';
  return badges
    .map(
      (badge) =>
        `${badge.category}:${badge.kind}:${badge.isPassive ? 1 : 0}:${badge.stackCount ?? 1}:${quantizeBadgeOverlayStep(badge.remainingRatio)}`,
    )
    .join('|');
}

function isAllyDown(snapshot: CombatantSnapshot): boolean {
  return snapshot.hp <= 0;
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

function createClassIcon(iconKey: string): HTMLElement {
  const wrap = el(
    'span',
    'party-stats-member-icon pixel-icon-frame pixel-icon-frame--24',
  );
  const iconUrl = getClassIconUrl(iconKey);
  if (iconUrl) {
    const img = document.createElement('img');
    img.className = 'party-stats-member-icon-img pixel-icon-img pixel-icon-img--24';
    img.width = 24;
    img.height = 24;
    img.alt = '';
    img.decoding = 'async';
    img.src = iconUrl;
    img.setAttribute('aria-hidden', 'true');
    wrap.appendChild(img);
    return wrap;
  }

  wrap.classList.add('party-stats-member-icon--empty');
  wrap.setAttribute('aria-hidden', 'true');
  const themeHost = document.querySelector('.battle-view');
  if (themeHost instanceof HTMLElement) {
    wrap.style.backgroundColor = resolveClassIconPlaceholderColor(
      iconKey,
      readBattleHudTheme(themeHost),
    );
  }
  return wrap;
}

function appendMemberIdentity(
  memberEl: HTMLElement,
  displayName: string,
  iconKey?: string,
): void {
  const nameEl = el('span', 'party-stats-member-name', displayName);

  if (!iconKey) {
    memberEl.appendChild(nameEl);
    return;
  }

  memberEl.classList.add('party-stats-member--with-icon');
  memberEl.appendChild(createClassIcon(iconKey));

  const textEl = el('div', 'party-stats-member-text');
  textEl.appendChild(nameEl);
  memberEl.appendChild(textEl);
}

export function createStatusBadgeGroupWithHits(labelText: string): {
  group: HTMLElement;
  canvas: HTMLCanvasElement;
  hitLayer: HTMLElement;
} {
  const group = el('div', 'party-stats-status-group');
  group.appendChild(el('span', 'party-stats-status-label', labelText));
  const wrap = el('div', 'party-stats-status-canvas-wrap');
  const canvas = document.createElement('canvas');
  canvas.className = 'party-stats-status-canvas status-badge-canvas';
  const hitLayer = document.createElement('div');
  hitLayer.className = 'party-hud-status-badge-hits';
  wrap.append(canvas, hitLayer);
  group.appendChild(wrap);
  return { group, canvas, hitLayer };
}

export function createPartyMemberStatsRow(
  displayName: string,
  iconKey?: string,
): {
  row: HTMLElement;
  refs: {
    member: MemberRowRefs;
    threat: ThreatBarRefs;
    damage: DamageBarRefs;
    status: StatusBadgeRefs;
  };
} {
  const row = el('div', 'party-stats-row');

  const memberEl = el('div', 'party-stats-member');
  appendMemberIdentity(memberEl, displayName, iconKey);

  const threatEl = el('div', 'party-stats-threat');
  const threatBar = el('div', 'party-stats-threat-bar');
  const threatFill = el('div', 'party-stats-threat-fill');
  const baseMarker = el('div', 'party-stats-threat-base');
  const threatLabel = el('span', 'party-stats-threat-label', 'Hate —');
  threatBar.append(threatFill, baseMarker);
  threatEl.append(threatBar, threatLabel);

  const damageEl = el('div', 'party-stats-damage');
  const bars = el('div', 'party-stats-damage-bars');
  const dealtBar = el('div', 'party-stats-damage-bar');
  const dealtFill = el('div', 'party-stats-damage-fill party-stats-damage-fill--dealt');
  const takenBar = el('div', 'party-stats-damage-bar');
  const takenFill = el('div', 'party-stats-damage-fill party-stats-damage-fill--taken');
  dealtBar.appendChild(dealtFill);
  takenBar.appendChild(takenFill);
  bars.append(dealtBar, takenBar);
  const damageLabel = el('span', 'party-stats-damage-label', '与 — · 被 —');
  damageEl.append(bars, damageLabel);

  const statusEl = el('div', 'party-stats-status');
  const debuffGroup = createStatusBadgeGroupWithHits('Debuff');
  const buffGroup = createStatusBadgeGroupWithHits('Buff');
  statusEl.append(debuffGroup.group, buffGroup.group);

  row.append(memberEl, threatEl, damageEl, statusEl);

  return {
    row,
    refs: {
      member: { root: memberEl },
      threat: { root: threatEl, fill: threatFill, baseMarker, label: threatLabel },
      damage: { root: damageEl, dealtFill, takenFill, label: damageLabel },
      status: {
        root: statusEl,
        debuffCanvas: debuffGroup.canvas,
        buffCanvas: buffGroup.canvas,
        debuffHitLayer: debuffGroup.hitLayer,
        buffHitLayer: buffGroup.hitLayer,
      },
    },
  };
}

export function buildDownBySlot(
  snapshots: CombatantSnapshot[],
): Map<number, boolean> {
  return new Map(
    snapshots
      .filter((snapshot) => snapshot.partySlotIndex !== undefined)
      .map((snapshot) => [snapshot.partySlotIndex!, isAllyDown(snapshot)]),
  );
}

export function syncMemberDownState(
  memberByPartyIndex: Map<number, MemberRowRefs>,
  downBySlot: Map<number, boolean>,
): void {
  for (const [slotIndex, refs] of memberByPartyIndex) {
    refs.root.classList.toggle('is-down', downBySlot.get(slotIndex) ?? false);
  }
}

export function syncThreatBars(
  threatByPartyIndex: Map<number, ThreatBarRefs>,
  snapshots: CombatantSnapshot[],
): void {
  for (const snapshot of snapshots) {
    if (snapshot.partySlotIndex === undefined) continue;
    const refs = threatByPartyIndex.get(snapshot.partySlotIndex);
    if (!refs) continue;
    const down = isAllyDown(snapshot);
    refs.root.classList.toggle('is-down', down);
    refs.root.classList.toggle('is-highest', false);
    refs.root.hidden = true;
  }
}

export function syncDamageBars(
  damageByPartyIndex: Map<number, DamageBarRefs>,
  rows: StageDamageDisplayRow[],
  downBySlot: Map<number, boolean>,
): void {
  const maxDealt = Math.max(1, ...rows.map((row) => row.damageDealt));
  const maxTaken = Math.max(1, ...rows.map((row) => row.damageTaken));

  for (const row of rows) {
    const refs = damageByPartyIndex.get(row.slotIndex);
    if (!refs) continue;

    const down = downBySlot.get(row.slotIndex) ?? false;
    refs.root.classList.toggle('is-down', down);

    const syncKey = `${down}:${row.damageDealt}:${row.damageTaken}:${maxDealt}:${maxTaken}`;
    if (refs.lastSyncKey === syncKey) continue;
    refs.lastSyncKey = syncKey;

    const dealtPct = Math.min(100, (row.damageDealt / maxDealt) * 100);
    const takenPct = Math.min(100, (row.damageTaken / maxTaken) * 100);
    refs.dealtFill.style.width = `${dealtPct}%`;
    refs.takenFill.style.width = `${takenPct}%`;

    const dealtLabel = row.damageDealt.toLocaleString();
    const takenLabel = row.damageTaken.toLocaleString();
    refs.label.textContent = down
      ? `与 ${dealtLabel} · 被 ${takenLabel} (倒)`
      : `与 ${dealtLabel} · 被 ${takenLabel}`;
  }
}

function drawStatusBadgeCanvas(
  canvas: HTMLCanvasElement,
  badges: ReturnType<typeof collectStatusEffectBadgeDisplays>,
  theme: BattleHudTheme,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  prepareStatusBadgeCanvasContext(ctx);

  if (badges.length === 0) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.hidden = true;
    return;
  }

  const scale = 1;
  const badgeTheme = {
    iconSize: PARTY_HUD_STATUS_BADGE_ICON_SIZE,
    rowOverlap: theme.statusBadgeOverlap,
    overlayColor: theme.statusBadgeOverlay,
    iconOutlineColor: theme.statusIconOutlineColor,
    iconOutlineWidth: theme.statusIconOutlineWidth,
    iconFallbackAlpha: theme.statusIconFallbackAlpha,
    resolveIconFallbackColor: (category: Parameters<
      typeof resolveStatusIconFallbackColor
    >[0]) => resolveStatusIconFallbackColor(category, theme),
  };

  const layout = measureStatusBadgeWrap(
    badges,
    DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
    scale,
    PARTY_HUD_STATUS_BADGE_ICON_SIZE,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
  );
  const outlinePad = statusBadgeOutlinePad(theme.statusIconOutlineWidth, scale);
  const canvasW =
    Math.min(DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH, layout.totalWidth) +
    outlinePad * 2;
  const canvasH = layout.totalHeight + outlinePad * 2;

  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  canvas.hidden = false;
  ctx.clearRect(0, 0, canvasW, canvasH);

  drawStatusBadgeWrap(
    ctx,
    outlinePad,
    outlinePad,
    badges,
    DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
    scale,
    badgeTheme,
  );
}

export function syncStatusBadges(
  statusByPartyIndex: Map<number, StatusBadgeRefs>,
  snapshots: CombatantSnapshot[],
  theme: BattleHudTheme | null,
  floatingTooltip: PartyHudFloatingTooltip | null = null,
): void {
  for (const snapshot of snapshots) {
    if (snapshot.partySlotIndex === undefined) continue;
    const refs = statusByPartyIndex.get(snapshot.partySlotIndex);
    if (!refs) continue;

    const allBadges = collectStatusEffectBadgeDisplays(snapshot.statusEffects, {
      baseMaxHp: snapshot.baseMaxHp,
      atk: snapshot.atk,
      def: snapshot.def,
      reg: snapshot.reg,
    });
    const debuffBadges = sortBadgesForDetailView(
      allBadges.filter((badge) => badge.kind === 'debuff'),
    );
    const buffBadges = sortBadgesForDetailView(
      allBadges.filter((badge) => badge.kind === 'buff'),
    );

    refs.root.classList.toggle('is-down', isAllyDown(snapshot));
    refs.root.hidden = allBadges.length === 0;
    const debuffGroup = refs.debuffCanvas.closest('.party-stats-status-group');
    const buffGroup = refs.buffCanvas.closest('.party-stats-status-group');
    if (debuffGroup instanceof HTMLElement) {
      debuffGroup.hidden = debuffBadges.length === 0;
    }
    if (buffGroup instanceof HTMLElement) {
      buffGroup.hidden = buffBadges.length === 0;
    }

    if (!theme) continue;

    const debuffSignature = buildDetailStatusBadgeSignature(debuffBadges);
    if (refs.debuffRenderSignature !== debuffSignature) {
      refs.debuffRenderSignature = debuffSignature;
      drawStatusBadgeCanvas(refs.debuffCanvas, debuffBadges, theme);
    }

    const debuffHitSignature = buildDetailStatusBadgeHitSignature(debuffBadges);
    if (refs.debuffHitSignature !== debuffHitSignature) {
      refs.debuffHitSignature = debuffHitSignature;
      syncDetailStatusBadgeHits(
        refs.debuffHitLayer,
        debuffBadges,
        theme,
        floatingTooltip,
      );
    }

    const buffSignature = buildDetailStatusBadgeSignature(buffBadges);
    if (refs.buffRenderSignature !== buffSignature) {
      refs.buffRenderSignature = buffSignature;
      drawStatusBadgeCanvas(refs.buffCanvas, buffBadges, theme);
    }

    const buffHitSignature = buildDetailStatusBadgeHitSignature(buffBadges);
    if (refs.buffHitSignature !== buffHitSignature) {
      refs.buffHitSignature = buffHitSignature;
      syncDetailStatusBadgeHits(
        refs.buffHitLayer,
        buffBadges,
        theme,
        floatingTooltip,
      );
    }
  }
}

export class PartyMemberStatsDisplay {
  private readonly listEl: HTMLElement;
  private readonly themeHost: HTMLElement | null;
  private readonly memberByPartyIndex = new Map<number, MemberRowRefs>();
  private readonly threatByPartyIndex = new Map<number, ThreatBarRefs>();
  private readonly damageByPartyIndex = new Map<number, DamageBarRefs>();
  private readonly statusByPartyIndex = new Map<number, StatusBadgeRefs>();
  private readonly unsubscribeStatusIconsReady: () => void;
  private lastSource: PartyMemberStatsDataSource | null = null;
  private theme: BattleHudTheme | null = null;
  private memberDownSignature = '';

  constructor(
    host: HTMLElement,
    options?: { listClass?: string; themeHost?: HTMLElement },
  ) {
    this.themeHost = options?.themeHost ?? host.closest('.battle-view');
    this.refreshTheme();
    this.listEl = document.createElement('div');
    this.listEl.className = options?.listClass ?? 'party-stats-rows';
    host.appendChild(this.listEl);
    this.unsubscribeStatusIconsReady = onStatusIconsReady(() => {
      this.refreshTheme();
      this.invalidateStatusBadgeRenderSignatures();
      if (this.lastSource) {
        this.update(this.lastSource);
      }
    });
  }

  private refreshTheme(): void {
    const host = this.resolveThemeHost();
    if (!host) return;
    this.theme = readBattleHudTheme(host);
  }

  private resolveThemeHost(): HTMLElement | null {
    if (this.themeHost instanceof HTMLElement) {
      return this.themeHost;
    }
    const battleView = document.querySelector('.battle-view');
    return battleView instanceof HTMLElement ? battleView : null;
  }

  private invalidateStatusBadgeRenderSignatures(): void {
    for (const refs of this.statusByPartyIndex.values()) {
      refs.debuffRenderSignature = undefined;
      refs.buffRenderSignature = undefined;
      refs.debuffHitSignature = undefined;
      refs.buffHitSignature = undefined;
    }
  }

  rebuild(specs: PartyMemberStatsRowSpec[]): Map<number, HTMLElement> {
    this.listEl.replaceChildren();
    this.memberByPartyIndex.clear();
    this.threatByPartyIndex.clear();
    this.damageByPartyIndex.clear();
    this.statusByPartyIndex.clear();

    const rowElements = new Map<number, HTMLElement>();
    for (const spec of specs) {
      const { row, refs } = createPartyMemberStatsRow(
        spec.displayName,
        spec.iconKey,
      );
      this.memberByPartyIndex.set(spec.slotIndex, refs.member);
      this.threatByPartyIndex.set(spec.slotIndex, refs.threat);
      this.damageByPartyIndex.set(spec.slotIndex, refs.damage);
      this.statusByPartyIndex.set(spec.slotIndex, refs.status);
      this.listEl.appendChild(row);
      rowElements.set(spec.slotIndex, row);
    }
    return rowElements;
  }

  update(
    source: PartyMemberStatsDataSource,
    frame?: PartyMemberStatsFrame,
  ): void {
    this.lastSource = source;
    if (!this.theme && this.resolveThemeHost()) {
      this.refreshTheme();
      this.invalidateStatusBadgeRenderSignatures();
    }
    const snapshots = frame?.snapshots ?? source.getAllySnapshots();
    const displayRows = frame?.displayRows ?? source.getDisplayRows();
    const downBySlot = buildDownBySlot(snapshots);
    const downSignature = [...downBySlot.entries()]
      .sort(([a], [b]) => a - b)
      .map(([slot, down]) => `${slot}:${down ? 1 : 0}`)
      .join('|');
    if (downSignature !== this.memberDownSignature) {
      this.memberDownSignature = downSignature;
      syncMemberDownState(this.memberByPartyIndex, downBySlot);
    }
    syncThreatBars(this.threatByPartyIndex, snapshots);
    syncDamageBars(this.damageByPartyIndex, displayRows, downBySlot);
    syncStatusBadges(this.statusByPartyIndex, snapshots, this.theme);
  }

  clear(): void {
    this.listEl.replaceChildren();
    this.memberByPartyIndex.clear();
    this.threatByPartyIndex.clear();
    this.damageByPartyIndex.clear();
    this.statusByPartyIndex.clear();
    this.lastSource = null;
    this.memberDownSignature = '';
  }

  destroy(): void {
    this.unsubscribeStatusIconsReady();
  }
}
