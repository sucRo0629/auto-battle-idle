# フェーズロードマップ

Auto Battle Idle の開発フェーズ一覧。ゲームルールは [spec](../spec/README.md) を参照。

## 概要

| Phase  | ゴール                                                                               | 状態                 |
| ------ | ------------------------------------------------------------------------------------ | -------------------- |
| **1**  | 戦闘コアデモ（自動戦闘 + Canvas 表示・プレースホルダー）                             | **完了**             |
| **2a** | 放置 MVP：セーブ・ステージ進行・個別 Lv（ステのみ）                                  | **完了**             |
| **2b** | 戦闘計算（`combatMath` 等）                                                          | **完了**             |
| **2c** | JSON 駆動クラス、ビルドのハードコード排除                                            | **完了**             |
| **3**  | Lv アップ時スキル習得、アクティブセット 2 枠目                                       | **完了**             |
| **4**  | クラスマスタ + スキル説明；4a データ **完了** / 4b 説明自動生成 / **4c JSON 分割**   | **4b が次**          |
| **5**  | 本番スプライトアニメーション + 編集ツール作成                                       | 未着手               |
| **6**  | スキル VFX + 編集ツール作成（スキル別設定・新プリセット）                             | 未着手（Phase 5 後） |
| **7**  | バランス調整（数値チューニング全般）                                                 | 未着手               |
| **8**  | globalExp、強化ツリー、オフライン報酬、Electron                                      | 未着手               |

全フェーズ共通のスコープ外：アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。

**開発優先:** **Phase 4b（スキル説明自動生成）** を次に完成させる。デモ編成は最新の `parties.json` 構成に更新済み（[classes-and-skills.md](../spec/classes-and-skills.md)）。接敵ビジュアル整理は [master-work-order.md](./master-work-order.md) Phase 3a/3b を参照。globalExp / 強化ツリー / Electron は Phase 8。

---

## Phase 1 — 戦闘コアデモ（完了）

**ゴール：** ブラウザ上で味方パーティ vs 敵の完全自動戦闘。開始後はプレイヤー入力なし。

### 実装済み

- Vite vanilla-ts プロジェクト（`base: './'`）
- JSON ゲームデータ：`data/classes.json`, `skills.json`, `enemies.json`, `stages.json`, `parties.json`
- 戦闘ロジック：`BattleEngine`, `SkillExecutor`, `targeting`, `combatMath`, `validateGameData`
- 3 ロール、4 人編成（鉄衛士 / 剣術士 / 療養師 / 弓術士）、`stage_1` に test_enemy × 2
- スキル枠：**basic**（非表示・常時稼働）+ **セットアクティブ 1 枠**（HUD に CD 表示）
- パッシブはすべて同時発動；`snipe` でターゲットルールを `lowestHpEnemy` に上書き
- ステータス効果：`atk`, `def`, `damageTaken` への buff / debuff
- Victory / Defeat → 3 秒待機 → HP 全回復 → 再スポーン（Phase 2 でセーブ連動の進行ルールを追加）
- Canvas 2D：**アニメーション基盤**（`SpriteAnimator`、イベント連動、近接突進/遠隔弾、ダメージポップアップ）
- **プレースホルダースプライト**（ロール別色分け PNG。本番ドット絵は Phase 5）
- **プレースホルダー戦闘 VFX**（slash / orb / arrow / healRise の 4 種。role / attackRange から自動選択。`render/skillVfx/` に解決基盤のみ。**スキル別 `vfx` 設定・新プリセット追加は Phase 6**）
- buff VFX：対象スプライトの白い光（約 0.8 秒）
- Canvas UI：ステージ名（左上）、パーティ HUD（クラス名 / Exp / HP / スキル CD）
- バトルログ：**console のみ**（DOM ログは意図的に未実装）

### デモ編成

| classId       | 表示名 |
| ------------- | ------ |
| `df_guardian` | 鉄衛士 |
| `at_warrior`  | 剣術士 |
| `sp_cleric`   | 療養師 |
| `at_ranger`   | 弓術士 |

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

- セーブ + JSON のみからパーティ/ビルドを構築（`parties.json`）
- `levelCurves.json` による Lv 成長（Phase 4 で **growthPresets + classes.growthTier** 方式に刷新）

---

## Phase 3 — スキル・戦闘拡張（完了）

**ゴール：** LvUP でスキルプールが増え、セットアクティブを最大 2 枠まで扱える。ビルドはセーブに永続化。

### 実装済み

- LvUP 時、`classes.json` の `skills[]`（レベル別 `skillIds`）から `learnedPassiveIds` / `learnedActiveIds` を再計算（`resolveLearnedSkills`, `reconcileMemberBuild`）
- 勝利報酬・セーブロード・デバッグ Lv 変更時に習得リストを同期；LvUP ログに新スキル名を表示
- アクティブ **最大 4 枠**（`MAX_ACTIVE_SLOTS = 4`）：習得即参加（`learnedActiveIds`）。段階解放 Lv0=2 / Lv15=3 / Lv30=4。`equippedActiveSlots` は SkillMenuPanel テスト用
- 新アクティブ習得時は自動セットしない（スキルメニューでプレイヤーが選ぶ）
- セーブに `CharacterBuild` を含め、ロード時 `reconcilePartyBuilds` でレベルと整合

---

## Phase 4 — クラスマスタ + スキル

Phase 3 の習得機構 + **キャラクターデータ GUI** でクラス JSON を確定する。**一次職 / 二次職の区別は廃止**し、`jobTier` / `promotion` / `promotesFrom` の予約は行わない。

| サブフェーズ | 内容                                                                 | 状態                      |
| ------------ | -------------------------------------------------------------------- | ------------------------- |
| **4a**       | クラス 15 種・スキル JSON・GUI・validate・`epithetEn` データ        | **完了**                  |
| **4b**       | スキル説明の自動生成（`formatSkillText`）調整・エディタプレビュー    | **次**                    |
| **4c**       | 巨大 JSON のファイル分割（AI / エディタ / Git のトークン・差分効率） | **未着手**（4b と並行可） |

### クラスマスタ（完了）

ロスター全表は [classes-and-skills.md](../spec/classes-and-skills.md) を正とする。`displayName`（漢字）+ `epithetEn`（英語肩書き）を `classes.json` に保持し、デモ編成は `parties.json` の最新構成（鉄衛士 / 剣術士 / 療養師 / 弓術士）とする。

- 旧デモ 4 クラス（Bulwark 等）は削除済み
- `epithetEn` の 2 段ルビ UI は master-work-order Phase 3c
- 数値バランスの最終版は Phase 7

### 4a — クラスデータ + GUI（完了）

- 15 クラスを `classes.json` + `skills.json` に投入済み
- **ステータス・成長** — Lv1 基準 + `growthTier`（低/中/高）+ `levelCurves.growthPresets` + `attackSpeedPresets`；術師は `growthPresetKey: caster`；`ClassEditorStep` 成長 UI + Lv10 プレビュー（[stats.md](../spec/stats.md)）
- **複数ターゲットスキル**（`targetShape` 等）— 実装検証用 WIP データ。**仕様書へのスキル一覧転記はマスタ確定後**
- キャラクターデータ GUI で編集・保存
- `validateGameData` 整合確認

### 4b — スキル説明自動生成の調整

スキル JSON に `description` フィールドは持たず、UI は `src/ui/formatSkillText.ts` から説明文を組み立てる（`SkillMenuPanel` のツールチップ等）。Phase 4a で増える effect 種別・ターゲット形状に合わせて文言を拡張する。

**現状（Phase 3 時点）**

- アクティブ：`CD {interval}s / {効果種別}` のみ（例：`CD 3s / ダメージ`）
- パッシブ：倍率・ボーナス等の数値は出るが、`targetRuleOverride` は英語 enum のまま

**4b スコープ**

- `formatActiveDescription`：威力倍率、`damageType`（物理/魔法）、`targetRule`（日本語ラベル）、`targetShape`（単体 / 範囲 / マルチロック・`hitCount`）、buff/debuff/HoT/DoT の対象ステ・倍率・持続
- `formatPassiveDescription`：`targetRuleOverride` 等を日本語ラベル化；既存パッシブ 5 種の表示確認
- 複数 effect を持つアクティブは区切り（`/` 等）で列挙
- スキルエディタ GUI に**自動生成プレビュー**を表示（保存 JSON には書かない）
- クラススキル全件でツールチップ・プレビューを目視確認

**4b スコープ外**

- 手書き `description` フィールドの JSON 追加（将来必要なら別フェーズ）
- 戦闘ログ・Canvas HUD への説明文表示（ツールチップ / エディタプレビューのみ）

### 4c — 巨大 JSON の分割（開発効率）

**背景：** 4a 完了時点で `skills.json` は ~2000 行、`classes.json` は ~600 行。AI エージェントのトークン消費・Git 差分・エディタ全体読み込みが重い。暫定対策として `.cursorignore` と [data-json-lightweight.mdc](../../.cursor/rules/data-json-lightweight.mdc) で **全文 Read 禁止** を運用中。本フェーズで **物理分割** し、必要ファイルだけ開ける形にする。

**目標レイアウト（案）**

```
data/
  skills/
    passives.json              # 共有パッシブ配列（現 passives[]）
    actives/
      df_guardian.json         # クラス ID プレフィックス単位（15 ファイル想定）
      at_swordsman.json
      …
  classes.json                 # Phase 4c では据え置き可（~600 行。必要なら 4c 後半で classes/ 分割）
```

- ランタイムの `GameData.skillRegistry` 形状は **変更しない**（`loadGameData` が分割ファイルをマージして従来と同じ `{ passives, actives }` を組み立てる）。
- エディタ API は **論理上 1 マスタ** のまま（保存時に分割ファイルへ書き戻す、または GUI をファイル単位編集に変更）。

**スコープ**

- `loadGameData.ts` — 分割 JSON の import / マージ
- `validateGameData.ts` — 入力をマージ後に現行と同じ検証
- `vite-plugin-editor-api.ts` / `EditorApp` — 読み書きパス・HMR 対象の更新
- 既存テスト・`npm run dev` / エディタ保存フローの回帰確認
- `.cursorignore` — `data/skills.json` 単体除外 → `data/skills/actives/*.json` 等へ移行（触るクラス分だけ索引）
- `docs/README.md` の JSON 読み方表を分割後パスに更新

**4c スコープ外**

- スキル数値・ID のバランス変更（**Phase 7**）
- `classes.json` の 15 分割（効果が小さいため任意。4c 完了後に別タスク可）
- ステージ・敵 JSON の分割（行数が少なく優先度低）

**タイミング：** 4a でスキーマが固まったあと。**4b と並行** してよい（説明文生成はマージ後の型・validate に依存するだけ）。

### スコープ外（Phase 4）

- ステージ編集 GUI（キャラ確定後）
- スキル VFX 本番化（**Phase 6**）

---

## Phase 5 — 本番スプライトアニメーション + 編集ツール

Phase 1 の `render/` 基盤（`SpriteAnimator`, `IBattleRenderer`, イベント連動）はそのまま活かし、**見た目のアセットを本番化**する。Phase 4（デモマスタ）以降、Phase 5 と並行も可。

### スコープ

- クラス別・敵別の **本番スプライトシート**（`classId` / `spriteKey` 単位）
- `idle` / `attack` / `heal` / `hurt` / `death` のフレームアニメ（横並びシート）
- `SpriteRegistry.ts` をプレースホルダーから本番 PNG 定義へ差し替え
- `classes.json`・`enemies.json` の `spriteKey` を本番アセットに紐付け
- クラス 5 種 + 敵分を最低限カバー
- スプライトアニメーション編集ツール作成（フレーム編集、プレビュー、書き出し）
- **将来:** データ編集 GUI 第 3 弾で `spriteKey` / `iconKey` ごとの PNG アップロード・プレビュー（Phase 5 と連動）

### Phase 1 との境界

| 項目           | Phase 1（済）                        | Phase 5                           |
| -------------- | ------------------------------------ | --------------------------------- |
| アニメ状態機械 | あり                                 | 変更なし                          |
| スプライト素材 | ロール別プレースホルダー             | クラス別本番ドット絵              |
| 差し替え単位   | `render/` の Registry / アセットパス | 同上（battle ロジックは触らない） |

### スコープ外（Phase 5）

- PixiJS への描画層移行（将来検討）
- スキルごとの VFX 設定・新プリセット追加（**Phase 6**）

---

## Phase 6 — スキル VFX + 編集ツール

Phase 1 の Canvas プレースホルダー VFX を、スキル単位で差し替え・拡張する。**Phase 5（本番キャラスプライト）完了後**に着手。

### スコープ

- `skills.json` の `vfx` フィールドを本番データに反映（`ActiveSkillDef.vfx`）
- スキルごとの `preset` / `arc` / `durationMs` 指定（通常攻撃含む）
- 新プリセット追加（Canvas `draw*` または将来のエフェクトスプライト）
- 開発用 `SKILL_VFX_OVERRIDES` からデータ駆動へ移行
- VFX編集ツール作成（プリセット編集、タイムライン、プレビュー）

### Phase 1 との境界

| 項目            | Phase 1（済）                                 | Phase 6                     |
| --------------- | --------------------------------------------- | --------------------------- |
| 解決            | `resolveSkillVfx` + ロール/射程フォールバック | スキル ID ごとに `vfx` 指定 |
| 描画            | 4 種プレースホルダー                          | 追加・差し替え              |
| battle ロジック | 変更なし                                      | 変更なし                    |

### スコープ外（Phase 6）

- スキル専用エフェクトスプライトシート（量産アセット。必要なら更に後続）

---

## Phase 7 — バランス調整

Phase 3〜6（および Phase 4 のクラスマスタ）で機能・コンテンツ・見た目が揃ったあとに、ゲーム全体の数値をチューニングする。

### スコープ

- [combat.md](../spec/combat.md) との突き合わせ・検証
- 敵 `exp`、**growthPresets 表**・クラス `growthTier` 割当、LvUP ペース
- クラス 5 種の Lv1 基礎ステ・スキル威力（具体スキルはマスタ確定後）
- ステージ難易度カーブ（敵ステ・ウェーブ構成）
- Phase 3 以降のスキル習得・強化ツリーとの整合
- **アクティブセット 2 枠目**の解放条件を決定・実装（ステージマイルストーン / Lv / クラス別等）
  - `getUnlockedActiveSlotCount` に本番ロジックを実装
  - **UI**（スキルメニューの枠ロック）と**戦闘**（`createCooldowns` / `reconcileMemberBuild` 等）の両方で未解放枠を無効化

### スコープ外（Phase 7）

- 職階追加の再導入

---

## Phase 8 — メタ・デスクトップ

Phase 7（バランス調整）完了後に着手。クラスマスタ・数値チューニングが揃ってからパーティ全体メタとデスクトップシェルを本番化する。

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
Phase 4a（クラスマスタ + GUI）  ← 次
    ↓
Phase 4b（スキル説明自動生成）
    ↓
Phase 4c（JSON 分割・開発効率）  ← 4b と並行可
    ↓
Phase 5（本番スプライトアニメ + 編集ツール）  ← 4 と並行も可（見た目のみ）
    ↓
Phase 6（スキル VFX + 編集ツール）
    ↓
Phase 7（バランス調整）
    ↓
Phase 8（globalExp + ツリー + オフライン + Electron）
```
