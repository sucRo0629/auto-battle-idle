import type { BattleEngine } from '../battle/BattleEngine.ts';
import type { BattleEvent } from '../battle/events.ts';
import { BattleCanvas } from '../render/BattleCanvas.ts';
import type { ViewMode } from './viewMode.ts';

const LOG_LIMIT_FULL = 20;
const LOG_LIMIT_AMBIENT = 3;

export class BattleView {
  private readonly root: HTMLElement;
  private readonly canvasHost: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly canvas: BattleCanvas;
  private readonly logs: string[] = [];

  constructor(
    container: HTMLElement,
    private readonly engine: BattleEngine,
    private readonly viewMode: ViewMode,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'battle-view';

    const header = document.createElement('header');
    header.className = 'battle-header';
    header.textContent = 'Auto Battle Idle';
    this.root.appendChild(header);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'battle-status';
    this.root.appendChild(this.statusEl);

    this.canvasHost = document.createElement('div');
    this.canvasHost.className = 'battle-canvas-host';
    this.root.appendChild(this.canvasHost);

    this.logEl = document.createElement('div');
    this.logEl.className = 'battle-log';
    this.root.appendChild(this.logEl);

    container.appendChild(this.root);

    this.canvas = new BattleCanvas(viewMode === 'ambient');
    this.canvas.mount(this.canvasHost);

    this.engine.onEvent((event) => this.onBattleEvent(event));
  }

  private onBattleEvent(event: BattleEvent): void {
    if (event.type === 'skill') {
      const slotLabel =
        event.slotKind === 'basic' ? '通常攻撃' : event.skillName;
      if (event.effect === 'damage' && event.amount !== undefined) {
        this.pushLog(`${slotLabel} → ${event.amount} dmg`);
      } else if (event.effect === 'heal' && event.amount !== undefined) {
        this.pushLog(`${slotLabel} → +${event.amount} HP`);
        this.canvas.playAnim(event.actorId, 'heal');
      } else {
        this.pushLog(`${slotLabel} (${event.effect})`);
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
    }
  }

  private pushLog(message: string): void {
    this.logs.unshift(message);
    const limit = this.viewMode === 'ambient' ? LOG_LIMIT_AMBIENT : LOG_LIMIT_FULL;
    if (this.logs.length > limit) {
      this.logs.length = limit;
    }
    this.renderLog();
  }

  private renderLog(): void {
    this.logEl.innerHTML = this.logs.map((l) => `<div>${l}</div>`).join('');
  }

  tick(deltaMs: number): void {
    const snapshot = this.engine.getSnapshot();
    this.statusEl.textContent = `Status: ${snapshot.phase.toUpperCase()}`;
    this.canvas.syncFromSnapshot(snapshot);
    this.canvas.tick(deltaMs);
  }

  destroy(): void {
    this.canvas.destroy();
    this.root.remove();
  }
}
