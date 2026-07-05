# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: **Phase 7 分割整理**（M1 demo app flow / first-play guidance）
- 状態: **Phase 6b 完了**（6b-1〜6b-8）。**Phase 7 は未着手** — 本 handoff で小タスク分割のみ。production code は触らない
- **2026-07 roadmap 改定:** [phase-roadmap.md](../plans/phase-roadmap.md) — 旧 6d → **Phase 7**（app flow）、新 **Phase 8**（presentation）、旧 Electron → **Phase 9**（packaging）。本編は **Phase 10** へ
- **Phase 7 目的:** M1 体験版として、**起動から `demo_ch1_07` クリアまで迷わず進めるアプリ導線**を作る（配布 zip は Phase 9）
- **現状画面:** 戦闘画面・編成画面（`MetaMenuOverlay`）のみ。**未実装:** トップ / ステージ選択 / リザルト / 体験版終了 / チュートリアル導線
- **並行・未達:** キャラ画像（並行作業中）、VFX 未実装、効果音未実装
- **当面方針:** 新規ソース実装は止め、Phase 7 整理後は **グラフィック準備優先**。新規画面実装はグラフィック方針整理後に再開
- **編成画面:** 戦闘画面より見た目・読みやすさが未達。**7e2 編成画面 M1 polish** は M1 前の改善対象だが、Cursor トークン消費を避け **今すぐ大改修しない**（グラフィック方針・クラス画像反映後に棚卸し → 小改善）
- M1 方針（6b で固定）: **M1 ではレベル実装しない**。EXP / progression 接続は Phase 7 でも触らない。`recommendedLevel` は表示・設計メモ・将来用（体験版は **Lv1 基準、終盤は Lv2**）
- **体験版ステージ難度（6c 着手）:** 敵 **5 体以上はダミー敵で確認済み**（再調査不要）。**敵 Lv0 固定は誤り** — 通常敵は **`recommendedLevel` Lv1 以上**（雑魚は scale 低下で表現）。`enemyGroups` + `classId` 直参照のみ

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
| demo flavor | `BUILD_FLAVOR=demo` で alias 切替。flavor テスト 3 ファイル pass（§7） |
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
| **6b-2** | `stages-demo.json` validate テスト | [x] |
| **6b-3** | `BUILD_FLAVOR=demo` 読込分離調査 | [x] |
| **6b-4** | `BUILD_FLAVOR=demo` 読込分離実装 | [x] |
| **6b-5** | demo runtime smoke テスト（`loadGameData.flavor.test.ts`） | [x] |
| **6b-6** | demo 初期 stage 選択経路調査 | [x] |
| **6b-7** | demo flavor 初期 stage / fallback テスト | [x] |
| **6b-8** | demo 初回戦闘 spawn smoke | [x] |

### Phase F1 — 現行 stages 棚卸し（6b-0a 完了）

> 6b-0a 時点の記録。M1 データ・flavor 実装の現状は **§7**。

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
| `demo_ch1_01` | 前線の張り | `df_guardian` ×1 + `at_swordsman` ×3（前衛耐久） |
| `demo_ch1_02` | 遠くの矢 | `df_guardian` ×1 + `at_ranger` ×3（後衛遠隔） |
| `demo_ch1_03` | 群れの侵攻 | `at_swordsman` ×5（弱 scale）+ `at_assassin` ×2（ラッシュ 7 体） |
| `demo_ch1_04` | 持久の壁 | `df_guardian` + `sp_cleric` + `at_swordsman` ×2（回復・耐久） |
| `demo_ch1_05` | 炎と刃 | `at_sorcerer` ×2 + `at_assassin` ×2（優先撃破） |
| `demo_ch1_06` | 混成の猛威 | Lv2・5 体混成 |
| `demo_ch1_07` | 護法の陣 | Lv2・6 体フルロール（最終） |

**6c / 以降に送る（6b スコープ外）**

- 各 stage `displayName` の 4e 英語
- 敵 `count` の微調整・5 体以上にするか（v0.3.2 は入力可・warning のみ）
- `hpScale` 等の難易度カーブ（**6c**）
- `enemies.json` テンプレ要否（`enemyGroups` + `classId` 直参照なら **6a は最小**）
- ~~`stages-demo.json` 専用 validate テスト~~ — **6b-2 完了**（`validateGameData.test.ts`）

### Phase 6b-3 — `BUILD_FLAVOR=demo` 読込分離調査（完了）

> 6b-3 調査時点の記録。実装は **6b-4 完了**（§6b-4）。現状サマリは **§7**。

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

**6b-4 で確定**

- demo ビルドは alias により `stages.json` を**非同梱**（6b-5 で build artifact 確認済み）

**Phase 7 以降に送る** — §7 参照

### Phase 6b-4 — `BUILD_FLAVOR=demo` 読込分離実装（完了）

- `vite.config.ts`: `BUILD_FLAVOR`（未指定=`full`）で `@game-data/stages` alias を `data/stages.json` / `data/stages-demo.json` に切替
- `loadGameData.ts`: stages import を `@game-data/stages` 経由に変更（ランタイムのみ）
- `tsconfig.json`: tsc 用 paths（常に `data/stages.json`）
- `package.json`: `build:full` / `build:demo` 追加（`BUILD_FLAVOR=full|demo vite build`）。既存 `build` は変更なし
- editor / validate / JSON 本体は未変更
- 確認: `validateGameData.test.ts` pass。`vite build` で full→`eg_smoke` 同梱・demo→`demo_ch1_*` 同梱（`stages.json` 非同梱）。`npm run build:*` は `tsc` 段階で既存 test 型エラーにより fail（本変更前から同様）

### Phase 6b-5 — demo runtime smoke テスト（完了）

- 追加: `src/battle/data/loadGameData.flavor.test.ts`
- 方針: vitest は `vite.config.ts` の `@game-data/stages` alias をそのまま使う。**同一プロセス内での alias 切替は不可**（`BUILD_FLAVOR` は vitest 起動前に決定）
- full（デフォルト `npm test`）: `loadGameData()` が `eg_smoke` を含み `demo_ch1_*` を含まない
- demo（`BUILD_FLAVOR=demo vitest run src/battle/data/loadGameData.flavor.test.ts`）: `demo_ch1_01`〜`07` の 7 件のみ・`eg_smoke` なし
- build artifact 手動確認: `BUILD_FLAVOR=demo|full vite build` 成功。demo chunk に `demo_ch1_01`〜`07`、full chunk に `eg_smoke`（相互に片方のみ）
- 既存 `validateGameData.test.ts` の `stages-demo.json validation` は変更なし・pass
- 未採用: build artifact 文字列の自動テスト（別 script / CI 化は今回スコープ外）

### Phase 6b-6 — demo runtime 初期 stage 選択経路調査（完了）

**経路（新規 / 初回セーブ）**

1. `main.ts` → `tryLoadGameData()` → `new GameSession(gameData)`
2. `GameSession.loadSaveForMode` — localStorage 無しなら `createDefaultSave(gameData, partyId)`
3. `createDefaultSave`（`victoryRewards.ts`）— **`currentStageId = gameData.stages[0].id`**（固定 id 文字列ではない・配列先頭）
4. 起動直後 `resolveKnownStageId(gameData.stages, save.stageProgress.currentStageId)` で既知 id に正規化し **即 persist**

**full / demo の起点**

| build | `stages[0].id` | 新規セーブ起点 |
| ----- | -------------- | -------------- |
| full（`stages.json`） | `test` | `test` → 勝利で `ranged_test` → `1` → `2` → `eg_smoke` |
| demo（`stages-demo.json`） | `demo_ch1_01` | `demo_ch1_01` → 勝利で `demo_ch1_02` … `07`（最終は同 id 周回） |

**既存セーブ + flavor 不整合**

- `SaveManager` は `currentStageId` を **存在チェックせず** 文字列として読む
- `GameSession.loadSaveForMode` の `resolveKnownStageId` が **未知 id → `stages[0].id` に fallback**（例: full セーブ `currentStageId: "2"` を demo build で開く → `demo_ch1_01` に書き換えて保存）
- 勝利 / 敗北時も `getNextStageId` / `getPreviousStageId` が未知 id 時 `stages[0]` へ fallback
- **クラッシュより進行位置リセット** — fallback あり。`stages` が空のときだけ `resolveKnownStageId` が `null` を返し未修正 id のまま → `createEnemiesForStage` が throw（現データでは非該当）

**結論**

| 項目 | 判定 |
| ---- | ---- |
| demo 新規は `demo_ch1_01` から始まるか | **はい**（`BUILD_FLAVOR=demo` ビルド + 該当 save slot 空 + verify OFF の通常進行） |
| 既存セーブ持ち越し | **壊れにくい**が **stage 位置は先頭へリセット**（EXP・パーティは維持） |
| 追加 fallback 必須か | **現状不要**（`resolveKnownStageId` が既に単一経路）。改善するなら flavor 切替時の明示マイグレーション or ログ |
| `npm run dev` | **full のまま**（`BUILD_FLAVOR` 未設定）。demo 進行の手元確認は `build:demo` または `BUILD_FLAVOR=demo vitest` 系 |
| verify モード | デフォルト **ON**（`verifyMode.ts`）。save slot は `save:verify` / `save:release` で分離。通常進行の確認は verify OFF |

**6b-7 / 6b-8 でテスト済み**

- `createDefaultSave` + demo stages → `demo_ch1_01`（`stageProgression.flavor.test.ts`）
- `resolveKnownStageId('test')` → demo `stages[0]`（同上）
- `createEnemiesForStage` で `demo_ch1_01` の `at_swordsman` ×2 spawn（`entities.enemyGroups.flavor.test.ts`）

**Phase 7 以降に送る** — §7 参照（`GameSession` 統合、verify 初回体験、flavor 切替通知、`dev:demo`）

### Phase 6b-7 — demo flavor 初期 stage / fallback テスト（完了）

- 追加: `src/progression/stageProgression.flavor.test.ts`（`loadGameData.flavor.test.ts` と同様の `BUILD_FLAVOR` if/else）
- full: `createDefaultSave` → `test`、未知 id fallback → `test`
- demo: `createDefaultSave` → `demo_ch1_01`、`resolveKnownStageId('test')` → `demo_ch1_01`、`demo_ch1_02` 維持
- 実行: `vitest run src/progression/stageProgression.flavor.test.ts`（full 3 / demo 3 pass）、関連 `stageProgression.test.ts`・`loadGameData.flavor.test.ts`・`validateGameData.test.ts` pass

### Phase 6b-8 — demo 初回戦闘 spawn smoke（完了）

- 追加: `src/battle/entities.enemyGroups.flavor.test.ts`
- production code 変更なし
- demo（`BUILD_FLAVOR=demo`）: `loadGameData()` の `stages[0]` が `demo_ch1_01`；`createDefaultSave` の初期 stage が `demo_ch1_01`；`createEnemiesForStage` で `demo_ch1_01` の `enemyGroups` から `at_swordsman` ×2 が生成される
- full（デフォルト）: `demo_ch1_*` を含まない；`eg_smoke` が従来どおり 2 体 spawn
- 実行: full — `entities.enemyGroups.flavor.test.ts` + 関連 3 ファイル **17 passed**；demo — `BUILD_FLAVOR=demo` で flavor 3 ファイル **5 passed**
- 未カバー（Phase 7 以降）: §7「6b 未カバー」参照

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

## 7. Phase 6b 完了サマリ / Phase 7 作業計画

### 6b で確定した事実

| 観点 | 内容 |
| ---- | ---- |
| **demo データ** | `data/stages-demo.json` 存在。`demo_ch1_01`〜`07` の 7 stage。全て `enemyGroups` ベース。legacy `templateId` 未使用。`waves` は placeholder。`recommendedLevel` は全て **1** |
| **`BUILD_FLAVOR=demo`** | `@game-data/stages` alias で `stages-demo.json` に切替（`vite.config.ts` + `loadGameData.ts`）。`build:demo` / `build:full` 追加 |
| **flavor テスト** | `loadGameData.flavor.test.ts` — demo 7 件のみ / full は `eg_smoke` 含む・`demo_ch1_*` 不含 |
| | `stageProgression.flavor.test.ts` — `createDefaultSave` / `resolveKnownStageId` |
| | `entities.enemyGroups.flavor.test.ts` — `demo_ch1_01` の `createEnemiesForStage` smoke（`at_swordsman` ×2） |
| **full 側の保護** | default / full は `stages.json`。`demo_ch1_*` は含まれない。`eg_smoke` は維持 |
| **demo 新規進行** | 空 save slot + verify OFF → `stages[0]` = `demo_ch1_01` 起点（`createDefaultSave` + alias）。既存 save の未知 id は `stages[0]` へ fallback |
| **M1 方針** | レベル実装なし。EXP / `computeStageExpReward` / progression 接続は対象外。`recommendedLevel` は data 上 1、表示・設計メモ・将来用 |

### Phase 7 — M1 demo app flow / first-play guidance

**目的:** 起動 → ステージ選択 → 編成 → 戦闘 → リザルト → … → `demo_ch1_07` クリア → 体験版終了、まで **プレイヤー操作で迷わず進める**。Phase 2 レガシー（起動即戦闘・勝利後自動次ステージ・3 秒 `respawnAfterEnd`）を廃止。正本: [phase-roadmap.md §Phase 7](../plans/phase-roadmap.md)

**目標フロー（ハブ = ステージ選択）:** トップ → ステージ選択 → 編成 → 戦闘 → リザルト → ステージ選択（`demo_ch1_07` クリア後は体験版終了）

| 小タスク | 内容 | 状態 |
| -------- | ---- | ---- |
| **7a** | **demo app flow 調査** — 現行 `GameSession` / `BattleView` / `BattleEngine` の起動・勝敗・再スポーン経路を棚卸し。レガシー廃止点と verify 残置の切り分け | 未着手 |
| **7b** | **app screen state 骨格設計** — `title` / `map` / `party` / `battle` / `result` / `demoEnd` の画面状態と DOM ルート切替。`GameSession` 上の遷移 API 案 | 未着手 |
| **7c** | **トップ画面** — タイトル・Continue / New Game・設定入口 | 未着手 |
| **7d** | **ステージ選択画面** — `stages-demo.json` 一覧・詳細・出撃。spec: [stage-selection-ui.md](../spec/stage-selection-ui.md) | 未着手 |
| **7e** | **編成 → 戦闘開始導線** — 出撃確定時に `currentStageId` 反映 → battle 開始。`MetaMenuOverlay` / `SkillMenuPanel` 流用可否は 7a で判断 | 未着手 |
| **7e2** | **編成画面 M1 polish** — 見た目・読みやすさ・**選択済み 4 人枠**・**スキル説明カード**（コアは「編成だけ」）。**今すぐ大改修しない**。グラフィック方針・クラス画像反映 **後** → 現状棚卸し → 小改善。spec: [party-formation-ui.md](../spec/party-formation-ui.md) | 保留 |
| **7f** | **戦闘終了 → リザルト導線** — `respawnAfterEnd` 廃止、リザルト表示。Exp・`stageRecords` 更新（M1 必須 2 枠）。spec: [progression.md](../spec/progression.md) | 未着手 |
| **7g** | **first-play guidance / 敗北時導線** — 初回短いガイダンス文。敗北リザルトから編成見直しへ戻れる導線 | 未着手 |
| **7h** | **`demo_ch1_07` クリア後 体験版終了画面 / debug UI 整理** — 最終クリア遷移。`DebugMenuPanel` を verify 専用化（本番非表示方針。最終ゲートは Phase 9） | 未着手 |

**推奨着手順:** 7a → 7b → 7c/7d（並行可）→ 7e → **7e2（グラフィック方針・クラス画像反映後）** → 7f → 7g → 7h

**Phase 7 着手前に読む正本候補**

| 種別 | 候補 |
| ---- | ---- |
| spec | [stage-selection-ui.md](../spec/stage-selection-ui.md)、[progression.md](../spec/progression.md)、[party-formation-ui.md](../spec/party-formation-ui.md) |
| コード | `GameSession`、`BattleView`、`MetaMenuOverlay`、`DebugMenuPanel` 周辺 |
| roadmap | [phase-roadmap.md §Phase 7](../plans/phase-roadmap.md)（本 handoff は分割メモ。詳細は roadmap 正本） |

**Phase 7 未確定点（実装前に判断）**

| 項目 | メモ |
| ---- | ---- |
| `GameSession` 統合 smoke | 起動〜戦闘開始 UI 経路は 6b 未カバー。7a 調査後にテスト要否を決める |
| `respawnAfterEnd` | verify mode だけ旧経路（3 秒再スポーン）を残すか |
| 勝利時 `currentStageId` 自動進行 | いつ廃止するか（7b/7f と同時が自然。出撃確定時のみ ID 更新） |
| `DebugMenuPanel` / verify UI | 本番非表示方法（build flag / verify gate）。最終 demo ビルド無効化は Phase 9 |
| `MetaMenuOverlay` 流用 | 戦闘前編成画面（`party` 状態）として全画面表示できるか |
| `stageRecords` / best record | M1 でどこまで（2 枠・☆・リザルト/詳細表示は roadmap 必須。横断 Records ビューは Phase 14） |

**Phase 7 スコープ外（roadmap 準拠）:** Electron / itch zip（**Phase 9**）、英語 i18n 本番（**4e** — Phase 7 後）、キャラ画像・VFX・効果音判断（**Phase 8**）、6c 数値バランス

**6b 未カバー（Phase 7 / 9 に送る）**

- `GameSession` 統合経路（起動〜戦闘開始 UI）— 7a で調査
- verify モード **ON** 時の初回体験
- `dev:demo` script — **Phase 9**
- Electron packaging への `BUILD_FLAVOR` 伝播 — **Phase 9**
- demo 用 editor 切替 — 後続判断
- save slot / flavor 切替時のユーザー通知

### 後回し（6c / 8 / バックログ）

- [ ] **enemyGroups stage の EXP 集計** — `computeStageExpReward` は legacy のみ。M1 ではレベル接続しない
- [ ] **`test` / `1` / `2` の legacy → `enemyGroups` 移行** — Phase 8 向け
- [ ] legacy ステージを stage タブで `enemyGroups` へ変換する UI
- [ ] validate の classId allowlist subset 化（M1 8 クラス限定）
- [ ] 5 体以上 warning の cap 圧縮・多数敵 HUD 整理
- [ ] `attackSpeed` scale を `StageEnemyGroup` に追加するか
- [ ] 6c: `displayName` 4e、`count` / `hpScale` 等の難易度カーブ

## 8. やらないこと（全体）

- legacy データの即削除
- ステージ選択画面 UI
- [enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) のスキル参照分離（別 PR）
- 数値バランス調整
- `at_ballista` 専用 stage フラグ
- enemy-design-concept §12 の段階サブセット（Lv0/10/20 全解放が v0.3.2 正）

## 9. 未対応・未確定

### Phase 7（分割済み — §7 参照）

| 項目 | 内容 |
| ---- | ---- |
| 小タスク | 7a〜7h + **7e2**（すべて未着手。7e2 は保留 — グラフィック準備後） |
| 未確定 | §7「Phase 7 未確定点」表 |
| 停止地点 | **Phase 7 分割整理まで完了**。以後しばらく **グラフィック準備優先**。新規画面実装はグラフィック方針整理後 |

### Phase 9 / その他（Phase 7 外）

| 項目 | 内容 |
| ---- | ---- |
| packaging | `dev:demo`、Electron への `BUILD_FLAVOR` 伝播 — **Phase 9** |
| editor | demo 用 `stages-demo.json` 編集切替（後続判断） |
| flavor 切替 | save slot 切替時の stage リセット通知 |
| EXP / レベル | `enemyGroups` 撃破 EXP、`recommendedLevel` 実接続 — **M1 対象外** |

### 6c / 8 / バックログ（6b スコープ外）

| 項目 | 内容 |
| ---- | ---- |
| legacy ステージ移行 | `test` / `1` / `2` 未移行。`eg_smoke` / `ranged_test` のみ `enemyGroups` 化済み |
| validate allowlist | classId subset 化未実装 |
| 5 体以上 | エディタ warning のみ。cap 圧縮・HUD 整理未実装 |
| `attackSpeed` scale | 型・編集 UI 未実装 |
| legacy 変換 UI | read-only のみ |
| 旧敵テンプレ UI | E4b 導線整理済み。非表示・削除はしない |
| 6c 数値 | `displayName` 4e、`count` / scale 難易度カーブ |

## 10. demo stage テスト方針（2026-07 確定）

**運用意図の正本:** [docs/dev/balance-diagnostics.md](../dev/balance-diagnostics.md) — smoke / puzzle / 診断ログ（`[demo-6c-report]` 等）の目的・読み方・M1 スコープ

| 判断 | 内容 |
| ---- | ---- |
| 標準編成全勝 | **正解にしない**。Hensei Only は編成解法型 — baseline（`parties.json` demo: guardian / swordsman / cleric / ranger）で全 stage 勝利を要求しない |
| smoke test | **動作確認用**（`demoStageBalance.smoke.test.ts`）。victory/defeat 確定・timeout なし・極端な即終了なし・duration/survivors/remainingHp 記録。**勝利保証ではない** |
| balance / puzzle test | **別管理**（`demoStageBalance.puzzle.test.ts`）。stage ごとに bad / baseline / counter 編成差分を見る。6c 調整対象 |
| demo_ch1_06 / 07 | **対策編成で勝てること**を重視。baseline 敗北は許容。puzzle test は counter（例: paladin tank）勝利のみ要求 |

## 12. demo_ch1_07 弩砲士ボス枠 — 調査・最小実装（2026-07-05）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 本 handoff・制約 |
| 2 | `data/stages-demo.json` | `demo_ch1_07` 敵編成 |
| 3 | `docs/spec/classes-and-skills.md`（弩砲士節） | classId・スキル枠・Lv 段階 |
| 4 | `src/progression/stageProgression.ts` | ステージ進行・EXP（クリア報酬フックなし） |
| 5 | `src/progression/victoryRewards.ts` + `src/save/SaveManager.ts` | `unlockedClassIds` 保存 |
| 6 | `src/progression/partyCompose.ts` + `src/ui/SkillMenuPanel.ts` | 初期解禁リスト・編成 UI |

### 確認結果

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | 弩砲士 classId | **`at_ballista`**（`docs/spec/classes-and-skills.md`・`data/skills/actives/at_ballista.json` と一致） |
| 2 | Lv0 / Lv10 / Lv20 スキル | **Lv0:** `passive_1`・`passive_2`・`active_1`（破城矢装填）・`active_2`（重矢）。**Lv10:** `passive_3`（城塞穿ち）・`active_3`（重撃態勢）。**Lv20:** `passive_4`（粉砕する大矢）・`active_4`（**貫く一射**・`targetShape: pierce`） |
| 3 | Lv20 貫通が体験版敵に出ないか | **`recommendedLevel` 2 の敵は `resolveLearnedSkills(class, 2)` で Lv10/20 枠を除外**。`getUnlockedSkillSlotCount(2) === 2` のため装備 active は Lv0 の 2 枠のみ。**`at_ballista_active_4` は戦闘に入らない** |
| 4 | クラス解放を SaveData で管理しているか | **はい** — `SaveGameState.unlockedClassIds`（`SaveManager` 読書・`createDefaultSave` 初期化） |
| 5 | 未解放クラスの UI | **`SkillMenuPanel.getPickerVisibleClassIds()` が `unlockedClassIds` のみ表示**。未解放を gray / disabled で見せる仕組みは**なし**（リスト外＝非表示） |
| 6 | ステージクリア報酬の差し込み箇所 | **`GameSession` 勝利処理 → `applyVictoryRewards`**（EXP・`currentStageId`・`totalClears`）。**クラス解禁を追加する既存フックはない** |

### クラス解禁 — 現状と最小設計案（実装は見送り）

- **既存:** `unlockedClassIds` + 編成 UI フィルタはある。**ステージクリアで classId を追加する処理は未実装**。
- **注意:** `partyCompose.DEFAULT_ROSTER_EXTRAS.demo` に **`at_ballista` を含む M1 外クラスが既に列挙**されており、新規セーブでは編成 UI から既に選べる（verify / dev 向けと推定）。M1 本番の「クリア後解禁」とは矛盾。
- **Phase 7 以降の最小案（大改修なし）:**
  1. `DEFAULT_ROSTER_EXTRAS.demo` から M1 外（`at_ballista` 含む）を外し、初期解禁は `parties.json` の 4 クラスのみにする
  2. `StageDef` に任意 `unlockClassIdsOnClear?: ClassId[]` を追加（または `demo_ch1_07` 専用定数 1 件）
  3. `applyVictoryRewards` 末尾で `unlockClassIdsOnClear` を `save.unlockedClassIds` に merge（重複除去）
  4. 体験版終了画面（7h）で「弩砲士解禁」を案内
- **今回スコープ外:** 上記 1〜3 のコード変更（UI 大改修・progression 接続禁止に従う）

### 実装（データのみ）

- **`demo_ch1_07`:** `at_ranger` ×1 を **`at_ballista` ×1** に差し替え（総数 6 維持）。役割はパラディン／サポ前衛の後方からの重撃（高 Max HP 狙い・重矢・破城矢装填）。scale: `hpScale 0.9` / `atkScale 0.85`（他 1.0）。`atkScale 1.0` では baseline 全滅となり puzzle 閾値を超えたため 6c 微調整
- **貫通射線（Lv20）を前提にしたステージ名・課題文は変更しない**（`displayName`「護法の陣」維持）

### テスト方針

- `npm test -- src/battle/demoStageBalance.smoke.test.ts`
- `validateGameData.test.ts`（stages-demo）
- puzzle: `demo_ch1_07` counter 勝利が維持するか

## 13. 体験版クラス解放状態 — 調査・最小実装案（2026-07-05）

> **コード変更なし**。調査と実装案の整理のみ。§12（弩砲士敵配置）を前提とする。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | §12 前提・制約 |
| 2 | `src/save/SaveManager.ts` | セーブ読込・v1 マイグレーション |
| 3 | `src/progression/victoryRewards.ts` | 新規セーブ初期化・勝利報酬 |
| 4 | `src/progression/partyCompose.ts` | `DEFAULT_ROSTER_EXTRAS`・`buildDefaultUnlockedClassIds` |
| 5 | `src/ui/SkillMenuPanel.ts` + `src/ui/MetaMenuOverlay.ts` | 編成 UI の `unlockedClassIds` 参照 |
| 6 | `src/game/GameSession.ts` + `data/parties.json` | 勝利フック・demo 初期パーティ |

### 確認結果（6 項目）

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | **`DEFAULT_ROSTER_EXTRAS.demo` の定義・役割** | **定義:** `src/progression/partyCompose.ts` の定数。**役割:** `buildDefaultUnlockedClassIds` が `parties.json` の在籍 classId に加えて merge し、**新規セーブの初期 `unlockedClassIds`** を決める。`docs/spec/classes-and-skills.md` §デモ編成も「残り 11 クラスは extras でアンロック」と記載。**verify / dev 向けに全クラス近くを最初から解禁**する意図と読める |
| 2 | **`unlockedClassIds` 初期化・マイグレーション** | **新規:** `createDefaultSave` → `buildDefaultUnlockedClassIds(party, 'demo')`。**読込 v2+:** JSON の `unlockedClassIds` をそのまま parse（空配列はエラー）。**v1 移行:** `mergeMigrationUnlockedClassIds(party)` が **全 `DEFAULT_ROSTER_EXTRAS` 値を union**（party 在籍 + extras 全 partyId 分）。その後 `migrateSaveClassIds` で classId エイリアス置換・dedupe のみ。**ロード時に extras と再同期する処理はない** |
| 3 | **編成 UI が `unlockedClassIds` を参照するか** | **はい。** `GameSession` → `MetaMenuOverlay.openParty` → `SkillMenuPanel(unlockedClassIds)`。クラス一覧は `getPickerVisibleClassIds()` = `unlockedClassIds` を `classOrder` ソート。スロット差し替え候補は `getAssignableClassIds` も同リストを使用 |
| 4 | **未解放の hidden / disabled 導線** | **hidden のみ（実質）。** 未解放 classId はピッカーに出ない。gray / disabled ティーザー UI は**なし**。[party-formation-ui.md](../spec/party-formation-ui.md) も「未解禁クラスは出さない」と明記。`disabled` は **4 人枠満杯時の追加不可**（別仕様） |
| 5 | **勝利時 `applyVictoryRewards` フック** | **あり。** `GameSession.handleVictory` → `applyVictoryRewards(save, gameData, curves, survivingIndices)`。現状は EXP・`currentStageId` 進行・`totalClears++` のみ。**クラス解禁処理は未接続** |
| 6 | **`demo_ch1_07` クリアで `at_ballista` 解禁の最小範囲** | 下記「最小実装案」参照。触るのは **extras 整理 + StageDef 1 フィールド + `applyVictoryRewards` 数行 + validate 薄い追記 + テスト** 程度。UI / SaveManager / GameSession の構造変更は不要 |

### `DEFAULT_ROSTER_EXTRAS.demo` の現状（2026-07-05）

```text
parties.json demo 在籍（4）: df_guardian, at_swordsman, sp_cleric, at_ranger
extras（11）: df_paladin, df_duelist, at_assassin, at_lancer, at_ballista,
              at_hunter, at_sorcerer, at_sigilist, at_conductor,
              sp_wardweaver, sp_alchemist
→ 新規セーブ初期解禁 = 15 クラス（ほぼ全クラス）
```

**M1 方針（roadmap / handoff §6b-0）との差分**

| 区分 | classId |
| ---- | ------- |
| M1 初期解禁 8（`at_ballista` 除く） | `df_guardian` `df_paladin` `at_swordsman` `at_assassin` `at_ranger` `at_sorcerer` `sp_cleric` `sp_wardweaver` |
| extras にあって M1 外（初期から外す候補） | `df_duelist` `at_lancer` `at_hunter` `at_sigilist` `at_conductor` `sp_alchemist` |
| **クリア報酬で足す** | `at_ballista`（`demo_ch1_07`） |

### `unlockedClassIds` の現状フロー

```text
新規セーブ
  createDefaultSave
    → party（parties.json）
    → unlockedClassIds = party 在籍 ∪ DEFAULT_ROSTER_EXTRAS.demo

既存セーブ読込
  SaveManager.parseSaveGameState
    → unlockedClassIds は保存値をそのまま使用（extras 再計算なし）
    → migrateSaveClassIds（エイリアスのみ）

編成 UI
  SkillMenuPanel ← save.unlockedClassIds（非解禁は非表示）
```

### 最小実装案（Phase 7 着手用）

#### A. 初期解禁から `at_ballista` を外す

| 変更 | 内容 |
| ---- | ---- |
| **`partyCompose.ts`** | `DEFAULT_ROSTER_EXTRAS.demo` を **M1 8 のうち parties.json 非在籍 4 件のみ**に縮小: `df_paladin` `at_assassin` `at_sorcerer` `sp_wardweaver`。M1 外 6 + `at_ballista` を削除 |
| **影響ファイル** | `partyCompose.ts`（主）。`docs/spec/classes-and-skills.md` §デモ編成 1 行（extras 数・意図の更新）。`mergeMigrationUnlockedClassIds` は v1 専用のため **v1 セーブ初回ロード時の解禁集合が変わる** — 注記のみ |
| **verify モード** | 現状 verify も同一 `createDefaultSave` 経路。**全クラス検証が必要なら** `VERIFY_ROSTER_EXTRAS` を別定数化し `buildDefaultUnlockedClassIds` で `isVerifyMode` 分岐（任意・小差分） |

#### B. `demo_ch1_07` クリア報酬のデータ形式案

**推奨: `StageDef` 任意フィールド（データ駆動・1 ステージ 1 配列）**

```json
{
  "id": "demo_ch1_07",
  "displayName": "護法の陣",
  "recommendedLevel": 2,
  "unlockClassIdsOnClear": ["at_ballista"],
  "enemyGroups": [ "..."]
}
```

| 案 | メリット | デメリット |
| -- | -------- | ---------- |
| **`unlockClassIdsOnClear` on StageDef**（推奨） | `stages-demo.json` だけで完結。full `stages.json` 無影響。将来ステージ報酬に拡張しやすい | `types.ts` + `validateGameData.ts` に薄い schema 追加 |
| コード内 `const DEMO_FINALE_UNLOCK = ['at_ballista']` | validate 不要 | データとコード二重管理。editor / 手編集と乖離 |
| `stageRecords` 側に記録 | 再クリア判定と相性良い | M1 では `stageRecords` 未接続が多く **範囲が広い** |

**validate 追記（最小）:** `unlockClassIdsOnClear` は任意 `ClassId[]`。存在する classId のみ。重複は normalize で除去。

#### C. 勝利報酬の差し込み最小箇所

```text
GameSession.handleVictory          … 変更不要（既に applyVictoryRewards を呼ぶ）
applyVictoryRewards                … 末尾（totalClears++ の後）に追加
  1. clearedStageId = save.stageProgress.currentStageId（更新前の id）
  2. stage = getStageById(gameData.stages, clearedStageId)
  3. for (id of stage?.unlockClassIdsOnClear ?? [])
       save.unlockedClassIds に merge（Set dedupe）
  4. VictoryRewardResult に newlyUnlockedClassIds?: ClassId[] を返す（任意・7f リザルト用）
```

**二重解禁:** 同ステージ再クリアでも merge のみ → 冪等。**ループ周回（`demo_ch1_07` 末尾）** でも問題なし。

#### D. 既存セーブで既に `at_ballista` を持っている場合

| ケース | 推奨扱い |
| ------ | -------- |
| `unlockedClassIds` に既に `at_ballista` あり | **維持（剥奪しない）**。ロード時に extras 再計算しないため自然に満たす |
| パーティ枠に `at_ballista` 在籍だが `unlockedClassIds` に無い（異常） | **現状コードは strip しない**。編成 UI で再選択不可になる可能性 — **M1 では放置可**。必要なら Phase 7 で「在籍 classId は unlocked に自動追加」1 行 |
| v1 セーブ初回マイグレーション | `mergeMigrationUnlockedClassIds` が **新 extras** を使う → M1 外が入らなくなる。**既存 v2 セーブは影響なし** |
| `demo_ch1_07` 未クリアの新規セーブ | `at_ballista` 非表示。クリア後に初めてピッカーに出現 |

#### E. UI: hidden vs disabled

| 方式 | 判定 |
| ---- | ---- |
| **hidden（現状維持）** | **推奨。** 既存 `SkillMenuPanel` + [party-formation-ui.md](../spec/party-formation-ui.md) と一致。**UI 大改修不要** |
| disabled + シルエット表示 | M2 グレーアウト・「Full version」文言（roadmap）向け。**新 DOM / i18n / CSS が必要** — Phase 7 スコープ外 |

**クリア直後のフィードバック:** 7f リザルト or 7h 体験版終了画面で `newlyUnlockedClassIds` を表示。編成画面を開けばピッカーに出現するだけでも M1 最低限は成立。

#### F. 必要なテスト（実装時）

| テスト | 内容 |
| ------ | ---- |
| **新規** `victoryRewards.unlock.test.ts`（または既存ファイル追記） | `createDefaultSave` の `unlockedClassIds` に **`at_ballista` が含まれない**こと。M1 8 のみ含むこと |
| 同上 | `applyVictoryRewards` を `demo_ch1_07` クリア相当で呼ぶと `at_ballista` が追加されること。2 回目は増えないこと |
| `validateGameData.test.ts` | `stages-demo.json` の `unlockClassIdsOnClear` が parse 成功すること |
| `saveClassMigration.test.ts` | 既存セーブの `unlockedClassIds` が load 後も維持されること（回帰） |
| **任意** `stageProgression.flavor.test.ts` | 新規 demo セーブの解禁数が 8 であること |
| **回帰** `demoStageBalance.*.test.ts` | 編成 harness は `createDefaultSave` 利用 — extras 変更で counter 編成が `createMemberFromClass('df_paladin')` 等できなくなる場合は **harness 側で `unlockedClassIds` を明示補完**（paladin 等は初期 8 に残るためおそらく不要） |

### 触らなかった範囲（今回）

- 一切の production コード・JSON 変更
- `StageGenerator` / `StageRecipe`
- `SkillMenuPanel` / `MetaMenuOverlay` の UI 改修
- `SaveManager` ロードロジック変更
- `docs/spec/progression.md` 正式追記（Phase 7 実装確定時に同期）
- verify 用全クラス解禁の分岐実装

### 残課題

- **実装 PR:** §13 最小案 A〜F の適用（Phase 7f 前後が自然）
- **verify 全クラス:** extras 縮小後の verify 編成 — 別定数 or debug 上書きの要否判断
- **spec 同期:** `classes-and-skills.md` §デモ編成、`progression.md` に `unlockedClassIds` / ステージ解禁の 1 節（実装確定時）
- **リザルト UI:** `newlyUnlockedClassIds` の表示（7f）
- **体験版終了:** `demo_ch1_07` クリア後の弩砲士案内（7h）
- **M1 外 6 クラス:** 体験版では非表示のまま（M2 以降の解禁設計は未着手）

## 14. demo_ch1_04 healer puzzle 再確立（2026-07-05）

### 変更

- **`data/stages-demo.json` `demo_ch1_04` の `enemyGroups` scale のみ**（他 stage・クラスデータ未変更）
  - 敵 `df_guardian`: `hpScale 1.15→1.65`, `atkScale 1.0→1.3`, `defScale 1.1→1.12`, `resScale 1.0→1.45`
  - 敵 `sp_cleric`: `hpScale 0.95→1.38`, `resScale 1.0→1.4`
  - 敵 `at_swordsman` ×2: `hpScale 0.95→1.12`, `atkScale 1.05→1.32`
- **`demoStageBalance.puzzle.test.ts`**: noHealer = defeat または remainingHp≤100、universal durationSec>55 を要求
- **`demoStageSim.harness.ts`**: ch1_04 診断ログ文言のみ

### 調整前後（puzzle quad）

| 編成 | 調整前 | 調整後 |
| ---- | ------ | ------ |
| baseline | victory 670/670 122s | victory 670/670 **164s** |
| noHealer | victory 416/680 91s | **defeat** 0/680 **60s** |
| universal | victory 642/642 **48s** | victory 642/642 **61s**（満血のまま） |
| counter (paladin) | victory 650/650 72s | victory 650/650 **97s**（baseline より速く・満血 — 診断で報告） |

### 原因メモ

- noHealer 勝利の主因: 戦闘短縮（~90s）でガーディアン被ダメ蓄積不足 + アサシン DPS
- 調整: 敵 HP/RES で戦闘延長、敵 ATK で無ヒーラー耐久を落とす。味方 cleric heal（~660）がガーディアン被ダメ（~700）を相殺し baseline 満血勝利を維持
- universal: sorcerer 火力で ~61s 決着。敵 RES 上げで 48s→61s に改善するが、味方 cleric が被ダメをほぼ回復し **642 満血のまま** — 追加調整は ch1_04 導線の「やりすぎ」回避のため今回止め

### テスト

- `demoStageBalance.puzzle.test.ts` — 9 passed（Vitest worker `onTaskUpdate` timeout ノイズ 1 件、pass/fail には非影響）
- `demoStageBalance.smoke.test.ts` — 8 passed
- `demo_ch1_07` — データ未変更、単体実行で counter 勝利 / baseline 敗北を確認

## 15. demo_ch1_06 混成 puzzle 調整（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `data/stages-demo.json` | `demo_ch1_06` enemyGroups |
| 3 | `src/battle/demoStageBalance.puzzle.test.ts` | puzzle 期待値・ch1_06 診断 |
| 4 | `src/battle/test/demoStageSim.harness.ts` | 編成 quad・6c 診断ログ |
| 5 | `src/battle/demoStageBalance.smoke.test.ts` | smoke 回帰 |
| 6 | （実行）`demoStageBalance.puzzle.test.ts -t demo_ch1_06` | 調整前診断ログ |

### 変更

- **`data/stages-demo.json` `demo_ch1_06` の `enemyGroups` scale のみ**（ch1_04 / ch1_07 / クラスデータ未変更）
  - `df_paladin`: `hpScale 1.05→1.1`, `atkScale 0.85→1.05`, `resScale 1.0→1.18`
  - `at_ranger` ×2: `hpScale 0.85→0.98`, `atkScale 0.85→1.02`, `resScale 1.0→1.28`
  - `at_sorcerer`: `hpScale 0.85→0.98`, `atkScale 0.85→1.02`, `resScale 1.0→1.45`
  - `at_swordsman`: `hpScale 0.9→0.97`, `atkScale 0.9→1.08`

### 調整前後（puzzle quad）

| 編成 | 調整前 | 調整後 |
| ---- | ------ | ------ |
| baseline | victory 670/670 **66.8s** | victory 670/670 **73.7s** |
| bad (no-healer) | victory 272/680 **67.0s** (3 survivors) | **defeat** 0/680 **81.9s** |
| universal | victory 451/642 **42.0s** | victory 258/642 **46.3s** (3 survivors) |
| counter (paladin) | victory 650/650 **51.8s** | victory 608/650 **54.3s** |

### 原因メモ

- **bad 勝利:** 戦闘 ~67s で cleric 不在でも ranger DPS（~423）が敵を先に落とす。guardian 被ダメ（~298）が baseline（~355）より低く、assassin 死亡（110 taken / 6 dealt）でも 272 HP 残勝ち
- **universal 余裕勝ち:** sorcerer AoE（465 dmg + dot）で **42s 決着**。cleric heal（432）が guardian 被ダメ（544）を相殺し 451 HP 残存
- **調整方針:** 敵 `atkScale` 小幅上げで無ヒーラー／前衛被ダメ増、敵 `resScale`（RES）上げで sorcerer 短期決着を抑え、前衛 `hpScale` 微増で baseline 満血勝利維持。大幅 hpScale 増は避けた

### 主要 damage / healing 差分（調整後）

| 指標 | baseline | bad | universal | counter |
| ---- | -------- | --- | --------- | ------- |
| guardian/paladin damageTaken | 547 | 300（全滅前） | 623 | 594 |
| sp_cleric healingDealt | 524 | — | 502 | 386 |
| at_ranger / at_sorcerer damageDealt | 483 (ranger) | 495 (ranger) | 472 (sorcerer) | 451 (ranger) |

### テスト

- `demoStageBalance.puzzle.test.ts` — **9 passed**（Vitest worker `onTaskUpdate` timeout ノイズあり、pass/fail 非影響）
- `demoStageBalance.smoke.test.ts` — **8 passed**
- `demo_ch1_04` / `demo_ch1_07` — データ未変更、full puzzle run で回帰なし

## 11. ChatGPT へ戻すときのメモ

- **Phase 6b 完了** — 6b-1〜6b-8 済み。§7 6b サマリが正本
- **Phase 7 分割整理済み** — 小タスク 7a〜7h + **7e2**（編成画面 M1 polish）。未確定点・着手前正本は **§7**
- **次にやるなら:** **グラフィック準備**（キャラ画像方針・VFX/効果音判断は Phase 8 だが並行整理可）。Phase 7 実装再開時は **7a demo app flow 調査** から
- **roadmap 改定（2026-07）:** M1 優先は 6 → 7 → 4e → 8 → 9 → itch。packaging は **Phase 9**
- **M1 固定**: レベル実装しない。EXP / progression 接続は触らない
- **6c 進行**: `demo_ch1_04` healer puzzle 再確立済み（§14）。`demo_ch1_06` 混成 puzzle 調整済み（§15）。**at_assassin 診断追加済み（§16）** — ch1_05 が受け皿候補。ch1_05 数値調整は未着手
- 詳細履歴: §6（6b-0〜6b-8、E3〜E5）

## 16. at_assassin M1 活躍場診断（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | 診断基盤方針 |
| 3 | `data/stages-demo.json` | ch1_04〜07 敵編成 |
| 4 | `data/parties.json` | demo 標準編成 |
| 5 | `src/battle/test/demoStageSim.harness.ts` | シミュ harness |
| 6 | `src/battle/demoStageBalance.puzzle.test.ts` | puzzle quad |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| **新規** `src/battle/test/assassinRoleReport.ts` | `[demo-assassin-role-report]` / `[demo-assassin-coverage-summary]` 生成 |
| **新規** `src/battle/demoStageAssassinCoverage.test.ts` | ch1_04〜07 診断テスト（ログ中心・最小 assertion） |
| `src/battle/test/demoStageSim.harness.ts` | `assassinUnitId` 追跡、`logDemoAssassinRoleReportsForQuad/ForRuns`、`configureAssassinInsteadOfRangerParty` / `configureAssassinDoubleFinishParty` |
| `docs/dev/balance-diagnostics.md` | §5b assassin diagnostics 追記 |

**触らなかった:** `data/stages-demo.json`、`data/parties.json`、`classes.json` / skills、戦闘ロジック、UI

### 診断結果サマリ（puzzle quad — assassin は bad/no-healer のみ）

| stage | assassin 出番 | roleVerdict | 要点 |
| ----- | ------------- | ----------- | ---- |
| `demo_ch1_04` | bad のみ | **ROLE_UNMET** | damageDealt=90、前衛 `at_swordsman` 100% 吸い込み。defeat @40s |
| `demo_ch1_05` | bad のみ | **ROLE_UNMET** | 早期脱落 @12s、damageDealt=22。ただし **spotlight 編成では ROLE_OK**（下記） |
| `demo_ch1_06` | bad のみ | **ROLE_UNMET** | 早期脱落 @9s、damageDealt=6。敵火力 + 前衛タンクで寄与前に落ちる |
| `demo_ch1_07` | bad のみ | **ROLE_UNMET** | 早期脱落 @11s、damageDealt=6。finale 火力で execute 前に脱落 |

**baseline / universal / counter には assassin 不在** — 既存 puzzle 導線では「勝ち筋編成」に assassin は入らない。

### ch1_05 spotlight probe（受け皿候補）

| 編成 | outcome | roleVerdict | 要点 |
| ---- | ------- | ----------- | ---- |
| `assassin-ranger-slot` | victory | **ROLE_OK** | priority share 100%、`at_assassin` last-hit。damageDealt=50（脱落あり） |
| `assassin-double-finish` | defeat | **ROLE_OK** | priority share 100%、sorcerer + assassin へ分散。execute band は機能 |
| `no-healer` | victory | **ROLE_OK** | cleric 枠 assassin でも priority 100%（ただし @18s 脱落） |

**結論:** 既存 ch1_04/06/07 では **プレイヤー assassin の活躍場はない**（bad 枠のみ・ROLE_UNMET）。**`demo_ch1_05`（炎と刃 — 敵 sorcerer×2 + assassin×2）が受け皿候補** — 意図的に assassin を ranger/cleric 枠へ入れると priority ターゲット処理・last-hit が確認できる。**今回 ch1_05 数値調整は未実施**。

### クラス弱い vs ステージ側に活躍場がない

| 観点 | 判定 |
| ---- | ---- |
| ch1_05 spotlight | assassin **挙動自体は execute band に刺さる**（priority share / last-hit OK） |
| ch1_04/06/07 bad | **ステージ設計 + 編成導線** の問題が大きい — baseline/counter に assassin を選ぶ理由がなく、bad では早期脱落 |
| 前衛吸い込み | ch1_04 bad で `df_guardian`/`at_swordsman` 100% — 低 HP 対象到達前に前衛処理 |
| 早期脱落 | ch1_06/07 bad は **敵火力 + ヒーラー不在** が主因。assassin 単体耐久設計の問題というより bad 編成の必然 |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/battle/demoStageAssassinCoverage.test.ts` | **5 passed** |
| `npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |
| `npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **9 passed**（Vitest worker `onTaskUpdate` timeout **ノイズ 1 件** — pass/fail 非影響、exit code 1） |
