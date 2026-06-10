/** カメラ廃止: screenX === battleX */
export function toScreenX(visualX: number, _combatCameraX: number = 0): number {
  return visualX;
}

export function fromScreenX(screenX: number, _combatCameraX: number = 0): number {
  return screenX;
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
