import type { CombatantState } from './types.ts';
import {
  APPROACH_SPEED,
  CANVAS_W,
  COMBAT_CAMERA_CENTER_X,
  ROW_X,
  SPRITE_WIDTH,
} from './battleConstants.ts';

const BATTLE_UI_RIGHT_PAD = 16;
const CAMERA_PAN_SPEED = 400;

export function toScreenX(visualX: number, combatCameraX: number): number {
  return visualX + combatCameraX;
}

export function fromScreenX(screenX: number, combatCameraX: number): number {
  return screenX - combatCameraX;
}

/** 生存プレイヤーの visual 重心 */
export function resolvePartyCenterVisualX(
  players: CombatantState[],
  isOnField: (u: CombatantState) => boolean,
): number | null {
  const living = players.filter((p) => p.isAlive && isOnField(p));
  if (living.length === 0) return null;
  const sum = living.reduce((acc, p) => acc + p.visualX, 0);
  return sum / living.length;
}

export function moveTowardX(
  current: number,
  target: number,
  maxDelta: number,
): number {
  if (maxDelta <= 0) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

export interface CameraTickState {
  combatCameraX: number;
  cameraFocusLineX: number;
}

export function tickCombatCamera(
  state: CameraTickState,
  partyCenterVisualX: number | null,
  deltaTime: number,
): void {
  if (partyCenterVisualX === null) return;

  const step = CAMERA_PAN_SPEED * deltaTime;
  state.cameraFocusLineX = moveTowardX(
    state.cameraFocusLineX,
    partyCenterVisualX,
    step,
  );
  let targetCamera = COMBAT_CAMERA_CENTER_X - state.cameraFocusLineX;
  const maxCamera =
    CANVAS_W - BATTLE_UI_RIGHT_PAD - ROW_X.back - SPRITE_WIDTH;
  targetCamera = Math.min(targetCamera, maxCamera);
  state.combatCameraX = moveTowardX(
    state.combatCameraX,
    targetCamera,
    step,
  );
}

/** combatCameraX を battleX へ戻し screen X を維持したままカメラを 0 にする */
export function bakeCombatCameraIntoBattleX(
  players: CombatantState[],
  enemies: CombatantState[],
  combatCameraX: number,
  filter: (unit: CombatantState) => boolean,
): number {
  if (combatCameraX === 0) return 0;
  for (const unit of [...players, ...enemies]) {
    if (filter(unit)) {
      unit.battleX += combatCameraX;
      unit.visualX = unit.battleX;
    }
  }
  return 0;
}

/** @deprecated bakeCombatCameraIntoBattleX */
export function bakeCombatCameraIntoVisualX(
  players: CombatantState[],
  enemies: CombatantState[],
  combatCameraX: number,
  filter: (unit: CombatantState) => boolean,
): number {
  return bakeCombatCameraIntoBattleX(
    players,
    enemies,
    combatCameraX,
    filter,
  );
}

export function resetCameraFocus(frontRowX: number = ROW_X.front): {
  combatCameraX: number;
  cameraFocusLineX: number;
} {
  return { combatCameraX: 0, cameraFocusLineX: frontRowX };
}

export { APPROACH_SPEED as FORMATION_SPACING_SPEED };
