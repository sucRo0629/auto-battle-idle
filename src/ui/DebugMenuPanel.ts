import '../styles/debug-menu.css';
import type { StageDamageDisplayRow } from '../battle/stageDamageStats.ts';
import type { CombatantSnapshot, GameData, SaveGameState } from '../battle/types.ts';

export interface DebugMenuControls {
  isVerifyMode: () => boolean;
  getSave: () => SaveGameState;
  getLoopStageId: () => string | null;
  getAllySnapshots?: () => CombatantSnapshot[];
  getStageDamageDisplayRows?: () => StageDamageDisplayRow[];
  onLoopStageChange: (stageId: string | null) => void;
  onMemberLevelChange: (partyIndex: number, level: number) => void;
}

interface ThreatDisplayRefs {
  root: HTMLElement;
  fill: HTMLElement;
  baseMarker: HTMLElement;
  label: HTMLElement;
}

interface DamageDisplayRefs {
  root: HTMLElement;
  dealtFill: HTMLElement;
  takenFill: HTMLElement;
  label: HTMLElement;
}

function isAllyDown(snapshot: CombatantSnapshot): boolean {
  return snapshot.hp <= 0;
}

export class DebugMenuPanel {
  private readonly root: HTMLElement;
  private readonly rowsHost: HTMLElement;
  private readonly threatByPartyIndex = new Map<number, ThreatDisplayRefs>();
  private readonly damageByPartyIndex = new Map<number, DamageDisplayRefs>();

  constructor(
    private readonly gameData: GameData,
    private readonly controls: DebugMenuControls,
  ) {
    this.root = document.createElement('aside');
    this.root.className = 'debug-menu';
    this.root.hidden = true;

    const title = document.createElement('div');
    title.className = 'debug-menu-title';
    title.textContent = 'デバッグ';

    this.rowsHost = document.createElement('div');
    this.rowsHost.className = 'debug-menu-rows';

    this.root.append(title, this.rowsHost);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.refresh();
  }

  updateDamageDisplay(): void {
    if (!this.controls.isVerifyMode()) return;
    const rows = this.controls.getStageDamageDisplayRows?.() ?? [];
    const snapshots = this.controls.getAllySnapshots?.() ?? [];
    const downBySlot = new Map(
      snapshots
        .filter((snapshot) => snapshot.partySlotIndex !== undefined)
        .map((snapshot) => [snapshot.partySlotIndex!, isAllyDown(snapshot)]),
    );

    const maxDealt = Math.max(1, ...rows.map((row) => row.damageDealt));
    const maxTaken = Math.max(1, ...rows.map((row) => row.damageTaken));

    for (const row of rows) {
      const refs = this.damageByPartyIndex.get(row.slotIndex);
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

  updateThreatDisplay(): void {
    if (!this.controls.isVerifyMode()) return;
    const snapshots = this.controls.getAllySnapshots?.() ?? [];
    const partyThreats = snapshots.filter(
      (snapshot) => snapshot.partySlotIndex !== undefined,
    );
    const livingThreats = partyThreats.filter((snapshot) => !isAllyDown(snapshot));
    const livingMaxScale = Math.max(
      1,
      ...livingThreats.flatMap((snapshot) => [
        snapshot.threat ?? 0,
        snapshot.baseThreat ?? 0,
      ]),
    );

    for (const snapshot of partyThreats) {
      const refs = this.threatByPartyIndex.get(snapshot.partySlotIndex!);
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

  refresh(): void {
    const verifyMode = this.controls.isVerifyMode();
    this.root.hidden = !verifyMode;
    if (!verifyMode) return;

    const save = this.controls.getSave();
    this.rowsHost.replaceChildren();
    this.threatByPartyIndex.clear();
    this.damageByPartyIndex.clear();

    const stageRow = document.createElement('div');
    stageRow.className = 'debug-menu-stage-row';

    const stageLabel = document.createElement('label');
    stageLabel.className = 'debug-menu-stage-label';
    stageLabel.textContent = '周回ステージ';

    const stageSelect = document.createElement('select');
    stageSelect.className = 'debug-menu-stage-select';

    const normalOption = document.createElement('option');
    normalOption.value = '';
    normalOption.textContent = '通常進行';
    stageSelect.appendChild(normalOption);

    for (const stage of this.gameData.stages) {
      const option = document.createElement('option');
      option.value = stage.id;
      option.textContent = stage.displayName;
      stageSelect.appendChild(option);
    }

    const loopStageId = this.controls.getLoopStageId();
    stageSelect.value = loopStageId ?? '';

    stageSelect.addEventListener('change', () => {
      const selected = stageSelect.value;
      this.controls.onLoopStageChange(selected === '' ? null : selected);
    });

    stageLabel.appendChild(stageSelect);
    stageRow.appendChild(stageLabel);
    this.rowsHost.appendChild(stageRow);

    save.party.forEach((member, partyIndex) => {
      if (!member) return;

      const preset = this.gameData.classRegistry[member.classId];
      const displayName = preset?.displayName ?? member.classId;

      const row = document.createElement('div');
      row.className = 'debug-menu-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'debug-menu-member-name';
      nameEl.textContent = displayName;

      const levelLabel = document.createElement('label');
      levelLabel.className = 'debug-menu-level-label';
      levelLabel.textContent = 'Lv';

      const levelInput = document.createElement('input');
      levelInput.type = 'number';
      levelInput.className = 'debug-menu-level-input';
      levelInput.min = '1';
      levelInput.max = '99';
      levelInput.step = '1';
      levelInput.value = String(member.progress.level);

      const applyLevel = (): void => {
        const parsed = Number.parseInt(levelInput.value, 10);
        if (Number.isNaN(parsed)) {
          levelInput.value = String(member.progress.level);
          return;
        }
        const clamped = Math.max(1, Math.min(99, parsed));
        levelInput.value = String(clamped);
        if (clamped === member.progress.level) return;
        this.controls.onMemberLevelChange(partyIndex, clamped);
      };

      levelInput.addEventListener('change', applyLevel);
      levelInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyLevel();
          levelInput.blur();
        }
      });

      const decButton = document.createElement('button');
      decButton.type = 'button';
      decButton.className = 'debug-menu-level-button';
      decButton.textContent = '−';
      decButton.setAttribute('aria-label', `${displayName} のレベルを下げる`);
      decButton.addEventListener('click', () => {
        const next = Math.max(1, member.progress.level - 1);
        this.controls.onMemberLevelChange(partyIndex, next);
      });

      const incButton = document.createElement('button');
      incButton.type = 'button';
      incButton.className = 'debug-menu-level-button';
      incButton.textContent = '+';
      incButton.setAttribute('aria-label', `${displayName} のレベルを上げる`);
      incButton.addEventListener('click', () => {
        const next = Math.min(99, member.progress.level + 1);
        this.controls.onMemberLevelChange(partyIndex, next);
      });

      levelLabel.appendChild(levelInput);

      const threatEl = document.createElement('div');
      threatEl.className = 'debug-menu-threat';

      const bar = document.createElement('div');
      bar.className = 'debug-menu-threat-bar';

      const fill = document.createElement('div');
      fill.className = 'debug-menu-threat-fill';

      const baseMarker = document.createElement('div');
      baseMarker.className = 'debug-menu-threat-base';

      const label = document.createElement('span');
      label.className = 'debug-menu-threat-label';
      label.textContent = 'Hate —';

      bar.append(fill, baseMarker);
      threatEl.append(bar, label);
      this.threatByPartyIndex.set(partyIndex, {
        root: threatEl,
        fill,
        baseMarker,
        label,
      });

      const damageEl = document.createElement('div');
      damageEl.className = 'debug-menu-damage';

      const bars = document.createElement('div');
      bars.className = 'debug-menu-damage-bars';

      const dealtBar = document.createElement('div');
      dealtBar.className = 'debug-menu-damage-bar';

      const dealtFill = document.createElement('div');
      dealtFill.className =
        'debug-menu-damage-fill debug-menu-damage-fill--dealt';

      const takenBar = document.createElement('div');
      takenBar.className = 'debug-menu-damage-bar';

      const takenFill = document.createElement('div');
      takenFill.className =
        'debug-menu-damage-fill debug-menu-damage-fill--taken';

      dealtBar.appendChild(dealtFill);
      takenBar.appendChild(takenFill);
      bars.append(dealtBar, takenBar);

      const damageLabel = document.createElement('span');
      damageLabel.className = 'debug-menu-damage-label';
      damageLabel.textContent = '与 — · 被 —';

      damageEl.append(bars, damageLabel);
      this.damageByPartyIndex.set(partyIndex, {
        root: damageEl,
        dealtFill,
        takenFill,
        label: damageLabel,
      });

      row.append(nameEl, threatEl, damageEl, levelLabel, decButton, incButton);
      this.rowsHost.appendChild(row);
    });

    this.updateThreatDisplay();
    this.updateDamageDisplay();
  }

  destroy(): void {
    this.root.remove();
  }
}
