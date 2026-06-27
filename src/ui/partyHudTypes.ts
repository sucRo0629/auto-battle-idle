import type {
  BattleSnapshot,
  ClassPreset,
  PartySlotState,
  SkillTriggerKind,
  StatusEffect,
} from '../battle/types.ts';
import { PARTY_SLOT_COUNT } from '../battle/types.ts';

export interface PartyHudMeta {
  displayName: string;
  epithetEn?: string;
}

export interface PartyHudEntry {
  displayName: string;
  iconKey: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  isAlive: boolean;
  useLocked: boolean;
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
): (PartyHudMeta | null)[] {
  return Array.from({ length: PARTY_SLOT_COUNT }, (_, slotIndex) => {
    const member = party[slotIndex];
    if (!member) return null;
    const preset = classRegistry[member.classId];
    return {
      displayName: preset?.displayName ?? member.classId,
      epithetEn: preset?.epithetEn,
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
      displayName: meta.displayName,
      iconKey: ally.iconKey,
      hp: ally.hp,
      maxHp: ally.maxHp,
      barrierHp: ally.barrierHp,
      atk: ally.atk,
      def: ally.def,
      reg: ally.reg,
      isAlive: ally.hp > 0,
      useLocked: ally.useLocked ?? false,
      statusEffects: ally.statusEffects,
      activeCooldowns: ally.activeCooldowns,
    };
  });
}
