# 戦闘

実装：`src/battle/combatMath.ts`, `SkillExecutor.ts`

## 物理ダメージ

1. `baseDamage = floor(resolvePowerAmount(amount) × passiveDamageMul)`（`atkBased`: `(effectiveAtk + atkOffset) × atkScale`）
2. `effectiveDef = def × defBuffMul`（ステータス効果から）
3. `afterSubtract = baseDamage - effectiveDef`
4. `afterSubtract <= 0` なら `afterDefense = 0`、  
   それ以外は `afterDefense = floor(afterSubtract × 100 / (100 + effectiveDef))`
5. `final = max(1, floor(afterDefense × damageTakenMul))`

`effectiveAtk = max(0, (atk + atkFlatSum) × atkMulProduct)`  
`effectiveDef = max(0, (def + defFlatSum) × defMulProduct)`  
`damageTakenMul = max(0, (1 + damageTakenFlatSum) × damageTakenMulProduct)` × パッシブ `damageTakenMultiplier`

固定値（flat）: 同一 stat 内で buff は `+flatBonus`、debuff は `-flatBonus` を代数和。  
係数（multiplier）: 同一 stat 内で乗算。

**ダメージ乱数:** 最終ダメージ・回復量に乱数ブレは設けない（完全決定）。

## 魔法ダメージ

1. 上記と同じ `baseDamage`
2. `effectiveReg = reg`（固定。REG への buff/debuff なし）
3. `afterDefense = floor(baseDamage × 100 / (100 + effectiveReg))`
4. `final = max(1, floor(afterDefense × damageTakenMul))`

一次職マスタ（`at_sorcerer` / `at_enchanter` / `at_geomancer` 等）は `damageType: "magic"` を使用。敵の `reg` が 0 のときも上式で最低 1 ダメージ。

## 攻撃速度と基本攻撃

- クラス `attackSpeedTier`（5 段階 enum）→ `attackSpeedPresets.basicCooldownRate`
- **アクティブ枠**の CD 加速には **適用しない**（`activeCooldownRate` のみ）
- 戦闘中の tier 変更（スキル由来）は **未実装** — 実装後は [stats.md](stats.md) の SPD 節を参照

## 回復

**原則:** 回復後の HP は `min(maxHp, hp + amount)` — 超過分は切り捨て。

heal / HoT / barrier / **damage** は **`ResourceAmountSpec`**（`amount`）で効果量を定義。旧 JSON のトップレベル `powerMultiplier` のみも、`kind: atkBased` + `atkScale` として読み込む（後方互換）。

| kind | 式 |
|------|-----|
| `atkBased`（既定） | `floor(max(0, (effectiveAtk + healBonus + atkOffset) × atkScale))`（damage は healBonus なし） |
| `flat` | `floor(max(0, flatAmount + healBonus))` |
| `percentMaxHp` | `floor(max(0, target.maxHp × percentOfMaxHp + healBonus))` |

- `healBonus` — 使用者パッシブ `healBonus` の合算
- HoT — 1 秒 tick ごとに上記を **再計算**（付与時の ATK buff 変動を反映）
- 具体スキルへの割当・数値変更は Phase 4a マスタ確定後

## バリア

**effect 種別:** `barrier` — HP とは別の **`barrierHp`** プール。maxHp を超えて付与可。

| 項目 | 仕様 |
|------|------|
| 付与量 | `ResourceAmountSpec`（heal と同式） |
| 非スタック（既定） | 新量で **置換**（既存残量は捨てる） |
| 継ぎ足し | `barrierStack: true` で既存に加算 |
| 持続 | 時間切れなし — **ダメージで消費されるまで維持** |
| 死亡 | `hp ≤ 0` のみ（バリアだけ残っても HP 0 なら死亡） |
| リスポーン | HP 全回復と同時に `barrierHp = 0` |

**ダメージ吸収**（`applyDamageToTarget` — damage / DoT 共通）:

```
remaining = rawDamage
barrierDamage = min(barrierHp, remaining)
barrierHp -= barrierDamage
remaining -= barrierDamage
hp = max(0, hp - remaining)
```

HP バー: HP fill の上にバリア tier1（`min(barrierHp, maxHp)`）、さらに超過分 tier2（`max(0, barrierHp − maxHp)`）を明るい色で左から重ね描画。

## クールダウン

| 枠 | 進行ルール |
|----|------------|
| **basic** | 常に **時間**（`remaining -= deltaTime × basicCooldownRate`） |
| **active（時間）** | `remaining -= deltaTime × ∏ passive.activeCooldownRate` |
| **active（攻撃回数）** | 使用者の通常攻撃が命中するたび `remaining--` |
| **active（被攻撃回数）** | 使用者が `hurt` になるたび `remaining--` |

**basicCooldownRate** — クラス `attackSpeedTier` を `levelCurves.json` の `attackSpeedPresets` で係数化（`normal` = 1.0）。詳細は [stats.md](stats.md)。

**予定（未実装）** — パッシブ `attackSpeedTierShift` と buff/debuff `attackSpeed` による tier ステップ加算後、上記 preset から rate を再解決。

`remaining` が 0 になると `SkillExecutor` が1回発動し、`trigger.value` にリセット（レガシー `interval` は `trigger.kind: time` として解釈）。

1 tick あたりの実行順（1ユニット）：basic → active 枠0 → active 枠1

**スタン中:** `tickCooldowns` は継続（時間 CD は減る）。`runUnitSkills` / `SkillExecutor.tryExecute` はスキップするため、通常攻撃・アクティブは発動しない。`basicAttackCount` / `hitsTaken` トリガーもスタン中は進まない（命中・被弾が起きないため）。

## ヘイト（Threat）

味方のみランタイムで `threat` / `baseThreat` を保持。敵の `closestAlly` ターゲットは **ヘイト加重抽選**（実装：`src/battle/threat.ts`）。

### baseThreat（戦闘開始・前列圧力更新時）

```
statComponent = floor(maxHp × 0.1 + def × 2)
baseThreat = statComponent + frontRowPressureBonus
```

- `frontRowPressureBonus` — **前列**味方のみ。他前列の `1 - hp/maxHp` の最大値 × 自 statComponent（床が削れたほどタンクの基礎ヘイト上昇）

### 変動と減衰

| イベント | 変化 |
|----------|------|
| 与ダメ / 被ダメ | 双方（味方 actor・味方 target）に `floor(damage × 0.5)` を加算 |
| debuff 付与成功 | actor に `+15` 固定 |
| 毎 tick | `threat > baseThreat` なら `threat -= 20 × deltaTime`、下限 `baseThreat` |

### 敵ターゲット抽選

`pickThreatWeightedAlly`: 重み = `max(threat, 1) ^ 3`。高ヘイトほど当たりやすい（指数 3 で低ヘイトの当選率を抑制）。

## ステータス効果

対象ステ：`atk`, `def`, `damageTaken`。REG は buff 不可。

| 種別 | 定義方法 |
|------|----------|
| buff | `effect: "buff"` + `buffStat` / `buffMultiplier` / `buffDurationSec` |
| debuff | `effect: "debuff"` + `debuffStat` / `debuffMultiplier` / `debuffDurationSec` |
| スタン | `effect: "stun"` + `durationSec` — `StatusEffect.kind: "cc"`, `overlay: "stun"`。持続中は通常攻撃・アクティブ発動不可（CD は進行） |
| ノックバック | `effect: "knockback"` + `distancePx` — 敵は左（`-X`）、味方は右（`+X`）へ即時移動。敵は `BATTLE_ENEMY_MARCH_VISIBLE_MIN_X` 未満にならない |

**重複（同一対象・同一 stat / CC）：**

- buff/debuff `multiplier` — 乗算
- buff/debuff `flatBonus` — 代数和（buff `+` / debuff `-`）
- buff/debuff / CC `remainingSec` — **長い方**を採用（短い効果は上書き）

毎 tick：`remainingSec -= deltaTime`、0 以下で除去。

## ターゲット解決

1. パッシブを集約 → `targetRuleOverride` を適用（配列の後ろが優先）
2. スキル `range`（未指定 = 使用者射程）で **攻撃可能プール** を絞り込み
3. 各 effect の `targetShape` に従い **発動 tick で全 hit を一括解決**（`resolveEffectResolution`）
4. `scatter` / `pierce`（`pierceDurationSec` あり）は `pendingHitQueue` で **適用のみ時間分散**（再ターゲットなし）

| 形状 | 挙動 |
|------|------|
| `single` | 攻撃可能プールから 1 体。`hitCount >= 2` なら同一対象へ N 回（`hitDurationSec` で分散） |
| `aoe` | anchor + 半径内全員。`hitCount >= 2` なら同一範囲へ N 回（`hitDurationSec` で分散） |
| `multiLock` | `targetRule` で並べた攻撃可能プールへ `hitCount` 回ラウンドロビン（複数対象。1 体のみなら同一 ID 連打） |
| `pierce` | 射線上の敵を手前→奥。`pierceDurationSec` で適用分散可 |
| `chain` | anchor から同陣営へ距離内で連鎖 |
| `scatter` | 乱打（`scatterSpreadRadiusPx` で着弾分散、`scatterRadiusPx` で命中判定、`scatterDurationSec` で適用分散） |

プール：味方 actor → 敵、敵 actor → 味方。heal / buff 向け `mostDamagedAlly` 等も anchor として同じ形状を利用。

## 座標（ロジックと演出の分離）

| 座標 | 層 | 用途 |
|------|-----|------|
| `battleX` | `src/battle` | 射程判定・接敵移動・ターゲット選定 |
| `visualX` | `src/render` | 画面描画のみ（`formationLayout` の隊形配置・standoff で算出） |

同一 `battleX` のユニットはロジック上重なってよい（近接 range 0 等）。描画は `visualX` で隊形・standoff（演出用 `DEFAULT_MELEE_RANGE_PX` = 45px）を維持し、`battleX` の内部接近は画面に反映しない。

**スキル `move` の演出:** `battleX` はロジック上の目標（接触等）へ補間し、`visualX` は `resolveMoveVisualX` で求めた standoff 目標へ同じ進捗率で補間する（`battleX` デルタの 1:1 ミラーはしない）。

**接敵カメラ:** 接敵フェーズ中は最前線の `visualX` 中点がキャンバス中央（240px）へ来るよう `combatCameraX` をスプライト描画に加算する。非接敵・Victory 退出時は 0 にリセット。HUD はオフセットしない。

## 射程と移動

```
effectiveRangePx = effect.range ?? traits.rangePx ?? 既定値
  近接の既定値: 0px（剣・拳）。槍等は traits.rangePx や effect.range で 30px 等
  遠隔の既定値: traits.rangePx（必須）
```

- 命中: `battleDistance(actor, target) <= effectiveRangePx`
- 敵が画面内（`battleX >= BATTLE_ENEMY_VISIBLE_MIN_X`）に入ると **Engaged** 開始
- 射程外のユニットは攻撃可能位置まで接近（味方: `contactX + range`、敵: `contactX - range`）。到達後に攻撃
- `contactX` = 最前線生存敵の `battleX`
- **スキル移動中**（`move` 効果の補間中、または move を含むスキルシーケンス実行中）の actor は自動接近の対象外

## スキルシーケンス（move 含むスキル）

`move` を 1 つでも含むアクティブは、発動時に effect 列を battle 時間でスケジュールし順に適用する。

1. 各 effect の anchor を事前解決（move は射程外でも選択可）
2. `move` は `moveDurationSec` で `battleX` を線形補間
3. 次の effect の `applyAt` = 直前 move 完了時刻（move 連続時は累積）
4. 全 step 完了後に CD リセット（途中キャンセルは死亡時のみ）

例（奇襲帰還）: `move farthestEnemy` → `damage` → `move closestAlly (toAnchor)`

## 戦闘フロー（Phase 1）

1. 味方は初期隊列の `battleX` に配置、敵は左から出現・右進軍
2. 敵が画面内 → **Engaged** → 接近 + CD / スキル進行（射程内のみ発動）
3. 毎 tick：味方行動 → 敵行動
4. 敵全滅 → **Victory**；味方全滅 → **Defeat**
5. 3秒後：HP全回復、同一ステージ再スポーン、`Running` 再開

死亡ユニットはターゲット対象外。次の再スポーンまで death アニメ。

- **味方**: 同一 Wave 中はフィールド上に death 表示。次 Wave 進軍開始時にスプライトのみ消える（`hp`・HUD の灰色表示は維持）。ステージ再スポーンで HP 全回復。
- **敵**: Wave 終了でエンティティごと差し替わるため、死体は Wave 内のみ表示。

## 演出（render 層）

Phase 1 はプレースホルダー VFX のみ。**スキル別 `vfx` 設定・新プリセット追加は Phase 6**（[phase-roadmap.md](../plans/phase-roadmap.md)）。

| イベント | VFX |
|----------|-----|
| ダメージ | attack / hurt アニメ、ダメージポップアップ、近接/遠隔プレースホルダー（slash / orb / arrow） |
| 回復 | heal アニメ、緑ポップアップ、healRise プレースホルダー |
| buff / debuff | 対象の白い光（約0.8秒） |
| スタン（CC） | オーバーレイ `stun`（バッジ UI は Phase 3c 予定） |

ロジックは `BattleEvent` を発火；`BattleView` が `BattleCanvas` を駆動。`render/` に戦闘ルールは置かない。
