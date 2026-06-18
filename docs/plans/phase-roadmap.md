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
| **4**  | クラスマスタ + スキル説明；4a **完了** / 4c **完了** / 4b 説明（データ PR 同梱）     | **4a+4c 完了**        |
| **5**  | 演出アセット + **演出調整ツール**（Canvas プレビュー・VFX 調整含む）               | **次**（確定クラス順次） |
| **6**  | VFX **PNG 描画**（`sheets/vfx/` 64×64）・Canvas preset 廃止・データ本番化の残り       | 未着手（Phase 5 と並行可） |
| **7**  | バランス調整（数値チューニング全般）                                                 | 未着手               |
| **8**  | globalExp、強化ツリー、オフライン報酬、Electron                                      | 未着手               |

全フェーズ共通のスコープ外：アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。

**開発優先:** **Phase 5（演出アセット + 演出調整ツール）** — 4a で確定したクラス / 敵から **順次** アニメ・VFX を実装。4b（`formatSkillText`）はスキル JSON 変更 PR ごとに同梱（Phase 7 前の一括仕上げ）。4c JSON 分割は **完了**。接敵ビジュアルは [master-work-order.md](./master-work-order.md) Phase 3a/3b。globalExp / 強化ツリー / Electron は Phase 8。

---

## Phase 1 — 戦闘コアデモ（完了）

**ゴール：** ブラウザ上で味方パーティ vs 敵の完全自動戦闘。開始後はプレイヤー入力なし。

### 実装済み

- Vite vanilla-ts プロジェクト（`base: './'`）
- JSON ゲームデータ：`data/classes.json`, `data/skills/`, `enemies.json`, `stages.json`, `parties.json`
- 戦闘ロジック：`BattleEngine`, `SkillExecutor`, `targeting`, `combatMath`, `validateGameData`
- 3 ロール、4 人編成（鉄衛士 / 剣術士 / 療養師 / 弓術士）、`stage_1` に test_enemy × 2
- スキル枠：**basic**（非表示・常時稼働）+ **セットアクティブ 1 枠**（HUD に CD 表示）
- パッシブはすべて同時発動；`snipe` でターゲットルールを `lowestHpEnemy` に上書き
- ステータス効果：`atk`, `def`, `damageTaken` への buff / debuff
- Victory / Defeat → 3 秒待機 → HP 全回復 → 再スポーン（Phase 2 でセーブ連動の進行ルールを追加）
- Canvas 2D：**アニメーション基盤**（`SpriteAnimator`、イベント連動、近接突進/遠隔弾、ダメージポップアップ）
- **プレースホルダースプライト**（ロール別色分け PNG。本番ドット絵は Phase 5）
- **プレースホルダー戦闘 VFX**（slash / orb / arrow / healRise 等の Canvas preset。明示 `preset` のみ表示。**Phase 6 で PNG `sheets/vfx/` に置換**）
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
| **4c**       | 巨大 JSON のファイル分割（AI / エディタ / Git のトークン・差分効率） | **完了**              |
| **4b**       | スキル説明の自動生成（`formatSkillText`）— データ PR 同梱・Phase 7 前 polish | **随時**（コア済）    |

### クラスマスタ（完了）

ロスター全表は [classes-and-skills.md](../spec/classes-and-skills.md) を正とする。`displayName`（漢字）+ `epithetEn`（英語肩書き）を `classes.json` に保持し、デモ編成は `parties.json` の最新構成（鉄衛士 / 剣術士 / 療養師 / 弓術士）とする。

- 旧デモ 4 クラス（Bulwark 等）は削除済み
- `epithetEn` の 2 段ルビ UI は master-work-order Phase 3c
- 数値バランスの最終版は Phase 7

### 4a — クラスデータ + GUI（完了）

- 15 クラスを `classes.json` + `data/skills/` に投入済み
- **ステータス・成長** — Lv1 基準 + `growthTier`（低/中/高）+ `levelCurves.growthPresets` + `attackSpeedPresets`；術師は `growthPresetKey: caster`；`ClassEditorStep` 成長 UI + Lv10 プレビュー（[stats.md](../spec/stats.md)）
- **複数ターゲットスキル**（`targetShape` 等）— 実装検証用 WIP データ。**仕様書へのスキル一覧転記はマスタ確定後**
- キャラクターデータ GUI で編集・保存
- `validateGameData` 整合確認

### 4b — スキル説明自動生成（随時）

スキル JSON に `description` フィールドは持たず、UI は `src/ui/formatSkillText.ts` から説明文を組み立てる（`SkillMenuPanel` ツールチップ・`SkillEditorStep` テキストプレビュー）。

**方針:** コア（自動生成 + エディタプレビュー）は **既に稼働**。新 effect / ターゲット形状を足す **データ PR ごと** に `formatSkillText` とテストを同梱。全クラス目視の仕上げは **Phase 7 前** でよい。

**4b スコープ外**

- 手書き `description` フィールドの JSON 追加
- 戦闘ログ・Canvas HUD への説明文表示
- Canvas 演出プレビュー（**Phase 5 演出調整ツール**）

### 4c — 巨大 JSON の分割（開発効率）— **完了**

**背景：** 4a 完了時点で `skills.json` は ~2000 行。`.cursorignore` と [data-json-lightweight.mdc](../../.cursor/rules/data-json-lightweight.mdc) で全文 Read 禁止を運用していた。**物理分割済み** — 必要ファイルだけ開ける。

**レイアウト（実装）**

```
data/
  skills/
    passives.json              # 共有パッシブ配列
    actives/
      df_guardian.json         # スキル ID 先頭2セグメント単位（17 ファイル）
      at_warrior.json
      …
  classes.json                 # 据え置き（~600 行）
```

- ランタイムの `GameData.skillRegistry` 形状は **変更なし**（`loadGameData` が `import.meta.glob` でマージ）。
- エディタ API は **論理上 1 マスタ**（GET はマージ、保存時は該当ファイルへ upsert）。

**実装済み**

- `src/battle/data/loadGameData.ts` — 分割 JSON の import / マージ
- `src/battle/data/skillsJsonFs.ts` — Node 側 read/write / upsert
- `validateGameData.ts` — マージ後に現行と同じ検証（変更なし）
- `vite-plugin-editor-api.ts` — 読み書きパス・HMR 対象の更新
- `scripts/split-skills-json.mjs` — 初回移行用
- `.cursorignore` — `data/skills.json` 除外を解除（`classes.json` のみ除外継続）

**4c スコープ外**

- スキル数値・ID のバランス変更（**Phase 7**）
- `classes.json` の 15 分割（効果が小さいため任意。4c 完了後に別タスク可）
- ステージ・敵 JSON の分割（行数が少なく優先度低）

**タイミング：** 4a でスキーマが固まったあと。**4b と並行** してよい（説明文生成はマージ後の型・validate に依存するだけ）。

### スコープ外（Phase 4）

- ステージ編集 GUI（キャラ確定後）
- 演出アセット本番化・演出調整ツール（**Phase 5**）

---

## Phase 5 — 演出アセット + 演出調整ツール

Phase 1 の `render/` 基盤（`SpriteAnimator`, `IBattleRenderer`, イベント連動）は維持。**確定した classId / enemyId から順次** 本番 PNG とタイミングを載せる。アセット規約は [classes-and-skills.md](../spec/classes-and-skills.md#スプライト演出アセット) と [sheets/README.md](../../src/assets/sprites/sheets/README.md)。

### アセット仕様（目標）

| 種別 | 配置 | 内容 |
|------|------|------|
| entity 本体 | `sheets/bodies/{classId\|enemyId}.png` **1 枚** | idle / move / death のみ（48×48）。レイアウト正本 `data/entityAnimLayout.json`（味方・敵共通） |
| スキル body | `sheets/skills/{skillId}[_index].png` | **通常攻撃 + 全 active**。64×48 横 strip。attack は entity に含めない |
| 先頭 idle | strip 0 コマ目任意 | entity idle 0 と同絵で位置合わせ可 → effect `animStartFrame: 1` で再生スキップ |
| 遠隔通常攻撃 | `{id}_basic_attack.png` | **弓引き PNG を置けば skill anim**。未配置時は VFX のみ |

### 演出調整ツール（スコープ）

- **Canvas プレビュー必須** — 1 スキル / 1 effect の isolated 再生（本番と同じ `resolveEffectPresentation` → `BattleCanvas` 経路）
- **VFX パラメータ調整を統合** — `vfx.placement` / `animStartFrame` 等（移行中 `vfx.preset` / `durationMs`）/ `moveDurationSec`（別 VFX エディタは作らない）
- タイムライン表示（body strip / VFX / presentationLock）
- JSON 書き戻し（`data/skills/actives/` 等）。BattleEngine 全体は回さない薄いランナー
- SkillEditorStep から「演出プレビューを開く」連携（任意）

**実装済み（演出ラボ MVP / PR3）**

- `presentation-lab.html` — Vite 別エントリ（`npm run dev` → `/presentation-lab.html`）
- `src/presentation/PresentationPreviewRunner.ts` — 擬似 2 体配置 + `BattleCanvas.play*`
- `src/presentation/PresentationLabApp.ts` — classId / enemyId・skill・effect 選択、▶ / ↺、JSON 編集・保存
- `PUT /__editor/presentation-skill` — `skillsJsonFs` upsert + validate
- SkillEditorStep effect 演出セクションから演出ラボ deep link（任意）

### 進め方

1. インフラ — `entityAnimLayout.json`、body atlas 描画、スキル strip 64px、`animStartFrame`
2. 演出調整ツール MVP（プレースホルダー PNG でもタイミング調整可）
3. 確定クラス / 敵ごと — `bodies/` → `basic_attack` → 各 active → 演出ラボで詰め → 本番 battle 目視

### Phase 1 との境界

| 項目 | Phase 1（済） | Phase 5 |
|------|---------------|---------|
| アニメ状態機械 | あり | 変更最小（atlas / skill strip 解決追加） |
| entity 素材 | ロール別プレースホルダー | `bodies/{id}.png` + スキル strip |
| battle ロジック | — | **触らない** |

### スコープ外（Phase 5）

- PixiJS 描画層移行
- VFX PNG 描画の **BattleCanvas 実装**（**Phase 6**）
- 全 15 クラス一括完成（**確定分から順次**で可）

---

## Phase 6 — VFX PNG 描画（Canvas 廃止）

Phase 5 の演出調整ツールで **タイミング・placement 編集・プレビューは済** とする。Phase 6 は **描画エンジンを Canvas preset から PNG strip へ切替** する。

### スコープ（インフラ済み）

- **型・レジストリ（済）:** `SkillVfxDef`（`placement` / `AnimPhaseFields` / `hitVfx`）、`VFX_ANIM_CELL_*` 64×64、`vfxAnimRegistry.ts`
- **描画:** `BattleCanvas` で `sheets/vfx/*.png` を `placement` に従い描画。`AttackEffect.ts`（Canvas preset）廃止
- `data/skills/` の `vfx` 本番データ移行（`preset` → PNG + `placement`）・`SKILL_VFX_OVERRIDES` 廃止
- `gameDataSchema` の `VFX_PRESETS` 削除

### スコープ外（Phase 6）

- VFX 専用編集ツール（**Phase 5 演出ラボに統合済**）
- 既存 JSON の一括移行（クラス / スキル単位 PR で順次）

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
Phase 4a（クラスマスタ + GUI）  ← 完了
    ↓
Phase 4c（JSON 分割）  ← 完了
    ↓
Phase 4b（formatSkillText）  ← データ PR 随時
    ↓
Phase 5（演出アセット + 演出調整ツール）  ← **次**（確定クラス順次）
    ↓
Phase 6（VFX PNG 描画）  ← 5 と並行可
    ↓
Phase 7（バランス調整）
    ↓
Phase 8（globalExp + ツリー + オフライン + Electron）
```
