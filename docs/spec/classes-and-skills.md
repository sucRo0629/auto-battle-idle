# クラスとスキル

ゲームデータは `data/*.json`。型とローダー：`src/battle/types.ts`, `loadGameData.ts`

**スキルマスタ：** `data/classes.json`（15 一次職）と `data/skills.json`（共有パッシブ 21 + クラス別 basic/active）が本番マスタ。数値バランスは調整対象だが、ID・形状・パッシブ種別はこの仕様に従う。

## 用語（スキル vs 装備）

将来のアイテム装備と紛らわしくならないよう、**スキル枠への割り当ては「セット」で統一**する。

| 日本語 | 意味 | コード上のフィールド（例） |
|--------|------|---------------------------|
| **セット** | 習得済みアクティブを戦闘用スロットに割り当てること | `equippedActiveSlots`（セット済みスキル ID の配列） |
| **セット枠** / **アクティブ枠** | セット可能なアクティブ用スロット（Phase 1〜2: 1、Phase 3+: 最大2） | 同上 |
| **習得** | LvUP 等で `learnedActiveIds` に追加されること（プールへの加入） | `learnedActiveIds` |
| **装備** | **将来**のアイテム・武器防具など（現フェーズのスコープ外） | — |

- UI・仕様書・コメントでは「スキルを装備」ではなく「スキルをセット」「セット枠」と書く。
- JSON / TypeScript の `equippedActiveSlots` 等は歴史的な識別子として維持（中身は「セット済み」）。

### 戦闘用語

| 用語 | 定義 |
|------|------|
| **攻撃** | `damage` または `dot` を含むスキル（通常攻撃 `slotKind: basic` 含む） |
| **反撃** | 攻撃を受けたとき、設定量のダメージを攻撃者へ返す効果。バフ/デバフタグには含めない |

## ロール（3種）

| ロール | 役割 |
|--------|------|
| `defender` | 前列タンク + 軽い支援（buff/heal 可） |
| `attacker` | ダメージディーラー（近接/遠隔はクラス traits で決定） |
| `supporter` | 回復・支援（中列/後列が典型） |

`classId` 命名：`{rolePrefix}_{englishSlug}`

| プレフィックス | ロール |
|----------------|--------|
| `df_` | `defender` |
| `at_` | `attacker` |
| `sp_` | `supporter` |

例：`df_guardian`, `at_ranger`, `sp_cleric`

## 職階（一次職 / 二次職）

| 職階 | `jobTier` | 現状 | Phase 7 以降 |
|------|-----------|------|--------------|
| **一次職** | `1` | プレイ可能 15 種（下表） | 転職元 |
| **二次職** | `2` | 未定義（JSON 予約のみ） | 一定 Lv で一次職から**複数候補へ分化** |

転職条件・候補は `classes.json` の `promotion`（Phase 7 で本番化）。現フェーズでは転職ロジックは実装しない。

### 一次職マスタ（15 種）

表示名の英語肩書きは `epithetEn`、一行フレーバーは `flavorJa`（UI 表示は Phase 3c 以降。データのみ先行投入）。

#### defender（`df_`）

| classId | 表示名 | epithetEn | 列 | 射程 | パッシブ | アクティブ |
|---------|--------|-----------|-----|------|----------|------------|
| `df_guardian` | 鉄衛士 | Guardian | front | 近接 | 最高 ATK 狙い | シールドバッシュ（ダメ+スタン）／威圧 |
| `df_paladin` | 護法士 | Paladin | front | 近接 | 被ダメ 12% 即時回復 | 手当／聖盾 |
| `df_duelist` | 闘技士 | Gladiator | front | 近接 | 低 HP 火力 | 砂かけ（debuff+スタン）／隙撃ち |

#### attacker（`at_`）

| classId | 表示名 | epithetEn | 列 | 射程 | パッシブ | アクティブ |
|---------|--------|-----------|-----|------|----------|------------|
| `at_warrior` | 剣術士 | Swordsman | front | 近接 | — | 剣閃（4 通常後・atk×2.1）／薙ぎ払い |
| `at_assassin` | 双短剣 | Assassin | front | 近接 | 最低 HP 狙い + 回避 | 背刺（背後+連打）／仕留め |
| `at_lancer` | 槍術士 | Lancer | front | 近接 | 最高 HP 狙い | 貫突／突き刺し |
| `at_ranger` | 弓術士 | Ranger | back | 遠隔物理 | 遠隔攻撃中敵優先 | 速射（4 通常後）／貫矢 |
| `at_sniper` | 狙撃士 | Sniper | back | 遠隔物理 | 最遠敵優先 | 精密射／貫通矢 |
| `at_hunter` | 狩猟士 | Hunter | back | 遠隔物理 | 自 DoT 対象ボーナス | 毒罠（scatter+DoT）／拘束罠（scatter+スタン+debuff） |
| `at_sorcerer` | 魔術士 | Sorcerer | back | 遠隔魔法 | 最低 REG 狙い | 魔弾／集中砲 |
| `at_enchanter` | 符術士 | Enchanter | back | 遠隔魔法 | 最低 DEF 狙い | 連符（chain）／爆符 |
| `at_geomancer` | 法陣師 | Geomancer | back | 遠隔魔法 | 密集時 AoE ボーナス | 大法陣／小法陣 |

#### supporter（`sp_`）

| classId | 表示名 | epithetEn | 列 | 射程 | パッシブ | アクティブ |
|---------|--------|-----------|-----|------|----------|------------|
| `sp_cleric` | 療養師 | Cleric | front | 近接 | なし | 癒しの手／鼓舞 |
| `sp_abjurer` | 結界師 | Abjurer | middle | 近接 | 回復時バリア付与 | 結界／弱体符 |
| `sp_alchemist` | 薬草師 | Alchemist | middle | 近接 | 弱 HoT + 自 debuff 延長 | 攻性薬／毒霧 |

### デモ編成（`parties.json` demo）

| 枠 | classId | 表示名 |
|----|---------|--------|
| 1 | `df_guardian` | 鉄衛士 |
| 2 | `at_warrior` | 剣術士 |
| 3 | `sp_cleric` | 療養師 |
| 4 | `at_ranger` | 弓術士 |

未編成の残り 11 クラスは `DEFAULT_ROSTER_EXTRAS.demo` でアンロック（編成画面から選択可）。

## 配置

`formationRow` で列を決定：`front` → `middle` → `back`（左＝敵側）。

同一列内の横並び順はパーティ **配列順**。

味方の heal / move 向け `closestAlly` は **battleX 距離**が最小の味方。敵の `closestAlly` は **ヘイト加重抽選**（[combat.md](combat.md) の Threat 節）。

### EntityTraits（PC・敵共通）

`classes.json` / `enemies.json` の `traits`（省略可。ロード時に正規化）:

| フィールド | 省略時 |
|------------|--------|
| `rangePx` | `0`（近接帯 0〜24。25 以上 = 遠隔帯） |
| `damageType` | `physical` |
| `basicAttackVfx` | `deriveBasicAttackVfxFromTraits()`（magic→orb / physical+rangePx≥25→arrow / それ以外→slash） |

`basicAttackSkillId` は省略可（`{entityId}_basic_attack`）。通常攻撃スキルはロード時に合成。`skills.json` に同名 ID があれば `name` / `atkScale` / `interval` 等のみ上書き可（`range` / `damageType` / `vfx` は traits 正）。

### 射程

| スキル種別 | `effect.range` |
|------------|----------------|
| **通常攻撃**（合成 basic） | effect に書かない（`actor.traits.rangePx`） |
| アクティブ等 | 任意。省略時 = `actor.traits.rangePx` |

`traits.rangePx >= 25` で遠隔攻撃（`rangedAttackingEnemy`）。`0〜24` は近接帯（slash VFX、停止位置は §battle-field 2.5）。`traits.damageType === 'magic'` で `magicAttackingEnemy`。

**一次職 `rangePx`（参考）：** 双短剣/闘技 0、鉄衛/護法 5、剣術 8、槍術 24、魔法 30、物理レンジ 40。

## クラスステータスと成長（Phase 4）

`classes.json` の `ClassPreset` に加え、一次職は次を定義する。

```typescript
type GrowthTier = 1 | 2 | 3; // UI: 低 / 中 / 高

interface GrowthTierSet {
  maxHp: GrowthTier;
  atk: GrowthTier;
  def: GrowthTier;
}

// ClassPreset（抜粋）
maxHp: number;   // Lv1
atk: number;
def: number;
reg: number;     // 固定（成長なし）。許容値: 0, 5, 10, 15, 20
growthTier: GrowthTierSet;
growthPresetKey?: "attacker" | "caster"; // 魔術系（at_sorcerer 等）の成長合成
attackSpeedTier?: AttackSpeedTier;       // 未指定 = normal
epithetEn?: string;   // 英語肩書き（UI 未接続）
flavorJa?: string;    // 一行フレーバー
passiveIds?: string[]; // クラス固有パッシブ（skills.json passives への参照）
```

- 成長の実数解決・`growthPresets` 表・術師合成ルール → [stats.md](stats.md)
- 開発 GUI（`ClassEditorStep`）で Lv1 / 成長段階 / SPD を編集可能

## スキル枠

| 枠 | 数 | 出所 | UI |
|----|-----|------|-----|
| **basic** | 1 | `ClassPreset.basicAttackSkillId` | 非表示 |
| **passive** | 0〜複数 | `ClassPreset.passiveIds` → `learnedPassiveIds` に自動反映 | 将来 |
| **active** | 最大 2 | `build.equippedActiveSlots[]` | HUD リキャストバー |

- 基本攻撃も `skills.json` の `actives` に定義し、`slotKind: 'basic'` で実行。
- 基本攻撃 ID をセット枠（`equippedActiveSlots`）に入れない。
- 15 一次職は Lv0 でアクティブ 2 種を習得（`skills[].level: 0` に 2 ID）。戦闘エンジンは最大 2 枠を処理する。

### LvUP 習得データ

- `classes.json` の `skills[]` にレベル別 `skillIds` を定義（**passive ID は `passiveIds` のみ**。`skills[]` に入れない）。
- `passiveIds` は Lv に関係なく常時有効（`resolveLearnedSkills` が `learnedPassiveIds` へ展開）。

## ビルドルール

```typescript
interface CharacterBuild {
  learnedPassiveIds: string[];   // すべて同時発動
  learnedActiveIds: string[];    // 習得プール（Phase 3+ で LvUP 時に増加）
  equippedActiveSlots: string[]; // セット済みアクティブ。Phase 7 まで標準は長さ1相当（配列は最大2に正規化）
}
```

- **パッシブ：** `learnedPassiveIds` の全 ID が同時に有効（枠上限なし）
- **アクティブ：** セット枠に入っているスキルのみ、発動条件を満たしたときに自動発動

### アクティブの発動条件（`trigger`）

| フィールド | 説明 |
|------------|------|
| `trigger.kind` | `time`（秒）／`basicAttackCount`（通常攻撃回数）／`hitsTaken`（被攻撃回数） |
| `trigger.value` | 条件の閾値 N。ステージ開始時 `remaining = N`（ゲージ未充填）。カウントトリガーは N 回のイベントで `remaining === 0`（ゲージ Max）となり、N+1 回目で発動・`remaining = N` にリセット。時間トリガーは 0 到達で即発動 |
| `useDurationSec` | optional。発動硬直（秒）。省略 / `0` = 即時。アニメ長に合わせて設定（詳細は [combat.md](combat.md)） |

- `basicAttackCount` — ステージ開始時 `remaining = value`（未充填）。**通常攻撃が命中するたび** `remaining--`（`remaining > 0` のとき）。N 回目でゲージ Max（発動せず）、**N+1 回目の通常攻撃枠でアクティブ発動**（通常攻撃の代わり）
- `hitsTaken` — 被ダメ（`hurt`）のたび `remaining--`（`remaining > 0` のとき）。N 回目でゲージ Max（発動せず）、**N+1 回目の被弾でアクティブ発動**（ダメージは通常通り）
- **通常攻撃** は従来どおり JSON の `interval`（時間のみ）+ `attackSpeedTier` / SPD
- レガシー JSON の `interval` はアクティブでも `trigger: { kind: "time", value: interval }` として読み込む

```json
{
  "id": "at_warrior_active_1",
  "trigger": { "kind": "basicAttackCount", "value": 4 },
  "effect": [ ... ]
}
```

### スキルアイコン（`iconKey`）

`passives[]` / `actives[]` の各エントリに optional で指定。PNG は `src/assets/skill-icons/{iconKey}.png`。

| 優先 | 未指定時の表示 |
|------|----------------|
| 1. `iconKey` | カスタム PNG（glob 自動登録） |
| 2. `allowedClassIds[0]` | 該当クラスの role / `attackRange` プレースホルダ |
| 3. UI コンテキストの所属クラス | 同上 |
| 4. `id` の role プレフィックス（`df_*` / `at_*` / `sp_*`、レガシー `defender_*` 等） | 同上 |
| 5. 上記いずれも不可 | `supporter_placeholder` |

### パッシブ効果（`PassiveEffectKind`）

共有パッシブは `skills.json` の `passives[]` に定義し、クラスは `passiveIds` で参照する。

| effect | 主なフィールド | 挙動 |
|--------|----------------|------|
| `targetRuleOverride` | `targetRuleOverride` | 味方の攻撃 anchor ルールを上書き（複数時は配列の後ろ優先） |
| `evasionChance` | `evasionChance` | 被ダメ回避率（加算、上限 1）。**直接 `damage` の物理/魔法両方**（DoT 非対象） |
| `block` | `blockChance` | 物理直接ダメージを確率で軽減（加算、上限 1）。軽減量 = `floor(dmg × min(1, 0.25 + effectiveAtk/100))` |
| `damageIncrease` | `damageIncrease` | 条件付き特効ダメ倍率（`damage` / `heal` / `dot` でも effect 単位で指定可。`heal` は直接回復のみ、HoT 非対象） |
| `damageReduction` | `damageReductionPercent`, `damageReductionTargetRule` | 対象に常時被ダメ軽減を付与（戦闘開始時同期） |
| `defenseIgnore` | `defenseIgnore` | 与ダメ時の DEF / REG 無視（`damage` / `dot` でも effect 単位で指定可） |
| `periodicDispel` | `intervalSec`, `dispelTargetRule`, `dispelCount`, `dispelTags?` | 一定間隔でデバフ解除 |
| `aoeCrowdBonus` | `perExtraTargetScale`, `maxExtraTargets` | `aoe` / `scatter` の追加ヒット数ボーナス |
| `damageTakenToHeal` | `ratio` | HP に入った最終ダメージの `ratio` 割合を即時回復（バリア吸収後。ATK 基準ではない） |
| `hot` | `hotAmount`, `hotTargetRule`, `intervalSec?`, `hotDurationSec?` | `intervalSec` 指定時はその間隔で HoT 付与。未指定時は戦闘開始時に常時 HoT。`hotDurationSec` は付与 HoT の持続（0=無限） |
| `excessHealToBarrier` | `barrierScale`, `excessHealSources?` | 回復が maxHp を超過した分をバリアに変換（**上書き**）。`outgoing`（与回復）/ `incoming`（被回復）を複数選択可。未指定 = `outgoing` のみ。直接 `heal` のみ |
| `healReceivedIncrease` | `percent` | 受ける `heal` / HoT 量を `floor(量 × (1 + percent合算))` で増加 |
| `extendSelfAppliedDebuff` | `extendSec`, `durationMultiplier?` | 使用者が付与する debuff 持続延長 |
| `counterChance` | `counterChance`, `counterResponses[]`, `counterRange?` | 常時受付。被攻撃のたびに確率判定し、成功時に反撃内容を直接適用（`counterResponses` = `responses` 相当） |
| `selfHpRatioBuff` | `buffStat`, `buffMultiplierMax?` / `buffFlatBonusMax?`, `maxBuffAtHpRatio` | 自身 HP 割合（`hp/maxHp`。バリア非含有）に応じた常時バフ（対象・形状は自身単体固定）。満タン時は中立、指定 HP 割合以下で最大 |

**移行（削除済み）:** `selfLowHpDamageScale` → `selfHpRatioBuff`、`damageVsDotTarget` → `damageIncrease`（`debuff` + `dot`）、`healAppliesBarrier` → `excessHealToBarrier`、`damageIncrease` の `selfHp` 条件 → `selfHpRatioBuff`

### 特効ダメージ（`DamageIncreaseSpec`）

| フィールド | 説明 |
|------------|------|
| `scale` | 条件成立時の倍率 |
| `conditions[]` | 全条件 **AND**。種別: `debuff` / `targetHp` |
| `debuff.tags` | デバフタグ（OR）。`DEBUFF_FILTER_TAGS` 参照 |
| `debuff.selfAppliedOnly` | DoT 等で自分付与のみ |
| `targetHp.maxHpRatio` | 対象 `hp/maxHp ≤ ratio`（バリア非含有） |

### 防御無視（`DefenseIgnoreSpec`）

| フィールド | 説明 |
|------------|------|
| `def.mode` | `flat` / `percent` |
| `def.amount` | 固定値 or 0〜1 割合 |
| `reg.percent` | REG 無視割合（0〜1、魔法ダメージ） |

### デバフ解除（`dispel` effect / `periodicDispel` passive）

| フィールド | 説明 |
|------------|------|
| `dispelCount` | `0` = 対象タグすべて、`N>0` = `remainingSec` 降順で N 件 |
| `dispelTags` | 未指定 = 全デバフタグ |

### ブロック（`block` effect / `block` passive）

| フィールド | 説明 |
|------------|------|
| `blockChance` | 0〜1。複数ソースは加算（上限 1） |
| `durationSec` | アクティブ `block` 効果のみ。付与 buff の持続 |

アクティブ `block` は `StatusEffect`（`overlay: block`, `blockChance`）を付与。DEF 適用後の物理直接ダメージにのみ判定。

### 反撃（`counter` effect）

| フィールド | 説明 |
|------------|------|
| `target` | **常に `{ kind: "self" }`**（パーサーで正規化。付与は自身のみ） |
| `responses[]` | 反撃時に攻撃者へ適用する内容（**1 種別以上必須**）。各要素の `kind`: `damage` / `debuff` / `dot` / `stun` / `knockback` |
| `responses[].amount` 等 | 種別ごとに通常 effect と同型のフィールド（`damage` は `amount` + `damageType?`、`debuff` は `debuffStat` 等） |
| `durationSec` | 反撃状態の持続（秒） |
| `range` | optional。反撃発動の射程（px）。この距離以内の攻撃のみ反撃。`0` = 近接接触のみ（遠距離攻撃は不発） |
| `targetShape` | **`multiLock` 禁止**（その他の形状も付与は自身のみのため実質未使用） |

アクティブ `counter` は `StatusEffect`（`overlay: counter`, `responses`, `counterRangePx?`）を付与。バフ/デバフフィルタタグには含めない。詳細は [combat.md](combat.md) の反撃節。

### 確率反撃（`counterChance` passive）

| フィールド | 説明 |
|------------|------|
| `counterChance` | 被攻撃時の反撃発動確率（0〜1） |
| `counterResponses[]` | 反撃内容（アクティブ `counter` の `responses[]` と同型） |
| `counterRange` | optional。反撃発動の射程（px）。未指定 = 持有者 `traits.rangePx` |

常時受付。被 `damage` / `dot` で HP に入ったダメージがあるたび、射程内なら `counterChance` を判定し、成功時に `counterResponses` を攻撃者へ直接適用。反撃 `StatusEffect` は付与しない。アクティブ `counter` とは独立に併用可。

**旧 JSON 互換:** トップレベル `amount` のみの場合は `responses: [{ kind: "damage", amount, damageType? }]` に昇格。

レガシー合成（未使用の一次職データに残る場合）:

| 効果 | 合成ルール |
|------|------------|
| `damageMultiplier` | 乗算 |
| `damageTakenMultiplier` | 乗算 |
| `healBonus` | 加算 |
| `activeCooldownRate` | 乗算（active 枠のみ） |

## ターゲット指定（`target: TargetSpec`）

effect・パッシブのターゲットは構造化オブジェクト `target` で指定する。読み込み時に旧 `targetRule` 文字列は正規化される（書き込みは `target` のみ）。

### 種別一覧

| `kind` | 説明 |
|--------|------|
| `distance` | `side`（ally/enemy）+ `order`（nearest/farthest）。味方 actor + enemy/nearest = 最前線敵。敵 actor + ally/nearest = ヘイト加重味方 |
| `stat` | `side` + `stat`（hp/atk/def/reg）+ `order`（highest/lowest/ratio）。`ratio` は HP のみ（`hp/maxHp` 最小 = 最もダメージを受けた味方） |
| `attackType` | `physical` / `magic` / `melee` / `ranged` チェックボックス（OR）。両グループにチェック時は AND。フィルタ後 anchor は最前線 |
| `status` | `side`（既定 enemy）+ `debuffTags` / `buffTags`（OR）。フィルタ後 anchor は最前線 |
| `self` | 自身 |
| `all` | `side` で味方全員 / 敵全員（射程無視） |

### 旧 `targetRule` との対応（読み込み互換）

| 旧 `targetRule` | 新 `target` |
|-----------------|-------------|
| `frontEnemy` | `{ "kind": "distance", "side": "enemy", "order": "nearest" }` |
| `closestAlly` | `{ "kind": "distance", "side": "ally", "order": "nearest" }` |
| `farthestEnemy` | `{ "kind": "distance", "side": "enemy", "order": "farthest" }` |
| `lowestHpEnemy` | `{ "kind": "stat", "side": "enemy", "stat": "hp", "order": "lowest" }` |
| `mostDamagedAlly` | `{ "kind": "stat", "side": "ally", "stat": "hp", "order": "ratio" }` |
| `rangedAttackingEnemy` | `{ "kind": "attackType", "ranged": true }` |
| `debuffedEnemy` + `targetDebuffFilter` | `{ "kind": "status", "side": "enemy", "debuffTags": [...] }` |
| `allAllies` / `allEnemies` | `{ "kind": "all", "side": "ally" \| "enemy" }` |

## effect 共通フィールド（`skills.json`）

| フィールド | 説明 |
|------------|------|
| `target` | anchor 選定（`TargetSpec`）。**射程内**のユニットのみ対象（`self` / `all` を除く） |
| `damageIncrease` | 任意。`damage` / `heal` / `dot` 用条件付き倍率（`heal` は直接回復のみ） |
| `defenseIgnore` | 任意。`damage` / `dot` 用 DEF / REG 無視 |
| `targetShape` | `single`（既定）／`aoe`／`multiLock`／`pierce`／`chain`／`scatter` |
| `aoeRadiusPx` | `aoe` 必須。anchor の X から ±px |
| `hitCount` | `multiLock` 必須（整数 ≥ 2）。`single` / `aoe` 任意（整数 ≥ 2、省略=1） |
| `hitDurationSec` | `single` / `aoe` で `hitCount >= 2` 時必須。全ヒットを均等分散 |
| `chainCount` / `chainMaxDistancePx` | `chain` 必須 |
| `scatterSpreadRadiusPx` | `scatter` 任意。着弾位置の分散半径（±px）。未指定 = `scatterRadiusPx` |
| `scatterRadiusPx` / `scatterHitCount` / `scatterDurationSec` | `scatter` 必須（`scatterRadiusPx` = 乱打半径・命中判定） |
| `scatterSpreadRate` | `scatter` 任意（0〜1。0 = anchor 中心固定。着弾 offset = `scatterSpreadRadiusPx × rate`） |
| `range` | 命中判定・VFX 共用（px）。省略時 = `actor.traits.rangePx` |
| `anim` | 任意。スプライトアニメ（`idle` / `attack` / `dash` / `heal` / `none` 等）。未指定 = effect 種別の既定 |
| `vfx` | 任意。effect 単位の VFX プリセット。未指定 = スキル `vfx` → 種別既定（damage/heal 等） |

**move を含むスキル:** シーケンスの各 step 発火時に、その effect の `anim` / `vfx` で演出する（例: 突進 `dash` → 斬撃 `attack`+`slash` → 帰還 `idle`）。

### ResourceAmountSpec（`damage` / `heal` / `hot` / `barrier`）

| フィールド | 説明 |
|------------|------|
| `amount.kind` | `atkBased`（既定）／`defBased`／`flat`／`percentMaxHp` |
| `amount.atkOffset` / `atkScale` | `atkBased` 用（加減 net / 倍率 net。未指定: offset=0, scale=1） |
| `amount.defOffset` / `defScale` | `defBased` 用（加減 net / 倍率 net。未指定: offset=0, scale=1）。参照は **使用者 effective DEF** |
| `amount.flatAmount` | `flat` 必須 |
| `amount.percentOfMaxHp` | `percentMaxHp` 必須（0〜1、**対象 maxHp** 基準） |
| `powerMultiplier` | **旧 JSON 互換** — `amount` 未指定時は `atkBased` + `atkScale` として読む |

### barrier 専用

| フィールド | 説明 |
|------------|------|
| `barrierStack` | `true` = 既存 `barrierHp` に加算。未指定/`false` = 新量で置換 |

### move 専用

| フィールド | 説明 |
|------------|------|
| `type: move` | 使用者（actor）の `battleX` を anchor 基準位置へ移動 |
| `moveDurationSec` | 補間秒（必須・正数） |
| `moveMode` | `engage`（接敵・射程内）／`toAnchor`（帰還・同座標可）／`behindTarget`（敵の背後） |
| `behindOffsetPx` | `behindTarget` 時、anchor より敵奥へ何 px（味方: 左＝減算） |

- `targetShape` は **single のみ**（Phase 1）
- `engage` / `behindTarget`: 敵向け `target`（`distance` + enemy 等）
- `toAnchor`: 味方向け `target`（`distance` + ally / `self` 等）
- move を含むスキルは effect 列を **順序実行**（移動完了後に次 effect）。CD はシーケンス全 step 完了後にリセット

### targetShape の JSON 例（スキーマ参考・具体 ID は未固定）

**範囲（aoe）** — `frontEnemy` anchor + 半径:

```json
{
  "target": { "kind": "distance", "side": "enemy", "order": "nearest" },
  "targetShape": "aoe",
  "aoeRadiusPx": 70,
  "type": "damage",
  "damageType": "magic",
  "amount": { "kind": "atkBased", "atkScale": 1.2 },
  "range": 120
}
```

**連鎖（chain）** — anchor から近傍の同陣営へ:

```json
{
  "target": { "kind": "stat", "side": "enemy", "stat": "hp", "order": "lowest" },
  "targetShape": "chain",
  "chainCount": 3,
  "chainMaxDistancePx": 80,
  "type": "damage",
  "damageType": "magic",
  "amount": { "kind": "atkBased", "atkScale": 0.9 },
  "range": 120
}
```

## コンテンツ追加手順

1. `classes.json` にクラスを追加
2. 必要なら `skills.json` にスキルを追加
3. `parties.json` または将来のセーブ形式で ID を参照
4. 起動時 `validateGameData` が ID 参照の整合性をチェック
