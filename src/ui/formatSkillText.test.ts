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
      name: 'passive hot fractional percent max hp',
      def: {
        id: 'sp_alchemist_passive_1',
        name: '薬効の香り',
        effect: 'heal',
        healSubKind: 'hot',
        hotAmount: {
          kind: 'percentMaxHp',
          percentOfMaxHp: 0.004,
        },
        hotTargetRule: {
          kind: 'all',
          side: 'ally',
        },
      } satisfies PassiveSkillDef,
      fragments: ['常時 HoT maxHp×0.4%', '味方全員'],
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
          moveMode: 'toAnchor',
          anchorOffsetPx: 32,
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
    expect(desc).toContain('アンカー +32px');
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

  it('includes stop duration when useDurationSec is set', () => {
    const def: ActiveSkillDef = {
      id: 'test_stop',
      name: '防御専念',
      trigger: { kind: 'time', value: 12 },
      useDurationSec: 6,
      effect: [
        {
          type: 'buff',
          buffStat: 'def',
          buffMultiplier: 1.5,
          buffDurationSec: 6,
          target: { kind: 'self' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('12s毎');
    expect(desc).toContain('停止6s');
    expect(desc).toContain('バフ');
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

  it('formats smart fire gate and maxCharges', () => {
    const def: ActiveSkillDef = {
      id: 'test_smart',
      name: '条件技',
      trigger: { kind: 'time', value: 8 },
      firePolicy: 'smart',
      fireConditions: [{ kind: 'enemyCount', min: 2 }],
      fireTimeoutSec: 5,
      maxCharges: 2,
      effect: [
        {
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 1 },
          target: { kind: 'distance', side: 'enemy', order: 'nearest' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('smart:');
    expect(desc).toContain('敵数≥2');
    expect(desc).toContain('待機上限5s');
    expect(desc).toContain('ストック上限2');
  });

  it('formats skillPropertyOverride passive', () => {
    const def: PassiveSkillDef = {
      id: 'passive_charge_bonus',
      name: 'チャージ強化',
      effect: 'skillPropertyOverride',
      maxChargesBonus: 1,
      skillPropertyTargetSkillIds: ['at_warrior_active_1'],
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toContain('maxCharges +1');
    expect(desc).toContain('at_warrior_active_1');
  });

  it('formats counter passive with slash-separated summary', () => {
    const def: PassiveSkillDef = {
      id: 'at_ranger_passive_3',
      name: '応射',
      effect: 'counter',
      chance: 0.33,
      counterRange: 0,
      counterRanged: true,
      counterResponses: [
        {
          kind: 'damage',
          amount: { kind: 'atkBased', atkScale: 1 },
          damageType: 'physical',
        },
      ],
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toBe(
      '被攻撃時 33% で反撃 / 物理ATK / 射程+0 / 対象遠隔',
    );
  });

  it('formats active counter range 0 as 射程+0', () => {
    const def: ActiveSkillDef = {
      id: 'active_counter',
      name: '反撃態勢',
      trigger: { kind: 'time', value: 12 },
      effect: [
        {
          type: 'counter',
          range: 0,
          durationSec: 5,
          responses: [
            { kind: 'damage', amount: { kind: 'atkBased', atkScale: 0.8 } },
          ],
          target: { kind: 'self' },
        },
      ],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('射程+0');
    expect(desc).not.toContain('射程0');
  });
});
