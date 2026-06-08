import type { SkillEffectKind } from './types.ts';

export type BattleEvent =
  | {
      type: 'skill';
      actorId: string;
      targetId: string;
      skillId: string;
      skillName: string;
      slotKind?: 'basic' | 'active';
      effect: SkillEffectKind;
      effectIndex?: number;
      amount?: number;
      range?: number;
      statusLabel?: string;
      hitIndex?: number;
    }
  | { type: 'hurt'; targetId: string }
  | { type: 'death'; targetId: string }
  | { type: 'levelUp'; actorId: string; newLevel: number; statOnly: boolean }
  | { type: 'skillLearn'; actorId: string; skillId: string; skillName: string }
  | { type: 'enhancementUnlock'; nodeId: string; nodeName: string }
  | {
      type: 'battleEnd';
      result: 'victory' | 'defeat';
      survivingPartyIndices: number[];
    };

export type BattleEventListener = (event: BattleEvent) => void;
