import type { BattleSnapshot, SkillTriggerKind, StatusEffect } from '../battle/types.ts';

export interface PartyHudMeta {
  displayName: string;
  epithetEn?: string;
  level: number;
}

export interface PartyHudEntry {
  displayName: string;
  level: number;
  iconKey: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  isAlive: boolean;
  statusEffects: StatusEffect[];
  activeCooldowns: {
    skillId: string;
    remaining: number;
    triggerKind: SkillTriggerKind;
    triggerValue: number;
    slotIndex: number;
  }[];
}

export function buildPartyHudEntries(
  snapshot: BattleSnapshot,
  partyMeta: PartyHudMeta[] = [],
): PartyHudEntry[] {
  return snapshot.allies.map((ally, index) => {
    const meta = partyMeta[index];
    return {
      displayName: meta?.displayName ?? ally.name,
      level: meta?.level ?? 1,
      iconKey: ally.iconKey,
      hp: ally.hp,
      maxHp: ally.maxHp,
      barrierHp: ally.barrierHp,
      atk: ally.atk,
      def: ally.def,
      reg: ally.reg,
      isAlive: ally.hp > 0,
      statusEffects: ally.statusEffects,
      activeCooldowns: ally.activeCooldowns,
    };
  });
}
