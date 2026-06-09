import '../styles/party-member-stats.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot } from '../battle/types.ts';

export interface PartyMemberProgress {
  slotIndex: number;
  level: number;
  exp: number;
  expRequired: number;
}

export interface PartyMemberStatsRowSpec {
  slotIndex: number;
  displayName: string;
  epithetEn?: string;
}

export interface PartyMemberStatsDataSource {
  getDisplayRows: () => StageDamageDisplayRow[];
  getAllySnapshots: () => CombatantSnapshot[];
  getPartyProgress: () => PartyMemberProgress[];
}

export interface ThreatBarRefs {
  root: HTMLElement;
  fill: HTMLElement;
  baseMarker: HTMLElement;
  label: HTMLElement;
}

export interface ExpBarRefs {
  root: HTMLElement;
  fill: HTMLElement;
  label: HTMLElement;
}

export interface DamageBarRefs {
  root: HTMLElement;
  dealtFill: HTMLElement;
  takenFill: HTMLElement;
  label: HTMLElement;
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

export function createPartyMemberStatsRow(
  displayName: string,
  epithetEn?: string,
): {
  row: HTMLElement;
  refs: {
    threat: ThreatBarRefs;
    exp: ExpBarRefs;
    damage: DamageBarRefs;
  };
} {
  const row = el('div', 'party-stats-row');

  const memberEl = el('div', 'party-stats-member');
  const nameRow = el('div', 'party-stats-member-header');
  if (epithetEn) {
    const epithetEl = el('span', 'party-stats-member-epithet', epithetEn);
    memberEl.appendChild(epithetEl);
  }
  const nameEl = el('span', 'party-stats-member-name', displayName);
  const expLabel = el('span', 'party-stats-exp-label', 'Exp —');
  nameRow.append(nameEl, expLabel);

  const expEl = el('div', 'party-stats-exp');
  const expBar = el('div', 'party-stats-exp-bar');
  const expFill = el('div', 'party-stats-exp-fill');
  expBar.appendChild(expFill);
  expEl.appendChild(expBar);
  memberEl.append(nameRow, expEl);

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

  row.append(memberEl, threatEl, damageEl);

  return {
    row,
    refs: {
      exp: { root: memberEl, fill: expFill, label: expLabel },
      threat: { root: threatEl, fill: threatFill, baseMarker, label: threatLabel },
      damage: { root: damageEl, dealtFill, takenFill, label: damageLabel },
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

export function syncThreatBars(
  threatByPartyIndex: Map<number, ThreatBarRefs>,
  snapshots: CombatantSnapshot[],
): void {
  const partyThreats = snapshots.filter(
    (snapshot) => snapshot.partySlotIndex !== undefined,
  );
  const livingThreats = partyThreats.filter(
    (snapshot) => !isAllyDown(snapshot),
  );
  const livingMaxScale = Math.max(
    1,
    ...livingThreats.flatMap((snapshot) => [
      snapshot.threat ?? 0,
      snapshot.baseThreat ?? 0,
    ]),
  );

  for (const snapshot of partyThreats) {
    const refs = threatByPartyIndex.get(snapshot.partySlotIndex!);
    if (!refs) continue;
    const threat = Math.round(snapshot.threat ?? 0);
    const base = Math.round(snapshot.baseThreat ?? 0);
    const down = isAllyDown(snapshot);
    refs.root.classList.toggle('is-down', down);

    if (down) {
      const localMax = Math.max(threat, base, 1);
      refs.fill.style.width = `${(threat / localMax) * 100}%`;
      refs.baseMarker.style.left = `${(base / localMax) * 100}%`;
      refs.label.textContent = `Hate ${threat} · base ${base} (倒)`;
      continue;
    }

    const fillPct = Math.min(100, (threat / livingMaxScale) * 100);
    const basePct = Math.min(100, (base / livingMaxScale) * 100);
    refs.fill.style.width = `${fillPct}%`;
    refs.baseMarker.style.left = `${basePct}%`;
    refs.label.textContent = `Hate ${threat} · base ${base}`;
  }
}

export function syncExpBars(
  expByPartyIndex: Map<number, ExpBarRefs>,
  progressRows: PartyMemberProgress[],
  downBySlot: Map<number, boolean>,
): void {
  for (const row of progressRows) {
    const refs = expByPartyIndex.get(row.slotIndex);
    if (!refs) continue;

    const down = downBySlot.get(row.slotIndex) ?? false;
    refs.root.classList.toggle('is-down', down);

    const ratio =
      row.expRequired > 0
        ? Math.max(0, Math.min(1, row.exp / row.expRequired))
        : 0;
    refs.fill.style.width = `${ratio * 100}%`;
    refs.label.textContent = down
      ? `Exp ${row.exp} / ${row.expRequired} (倒)`
      : `Exp ${row.exp} / ${row.expRequired}`;
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

export class PartyMemberStatsDisplay {
  private readonly listEl: HTMLElement;
  private readonly threatByPartyIndex = new Map<number, ThreatBarRefs>();
  private readonly expByPartyIndex = new Map<number, ExpBarRefs>();
  private readonly damageByPartyIndex = new Map<number, DamageBarRefs>();

  constructor(
    host: HTMLElement,
    options?: { listClass?: string },
  ) {
    this.listEl = document.createElement('div');
    this.listEl.className = options?.listClass ?? 'party-stats-rows';
    host.appendChild(this.listEl);
  }

  rebuild(specs: PartyMemberStatsRowSpec[]): Map<number, HTMLElement> {
    this.listEl.replaceChildren();
    this.threatByPartyIndex.clear();
    this.expByPartyIndex.clear();
    this.damageByPartyIndex.clear();

    const rowElements = new Map<number, HTMLElement>();
    for (const spec of specs) {
      const { row, refs } = createPartyMemberStatsRow(
        spec.displayName,
        spec.epithetEn,
      );
      this.threatByPartyIndex.set(spec.slotIndex, refs.threat);
      this.expByPartyIndex.set(spec.slotIndex, refs.exp);
      this.damageByPartyIndex.set(spec.slotIndex, refs.damage);
      this.listEl.appendChild(row);
      rowElements.set(spec.slotIndex, row);
    }
    return rowElements;
  }

  update(source: PartyMemberStatsDataSource): void {
    const snapshots = source.getAllySnapshots();
    const downBySlot = buildDownBySlot(snapshots);
    syncThreatBars(this.threatByPartyIndex, snapshots);
    syncExpBars(this.expByPartyIndex, source.getPartyProgress(), downBySlot);
    syncDamageBars(
      this.damageByPartyIndex,
      source.getDisplayRows(),
      downBySlot,
    );
  }

  clear(): void {
    this.listEl.replaceChildren();
    this.threatByPartyIndex.clear();
    this.expByPartyIndex.clear();
    this.damageByPartyIndex.clear();
  }
}
