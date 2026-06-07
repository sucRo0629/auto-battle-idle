import './style.css';
import { loadGameData } from './battle/data/loadGameData.ts';
import { GameSession } from './game/GameSession.ts';

const gameData = loadGameData();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('#app not found');
}

const session = new GameSession(gameData, app);
session.start();

let lastTime = performance.now();

function loop(now: number): void {
  const deltaMs = now - lastTime;
  lastTime = now;
  const deltaSec = Math.min(deltaMs / 1000, 0.1);
  session.tick(deltaSec, deltaMs);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
