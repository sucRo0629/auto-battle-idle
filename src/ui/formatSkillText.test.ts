import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, PassiveSkillDef } from '../battle/types.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
} from './formatSkillText.ts';

describe('formatPassiveDescription', () => {
  it.each([
    {
      name: 'target rule override',
      def: {
        id: 'passive_target_highest_atk',
        name: '脅威の標的',
        effect: 'targetRuleOverride',
        targetRuleOverride: {
          kind: 'stat',
          side: 'enemy',
          stat: 'atk',
          order: 'highest',
        },
      } satisfies PassiveSkillDef,
      fragments: ['敵向けターゲット', '敵', 'ATK最高'],
    },
    {
      name: 'damage taken to heal',
      def: {
        id: 'passive_damage_taken_heal',
        name: '聖なる吸収',
        effect: 'buff',
        buffSubKind: 'damageTakenToHeal',
        ratio: 0.1,
        buffTargetRule: { kind: 'self' },
      } satisfies PassiveSkillDef,
      fragments: ['被ダメ回復', '10%'],
    },
    {
      name: 'self HP ratio buff',
      def: {
        id: 'passive_self_low_hp_dmg',
        name: '滾る闘志',
        effect: 'selfHpRatioBuff',
        buffStat: 'atk',
        buffMultiplierMax: 1.5,
        maxBuffAtHpRatio: 0.6,
      } satisfies PassiveSkillDef,
      fragments: ['自HP比例', 'ATK', '×1.5', '60%以下'],
    },
    {
      name: 'passive buff evasion',
      def: {
        id: 'passive_evasion',
        name: '影歩',
        effect: 'buff',
        buffSubKind: 'evasion',
        chance: 0.18,
        buffTargetRule: { kind: 'self' },
      } satisfies PassiveSkillDef,
      fragments: ['バフ', '回避', '18%'],
    },
    {
      name: 'special effect damage',
      def: {
        id: 'passive_damage_vs_dot',
        name: '追い狩り',
        effect: 'specialEffect',
        specialEffectApplyTo: 'damage',
        specialEffect: {
          scale: 1.3,
          conditions: [{ kind: 'debuff', tags: ['dot'], selfAppliedOnly: true }],
        },
      } satisfies PassiveSkillDef,
      fragments: ['特効', 'ダメージ', '×1.3'],
    },
  ])('$name', ({ def, fragments }) => {
    const desc = formatPassiveDescription(def);
    for (const fragment of fragments) {
      expect(desc).toContain(fragment);
    }
  });
});

describe('formatActiveDescription', () => {
  it('formats aoe physical damage', () => {
    const def: ActiveSkillDef = {
      id: 'at_warrior_active_2',
      name: '薙ぎ払い',
      trigger: { kind: 'time', value: 11 },
      effect: [
        {
          targetShape: 'aoe',
          aoeRadiusPx: 50,
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.9 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('11s');
    expect(desc).toContain('物理 ATK×0.9');
    expect(desc).toContain('範囲');
    expect(desc).toContain('±50px');
  });

  it('formats move + multi-lock damage', () => {
    const def: ActiveSkillDef = {
      id: 'at_assassin_active_1',
      name: '背刺',
      trigger: { kind: 'time', value: 9 },
      effect: [
        {
          type: 'move',
          moveMode: 'behindTarget',
          moveDurationSec: 0.3,
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
        {
          targetShape: 'multiLock',
          hitCount: 3,
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.7 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('9s');
    expect(desc).toContain('移動');
    expect(desc).toContain('背後');
    expect(desc).toContain('マルチロック');
    expect(desc).toContain('×3');
    expect(desc).toContain('物理 ATK×0.7');
  });

  it('formats buff with flat bonus before multiplier', () => {
    const def: ActiveSkillDef = {
      id: 'df_guardian_active_2',
      name: '防御専念',
      trigger: { kind: 'hitsTaken', value: 10 },
      effect: [
        {
          type: 'buff',
          buffStat: 'def',
          buffMultiplier: 1.8,
          buffFlatBonus: 10,
          buffDurationSec: 4,
          target: { kind: 'self' },
        },
        {
          type: 'heal',
          healSubKind: 'hot',
          durationSec: 4,
          amount: { kind: 'percentMaxHp', percentOfMaxHp: 0.01 },
          target: { kind: 'self' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('10被攻撃毎');
    expect(desc).toContain('( DEF + 10 ) ×1.8');
    expect(desc).toContain('HoT maxHp×1%');
  });

  it('formats percentMaxHp with self reference', () => {
    const def: ActiveSkillDef = {
      id: 'test_self_maxhp',
      name: '自己割合回復',
      trigger: { kind: 'time', value: 5 },
      effect: [
        {
          type: 'heal',
          amount: {
            kind: 'percentMaxHp',
            percentOfMaxHp: 0.01,
            maxHpRef: 'self',
          },
          target: { kind: 'self' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('自身maxHp×1%');
  });

  it('formats skillAmountOverride passive', () => {
    const def: PassiveSkillDef = {
      id: 'passive_override',
      name: '強化',
      effect: 'skillAmountOverride',
      targetSkillId: 'at_warrior_active_1',
      amount: { kind: 'atkBased', atkScale: 2.5 },
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toContain('at_warrior_active_1');
    expect(desc).toContain('ATK×2.5');
  });

  it('formats pierce damage', () => {
    const def: ActiveSkillDef = {
      id: 'at_lancer_active_1',
      name: '貫突',
      trigger: { kind: 'time', value: 9 },
      effect: [
        {
          targetShape: 'pierce',
          pierceDurationSec: 0.2,
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1.1 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('貫通');
    expect(desc).toContain('物理 ATK×1.1');
  });
});
