import { describe, expect, it } from 'vitest';
import type { ActiveSkillDef, PassiveSkillDef } from '../battle/types.ts';
import {
  formatActiveDescription,
  formatPassiveDescription,
  flattenSkillCardEffectLines,
  formatSkillCardLines,
  type SkillCardLines,
} from './formatSkillText.ts';

/** 4b polish 済み M1 クラス — Lv10 / Lv20 スキル suffix。R12l 4兵科は旧 active 削除済み。 */
const POLISHED_CLASS_LV10_PLUS: Record<string, readonly string[]> = {
  df_guardian: ['passive_4'],
  df_paladin: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_swordsman: ['passive_3', 'passive_4'],
  sp_cleric: ['passive_3', 'passive_4'],
  at_ranger: ['active_3', 'active_4', 'passive_3', 'passive_4'],
  at_assassin: ['active_3', 'active_4', 'passive_3', 'passive_4'],
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
  for (const line of flattenSkillCardEffectLines(card.effectLines)) {
    assertNoLegacy4bLabels(line);
  }
  expect(desc).toContain('再使用：');
}

function assertGlobal4bPassiveRules(desc: string, card: SkillCardLines): void {
  assertNoLegacy4bLabels(desc);
  assertNoLegacy4bLabels(card.metaLine);
  for (const line of flattenSkillCardEffectLines(card.effectLines)) {
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
    passive_4: ({ desc }) => {
      expect(desc).toContain('3秒無敵');
    },
  },
  df_paladin: {
    passive_3: ({ desc }) => expect(desc).toContain('周囲 5 / 味方のブロック率'),
    passive_4: ({ desc }) => expect(desc).toContain('周囲ダメージ軽減'),
    active_4: ({ card }) =>
      expect(card.effectLines).toContain('チャージ可能 1'),
  },
  at_swordsman: {
    passive_4: ({ desc }) =>
      expect(desc).toContain('無視防御力50% 追加ダメ'),
  },
  sp_cleric: {},
  at_ranger: {
    active_3: ({ card }) =>
      expect(card.effectLines).toEqual(['攻撃力+20%', '攻撃速度+50%']),
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
      name: 'target rule override maxHp',
      def: {
        id: 'at_ballista_passive_1',
        name: '城落としの弩',
        effect: 'targetRuleOverride',
        targetRuleOverride: {
          kind: 'stat',
          side: 'enemy',
          stat: 'maxHp',
          order: 'highest',
        },
      } satisfies PassiveSkillDef,
      fragments: ['最も最大HPが高い敵を優先して攻撃する'],
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
    expect(desc).toContain('攻撃力の90%の物理ダメージ');
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
    expect(desc).toContain('アンカー +3.2');
    expect(desc).toContain('マルチロック 3 / 攻撃力の70%の物理ダメージ');
    expect(desc).not.toContain('対象不足分は同一対象へ再命中');
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
    expect(desc).toContain('硬直：6秒');
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
    expect(desc).toContain('攻撃力の110%の物理ダメージ');
  });

  it('formats non-single target frames in skill card lines', () => {
    const def: ActiveSkillDef = {
      id: 'at_lancer_active_1',
      name: '号令',
      trigger: { kind: 'time', value: 10 },
      effect: [
        {
          targetShape: 'pierce',
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        },
        {
          targetShape: 'aoe',
          aoeRadiusPx: 50,
          type: 'buff',
          buffSubKind: 'stat',
          buffStat: 'atk',
          buffMultiplier: 1.15,
          buffDurationSec: 4,
          target: { kind: 'distance', side: 'ally', order: 'selfOrigin' },
        },
      ],
    };

    const card = formatSkillCardLines(def, {
      locale: 'ja',
      basicAttackRangePx: 100,
    });

    expect(card.effectLines).toEqual([
      '貫通 10 / 攻撃力の50%の物理ダメージ',
      '周囲 5 / 味方の攻撃力+15%',
    ]);
  });

  it('formats pierce absolute range when same as basic attack range', () => {
    const def: ActiveSkillDef = {
      id: 'pierce_range_same',
      name: '同射程',
      trigger: { kind: 'time', value: 10 },
      effect: [
        {
          targetShape: 'pierce',
          range: 100,
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        },
      ],
    };

    const card = formatSkillCardLines(def, {
      locale: 'ja',
      basicAttackRangePx: 100,
    });

    expect(card.effectLines).toEqual([
      '貫通 10 / 攻撃力の50%の物理ダメージ',
    ]);
  });

  it('formats pierce absolute range when it differs from basic attack range', () => {
    const def: ActiveSkillDef = {
      id: 'pierce_range_delta',
      name: '射程拡張',
      trigger: { kind: 'time', value: 10 },
      effect: [
        {
          targetShape: 'pierce',
          range: 130,
          type: 'damage',
          damageType: 'physical',
          amount: { kind: 'atkBased', atkScale: 0.5 },
          target: { kind: 'distance', side: 'enemy', order: 'selfOrigin' },
        },
      ],
    };

    const card = formatSkillCardLines(def, {
      locale: 'ja',
      basicAttackRangePx: 100,
    });

    expect(card.effectLines).toEqual([
      '貫通 13 / 攻撃力の50%の物理ダメージ',
    ]);
  });

  it('groups consecutive inherited pierce effects in skill card lines', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const def = gameData.skillRegistry.actives.at_lancer_active_2;
    expect(def).toBeDefined();

    const card = formatSkillCardLines(def!, { locale: 'ja' });

    expect(card.effectLines[0]).toBe('貫通 / 敵に以下の効果を適用');
    expect(card.effectLines.filter((line) => line.includes('貫通'))).toHaveLength(1);
    expect(card.effectLines[1]).toContain('スタン 2秒');
    expect(card.effectLines[1]).toContain('攻撃力の20%の物理ダメージ');
  });

  it('formats lancer AoE and pierce target frames with side labels', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const passive1 = gameData.skillRegistry.passives.at_lancer_passive_1;
    const passive2 = gameData.skillRegistry.passives.at_lancer_passive_2;
    const active3 = gameData.skillRegistry.actives.at_lancer_active_3;
    expect(passive1).toBeDefined();
    expect(passive2).toBeDefined();
    expect(active3).toBeDefined();

    expect(formatSkillCardLines(passive1!, { locale: 'ja' }).effectLines).toEqual([
      '貫通 / 敵の攻撃力-5%',
    ]);
    expect(formatSkillCardLines(passive2!, { locale: 'ja' }).effectLines).toEqual([
      '周囲 5 / 味方の攻撃力+5%',
    ]);
    expect(formatSkillCardLines(active3!, { locale: 'ja' }).effectLines).toEqual([
      '周囲 5 / 味方に以下の効果を付与',
      '攻撃力+20%、攻撃速度+15%',
    ]);
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
      '効果：被攻撃時 33% で反撃 / 攻撃力の100%の物理ダメージ / 射程+0 / 対象遠隔',
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
          buffStat: 'res',
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


  it('formats df_guardian remaining passives with 効果 prefix', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.df_guardian_passive_1;
    const p2 = gameData.skillRegistry.passives.df_guardian_passive_2;
    const p4 = gameData.skillRegistry.passives.df_guardian_passive_4;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(p4).toBeDefined();
    expect(gameData.skillRegistry.passives.df_guardian_passive_3).toBeUndefined();

    expect(formatPassiveDescription(p1!)).toContain('効果：');
    expect(formatPassiveDescription(p2!)).toContain('効果：');
    expect(formatPassiveDescription(p4!)).toContain('効果：');
    expect(formatPassiveDescription(p4!)).toContain('無敵');
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
      '再使用：5秒 / 攻撃力の100%の魔法ダメージ、味方のHPを攻撃力の125%で回復 /',
    );
    expect(formatActiveDescription(a2!)).toBe(
      '再使用：被攻撃8回 / 持続：5秒 / 発動条件：自身のHPが80%以下 / 周囲 5 / 味方に以下の効果を付与、魔法耐性+10、ダメージ軽減5%、攻撃力の20%のバリア（加算） /',
    );
    expect(formatActiveDescription(a3!)).toBe(
      '再使用：12秒 / 持続：5秒 / 発動条件：対象のHPが80%以下 / 味方全体 ダメージ軽減10%、魔法耐性+20 /',
    );
    expect(formatActiveDescription(a4!)).toBe(
      '再使用：15秒 / 持続：5秒 / 発動条件：対象のHPが70%以下 / 通常攻撃→魔法防御力120%、最低HP味方防御力回復 /',
    );
  });



  it('formats at_swordsman remaining passives (R12l: no Lv actives)', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.at_swordsman_passive_1;
    const p2 = gameData.skillRegistry.passives.at_swordsman_passive_2;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(gameData.skillRegistry.actives.at_swordsman_active_1).toBeUndefined();

    expect(formatPassiveDescription(p1!)).toContain('効果：');
    expect(formatPassiveDescription(p2!)).toContain('効果：');
  });

  it('formats sp_cleric remaining passives (R12l: no Lv actives)', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.sp_cleric_passive_1;
    const p2 = gameData.skillRegistry.passives.sp_cleric_passive_2;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    expect(gameData.skillRegistry.actives.sp_cleric_active_1).toBeUndefined();

    expect(formatPassiveDescription(p1!)).toContain('効果：');
    expect(formatPassiveDescription(p2!)).toContain('効果：');
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
      '効果：味方に付与したバリアが完全に消失した時、対象を攻撃力の65%で回復（味方ごとにWave1回まで）',
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
      '再使用：通常攻撃5回 / 2回連続で攻撃力の125%の物理ダメージ /',
    );

    const rensha = formatSkillCardLines(a1!, { locale: 'ja' });
    expect(rensha.metaLine).toBe('再使用：通常攻撃5回');
    expect(rensha.effectLines).toEqual([
      '2回連続で攻撃力の125%の物理ダメージ',
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
      '攻撃力の115%の物理ダメージ',
      '対象に出血が付与されているなら、このダメージは+130%される',
      'その後攻撃した対象に5秒間毎秒攻撃力の30%の物理ダメージを与える出血を付与する',
    ]);

    const kageNoHa = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(kageNoHa.metaLine).toBe(
      '再使用：通常攻撃14回 / 持続：1.5秒 / 硬直：2秒',
    );
    expect(kageNoHa.effectLines).toEqual([
      '1.5秒間回避+100%',
      '対象の背後に移動した後、攻撃力の110%の物理ダメージ',
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



  it('formatSkillCardLines applies common en templates for df_paladin Lv0', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.df_paladin_active_1;
    const a2 = gameData.skillRegistry.actives.df_paladin_active_2;
    const p1 = gameData.skillRegistry.passives.df_paladin_passive_1;
    const p2 = gameData.skillRegistry.passives.df_paladin_passive_2;

    const card1 = formatSkillCardLines(a1!, { locale: 'en' });
    expect(card1.metaLine).toBe('Recast: 5s');
    expect(card1.effectLines).toEqual([
      '100% ATK magic damage',
      'Heals an ally for 125% of ATK',
      'Charge available 1',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'en' });
    expect(card2.metaLine).toBe(
      'Recast: After 8 hits taken / Duration: 5s / Condition: Self HP ≤80%',
    );
    expect(card2.effectLines).toEqual([
      'Nearby 5 / Grants the following effects to allies',
      'RES+10, 5% Damage Reduction, Barrier equal to 20% of ATK (stacking)',
    ]);

    const passive1 = formatSkillCardLines(p1!, { locale: 'en' });
    expect(passive1.metaLine).toBe('Always');
    expect(passive1.effectLines).toEqual(['Nearby 5 / Allied Block rate+10%']);

    const passive2 = formatSkillCardLines(p2!, { locale: 'en' });
    expect(passive2.metaLine).toBe('Always');
    expect(passive2.effectLines).toEqual(['Nearby 5 / Allied 5% Damage Reduction']);
  });


  it('formatSkillCardLines applies common en templates for at_assassin Lv0', async () => {
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

    const card1 = formatSkillCardLines(a1!, { locale: 'en' });
    expect(card1.metaLine).toBe('Recast: After 8 basic attacks / Duration: 5s');
    expect(card1.effectLines).toEqual([
      '115% ATK physical damage',
      'If the target has Bleed, this damage is increased by +130%',
      'Then applies Bleed to the attacked target, dealing 30% ATK as physical damage every second for 5s',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'en' });
    expect(card2.metaLine).toBe(
      'Recast: After 14 basic attacks / Duration: 1.5s / Lockout: 2s',
    );
    expect(card2.effectLines).toEqual([
      '1.5s Evasion +100%',
      'After moving behind the target, 110% ATK physical damage',
      'If target HP ≤30%, this damage is increased by +200%',
    ]);

    const passive1 = formatSkillCardLines(p1!, { locale: 'en' });
    expect(passive1.metaLine).toBe('Always');
    expect(passive1.effectLines).toEqual([
      'Prioritizes the enemy with the lowest HP ratio',
    ]);

    const passive2 = formatSkillCardLines(p2!, { locale: 'en' });
    expect(passive2.metaLine).toBe('Always');
    expect(passive2.effectLines).toEqual(['Evasion +20%']);
  });

  it('formatSkillCardLines applies common en templates for at_ranger Lv0', async () => {
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

    const card1 = formatSkillCardLines(a1!, { locale: 'en' });
    expect(card1.metaLine).toBe('Recast: After 5 basic attacks');
    expect(card1.effectLines).toEqual([
      '2 hits: 125% ATK physical damage',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'en' });
    expect(card2.metaLine).toBe('Recast: 10s / Duration: 5s');
    expect(card2.effectLines).toEqual(['Basic attacks hit 2 times in a row']);

    const passive1 = formatSkillCardLines(p1!, { locale: 'en' });
    expect(passive1.metaLine).toBe('Always');
    expect(passive1.effectLines).toEqual(['Prioritizes ranged attackers']);

    const passive2 = formatSkillCardLines(p2!, { locale: 'en' });
    expect(passive2.metaLine).toBe('Always');
    expect(passive2.effectLines).toEqual(['Attack Speed+25%']);
  });



  it('formatSkillCardLines applies common en templates for sp_wardweaver Lv0', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const a1 = gameData.skillRegistry.actives.sp_wardweaver_active_1;
    const a2 = gameData.skillRegistry.actives.sp_wardweaver_active_2;
    const p1 = gameData.skillRegistry.passives.sp_wardweaver_passive_1;
    const p2 = gameData.skillRegistry.passives.sp_wardweaver_passive_2;
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const card1 = formatSkillCardLines(a1!, { locale: 'en' });
    expect(card1.metaLine).toBe('Recast: 8s');
    expect(card1.effectLines).toEqual([
      'Heals an ally for 35% of ATK',
      'Barrier equal to 190% of ATK',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'en' });
    expect(card2.metaLine).toBe('Recast: 10s / Condition: Target HP ≤80%');
    expect(card2.effectLines).toEqual([
      'Multi-Lock 2 / Barrier equal to 200% of ATK',
    ]);

    const passive1 = formatSkillCardLines(p1!, { locale: 'en' });
    expect(passive1.metaLine).toBe('Always');
    expect(passive1.effectLines).toEqual([
      'When granting Barrier to an ally at ≤50% HP, Barrier amount +20%',
    ]);

    const passive2 = formatSkillCardLines(p2!, { locale: 'en' });
    expect(passive2.metaLine).toBe('Always');
    expect(passive2.effectLines).toEqual([
      'When a Barrier you granted fully depletes, heals the target for 65% of ATK (once per ally per wave)',
    ]);
  });

  it('formats df_paladin passives with 効果 prefix', async () => {
    const { loadGameData } = await import('../battle/data/loadGameData.ts');
    const gameData = await loadGameData();
    const p1 = gameData.skillRegistry.passives.df_paladin_passive_1;
    const p2 = gameData.skillRegistry.passives.df_paladin_passive_2;
    const p3 = gameData.skillRegistry.passives.df_paladin_passive_3;
    const p4 = gameData.skillRegistry.passives.df_paladin_passive_4;

    expect(formatPassiveDescription(p1!)).toBe('効果：周囲 5 / 味方のブロック率+10%');
    expect(formatPassiveDescription(p2!)).toBe('効果：周囲 5 / 味方のダメージ軽減5%');
    expect(formatPassiveDescription(p3!)).toBe(
      '効果：周囲 5 / 味方のブロック率+5%、魔法ブロックを可能にする',
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
      '攻撃力の100%の魔法ダメージ',
      '味方のHPを攻撃力の125%で回復',
      'チャージ可能 1',
    ]);

    const card2 = formatSkillCardLines(a2!, { locale: 'ja' });
    expect(card2.metaLine).toBe(
      '再使用：被攻撃8回 / 持続：5秒 / 発動条件：自身のHPが80%以下',
    );
    expect(card2.effectLines).toEqual([
      '周囲 5 / 味方に以下の効果を付与',
      '魔法耐性+10、ダメージ軽減5%、攻撃力の20%のバリア（加算）',
    ]);

    const passive1 = formatSkillCardLines(p1!, { locale: 'ja' });
    expect(passive1.metaLine).toBe('常時');
    expect(passive1.effectLines).toEqual(['周囲 5 / 味方のブロック率+10%']);

    const passive2 = formatSkillCardLines(p2!, { locale: 'ja' });
    expect(passive2.metaLine).toBe('常時');
    expect(passive2.effectLines).toEqual(['周囲 5 / 味方のダメージ軽減5%']);
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
