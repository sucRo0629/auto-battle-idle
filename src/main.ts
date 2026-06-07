import './style.css';
import { BattleEngine } from './battle/BattleEngine.ts';
import { loadGameData } from './battle/data/loadGameData.ts';
import { BattleView } from './ui/BattleView.ts';
import { applyViewMode, getViewMode } from './ui/viewMode.ts';

const gameData = loadGameData();
const viewMode = getViewMode();
applyViewMode(viewMode);

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app not found');
}

const engine = new BattleEngine(gameData, 'demo', 'stage_1');
const view = new BattleView(app, engine, viewMode);
engine.startBattle();

let lastTime = performance.now();

function loop(now: number): void {
  const deltaMs = now - lastTime;
  lastTime = now;
  const deltaSec = Math.min(deltaMs / 1000, 0.1);
  engine.tick(deltaSec);
  view.tick(deltaMs);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
