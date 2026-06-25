import { currentHpRatio, getPassiveDefs } from './combatMath.ts';
import type { CombatantState, PassiveSkillDef } from './types.ts';

export const LOW_HP_COVER_HP_RATIO_THRESHOLD_DEFAULT = 0.35;
export const LOW_HP_COVER_WAVE_LIMIT_DEFAULT = 3;

export function isLowHpCoverPassive(passive: PassiveSkillDef): boolean {
  return passive.effect === 'lowHpCover';
}

function resolveCoverHpRatioThreshold(passive: PassiveSkillDef): number {
  return passive.coverHpRatioThreshold ?? LOW_HP_COVER_HP_RATIO_THRESHOLD_DEFAULT;
}

function resolveCoverWaveLimit(passive: PassiveSkillDef): number {
  return passive.coverWaveLimit ?? LOW_HP_COVER_WAVE_LIMIT_DEFAULT;
}

function findLowHpCoverDuelist(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): { duelist: CombatantState; passive: PassiveSkillDef } | null {
  for (const ally of allies) {
    if (!ally.isAlive || ally.classId !== 'df_duelist') continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (!isLowHpCoverPassive(passive)) continue;
      return { duelist: ally, passive };
    }
  }
  return null;
}

export function resetLowHpCoverRedirects(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  const cover = findLowHpCoverDuelist(allies, passives);
  if (!cover) return;
  cover.duelist.coverRedirectsRemaining = resolveCoverWaveLimit(cover.passive);
}

export interface LowHpCoverRedirectResult {
  target: CombatantState;
  redirected: boolean;
  coverDuelistId?: string;
}

/** 低 HP 味方へのダメージを闘技士へ差し替え（Wave 上限あり） */
export function resolveLowHpCoverTarget(
  intendedTarget: CombatantState,
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): LowHpCoverRedirectResult {
  if (
    intendedTarget.isEnemy ||
    !intendedTarget.isAlive ||
    intendedTarget.classId === 'df_duelist'
  ) {
    return { target: intendedTarget, redirected: false };
  }

  const cover = findLowHpCoverDuelist(allies, passives);
  if (!cover || !cover.duelist.isAlive || cover.duelist.id === intendedTarget.id) {
    return { target: intendedTarget, redirected: false };
  }

  const threshold = resolveCoverHpRatioThreshold(cover.passive);
  if (currentHpRatio(intendedTarget) > threshold) {
    return { target: intendedTarget, redirected: false };
  }

  const remaining =
    cover.duelist.coverRedirectsRemaining ??
    resolveCoverWaveLimit(cover.passive);
  if (remaining <= 0) {
    return { target: intendedTarget, redirected: false };
  }

  cover.duelist.coverRedirectsRemaining = remaining - 1;
  return {
    target: cover.duelist,
    redirected: true,
    coverDuelistId: cover.duelist.id,
  };
}
