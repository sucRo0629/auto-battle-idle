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

`test-classes.json` は検証用として**本番 15 クラスとは別系統**。

### 一次職マスタ（15 種）

表示名の英語肩書きは `epithetEn`、一行フレーバーは `flavorJa`（UI 表示は Phase 3c 以降。データのみ先行投入）。

#### defender（`df_`）

| classId | 表示名 | epithetEn | 列 | 射程 | パッシブ | アクティブ |
|---------|--------|-----------|-----|------|----------|------------|
| `df_guardian` | 鉄衛士 | Guardian | front | 近接 | 最高 ATK 狙い | シールドバッシュ（ダメ+スタン）／威圧 |
| `df_paladin` | 護法士 | Paladin | front | 近接 | 被ダメ 12% 即時回復 | 手当／聖盾 |
| `df_duelist` | 剣闘士 | Duelist | front | 近接 | 低 HP 火力 | 砂かけ（debuff+スタン）／隙撃ち |

#### attacker（`at_`）

| classId | 表示名 | epithetEn | 列 | 射程 | パッシブ | アクティブ |
|---------|--------|-----------|-----|------|----------|------------|
| `at_warrior` | 重戦士 | Warrior | front | 近接 | — | 重撃（4 通常後・atk×2.1）／薙ぎ払い |
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
| `sp_cleric` | 療養師 | Cleric | front | 近接 | 味方全体 HoT（強） | 癒しの手／鼓舞 |
| `sp_abjurer` | 結界師 | Abjurer | middle | 近接 | 回復時バリア付与 | 結界／弱体符 |
| `sp_alchemist` | 薬草師 | Alchemist | middle | 近接 | 弱 HoT + 自 debuff 延長 | 攻性薬／毒霧 |

### デモ編成（`parties.json` demo）

| 枠 | classId | 表示名 |
|----|---------|--------|
| 1 | `df_guardian` | 鉄衛士 |
| 2 | `at_warrior` | 重戦士 |
| 3 | `sp_cleric` | 療養師 |
| 4 | `at_ranger` | 弓術士 |

未編成の残り 11 クラスは `DEFAULT_ROSTER_EXTRAS.demo` でアンロック（編成画面から選択可）。

## 配置

`formationRow` で列を決定：`front` → `middle` → `back`（左＝敵側）。

同一列内の横並び順はパーティ **配列順**。

味方の heal / move 向け `closestAlly` は **battleX 距離**が最小の味方。敵の `closestAlly` は **ヘイト加重抽選**（[combat.md](combat.md) の Threat 節）。

### 射程（`traits.attackRange`）

| `attackRange` | クラス traits | スキル射程 |
|---------------|---------------|------------|
| `melee` | 必須 | 未指定時 **0px**（剣・拳）。槍等は `effect.range` で 30px 等を明示 |
| `ranged` | 必須 | 未指定時 `DEFAULT_RANGED_RANGE_PX`（50px）。各 effect の `range` で上書き可 |

`traits.rangePx` は廃止。射程はスキル effect 単位で定義する。

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
| `trigger.value` | 条件の閾値。発動後に `remaining` として再設定され、0 になるまで再充填 |

- `basicAttackCount` — 戦闘開始時 `remaining = value`。**通常攻撃が命中するたび** `remaining--`（エンジン標準。パッシブ不要）
- `hitsTaken` — 被ダメ（`hurt`）のたび `remaining--`
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
| `evasionChance` | `evasionChance` | 被ダメ回避率（加算、上限 1） |
| `selfLowHpDamageScale` | `scale`, `maxMul` | 欠損 HP 率に応じた与ダメ倍率（上限 `maxMul`） |
| `damageVsDotTarget` | `scale`, `selfAppliedOnly?` | DoT 対象への与ダメ倍率 |
| `aoeCrowdBonus` | `perExtraTargetScale`, `maxExtraTargets` | `aoe` / `scatter` の追加ヒット数ボーナス |
| `damageTakenToHeal` | `ratio` | HP に入った最終ダメージの `ratio` 割合を即時回復（バリア吸収後。ATK 基準ではない） |
| `partyHotAura` | `partyHotAuraAmount` | 味方全体に常時 HoT を付与（戦闘開始時同期） |
| `healAppliesBarrier` | `barrierScale` | 使用者の heal 量に比例してバリア付与 |
| `extendSelfAppliedDebuff` | `extendSec`, `durationMultiplier?` | 使用者が付与する debuff 持続延長 |

レガシー合成（未使用の一次職データに残る場合）:

| 効果 | 合成ルール |
|------|------------|
| `damageMultiplier` | 乗算 |
| `damageTakenMultiplier` | 乗算 |
| `healBonus` | 加算 |
| `activeCooldownRate` | 乗算（active 枠のみ） |

## ターゲットルール

| ルール | 説明 |
|--------|------|
| `closestAlly` | 敵: **ヘイト加重**で味方 1 体（`pickThreatWeightedAlly`）。味方: 自分以外で **battleX 距離が最小** |
| `frontEnemy` | X が最も近い敵 |
| `lowestHpEnemy` | 現在 HP が最も低い敵 |
| `mostDamagedAlly` | 欠損 HP が最も大きい味方 |
| `rangedAttackingEnemy` | 攻撃可能な遠隔敵（`attackRange: ranged`） |
| `highestAtkEnemy` / `lowestDefEnemy` / `highestDefEnemy` | 攻撃可能敵の stat 比較 |
| `lowestRegEnemy` / `highestRegEnemy` | 同上（REG） |
| `highestHpEnemy` | 攻撃可能敵の現在 HP 最大 |
| `farthestEnemy` | 攻撃可能敵のうち X が最も小さい（味方から最も遠い） |

## effect 共通フィールド（`skills.json`）

| フィールド | 説明 |
|------------|------|
| `targetRule` | anchor 選定ルール（上表）。**射程内**のユニットのみ対象 |
| `targetShape` | `single`（既定）／`aoe`／`multiLock`／`pierce`／`chain`／`scatter` |
| `aoeRadiusPx` | `aoe` 必須。anchor の X から ±px |
| `hitCount` | `multiLock` 必須（整数 ≥ 2）。`single` / `aoe` 任意（整数 ≥ 2、省略=1） |
| `hitDurationSec` | `single` / `aoe` で `hitCount >= 2` 時必須。全ヒットを均等分散 |
| `chainCount` / `chainMaxDistancePx` | `chain` 必須 |
| `scatterSpreadRadiusPx` | `scatter` 任意。着弾位置の分散半径（±px）。未指定 = `scatterRadiusPx` |
| `scatterRadiusPx` / `scatterHitCount` / `scatterDurationSec` | `scatter` 必須（`scatterRadiusPx` = 乱打半径・命中判定） |
| `scatterSpreadRate` | `scatter` 任意（0〜1。0 = anchor 中心固定。着弾 offset = `scatterSpreadRadiusPx × rate`） |
| `range` | 命中判定・VFX 共用（px）。`0` 可。未指定 = `traits.rangePx` → 近接は 0 |
| `anim` | 任意。スプライトアニメ（`idle` / `attack` / `dash` / `heal` / `none` 等）。未指定 = effect 種別の既定 |
| `vfx` | 任意。effect 単位の VFX プリセット。未指定 = スキル `vfx` → 種別既定（damage/heal 等） |

**move を含むスキル:** シーケンスの各 step 発火時に、その effect の `anim` / `vfx` で演出する（例: 突進 `dash` → 斬撃 `attack`+`slash` → 帰還 `idle`）。

### ResourceAmountSpec（`damage` / `heal` / `hot` / `barrier`）

| フィールド | 説明 |
|------------|------|
| `amount.kind` | `atkBased`（既定）／`flat`／`percentMaxHp` |
| `amount.atkOffset` / `atkScale` | `atkBased` 用（加減 net / 倍率 net。未指定: offset=0, scale=1） |
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
- `engage` / `behindTarget`: 敵向け `targetRule`（`frontEnemy`, `farthestEnemy` 等）
- `toAnchor`: 味方向け `targetRule`（`closestAlly`, `self` 等）
- move を含むスキルは effect 列を **順序実行**（移動完了後に次 effect）。CD はシーケンス全 step 完了後にリセット

### targetShape の JSON 例（スキーマ参考・具体 ID は未固定）

**範囲（aoe）** — `frontEnemy` anchor + 半径:

```json
{
  "targetRule": "frontEnemy",
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
  "targetRule": "lowestHpEnemy",
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
