# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: Phase 6b — M1 体験版ステージ構成（`stages-demo.json` 向け）
- 状態: **Phase A〜E5 完了** → **6b-0a〜6b-1 完了** → **6b-3 調査完了** → **6b-4（`BUILD_FLAVOR=demo` 読込分離実装）完了**
- 対象: M1 体験版ステージ構成、`data/stages-demo.json`、`BUILD_FLAVOR=demo` 読込分離
- 完了条件: M1 stage 草案確定 → `stages-demo.json` スケルトン作成（**6b-1 完了**）→ demo 読込分離（§7 参照）
- スコープ外（6b）: レベル実装・EXP 集計・`computeStageExpReward`・進行報酬・`recommendedLevel` の実ゲーム接続・`stages.json` 変更

## 3. 参照すべき正本

- **v0.3.2 確定方針**（§4）
- [docs/spec/progression.md](../spec/progression.md)
- [docs/enemy-design-concept.md](../enemy-design-concept.md)
- [docs/plans/enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) — スキル参照分離（別 PR・本計画と並行しない）
- [docs/plans/phase-roadmap.md](../plans/phase-roadmap.md) — Phase 6a/6b

## 4. v0.3.2 確定方針（要約）

- 新正本データ: `stages.json` ステージ直下 `enemyGroups`（wave 単位ではない）
- 体験版: 1 stage = 1 `enemyGroups` = 1 wave 相当
- フィールド: `classId`, `count`, `hpScale`, `atkScale`, `defScale`, `resScale`（初期 1.0）
- 敵 Lv = `stage.recommendedLevel`。`stageLevel` / `levelOverride` は当面不要
- スキル解放: 味方と同じ Lv0 / Lv10 / Lv20
- stats: `computeStatsAtLevel(class, recommendedLevel)` の後に各 scale を乗算
- 配置: 射程自動（短射程前・長射程後ろ）。同射程は group 順優先
- 5 体以上: 入力可。注意表示可。禁止しない
- 正本: `enemyGroups` あり → **`waves` 不要**
- legacy 互換: `enemies.json`, `waves[].enemies[]`, `templateId`, `spawnX` は移行期残す
- 戦闘: `enemyGroups` あり → 優先。なければ legacy
- `at_ballista`: 体験版最終ボス枠（データ運用。専用 stage フラグは後回し）
- ステージ画面は未実装。編成・補正はエディタ or `DebugMenuPanel` で確認

## 5. 現状サマリ

| 観点 | 現状 |
| ---- | ---- |
| エディタ | `EnemyEditorStep` = 敵テンプレ 1 件（`enemies.json`）。`StageEnemyEditorStep` = ステージ敵編成 |
| ステージ編集 | `GET/PUT /__editor/stages`、`saveStageBundle`、一覧・選択・保存・再読込 |
| 編成 preview | `resolveStageEnemyCompositionPreview` を `DebugMenuPanel` / `StageEnemyEditorStep` で共有 |
| 敵生成 | `enemyGroups` 経路接続済み（Phase B2〜C） |
| pilot / 移行済み stage | `eg_smoke`（pilot）、`ranged_test`（classId ベース `enemyGroups`） |
| legacy 維持 stage | `test` / `1` / `2`（`waves` + `templateId`） |
| M1 コンテンツ stage | **`data/stages-demo.json` に 7 件**（`demo_ch1_01`〜`07`）。`stages.json` は未変更 |
| 通常進行（現状） | `stages.json` 配列順 → `test` → `ranged_test` → `1` → `2` → `eg_smoke`（`stageProgression.ts` / `stages[0]` 起点） |
| `attackSpeed` scale | `StageEnemyGroup` 型にフィールドなし。未実装 |

## 6. 実装フェーズ

| Phase | 内容 | 状態 |
| ----- | ---- | ---- |
| **A** | 型・validate・`progression.md` 追記 | [x] |
| **B1〜B2.5** | 展開・戦闘ユニット・小修正 | [x] |
| **C** | 射程自動配置 | [x] |
| **D** | `DebugMenuPanel` 編成・補正表示 | [x] |
| **E3b** | stage タブ骨組み・stages 読込・一覧 | [x] |
| **E3c** | `recommendedLevel` / `enemyGroups` 編集・保存 | [x] |
| **E3d** | preview / warning / tests 整理 | [x] |
| **E4b** | タブ文言・導線整理（旧敵テンプレ UI 残置） | [x] |
| **E5** | pilot stage 追加・`ranged_test` 移行・smoke 確認・handoff | [x] |
| **6b-0a（F1）** | 現行 `stages.json` 棚卸し・M1 導線ギャップ整理 | [x] |
| **6b-0b** | M1 stage 構成ドラフト（`demo_ch1_01`〜`07`） | [x] |
| **6b-1** | `data/stages-demo.json` スケルトン作成（7 stage 確定データ） | [x] |

### Phase F1 — 現行 stages 棚卸し（6b-0a 完了）

**結論**

| 観点 | 内容 |
| ---- | ---- |
| `stages.json` 5 件の位置づけ | **dev / legacy / smoke 用**。M1 本番コンテンツではない |
| M1 用コンテンツ stage | **未存在**。体験版専用 JSON も未作成 |
| 通常進行（verify OFF） | 初回 `stages[0]`（`test`）→ 勝利で配列次 → **`test` → `ranged_test` → `1` → `2` → `eg_smoke`** に乗る |
| `test` / `1` / `2` | **legacy 維持**（`waves` + `templateId`）。E5 方針どおり移行しない |
| `ranged_test` / `eg_smoke` | **E5 smoke 用**（`enemyGroups` pilot）。`at_hunter`（M1 外）・`recommendedLevel: 10`。M1 本番導線に流用しない |
| M1 stage の置き場 | **`data/stages-demo.json` に新規作成**（[phase-roadmap.md §6b](../plans/phase-roadmap.md)）。本編 `stages.json` へ混在させない |

**根拠（実装・データ）**

- `data/stages.json` は 5 件のみ（`test` / `ranged_test` / `1` / `2` / `eg_smoke`）
- 進行は `src/progression/stageProgression.ts` が配列インデックスで次/previous を解決。ステージ選択 UI は未実装（[progression.md §ステージ進行](../spec/progression.md)）
- `ranged_test`・`eg_smoke` は E5 で `enemyGroups` 経路の smoke 確認用として追加・移行済み（§6 Phase E5 参照）

### Phase 6b-0 — M1 stage 構成ドラフト（6b-0b 完了）

**前提（今回固定）**

| 項目 | 内容 |
| ---- | ---- |
| 味方解禁クラス（M1） | **8** — Defender: `df_guardian`, `df_paladin` / Attacker: `at_swordsman`, `at_assassin`, `at_ranger`, `at_sorcerer` / Supporter: `sp_cleric`, `sp_wardweaver` |
| M1 外クラス（敵にも使わない） | `df_duelist`, `at_lancer`, `at_hunter`, `sp_alchemist`, `at_ballista`, `at_sigilist`, `at_conductor` |
| スキル | **Lv0 のみ**（Lv10 / Lv20 は M1 スコープ外） |
| 敵 Lv（草案時点） | 全 stage `recommendedLevel: 0`（6b-1 データでは **1** に確定。実ゲーム Lv 進行接続は後続） |
| 編成形式 | `enemyGroups`（1 stage = 1 group 配列 = 1 wave 相当。v0.3.2 方針） |
| scale 初期値 | 全グループ `hpScale` / `atkScale` / `defScale` / `resScale` = **1.0**（6c で調整） |
| stage 数 | **暫定 7**（Chapter 1 体験版前半） |

**既存 stage を流用しない理由**

| 既存 | 流用しない理由 |
| ---- | -------------- |
| `test` | legacy `test_dummy` ×5。dev ダミー。`enemyGroups` でも M1 編成問題にならない |
| `ranged_test` | E5 smoke。`at_hunter`（M1 外）・Lv10。射程配置テスト目的 |
| `1` / `2` | legacy 複数 wave・`templateId` 混在。本編検証用。M1 8 クラス・Lv0 解法設計と無関係 |
| `eg_smoke` | E5 pilot。`at_hunter` + Lv10。本番導線に混ぜると M1 外クラスが進行に入る |
| `stages.json` 全体 | roadmap 正本どおり **体験版は `stages-demo.json` を別管理**。dev/smoke と M1 コンテンツの混在を避ける |

**ステージ一覧（6b-0 草案・参考）** — 6b-1 で確定データに差し替え済み（§6b-1 参照）

### Phase 6b-1 — `data/stages-demo.json` スケルトン作成（完了）

**成果**

| 項目 | 内容 |
| ---- | ---- |
| 新規ファイル | `data/stages-demo.json`（7 stage） |
| `stages.json` | **未変更**（dev / legacy / smoke 5 件のまま） |
| 形式 | 全 stage `enemyGroups` + `recommendedLevel: 1`。legacy `templateId` **不使用** |
| scale | 全グループ `hpScale` / `atkScale` / `defScale` / `resScale` = **1.0** |
| `waves` | 全 stage `[{ "enemies": [] }]` placeholder |
| classId | M1 8 クラスのみ。M1 外（`at_hunter` 等）は **不使用** |
| validate | `parseAndValidateGameDataJson` で validate **成功** |
| テスト | `validateGameData.test.ts` の stage `enemyGroups` 関連 **10 件 pass** |

**確定 stage 一覧**

| id | displayName | enemyGroups |
| -- | ----------- | ----------- |
| `demo_ch1_01` | 前線の足慣らし | `at_swordsman` ×2 |
| `demo_ch1_02` | 弓の射程 | `at_swordsman` ×1, `at_ranger` ×1 |
| `demo_ch1_03` | 鉄の防壁 | `df_guardian` ×1, `at_swordsman` ×2 |
| `demo_ch1_04` | 影と矢 | `at_assassin` ×2, `at_ranger` ×1 |
| `demo_ch1_05` | 炎の詠唱 | `at_sorcerer` ×2 |
| `demo_ch1_06` | 混成部隊 | `df_paladin` ×1, `at_ranger` ×1, `at_sorcerer` ×1 |
| `demo_ch1_07` | 護法の陣 | `df_paladin` ×1, `at_swordsman` ×1, `at_sorcerer` ×1, `sp_cleric` ×1 |

**未確定（6b-2 以降で詰める）**

- 各 stage `displayName` の 4e 英語
- 敵 `count` の微調整・5 体以上にするか（v0.3.2 は入力可・warning のみ）
- `hpScale` 等の難易度カーブ（**6c**）
- `enemies.json` テンプレ要否（`enemyGroups` + `classId` 直参照なら **6a は最小**）
- `stages-demo.json` 専用 validate テスト（**6b-2**）

### Phase 6b-3 — `BUILD_FLAVOR=demo` 読込分離調査（完了）

**`stages.json` / `stages-demo.json` の読込経路**

| 経路 | 現状 | demo 差し替え要否 |
| ---- | ---- | ----------------- |
| **ランタイム** `loadGameData.ts` | `import stagesJson from '../../../data/stages.json'` のみ（**唯一の静的 import**） | **要**（6b-3 実装の主対象） |
| **validate** `parseAndValidateGameDataJson` | 引数 `stages` を受け取るだけ。ファイル名非依存 | **ロジック変更不要** |
| **editor GET/PUT** `vite-plugin-editor-api.ts` | `READ_FILES.stages` → `data/stages.json` 固定。`loadValidationPayload` / `applyStageBundle` も同ファイル | **6b-3 では触らない**（後述） |
| **テスト** | `tryLoadGameData` / `loadGameData` → 常に `stages.json` 経由。`stages-demo` は `validateGameData.test.ts` が **明示 import** のみ | 既存期待値は維持。demo 用は **別テスト追加**（6b-2 済み分 + 任意で flavor 切替テスト） |

**`BUILD_FLAVOR` の既存利用**

- **コード・`package.json`・`vite.config.ts` に未実装**（`import.meta.env` / `VITE_*` もなし）
- [phase-roadmap.md §Phase 7](../plans/phase-roadmap.md) に `npm run build:demo` / `build:full` と `BUILD_FLAVOR=demo|full` の**計画のみ**
- 現行 `npm run build` は flavor なし単一ビルド

**最小差分案（実装時）**

1. `vite.config.ts` — 環境変数 `BUILD_FLAVOR`（未設定時 `full`）を `import.meta.env.VITE_BUILD_FLAVOR` へ `define`。**推奨**: `resolve.alias` で `@game-data/stages` を `stages-demo.json` / `stages.json` にビルド時切替（バンドルに片方だけ入る）
2. `loadGameData.ts` — `import stagesJson from '@game-data/stages'`（または env 分岐で 2 import のうち 1 つを選択）
3. `package.json` — `build:demo` / `build:full`（と任意 `dev:demo`）を追加
4. **触らない**: `validateGameData.ts`、`stageProgression.ts`、`editorApi.ts` / `vite-plugin-editor-api.ts`（当面）、`data/*.json`、progression / EXP

**editor は `stages.json` のままか**

- **推奨: 当面 `stages.json` 固定のまま**（開発・smoke・legacy 編集用）
- M1 コンテンツ（`stages-demo.json`）は JSON 直編集 or 6b-2 以降の専用テストで担保。editor を demo 向けに切替えるのは **Phase 6d 以降 or 別エンドポイント** が安全（dev ゲームが `stages.json` を読む現状と混同しない）
- demo ビルド zip に editor を含めるなら Phase 7 で「editor 同梱しない」方が roadmap と整合

**責務分離（本番通常 vs demo）**

| 層 | full（現行） | demo（目標） |
| -- | ------------ | ------------ |
| データ正本 | `data/stages.json` | `data/stages-demo.json` |
| ランタイム load | `loadGameData` → `stages.json` | 同関数 → `stages-demo.json`（alias / env） |
| validate | 入力 JSON の schema 検証（flavor 非依存） | 同左。CI は **両ファイル** を別テストで検証 |
| editor | `stages.json` 読書（dev） | **6b-3 スコープ外**。full dev 向け維持 |
| 進行 | `gameData.stages` 配列順（`stages[0]` 起点） | demo 読込後は `demo_ch1_01`〜`07` 順（**進行接続は別 PR**） |

**触るべきファイル候補（実装時）**

- `vite.config.ts`、`src/battle/data/loadGameData.ts`、`package.json`
- 任意: `src/battle/data/loadGameData.test.ts`（flavor 切替の薄いテスト）

**触らない方がよい範囲**

- `data/stages.json` / `data/stages-demo.json` の中身
- `validateGameData.ts`（エラーメッセージの `stages.json` 文言は cosmetic）
- `vite-plugin-editor-api.ts` / `editorApi.ts`（6b-3 単体では）
- `stageProgression.ts` / `GameSession` / EXP（進行接続は後）
- 既存 `tryLoadGameData` が `eg_smoke` / `ranged_test` を期待するテスト群

**テスト追加・修正**

- **既存期待値変更なし**（vitest デフォルトは `BUILD_FLAVOR` 未設定 = full）
- 追加候補: `loadGameData` + `BUILD_FLAVOR=demo` で 7 stage・`demo_ch1_01` 存在（vitest `env` または alias モック）
- `stages-demo.json` validate は **6b-2 で追加済み**（`validateGameData.test.ts`）

**未確定点**

- dev サーバーで demo 進行を試す `dev:demo` が必要か
- electron パッケージ時の `BUILD_FLAVOR` 伝播（Phase 7）
- demo ビルドに `stages.json` を同梱するか（alias なら不要が望ましい）
- editor で `stages-demo` を編集する時期（6d / 7 か、専用 `GET/PUT` か）

### Phase 6b-4 — `BUILD_FLAVOR=demo` 読込分離実装（完了）

- `vite.config.ts`: `BUILD_FLAVOR`（未指定=`full`）で `@game-data/stages` alias を `data/stages.json` / `data/stages-demo.json` に切替
- `loadGameData.ts`: stages import を `@game-data/stages` 経由に変更（ランタイムのみ）
- `tsconfig.json`: tsc 用 paths（常に `data/stages.json`）
- `package.json`: `build:full` / `build:demo` 追加（`BUILD_FLAVOR=full|demo vite build`）。既存 `build` は変更なし
- editor / validate / JSON 本体は未変更
- 確認: `validateGameData.test.ts` pass。`vite build` で full→`eg_smoke` 同梱・demo→`demo_ch1_*` 同梱（`stages.json` 非同梱）。`npm run build:*` は `tsc` 段階で既存 test 型エラーにより fail（本変更前から同様）

### Phase E5（完了）

**データ**

- `eg_smoke` を enemyGroups pilot stage として `stages.json` に追加済み（`recommendedLevel: 10`、`df_guardian` + `at_hunter` 各 1、`waves` は空 placeholder）
- `ranged_test` を existing classId ベースの `enemyGroups` stage に置き換え済み（`df_guardian` ×1 + `at_hunter` ×2、総体数 3、旧 templateId は再現しない）
- `test` / `1` / `2` は legacy（`waves` + `templateId`）のまま維持

**smoke 経路（E5b〜d で確認済み）**

- editor（`StageEnemyEditorStep` / `editorApi`）
- preview（`resolveStageEnemyCompositionPreview`）
- `DebugMenuPanel`
- validate（`validateGameData`）
- battle spawn（`entities.enemyGroups` / `createEnemiesForStage`）

**テスト**

- E5 関連 6 ファイル・76 件すべて pass（E5e 時点で再確認）
- 対象: `entities.enemyGroups.test.ts` / `StageEnemyEditorStep.test.ts` / `validateGameData.test.ts` / `DebugMenuPanel.test.ts` / `stageEnemyCompositionPreview.test.ts` / `editorApi.test.ts`

### Phase E3d（完了）

- `StageEnemyEditorStep` に編成概要（`recommendedLevel`、方式、グループ明細、scale summary）を追加
- 5 体以上は `.editor-warning` で注意表示（cap 圧縮・HUD 整理は未実装）
- legacy は `enemyGroups 未設定` + templateId 一覧（read-only）。自動変換なし
- テスト: `stageEnemyCompositionPreview.test.ts` + `StageEnemyEditorStep.test.ts`

### Phase E4b（完了）

- EditorApp: タブ順を クラス → ステージ → 敵テンプレ → バランス → 状態アイコン に整理。旧「敵」→「敵テンプレ」
- subtitle に stages.json を追記
- EnemyEditorStep / StageEnemyEditorStep: legacy templateId と enemyGroups の導線を説明文で明示

## 7. 次にやること

### 推奨

- [ ] **Phase 6b-2 — `stages-demo.json` validate テスト追加** — 7 stage の `enemyGroups` / `recommendedLevel` / M1 classId 制約を固定するテスト。今回は未実装

### 次点

- [x] **`BUILD_FLAVOR=demo` 読込分離調査（6b-3）** — 経路洗い出し完了（§6b-3）。実装は次タスク
- [x] **`BUILD_FLAVOR=demo` 読込分離実装（6b-4）** — `vite.config.ts` alias + `loadGameData.ts` + `build:demo` / `build:full`

### 後回し

- [ ] **enemyGroups stage の EXP 集計** — `computeStageExpReward` は legacy `waves` / `templateId` のみ（`eg_smoke` / `ranged_test` / 将来 `stages-demo` で撃破 EXP 0）。6c または進行接続時
- [ ] **`test` / `1` / `2` の legacy → `enemyGroups` 移行** — 本編 Phase 8 向け。M1 とは別経路
- [ ] legacy ステージを stage タブで `enemyGroups` へ変換する UI

### その他バックログ

- [ ] validate の classId allowlist subset 化（M1 8 クラス限定）
- [ ] 5 体以上 warning の cap 圧縮・多数敵 HUD 整理
- [ ] `attackSpeed` scale を `StageEnemyGroup` に追加するか

## 8. やらないこと（全体）

- legacy データの即削除
- ステージ選択画面 UI
- [enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) のスキル参照分離（別 PR）
- 数値バランス調整
- `at_ballista` 専用 stage フラグ
- enemy-design-concept §12 の段階サブセット（Lv0/10/20 全解放が v0.3.2 正）

## 9. 未対応・未確定（Phase E 後に残す）

| 項目 | 内容 |
| ---- | ---- |
| legacy ステージ移行 | `test` / `1` / `2` は未移行。`eg_smoke` / `ranged_test` のみ `enemyGroups` 化済み |
| `stages-demo.json` | **6b-1 完了**。`demo_ch1_01`〜`07` 確定データ（§6b-1）。次は 6b-2 validate テスト |
| `BUILD_FLAVOR=demo` | **6b-4 実装完了**。ランタイム alias 切替 + `build:demo` / `build:full`。editor は `stages.json` 固定のまま |
| EXP 集計 | `enemyGroups` ステージの撃破 EXP が `computeStageExpReward` 未対応（後回し） |
| validate allowlist | classId の subset 化は未実装 |
| 5 体以上 | エディタ warning のみ。cap 圧縮・多数敵 HUD 整理は未実装 |
| `attackSpeed` scale | `StageEnemyGroup` 型・編集 UI とも未実装 |
| legacy 変換 UI | stage タブで legacy → `enemyGroups` へ変換する UI は未実装（read-only 表示のみ） |
| 旧敵テンプレ UI | E4b で導線整理済み。非表示・削除はしない |

## 10. ChatGPT へ戻すときのメモ

- 目的: M1 体験版ステージ（`stages-demo.json`）の構成確定とデータ化
- 現在地: **Phase 6b-4 完了** — ランタイム stages 読込分離済み（alias + npm scripts）
- 次（推奨）: **Phase 6b-2 — `stages-demo.json` validate テスト追加**（handoff §7 では未チェック。テスト本体は既に存在する可能性あり → 6b-2 実装時に確認）
- 次（次点）: Phase 6d マップ選択 UI / 6c バランス
- 後回し: EXP 集計、`test`/`1`/`2` 移行、legacy 変換 UI
- 判断待ち: §9 未対応・未確定事項（6c 数値・6d 導線は別フェーズ）
