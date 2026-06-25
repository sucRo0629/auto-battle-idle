import type { CombatantState } from './types.ts';

export const INVULNERABLE_OVERLAY = 'invulnerable' as const;
const INVULNERABLE_ID_PREFIX = 'invulnerable_';

export function isInvulnerable(target: CombatantState): boolean {
  return target.statusEffects.some(
    (effect) =>
      effect.overlay === INVULNERABLE_OVERLAY && effect.remainingSec > 0,
  );
}

export function grantInvulnerable(
  target: CombatantState,
  durationSec: number,
  sourceId: string,
): void {
  if (durationSec <= 0) return;
  const effectId = `${INVULNERABLE_ID_PREFIX}${target.id}`;
  target.statusEffects = target.statusEffects.filter((e) => e.id !== effectId);
  target.statusEffects.push({
    id: effectId,
    kind: 'buff',
    overlay: INVULNERABLE_OVERLAY,
    multiplier: 1,
    durationSec,
    remainingSec: durationSec,
    sourceId,
    displayName: '無敵',
  });
}
