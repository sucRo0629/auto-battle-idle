import '../styles/party-member-stats.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot } from '../battle/types.ts';
import type { StatusEffectBadgeDisplay } from '../battle/statusEffectDisplay.ts';
import {
  collectStatusEffectBadgeDisplays,
  sortBadgesForDetailView,
} from '../battle/statusEffectDisplay.ts';
import { getClassIconUrl } from '../render/IconRegistry.ts';
import { getStatusIconUrl, onStatusIconsReady } from '../render/StatusIconRegistry.ts';
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
} from '../render/statusBadgeRenderer.ts';
import {
  DETAIL_STATUS_BADGE_ROW_GAP,
  DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
  buildDetailStatusBadgeHitSignature,
  detailStatusBadgeCanvasPad,
  detailStatusBadgeLayoutRowHeight,
  syncDetailStatusBadgeHits,
  type PartyHudStatusBadgeHitContext,
} from './partyHudStatusBadgeHits.ts';
import { t } from '../i18n/t.ts';
import { getLocale } from '../i18n/locale.ts';

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

export interface DamageBarRefs {
  root: HTMLElement;
  dealtBar: HTMLElement;
  dealtFill: HTMLElement;
  takenFill: HTMLElement;
  dealtValue?: HTMLElement;
  takenValue?: HTMLElement;
  label: HTMLElement;
  lastSyncKey?: string;
  lastDealtMode?: 'damage' | 'heal';
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

function formatInlineDamageValue(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  if (rounded < 1000) return rounded.toLocaleString();

  if (rounded < 9950) {
    return `${(rounded / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  if (rounded < 995000) {
    return `${Math.round(rounded / 1000)}k`;
  }

  if (rounded < 9950000) {
    return `${(rounded / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
  }

  return `${Math.round(rounded / 1000000)}m`;
}

function createDealtDamageTag(): HTMLElement {
  const tag = el('span', 'party-stats-damage-bar-tag party-stats-damage-bar-tag--dealt');
  tag.setAttribute('role', 'img');
  tag.setAttribute('aria-label', t('hud.damageDealtShort'));
  const icon = el('span', 'party-stats-damage-bar-tag-icon party-stats-damage-bar-tag-icon--dealt');
  const atkUrl = getStatusIconUrl('atk');
  if (atkUrl) {
    icon.style.maskImage = `url("${atkUrl}")`;
    icon.style.webkitMaskImage = `url("${atkUrl}")`;
  }
  tag.appendChild(icon);
  return tag;
}

function createDealtHealTag(): HTMLElement {
  const tag = el('span', 'party-stats-damage-bar-tag party-stats-damage-bar-tag--heal');
  tag.setAttribute('role', 'img');
  tag.setAttribute('aria-label', t('hud.healingDealtShort'));
  const hotUrl = getStatusIconUrl('hot');
  const img = document.createElement('img');
  img.className = 'party-stats-damage-bar-tag-icon party-stats-damage-bar-tag-icon--heal';
  if (hotUrl) {
    img.src = hotUrl;
  }
  img.width = 12;
  img.height = 12;
  img.alt = '';
  img.decoding = 'async';
  img.setAttribute('aria-hidden', 'true');
  tag.appendChild(img);
  return tag;
}

function createDamageBarTag(kind: 'dealt' | 'taken'): HTMLElement {
  if (kind === 'dealt') {
    return createDealtDamageTag();
  }

  const tag = el('span', `party-stats-damage-bar-tag party-stats-damage-bar-tag--${kind}`);
  tag.setAttribute('role', 'img');
  tag.setAttribute('aria-label', t('hud.damageTakenShort'));

  const dotUrl = getStatusIconUrl('dot');
  const img = document.createElement('img');
  img.className = 'party-stats-damage-bar-tag-icon party-stats-damage-bar-tag-icon--taken';
  if (dotUrl) {
    img.src = dotUrl;
  }
  img.width = 12;
  img.height = 12;
  img.alt = '';
  img.decoding = 'async';
  img.setAttribute('aria-hidden', 'true');
  tag.appendChild(img);
  return tag;
}

function syncDealtBarMode(refs: DamageBarRefs, isHealer: boolean): void {
  const mode = isHealer ? 'heal' : 'damage';
  if (refs.lastDealtMode === mode) return;
  refs.lastDealtMode = mode;

  refs.dealtBar.classList.toggle('party-stats-damage-bar--dealt-heal', isHealer);
  refs.dealtFill.classList.toggle('party-stats-damage-fill--dealt', !isHealer);
  refs.dealtFill.classList.toggle('party-stats-damage-fill--heal', isHealer);

  const leading = refs.dealtBar.querySelector('.party-stats-damage-bar-leading');
  if (!(leading instanceof HTMLElement)) return;

  const tag = isHealer ? createDealtHealTag() : createDealtDamageTag();
  leading.replaceChildren(tag);
  if (refs.dealtValue) {
    leading.append(refs.dealtValue);
  }
}

export function syncDamageBarTagAriaLabels(root: HTMLElement): void {
  const dealtBar = root.querySelector('.party-stats-damage-bar--dealt');
  const isHealer = dealtBar?.classList.contains('party-stats-damage-bar--dealt-heal') ?? false;
  const dealtTag = root.querySelector(
    '.party-stats-damage-bar--dealt .party-stats-damage-bar-tag',
  );
  const takenTag = root.querySelector(
    '.party-stats-damage-bar--taken .party-stats-damage-bar-tag',
  );
  if (dealtTag instanceof HTMLElement) {
    dealtTag.setAttribute(
      'aria-label',
      t(isHealer ? 'hud.healingDealtShort' : 'hud.damageDealtShort'),
    );
  }
  if (takenTag instanceof HTMLElement) {
    takenTag.setAttribute('aria-label', t('hud.damageTakenShort'));
  }
}

export function buildDetailDamageBarElements(): {
  bars: HTMLElement;
  dealtBar: HTMLElement;
  dealtFill: HTMLElement;
  takenFill: HTMLElement;
  dealtValue: HTMLElement;
  takenValue: HTMLElement;
  label: HTMLElement;
} {
  const bars = el('div', 'party-stats-damage-bars');
  const dealtBar = el(
    'div',
    'party-stats-damage-bar party-stats-damage-bar--dealt',
  );
  const dealtLeading = el('div', 'party-stats-damage-bar-leading');
  const dealtTag = createDealtDamageTag();
  const dealtValue = el('span', 'party-stats-damage-bar-value', '—');
  const dealtFill = el(
    'div',
    'party-stats-damage-fill party-stats-damage-fill--dealt',
  );
  const takenBar = el(
    'div',
    'party-stats-damage-bar party-stats-damage-bar--taken',
  );
  const takenLeading = el('div', 'party-stats-damage-bar-leading');
  const takenTag = createDamageBarTag('taken');
  const takenValue = el('span', 'party-stats-damage-bar-value', '—');
  const takenFill = el(
    'div',
    'party-stats-damage-fill party-stats-damage-fill--taken',
  );
  dealtLeading.append(dealtTag, dealtValue);
  takenLeading.append(takenTag, takenValue);
  dealtBar.append(dealtLeading, dealtFill);
  takenBar.append(takenLeading, takenFill);
  bars.append(dealtBar, takenBar);
  const label = el('span', 'party-stats-damage-label', t('hud.damageEmpty'));
  return { bars, dealtBar, dealtFill, takenFill, dealtValue, takenValue, label };
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
    damage: DamageBarRefs;
    status: StatusBadgeRefs;
  };
} {
  const row = el('div', 'party-stats-row');

  const memberEl = el('div', 'party-stats-member');
  appendMemberIdentity(memberEl, displayName, iconKey);

  const damageEl = el('div', 'party-stats-damage');
  const {
    bars,
    dealtBar,
    dealtFill,
    takenFill,
    dealtValue,
    takenValue,
    label: damageLabel,
  } = buildDetailDamageBarElements();
  damageEl.append(bars, damageLabel);

  const statusEl = el('div', 'party-stats-status');
  const debuffGroup = createStatusBadgeGroupWithHits(t('hud.debuff'));
  const buffGroup = createStatusBadgeGroupWithHits(t('hud.buff'));
  statusEl.append(debuffGroup.group, buffGroup.group);

  row.append(memberEl, damageEl, statusEl);

  return {
    row,
    refs: {
      member: { root: memberEl },
      damage: {
        root: damageEl,
        dealtBar,
        dealtFill,
        takenFill,
        dealtValue,
        takenValue,
        label: damageLabel,
      },
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

export function syncDamageBars(
  damageByPartyIndex: Map<number, DamageBarRefs>,
  rows: StageDamageDisplayRow[],
  downBySlot: Map<number, boolean>,
): void {
  const healerRows = rows.filter((row) => row.isHealer);
  const nonHealerRows = rows.filter((row) => !row.isHealer);
  const healerCount = healerRows.length;
  const maxDealt = Math.max(1, ...nonHealerRows.map((row) => row.damageDealt));
  const maxHealing = Math.max(1, ...healerRows.map((row) => row.healingDealt));
  const maxTaken = Math.max(1, ...rows.map((row) => row.damageTaken));

  for (const row of rows) {
    const refs = damageByPartyIndex.get(row.slotIndex);
    if (!refs) continue;

    const down = downBySlot.get(row.slotIndex) ?? false;
    refs.root.classList.toggle('is-down', down);
    syncDealtBarMode(refs, row.isHealer);

    const dealtMetric = row.isHealer ? row.healingDealt : row.damageDealt;
    const syncKey = `${getLocale()}:${down}:${row.isHealer ? 1 : 0}:${dealtMetric}:${row.damageTaken}:${maxDealt}:${maxHealing}:${maxTaken}:${healerCount}`;
    if (refs.lastSyncKey === syncKey) continue;
    refs.lastSyncKey = syncKey;

    let dealtPct: number;
    if (row.isHealer) {
      dealtPct =
        healerCount === 1
          ? 100
          : Math.min(100, (row.healingDealt / maxHealing) * 100);
    } else {
      dealtPct = Math.min(100, (row.damageDealt / maxDealt) * 100);
    }
    const takenPct = Math.min(100, (row.damageTaken / maxTaken) * 100);
    refs.dealtFill.style.width = `${dealtPct}%`;
    refs.takenFill.style.width = `${takenPct}%`;

    const dealtLabel = dealtMetric.toLocaleString();
    const takenLabel = row.damageTaken.toLocaleString();
    const inlineDealtLabel = formatInlineDamageValue(dealtMetric);
    const inlineTakenLabel = formatInlineDamageValue(row.damageTaken);
    if (refs.dealtValue) {
      refs.dealtValue.textContent = inlineDealtLabel;
      refs.dealtValue.title = dealtLabel;
      refs.dealtValue.setAttribute('aria-label', dealtLabel);
    }
    if (refs.takenValue) {
      refs.takenValue.textContent = inlineTakenLabel;
      refs.takenValue.title = takenLabel;
      refs.takenValue.setAttribute('aria-label', takenLabel);
    }
    if (row.isHealer) {
      refs.label.textContent = down
        ? t('hud.healingDealtTakenDown', {
            healed: dealtLabel,
            taken: takenLabel,
          })
        : t('hud.healingDealtTaken', {
            healed: dealtLabel,
            taken: takenLabel,
          });
    } else {
      refs.label.textContent = down
        ? t('hud.damageDealtTakenDown', { dealt: dealtLabel, taken: takenLabel })
        : t('hud.damageDealtTaken', { dealt: dealtLabel, taken: takenLabel });
    }
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

  const layoutRowHeight = detailStatusBadgeLayoutRowHeight(
    scale,
    PARTY_HUD_STATUS_BADGE_ICON_SIZE,
  );
  const layout = measureStatusBadgeWrap(
    badges,
    DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
    scale,
    PARTY_HUD_STATUS_BADGE_ICON_SIZE,
    theme.statusIconOutlineWidth,
    theme.statusBadgeOverlap,
    DETAIL_STATUS_BADGE_ROW_GAP,
    layoutRowHeight,
  );
  const outlinePad = detailStatusBadgeCanvasPad(
    theme.statusIconOutlineWidth,
    scale,
  );
  const canvasW =
    Math.min(DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH, layout.totalWidth) +
    outlinePad * 2;
  const canvasH = layout.totalHeight;

  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;
  canvas.hidden = false;
  ctx.clearRect(0, 0, canvasW, canvasH);

  drawStatusBadgeWrap(
    ctx,
    outlinePad,
    0,
    badges,
    DETAIL_STATUS_BADGE_WRAP_MAX_WIDTH,
    scale,
    badgeTheme,
    DETAIL_STATUS_BADGE_ROW_GAP,
    layoutRowHeight,
  );
}

export interface SyncStatusBadgesOptions {
  /** Party HUD detail: keep DEBUFF/BUFF label rows visible when empty. */
  preserveEmptyGroups?: boolean;
}

export function syncStatusBadges(
  statusByPartyIndex: Map<number, StatusBadgeRefs>,
  snapshots: CombatantSnapshot[],
  theme: BattleHudTheme | null,
  hitContext: PartyHudStatusBadgeHitContext = {
    floatingTooltip: null,
    gameTermPanel: null,
  },
  options?: SyncStatusBadgesOptions,
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

    const preserveEmptyGroups = options?.preserveEmptyGroups === true;

    refs.root.classList.toggle('is-down', isAllyDown(snapshot));
    const debuffGroup = refs.debuffCanvas.closest('.party-stats-status-group');
    const buffGroup = refs.buffCanvas.closest('.party-stats-status-group');

    if (preserveEmptyGroups) {
      refs.root.hidden = false;
      if (debuffGroup instanceof HTMLElement) {
        debuffGroup.hidden = false;
        debuffGroup.classList.toggle(
          'party-stats-status-group--empty',
          debuffBadges.length === 0,
        );
      }
      if (buffGroup instanceof HTMLElement) {
        buffGroup.hidden = false;
        buffGroup.classList.toggle(
          'party-stats-status-group--empty',
          buffBadges.length === 0,
        );
      }
    } else {
      refs.root.hidden = allBadges.length === 0;
      if (debuffGroup instanceof HTMLElement) {
        debuffGroup.hidden = debuffBadges.length === 0;
        debuffGroup.classList.remove('party-stats-status-group--empty');
      }
      if (buffGroup instanceof HTMLElement) {
        buffGroup.hidden = buffBadges.length === 0;
        buffGroup.classList.remove('party-stats-status-group--empty');
      }
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
        hitContext,
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
        hitContext,
      );
    }
  }
}

export class PartyMemberStatsDisplay {
  private readonly listEl: HTMLElement;
  private readonly themeHost: HTMLElement | null;
  private readonly memberByPartyIndex = new Map<number, MemberRowRefs>();
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
    this.damageByPartyIndex.clear();
    this.statusByPartyIndex.clear();

    const rowElements = new Map<number, HTMLElement>();
    for (const spec of specs) {
      const { row, refs } = createPartyMemberStatsRow(
        spec.displayName,
        spec.iconKey,
      );
      this.memberByPartyIndex.set(spec.slotIndex, refs.member);
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
    syncDamageBars(this.damageByPartyIndex, displayRows, downBySlot);
    syncStatusBadges(this.statusByPartyIndex, snapshots, this.theme);
  }

  clear(): void {
    this.listEl.replaceChildren();
    this.memberByPartyIndex.clear();
    this.damageByPartyIndex.clear();
    this.statusByPartyIndex.clear();
    this.lastSource = null;
    this.memberDownSignature = '';
  }

  destroy(): void {
    this.unsubscribeStatusIconsReady();
  }
}
