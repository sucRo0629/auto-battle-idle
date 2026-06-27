import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, PassiveSkillDef } from '../battle/types.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
  formatSkillCardLines,
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
      name: 'damage delay',
      def: {
        id: 'test_damage_delay',
        name: '体力温存',
        effect: 'buff',
        buffSubKind: 'damageDelay',
        ratio: 0.5,
        buffTargetRule: { kind: 'self' },
      } satisfies PassiveSkillDef,
      fragments: ['ダメージ遅延', '50%'],
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
    expect(desc).toContain('CD：11秒');
    expect(desc).toContain('至近物理ATK×0.9');
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
    expect(desc).toContain('CD：9秒');
    expect(desc).toContain('アンカー +32px');
    expect(desc).toContain('至近物理ATK×0.7');
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
    expect(desc).toContain('CD：被撃10');
    expect(desc).toContain('(DEF+10)×1.8');
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

  it('includes lock duration when useDurationSec is set', () => {
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
    expect(desc).toContain('CD：12秒');
    expect(desc).toContain('持続：6秒');
    expect(desc).toContain('硬直6秒');
    expect(desc).toContain('DEF×1.5');
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
    expect(desc).toContain('至近物理ATK×1.1');
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
    expect(desc).toContain('条件：敵数≥2');
    expect(desc).not.toContain('smart:');
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
      id: 'df_duelist_passive_counter_sample',
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
      '効果：被攻撃時 33% で反撃 / 物理ATK / 射程+0 / 対象遠隔',
    );
  });

  it('formats at_ranger_passive_3 ranged special effect', () => {
    const def: PassiveSkillDef = {
      id: 'at_ranger_passive_3',
      name: '遠隔狩り',
      effect: 'specialEffect',
      specialEffectApplyTo: 'damage',
      specialEffect: {
        scale: 1.2,
        conditions: [{ kind: 'attackType', ranged: true }],
      },
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toContain('特効');
    expect(desc).toContain('対象遠隔');
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

  it('formats no-charge time trigger without interval suffix', () => {
    const def: ActiveSkillDef = {
      id: 'df_duelist_active_4',
      name: '闘技場の掟',
      trigger: { kind: 'time', value: 0 },
      firePolicy: 'smart',
      fireConditions: [{ kind: 'finalWaveStart' }],
      stageTriggerLimit: 1,
      effect: [{ type: 'arenaDominance', target: { kind: 'self' }, durationSec: 15 }],
    };
    const desc = formatActiveDescription(def);
    expect(desc).toContain('チャージなし');
    expect(desc).not.toContain('0s毎');
    expect(desc).toContain('最終Wave開始');
  });

  it('formats df_guardian actives with new template', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_guardian_active_1;
    const a2 = gameData.skillRegistry.actives.df_guardian_active_2;
    const a3 = gameData.skillRegistry.actives.df_guardian_active_3;
    const a4 = gameData.skillRegistry.actives.df_guardian_active_4;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(a3).toBeDefined();
    expect(a4).toBeDefined();

    expect(formatActiveDescription(a1!)).toBe(
      'CD：8秒 / 持続：5秒 / DEF×1.2 /',
    );
    expect(formatActiveDescription(a2!)).toBe(
      'CD：被撃8 / 持続：5秒 / 硬直5秒・移動停止 / DEF×1.25、ブロック率+50% /',
    );
    expect(formatActiveDescription(a3!)).toBe(
      'CD：12秒 / 持続：5秒 / 条件：自HP≤80% / 被ダメ×0.75 /',
    );
    expect(formatActiveDescription(a4!)).toContain('CD：被撃12');
    expect(formatActiveDescription(a4!)).toContain('持続：2+防壁スタック数秒');
    expect(formatActiveDescription(a4!)).toContain('硬直2+防壁スタック数秒・移動停止');
    expect(formatActiveDescription(a4!)).toContain('条件：防壁≥1');
    expect(formatActiveDescription(a4!)).toContain('城塞の構え');
  });

  it('formats df_guardian passives with 効果 prefix', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.df_guardian_passive_1;
    const p2 = gameData.skillRegistry.passives.df_guardian_passive_2;
    const p3 = gameData.skillRegistry.passives.df_guardian_passive_3;
    const p4 = gameData.skillRegistry.passives.df_guardian_passive_4;

    expect(formatPassiveDescription(p1!)).toBe('効果：ブロック率+20%');
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：被ダメ・ブロック成功でヘイト上昇、ヘイト減衰速度低下',
    );
    expect(formatPassiveDescription(p3!)).toContain('効果：ブロック率+10%');
    expect(formatPassiveDescription(p3!)).toContain('8秒ごとに1スタック消失');
    expect(formatPassiveDescription(p4!)).toBe(
      '効果：HPが0以下になるダメージを受けた際、3秒無敵（Wave 1回まで）',
    );
  });

  it('formats df_paladin actives with new template', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_paladin_active_1;
    const a2 = gameData.skillRegistry.actives.df_paladin_active_2;
    const a3 = gameData.skillRegistry.actives.df_paladin_active_3;
    const a4 = gameData.skillRegistry.actives.df_paladin_active_4;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(a3).toBeDefined();
    expect(a4).toBeDefined();

    expect(formatActiveDescription(a1!)).toBe(
      'CD：5秒 / 至近魔法ATK、最低HP味方ATK×1.25回復 /',
    );
    expect(formatActiveDescription(a2!)).toBe(
      'CD：被撃8 / 持続：5秒 / 条件：自HP≤80% / 自身起点±50px：REG+10、被ダメ×0.95、ATK×0.2（加算） /',
    );
    expect(formatActiveDescription(a3!)).toBe(
      'CD：12秒 / 持続：5秒 / 条件：対象HP≤80% / 味方全体被ダメ×0.9、REG+20 /',
    );
    expect(formatActiveDescription(a4!)).toBe(
      'CD：15秒 / 持続：5秒 / 条件：対象HP≤70% / 通常攻撃→魔法DEF×1.2、最低HP味方DEF回復 /',
    );
  });

  it('formatSkillCardLines splits df_guardian actives by effect', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_guardian_active_1;
    const a2 = gameData.skillRegistry.actives.df_guardian_active_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();

    const card1 = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(card1.metaLine).toBe('CD：8秒 / 持続：5秒');
    expect(card1.effectLines).toEqual(['DEF×1.2']);
    expect(card1.effectLines.length).toBe(1);

    const card2 = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(card2.metaLine).toBe('CD：被撃8 / 持続：5秒 / 硬直5秒・移動停止');
    expect(card2.effectLines.length).toBe(2);
    expect(card2.effectLines[0]).toContain('DEF×1.25');
    expect(card2.effectLines[1]).toContain('ブロック率+50%');
  });

  it('formatSkillCardLines keeps blockResonance passive as one effect line', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p3 = gameData.skillRegistry.passives.df_guardian_passive_3;
    expect(p3).toBeDefined();

    const card = formatSkillCardLines(p3!, { locale: 'ja' });
    expect(card.effectLines.length).toBe(1);
    expect(card.effectLines[0]).toContain('ブロック率+10%');
    expect(card.effectLines[0]).toContain('8秒ごとに1スタック消失');
    expect(card.effectLines[0]).not.toMatch(/^効果：/);
    expect(formatPassiveDescription(p3!)).toBe(`効果：${card.effectLines[0]}`);
  });

  it('formatSkillCardLines requires locale ja', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_guardian_active_1;
    expect(() =>
      formatSkillCardLines(a1!, { locale: 'en' as 'ja' }),
    ).toThrow(/Unsupported skill card locale/);
  });

  it('formats df_paladin passives with 効果 prefix', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.df_paladin_passive_1;
    const p2 = gameData.skillRegistry.passives.df_paladin_passive_2;
    const p3 = gameData.skillRegistry.passives.df_paladin_passive_3;
    const p4 = gameData.skillRegistry.passives.df_paladin_passive_4;

    expect(formatPassiveDescription(p1!)).toBe('効果：前列ブロック率+10%');
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：前列ヘイト下限72%、前列ヘイト減衰速度低下',
    );
    expect(formatPassiveDescription(p3!)).toBe(
      '効果：前列ブロック率+5%、魔法ブロック',
    );
    expect(formatPassiveDescription(p4!)).toBe(
      '効果：HPが0以下になるダメージを受けた際、HP50%復活（Wave 1回まで）、自己被ダメ×0.5、前列被ダメ×0.75、5秒',
    );
  });
});
