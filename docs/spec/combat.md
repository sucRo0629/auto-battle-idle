# 戦闘

実装：`src/battle/combatMath.ts`, `SkillExecutor.ts`

## 物理ダメージ

1. `baseDamage = floor(effectiveAtk × skill.powerMultiplier × passiveDamageMul)`
2. `effectiveDef = def × defBuffMul`（ステータス効果から）
3. `afterSubtract = baseDamage - effectiveDef`
4. `afterSubtract <= 0` なら `afterDefense = 0`、  
   それ以外は `afterDefense = floor(afterSubtract × 100 / (100 + effectiveDef))`
5. `final = max(1, floor(afterDefense × damageTakenMul))`

`effectiveAtk = atk × atkBuffMul`  
`damageTakenMul` = ステータス効果 × パッシブ `damageTakenMultiplier`（例：Thick Skin, Iron Guard）

## 魔法ダメージ

1. 上記と同じ `baseDamage`
2. `effectiveReg = reg`（固定。REG への buff/debuff なし）
3. `afterDefense = floor(baseDamage × 100 / (100 + effectiveReg))`
4. `final = max(1, floor(afterDefense × damageTakenMul))`

Phase 1 デモは物理のみ。全クラス `reg: 0`。

## 回復

`heal = floor((effectiveAtk + passiveHealBonus) × skill.powerMultiplier)`

## クールダウン

| 枠 | 進行ルール |
|----|------------|
| **basic** | `remaining -= deltaTime`（固定。AGI は Phase 4） |
| **active** | `remaining -= deltaTime × ∏ passive.activeCooldownRate` |

枠が 0 になると `SkillExecutor` が1回発動し、`skill.interval` にリセット。

1 tick あたりの実行順（1ユニット）：basic → active 枠0 → active 枠1（Phase 1〜2 では枠1未使用）

## ステータス効果

対象ステ：`atk`, `def`, `damageTaken`。REG は buff 不可。

| 種別 | 定義方法 |
|------|----------|
| buff | `effect: "buff"` + `buffStat` / `buffMultiplier` / `buffDurationSec` |
| debuff | `effect: "debuff"` + `debuffStat` / `debuffMultiplier` / `debuffDurationSec` |

**重複（同一対象・同一 stat）：**

- `multiplier` — 乗算
- `remainingSec` — **長い方**を採用（短い効果は上書き）

毎 tick：`remainingSec -= deltaTime`、0 以下で除去。

## ターゲット解決

1. パッシブを集約 → `targetRuleOverride` を適用（配列の後ろが優先）
2. `pickTarget(rule, actor, allies, enemies)` — [classes-and-skills.md](classes-and-skills.md) 参照

## 戦闘フロー（Phase 1）

1. 味方は右→左へ進軍、敵は左から出現
2. 前衛同士が射程内 → **接敵（Engaged）** → CD とスキルが進行
3. 毎 tick：味方行動 → 敵行動
4. 敵全滅 → **Victory**；味方全滅 → **Defeat**
5. 3秒後：HP全回復、同一ステージ再スポーン、`Running` 再開

死亡ユニットはターゲット対象外。次の再スポーンまで death アニメ。

## 演出（render 層）

| イベント | VFX |
|----------|-----|
| ダメージ | attack / hurt アニメ、ダメージポップアップ、近接/遠隔エフェクト |
| 回復 | heal アニメ、緑ポップアップ、回復弾エフェクト |
| buff / debuff | 対象の白い光（約0.8秒） |

ロジックは `BattleEvent` を発火；`BattleView` が `BattleCanvas` を駆動。`render/` に戦闘ルールは置かない。
