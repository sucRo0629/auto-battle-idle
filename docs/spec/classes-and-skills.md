# クラスとスキル

ゲームデータは `data/*.json`。型とローダー：`src/battle/types.ts`, `loadGameData.ts`

**スキルマスタのドキュメント化：** 現行 `data/skills.json` の各エントリは Phase 4a 確定前の **作業用データ**（削除・改名・数値変更あり）。仕様書では **フィールド定義・形状の例** のみ記載し、ファイル内容のスキル一覧転記は **マスタ確定後** に行う。

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

`classId` 命名：`{role}_{flavor}`（例：`defender_eishi`）

## 職階（一次職 / 二次職）

| 職階 | `jobTier` | Phase 4 | Phase 7 以降 |
|------|-----------|---------|--------------|
| **一次職** | `1` | プレイ開始クラス（5種・表示名は漢字2文字） | 転職元 |
| **二次職** | `2` | 未定義（JSON 予約のみ） | 一定 Lv で一次職から**複数候補へ分化** |

一次職が二次職へ転職する条件・候補は `classes.json` の `promotion`（Phase 7 で本番化）。Phase 4 では転職ロジックは実装しない。

### 一次職（Phase 4 初期実装）

| ロール | 射程 | 表示名 | classId |
|--------|------|--------|---------|
| defender | 近接 | 衛士 | `defender_eishi` |
| attacker | 近接 | 剣士 | `attacker_kenshi` |
| attacker | 遠隔物理 | 弓士 | `attacker_kyushi` |
| attacker | 遠隔魔法 | 術師 | `attacker_jutsushi` |
| supporter | 近接 | 薬師 | `supporter_yakushi` |

### 二次職名称メモ（Phase 7）

| 一次職 | 候補 |
|--------|------|
| 衛士 | 鉄衛 |
| 剣士 | 武者、剣客 |
| 薬師 | 法師（僧侶寄り上位ヒーラー） |
| 弓士・術師 | Phase 7 で設計 |

旧 Phase 1 デモ名（Bulwark 等）は **`classes.json` から削除**し一次職に置き換え。`test-classes.json` は Phase 3 検証用として**変更しない**。

## 配置

`formationRow` で列を決定：`front` → `middle` → `back`（左＝敵側）。

同一列内の横並び順はパーティ **配列順**。

敵のターゲットは **戦場 X**（`battleX` / `closestAlly`）：位置が最も近い生存味方。ロール優先はなし。

### `traits.rangePx`

| `attackRange` | 必須 | 未指定時 |
|---------------|------|----------|
| `ranged` | はい | バリデーションエラー |
| `melee` | いいえ | 攻撃射程 **0px**（剣・拳）。槍等は `30` 等を明示 |

スキル個別の `effect.range` があればそちらが優先（[combat.md](combat.md)）。

## デモクラス（Phase 1 → Phase 4 で一次職に移行）

Phase 1 の英語名4クラスは Phase 4 で [一次職](#一次職phase-4-初期実装) に差し替え。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 4。

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
reg: number;     // 固定（成長なし）
growthTier: GrowthTierSet;
growthPresetKey?: "attacker" | "caster"; // attacker ロールのみ。caster = 術師合成
attackSpeedTier?: AttackSpeedTier;       // 未指定 = normal
```

- 成長の実数解決・`growthPresets` 表・術師合成ルール → [stats.md](stats.md)
- 開発 GUI（`ClassEditorStep`）で Lv1 / 成長段階 / SPD を編集可能

## スキル枠

| 枠 | 数（Phase 1〜2） | 出所 | UI |
|----|-------------------|------|-----|
| **basic** | 1 | `ClassPreset.basicAttackSkillId` | 非表示 |
| **active** | 1（標準）／最大2（基盤） | `build.equippedActiveSlots[]` | HUD リキャストバー |

- 基本攻撃も `skills.json` の `actives` に定義し、`slotKind: 'basic'` で実行。
- 基本攻撃 ID をセット枠（`equippedActiveSlots`）に入れない。
- Phase 3 以降：配列・UI・HUD は最大2枠に対応。**Phase 7 まで標準プレイは1枠**（2枠目解放と UI / 戦闘チェックは Phase 7）。

### LvUP 習得データ

- `classes.json` の `skills[]` にレベル別 `skillIds` を定義。
- デモ4クラス向けの習得エントリは **Phase 4** で `classes.json` に追加。**`test-classes.json` は LvUP 機構の検証専用**（本番一次職データとは別系統）。

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

- **通常攻撃** は従来どおり JSON の `interval`（時間のみ）+ `attackSpeedTier` / SPD
- レガシー JSON の `interval` はアクティブでも `trigger: { kind: "time", value: interval }` として読み込む

```json
{
  "id": "attacker_kenshi_charge",
  "trigger": { "kind": "time", "value": 5 },
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
| 4. `id` の role プレフィックス（`defender_*` 等） | 同上 |
| 5. 上記いずれも不可 | `supporter_placeholder` |

### パッシブの合成

| 効果 | 合成ルール |
|------|------------|
| `damageMultiplier` | 乗算 |
| `damageTakenMultiplier` | 乗算 |
| `healBonus` | 加算 |
| `activeCooldownRate` | 乗算（active 枠のみ） |
| `targetRuleOverride` | 配列の後ろのパッシブが優先 |

## ターゲットルール

| ルール | 説明 |
|--------|------|
| `closestAlly` | 敵: 攻撃する味方（X が最も近い）。味方: 自分以外の生存味方のうち **battleX 距離が最小** |
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
| `hitCount` | `multiLock` 必須。整数 ≥ 2。`targetRule` 順に並べたプールへ **ラウンドロビン**（対象不足時は同一 ID も可） |
| `chainCount` / `chainMaxDistancePx` | `chain` 必須 |
| `scatterRadiusPx` / `scatterHitCount` / `scatterDurationSec` | `scatter` 必須 |
| `scatterSpreadRate` | `scatter` 任意（0〜1。0 = anchor 中心固定） |
| `range` | 命中判定・VFX 共用（px）。`0` 可。未指定 = `traits.rangePx` → 近接は 0 |
| `anim` | 任意。スプライトアニメ（`idle` / `attack` / `dash` / `heal` / `none` 等）。未指定 = effect 種別の既定 |
| `vfx` | 任意。effect 単位の VFX プリセット。未指定 = スキル `vfx` → 種別既定（damage/heal 等） |

**move を含むスキル:** シーケンスの各 step 発火時に、その effect の `anim` / `vfx` で演出する（例: 突進 `dash` → 斬撃 `attack`+`slash` → 帰還 `idle`）。

### ResourceAmountSpec（`heal` / `hot` / `barrier`）

| フィールド | 説明 |
|------------|------|
| `amount.kind` | `atkBased`（既定）／`flat`／`percentMaxHp` |
| `amount.atkAdd` / `atkMultiply` / `atkDivide` / `atkSubtract` | `atkBased` 用四則（未指定: add=0, multiply=1, divide=1, subtract=0） |
| `amount.flatAmount` | `flat` 必須 |
| `amount.percentOfMaxHp` | `percentMaxHp` 必須（0〜1、**対象 maxHp** 基準） |
| `powerMultiplier` | **旧 JSON 互換** — `amount` 未指定時は `atkBased` + `atkMultiply` として読む |

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
  "powerMultiplier": 1.2,
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
  "powerMultiplier": 0.9,
  "range": 120
}
```

## コンテンツ追加手順

1. `classes.json` にクラスを追加
2. 必要なら `skills.json` にスキルを追加
3. `parties.json` または将来のセーブ形式で ID を参照
4. 起動時 `validateGameData` が ID 参照の整合性をチェック
