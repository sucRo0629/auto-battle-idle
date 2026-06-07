# フェーズロードマップ

Auto Battle Idle の開発フェーズ一覧。ゲームルールは [spec](../spec/README.md) を参照。

## 概要

| Phase | ゴール | 状態 |
|-------|--------|------|
| **1** | 戦闘コアデモ（自動戦闘 + Canvas 表示・プレースホルダー） | **完了** |
| **2a** | 放置 MVP：セーブ・ステージ進行・個別Lv（ステのみ） | **完了** |
| **2b** | 戦闘計算（`combatMath` 等） | **完了** |
| **2c** | JSON 駆動クラス、ビルドのハードコード排除 | **完了** |
| **3** | Lvアップ時スキル習得、アクティブセット2枠目 | **完了** |
| **4** | 一次職5種 + 習得スキル・マスタ（漢字2文字）；4a データ / 4b 説明自動生成 | **次フェーズ** |
| **5** | 本番スプライトアニメーション（クラス別ドット絵） | 未着手 |
| **6** | スキル VFX（スキル別設定・新プリセット） | 未着手（Phase 5 後） |
| **7** | バランス調整（数値チューニング全般） | 未着手 |
| **8** | globalExp、強化ツリー、オフライン報酬、Electron | 未着手 |

全フェーズ共通のスコープ外：アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。

**開発優先（Phase 3 完了後）：** **Phase 4a → 4b（一次職マスタ → スキル説明自動生成）を先に完成**させる。LvUP でスキルが増える体験を本番デモ編成で遊べる状態を優先し、globalExp / 強化ツリー / Electron 仕上げは Phase 8（バランス調整の後）に着手。

---

## Phase 1 — 戦闘コアデモ（完了）

**ゴール：** ブラウザ上で味方パーティ vs 敵の完全自動戦闘。開始後はプレイヤー入力なし。

### 実装済み

- Vite vanilla-ts プロジェクト（`base: './'`）
- JSON ゲームデータ：`data/classes.json`, `skills.json`, `enemies.json`, `stages.json`, `parties.json`
- 戦闘ロジック：`BattleEngine`, `SkillExecutor`, `targeting`, `combatMath`, `validateGameData`
- 3ロール、4デモクラス、4人編成、`stage_1` に test_enemy × 2
- スキル枠：**basic**（非表示・常時稼働）+ **セットアクティブ1枠**（HUD に CD 表示）
- パッシブはすべて同時発動；`snipe` でターゲットルールを `lowestHpEnemy` に上書き
- ステータス効果：`atk`, `def`, `damageTaken` への buff / debuff
- Victory / Defeat → 3秒待機 → HP全回復 → 再スポーン（Phase 2 でセーブ連動の進行ルールを追加）
- Canvas 2D：**アニメーション基盤**（`SpriteAnimator`、イベント連動、近接突進/遠隔弾、ダメージポップアップ）
- **プレースホルダースプライト**（ロール別色分け PNG。本番ドット絵は Phase 5）
- **プレースホルダー戦闘 VFX**（slash / orb / arrow / healRise の4種。role / attackRange から自動選択。`render/skillVfx/` に解決基盤のみ。**スキル別 `vfx` 設定・新プリセット追加は Phase 6**）
- buff VFX：対象スプライトの白い光（約0.8秒）
- Canvas UI：ステージ名（左上）、パーティ HUD（クラス名 / Exp / HP / スキル CD）
- バトルログ：**console のみ**（DOM ログは意図的に未実装）

### デモ編成

| クラス | ロール | セットアクティブ | パッシブ |
|--------|--------|----------------|----------|
| Bulwark | defender | Iron Guard（buff） | Thick Skin |
| Berserker | attacker | Slash | Brute |
| Cleric | supporter | Heal | Gentle Touch |
| Hawkeye | attacker | Arrow | Snipe |

### アーキテクチャ

```
battle/  → ロジックのみ（DOM/Canvas 非依存）
  ↓ events + getSnapshot()
ui/      → BattleView がエンジン ↔ 描画を仲介
render/  → BattleCanvas（IBattleRenderer）、スプライト、エフェクト
data/    → loadGameData.ts が JSON マスタを読み込み
```

---

## Phase 2 — 放置 MVP（2a / 2b / 2c）

### 2a — 進行コア（完了）

- オートセーブ / ロード（`localStorage`、確認/リリース別キー）
- 複数ステージ：`stages.json` の順序で `currentStageId` を管理
- **Victory** → 次ステージへ進行（最終後は同ステージ周回、`totalClears` +1）
- **Defeat** → 1 つ前のステージへロールバック（先頭では据え置き）
- 勝利時に生存味方へ敵 `exp` 合計を付与し個別 LvUP
- LvUP で **maxHp / atk / def のみ上昇**（スキル習得なし）
- 進行 UI：ステージ名、パーティ Lv / Exp

### 2b — 戦闘計算（完了）

Phase 1 の時点で `src/battle/combatMath.ts` に実装済み。数値の体感調整は **Phase 7**。

### 2c — クラス基盤（完了）

- セーブ + JSON のみからパーティ/ビルドを構築（`parties.json` / `test-parties.json`）
- `levelCurves.json` による Lv 成長（Phase 4 で **growthPresets + classes.growthTier** 方式に刷新）

---

## Phase 3 — スキル・戦闘拡張（完了）

**ゴール：** LvUP でスキルプールが増え、セットアクティブを最大2枠まで扱える。ビルドはセーブに永続化。

### 実装済み

- LvUP 時、`classes.json` の `skills[]`（レベル別 `skillIds`）から `learnedPassiveIds` / `learnedActiveIds` を再計算（`resolveLearnedSkills`, `reconcileMemberBuild`）
- 勝利報酬・セーブロード・デバッグ Lv 変更時に習得リストを同期；LvUP ログに新スキル名を表示
- アクティブセット **最大2枠の基盤**（`MAX_ACTIVE_SLOTS = 2`）：`equippedActiveSlots` 配列・`SkillMenuPanel` の2枠 UI・`BattleCanvas` の複数 CD バー
- **プレイ可能な標準は Phase 7 まで1枠**（`getUnlockedActiveSlotCount` は常に 1）。2枠目の解放条件・UI / 戦闘側チェックは **Phase 7** で追加
- 新アクティブ習得時は自動セットしない（スキルメニューでプレイヤーが選ぶ）
- セーブに `CharacterBuild` を含め、ロード時 `reconcilePartyBuilds` でレベルと整合

### 検証用データ

- `test-classes.json` / `test-skills.json` に Lv1/Lv2 習得エントリあり（Phase 3 機能の動作確認用）
- デモ4クラス（`classes.json`）への習得データ投入は **Phase 4**

---

## Phase 4 — 一次職マスタ + スキル（次フェーズ）

Phase 3 の習得機構 + **キャラクターデータ GUI**（第1弾）で、一次職（1次職）の JSON を確定する。**クラス転職（2次職）は Phase 7 以降**。

| サブフェーズ | 内容 |
|-------------|------|
| **4a** | 一次職5種・スキル JSON・GUI・validate |
| **4b** | スキル説明の自動生成（`formatSkillText`）調整・エディタプレビュー |

### 一次職 / 二次職（設計方針）

| 概念 | Phase 4 | Phase 7 以降 |
|------|---------|--------------|
| **一次職** | プレイ開始〜育成の基本クラス（下表5種） | 転職元として維持 |
| **二次職** | データ上の予約フィールドのみ（未使用） | 一定 Lv で一次職から**複数候補へ分化**；転職 UI・セーブ反映 |
| **表示名** | **漢字2文字**（`displayName`） | 二次職も同方針 |

将来 JSON（Phase 7 で本番化）の想定:

```typescript
jobTier: 1 | 2;           // Phase 4 では全クラス jobTier: 1
promotion?: {             // 一次職のみ（Phase 7 で使用）
  minLevel: number;
  targetClassIds: string[];  // 二次職候補（複数 = 分化）
};
promotesFrom?: string;    // 二次職のみ：元の一次職 classId
```

Phase 4 では `jobTier: 1` を付与しても **ゲームロジックは転職しない**（フィールドは validate のみ）。

### 初期一次職（5種）

| ロール | 射程 | 表示名 | classId | 列（案） |
|--------|------|--------|---------|----------|
| defender | 近接 | **衛士** | `defender_eishi` | front |
| attacker | 近接 | **剣士** | `attacker_kenshi` | front |
| attacker | 遠隔物理 | **弓士** | `attacker_kyushi` | back |
| attacker | 遠隔魔法 | **術師** | `attacker_jutsushi` | back |
| supporter | 近接 | **薬師** | `supporter_yakushi` | middle |

- 術師: 基本攻撃・スキルは `damageType: "magic"` を基本とする。
- 旧デモ4クラス（Bulwark / Berserker 等）は **`classes.json` から削除**し一次職5種に差し替え。**`test-classes.json` は触らない**（Phase 3 習得検証用の `test_*` クラスのまま。旧4クラスをコピーしない）
- `parties.json` demo は GUI 対象外。5一次職データ確定後に手動更新
- `skills[]` LvUP 習得・スキル本体は GUI / JSON で定義（数値調整の最終版は Phase 7）。

### 二次職名称メモ（Phase 7 設計用・未実装）

一次職から分化する **上位職候補**（漢字2文字方針）。バランス・分化数と合わせて Phase 7 で確定。

| 一次職 | 二次職候補（メモ） |
|--------|-------------------|
| 衛士 | **鉄衛**（重装タンク系） |
| 剣士 | **武者**、**剣客** |
| 弓士 | （未定。狙撃 等を Phase 7 で検討） |
| 術師 | （未定） |
| 薬師 | **法師**（僧侶寄り・回復/支援上位） |

- 鉄衛・武者・剣客・法師は一次職名より「上位」トーンで二次職向き。

### 4a — 一次職データ + GUI

- 上記5一次職を `classes.json` + `skills.json` に投入
- **ステータス・成長** — Lv1 基準 + `growthTier`（低/中/高）+ `levelCurves.growthPresets` + `attackSpeedPresets`；術師は `growthPresetKey: caster`；`ClassEditorStep` 成長 UI + Lv10 プレビュー（[stats.md](../spec/stats.md)）
- **複数ターゲットスキル**（`targetShape` 等）— 実装検証用 WIP データ。**仕様書へのスキル一覧転記はマスタ確定後**
- キャラクターデータ GUI で編集・保存
- `jobTier` 等の予約フィールドを型・validate に追加（動作は Phase 7）
- `validateGameData` 整合確認

### 4b — スキル説明自動生成の調整

スキル JSON に `description` フィールドは持たず、UI は `src/ui/formatSkillText.ts` から説明文を組み立てる（`SkillMenuPanel` のツールチップ等）。Phase 4a で増える effect 種別・ターゲット形状に合わせて文言を拡張する。

**現状（Phase 3 時点）**

- アクティブ：`CD {interval}s / {効果種別}` のみ（例：`CD 3s / ダメージ`）
- パッシブ：倍率・ボーナス等の数値は出るが、`targetRuleOverride` は英語 enum のまま

**4b スコープ**

- `formatActiveDescription`：威力倍率、`damageType`（物理/魔法）、`targetRule`（日本語ラベル）、`targetShape`（単体 / 範囲 / マルチロック・`hitCount`）、buff/debuff/HoT/DoT の対象ステ・倍率・持続
- `formatPassiveDescription`：`targetRuleOverride` 等を日本語ラベル化；既存パッシブ5種の表示確認
- 複数 effect を持つアクティブは区切り（` / ` 等）で列挙
- スキルエディタ GUI に**自動生成プレビュー**を表示（保存 JSON には書かない）
- 一次職スキル全件でツールチップ・プレビューを目視確認

**4b スコープ外**

- 手書き `description` フィールドの JSON 追加（将来必要なら別フェーズ）
- 戦闘ログ・Canvas HUD への説明文表示（ツールチップ / エディタプレビューのみ）

### スコープ外（Phase 4）

- **二次職クラス追加・転職処理・転職 UI**
- ステージ編集 GUI（キャラ確定後）
- スキル VFX 本番化（**Phase 6**）

---

## Phase 5 — 本番スプライトアニメーション

Phase 1 の `render/` 基盤（`SpriteAnimator`, `IBattleRenderer`, イベント連動）はそのまま活かし、**見た目のアセットを本番化**する。Phase 4（デモマスタ）以降、Phase 5 と並行も可。

### スコープ

- クラス別・敵別の **本番スプライトシート**（`classId` / `spriteKey` 単位）
- `idle` / `attack` / `heal` / `hurt` / `death` のフレームアニメ（横並びシート）
- `SpriteRegistry.ts` をプレースホルダーから本番 PNG 定義へ差し替え
- `classes.json`・`enemies.json` の `spriteKey` を本番アセットに紐付け
- 一次職5種 + 敵分を最低限カバー
- **将来:** データ編集 GUI 第3弾で `spriteKey` / `iconKey` ごとの PNG アップロード・プレビュー（Phase 5 と連動）

### Phase 1 との境界

| 項目 | Phase 1（済） | Phase 5 |
|------|---------------|---------|
| アニメ状態機械 | あり | 変更なし |
| スプライト素材 | ロール別プレースホルダー | クラス別本番ドット絵 |
| 差し替え単位 | `render/` の Registry / アセットパス | 同上（battle ロジックは触らない） |

### スコープ外（Phase 5）

- PixiJS への描画層移行（将来検討）
- スキルごとの VFX 設定・新プリセット追加（**Phase 6**）

---

## Phase 6 — スキル VFX

Phase 1 の Canvas プレースホルダー VFX を、スキル単位で差し替え・拡張する。**Phase 5（本番キャラスプライト）完了後**に着手。

### スコープ

- `skills.json` の `vfx` フィールドを本番データに反映（`ActiveSkillDef.vfx`）
- スキルごとの `preset` / `arc` / `durationMs` 指定（通常攻撃含む）
- 新プリセット追加（Canvas `draw*` または将来のエフェクトスプライト）
- 開発用 `SKILL_VFX_OVERRIDES` からデータ駆動へ移行

### Phase 1 との境界

| 項目 | Phase 1（済） | Phase 6 |
|------|---------------|---------|
| 解決 | `resolveSkillVfx` + ロール/射程フォールバック | スキル ID ごとに `vfx` 指定 |
| 描画 | 4種プレースホルダー | 追加・差し替え |
| battle ロジック | 変更なし | 変更なし |

### スコープ外（Phase 6）

- スキル専用エフェクトスプライトシート（量産アセット。必要なら更に後続）

---

## Phase 7 — バランス調整

Phase 3〜6（および Phase 4 のデモマスタ）で機能・コンテンツ・見た目が揃ったあとに、ゲーム全体の数値をチューニングする。

### スコープ

- [combat.md](../spec/combat.md) との突き合わせ・検証
- 敵 `exp`、**growthPresets 表**・一次職 `growthTier` 割当、LvUP ペース
- 一次職5種の Lv1 基礎ステ・スキル威力（具体スキルはマスタ確定後）
- ステージ難易度カーブ（敵ステ・ウェーブ構成）
- Phase 3 以降のスキル習得・強化ツリーとの整合
- **クラス転職（二次職）**: 一定 Lv で一次職から複数二次職へ分化；`promotion` データ本番化、転職 UI、セーブの `classId` 更新、習得スキル整合
- **アクティブセット2枠目**の解放条件を決定・実装（ステージマイルストーン / Lv / クラス別等）
  - `getUnlockedActiveSlotCount` に本番ロジックを実装
  - **UI**（スキルメニューの枠ロック）と**戦闘**（`createCooldowns` / `reconcileMemberBuild` 等）の両方で未解放枠を無効化

### スコープ外（Phase 7）

- 三次職以降の拡張（二次職までを本番化対象とする）

---

## Phase 8 — メタ・デスクトップ

Phase 7（バランス調整）完了後に着手。一次職マスタ・数値チューニングが揃ってからパーティ全体メタとデスクトップシェルを本番化する。

- 勝利・オフライン時間から **globalExp** 付与
- 強化ツリー（`enhancementTree.json`）：パーティ永続のステノード
- オフライン抽象報酬（戦闘シミュレーションはしない）
- Electron シェル：frameless、常に前面、トレイ、片隅配置（`electron/main.mjs` に基盤のみ一部実装済み）

---

## 依存関係

```
Phase 1（戦闘デモ + 描画基盤 + プレースホルダー）
    ↓
Phase 2a（セーブ + ステージ + Lv ステ）
    ↓
Phase 2b（戦闘計算） ── 2c と並行可
Phase 2c（JSON クラス + 成長曲線）
    ↓
Phase 3（スキル習得 + セット2枠目）
    ↓
Phase 4a（一次職マスタ + GUI）  ← 次
    ↓
Phase 4b（スキル説明自動生成）
    ↓
Phase 5（本番スプライトアニメ）  ← 4 と並行も可（見た目のみ）
    ↓
Phase 6（スキル VFX：スキル別設定・新プリセット）
    ↓
Phase 7（バランス調整）
    ↓
Phase 8（globalExp + ツリー + オフライン + Electron）
```
