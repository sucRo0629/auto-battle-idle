import type {
  BattleSnapshot,
  ClassPreset,
  PartySlotState,
  SkillTriggerKind,
  StatusEffect,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';
import type { AppLocale } from '../i18n/locale.ts';
import { getLocale } from '../i18n/locale.ts';
import { getUnlockedSkillSlotCount } from '../progression/skillBuild.ts';
import { readClassDisplayLabel } from './classDisplayName.ts';

export interface PartyHudMeta {
  displayName: string;
  epithetEn?: string;
  unlockedActiveSlotCount: number;
}

export interface PartyHudEntry {
  unitId: string;
  displayName: string;
  iconKey: string;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  isAlive: boolean;
  useLocked: boolean;
  /** Lv 帯で解放済みのアクティブ枠数（Lv1=2, Lv10=3, Lv20=4） */
  unlockedActiveSlotCount: number;
  statusEffects: StatusEffect[];
  activeCooldowns: {
    skillId: string;
    remaining: number;
    triggerKind: SkillTriggerKind;
    triggerValue: number;
    slotIndex: number;
    storedCharges?: number;
    maxCharges?: number;
    fireHold?: boolean;
    activeEffectRemaining?: number;
    activeEffectTotal?: number;
    /** stageTriggerLimit 消費済み（HUD は最暗の empty 表示） */
    stageTriggerExhausted?: boolean;
  }[];
}

export function buildPartyHudMetaBySlot(
  party: PartySlotState[],
  classRegistry: Record<string, ClassPreset>,
  locale: AppLocale = getLocale(),
): (PartyHudMeta | null)[] {
  return Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) => {
    const member = party[slotIndex];
    if (!member) return null;
    const preset = classRegistry[member.classId];
    const label = readClassDisplayLabel(preset, member.classId, locale);
    return {
      displayName: label.displayName,
      epithetEn: label.epithetEn,
      unlockedActiveSlotCount: getUnlockedSkillSlotCount(member.progress.level),
    };
  });
}

export function buildPartyHudEntries(
  snapshot: BattleSnapshot,
  partyMetaBySlot: (PartyHudMeta | null)[] = [],
): (PartyHudEntry | null)[] {
  return Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) => {
    const meta = partyMetaBySlot[slotIndex];
    if (!meta) return null;

    const ally = snapshot.allies.find(
      (unit) => unit.partySlotIndex === slotIndex,
    );
    if (!ally) return null;

    return {
      unitId: ally.id,
      displayName: meta.displayName,
      iconKey: ally.iconKey,
      hp: ally.hp,
      maxHp: ally.maxHp,
      baseMaxHp: ally.baseMaxHp,
      barrierHp: ally.barrierHp,
      atk: ally.atk,
      def: ally.def,
      reg: ally.reg,
      isAlive: ally.hp > 0,
      useLocked: ally.useLocked ?? false,
      unlockedActiveSlotCount: meta.unlockedActiveSlotCount,
      statusEffects: ally.statusEffects,
      activeCooldowns: ally.activeCooldowns,
    };
  });
}
