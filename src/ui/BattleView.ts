import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { BattleEvent } from '../battle/events.ts';
import type { GameData, SaveGameState } from '../battle/types.ts';
import {
  expRequiredForLevel,
  type LevelCurvesConfig,
} from '../progression/levelGrowth.ts';
import { getStageById } from '../progression/stageProgression.ts';
import { resolveAttackEffectKind } from '../render/AttackEffect.ts';
import { BattleCanvas, type PartyHudMeta } from '../render/BattleCanvas.ts';

export class BattleView {
  private readonly root: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly stageLabelEl: HTMLElement;
  private readonly canvas: BattleCanvas;

  constructor(
    container: HTMLElement,
    private readonly engine: BattleEngine,
    private readonly gameData: GameData,
    private readonly levelCurves: LevelCurvesConfig,
    private readonly getSave: () => SaveGameState,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'battle-view';

    const header = document.createElement('header');
    header.className = 'battle-header';
    header.textContent = 'Auto Battle Idle';
    this.root.appendChild(header);

    this.canvasHost = document.createElement('div');
    this.canvasHost.className = 'battle-canvas-host';

    this.stageLabelEl = document.createElement('div');
    this.stageLabelEl.className = 'battle-stage-label';
    this.canvasHost.appendChild(this.stageLabelEl);

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
      if (event.effect === 'damage' && event.amount !== undefined) {
        this.pushLog(`${slotLabel} → ${event.amount} dmg`);
        this.canvas.showDamagePopup(event.targetId, event.amount);
      } else if (event.effect === 'heal' && event.amount !== undefined) {
        this.pushLog(`${slotLabel} → +${event.amount} HP`);
        this.canvas.showHealPopup(event.targetId, event.amount);
        this.canvas.playAnim(event.actorId, 'heal');
      } else if (event.effect === 'buff' || event.effect === 'debuff') {
        this.pushLog(`${slotLabel} → ${event.statusLabel ?? event.effect}`);
        this.canvas.showBuffGlow(event.targetId);
      } else {
        this.pushLog(`${slotLabel} (${event.effect})`);
      }
      if (event.effect === 'damage' || event.effect === 'heal') {
        const snapshot = this.engine.getSnapshot();
        const actor = [...snapshot.allies, ...snapshot.enemies].find(
          (c) => c.id === event.actorId,
        );
        const kind = resolveAttackEffectKind(actor?.role, event.range);
        this.canvas.playAttackEffect(
          event.actorId,
          event.targetId,
          kind,
          event.effect === 'heal',
        );
      }
      if (event.effect === 'damage') {
        this.canvas.playAnim(event.actorId, 'attack');
      }
    } else if (event.type === 'hurt') {
      this.canvas.playAnim(event.targetId, 'hurt');
    } else if (event.type === 'death') {
      this.canvas.playAnim(event.targetId, 'death');
    } else if (event.type === 'battleEnd') {
      this.pushLog(event.result === 'victory' ? 'Victory!' : 'Defeat...');
      if (event.result === 'victory') {
        this.pushLog('Advancing to next stage...');
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
    const partyMeta: PartyHudMeta[] = save.party.map((member) => {
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

  destroy(): void {
    this.canvas.destroy();
    this.root.remove();
  }
}
