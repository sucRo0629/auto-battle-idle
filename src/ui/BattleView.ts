import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { BattleEvent } from '../battle/events.ts';
import type { GameData, SaveGameState } from '../battle/types.ts';
import {
  expRequiredForLevel,
  type LevelCurvesConfig,
} from '../progression/levelGrowth.ts';
import { getNextStageId, getStageById } from '../progression/stageProgression.ts';
import { resolveSkillVfx } from '../render/skillVfx/resolveSkillVfx.ts';
import { BattleCanvas, type PartyHudMeta } from '../render/BattleCanvas.ts';
export interface VerifyModeControls {
  isVerifyMode: () => boolean;
  onVerifyModeChange: (enabled: boolean) => void;
  onOpenMetaMenu: () => void;
}

export class BattleView {
  private readonly root: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly stageLabelEl: HTMLElement;
  private readonly verifyModeInput: HTMLInputElement;
  private readonly menuButton: HTMLButtonElement;
  private readonly enhancementTreeButton: HTMLButtonElement;
  private readonly canvas: BattleCanvas;

  constructor(
    container: HTMLElement,
    private readonly engine: BattleEngine,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getSave: () => SaveGameState,
    verifyModeControls?: VerifyModeControls,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'battle-view';

    const header = document.createElement('header');
    header.className = 'battle-header';

    const title = document.createElement('span');
    title.className = 'battle-header-title';
    title.textContent = 'Auto Battle Idle';
    header.appendChild(title);

    const verifyLabel = document.createElement('label');
    verifyLabel.className = 'verify-mode-toggle';

    this.verifyModeInput = document.createElement('input');
    this.verifyModeInput.type = 'checkbox';
    this.verifyModeInput.checked = verifyModeControls?.isVerifyMode() ?? true;
    this.verifyModeInput.addEventListener('change', () => {
      verifyModeControls?.onVerifyModeChange(this.verifyModeInput.checked);
    });

    const verifyText = document.createElement('span');
    verifyText.textContent = '確認モード';

    verifyLabel.append(this.verifyModeInput, verifyText);
    header.appendChild(verifyLabel);
    this.root.appendChild(header);

    this.canvasHost = document.createElement('div');
    this.canvasHost.className = 'battle-canvas-host';

    this.stageLabelEl = document.createElement('div');
    this.stageLabelEl.className = 'battle-stage-label';
    this.canvasHost.appendChild(this.stageLabelEl);

    const menuButtons = document.createElement('div');
    menuButtons.className = 'battle-menu-buttons';

    this.enhancementTreeButton = this.createBattleMenuButton(
      'flowchart',
      '強化ツリー（準備中）',
    );
    this.enhancementTreeButton.disabled = true;

    this.menuButton = this.createBattleMenuButton('group', 'パーティ');
    this.menuButton.addEventListener('click', () => {
      verifyModeControls?.onOpenMetaMenu();
    });

    menuButtons.append(this.enhancementTreeButton, this.menuButton);
    this.canvasHost.appendChild(menuButtons);

    this.root.appendChild(this.canvasHost);

    container.appendChild(this.root);

    this.canvas = new BattleCanvas();
    this.canvas.mount(this.canvasHost);

    this.engine.onEvent((event) => this.onBattleEvent(event));
  }

  private onBattleEvent(event: BattleEvent): void {
    if (event.type === 'skill') {
      const slotLabel =
        event.slotKind === 'basic' ? '通常攻撃' : event.skillName;
      if (event.effect === 'damage' || event.effect === 'dot') {
        if (event.amount !== undefined) {
          this.pushLog(`${slotLabel} → ${event.amount} dmg`);
          this.canvas.showDamagePopup(event.targetId, event.amount);
        }
      } else if (event.effect === 'heal' || event.effect === 'hot') {
        if (event.amount !== undefined) {
          this.pushLog(`${slotLabel} → +${event.amount} HP`);
          this.canvas.showHealPopup(event.targetId, event.amount);
          this.canvas.playAnim(event.actorId, 'heal');
        }
      } else if (
        event.effect === 'buff' ||
        event.effect === 'debuff' ||
        event.effect === 'hot' ||
        event.effect === 'dot'
      ) {
        this.pushLog(`${slotLabel} → ${event.statusLabel ?? event.effect}`);
        this.canvas.showBuffGlow(event.targetId);
      } else {
        this.pushLog(`${slotLabel} (${event.effect})`);
      }
      if (
        event.effect === 'damage' ||
        event.effect === 'dot' ||
        event.effect === 'heal'
      ) {
        const snapshot = this.engine.getSnapshot();
        const actor = [...snapshot.allies, ...snapshot.enemies].find(
          (c) => c.id === event.actorId,
        );
        const skillDef = this.gameData.skillRegistry.actives[event.skillId];
        const vfx = resolveSkillVfx(
          event.skillId,
          {
            role: actor?.role,
            attackRange: actor?.attackRange ?? 'melee',
            slotKind: event.slotKind,
            effectKind: event.effect,
          },
          skillDef?.vfx,
        );
        this.canvas.playAttackEffect(event.actorId, event.targetId, vfx);
        // attack = プレースホルダーの跳ね（将来スプライトアニメに差し替え）
        if (
          (event.effect === 'damage' || event.effect === 'dot') &&
          !(
            actor?.attackRange === 'ranged' && event.slotKind === 'basic'
          )
        ) {
          this.canvas.playAnim(event.actorId, 'attack');
        }
      }
    } else if (event.type === 'hurt') {
      this.canvas.playAnim(event.targetId, 'hurt');
    } else if (event.type === 'death') {
      this.canvas.playAnim(event.targetId, 'death');
    } else if (event.type === 'battleEnd') {
      this.pushLog(event.result === 'victory' ? 'Victory!' : 'Defeat...');
      if (event.result === 'victory') {
        const currentStageId = this.getSave().stageProgress.currentStageId;
        const nextStageId = getNextStageId(
          this.gameData.stages,
          currentStageId,
        );
        this.pushLog(
          nextStageId === currentStageId
            ? 'Looping current stage...'
            : 'Advancing to next stage...',
        );
      } else {
        this.pushLog('Returning to previous stage...');
      }
    }
  }

  private pushLog(message: string): void {
    console.log(`[battle] ${message}`);
  }

  tick(deltaMs: number): void {
    const snapshot = this.engine.getSnapshot();
    const save = this.getSave();
    const stage = getStageById(
      this.gameData.stages,
      save.stageProgress.currentStageId,
    );
    const stageLabel = stage?.displayName ?? save.stageProgress.currentStageId;
    const partyMeta: PartyHudMeta[] = save.party
      .filter((member): member is NonNullable<typeof member> => member !== null)
      .map((member) => {
        const preset = this.gameData.classRegistry[member.classId];
        return {
          displayName: preset?.displayName ?? member.classId,
          level: member.progress.level,
          exp: member.progress.exp,
          expRequired: expRequiredForLevel(
            member.progress.level,
            this.levelCurves,
          ),
        };
      });

    this.stageLabelEl.textContent = stageLabel;
    this.canvas.syncFromSnapshot(snapshot, partyMeta);
    this.canvas.tick(deltaMs);
  }

  setMenuButtonDisabled(disabled: boolean): void {
    this.menuButton.disabled = disabled;
  }

  private createBattleMenuButton(
    iconName: string,
    ariaLabel: string,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'battle-menu-button';
    button.setAttribute('aria-label', ariaLabel);
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconName;
    button.appendChild(icon);
    return button;
  }

  destroy(): void {
    this.canvas.destroy();
    this.root.remove();
  }

  syncVerifyModeToggle(enabled: boolean): void {
    this.verifyModeInput.checked = enabled;
  }
}
