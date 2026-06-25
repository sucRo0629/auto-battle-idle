import type { PartyHudEntry } from './partyHudTypes.ts';

export type RecastFillState =
  | 'empty'
  | 'active'
  | 'paused'
  | 'ready'
  | 'charging';

export interface RecastFillView {
  widthPct: number;
  state: RecastFillState;
  pausedMax?: boolean;
  showFireHold: boolean;
}

export type PartyHudActiveCooldown = PartyHudEntry['activeCooldowns'][number];

export function resolveRecastFillView(
  cd: PartyHudActiveCooldown | undefined,
  useLocked: boolean,
): RecastFillView {
  if (!cd) {
    return { widthPct: 0, state: 'empty', showFireHold: false };
  }

  if (cd.stageTriggerExhausted) {
    return { widthPct: 0, state: 'empty', showFireHold: false };
  }

  const showFireHold = cd.fireHold === true;

  const activeEffectRemaining = cd.activeEffectRemaining ?? 0;
  const activeEffectTotal = cd.activeEffectTotal ?? 0;
  if (activeEffectRemaining > 0 && activeEffectTotal > 0) {
    const ratio = Math.max(
      0,
      Math.min(1, activeEffectRemaining / activeEffectTotal),
    );
    return {
      widthPct: ratio * 100,
      state: 'active',
      showFireHold,
    };
  }

  const ready = cd.remaining <= 0;
  const chargeRatio = ready
    ? 1
    : Math.max(0, Math.min(1, 1 - cd.remaining / cd.triggerValue));

  if (useLocked) {
    return {
      widthPct: chargeRatio * 100,
      state: 'paused',
      pausedMax: ready ? true : undefined,
      showFireHold,
    };
  }

  return {
    widthPct: chargeRatio * 100,
    state: ready ? 'ready' : 'charging',
    showFireHold,
  };
}
