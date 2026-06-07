import '../styles/debug-menu.css';
import type { GameData, SaveGameState } from '../battle/types.ts';

export interface DebugMenuControls {
  isVerifyMode: () => boolean;
  getSave: () => SaveGameState;
  onMemberLevelChange: (partyIndex: number, level: number) => void;
}

export class DebugMenuPanel {
  private readonly root: HTMLElement;
  private readonly rowsHost: HTMLElement;

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

  refresh(): void {
    const verifyMode = this.controls.isVerifyMode();
    this.root.hidden = !verifyMode;
    if (!verifyMode) return;

    const save = this.controls.getSave();
    this.rowsHost.replaceChildren();

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
      row.append(nameEl, levelLabel, decButton, incButton);
      this.rowsHost.appendChild(row);
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
