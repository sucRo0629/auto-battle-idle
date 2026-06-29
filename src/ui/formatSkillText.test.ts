import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, PassiveSkillDef } from '../battle/types.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
  formatSkillCardLines,
  type SkillCardLines,
} from './formatSkillText.ts';

/** 4b polish 済み M1 クラス — Lv10 / Lv20 スキル suffix */
const POLISHED_CLASS_LV10_PLUS: Record<string, readonly string[]> = {
  df_guardian: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  df_paladin: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_swordsman: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  sp_cleric: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_ranger: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_assassin: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_sorcerer: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  sp_wardweaver: ['active_3', 'active_4', 'passive_3', 'passive_4'],
};

function assertNoLegacy4bLabels(text: string): void {
  expect(text).not.toContain('CD：');
  expect(text).not.toMatch(/(?:^| \/ )条件：/);
  expect(text).not.toMatch(/被撃\d/);
  expect(text).not.toContain('前列');
}

function assertGlobal4bActiveRules(desc: string, card: SkillCardLines): void {
  assertNoLegacy4bLabels(desc);
  assertNoLegacy4bLabels(card.metaLine);
  for (const line of card.effectLines) {
    assertNoLegacy4bLabels(line);
  }
  expect(desc).toContain('再使用：');
}

function assertGlobal4bPassiveRules(desc: string, card: SkillCardLines): void {
  assertNoLegacy4bLabels(desc);
  assertNoLegacy4bLabels(card.metaLine);
  for (const line of card.effectLines) {
    assertNoLegacy4bLabels(line);
  }
  expect(desc).toMatch(/^効果：/);
}

type Lv10PlusSkillContext = { desc: string; card: SkillCardLines };

const LV10_PLUS_SKILL_ASSERTIONS: Record<
  string,
  Partial<Record<string, (ctx: Lv10PlusSkillContext) => void>>
> = {
  df_guardian: {
    active_3: ({ desc }) => {
      expect(desc).toContain('発動条件：');
      expect(desc).toContain('ダメージ軽減25%');
    },
    active_4: ({ desc, card }) => {
      expect(desc).toContain('被攻撃12回');
      expect(desc).toContain('硬直・移動停止');
      expect(card.metaLine).toContain('被攻撃12回');
    },
    passive_4: ({ desc }) => {
      expect(desc).toContain('3秒無敵');
    },
  },
  df_paladin: {
    passive_3: ({ desc }) => expect(desc).toContain('周囲のブロック率'),
    passive_4: ({ desc }) => expect(desc).toContain('周囲ダメージ軽減'),
    active_4: ({ card }) =>
      expect(card.effectLines).toContain('1回チャージ可能'),
  },
  at_swordsman: {
    active_3: ({ desc }) => {
      expect(desc).toContain('通常攻撃7回');
      expect(desc).toContain('攻撃力の150%の物理ダメージを与える');
    },
    active_4: ({ desc }) => expect(desc).toContain('通常攻撃14回'),
    passive_4: ({ desc }) =>
      expect(desc).toContain('無視防御力50% 追加ダメ'),
  },
  sp_cleric: {
    active_3: ({ desc, card }) => {
      expect(desc).toContain('発動条件：');
      expect(desc).toContain('味方全体のHPを攻撃力の105%で回復');
      expect(card.effectLines).toEqual([
        '味方全体のHPを攻撃力の105%で回復',
        '1回チャージ可能',
      ]);
    },
    active_4: ({ card }) =>
      expect(card.effectLines).toContain('1回チャージ可能'),
  },
  at_ranger: {
    active_3: ({ card }) =>
      expect(card.effectLines).toEqual(['攻撃速度+25%']),
    active_4: ({ desc }) => expect(desc).toContain('通常攻撃11回'),
  },
};

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
      fragments: ['最も攻撃力が高い敵を優先して攻撃する'],
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
      fragments: ['自HP比例', '攻撃力', '50%', '60%以下'],
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
      fragments: ['回避+18%'],
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
      id: 'at_swordsman_active_2',
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
    expect(desc).toContain('再使用：11秒');
    expect(desc).toContain('攻撃力の90%の物理ダメージを与える');
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
    expect(desc).toContain('再使用：9秒');
    expect(desc).toContain('アンカー +32px');
    expect(desc).toContain('敵3体に対して攻撃力の70%の物理ダメージを与える');
    expect(desc).toContain('対象が不足している場合、同じ対象を再度攻撃する');
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
    expect(desc).toContain('再使用：被攻撃10回');
    expect(desc).toContain('(防御力+10)+80%');
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
      targetSkillId: 'at_swordsman_active_1',
      amount: { kind: 'atkBased', atkScale: 2.5 },
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toContain('at_swordsman_active_1');
    expect(desc).toContain('攻撃力250%');
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
    expect(desc).toContain('再使用：12秒');
    expect(desc).toContain('持続：6秒');
    expect(desc).toContain('硬直6秒');
    expect(desc).toContain('防御力+50%');
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
    expect(desc).toContain('攻撃力の110%の物理ダメージを与える');
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
    expect(desc).toContain('発動条件：敵数≥2');
    expect(desc).not.toContain('smart:');
  });

  it('formats skillPropertyOverride passive', () => {
    const def: PassiveSkillDef = {
      id: 'passive_charge_bonus',
      name: 'チャージ強化',
      effect: 'skillPropertyOverride',
      maxChargesBonus: 1,
      skillPropertyTargetSkillIds: ['at_swordsman_active_1'],
    };
    const desc = formatPassiveDescription(def);
    expect(desc).toContain('maxCharges +1');
    expect(desc).toContain('at_swordsman_active_1');
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
      '効果：被攻撃時 33% で反撃 / 物理攻撃力 / 射程+0 / 対象遠隔',
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

  it('formats damageTaken stat as percent reduction/increase labels', () => {
    const reduction: ActiveSkillDef = {
      id: 'test_damage_taken_reduction',
      name: '軽減',
      trigger: { kind: 'time', value: 12 },
      effect: [
        {
          type: 'buff',
          buffSubKind: 'stat',
          buffStat: 'damageTaken',
          buffMultiplier: 0.75,
          buffDurationSec: 5,
        },
      ],
    };
    expect(formatActiveDescription(reduction)).toContain('ダメージ軽減25%');

    const increase: ActiveSkillDef = {
      id: 'test_damage_taken_increase',
      name: '増加',
      trigger: { kind: 'time', value: 12 },
      effect: [
        {
          type: 'debuff',
          debuffSubKind: 'stat',
          debuffStat: 'damageTaken',
          debuffMultiplier: 1.2,
          debuffDurationSec: 5,
        },
      ],
    };
    expect(formatActiveDescription(increase)).toContain('被ダメージ増加20%');
  });

  it('formats stat buffs with display names and percent labels', () => {
    const flatReg: ActiveSkillDef = {
      id: 'test_reg_flat',
      name: '耐性',
      trigger: { kind: 'time', value: 12 },
      effect: [
        {
          type: 'buff',
          buffSubKind: 'stat',
          buffStat: 'reg',
          buffFlatBonus: 20,
          buffDurationSec: 5,
        },
      ],
    };
    expect(formatActiveDescription(flatReg)).toContain('魔法耐性+20');

    const atkScaleBarrier: ActiveSkillDef = {
      id: 'test_atk_barrier',
      name: '壁',
      trigger: { kind: 'time', value: 8 },
      effect: [
        {
          type: 'buff',
          buffSubKind: 'barrier',
          barrierStack: true,
          amount: { kind: 'atkBased', atkScale: 0.2 },
        },
      ],
    };
    expect(formatActiveDescription(atkScaleBarrier)).toContain(
      '攻撃力の20%のバリア（加算）',
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
      '再使用：8秒 / 持続：5秒 / 防御力+20% /',
    );
    expect(formatActiveDescription(a2!)).toBe(
      '再使用：被攻撃8回 / 持続：5秒 / 硬直・移動停止5秒 / 防御力+25%、ブロック率+50% /',
    );
    expect(formatActiveDescription(a3!)).toBe(
      '再使用：12秒 / 持続：5秒 / 発動条件：自身のHPが80%以下 / ダメージ軽減25% /',
    );
    expect(formatActiveDescription(a4!)).toContain('再使用：被攻撃12回');
    expect(formatActiveDescription(a4!)).toContain('持続：2+防壁スタック数秒');
    expect(formatActiveDescription(a4!)).toContain('硬直・移動停止2+防壁スタック数秒');
    expect(formatActiveDescription(a4!)).toContain('発動条件：防壁≥1');
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
      '効果：自身のダメージ軽減8%',
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
      '再使用：5秒 / 攻撃力の100%の魔法ダメージを与える、味方のHPを攻撃力の125%で回復 /',
    );
    expect(formatActiveDescription(a2!)).toBe(
      '再使用：被攻撃8回 / 持続：5秒 / 発動条件：自身のHPが80%以下 / 自身起点±50px：魔法耐性+10、ダメージ軽減5%、攻撃力の20%のバリア（加算） /',
    );
    expect(formatActiveDescription(a3!)).toBe(
      '再使用：12秒 / 持続：5秒 / 発動条件：対象のHPが80%以下 / 味方全体ダメージ軽減10%、魔法耐性+20 /',
    );
    expect(formatActiveDescription(a4!)).toBe(
      '再使用：15秒 / 持続：5秒 / 発動条件：対象のHPが70%以下 / 通常攻撃→魔法防御力120%、最低HP味方防御力回復 /',
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
    expect(card1.metaLine).toBe('再使用：8秒 / 持続：5秒');
    expect(card1.effectLines).toEqual(['防御力+20%']);
    expect(card1.effectLines.length).toBe(1);

    const card2 = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(card2.metaLine).toBe('再使用：被攻撃8回 / 持続：5秒 / 硬直・移動停止5秒');
    expect(card2.effectLines.length).toBe(2);
    expect(card2.effectLines[0]).toContain('防御力+25%');
    expect(card2.effectLines[1]).toContain('ブロック率+50%');

    const p2 = gameData.skillRegistry.passives.df_guardian_passive_2;
    expect(p2).toBeDefined();
    const wallCard = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(wallCard.effectLines).toEqual(['自身のダメージ軽減8%']);
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

  it('formats at_swordsman Lv0 skills with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.at_swordsman_active_1;
    const a2 = gameData.skillRegistry.actives.at_swordsman_active_2;
    const p1 = gameData.skillRegistry.passives.at_swordsman_passive_1;
    const p2 = gameData.skillRegistry.passives.at_swordsman_passive_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(formatActiveDescription(a1!)).toBe(
      '再使用：通常攻撃5回 / 発動条件：対象のHPが50%以上 / 攻撃力の180%の物理ダメージを与える /',
    );

    const nagihara = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(nagihara.metaLine).toBe('再使用：10秒');
    expect(nagihara.effectLines).toEqual([
      '敵2体に対して攻撃力の60%の物理ダメージを与える',
      '対象が不足している場合、同じ対象を再度攻撃する',
    ]);

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：最も防御力が高い敵を優先して攻撃する',
    );
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：攻撃時、対象の防御力を25%無視する',
    );
  });

  it('formats sp_cleric Lv0 skills with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.sp_cleric_active_1;
    const p1 = gameData.skillRegistry.passives.sp_cleric_passive_1;
    const p2 = gameData.skillRegistry.passives.sp_cleric_passive_2;
    expect(a1).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(formatActiveDescription(a1!)).toBe(
      '再使用：8秒 / 味方のHPを攻撃力の175%で回復 /',
    );

    const card = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(card.metaLine).toBe('再使用：8秒');
    expect(card.effectLines).toEqual(['味方のHPを攻撃力の175%で回復']);

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：HPが50%以下の味方を回復時、HP回復効果+25%',
    );
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：味方を回復時、最大HPを超えた回復量の80%をバリアとして対象に付与する',
    );
  });

  it('formats sp_wardweaver Lv0 passives with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.sp_wardweaver_passive_1;
    const p2 = gameData.skillRegistry.passives.sp_wardweaver_passive_2;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：HPが50%以下の味方にバリア付与時、バリア量+20%',
    );
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：味方に付与したバリアが完全に消失した時、対象を攻撃力の65%で回復（味方ごとにWave1回まで）、この効果は「障壁」の消失では誘発しない',
    );

    const card1 = formatSkillCardLines(p1!, { locale: 'ja' });
    expect(card1.metaLine).toBe('常時');
    expect(card1.effectLines).toEqual([
      'HPが50%以下の味方にバリア付与時、バリア量+20%',
    ]);

    const card2 = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(card2.metaLine).toBe('常時');
    expect(card2.effectLines).toEqual([
      '味方に付与したバリアが完全に消失した時、対象を攻撃力の65%で回復（味方ごとにWave1回まで）',
      'この効果は「障壁」の消失では誘発しない',
    ]);
  });

  it('formats at_ranger Lv0 skills with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.at_ranger_active_1;
    const a2 = gameData.skillRegistry.actives.at_ranger_active_2;
    const p1 = gameData.skillRegistry.passives.at_ranger_passive_1;
    const p2 = gameData.skillRegistry.passives.at_ranger_passive_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(formatActiveDescription(a1!)).toBe(
      '再使用：通常攻撃5回 / 2回連続で攻撃力の125%の物理ダメージを与える /',
    );

    const rensha = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(rensha.metaLine).toBe('再使用：通常攻撃5回');
    expect(rensha.effectLines).toEqual([
      '2回連続で攻撃力の125%の物理ダメージを与える',
    ]);

    expect(formatActiveDescription(a2!)).toBe(
      '再使用：10秒 / 持続：5秒 / 通常攻撃が2回連続攻撃になる /',
    );

    const card = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(card.metaLine).toBe('再使用：10秒 / 持続：5秒');
    expect(card.effectLines).toEqual(['通常攻撃が2回連続攻撃になる']);

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：遠隔攻撃の敵を優先して攻撃する',
    );
    expect(formatPassiveDescription(p2!)).toBe('効果：攻撃速度+25%');
  });

  it('formats at_assassin Lv0 skills with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.at_assassin_active_1;
    const a2 = gameData.skillRegistry.actives.at_assassin_active_2;
    const p1 = gameData.skillRegistry.passives.at_assassin_passive_1;
    const p2 = gameData.skillRegistry.passives.at_assassin_passive_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const hikisaki = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(hikisaki.metaLine).toBe('再使用：通常攻撃8回 / 持続：5秒');
    expect(hikisaki.effectLines).toEqual([
      '攻撃力の115%の物理ダメージを与える',
      '対象に出血が付与されているなら、このダメージは+130%される',
      'その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを与える出血を付与する',
    ]);

    const kageNoHa = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(kageNoHa.metaLine).toBe(
      '再使用：通常攻撃14回 / 持続：1.5秒 / 硬直2秒',
    );
    expect(kageNoHa.effectLines).toEqual([
      '1.5秒間回避+100%',
      '対象の背後に移動した後、攻撃力の110%の物理ダメージを与える',
      '対象のHPが30%以下なら、このダメージは+200%される',
    ]);

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：最もHP割合が低い敵を優先して攻撃する',
    );
    expect(formatPassiveDescription(p2!)).toBe('効果：回避+20%');

    const passive2Card = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(passive2Card.metaLine).toBe('常時');
    expect(passive2Card.effectLines).toEqual(['回避+20%']);
  });

  it('formats at_sorcerer Lv0 passives with 4b polish', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.at_sorcerer_passive_1;
    const p2 = gameData.skillRegistry.passives.at_sorcerer_passive_2;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    expect(formatPassiveDescription(p1!)).toBe(
      '効果：攻撃時、対象の魔法耐性を20%無視する',
    );
    expect(formatPassiveDescription(p2!)).toBe(
      '効果：敵に攻撃スキルが1回命中するごとに「種火」を1スタックする',
    );

    const card1 = formatSkillCardLines(p1!, { locale: 'ja' });
    expect(card1.metaLine).toBe('常時');
    expect(card1.effectLines).toEqual([
      '攻撃時、対象の魔法耐性を20%無視する',
    ]);

    const card2 = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(card2.metaLine).toBe('常時');
    expect(card2.effectLines).toEqual([
      '敵に攻撃スキルが1回命中するごとに「種火」を1スタックする',
    ]);
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

    expect(formatPassiveDescription(p1!)).toBe('効果：周囲のブロック率+10%');
    expect(formatPassiveDescription(p2!)).toBe('効果：周囲のダメージ軽減10%');
    expect(formatPassiveDescription(p3!)).toBe(
      '効果：周囲のブロック率+5%、魔法ブロックを可能にする',
    );
    expect(formatPassiveDescription(p4!)).toBe(
      '効果：HPが0以下になるダメージを受けた際、HP50%復活（Wave 1回まで）、自己ダメージ軽減50%、周囲ダメージ軽減25%、5秒',
    );
  });

  it('formatSkillCardLines formats df_paladin Lv0 skills with polished lines', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_paladin_active_1;
    const a2 = gameData.skillRegistry.actives.df_paladin_active_2;
    const p1 = gameData.skillRegistry.passives.df_paladin_passive_1;
    const p2 = gameData.skillRegistry.passives.df_paladin_passive_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const card1 = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(card1.metaLine).toBe('再使用：5秒');
    expect(card1.effectLines).toEqual([
      '攻撃力の100%の魔法ダメージを与える',
      '味方のHPを攻撃力の125%で回復',
      '1回チャージ可能',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(card2.metaLine).toBe(
      '再使用：被攻撃8回 / 持続：5秒 / 発動条件：自身のHPが80%以下',
    );
    expect(card2.effectLines).toEqual([
      '周囲に以下の効果を付与する',
      '魔法耐性+10',
      'ダメージ軽減5%',
      '攻撃力の20%のバリア（加算）',
    ]);

    const passive1 = formatSkillCardLines(p1!, { locale: 'ja' });
    expect(passive1.metaLine).toBe('常時');
    expect(passive1.effectLines).toEqual(['周囲のブロック率+10%']);

    const passive2 = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(passive2.metaLine).toBe('常時');
    expect(passive2.effectLines).toEqual(['周囲のダメージ軽減10%']);
  });

  it.each(Object.entries(POLISHED_CLASS_LV10_PLUS))(
    'applies global 4b template rules to %s Lv10+ skills',
    async (classId, skillSuffixes) => {
      const { loadGameData } = await import('../battle/data/loadGameData.ts');
      const gameData = await loadGameData();
      const classAssertions = LV10_PLUS_SKILL_ASSERTIONS[classId] ?? {};

      for (const suffix of skillSuffixes) {
        const skillId = `${classId}_${suffix}`;
        const isActive = suffix.startsWith('active');
        const def = isActive
          ? gameData.skillRegistry.actives[skillId]
          : gameData.skillRegistry.passives[skillId];
        expect(def, skillId).toBeDefined();

        const desc = isActive
          ? formatActiveDescription(def as ActiveSkillDef)
          : formatPassiveDescription(def as PassiveSkillDef);
        const card = formatSkillCardLines(def!, { locale: 'ja' });

        if (isActive) {
          assertGlobal4bActiveRules(desc, card);
        } else {
          assertGlobal4bPassiveRules(desc, card);
        }

        classAssertions[suffix]?.({ desc, card });
      }
    },
  );
});
