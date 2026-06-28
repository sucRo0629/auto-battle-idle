# 戦闘

実装：`src/battle/combatMath.ts`, `SkillExecutor.ts`, `damageDelay.ts`

## 物理ダメージ

1. `baseDamage = floor(resolvePowerAmount(amount) × crowdBonus × damageIncreaseMul)`（`damageIncrease` はパッシブ + effect + DoT status の乗算）
2. `rawDef = getEffectiveDef(target)`（物理のみ。魔法は REG 側）
3. `effectiveDef = applyDefenseIgnore(rawDef)`（DEF 無視: flat 減算 → percent 減算、パッシブ + effect 合算。各 `defenseIgnore` の `chance` を毎回判定し、失敗したソースは合算から除外。passive `effect: specialEffect` に `defenseIgnore` を併記した場合は、`specialEffect` の damage 条件が成立した Hit のみ DEF 無視へ合算 — 例: 双刃士 P3 刈り取り）
4. `ignoredDef = max(0, rawDef - effectiveDef)`（物理のみ）
5. `afterSubtract = baseDamage - effectiveDef`
6. `afterSubtract <= 0` なら `afterDefense = 0`、
   それ以外は `afterDefense = floor(afterSubtract × 100 / (100 + effectiveDef))`
7. `bonus = floor(ignoredDef × ignoredDefBonusScale)` — パッシブ `ignoredDefBonusDamage`（例: 剣術士 P4 剛剣の冴え）。未習得なら 0
8. `subtotal = afterDefense + bonus`
9. `afterDR = max(1, floor(subtotal × damageTakenMul))` — `ignoreDamageTakenReduction: true` の直接 `damage` は `damageTakenMul` を 1 として計算（⑨）
10. **直接 `damage` パイプライン（SkillExecutor / `applyIncomingDamage`、ターゲット確定後）:** 回避判定（⑩）→ `resolveDamage`（①〜⑨）→ ブロック判定（⑪）→ 障壁（wardBarrier）軽減（⑫）→ `barrierHp` 吸収（⑬）→ HP 減少
    - 回避成功時は以降（①〜⑬・BAC 充填）をスキップ
    - `pierceBlock: true` — ⑪ block をスキップ
    - `pierceWard: true` — ⑫ wardBarrier をスキップ
    - `pierceBarrier: true` — ⑬ barrierHp 吸収をスキップ
    - 回避は v1 では貫通対象外（⑩は常に判定）
      10b. **魔法直接 `damage`:** `blocksMagic: true` の block overlay がある対象のみ追加判定（⑪相当）。成功時 `blocked = floor(afterDR × 0.15)`（定数 `MAGIC_BLOCK_MITIGATION_RATIO`）

**回避:** 直接 `damage` の物理/魔法問わず（DoT tick 非対象）。`SkillExecutor` で `resolveDamage`（①〜⑨）**前**（直接 `damage` パイプライン先頭）に判定。

**ブロック（物理）:** 直接 `damage` かつ `damageType: physical`。⑨の後・⑪で判定（DoT 非対象）。`overlay: block` の `blockChance` を合算して 1 回ロール。

**ブロック（魔法）:** 直接 `damage` かつ `damageType: magic`。`blocksMagic: true` の overlay の `blockChance` のみ合算して 1 回ロール。軽減率は固定 15%。`frontBlockAura`（護法士 P3 真言加護）で前列に付与。

7. **DamageDelay 有効時（直接 `damage` / 反撃 `damage` のみ）:** Block 後の確定ダメージ `final` を `ratio` で分割。即時分は Barrier → HP。遅延分はプールに加算し、`buffDurationSec` 中 1 秒ごとに HP へ tick。遅延 tick は DEF/REG/Barrier/Block/Evasion を再適用しない（確定済みダメージ）。DoT 非対象。

`effectiveAtk = max(0, (atk + atkFlatSum) × atkMulProduct)`  
`effectiveDef = max(0, (def + defFlatSum) × defMulProduct)`  
`effectiveMaxHp = max(0, (maxHp + hpFlatSum) × hpMulProduct)`  
`damageTakenMul = max(0, (1 + damageTakenFlatSum) × damageTakenMulProduct)` × パッシブ `damageTakenMultiplier`

固定値（flat）: 同一 stat 内で buff は `+flatBonus`、debuff は `-flatBonus` を代数和。  
係数（multiplier）: 同一 stat 内で乗算。

**ダメージ乱数:** 最終ダメージ・回復量に乱数ブレは設けない。確率要素を使う場合も、判定直後に成功 / 失敗の確定結果へ収束させる（下記「確率判定と確定状態」）。

## 確率判定と確定状態

戦闘状態は **未判定状態 → 判定 → 確定状態** の遷移として扱う。

```text
未判定状態
  → 判定（chance / 確率ロール）
  → 確定状態
```

確率要素は判定時だけ使用できる。`chance` はスキル定義やパッシブ定義に置かれる判定パラメータであり、戦闘中の `CombatantState` / `StatusEffect` / `BattleSnapshot` に「未判定」「成功するかもしれない」「失敗するかもしれない」という確率状態を保持しない。

| 対象                                    | 未判定状態                                 | 判定                                    | 確定状態                                                        |
| --------------------------------------- | ------------------------------------------ | --------------------------------------- | --------------------------------------------------------------- |
| 回避                                    | 直接 `damage` を受ける（ターゲット確定後） | `evasion` の `chance` を判定（⑨より前） | 回避成功なら damage 非適用、失敗なら `resolveDamage` 以降へ進む |
| ブロック                                | 物理直接 `damage` が確定                   | `block` の `chance` を判定              | 成功なら block 後 damage、失敗なら block なし                   |
| 防御無視                                | damage 計算開始                            | 各 `defenseIgnore.chance` を判定        | 成功したソースだけ DEF / REG 無視へ合算                         |
| 無視DEFボーナス                         | damage 計算（物理）⑥                       | —                                       | `ignoredDef × ignoredDefBonusScale` を `afterDefense` に加算    |
| DR 無視（`ignoreDamageTakenReduction`） | damage 計算⑨                               | —                                       | `damageTakenMul` を 1.0 として `afterDR` を算出                 |
| 貫通フラグ（`pierceBlock` 等）          | 直接 `damage` 適用⑪〜⑬                     | —                                       | 各フラグ ON 時に block / ward / barrier をスキップ              |
| debuff / stun / knockback 付与          | effect 適用時                              | effect / passive の `chance` を判定     | 成功なら `StatusEffect` / moveLock 等を付与、失敗なら非付与     |
| 確率反撃                                | 被攻撃条件と射程条件を満たす               | `counter.chance` を判定                 | 成功なら responses を即時適用、失敗なら反撃なし                 |
| Stage/Wave 開始パッシブ                 | 発動タイミング到達                         | `chance` を判定                         | 成功なら効果を適用、失敗なら非適用                              |

**責務分離:**

- 確率判定責務 — `chance` を読み、成功 / 失敗をその場で確定する。
- 効果適用責務 — 判定済みの成功結果だけを HP、barrier、StatusEffect、CD、Threat、位置へ反映する。
- 状態保持責務 — 反映後の確定値だけを保持する。未判定の確率状態は保持しない。
- ログ / イベント責務 — 戦闘ログと `BattleEvent` には確定結果のみを出す。例: `evaded`、`debuff applied`、`counter triggered`、`counter not triggered`。確率値や未判定状態はログ上の戦闘結果として扱わない。

表示ログは成功イベント中心でもよいが、S4 検証用の内部イベント / debug ledger では失敗結果（例: debuff 非付与、counter 非発動、防御無視非適用）も **判定済みの確定結果** として観測できる形を保つ。

このルールは [../combat-architecture.md](../combat-architecture.md) の「確定結果レイヤー」に従う。戦闘結果レイヤーの完全決定性とは、確率判定を禁止することではなく、判定後の結果が必ず確定状態として保存・描画・ログ出力されることを指す。

## 魔法ダメージ

1. 上記と同じ `baseDamage`
2. `effectiveReg = applyDefenseIgnore(getEffectiveReg(target))`（REG percent 無視。`chance` 判定は DEF と同様）
3. `afterDefense = floor(baseDamage × 100 / (100 + effectiveReg))`
4. `final = max(1, floor(afterDefense × damageTakenMul))`

クラスマスタ（`at_sorcerer` / `at_sigilist` / `at_conductor` 等）は `damageType: "magic"` を使用。敵の `reg` が 0 のときも上式で最低 1 ダメージ。

## 攻撃速度と基本攻撃

- クラス `attackSpeedTier`（5 段階 enum）→ `attackSpeedPresets.basicCooldownRate`
- **アクティブ枠**の CD 加速には **適用しない**（`activeCooldownRate` のみ）
- 戦闘中の tier 変更（スキル由来）は **未実装** — 実装後は [stats.md](stats.md) の SPD 節を参照

## 回復

**原則:** 回復後の HP は `min(effectiveMaxHp, hp + amount)` — 超過分は切り捨て。maxHp バフ / デバフ解消で effectiveMaxHp が下がった場合、現在 HP は effectiveMaxHp で切り上げない（超過分のみ clamp）。

### Priority Heal Target（PHT）

回復系スキル・ally-heal 自動接近・heal / hot 発動保留で共有する正本。実装: `resolvePriorityHealTarget`（`src/battle/skills/targeting.ts` または `combatMath.ts` — 接近・withhold・stat ratio 選定の単一経路）。

**定義:** 生存味方のうち `hp < effectiveMaxHp` を負傷者とし、その中で `hp / effectiveMaxHp` が最小の 1 体を **PHT** とする。満タン味方は候補外。

**同率タイブレーク:** (1) HP 割合最小 (2) `effectiveMaxHp` 昇順 (3) `id` 辞書順。

**適用:**

| 用途 | ルール |
| ---- | ------ |
| 味方 `stat` + `order: ratio` 単体 heal / hot | PHT を選ぶ（従来 spec と同一意味を PHT 名で正本化） |
| ally-heal 自動接近 | PHT が通常攻撃 heal 射程内に入るまで前進。全員満タンは現位置維持（敵 chase しない） |
| ally-heal 接近停止 | 射程内に **PHT** がいれば停止（任意の軽傷者ではない） |
| heal / hot withhold — 単体・`stat` | PHT が射程内にいなければ保留（CD 進行なし） |
| heal / hot withhold — `selfOrigin` + `aoe` | **PHT が aoe 半径内**（使用者足元）にいなければ保留 |
| heal / hot withhold — `kind: all` + ally | パーティに負傷者（≡ PHT が存在）がいなければ保留。位置制約なし |
| パッシブ aura HoT | withhold 対象外（既存） |
| 同一スキルに barrier effect | 満タンでも heal / hot を解決（既存例外） |

接近・formation clamp の詳細は [battle-field.md](battle-field.md) §4.4。薬草師 A1 等のクラス別割当は [classes-and-skills.md](classes-and-skills.md) 薬草師節。

**`selfOrigin` + ally heal の棚卸し（方針 A — JSON 維持）:**

| スキル | effect | PHT withhold | 備考 |
| ------ | ------ | ------------ | ---- |
| `sp_alchemist_active_1` | selfOrigin aoe 70 HoT | PHT ∈ 半径 | 唯一の ally selfOrigin **heal**。接近 + withhold で PHT まで寄る |
| `sp_wardweaver_active_3` | selfOrigin aoe barrier | **対象外**（heal/hot ではない） | effect 1 は `poolFromEffectIndex` + stat ratio barrier |
| 槍術士 / 護法士 passive 等 | selfOrigin ally **buff** | 対象外 | PHT 節は heal / hot のみ |

**アクティブ heal / hot の発動保留（要約）:** 上表の PHT 基準。パッシブ由来 HoT aura / 定期 tick は対象外。**heal の味方 stat / distance 対象は使用者自身も候補に含める**（支援 buff 等の非 heal 味方 stat は従来どおり使用者除外）。`order: ratio` の同率タイブレークは本節 PHT 定義に従う。verify モード battleX debug の approach 表は deltaX=0 でも PHT / withhold を `details` 列に表示（`battleXDebugTraceTable.ts`）。

**余剰回復バリア変換**（パッシブ `excessHealToBarrier`）: 試行回復量のうち maxHp 超過分 × `barrierScale` を **バリア上書き**（`barrierStack` なし）。

**特効ダメージ**（パッシブ `damageIncrease` + effect `damageIncrease`）: **直接 `heal` のみ**に乗算（`damage` と同式の条件判定）。**HoT tick には非適用**（`damage` 直接のみ / DoT tick あり、という攻撃側の対比と同様）。

`DamageIncreaseCondition`（パッシブ `specialEffect` / effect `damageIncrease` / `bonusBasicAttackConditions` 共用）: 全条件 **AND**。種別は `debuff` / `targetHp` / `attackType`。`attackType` は `target.attackType` と同型で、対象の `traits.rangePx` 等から遠隔/近接を判定（`matchesAttackType`）。詳細は [classes-and-skills.md](classes-and-skills.md) 特効効果節。

**被回復量増加**（パッシブ `healReceivedIncrease`）: 回復対象のパッシブ `percent` を加算し、`heal` / HoT tick 量に `floor(量 × (1 + percent合算))` を適用（`damageIncrease` 適用後の量に対して乗算）。

heal / HoT / barrier / **damage** は `**ResourceAmountSpec`\*\*（`amount`）で効果量を定義。旧 JSON のトップレベル `powerMultiplier` のみも、`kind: atkBased` + `atkScale` として読み込む（後方互換）。

| kind               | 式                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `atkBased`（既定） | `floor(max(0, (effectiveAtk + healBonus + atkOffset) × atkScale))`（damage は healBonus なし）                                        |
| `flat`             | `floor(max(0, flatAmount + healBonus))`                                                                                               |
| `percentMaxHp`     | `floor(max(0, ref.effectiveMaxHp × percentOfMaxHp + healBonus))` — `ref` は `maxHpRef`: `self` → 使用者、`target` または未指定 → 対象 |

- `healBonus` — 使用者パッシブ `healBonus` の合算
- HoT — 1 秒 tick ごとに上記を **再計算**（付与時の ATK buff 変動を反映）
- 具体スキルへの割当・数値変更は Phase 4a マスタ確定後

## バリア

**effect 種別:** `barrier` — HP とは別の `**barrierHp`\*\* プール。maxHp を超えて付与可。

| 項目        | 仕様                                                                  |
| ----------- | --------------------------------------------------------------------- |
| 付与量      | `ResourceAmountSpec`（heal と同式）                                   |
| max（既定） | `grant > barrierHp` のとき `barrierHp = grant`（小さい grant は無視） |
| 加算        | `barrierStack: true` のみ既存に **加算**                              |
| 持続        | 時間切れなし — **ダメージで消費されるまで維持**                       |
| 死亡        | `hp ≤ 0` のみ（バリアだけ残っても HP 0 なら死亡）                     |
| リスポーン  | HP 全回復と同時に `barrierHp = 0`                                     |

**ダメージ吸収**（被ダメパイプライン。`applyIncomingDamage` 前に障壁・ブロックを適用）:

```
1. 障壁（wardBarrier）スタックあり → そのヒット × damageReductionRatio、スタック 1 消費
2. block（物理のみ・確率）
3. barrierHp 吸収（applyDamageToTarget）
4. HP 減少
```

`barrierHp` 単体の吸収式:

```
remaining = rawDamage
barrierDamage = min(barrierHp, remaining)
barrierHp -= barrierDamage
remaining -= barrierDamage
hp = max(0, hp - remaining)
```

**障壁（wardBarrier）** — バリア（`barrierHp`）より上位のスタック資源。印（Mark）は印術師専用で別リソース。HUD は `barrierHp` とは別バッジ（`wardBarrier` アイコン + `stacks`、2 以上のみ数字表示）。`barrierDepletionHeal` / `barrierBreakRegen` の対象外（`barrierHp` 完全消失のみ）。

**パッシブ `barrierDepletionHeal`** — 味方 `barrierHp` が被ダメで完全消失したとき、パーティ内結界師（ATK 最大）が ATK 基準 instant heal を 1 回（味方ごと Wave 1 回・`barrierDepletionHealUsed`）。

**パッシブ `specialEffectApplyTo: barrier`** — 結界師の outgoing barrier grant に乗算（heal 特効と同型）。

**`targetBarrierBelowGrant`** — `resolvedGrant > target.barrierHp` のときのみ成立。smart 発火または effect `effectConditions` に指定。

**`pendingIncomingDamage`（fire 条件）** — 敵 origin の `pendingHitQueue` 内、味方対象 `damage` を `windowSec` 以内に評価。見積もり = `resolveDamage` → `applyDefenseMitigation` → `damageTaken` 倍率 → 物理は block 期待値・回避は期待値 `(1-p)×dmg`。バリア・障壁は見積もりに含めない。

**`fireConditionMatch`** — `all`（省略時 AND）または `any`（OR）。三重の障壁は `any`。

HP バー: HP 減少時はバリア tier1（`min(barrierHp, maxHp)`）を現在 HP の右端から描画。HP 満タン時は tier1 を左から HP fill の上に重ねる。超過分 tier2（`max(0, barrierHp − maxHp)`）は従来どおり左端から明るい色で描画。

**HP 割合の参照:** 戦闘ロジックで「現在 HP 割合」を使うとき（`target.stat hp order: ratio`、特効 `targetHp`、`selfHpRatioBuff`、前列圧力ボーナス等）は **`hp / effectiveMaxHp` のみ**とする。`barrierHp` は含めない（満タン HP + 大バリアでも HP 割合は 1.0）。

## クールダウン

クールダウンは **戦闘時間で進行するタイマー**として統一する。スタン、ターゲット不在、発動条件未成立、演出ロック、通常攻撃停止は CD タイマーを止めない。

例外は `useDurationSec` による **SkillHold**。`useDurationSec` はスキルデータ層に置く「このスキルは hold / channel / commit time を持つ」という宣言であり、デバフや `StatusEffect` ではない。戦闘エンジン層は発動成功時にその宣言を SkillHold として解釈し、持続中の basic CD / active CD / イベントゲージ停止、busy 判定、残時間管理を行う。敵対的な時間停止が必要な効果は SkillHold ではなく、後述の `freeze` など別状態として定義する。

| 枠                            | 進行ルール                                                               |
| ----------------------------- | ------------------------------------------------------------------------ |
| **basic CD**                  | 常に **時間**（`remaining -= deltaTime × basicCooldownRate`）            |
| **active CD（time trigger）** | 常に **時間**（`remaining -= deltaTime × ∏ passive.activeCooldownRate`） |

**basicCooldownRate** — クラス `attackSpeedTier` を `levelCurves.json` の `attackSpeedPresets` で係数化（`normal` = 1.0）。詳細は [stats.md](stats.md)。

**予定（未実装）** — パッシブ `attackSpeedTierShift` と buff/debuff `attackSpeed` による tier ステップ加算後、上記 preset から rate を再解決。

**時間トリガー（`time`）** — `remaining` が 0 になると発動可能状態になる。発動できる場合は `SkillExecutor` が 1 回発動し、`trigger.value` にリセットする。スタン中などで行動できない場合も `remaining = 0` の準備完了状態を保持し、CD は停止しない（レガシー `interval` は `trigger.kind: time` として解釈）。

**チャージなし（`time` / `value: 0`）** — 時間充填なし（`remaining` は常に 0、CD tick なし）。`smart` + `fireConditions` または `stageTriggerLimit` が必須。発動後も `remaining = 0` のまま。実装: `skillTrigger.ts` `isNoChargeTimeTrigger`。

**`finalWaveStart` イベント発動** — `fireConditions` に `finalWaveStart` を持つアクティブは、最終 Wave 接敵時（`tryAutoFireFinalWaveStageSkills`）に `remaining` を 0 に強制リセットしてから発動する（`trigger.value` が大きくてもイベント時は撃てる）。

**カウントトリガー（`basicAttackCount` / `hitsTaken`）は CD ではなくイベントゲージ。** `trigger.value = N` のとき、次の 3 段階で進行する。

| フェーズ | 条件                  | 攻撃回数                                                                                                   | 被攻撃回数                                                         | HUD ゲージ        |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| 充填中   | `remaining > 0`       | 通常攻撃ダメージごとに全 basicAttackCount アクティブが `remaining--`（多段は各ダメージ、回避時は進まない） | `hurt` ごとに `remaining--`                                        | `1 - remaining/N` |
| 準備完了 | `remaining === 0`     | 発動しない                                                                                                 | 発動しない                                                         | **100%（Max）**   |
| 消費     | 準備完了後の N+1 回目 | **通常攻撃の代わりに**アクティブ発動 → `remaining = N` にリセット                                          | **N+1 回目の被弾**でアクティブ発動（ダメージは通常通り）→ リセット | 0% に戻る         |

ステージ開始時は `remaining = trigger.value`（ゲージ未充填）。カウントトリガーは `remaining === 0` でも active 枠から自動発動せず、上記の消費イベントを待つ。スタン中は行動不能のため `basicAttackCount` の消費イベントは起きない。`hitsTaken` はスタン中でも被弾して `hurt` が発生すれば通常どおり進む。SkillHold 中は使用者自身のイベントゲージも停止する。

1 tick あたりの実行順（1 ユニット）：active 枠 0→1→2→3 → basic（準備完了カウント active があれば basic 枠処理時にそちらを優先）

**発動ゲート（`firePolicy` / `fireConditions`）:** `trigger` がチャージ、`firePolicy` / `fireConditions` が発動可否。省略時 `immediate`（既存互換）。`smart` + 条件未成立 → ストック処理（多段チャージ）または `fireHold`（HUD 点滅）。`fireTimeoutSec` 経過後は条件無視で発動。

| kind                                                            | 成立条件                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `waveStart`                                                     | PartyDeploy 開始〜接敵（`beginEngaged`）まで                     |
| `finalWaveStart`                                                | 最終 Wave の PartyDeploy 開始〜接敵（`beginEngaged`）まで        |
| `waveEnd`                                                       | 敵全滅 settle〜次 Wave deploy まで                               |
| `enemyCount`                                                    | 生存敵数（`scope: living`）または射程内敵数（`inRange`）         |
| `targetHp` / `debuff` / `minTargets` / `selfHp` / `allyDamaged` | 各 kind の閾値・タグ                                             |
| `pendingIncomingDamage`                                         | 先読みキュー内の味方被ダメ見積もり（`maxHpRatio` / `windowSec`） |
| `targetBarrierBelowGrant`                                       | 参照 effect の grant > 対象 `barrierHp`                          |

**`fireConditionMatch`** — `all`（省略）または `any`。`any` 時は条件のいずれかで smart 発動。

**`fireConditions` の `targetHp`:** 参照 effect（先頭 effect）の `target` と射程で **攻撃可能プール** を組み、味方向けはプール全体で判定する。`target: all` + `side: ally` → 射程内（`all` は射程無視で全生存味方）の **誰か 1 人** が閾値を満たせば成立。`target: stat` + `hp` + `order: ratio` + `side: ally` → プール内 **最小 HP 割合**が閾値を満たせば成立（heal は使用者もプールに含む）。敵向け・単体 anchor 向けは従来どおり primary 1 体で判定。

Wave 開始時の開幕効果（バリア・HoT 等）は **パッシブ `periodicTrigger: waveStart`** を使用（味方 CD は Wave 跨ぎ維持のため初期チャージは廃案）。

**多段チャージ（`maxCharges` / `storedCharges`）:** `maxCharges` 省略 = **0**（保持なし・ストック UI なし）。`maxCharges > 0` かつ smart 保留時、CD Max 後に 2 段目チャージを開始し `storedCharges` に確定ストック（上限 0〜3）。パッシブ `skillPropertyOverride.maxChargesBonus` で実効上限を加算（`GLOBAL_MAX_CHARGES_CAP = 3`）。

| レーン             | 役割                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presentationLock` | スキル発動後、各 effect の **body strip 再生秒** と **VFX 再生秒**（main + `hitVfx`、登録 strip があるもののみ）および **particles 再生秒**（`resolveParticlePlaybackSec`）の最大値を `resolvePresentationLockSec` で算出し、その間 **通常攻撃のみ** 停止（`isBasicAttackBlocked`）。`useDurationSec > 0` のときは **0**（use lock が優先）。**CD は止めない**。秒数計算だけ `effectVfxOnly: false` で skill 直下 `vfx` を含めうる（再生は effect 優先ポリシーのまま）— [classes-and-skills.md](classes-and-skills.md#演出解決コード)                                                                                                                                                                                             |
| `animLock`         | body strip の再生時間だけ `SkillSequenceRunner.beginAnimLock` で保持し、`isActorBusy` / `isBasicAttackBlocked` で **他スキル発動を停止**する。`presentationLock` と同様に **CD 進行は止めない**。body 再生を止める用途はここで自動付与する。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `useDurationSec`   | アクティブのみ optional（省略 / `0` = 即時）。スキルデータ層では SkillHold（硬直）を発生させる宣言だけを担う。戦闘エンジン層は発動成功時に `SkillSequenceRunner.beginUse` で SkillHold を開始し、`isActorBusy` により **そのユニットの全スキル**（基本攻撃含む）を発動不可にする。**SkillHold 中は使用者自身の basic CD / active CD / イベントゲージを停止する**。自動接近は **既定で継続**する。`useDurationPauseApproach: true` のときのみ SkillHold 中の自動接近も停止する（鉄衛士の構え系など）。Party HUD: 停止中は `busy`（黄）。 |

**Party HUD（アクティブ）:** 2×2 四分割（slot 0=左上, 1=右上, 2=左下, 3=右下）。各セル左 = CD fill、右 = `storedCharges > 0` のときのみ 3px 幅ストックピップ。`fireHold` 時は fill + ピップを tint / 点滅。`stageTriggerLimit` を持つスキルで Stage 内残回数が 0 のときは fill を **empty（トラック色のみ・最暗）** のまま表示し、`ready` / `fireHold` にしない。

**スタン中:** `tickCooldowns` は継続（時間 CD は減る）。`runUnitSkills` / `SkillExecutor.tryExecute` はスキップするため、使用者として通常攻撃・アクティブを発動せず、ターゲット選択も行わない。スタン中のユニットは他ユニットからの攻撃・回復・効果対象にはなり得る。スタンは CD 停止効果を持たない。

## ヘイト（Threat）

味方のみランタイムで `threat` / `baseThreat` を保持。敵のデフォルトターゲット（`targetRuleOverride` なし・`distance/enemy/nearest`）は **射程内でヘイト最大の味方**（実装：`src/battle/threat.ts` の `pickHighestThreatAlly`）。

### 設計意図

Threat は、敵 AI が「誰を優先して攻撃するか」を決めるための **受け口設計値** である。これは Position（どこにいるか）、Move（どこへ移動するか）、Frontline ownership（誰が戦線を保持しているか）とは分けて扱う。

- Threat は **敵のデフォルトターゲット優先度** を決める
- Position は **射程内に入るか、どこで戦うか** を決める
- Move は **どこへ侵入し、どこへ戻るか** を決める
- これらを同一の意味へ畳み込まない

移動型アタッカーや背後侵入スキルを成立させるため、前進・背後侵入・一時的な接敵は、そのまま「新しい被害入口になった」とは解釈しない。双刃士などの rear assault は、戦線保持ではなく **短時間アクセスによる Kill 成立** として扱う。
座標・接敵側の具体ルールは [battle-field.md](battle-field.md) を正本とし、敵のデフォルト chase は敵の前方側にいる候補から Threat を選ぶ。背後侵入中のユニットは Threat 値を持っていても、その位置だけで敵の新しい追跡入口や前線所有者にはならない。同期間は `isPlayerRearAssaultAccess(player, { players, enemies })` により formation / overlap / march follow の基準からも除外する（敵 anchor 用の数値 overload とは別）。Threat / target / contact / frontline owner は攻撃・接近・表示・clamp の入力であり、Engaged 中の座標 snap 理由にはしない。背後侵入完了後の復帰は専用 move step ではなく、`battleX` が敵最前線より右に残っている間 `resolveApproachAttackBattleX` が後退を許可する通常 approach が正本。

### baseThreat（戦闘開始・前列圧力更新時）

```
statComponent = floor(maxHp × 0.1 + def × 2)
baseThreat = statComponent + frontRowPressureBonus
defender のみ baseThreat = floor(baseThreat × 1.2)
```

- `frontRowPressureBonus` — **前列**味方のみ。他前列の `1 - hp/maxHp` の最大値 × 自 statComponent（前列 Survival / `defender` UI ロールの基礎ヘイト上昇）
- `defender` ロール — `statComponent + frontRowPressureBonus` の合計に `× 1.2`（`floor`）を適用

### 変動と減衰

| イベント                      | 変化                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 与ダメ（actor）               | 味方 actor に `floor(damage × 0.5)` を加算（全ロール共通）                                                                             |
| 与ダメ burst（active effect） | 上記に加え `threatBurstFlat` / `floor(appliedDamage × threatBurstScale)` を加算（高火力 active 専用）                                  |
| 被ダメ（target）              | **共通ルールでは加算しない**。Defender 等は passive `threatControl` で明示                                                             |
| debuff 付与成功               | actor に `+15` 固定                                                                                                                    |
| 毎 tick                       | `threat > baseThreat` なら `threat -= 20 × deltaTime × threatDecayMultiplier`、下限 `baseThreat`（`threatDecayMultiplier` 未指定 = 1） |

**Threat 変動の原則:**

- Threat の変動は、原則として **敵へ圧力をかけた行動** によって発生させる
- 与ダメ、debuff 成功、高火力スキル使用などは Threat 上昇要因になりうる
- **被ダメージそのものを全ロール共通の Threat 上昇要因にはしない**
- 被弾による Threat 維持・上昇は Defender の役割差として扱い、passive `threatControl` または skill で明示する
- Guardian（`df_guardian_passive_2`）は main tank として被弾・ブロックで Threat を維持し、減衰も遅くする
- Paladin は `frontThreatFloor` / `frontThreatDecayMultiplier` で前列を sub-defender 化し、Lv0 では前列 block 付与で物理被害を抑える。前列被ダメ軽減は `threatControl` には含めず、必要なら `damageReduction` passive として分離する
- 剣術士（`at_warrior_active_1`）は `threatBurstScale` で burst 時のみ一時 overtaking する

### 敵ターゲット選定

`pickHighestThreatAlly`: 生存味方のうち射程内プールから `threat ?? baseThreat ?? 0` が最大の 1 体を選ぶ（決定論的）。同率タイは `battleX` が大きい方（前線側）→ `id` 辞書順。ヘイト 2 位以降が選ばれることはない。

`targetRuleOverride` 等で `distance/enemy/farthest`（または `nearest` + `moveAnchor`）に上書きされた場合は、敵 actor も使用者との `battleX` 距離で至近/最遠を選ぶ（ヘイトは使わない）。

### Threat とターゲット切替

Threat 値は毎 tick 再評価されうるが、敵の chase / attack target は単純な「その瞬間の最大値」へ常時即時切替する前提では扱わない。Defender の受け口維持と Fighter の瞬間的なヘイト奪取を両立するため、ターゲット切替には **閾値ヒステリシス** を適用する。

- 実装: `pickThreatTargetWithHysteresis`（`src/battle/threat.ts`）。敵 `CombatantState.threatFocusTargetId` に現在フォーカスを保持
- 切替条件: 新候補の threat が現フォーカスより **`THREAT_TARGET_SWITCH_MARGIN`（50）以上** 高いときのみ切替。フォーカス対象が死亡・プール外のときは即再選定
- `pickHighestThreatAlly` は threat 値そのものの決定論的比較用。敵 AI の chase / attack にはヒステリシス版を使用

## ステータス効果

対象ステ：`atk`, `def`, `reg`, `damageTaken`, `attackSpeed`（攻撃速度。基本攻撃 CD 回復倍率に適用）。`reg` の buff / debuff とも可。`buffFlatBonus` で固定加算可。

複数ステを異なる倍率/固定値で上げるパッシブ buff は `buffStatModifiers`（`{ stat, multiplier?, flatBonus? }[]`）を正本とする。1ステのみの場合は従来の `buffStat` + `buffMultiplier` / `buffFlatBonus` でも可（実装: `parseStatBuffModifiers`）。

**HUD バッジ表示（Phase 4d）:** 同一 `StatusDisplayCategory` あたり **1 バッジ**（**20×20px** スロット）。buff / debuff / passive buff / passive debuff 用の **五角形背景 PNG**（20×20、スロットと同一、`src/assets/status-icons/pentagon-buff.png`, `pentagon-debuff.png`, `pentagon-passive-buff.png`, `pentagon-passive-debuff.png`）を重ね、その上に効果アイコン（`{category}.png`、**12×12**、スロット内上下左右中央）を重ねる。効果アイコンの位置は buff / debuff 共通。五角形のみ **buff 系を Y − 2px**、**debuff 系は Y 0**（スロット基準。debuff 形状の視覚バランス用）。行の描画高さは **24px**（スロット 20 + 上下パディング 2px ずつ、buff 五角形のはみ出し用）。残時間の暗化はオフスクリーン合成後に **alpha > 0 のピクセルのみ**上端から暗化（透明部分は変更しない）。累積数は 20×20 スロット枠基準。`isPassive` 由来（`effect.id` が `passive_` 始まり）は passive 用五角形 PNG を使用。アイコン縁は黒で統一（stat 系 hp/atk/def/reg/attackSpeed は **tint なし・白シルエット**、その他は既存カラー PNG + 黒縁）。`stacks > 1`（または同一カテゴリ複数 instance）のときのみ右下に累積数（1 スタックは非表示）。残時間は同一カテゴリ内の最短 `remainingRatio` を上端からの暗化で表示。専用アイコン overlay: `basicAttackTransform` / `blockResonanceStance` / `invulnerable` / `lastStandGuts` / `arenaDominance` / `duelistPride`（`src/assets/status-icons/{category}.png`）。`herbalPotency` / `blockResonance` / `mark` / `arenaMark` / `wardBarrier` も 1 アイコン + 累積数（2 以上のみ）。`collectStatusEffectBadgeDisplays` はパッシブ由来の `herbalPotency` / `blockResonance` / `duelistPride` も表示する（`aggregateStatStatusEffects` の passive 除外は集計専用のまま）。`damageTaken` stat の net 軽減は `damageReduction`、net 増加は `damageIncrease` アイコン。`hp` stat buff/debuff は `hp.png`（`baseMaxHp` 基準）。

**簡易表示 vs 詳細表示:**

| 表示 | 場所 | ルール |
| ---- | ---- | ------ |
| **簡易（Party HUD）** | `PartyHudPanel` | 固定 **1 行・5 スロット幅**（最大 4 バッジ + 第 5 枠 `+N`）。クラス名・バッジ行はスロット全幅、24px クラスアイコンは HP/リキャスト行の左（下端揃え）。`overflowCount = max(0, badges.length − 4)` |
| **簡易（敵）** | `BattleCanvas` HP バー直上 | **14×14px** スロット（`FIELD_ENEMY_STATUS_BADGE_ICON_SIZE`）。累積数・`+N` は **12×12px 枠**・**1px** ビットマップアウトライン（`FIELD_ENEMY_STACK_LABEL_*`）。Party HUD 累積数は 20px 枠・2px アウトラインのまま。固定 **1 行・4 スロット幅**（最大 3 バッジ + 第 4 枠 `+N`）。HP バー top を anchor に `STATUS_BADGE_GAP` 分だけ上へ配置。**重なり時も位置調整しない**。`overflowCount = max(0, badges.length − 3)` |
| **詳細** | 戦闘詳細（`BattleStatsOverlay` / `DebugMenuPanel` 内 `PartyMemberStatsDisplay`） | **全件**表示。debuff / buff でラベル付き行を分け、パネル幅内で flex-wrap 折り返し |

いずれの簡易表示も折り返しなし。`+N` 枠が不要（overflow 0）のときは最終枠を空（透明スロットで幅固定）。

簡易表示の優先度（`assignCompactBadgeTier` → `sortBadgesForCompactView` → `selectCompactStatusBadges`）。同 tier 内は `STATUS_BADGE_SLOT_ORDER` 昇順:

| Tier | 対象 |
| ---- | ---- |
| 1 | CC debuff: `stun`, `moveLock`, `damageDelay` |
| 2 | DEF/REG debuff のみ（`category` が def/reg かつ `kind` debuff） |
| 3 | 継続ダメ・被ダメ悪化: `dot`, `bleed`, `poison`, `seedFlame`, `blazingFlame`（debuff）、`damageIncrease`（`kind` debuff のみ） |
| 4 | その他 debuff |
| 5 | buff（passive buff 含む: `blockResonance`, `herbalPotency`, `duelistPride` 等）。`damageReduction` buff も Tier 5 |

実装: `statusEffectDisplay.ts`（compact 選択）, `statusBadgeRenderer.ts`（`drawCompactStatusBadgeRow`, `drawStatusBadgeWrap`）, `StatusIconRegistry.ts`。エディタ確認: `editor.html` → 状態アイコン（HUD 同等 ×1）。詳細 UI は [battle-field.md §7](battle-field.md#7-戦闘中統計-ui)。

### 迎撃態勢（`blockResonance`）

実装: `src/battle/blockResonance.ts`

- passive effect `blockResonance`: 常時 block 率（`chance`）+ 物理直接ダメージの **block 成功** で専用 stack +1（`blockResonanceMaxStacks` 上限）
- stack ごとに自己 `damageTaken` 軽減（`blockResonanceDamageTakenPerStack`）。HUD overlay `blockResonance`（`displayName`: **防壁**、stacks 表示）
- `blockResonanceDecayIntervalSec` ごとに stack -1（`herbalPotency` 蓄積とは別タイマー）
- active `blockResonanceConsume`（城塞の構え）: 全 stack 消費 → overlay `blockResonanceStance`（持続 `blockResonanceStanceDurationBaseSec + n`）。`useDurationSec` も同秒数。態勢中 block 成功で半径内敵へ `blockResonanceOnBlockDamage` + knockback
- smart 発動条件: `fireConditions` に `{ kind: "blockResonanceStacks", min: 1 }`

### 無敵（overlay `invulnerable`）

実装: `src/battle/invulnerable.ts` / `src/battle/incomingDamageMitigation.ts`

- StatusEffect.overlay `invulnerable`: 付与中は直接ダメージ・DoT・`damageDelay` tick・counter 被弾・ward / barrier 消費を含め HP にダメージを入れない
- 付与時バトルイベント `invulnerable` → ポップアップ「無敵！」
- `lastStandInvulnerable` passive: 致死ダメージ確定直前に 1 回だけ発動（Wave 内 1 回、`resetPerWaveCombatantFlags` でリセット）→ ダメージ 0 + 3 秒 `invulnerable`

### 護身 block aura（`frontBlockAura`）

実装: `src/battle/frontBlockAura.ts`

- 生存中の持有者が `formationRow === front` の味方へ `overlay: block` を同期（`syncBuffAuras` とは別モジュール）
- P1 のみ: `chance` 0.10、物理直接ダメージのみ block
- P1 + P3（`frontBlockAuraMagicBlock: true`）: chance 合算 0.15、魔法直接ダメージも block 対象（軽減は上記魔法 block 定数）

### 不退転（`lastStandRecovery`）

実装: `src/battle/lastStandRecovery.ts` / `incomingDamageMitigation.ts`

- 致死ダメージ確定直前に Wave 1 回（HP 閾値なし）→ ダメージ 0 + `hp = maxHp × lastStandRecoveryHpRatio`（バリア不変）
- 自己: `damageTaken × lastStandRecoverySelfDamageTakenMultiplier` を `lastStandRecoveryDurationSec`
- 前列味方: `damageTaken × lastStandRecoveryFrontAllyDamageTakenMultiplier` を同秒数
- バトルイベント `lastStandRecovery` → ポップアップ「再起！」（鉄衛士 `invulnerable` の「無敵！」とは別）

### 闘技士 v1 専用メカニクス

実装: `duelistPride.ts` / `lowHpCover.ts` / `lastStandGuts.ts` / `bloodlustDuelist.ts` / `enemyReelIn.ts` / `arenaDominance.ts`

### 弩砲士 v1 専用メカニクス

実装: `idleAtkRamp.ts` / `nextOutgoingDamage.ts` / `ballistaMark.ts` / `targetHpRatioDamageScale.ts`

| effect / overlay           | 要点                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idleAtkRamp`              | 非攻撃経過で ATK 倍率蓄積（`resolvePowerAmount` の atkBased）。basic / active damage 発動でリセット。`useDurationSec` hold 中も tick 継続                                                                                     |
| `grantNextOutgoingDamage`  | active effect。`useDurationSec` 終了後に `nextOutgoingDamage` overlay を武装。次の outgoing damage 1 回に `nextOutgoingDamageMultiplier` を乗算して消費                                                                 |
| `ballistaMark`             | 高 Max HP 対象へ overlay。本人攻撃がマーク命中時、半径内の他敵へ実ダメ×`ballistaMarkSplashDamageScale`（DEF 再計算なし・`applyConfirmedHpDamage`）                                                                        |
| `targetHpRatioDamageScale` | 対象 `hp/maxHp` が高いほど与ダメ増（`targetHpRatioHealScale` の逆方向）                                                                                                                                                                                                                     |

| effect             | 要点                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lowHpCover`       | 味方 HP 割合 ≤ `coverHpRatioThreshold` の被ダメ適用先を闘技士へ差し替え（単体・AoE 各ヒット）。Wave 内 `coverWaveLimit` 回                                                                                                                                                                                                                                                                   |
| `duelistPride`     | 自身 `hp/maxHp` ≥ `prideHpRatioMin`（バリア非含有）のとき、受ける即時回復・HoT tick を `prideHealMultiplier` 倍（`arenaDominance` の味方支援拒否より弱い）                                                                                                                                                                                                                                   |
| `bloodlustDuelist` | block + 低 HP DEF（線形）/ ATK（`bloodlustAtkBuffCurveExponent` で指数カーブ、未指定=線形）                                                                                                                                                                                                                                                                                                  |
| `lastStandGuts`    | 致死直前 Wave 1 回 → HP 1 未満にならない状態を数秒（完全無敵ではない）。終了時生存敵全体に短 stun + KB。イベント `lastStandGuts` →「不屈！」                                                                                                                                                                                                                                                 |
| `enemyReelIn`      | 遠隔帯の敵（`attackType.ranged`）を対象に `battleX` を使用者 `traits.rangePx` の射程内へ即時引き寄せ（進軍下限整合）。effect の `range` はターゲットプール絞り込みのみで移動先には使わない。layout bake / camera / visual 補間ではなく [battle-field.md](battle-field.md) §4.4 の forced movement。移動量 0 のときは effect 未適用（イベント・ポップアップなし）。`df_duelist_active_1` は本 effect のみの引き寄せ専用スキル。`firePolicy: smart` では `minTargets` が先頭 `enemyReelIn` の対象数を参照 |
| `arenaDominance`   | `finalWaveStart` + `stageTriggerLimit: 1` で発動。15 秒間、敵単体攻撃ターゲットを闘技士固定（AoE / `targetRuleOverride` 除外）。最高 ATK 敵に **闘士の指名**（`arenaMark`）。指名対象は闘技士以外からの被ダメ −50%。闘技士はマーク以外の敵からの被ダメ −50%。効果中、闘技士は味方（自身以外）からの回復・バリア・HoT を受けない。指名は効果終了と同時に解除                                  |

`fireCondition` `finalWaveStart`: `waveIndex === stage.waves.length - 1` かつ Wave 開始フェーズ。

| 種別                  | 定義方法                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| buff                  | `effect: "buff"` + `buffStat` / `buffMultiplier` / `buffDurationSec`                                                                                                                                                                                                                                                                                                                                                                                       |
| 通常攻撃変形          | `effect: "basicAttackTransform"` + `buffDurationSec` 等 — バフ持続中のみ通常攻撃 effect を実行時マージ（下記）。付与対象は自身固定                                                                                                                                                                                                                                                                                                                         |
| 条件分岐              | `effect: "conditionalEffect"` + `conditions` / `thenEffects` / `elseEffects` — 戦況条件で branch effect を 1 系統だけ実行。branch 内 `conditionalEffect` の入れ子は不可。skill 直下 `fireConditions` は発動ゲート専用                                                                                                                                                                                                                                      |
| debuff                | `effect: "debuff"` + `debuffStat` / `debuffMultiplier` / `debuffDurationSec`                                                                                                                                                                                                                                                                                                                                                                               |
| スタン                | `effect: "stun"` + `durationSec`（**上限 5 秒**）— `StatusEffect.kind: "cc"`, `overlay: "stun"`。持続中は使用者としての通常攻撃・アクティブ発動・ターゲット選択不可。CD は停止しない                                                                                                                                                                                                                                                                       |
| 凍結 / 時間停止系拘束 | **未実装・予約概念**。CD 停止が必要な場合はスタンではなく別 `StatusEffect` として定義する。スタンとは別物で、Flow 系上位制御など時間進行そのものへ干渉する効果として個別仕様化する                                                                                                                                                                                                                                                                         |
| 反撃                  | `effect: "counter"` + `amount` / `durationSec` — `StatusEffect.overlay: "counter"`。バフ/デバフタグ対象外。詳細は下記                                                                                                                                                                                                                                                                                                                                      |
| デバフ解除            | `effect: "dispel"` — `dispelCount=0` で対象タグ全解除、`N>0` で `dispelPriority` に従い N 件（`longest` = 残り時間最長、`strongest` = 効果量最大。未指定は `longest`）。対象タグに `attackSpeed`（SPD デバフ）可。パッシブ `periodicDispel` は `stageStart` / `waveStart` / `onDebuffReceived` で `dispelTargetRule` + 形状・射程（接頭辞 `dispel`、[classes-and-skills.md](classes-and-skills.md)）で対象選択。`dispelTriggerLimit` = Wave 内発動回数上限 |
| ノックバック          | `effect: "knockback"` + `distancePx` — 各陣営の **後方** へ `battleX` を即時移動（プレイヤーは左 `-X`、敵は右 `+X`）。敵は進軍表示下限未満にならない。**付与成功時**に移動硬直 **1.5 秒**（`StatusEffect.overlay: "moveLock"`）。移動硬直中は接敵接近・スキル `move` を停止するが、通常攻撃・アクティブは可能。オートバトルにおける CC 評価原則は [design-philosophy.md](../design-philosophy.md) §8。詳細は [battle-field.md](battle-field.md) §4.4                                                                                                           |

**スタンと凍結の境界:** スタンは行動不能だけを扱い、CD 停止・時間停止・ゲージ停止を持たない。CD 停止を行うデバフが必要になった場合は、`freeze` など別状態として追加し、CD 進行停止対象（basic CD / active CD / イベントゲージ / DoT/HoT tick 等）を個別に定義する。

### 反撃（`counter`）

**攻撃**（`damage` / `dot` を含むスキル。通常攻撃含む）を受け、バリア吸収後の **実ダメージ > 0**、かつ **攻撃者が反撃の `range` 以内** のとき、反撃状態の持有者が `responses[]` の内容を **すべて** 攻撃者へ適用する。

| 項目          | 挙動                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 付与対象      | 常に自身（`target: self`）                                                                                                                                                             |
| 射程          | `resolveCounterRangePx(counter.range, 持有者)` — 未指定・`0` = 持有者 `traits.rangePx`。正の値は絶対 px。距離判定は `isWithinSkillRange`（`battleDistance <= effectiveRangePx`）で行う |
| 種別フィルタ  | `matchesCounterAttackRangeBand` → `isRangedAttack(attackRangePx)`。距離計算とは分離し、近接帯/遠隔帯の分類のみで使う                                                                   |
| レスポンス    | `damage` / `debuff` / `dot` / `stun` / `knockback` から 1 種別以上。被攻撃 1 回で選択種別を同時適用                                                                                    |
| トリガー      | 直接 `damage` および DoT tick                                                                                                                                                          |
| 非トリガー    | 回避・0 ダメージ・反撃ダメージ（連鎖反撃なし）・射程外                                                                                                                                 |
| `damage` 軽減 | 攻撃者の DEF（物理）/ REG（魔法）を適用。回避・ブロックは非適用                                                                                                                        |
| `targetShape` | `multiLock` 禁止                                                                                                                                                                       |

**確率反撃（パッシブ `counterChance`）：** 常時受付。上記と同じ被攻撃条件・射程・`responses` 内容だが、ヒットごとに `counterChance` を判定し、成功時に反撃内容を直接適用（`StatusEffect` 付与なし）。アクティブ `counter` とは独立に併用可。`counterTrigger` 未指定時は **自己被弾** が正本。

### 援護反撃（パッシブ `counter` + `counterTrigger: "frontAllyDamaged"`）

自分以外の **前列味方**（`formationRow: "front"`）が敵の攻撃で実ダメージ > 0 を受けたとき、援護パッシブ持有者が攻撃者へ `counterResponses` を適用する。Threat 操作・ターゲット override ではない。

| 項目       | 挙動                                                                 |
| ---------- | -------------------------------------------------------------------- |
| トリガー   | 味方被弾（前列のみ）。持有者本人の被弾では発火しない                 |
| 判定主体   | パーティ内の各味方ユニットが所持する `frontAllyDamaged` counter を評価 |
| 反撃者 ATK | 持有者の ATK を `counterResponses` の `damage` 量計算に使用        |
| 確率       | `chance`（例: 槍術士 P4 援護 = 0.25）                                |
| 射程・帯   | 自己被弾 counter と同じ（`counterRange` / `counterMelee` / `counterRanged`） |
| 非トリガー | 反撃ダメージ・後列味方被弾・0 ダメージ・射程外                       |

詳細なスキル枠は [classes-and-skills.md](classes-and-skills.md) §槍術士を正とする。

**重複（同一対象・同一 stat / CC）：**

- buff/debuff `multiplier` — 乗算
- buff/debuff `flatBonus` — 代数和（buff `+` / debuff `-`）
- buff/debuff / CC `remainingSec` — **長い方**を採用（短い効果は上書き）
- **DoT（`overlay: dot`）のみ例外** — 再付与時にマージせず StatusEffect を追加。各实例が独立 tick（累積）。stun 等の CC とは別扱い

### DoT 圧縮・延長・持続罠（狩猟士 Field Flow）

| 操作 | 対象 | 効果 |
| ---- | ---- | ---- |
| **dot 圧縮**（`dotCompress`） | 対象の全 dot（`dotCompressImmune` 除く） | 残り `durationSec` を `compressRatio` で短縮。tick 総ダメは `1/compressRatio` 方向に増幅。熾火（`dotFlavor: blazingFlame`）は圧縮対象外 |
| **dot 延長**（`dotExtend`） | 対象の全 dot | 残り duration / tick 予算を `extendRatio` で延長（新規 dot 付与ではない） |
| **placedField** | `clusterCenter` 配置 + 半径 | 進入時 `enterEffects`、滞在 tick で `stayEffects`。A3 は滞在ごとに圧縮比率 +0.05 累積 |
| **dotHarvest** | 単体 | 各 dot 残ダメの `harvestRatio` を即時結算（dot は消費しない） |
| **poisonSpread** | 単体の poison | 半径内他敵へ 50% duration で複製（v1: poison のみ） |
| **仕留め**（P4 aura） | hasDot かつ HP≤50% の敵 | 被ダメ×1.2。全味方の直接 damage / dot tick に反映 |
| **allyBasicAttackDotProc**（P2 毒の武器） | 命中した敵 | 味方 **物理 basic**（`slotKind: basic` かつ Hit の `damageType: physical`）`damage` 適用成功（`appliedDamage > 0`）時、`chance` で poison dot 付与。魔法 basic は対象外 |

視界妨害・命中干渉・フィールド端貫通は v1 対象外。

### 種火 / 熾火（魔術師 `at_sorcerer`）

実装: `src/battle/sorcererFlame.ts`。overlay は `dot` + `dotFlavor: seedFlame | blazingFlame`。

| 状態 | stack 上限 | DoT（1 stack / tick） | その他 |
| ---- | ---------- | --------------------- | ------ |
| **種火** | 5 | 付与者 ATK×0.05 magic / 10s（リフレッシュ） | max 到達で熾火 +1 へ変換。熾火が上限なら種火は max のまま据え置き |
| **熾火** | P4 未習得: 1 / P4 後: 無制限 | 付与者 ATK×0.35 magic / tick | 被**魔法**ダメ +10%/stack（`damageTaken` stat とは分離）。`dotCompressImmune` |

**active Hit のみ**（`slotKind: active`）で P2/P3/P4 が発動。basic では種火付与・連なる炎・花開く炎は走らない。

| 枠 | passive / active | 発火 |
| ---- | ---------------- | ---- |
| P2 焼き尽くす熾火 | `seedFlameOnActiveHit` | active damage Hit ごとに種火 +1 |
| P3 連なる炎 | `bonusActiveOnHit` + `bonusActiveSkillId` | active Hit 後 `at_sorcerer_active_1` を CD 消費なし追撃。追撃から P3 は再帰しない |
| P4 花開く炎 | `blazingFlameDetonate` | 熾火≥1 の対象へ active Hit ごとに起爆: 種火全消費 → 熾火 -1 → 爆発 `(ATK + 消費種火×N)×1.3`（N 仮 = ATK×0.5）→ 対象 + 半径 50px 内へ種火 +1 |
| A4 燎原 | `targetShape: poolEach` + `debuffTags: [seedFlame]` | 種火 overlay 敵各 1 回 magic single |

multiLock × P3 × P4 の複数 Hit ごとに P2/P3/P4 は意図通り独立発火する。

### 通常攻撃変形（`basicAttackTransform`）

アクティブ effect の `type: "basicAttackTransform"`。自身へ付与し、**バフ持続中のみ**通常攻撃（`slotKind: basic`）の effect を実行時にマージする。

| 項目                    | 挙動                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 有効期間                | `buffDurationSec`（`remainingSec` 減衰）。**use lock / presentation lock 中は通常攻撃停止**（既存仕様）。lock 解除後〜バフ切れまで変形 |
| スタック                | 複数付与時は **最新 1 件のみ**有効                                                                                                     |
| `hitCountMultiplier`    | 既存 primary effect の `hitCount`（未指定 = 1）に乗算                                                                                  |
| `primaryEffectOverride` | primary（先頭 non-move effect）を丸ごと差し替え                                                                                        |
| `primaryPatch`          | primary への部分上書き（`damageType` / `amount.atkScale` / `hitCount` / `hitDurationSec` 等）                                                                          |
| `appendEffects`         | primary の後に effect を追加（例: ダメージ + 自分中心 AoE heal）                                                                       |
| `basicAttackCount`      | 変形後も **damage ヒットのみ**充填。heal 化すると充填停止                                                                              |

毎 tick：`remainingSec -= deltaTime`、0 以下で除去。

### 追加通常攻撃（`bonusBasicAttackOnHit`）

パッシブ `effect: "bonusBasicAttackOnHit"`。通常攻撃（`slotKind: basic`）の **damage Hit 適用後**、ゲート条件を満たせば `chance`（未指定 0.5）で **同一 basic effect を 1 Hit 追加**。追加 Hit も `basicAttackCount` を充填する。`suppressBonusBasicAttack` フラグ付き pending Hit から再帰発火しない。evasion / block / DR は追加しない（通常攻撃と同じ effect 再実行のみ）。

**ゲート条件（AND）:**

| フィールド | 説明 |
| ---------- | ---- |
| `bonusBasicAttackConditions[]` | 任意。非空なら全条件を AND 評価（`DamageIncreaseCondition` と同型。`debuff` / `targetHp` / `attackType`） |
| `bonusBasicAttackHpRatio` | 任意。明示時は `hp/maxHp <= ratio` も要求 |

**HP ゲート省略規則:** `bonusBasicAttackConditions` のみで `bonusBasicAttackHpRatio` を省略した場合は HP ゲートをスキップ（例: 弓術士 P4 二の矢）。conditions も HP も省略時は従来どおり `bonusBasicAttackHpRatio` 未指定 = 0.3（双刃士 P4 無慈悲な刃）。

### 追撃モード（`buffSubKind: "allyAttackFollowUp"`）

アクティブ effect。自身へ overlay `allyAttackFollowUp`（表示名例: 追撃モード）を付与し、持続中のみ近傍味方の通常攻撃を監視して追撃する。槍術士 A4（`at_lancer_active_4`）が正本。

| 項目 | 挙動 |
| ---- | ---- |
| 付与 | `buffDurationSec`（Phase 8 仮値可）。`allyFollowUpRadiusPx`（未指定 **70**）を overlay にコピー |
| 監視対象 | 槍術士から `battleX` 距離 ≤ `allyFollowUpRadiusPx` の味方（**使用者自身は除外**） |
| トリガー | 対象味方の **basic**（`slotKind: basic`）`damage` 適用成功（`appliedDamage > 0`）。active は v1 対象外 |
| 追撃内容 | 槍術士が **通常攻撃（basic）を 1 回**、**味方と同じターゲット**へ実行（`pendingHitQueue`） |
| 頻度 | 味方 1 攻撃につき最大 1 回（chance なし） |
| 非再帰 | 追撃由来 basic は `suppressAllyAttackFollowUp` 付き pending Hit とし、再度追撃を発火しない |
| DEF debuff | 追撃モード中、槍術士自身の basic（追撃含む）が敵に `appliedDamage > 0` で命中した相手へ DEF stat debuff。倍率 `followUpDefDebuffMultiplier`（未指定 **0.95**）、持続 `followUpDefDebuffDurationSec`（未指定 5 秒） |

`knockback` は A2 崩勢へ移管済み。A4 には含めない。

## ターゲット解決

1. effect のターゲット陣営（`spec.side` 等）と一致する `targetRuleOverrideApplyTo` を持つパッシブのみ `targetRuleOverride` を適用（`kind: self` は除外。配列の後ろが優先）。通常攻撃・接近は敵向けスコープ
2. スキル `range`（未指定 = 使用者射程）で **攻撃可能プール** を絞り込み
3. 各 effect の `targetShape` に従い **発動 tick で全 hit を一括解決**（`resolveEffectResolution`）
4. **スキル共通ターゲット:** `ActiveSkillDef` 直下の target / 形状を継承する effect は、merged targeting key ごとに発動 tick で命中集合を 1 回ロックし、同一キーの effect 間で再抽選しない（[classes-and-skills.md](classes-and-skills.md) §アクティブスキル共通ターゲット）
5. `applyFrame` 指定時は **適用のみ遅延**（body は `skillWindup` で即再生、ダメージ等は pending キュー）。`hitCount >= 2` の `hitDurationSec` 分散は 1 ヒット目を `applyFrame` 基準に加算
6. `scatter` / `pierce`（`pierceDurationSec` あり）/ `chain`（2 体以上命中時、既定または `chainDurationSec`）は `pendingHitQueue` で **適用のみ時間分散**（再ターゲットなし）
7. **`poolFromEffectIndex`:** 同一スキル発動 tick 内で、先行 effect の命中プールを後続 `stat` target の候補に制限（[classes-and-skills.md](classes-and-skills.md) §同一スキル内の先行 effect プール）

**常時パッシブの再評価:** `periodicTrigger` 省略のパッシブは、対象を一度固定して終わりにはしない。対象が自分以外で、位置移動や新規侵入によって範囲内外が変わるものは、戦闘中に定期的に再評価して対象集合を同期する。

`distance` の `order: selfOrigin` は「使用者自身を起点にした範囲」を表す。`side: ally` では使用者自身も対象に含め、`side: enemy` では使用者自身を含めない。

| 形状        | 挙動                                                                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `single`    | 攻撃可能プールから 1 体。`hitCount >= 2` なら同一対象へ N 回（`hitDurationSec` で分散）                                                                                                                                                                                                    |
| `aoe`       | anchor + 半径内全員。`hitCount >= 2` なら同一範囲へ N 回（`hitDurationSec` で分散）。`selfOrigin` + ally heal / hot の **発動保留** は PHT が半径内かで判定（§回復 PHT）。命中は足元半径内の全負傷味方（形状は JSON どおり） |
| `multiLock` | `targetRule` で並べた攻撃可能プールへ `hitCount` 回ラウンドロビン（複数対象。1 体のみなら同一 ID 連打）。味方 HP 割合最低（`order: ratio`）のとき満タン味方はプールから除外                                                                                                                |
| `pierce`    | **`order: selfOrigin` 必須**。使用者の向き（味方 +X / 敵 −X）へ `range` px の前方セグメント内を手前 → 奥に命中。`piercePowerStepMultiplier` で威力減衰、`pierceDurationSec` で適用分散可。敵向け pierce 通常攻撃の接近停止は [battle-field.md](battle-field.md) §4.4 を正本とする                                                                                                   |
| `chain`     | anchor から同陣営へ距離内で連鎖。直前 hop と同じユニットには飛ばない。範囲内に未命中がいれば最も近い未命中を優先（全員命中済みなら再訪問可）。`chainPowerStepMultiplier` で威力減衰、`chainDurationSec`（未指定時 `0.15×chainCount+0.5` 秒）で **スキル発動から最終命中まで** の総時間分散 |

`chain` の各跳は `chainDurationSec ÷ 跳数` 秒間隔で **ダメージ適用と同時** に `playSkillHitFeedback` で hit VFX を出す。hit は effect **`hitVfx`**（`_vfx_hit` PNG があれば JSON 省略可）を優先し、未設定時は main **`vfx`** を target placement でフォールバック。main VFX（`vfx`、actor placement）は **1 跳目のみ**（`skipMainVfx` で 2 跳目以降は hit のみ）。
| `scatter` | 乱打（`scatterSpreadRadiusPx` で着弾分散、`scatterRadiusPx` で命中判定、`scatterDurationSec` で適用分散） |

プール：プレイヤー actor → 敵、敵 actor → プレイヤー（実装移行中は `ally` 表記の残存あり）。heal / buff 向け `mostDamagedAlly` 等も anchor として同じ形状を利用。

## 座標・移動・戦闘フェーズ

横 1 軸のバトルライン、座標層（`battleX` 正本 / `visualX` snapshot 互換 / `screenX = battleX`）、Wave・`spawnX`、隊形スロット、接敵トリガー、BattlePhase FSM、生死表示は **[battle-field.md](battle-field.md)** を正本とする。

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
2. `move` は `moveDurationSec` で `battleX` を線形補間（`visualX` は snapshot 互換ミラー。layout とは分離 — battle-field.md §4.5）
3. 次の effect の `applyAt` = 直前 move 完了時刻（move 連続時は累積）
4. 全 step 完了後に CD リセット（途中キャンセルは死亡時のみ）

例（奇襲帰還）: `move farthestEnemy` → `damage` → `move closestPlayer (toAnchor)`

### 戦闘フロー（座標要約）

1. プレイヤー隊列を後方に配置、敵 Wave を前方（`spawnX`）から deploy — [battle-field.md](battle-field.md) §3–§4
2. PartyDeploy 到達 + Wave 告知 fade-out 条件で **Engaged**。接敵開始時に layout bake せず、自動接近で距離を詰める
3. 接近は全ロール共通で `ChaseTarget → standoff battleX → AttackTarget`。defender 専用の contact 接近経路は持たない
4. **非接敵中**も DoT/HoT tick・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は接敵中のみ（[battle-field.md](battle-field.md) §4.6）
5. 毎 tick（接敵中）：プレイヤー行動 → 敵行動
6. 敵全滅 → **Victory**；プレイヤー全滅 → **Defeat**
7. 3 秒後：HP 全回復、同一ステージ再スポーン、`Running` 再開

死亡ユニットはターゲット対象外。次の再スポーンまで death アニメ。Wave 跨ぎの生死表示は battle-field.md §3.4。

## Combat Feedback（VFX なし・v1）

設計思想・3 層分離の正本は [combat-architecture.md](../combat-architecture.md) §8。実装: `src/render/DamagePopup.ts`, `CombatReactionPopup.ts`, `BattleView.ts`, `skillPresentation.ts`。

**前提:** 本番 VFX PNG 未投入（Phase 5a–5c / 7）。popup と HUD がスキル・パッシブ検証の主要手段。本番 VFX 投入後、Event Popup の一部は専用 VFX で省略しうる（Damage 数値 popup は別判断）。

### 3 層

| 層 | 内容 | 実装 |
| --- | --- | --- |
| HUD | HP / バリア tier / 状態バッジ（パッシブ overlay 含む） | `PartyHudPanel`, `BattleCanvas` 頭上バッジ |
| Damage Popup | damage / heal / dot の**確定数値のみ** | `DamagePopupManager` |
| Event Popup | 瞬間イベントの短いラベル | `CombatReactionPopupManager` |

HUD 情報は原則 popup しない。スキル名・ダメージ内訳・Barrier 吸収量は Damage Popup に載せない。

### Damage Popup

| kind | 色（theme） | 主な経路 |
| --- | --- | --- |
| `damage` | 白 | skill `damage` → `playSkillHitFeedback` |
| `heal` | 緑 | 即時 heal、HoT tick、`excessHealRedirect` 転送先 |
| `dot`（`dotFlavor` 未指定 / `bleed`） | 赤 | skill / status `dot` tick |
| `dot`（`dotFlavor: poison`） | 紫（`--popup-poison-dot-fill` `#9933ff`） | skill / status `dot` tick |

DoT フレーバーは HUD バッジ（`bleed` / `poison` / 汎用 `dot` アイコン）と独立。毒 tick の数字色のみ紫とし、debuff 五角形背景は赤のまま。

### Event Popup（v1 対象）

| 表示 | 発火 |
| --- | --- |
| 回避！ | `BattleEvent` `evade` |
| ブロック！ | `block` |
| 反撃！ | skill `counter` |
| 無敵！ | `invulnerable` |
| 再起！ | `lastStandRecovery` |
| 不屈！ | `lastStandGuts` |
| 引き寄せ！ | skill `enemyReelIn` |
| ノックバック！ | knockback 系 |

**v1 対象外:** Redirect! / Barrier Break! / Execute! / Armor Break! — 理由は architecture §8.3。

### popup なしで足りるもの

| 現象 | フィードバック |
| --- | --- |
| バリア付与 | HUD バー tier 変化 + VFX（あれば）。console log（確認モード） |
| buff / debuff 付与 | `showBuffGlow` + HUD バッジ |
| HoT 付与（初回） | buff glow。tick から heal 数値 popup |

### 確認モード（popup 外）

console log（`pushLog`、画面上のログ UI なし）、[統計オーバーレイ](battle-field.md#7-戦闘中統計-ui)、battleX debug — [battle-field.md](battle-field.md) §2.3。

Phase 5d 残タスク: [phase-roadmap.md](../plans/phase-roadmap.md) §5d（レイアウト regression、HUD 境界確認）。

## 演出（render 層）

VFX パラメータ調整・プレビューは **Phase 6 演出調整ツール**（`presentation-lab.html`）。戦闘描画は **PNG strip 経路**（`BattleCanvas.playSkillVfx` → `VfxPlaybackManager`）— パイプラインは Phase 7 基盤済、本番 PNG 投入は未完了（[phase-roadmap.md](../plans/phase-roadmap.md) Phase 7）。

**body アセット:** entity は `sheets/bodies/{id}.png`（idle/move/death）。攻撃 body は **全スキル strip**（64×48、`{id}_basic_attack` 含む）。詳細は [classes-and-skills.md](classes-and-skills.md#スプライト演出アセット)。

| イベント                 | 演出                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| ダメージ（通常攻撃含む） | skill strip（あれば）+ VFX + ダメージポップアップ。`applyFrame` あり時は strip を先に再生し VFX・ポップアップは apply コマ |
| ダメージ（active）       | skill strip + VFX                                                                                                          |
| 回復                     | skill strip または VFX + 緑数値ポップアップ（Event ラベルなし）                                                            |
| バリア付与               | skill strip または VFX + HUD バー tier（数値・Event popup なし）                                                           |
| buff / debuff            | 対象の白い光（約 0.8 秒）+ HUD バッジ                                                                                      |
| 回避 / block / 反撃等    | Event ポップアップ（上記 Combat Feedback §）                                                                               |
| スタン（CC）             | オーバーレイ `stun`                                                                                                        |
| 死亡                     | entity death 行（body atlas）                                                                                              |

**VFX 再生（`playSkillHitFeedback`）:** `skill` イベントごとに main（actor placement・1 跳目のみ）と hit（target placement・`hitVfx` 未指定時は `vfx` フォールバック）を PNG strip で再生。`scatter` / `chain` / `hitCount` 分散時は各適用タイミングで hit VFX を独立インスタンスとして重ね表示可。

ロジックは `BattleEvent` を発火；`BattleView` が `BattleCanvas` を駆動。`render/` に戦闘ルールは置かない。
