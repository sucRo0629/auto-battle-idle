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
  /** 編成スロット（0〜3）。HUD 縦位置の正本ではない */
  partySlotIndex: number;
  /** クラス traits.rangePx（戦闘中 HUD 並び順の正本） */
  rangePx: number;
  displayName: string;
  iconKey: string;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  res: number;
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
  /** R8e: 作戦中に取得したパッシブの日本語表示名（slot 別・read-only） */
  acquiredOperationPassiveNames?: readonly string[];
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

function comparePartyHudEntryByRange(
  a: PartyHudEntry,
  b: PartyHudEntry,
): number {
  if (a.rangePx !== b.rangePx) return a.rangePx - b.rangePx;
  return a.partySlotIndex - b.partySlotIndex;
}

/** 味方 HUD: 射程昇順（同射程は partySlotIndex 昇順）。entries[0] が視覚先頭（右端） */
export function sortPartyHudEntriesByRange(
  entries: (PartyHudEntry | null)[],
): (PartyHudEntry | null)[] {
  const occupied = entries.filter(
    (entry): entry is PartyHudEntry => entry !== null,
  );
  occupied.sort(comparePartyHudEntryByRange);

  const sorted: (PartyHudEntry | null)[] = Array.from(
    { length: entries.length },
    () => null,
  );
  occupied.forEach((entry, visualIndex) => {
    sorted[visualIndex] = entry;
  });
  return sorted;
}

export function buildPartyHudEntries(
  snapshot: BattleSnapshot,
  partyMetaBySlot: (PartyHudMeta | null)[] = [],
): (PartyHudEntry | null)[] {
  const byPartySlot = Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) => {
    const meta = partyMetaBySlot[slotIndex];
    if (!meta) return null;

    const ally = snapshot.allies.find(
      (unit) => unit.partySlotIndex === slotIndex,
    );
    if (!ally) return null;

    return {
      unitId: ally.id,
      partySlotIndex: slotIndex,
      rangePx: ally.rangePx,
      displayName: meta.displayName,
      iconKey: ally.iconKey,
      hp: ally.hp,
      maxHp: ally.maxHp,
      baseMaxHp: ally.baseMaxHp,
      barrierHp: ally.barrierHp,
      atk: ally.atk,
      def: ally.def,
      res: ally.res,
      isAlive: ally.hp > 0,
      useLocked: ally.useLocked ?? false,
      unlockedActiveSlotCount: meta.unlockedActiveSlotCount,
      statusEffects: ally.statusEffects,
      activeCooldowns: ally.activeCooldowns,
    };
  });

  return sortPartyHudEntriesByRange(byPartySlot);
}
