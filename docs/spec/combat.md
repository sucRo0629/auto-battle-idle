# 戦闘

実装：`src/battle/combatMath.ts`, `SkillExecutor.ts`

## 物理ダメージ

1. `baseDamage = floor(resolvePowerAmount(amount) × crowdBonus × damageIncreaseMul)`（`damageIncrease` はパッシブ + effect + DoT status の乗算）
2. `effectiveDef = applyDefenseIgnore(getEffectiveDef(target))`（DEF 無視: flat 減算 → percent 減算、パッシブ + effect 合算。各 `defenseIgnore` の `chance` を毎回判定し、失敗したソースは合算から除外）
3. `afterSubtract = baseDamage - effectiveDef`
4. `afterSubtract <= 0` なら `afterDefense = 0`、
  それ以外は `afterDefense = floor(afterSubtract × 100 / (100 + effectiveDef))`
5. `final = max(1, floor(afterDefense × damageTakenMul))`
6. **物理直接 `damage` のみ:** 回避判定 → ブロック判定（成功時 `blocked = floor(final × min(1, 0.25 + effectiveAtk/100))`、実ダメ = `final - blocked`）

**回避:** 直接 `damage` の物理/魔法問わず（DoT tick 非対象）。`SkillExecutor` で `resolveDamage` 前に判定。

**ブロック:** 直接 `damage` かつ `damageType: physical` のみ。`resolveDamage` 後に判定（DoT 非対象）。

`effectiveAtk = max(0, (atk + atkFlatSum) × atkMulProduct)`  
`effectiveDef = max(0, (def + defFlatSum) × defMulProduct)`  
`damageTakenMul = max(0, (1 + damageTakenFlatSum) × damageTakenMulProduct)` × パッシブ `damageTakenMultiplier`

固定値（flat）: 同一 stat 内で buff は `+flatBonus`、debuff は `-flatBonus` を代数和。  
係数（multiplier）: 同一 stat 内で乗算。

**ダメージ乱数:** 最終ダメージ・回復量に乱数ブレは設けない（完全決定）。

## 魔法ダメージ

1. 上記と同じ `baseDamage`
2. `effectiveReg = applyDefenseIgnore(getEffectiveReg(target))`（REG percent 無視。`chance` 判定は DEF と同様）
3. `afterDefense = floor(baseDamage × 100 / (100 + effectiveReg))`
4. `final = max(1, floor(afterDefense × damageTakenMul))`

クラスマスタ（`at_sorcerer` / `at_enchanter` / `at_geomancer` 等）は `damageType: "magic"` を使用。敵の `reg` が 0 のときも上式で最低 1 ダメージ。

## 攻撃速度と基本攻撃

- クラス `attackSpeedTier`（5 段階 enum）→ `attackSpeedPresets.basicCooldownRate`
- **アクティブ枠**の CD 加速には **適用しない**（`activeCooldownRate` のみ）
- 戦闘中の tier 変更（スキル由来）は **未実装** — 実装後は [stats.md](stats.md) の SPD 節を参照

## 回復

**原則:** 回復後の HP は `min(maxHp, hp + amount)` — 超過分は切り捨て。

**アクティブ heal / hot の発動保留:** 射程内の対象候補（`self` のときは自身）に **欠損 HP（`hp < maxHp`）の味方が 1 人もいない場合は発動しない**（CD 進行なし）。**同一スキルにバリア付与 effect がある場合は例外** — 対象が満タンでも heal / hot を解決する。パッシブ由来の HoT aura / 定期 tick は対象外。`target` の `order: ratio` で同率タイのときはプール先頭が選ばれる（実 HP のタイブレークなし）— 保留ルール適用後、全員満タン時には通常到達しない。**味方 stat / distance 対象で他味方がいないときは自身にフォールバック**（単独パーティの heal / バリア等）。

**余剰回復バリア変換**（パッシブ `excessHealToBarrier`）: 試行回復量のうち maxHp 超過分 × `barrierScale` を **バリア上書き**（`barrierStack` なし）。

**特効ダメージ**（パッシブ `damageIncrease` + effect `damageIncrease`）: **直接 `heal` のみ**に乗算（`damage` と同式の条件判定）。**HoT tick には非適用**（`damage` 直接のみ / DoT tick あり、という攻撃側の対比と同様）。

**被回復量増加**（パッシブ `healReceivedIncrease`）: 回復対象のパッシブ `percent` を加算し、`heal` / HoT tick 量に `floor(量 × (1 + percent合算))` を適用（`damageIncrease` 適用後の量に対して乗算）。`damageTakenToHeal` 等の自己回復は対象外。

heal / HoT / barrier / **damage** は `**ResourceAmountSpec`**（`amount`）で効果量を定義。旧 JSON のトップレベル `powerMultiplier` のみも、`kind: atkBased` + `atkScale` として読み込む（後方互換）。


| kind           | 式                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------- |
| `atkBased`（既定） | `floor(max(0, (effectiveAtk + healBonus + atkOffset) × atkScale))`（damage は healBonus なし） |
| `flat`         | `floor(max(0, flatAmount + healBonus))`                                                   |
| `percentMaxHp` | `floor(max(0, ref.maxHp × percentOfMaxHp + healBonus))` — `ref` は `maxHpRef`: `self` → 使用者、`target` または未指定 → 対象 |


- `healBonus` — 使用者パッシブ `healBonus` の合算
- HoT — 1 秒 tick ごとに上記を **再計算**（付与時の ATK buff 変動を反映）
- 具体スキルへの割当・数値変更は Phase 4a マスタ確定後

## バリア

**effect 種別:** `barrier` — HP とは別の `**barrierHp`** プール。maxHp を超えて付与可。


| 項目        | 仕様                               |
| --------- | -------------------------------- |
| 付与量       | `ResourceAmountSpec`（heal と同式）   |
| 加算（既定）    | 既存 `barrierHp` に **加算**                  |
| 置換         | `barrierStack: false` で新量に **置換**（既存残量は捨てる） |
| 持続        | 時間切れなし — **ダメージで消費されるまで維持**      |
| 死亡        | `hp ≤ 0` のみ（バリアだけ残っても HP 0 なら死亡） |
| リスポーン     | HP 全回復と同時に `barrierHp = 0`       |


**ダメージ吸収**（`applyDamageToTarget` — damage / DoT 共通）:

```
remaining = rawDamage
barrierDamage = min(barrierHp, remaining)
barrierHp -= barrierDamage
remaining -= barrierDamage
hp = max(0, hp - remaining)
```

HP バー: HP 減少時はバリア tier1（`min(barrierHp, maxHp)`）を現在 HP の右端から描画。HP 満タン時は tier1 を左から HP fill の上に重ねる。超過分 tier2（`max(0, barrierHp − maxHp)`）は従来どおり左端から明るい色で描画。

**HP 割合の参照:** 戦闘ロジックで「現在 HP 割合」を使うとき（`target.stat hp order: ratio`、特効 `targetHp`、`selfHpRatioBuff`、前列圧力ボーナス等）は **`hp / maxHp` のみ**とする。`barrierHp` は含めない（満タン HP + 大バリアでも HP 割合は 1.0）。

## クールダウン


| 枠                 | 進行ルール                                                   |
| ----------------- | ------------------------------------------------------- |
| **basic**         | 常に **時間**（`remaining -= deltaTime × basicCooldownRate`） |
| **active（時間）**    | `remaining -= deltaTime × ∏ passive.activeCooldownRate` |
| **active（攻撃回数）**  | 通常攻撃のダメージ発生ごとに、全 `basicAttackCount` アクティブがそれぞれ `remaining--`（多段は各ダメージごと。攻撃枠単位ではまとめない。回避時は進まない。`remaining > 0` のときのみ） |
| **active（被攻撃回数）** | 使用者が `hurt` になるたび `remaining--`（`remaining > 0` のときのみ） |


**basicCooldownRate** — クラス `attackSpeedTier` を `levelCurves.json` の `attackSpeedPresets` で係数化（`normal` = 1.0）。詳細は [stats.md](stats.md)。

**予定（未実装）** — パッシブ `attackSpeedTierShift` と buff/debuff `attackSpeed` による tier ステップ加算後、上記 preset から rate を再解決。

**時間トリガー（`time`）** — `remaining` が 0 になると `SkillExecutor` が1回発動し、`trigger.value` にリセット（レガシー `interval` は `trigger.kind: time` として解釈）。ステージ開始時は `remaining = trigger.value`（HUD ゲージ未充填）。

**カウントトリガー（`basicAttackCount` / `hitsTaken`）** — `trigger.value = N` のとき、次の3段階で進行する。

| フェーズ | 条件 | 攻撃回数 | 被攻撃回数 | HUD ゲージ |
| -------- | ---- | -------- | ---------- | ---------- |
| 充填中 | `remaining > 0` | 通常攻撃ダメージごとに全 basicAttackCount アクティブが `remaining--`（多段は各ダメージ、回避時は進まない） | `hurt` ごとに `remaining--` | `1 - remaining/N` |
| 準備完了 | `remaining === 0` | 発動しない | 発動しない | **100%（Max）** |
| 消費 | 準備完了後の N+1 回目 | **通常攻撃の代わりに**アクティブ発動 → `remaining = N` にリセット | **N+1 回目の被弾**でアクティブ発動（ダメージは通常通り）→ リセット | 0% に戻る |

ステージ開始時は `remaining = trigger.value`（ゲージ未充填）。カウントトリガーは `remaining === 0` でも active 枠から自動発動せず、上記の消費イベントを待つ。

1 tick あたりの実行順（1ユニット）：active 枠0→1→2→3 → basic（準備完了カウント active があれば basic 枠処理時にそちらを優先）

**発動ゲート（`firePolicy` / `fireConditions`）:** `trigger` がチャージ、`firePolicy` / `fireConditions` が発動可否。省略時 `immediate`（既存互換）。`smart` + 条件未成立 → ストック処理（多段チャージ）または `fireHold`（HUD 点滅）。`fireTimeoutSec` 経過後は条件無視で発動。

| kind | 成立条件 |
| ---- | -------- |
| `waveStart` | PartyDeploy 開始〜接敵（`beginEngaged`）まで |
| `waveEnd` | 敵全滅 settle〜次 Wave deploy まで |
| `enemyCount` | 生存敵数（`scope: living`）または射程内敵数（`inRange`） |
| `targetHp` / `debuff` / `minTargets` / `selfHp` / `allyDamaged` | 各 kind の閾値・タグ |

Wave 開始時の開幕効果（バリア・HoT 等）は **パッシブ `periodicTrigger: waveStart`** を使用（味方 CD は Wave 跨ぎ維持のため初期チャージは廃案）。

**多段チャージ（`maxCharges` / `storedCharges`）:** `maxCharges` 省略 = **0**（保持なし・ストック UI なし）。`maxCharges > 0` かつ smart 保留時、CD Max 後に 2 段目チャージを開始し `storedCharges` に確定ストック（上限 0〜3）。パッシブ `skillPropertyOverride.maxChargesBonus` で実効上限を加算（`GLOBAL_MAX_CHARGES_CAP = 3`）。

| レーン | 役割 |
| --- | --- |
| `presentationLock` | スキル発動後、各 effect の **body strip 再生秒** と **PNG VFX 再生秒**（main + `hitVfx`、登録 strip があるもののみ）の最大値を `resolvePresentationLockSec` で算出し、その間 **通常攻撃のみ** 停止（`isBasicAttackBlocked`）。`useDurationSec > 0` のときは **0**（use lock が優先）。**CD チャージは止めない**。秒数計算だけ `effectVfxOnly: false` で skill 直下 `vfx` を含めうる（再生は effect 優先ポリシーのまま）— [classes-and-skills.md](classes-and-skills.md#演出解決コード) |
| `animLock` | body strip の再生時間だけ `SkillSequenceRunner.beginAnimLock` で保持し、`isActorBusy` / `isBasicAttackBlocked` で **他スキル発動を停止**する。`presentationLock` と同様に **CD 進行は止めない**。body 再生を止める用途はここで自動付与する。 |
| `useDurationSec` | アクティブのみ optional（省略 / `0` = 即時）。発動成功時に `SkillSequenceRunner.beginUse` で停止を開始し、`isActorBusy` により **そのユニットの全スキル**（基本攻撃含む）が発動不可。**詠唱など、発動後に明示ロックが必要な場合のみ使う**。効果適用タイミングは変更なし（即時 / spread は pending キュー）。**停止中はそのユニットの全スキル CD 進行を停止する**。Party HUD: 停止中は `paused`（黄）。`move` シーケンス実行中も busy — `useDurationSec` を併用した場合、シーケンス終了後も lock 残量があれば busy 継続。`useDurationSec` の表示ゲージは発動後ロックを示す用途で、CD とは独立。 |

**Party HUD（アクティブ）:** 2×2 四分割（slot 0=左上, 1=右上, 2=左下, 3=右下）。各セル左 = CD fill、右 = `storedCharges > 0` のときのみ 3px 幅ストックピップ。`fireHold` 時は fill + ピップを tint / 点滅。

**スタン中:** `tickCooldowns` は継続（時間 CD は減る）。`runUnitSkills` / `SkillExecutor.tryExecute` はスキップするため、通常攻撃・アクティブは発動しない。`basicAttackCount` / `hitsTaken` トリガーもスタン中は進まない（命中・被弾が起きないため）。

## ヘイト（Threat）

味方のみランタイムで `threat` / `baseThreat` を保持。敵のデフォルトターゲット（`targetRuleOverride` なし・`distance/enemy/nearest`）は **射程内でヘイト最大の味方**（実装：`src/battle/threat.ts` の `pickHighestThreatAlly`）。

### baseThreat（戦闘開始・前列圧力更新時）

```
statComponent = floor(maxHp × 0.1 + def × 2)
baseThreat = statComponent + frontRowPressureBonus
defender のみ baseThreat = floor(baseThreat × 1.2)
```

- `frontRowPressureBonus` — **前列**味方のみ。他前列の `1 - hp/maxHp` の最大値 × 自 statComponent（床が削れたほどタンクの基礎ヘイト上昇）
- `defender` ロール — `statComponent + frontRowPressureBonus` の合計に `× 1.2`（`floor`）を適用

### 変動と減衰


| イベント        | 変化                                                                  |
| ----------- | ------------------------------------------------------------------- |
| 与ダメ（actor）   | 味方 actor に `floor(damage × 0.5)` を加算（全ロール共通） |
| 被ダメ（target）  | 味方 target に `floor(damage × 0.5)` を加算                                      |
| debuff 付与成功 | actor に `+15` 固定                                                    |
| 毎 tick      | `threat > baseThreat` なら `threat -= 20 × deltaTime`、下限 `baseThreat` |


### 敵ターゲット選定

`pickHighestThreatAlly`: 生存味方のうち射程内プールから `threat ?? baseThreat ?? 0` が最大の 1 体を選ぶ（決定論的）。同率タイは `battleX` が大きい方（前線側）→ `id` 辞書順。ヘイト 2 位以降が選ばれることはない。

`targetRuleOverride` 等で `distance/enemy/farthest`（または `nearest` + `moveAnchor`）に上書きされた場合は、敵 actor も使用者との `battleX` 距離で至近/最遠を選ぶ（ヘイトは使わない）。

## ステータス効果

対象ステ：`atk`, `def`, `reg`（耐魔）, `damageTaken`, `attackSpeed`（攻撃速度。基本攻撃 CD 回復倍率に適用）。`reg` の buff / debuff とも可。`buffFlatBonus` で固定加算可。

**HUD バッジ表示:** 1 つの `StatusEffect` を 1 つのバッジとして描画する。バッジは表示順のまま 4 個ごとに折り返し、2 段目以降は 1 段目の上に積む。パッシブ効果は常駐表示として扱い、`damageTaken` stat の net 軽減は `damageReduction`、net 増加は `damageIncrease` アイコン（矢印なし・原色）。味方は `PartyHudPanel`、敵は `BattleCanvas` 上のスプライト頭上（[battle-field.md](battle-field.md)）。


| 種別     | 定義方法                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| buff   | `effect: "buff"` + `buffStat` / `buffMultiplier` / `buffDurationSec`                                                                           |
| 通常攻撃変形 | `effect: "basicAttackTransform"` + `buffDurationSec` 等 — バフ持続中のみ通常攻撃 effect を実行時マージ（下記）。付与対象は自身固定 |
| debuff | `effect: "debuff"` + `debuffStat` / `debuffMultiplier` / `debuffDurationSec`                                                                   |
| スタン    | `effect: "stun"` + `durationSec`（**上限 5 秒**）— `StatusEffect.kind: "cc"`, `overlay: "stun"`。持続中は通常攻撃・アクティブ発動不可。**付与成功時**に対象の通常攻撃 CD を満タンにリセット。スタン中は **time トリガーアクティブ CD 停止**（基本攻撃 CD は進行） |
| 反撃    | `effect: "counter"` + `amount` / `durationSec` — `StatusEffect.overlay: "counter"`。バフ/デバフタグ対象外。詳細は下記 |
| デバフ解除  | `effect: "dispel"` — `dispelCount=0` で対象タグ全解除、`N>0` で `dispelPriority` に従い N 件（`longest` = 残り時間最長、`strongest` = 効果量最大。未指定は `longest`）。対象タグに `attackSpeed`（SPDデバフ）可。パッシブ `periodicDispel` は `stageStart` / `waveStart` / `onDebuffReceived` で `dispelTargetRule` + 形状・射程（接頭辞 `dispel`、[classes-and-skills.md](classes-and-skills.md)）で対象選択。`dispelTriggerLimit` = Wave 内発動回数上限 |
| ノックバック | `effect: "knockback"` + `distancePx` — 各陣営の **後方** へ即時移動（プレイヤーは左 `-X`、敵は右 `+X`）。敵は進軍表示下限未満にならない。詳細は [battle-field.md](battle-field.md) §2.5 |

### 反撃（`counter`）

**攻撃**（`damage` / `dot` を含むスキル。通常攻撃含む）を受け、バリア吸収後の **実ダメージ > 0**、かつ **攻撃者が反撃の `range` 以内** のとき、反撃状態の持有者が `responses[]` の内容を **すべて** 攻撃者へ適用する。

| 項目 | 挙動 |
|------|------|
| 付与対象 | 常に自身（`target: self`） |
| 射程 | `resolveCounterRangePx(counter.range, 持有者)` — 未指定・`0` = 持有者 `traits.rangePx`。正の値は絶対 px。距離判定は `isWithinSkillRange`（`battleDistance <= effectiveRangePx`）で行う |
| 種別フィルタ | `matchesCounterAttackRangeBand` → `isRangedAttack(attackRangePx)`。距離計算とは分離し、近接帯/遠隔帯の分類のみで使う |
| レスポンス | `damage` / `debuff` / `dot` / `stun` / `knockback` から 1 種別以上。被攻撃 1 回で選択種別を同時適用 |
| トリガー | 直接 `damage` および DoT tick |
| 非トリガー | 回避・0 ダメージ・反撃ダメージ（連鎖反撃なし）・射程外 |
| `damage` 軽減 | 攻撃者の DEF（物理）/ REG（魔法）を適用。回避・ブロックは非適用 |
| `targetShape` | `multiLock` 禁止 |

**確率反撃（パッシブ `counterChance`）：** 常時受付。上記と同じ被攻撃条件・射程・`responses` 内容だが、ヒットごとに `counterChance` を判定し、成功時に反撃内容を直接適用（`StatusEffect` 付与なし）。アクティブ `counter` とは独立に併用可。

**重複（同一対象・同一 stat / CC）：**

- buff/debuff `multiplier` — 乗算
- buff/debuff `flatBonus` — 代数和（buff `+` / debuff `-`）
- buff/debuff / CC `remainingSec` — **長い方**を採用（短い効果は上書き）

### 通常攻撃変形（`basicAttackTransform`）

アクティブ effect の `type: "basicAttackTransform"`。自身へ付与し、**バフ持続中のみ**通常攻撃（`slotKind: basic`）の effect を実行時にマージする。

| 項目 | 挙動 |
|------|------|
| 有効期間 | `buffDurationSec`（`remainingSec` 減衰）。**use lock / presentation lock 中は通常攻撃停止**（既存仕様）。lock 解除後〜バフ切れまで変形 |
| スタック | 複数付与時は **最新 1 件のみ**有効 |
| `hitCountMultiplier` | 既存 primary effect の `hitCount`（未指定 = 1）に乗算 |
| `primaryEffectOverride` | primary（先頭 non-move effect）を丸ごと差し替え |
| `primaryPatch` | primary への部分上書き（`damageType` / `amount.atkScale` 等） |
| `appendEffects` | primary の後に effect を追加（例: ダメージ + 自分中心 AoE heal） |
| `basicAttackCount` | 変形後も **damage ヒットのみ**充填。heal 化すると充填停止 |

毎 tick：`remainingSec -= deltaTime`、0 以下で除去。

## ターゲット解決

1. effect のターゲット陣営（`spec.side` 等）と一致する `targetRuleOverrideApplyTo` を持つパッシブのみ `targetRuleOverride` を適用（`kind: self` は除外。配列の後ろが優先）。通常攻撃・接近は敵向けスコープ
2. スキル `range`（未指定 = 使用者射程）で **攻撃可能プール** を絞り込み
3. 各 effect の `targetShape` に従い **発動 tick で全 hit を一括解決**（`resolveEffectResolution`）
4. `applyFrame` 指定時は **適用のみ遅延**（body は `skillWindup` で即再生、ダメージ等は pending キュー）。`hitCount >= 2` の `hitDurationSec` 分散は 1 ヒット目を `applyFrame` 基準に加算
5. `scatter` / `pierce`（`pierceDurationSec` あり）/ `chain`（2 体以上命中時、既定または `chainDurationSec`）は `pendingHitQueue` で **適用のみ時間分散**（再ターゲットなし）

**常時パッシブの再評価:** `periodicTrigger` 省略のパッシブは、対象を一度固定して終わりにはしない。対象が自分以外で、位置移動や新規侵入によって範囲内外が変わるものは、戦闘中に定期的に再評価して対象集合を同期する。

`distance` の `order: selfOrigin` は「使用者自身を起点にした範囲」を表す。`side: ally` では使用者自身も対象に含め、`side: enemy` では使用者自身を含めない。


| 形状          | 挙動                                                                                   |
| ----------- | ------------------------------------------------------------------------------------ |
| `single`    | 攻撃可能プールから 1 体。`hitCount >= 2` なら同一対象へ N 回（`hitDurationSec` で分散）                      |
| `aoe`       | anchor + 半径内全員。`hitCount >= 2` なら同一範囲へ N 回（`hitDurationSec` で分散）                     |
| `multiLock` | `targetRule` で並べた攻撃可能プールへ `hitCount` 回ラウンドロビン（複数対象。1 体のみなら同一 ID 連打）。味方 HP 割合最低（`order: ratio`）のとき満タン味方はプールから除外                  |
| `pierce`    | **`order: selfOrigin` 必須**。使用者の向き（味方 +X / 敵 −X）へ `range` px の前方セグメント内を手前→奥に命中。`piercePowerStepMultiplier` で威力減衰、`pierceDurationSec` で適用分散可 |
| `chain`     | anchor から同陣営へ距離内で連鎖。直前 hop と同じユニットには飛ばない。範囲内に未命中がいれば最も近い未命中を優先（全員命中済みなら再訪問可）。`chainPowerStepMultiplier` で威力減衰、`chainDurationSec`（未指定時 `0.15×chainCount+0.5` 秒）で **スキル発動から最終命中まで** の総時間分散 |

`chain` の各跳は `chainDurationSec ÷ 跳数` 秒間隔で **ダメージ適用と同時** に `playSkillHitFeedback` で hit VFX を出す。hit は effect **`hitVfx`**（`_vfx_hit` PNG があれば JSON 省略可）を優先し、未設定時は main **`vfx`** を target placement でフォールバック。main VFX（`vfx`、actor placement）は **1 跳目のみ**（`skipMainVfx` で 2 跳目以降は hit のみ）。
| `scatter`   | 乱打（`scatterSpreadRadiusPx` で着弾分散、`scatterRadiusPx` で命中判定、`scatterDurationSec` で適用分散） |


プール：プレイヤー actor → 敵、敵 actor → プレイヤー（実装移行中は `ally` 表記の残存あり）。heal / buff 向け `mostDamagedAlly` 等も anchor として同じ形状を利用。

## 座標・移動・戦闘フェーズ

横 1 軸のバトルライン、座標層（`battleX` / `visualX` / `screenX`）、Wave・`spawnX`、隊形スロット、接敵トリガー、カメラ、BattlePhase FSM、生死表示は **[battle-field.md](battle-field.md)** を正本とする。現行コードは旧軸・旧パイプラインのため、実装が追いつくまで本節の旧記述は battle-field.md に置き換え済み。

### 射程（要約）

```
effectiveRangePx = effect.range ?? actor.traits.rangePx
```

通常攻撃（合成 basic）は effect に `range` を持たず、常に `traits.rangePx` を参照する。

- 命中: `battleDistance(actor, target) <= effectiveRangePx`
- 攻撃可能位置・自動接近・接敵開始条件は [battle-field.md](battle-field.md) §2.5・§4.3–§4.4

### スキルシーケンス（move 含むスキル）

`move` を 1 つでも含むアクティブは、発動時に effect 列を battle 時間でスケジュールし順に適用する。

1. 各 effect の anchor を事前解決（move は射程外でも選択可）
2. `move` は `moveDurationSec` で `battleX` を線形補間（`visualX` は overlay。layout とは分離 — battle-field.md §4.5）
3. 次の effect の `applyAt` = 直前 move 完了時刻（move 連続時は累積）
4. 全 step 完了後に CD リセット（途中キャンセルは死亡時のみ）

例（奇襲帰還）: `move farthestEnemy` → `damage` → `move closestPlayer (toAnchor)`

### 戦闘フロー（Phase 1）

1. プレイヤー隊列を後方に配置、敵 Wave を前方（`spawnX`）から左進軍 — [battle-field.md](battle-field.md) §3–§4
2. standoff cap 到達 → **Engaged** → 接近 + スキル発動（射程内のみ）
3. **非接敵中**も DoT/HoT tick・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は接敵中のみ（battle-field.md §4.7）
4. 毎 tick（接敵中）：プレイヤー行動 → 敵行動
5. 敵全滅 → **Victory**；プレイヤー全滅 → **Defeat**
6. 3秒後：HP全回復、同一ステージ再スポーン、`Running` 再開

死亡ユニットはターゲット対象外。次の再スポーンまで death アニメ。Wave 跨ぎの生死表示は battle-field.md §3.4。

## 演出（render 層）

VFX パラメータ調整・プレビューは **Phase 5 演出調整ツール**（`presentation-lab.html`）。戦闘描画は **PNG strip のみ**（`BattleCanvas.playSkillVfx` → `VfxPlaybackManager`。[phase-roadmap.md](../plans/phase-roadmap.md) Phase 6 完了）。

**body アセット:** entity は `sheets/bodies/{id}.png`（idle/move/death）。攻撃 body は **全スキル strip**（64×48、`{id}_basic_attack` 含む）。詳細は [classes-and-skills.md](classes-and-skills.md#スプライト演出アセット)。

| イベント          | 演出 |
| ------------- | --- |
| ダメージ（通常攻撃含む） | skill strip（あれば）+ VFX + ダメージポップアップ。`applyFrame` あり時は strip を先に再生し VFX・ポップアップは apply コマ |
| ダメージ（active） | skill strip + VFX |
| 回復            | skill strip または VFX + 緑ポップアップ |
| buff / debuff | 対象の白い光（約0.8秒） |
| スタン（CC）       | オーバーレイ `stun` |
| 死亡          | entity death 行（body atlas） |

**VFX 再生（`playSkillHitFeedback`）:** `skill` イベントごとに main（actor placement・1 跳目のみ）と hit（target placement・`hitVfx` 未指定時は `vfx` フォールバック）を PNG strip で再生。`scatter` / `chain` / `hitCount` 分散時は各適用タイミングで hit VFX を独立インスタンスとして重ね表示可。

ロジックは `BattleEvent` を発火；`BattleView` が `BattleCanvas` を駆動。`render/` に戦闘ルールは置かない。