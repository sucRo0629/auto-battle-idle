import type { ActiveSkillDef, SkillTriggerKind } from '../battle/types.ts';
import { t } from '../i18n/t.ts';
import { formatActiveDescription } from './formatSkillText.ts';
import type { PartyHudActiveCooldown } from './partyHudRecast.ts';

function unlockLevelForSlotIndex(slotIndex: number): number | null {
  if (slotIndex >= 3) return 20;
  if (slotIndex >= 2) return 10;
  return null;
}

function formatRecastProgressLine(cd: PartyHudActiveCooldown): string {
  const activeRemaining = cd.activeEffectRemaining ?? 0;
  const activeTotal = cd.activeEffectTotal ?? 0;
  if (activeRemaining > 0 && activeTotal > 0) {
    return t('hud.skillActiveRemaining', {
      remaining: String(Math.ceil(activeRemaining)),
      total: String(Math.ceil(activeTotal)),
    });
  }

  if (cd.remaining <= 0) {
    return t('hud.skillReady');
  }

  return t('hud.skillRecastRemaining', {
    remaining: formatTriggerRemaining(cd.triggerKind, cd.remaining),
  });
}

function formatTriggerRemaining(
  kind: SkillTriggerKind,
  remaining: number,
): string {
  const value = Math.ceil(remaining);
  switch (kind) {
    case 'time':
      return t('hud.skillRecastSeconds', { seconds: String(value) });
    case 'basicAttackCount':
      return t('hud.skillRecastBasicAttacks', { count: String(value) });
    case 'hitCount':
      return t('hud.skillRecastHits', { count: String(value) });
    default:
      return String(value);
  }
}

export function formatPartyHudSkillSlotTooltip(
  slotIndex: number,
  cd: PartyHudActiveCooldown | undefined,
  skillDef: ActiveSkillDef | undefined,
  inactive: boolean,
): string | null {
  if (inactive) {
    const unlockLevel = unlockLevelForSlotIndex(slotIndex);
    if (unlockLevel === null) return null;
    return t('hud.skillSlotUnlocksAt', { level: String(unlockLevel) });
  }

  if (!cd?.skillId) return null;

  const name = skillDef?.displayName ?? cd.skillId;
  const progress = formatRecastProgressLine(cd);
  const description =
    cd.remaining <= 0 &&
    (cd.activeEffectRemaining ?? 0) <= 0 &&
    skillDef
      ? formatActiveDescription(skillDef)
      : null;

  return description ? `${name}\n${progress}\n${description}` : `${name}\n${progress}`;
}
