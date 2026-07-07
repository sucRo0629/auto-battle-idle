# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: **Phase 7 体験版導線**（M1 demo app flow / first-play guidance）
- 状態: **Phase 6b 完了**（6b-1〜6b-8）。**Phase 7d〜7g 最小実装済み**（§26〜29）。**§30 で verify OFF main flow 成立を確認**。残タスクは §30「残タスク」
- **2026-07 roadmap 改定:** [phase-roadmap.md](../plans/phase-roadmap.md) — 旧 6d → **Phase 7**（app flow）、新 **Phase 8**（presentation）、旧 Electron → **Phase 9**（packaging）。本編は **Phase 10** へ
- **Phase 7 目的:** M1 体験版として、**起動から `demo_ch1_07` クリアまで迷わず進めるアプリ導線**を作る（配布 zip は Phase 9）
- **現状画面:** verify OFF 起動は **map**（`StageSelectionPanel`）→ 編成（`MetaMenuOverlay`）→ 戦闘。**未実装:** トップ / リザルト / 体験版終了
- **並行・未達:** キャラ画像（並行作業中）、VFX 未実装、効果音未実装
- **当面方針:** 新規ソース実装は止め、Phase 7 整理後は **グラフィック準備優先**。新規画面実装はグラフィック方針整理後に再開
- **verify OFF 勝利時 currentStageId 維持済み（§33）**
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
| **7a** | **demo app flow 調査** — 現行 `GameSession` / `BattleView` / `BattleEngine` の起動・勝敗・再スポーン経路を棚卸し。レガシー廃止点と verify 残置の切り分け | **調査済み**（§30） |
| **7b** | **app screen state 骨格設計** — `title` / `map` / `party` / `battle` / `result` / `demoEnd` の画面状態と DOM ルート切替。`GameSession` 上の遷移 API 案 | **一部実装**（`map` / `party` / `battle` のみ。`title` / `result` / `demoEnd` 未着手） |
| **7c** | **トップ画面** — タイトル・Continue / New Game・設定入口 | 未着手 |
| **7d** | **ステージ選択画面** — `stages-demo.json` 一覧・詳細・出撃。spec: [stage-selection-ui.md](../spec/stage-selection-ui.md) | **最小接続済み**（§26） |
| **7e** | **編成 → 戦闘開始導線** — 出撃確定時に `currentStageId` 反映 → battle 開始。`MetaMenuOverlay` / `SkillMenuPanel` 流用可否は 7a で判断 | **確認済み**（§27） |
| **7e2** | **編成画面 M1 polish** — 見た目・読みやすさ・**選択済み 4 人枠**・**スキル説明カード**（コアは「編成だけ」）。**今すぐ大改修しない**。グラフィック方針・クラス画像反映 **後** → 現状棚卸し → 小改善。spec: [party-formation-ui.md](../spec/party-formation-ui.md) | 保留 |
| **7f** | **戦闘終了 → リザルト導線** — `respawnAfterEnd` 廃止、リザルト表示。Exp・`stageRecords` 更新（M1 必須 2 枠）。spec: [progression.md](../spec/progression.md) | **verify OFF 勝利後 map 復帰 最小実装済み**（§28）。リザルト画面・報酬演出は未着手 |
| **7g** | **first-play guidance / 敗北時導線** — 初回短いガイダンス文。敗北リザルトから編成見直しへ戻れる導線 | **verify OFF map 汎用ガイド + 敗北後 formation 復帰 最小実装済み**（§29・§31）。敗北リザルト UI は未着手 |
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
| `GameSession` 統合 smoke | **`gameSessionWire.test.ts` でカバー**（§27・§30） |
| `respawnAfterEnd` | **verify ON:** 勝利・敗北とも 3 秒後 `reloadBattlefield`。**verify OFF 勝利:** map 遷移で tick 停止のため実質未使用。**verify OFF 敗北:** 現状も `respawnAfterEnd` で同一 battle 画面再戦 |
| 勝利時 `currentStageId` 自動進行 | **verify OFF は維持（§33）** / verify ON は従来どおり。sortie 時に出撃 stage を反映 |
| `DebugMenuPanel` / verify UI | 本番非表示方法（build flag / verify gate）。最終 demo ビルド無効化は Phase 9 |
| `MetaMenuOverlay` 流用 | **成立** — sortie 後 `menuHost.open('party')` で全画面編成（§27） |
| `stageRecords` / best record | M1 でどこまで（2 枠・☆・リザルト/詳細表示は roadmap 必須。横断 Records ビューは Phase 14） |

**Phase 7 スコープ外（roadmap 準拠）:** Electron / itch zip（**Phase 9**）、英語 i18n 本番（**4e** — Phase 7 後）、キャラ画像・VFX・効果音判断（**Phase 8**）、6c 数値バランス

**6b 未カバー（Phase 7 / 9 に送る）**

- ~~`GameSession` 統合経路（起動〜戦闘開始 UI）~~ — `gameSessionWire.test.ts` でカバー（§30）
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
| 小タスク | **7d〜7g 最小実装済み**（§26〜29・§31）。**7a 調査・§30 棚卸し済み**。未着手: **7c** トップ、**7f** リザルト、**7h** 体験版終了。**7e2** 保留 |
| 未確定 | §7「Phase 7 未確定点」表（一部 §30 で解消） |
| 停止地点 | **verify OFF main flow 成立**（§30）。次は **7c / 7f / 7g / 7h** またはグラフィック準備 |

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
- **次にやるなら:** **7c トップ / 7f リザルト / 7h 体験版終了**（§30 残タスク）。並行で **グラフィック準備** 可
- **roadmap 改定（2026-07）:** M1 優先は 6 → 7 → 4e → 8 → 9 → itch。packaging は **Phase 9**
- **M1 固定**: レベル実装しない。EXP / progression 接続は触らない
- **6c 進行**: **§35 P1** — `demo_ch1_04` / `demo_ch1_06` scale 再調整（§34 棚卸し受け）。ch1_01 のみ default-answer。§14/§15 は履歴
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

## 17. at_assassin vs at_swordsman 同枠比較診断（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | 診断基盤方針 |
| 3 | `data/stages-demo.json` | ch1_04〜07 敵編成（参照のみ・未変更） |
| 4 | `data/parties.json` | demo 標準編成 |
| 5 | `src/battle/test/demoStageSim.harness.ts` | シミュ harness |
| 6 | `src/battle/demoStageAssassinCoverage.test.ts` | 既存 assassin 診断 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| **新規** `src/battle/test/assassinVsSwordsmanReport.ts` | `[demo-assassin-vs-swordsman-survival]` / `[demo-assassin-vs-swordsman-summary]` |
| **新規** `src/battle/demoStageAssassinVsSwordsman.test.ts` | ch1_04〜07 no-healer 枠 + ch1_05 ranger-slot 比較 |
| `src/battle/test/demoStageSim.harness.ts` | `configureNoHealerSwordsmanParty` / `configureSwordsmanInsteadOfRangerParty` |
| `docs/dev/balance-diagnostics.md` | §5c assassin vs swordsman 診断追記 |

**触らなかった:** `data/stages-demo.json`、`classes.json` / skills、戦闘ロジック、`resolveApproachBattleX.ts`、contact cap / ranged chase、active_2 条件、UI

### 比較枠

| partyLabel | assassin | swordsman | stages |
| ---------- | -------- | --------- | ------ |
| `no-healer-cleric-slot` | cleric 枠 → assassin | cleric 枠 → swordsman | ch1_04〜07 |
| `ranger-slot-finish` | ranger 枠 → assassin | ranger 枠 → swordsman | ch1_05 |

### ch1_04〜07 verdict（no-healer-cleric-slot）

| stage | verdict | 読み |
| ----- | ------- | ---- |
| `demo_ch1_04` | **BOTH_FAIL_STAGE_PRESSURE** | 両 variant 脱落（assassin @50s dealt=122 前衛100%吸い込み / swordsman @38.6s dealt=71）。no-healer 編成欠陥 + 敵火力 |
| `demo_ch1_05` | **ASSASSIN_ROLE_OK** | assassin @11s 脱落だが priority 100%（敵 assassin へ）。swordsman は生存・last-hit×2。**役割対象は刺さるが耐久差あり** |
| `demo_ch1_06` | **ASSASSIN_SURVIVAL_WEAK** | swordsman 生存・172 dealt / assassin @9.3s dealt=6 前衛吸い込み。**基礎耐久差が顕著** |
| `demo_ch1_07` | **ASSASSIN_ROLE_OK** | 両方 defeat だが assassin は priority 100%（6 dealt @10.6s）。swordsman は @39.3s まで前衛処理。**finale 火力下では編成/ステージ圧が主因** |

### ch1_05 ranger-slot-finish verdict

| 枠 | verdict | 読み |
| -- | ------- | ---- |
| `ranger-slot-finish` | **ASSASSIN_ROLE_OK** | assassin priority 100%・@19s 脱落（defeat）/ swordsman 勝利・218 dealt・last-hit sorcerer+assassin。**ch1_05 は assassin 受け皿として成立** — spotlight `assassin-ranger-slot` と整合 |

### 早期脱落主因（今回ログから）

| 主因 | 該当 |
| ---- | ---- |
| **基礎耐久差** | ch1_06（ASSASSIN_SURVIVAL_WEAK）。ch1_05 でも swordsman 生存 vs assassin @11–19s 脱落 |
| **no-healer / 編成欠陥** | ch1_04 BOTH_FAIL（両方脱落）。全 stage の no-healer 枠で note 付与 |
| **敵火力・ステージ圧** | ch1_04 / ch1_07（defeat または両 variant 低 HP）。ch1_06 bad 編成の文脈と一致 |
| **接敵・移動・ターゲット** | `firstBasicActionSec` は全 run ~5.7–6.5s で遅延なし。**主因ではない** |
| **前衛吸い込み** | ch1_04 assassin frontline 100%。ch1_06 assassin frontline 100% + 即落ち |

### クラスデータ vs ステージ/編成

| 判定 | 推奨 |
| ---- | ---- |
| ch1_05 | **ステージ/編成側を先に見る** — priority band・last-hit が機能。M1 導線で ch1_05 を assassin 受け皿として提示可能 |
| ch1_06 | **耐久差は疑うがクラス即調整しない** — no-healer 枠 + 前衛吸い込み。puzzle bad 意図と整合 |
| ch1_04 / ch1_07 | **編成 puzzle / ステージ圧** — クラス弱さ単独では説明不足 |
| 全体 | `classes.json` 触る前に **healer 必須導線・ch1_05 編成ヒント・bad 枠の意図** を M1 flow（Phase 7）で整理 |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/battle/demoStageAssassinCoverage.test.ts` | **5 passed** |
| `npm test -- src/battle/demoStageAssassinVsSwordsman.test.ts` | **6 passed** |
| `npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |
| `npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **9 passed**（Vitest worker `onTaskUpdate` timeout **ノイズ 1 件** — pass/fail 非影響、exit code 1） |

## 18. demo_ch1_05 assassin 正式化診断（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | 診断基盤方針 |
| 3 | `data/stages-demo.json` | `demo_ch1_05` 敵編成（参照のみ・未変更） |
| 4 | `data/parties.json` | demo 標準編成 |
| 5 | `src/battle/test/demoStageSim.harness.ts` | シミュ harness |
| 6 | `src/battle/demoStageAssassinCoverage.test.ts` | 既存 assassin 診断 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| **新規** `src/battle/test/ch1_05AssassinFormalizationReport.ts` | `[demo-ch1_05-slot-comparison]` / `[demo-ch1_05-puzzle-quad]` / `[demo-ch1_05-assassin-formalization]` |
| **新規** `src/battle/demoStageCh1_05AssassinFormalization.test.ts` | ranger slot 4 枠 + puzzle quad + cleric bad 枠 + double-finish probe |
| `docs/dev/balance-diagnostics.md` | §5d ch1_05 formalization 追記 |

**触らなかった:** `data/stages-demo.json`、`data/parties.json`、`classes.json` / skills、戦闘ロジック、UI

### 既存 puzzle / spotlight 編成（ch1_05）

| ラベル | 編成 | outcome（今回 run） | assassin 観点 |
| ------ | ---- | ------------------- | ------------- |
| **baseline** | guardian / swordsman / cleric / ranger | **victory** ~386/670 @~20s | assassin 不在 |
| **bad** | cleric → assassin（no-healer） | **victory** ~353/680 | ROLE_UNMET（早期脱落・damage 微量） |
| **universal** | ranger → sorcerer | victory ~44/642 @~29s | assassin 不在 |
| **counter** | guardian → paladin | **victory** ~564/650 @~21s | assassin 不在。**puzzle counter は paladin** |
| **spotlight** `assassin-ranger-slot` | ranger → assassin（healer 維持） | victory/defeat **RNG で揺れる** | **ROLE_OK** priority 100% |
| **spotlight** `assassin-double-finish` | cleric + ranger → assassin×2 | defeat 多め | ROLE_OK priority 100% |

### ranger slot substitute 比較

| partyLabel | slot3 | 要点 |
| ---------- | ----- | ---- |
| `ranger-slot-baseline` | ranger | victory、backline share ~58% |
| `ranger-slot-assassin` | assassin | **ROLE_OK** priority 100% — outcome RNG 依存 |
| `ranger-slot-swordsman` | swordsman | victory、last-hit sorcerer+assassin |
| `ranger-slot-sorcerer` | sorcerer | victory（低 HP 残） |

### 正式化 verdict

| 項目 | 判定 |
| ---- | ---- |
| **体験版 spotlight 候補として正式化** | **可** — `EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK` |
| **default 負け → assassin counter 勝ち puzzle** | **不可** — baseline 勝利。puzzle counter は paladin |
| **assassin 固有の勝ち筋** | **弱い** — ranger / swordsman / sorcerer も ranger slot で勝てる |
| **ログで assassin を使う理由** | **説明可** — priority share / last-hit / execute band |
| **クラス・ステージ数値** | **まだ触らない** — 編成導線（Phase 7）を先に |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/battle/demoStageCh1_05AssassinFormalization.test.ts` | **3 passed** |
| `npm test -- src/battle/demoStageAssassinCoverage.test.ts` | **5 passed** |
| `npm test -- src/battle/demoStageAssassinVsSwordsman.test.ts` | **6 passed** |
| `npm test -- src/battle/demoStageBalance.puzzle.test.ts -t demo_ch1_05` | **1 passed** |

## 19. M1 ターゲット優先分類診断 — 弓術士 vs 双刃士（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | 診断基盤 |
| 3 | `data/skills/passives/at_ranger.json` / `at_assassin.json` | targetRuleOverride 正本 |
| 4 | `src/battle/skills/targetSpec.ts` | `resolveTargetSpec` / `matchesAttackType` |
| 5 | `src/battle/test/rangerTargetReport.ts` / `assassinRoleReport.ts` | 診断 band |
| 6 | `src/battle/resolveApproachBattleX.ts` | 味方通常攻撃ターゲット経路 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| **新規** `src/battle/test/m1TargetClassificationReport.ts` | `[demo-m1-target-classification]` |
| **新規** `src/battle/demoStageM1TargetClassification.test.ts` | 静的 band 診断（production 非変更） |
| `docs/dev/balance-diagnostics.md` | §7.5 M1 ターゲット優先分類表 |
| `docs/ai-handoff/current-task.md` | 本節 |

**触らなかった:** `classes.json` / stages / contact cap / approach / active_2 / 戦闘ロジック本体

### 結論（要点）

| 項目 | 結果 |
| ---- | ---- |
| 弓術士 | `at_ranger_passive_2` → `attackType.ranged`（`rangePx >= 100`） |
| 双刃士 | `at_assassin_passive_2` → `stat.hp order lowest`（全敵） |
| healer / support | **`sp_cleric` / `sp_wardweaver` は ranged プールに含まれる**（role ではなく rangePx） |
| 差が最も出る相手 | **`at_ballista`**（ranger yes / assassin 開幕 low-HP になりにくい） |
| 次 | **docs 整理優先**。`targetRuleOverride` 変更は別 PR |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/battle/demoStageM1TargetClassification.test.ts` | **1 passed** |

## 20. M1 ターゲット分類 docs 整理（2026-07-06）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | §7.5 整理対象 |
| 3 | `docs/spec/classes-and-skills.md`（参照） | P 番号・用語（実装正本は json + targetSpec） |
| 4 | `data/classes.json`（Grep） | rangePx 正本 |
| 5 | `src/battle/skills/targetSpec.ts` | `matchesAttackType` / `RANGED_ATTACK_MIN_PX` |
| 6 | `src/battle/demoStageM1TargetClassification.test.ts` | 診断テスト |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `docs/dev/balance-diagnostics.md` | §7.5 を再構成 — 現行実装 vs 設計意図 vs 将来候補、classId 表、healer overlap、実装変更なし明記 |
| `docs/ai-handoff/current-task.md` | §11 次候補更新、本節 |

**触らなかった:** `targetSpec.ts` / `classes.json` / `stages-demo.json` / 戦闘ロジック / contact cap / approach / active_2 / UI

### 要点

- 弓術士 ranged = `rangePx >= 100`（`role` 不参照）。`sp_cleric` / `sp_wardweaver` 含む
- 双刃士 = 全生存敵 lowest HP（P3 25% は与ダメ倍率のみ）
- 設計仮説: support を rangedDamage から外すと弓術士・双刃士の役割分離が進む — **今回は docs のみ**

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/battle/demoStageM1TargetClassification.test.ts` | **1 passed** |

## 21. 弓術士 rangedDamage 整理 — 実装前影響調査（2026-07-07）

**コード変更なし**。調査・最小仕様案のみ。

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/dev/balance-diagnostics.md` | §7.5 正本 |
| 3 | `data/classes.json`（shell rg） | rangePx / role |
| 4 | `src/battle/skills/targetSpec.ts` | `matchesAttackType` / `resolveTargetSpec` |
| 5 | `src/battle/data/validateGameData.ts` | `parseTargetSpec` / `targetRuleOverride` |
| 6 | `src/battle/demoStageM1TargetClassification.test.ts` | 診断テスト |

### 結論（要点）

| 項目 | 内容 |
| ---- | ---- |
| 推奨案 | **案B** — `attackType` に任意 `excludeRoles` を追加し、`at_ranger_passive_2` のみ `{ ranged: true, excludeRoles: ["supporter"] }` に差し替え |
| 案A 不採用理由 | `matchesAttackType` 全体変更 → 双刃士 `enemyReelIn`・他スキルまで supporter 除外が波及 |
| 案C 不採用理由 | 新 `classId` spec + allowlist 保守。将来クラス追加に弱い |
| P3/P4 | 同じ `attackType.ranged` を参照。**意味整合のため同 PR で揃える推奨**（M1 は Lv10/20 未解放のため即時影響なし） |
| approach / chase | `excludeRoles` 案なら `ranged: true` を維持 → `hasRangedPriorityChaseTargetRule` 変更不要 |

### 実装時テスト候補

`targetSpec.test.ts`（supporter + rangePx≥100 除外）、`demoStageM1TargetClassification.test.ts`（cleric/wardweaver ranged pool = false）、`atRangerSkills.test.ts`（P3/P4 同時変更時）、`validateGameData.test.ts`、`formatSkillText.test.ts`、回帰 `demoStageBalance.*`

## 22. 弓術士 rangedDamage — excludeRoles 実装（2026-07-07）

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/battle/types.ts` | `TargetSpec` / `DamageIncreaseCondition` の `attackType` に `excludeRoles?: Role[]` |
| `src/battle/skills/targetSpec.ts` | `matchesAttackType` で `excludeRoles` 除外 |
| `src/battle/data/validateGameData.ts` | `parseExcludeRoles` / `parseAttackTypeFields` |
| `data/skills/passives/at_ranger.json` | P2/P3/P4 に `excludeRoles: ["supporter"]` |
| `src/battle/test/m1TargetClassificationReport.ts` | 弓術士 P2 spec 経由の `inRangerRangedPool` |
| `docs/dev/balance-diagnostics.md` | §7.5 実装後状態 |

**触らなかった:** `classes.json` / `stages-demo.json` / `resolveApproachBattleX.ts` / contact cap / ranged chase / approach / active_2 / 他クラス `attackType.ranged`

### 要点

- 案B: `attackType.ranged` + `excludeRoles: ["supporter"]` を弓術士 P2/P3/P4 に適用
- `sp_cleric` / `sp_wardweaver` は弓術士 ranged プール **外**。双刃士 low-HP プール **内**（変更なし）
- グローバル `rangePx >= 100` は維持。`df_duelist_active_2` 等は波及なし

## 23. excludeRoles 後 — demo バランス診断ログ再取得（2026-07-07）

**コード・データ変更なし**。§22 実装後の診断テスト再実行とログ比較のみ。

### 読んだファイル（6 件）

| # | ファイル |
| - | -------- |
| 1 | `docs/ai-handoff/current-task.md` |
| 2 | `docs/dev/balance-diagnostics.md` |
| 3 | `src/battle/demoStageM1TargetClassification.test.ts` |
| 4 | `src/battle/demoStageAssassinCoverage.test.ts` |
| 5 | `src/battle/demoStageAssassinVsSwordsman.test.ts` |
| 6 | `src/battle/demoStageBalance.puzzle.test.ts`（+ 実行で `demoStageCh1_05AssassinFormalization` / `smoke`） |

### excludeRoles 後に変わった診断ログ

| 観点 | §16〜18 時点 | 今回（§22 後） |
| ---- | ------------ | -------------- |
| M1 分類 | `sp_cleric` / `sp_wardweaver` ranger pool **yes** | **no**（`rangerRangedPool=false`） |
| ch1_07 bad assassin | `priorityTargetDamageShare=0%`、前衛吸い込み | **`priorityTargetDamageShare=100%`**、`primaryTarget=at_assassin`（support 処理がログで見える） |
| ch1_07 ranger | （未記録） | `primaryTarget=at_ballista`、`BACKLINE_OK`、backline share 100% |
| ch1_05 ranger baseline | sorcerer 主対象 | 同様 — `at_sorcerer` + `at_assassin`、support なし |
| ch1_04 bad assassin | frontline 100% ROLE_UNMET | **同様**（defeat @~52–58s、frontline 100%） |
| ch1_05 formalization | `EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK` | **同じ** |
| ch1_05 vs swordsman verdict | `ASSASSIN_ROLE_OK` | **同じ** |

### ステージ別（puzzle quad 文脈）

| stage | 変化 |
| ----- | ---- |
| **ch1_05** | spotlight 判断 **維持** — `EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK`。assassin ROLE_OK はログで説明可だが ranger / swordsman / sorcerer も ranger slot で勝てる |
| **ch1_04** | no-healer 前衛吸い込み・assassin ROLE_UNMET **維持**。単体実行では bad=**defeat**（§14 意図どおり）。full puzzle 9 件一括では bad が **victory hp=120** で 1 回 flaky fail（RNG 疑い） |
| **ch1_06** | bad=defeat、verdict `ASSASSIN_SURVIVAL_WEAK` **維持** |
| **ch1_07** | finale 構図 **維持**（baseline/bad/universal defeat、counter victory）。ranger は **at_ballista 優先**のまま |

### クラス・ステージ数値を触るべきか

| 判定 | 理由 |
| ---- | ---- |
| **今回は触らない** | ch1_05 spotlight・ch1_06/07 puzzle 意図は維持。役割分離はログで改善 |
| **将来候補** | ch1_04 healer puzzle が full suite で flaky なら stage scale またはテスト閾値の再確認（**今回は数値調整しない**） |
| **Phase 7** | ch1_05 を assassin experience spotlight（編成ヒント）として M1 flow に載せる |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `demoStageM1TargetClassification.test.ts` | **1 passed** |
| `demoStageAssassinCoverage.test.ts` | **5 passed** |
| `demoStageAssassinVsSwordsman.test.ts` | **6 passed** |
| `demoStageCh1_05AssassinFormalization.test.ts` | **3 passed** |
| `demoStageBalance.smoke.test.ts` | **8 passed** |
| `demoStageBalance.puzzle.test.ts`（full） | **8 passed / 1 failed** — ch1_04 `noHealerMarginal`（bad victory hp=120）。Vitest worker `onTaskUpdate` timeout **ノイズ 1 件** |
| `demoStageBalance.puzzle.test.ts -t demo_ch1_04`（単体） | **1 passed** — bad=defeat hp=0 @58s |

## 24. ch1_05 assassin experience spotlight — 編成ヒント導線調査（2026-07-07）

**コード・データ変更なし**。Phase 7 編成ヒント向けの最小実装方針の調査のみ。

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/spec/stage-selection-ui.md` | ステージ詳細ブロック（7d 予定） |
| 3 | `docs/spec/party-formation-ui.md` | 編成画面責務・§5.4 拡張注記 |
| 4 | `data/stages-demo.json`（`demo_ch1_05` のみ） | 現行 stage フィールド |
| 5 | `src/battle/types.ts`（`StageDef`） | 型・既存任意フィールド |
| 6 | `src/platform/menuHost.ts` + `DomFormationScreenHost.ts` + `DebugMenuPanel.ts`（Grep） | 編成 / debug 導線の現状 |

### 1. ステージ別ヒント導線の現状

| 画面 | 状態 |
| ---- | ---- |
| **ステージ選択 / 詳細** | **未実装**（7d）。`stage-selection-ui.md` は敵編成・想定 Lv・出撃のみ。**戦術ヒント / 編成ヒントのブロックなし** |
| **編成画面**（`SkillMenuPanel` / `MetaMenuOverlay`） | **`currentStageId` 未参照**。ステージ文脈の表示導線なし |
| **戦闘 HUD**（`BattleView`） | ステージ名プレートのみ。**ヒントなし** |
| **DebugMenuPanel** | 選択 stage の `enemyGroups` 編成 preview（verify 専用）。**プレイヤー向けヒントではない** |
| **7g first-play guidance** | 初回汎用ガイド予定。**ステージ別 spotlight とは別** |

### 2. 既存データ構造

`StageDef`（`types.ts`）の任意フィールドは **`recommendedLevel` / `enemyGroups` / `unlockClassIdsOnClear`** のみ。

- `formationHint` / `tacticalHint` / `recommendedSwap` / `experienceSpotlight` 相当 — **なし**
- `validateGameData.ts` にも hint 用 parse — **なし**
- `party-formation-ui.md` §5.4 — 「ステージが要求する編成の正解表示や警告ではない（**Phase 6 以降の拡張**）」と明記。**experience spotlight は必須カウンターではない** 方針と整合

### 3. ch1_05 ヒントを置くならどこが自然か

| 案 | 評価 |
| -- | ---- |
| **`StageDef` 任意 `formationHintJa?: string`**（推奨） | `unlockClassIdsOnClear` と同型の薄い stage メタ。`stages-demo.json` の `demo_ch1_05` のみに 1 文。StageGenerator 不要。full `stages.json` 無影響 |
| コード内 `const DEMO_CH1_05_HINT` | validate 不要だがデータ二重管理。editor / 手編集と乖離 |
| `classes.json` `summary.ja`（双刃士） | **不適** — クラス一般説明であり stage spotlight ではない。「このステージで試す」文脈を載せられない |
| `recommendedSwap` 構造（slot → classId） | **不採用** — assassin 必須 puzzle に読める。`EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK` と矛盾 |

**文言の正本:** `data/stages-demo.json` `demo_ch1_05.formationHintJa`（フィールド名は実装時確定。`briefingJa` でも可）

**文案（短め・推奨）:**

> 双刃士は低HPの敵を優先します。削れた後衛や瀕死の敵を仕留める役として試してみましょう。

（長文案も可。assassin 必須・他解法否定・必勝断定は書かない）

### 4. UI 大改修なしの最小表示案

| 優先 | 表示場所 | 差分規模 | 備考 |
| ---- | -------- | -------- | ---- |
| **A（7d 正本）** | ステージ詳細パネル「敵編成」の下に **1 行テキストプレート** | 7d 実装時に `formationHintJa` を読むだけ | `stage-selection-ui.md` §3 に 1 行追記で spec 同期 |
| **B（7d 前の暫定）** | 編成画面上部に **細い HUD プレート**（`game-panel-surface`） | `MenuHostContext` に `getCurrentStageId` 追加 → `MetaMenuOverlay` / `SkillMenuPanel` で stage 参照・文言表示。**DOM 1 ブロック + CSS 数行** | 編成ヒント導線として最も直結。レイアウト再設計不要 |
| **C（補助）** | 戦闘 HUD ステージプレート直下 | `BattleView` に同じフィールド表示 | 編成を開く前にも見えるが、**主目的は編成判断**のため B or A を優先 |

**触るファイル（実装時・最小）:** `types.ts`、`validateGameData.ts`（任意 string 1 本）、`stages-demo.json`（ch1_05 のみ）、表示先 1 か所（B なら `menuHost.ts` / `MetaMenuOverlay.ts` または `SkillMenuPanel.ts`）、薄い CSS、任意テスト 1 件

**触らない:** `classes.json` / skills、stage scale、`resolveApproachBattleX.ts`、contact cap / approach、StageGenerator、編成画面レイアウト大改修（7e2）

### 5. 実装タイミング

- **今回:** 調査のみ。production / JSON **未変更**
- **推奨着手:** Phase **7d**（ステージ詳細）と同 PR、または 7d 前に **案 B 暫定** のみ先行（1 stage・1 文）

### 6. テスト（今回）

コード変更なしのため **テスト未実行**。

## 25. ch1_05 formationHintJa 最小実装（2026-07-07）

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/battle/types.ts` | `StageDef.formationHintJa?: string` |
| `src/battle/data/validateGameData.ts` | 任意 string として parse |
| `data/stages-demo.json` | `demo_ch1_05` のみ `formationHintJa` 追加 |
| `src/ui/stageDetailDom.ts` | 敵編成セクション + ヒント 1 行プレート描画 |
| `src/ui/StageSelectionPanel.ts` | 7d 用ステージ一覧・詳細（ヒントは敵編成直下） |
| `src/styles/stage-selection-panel.css` | 詳細・ヒント最小スタイル |
| `src/ui/StageSelectionPanel.test.ts` | ch1_05 表示 / 他 stage 非表示 |
| `src/battle/data/validateGameData.test.ts` | stages-demo `formationHintJa` 期待値 |
| `docs/spec/stage-selection-ui.md` | §3 編成ヒント 1 行 |

**触らなかった:** `classes.json` / skills、stage scale、`resolveApproachBattleX.ts`、contact cap / approach、編成画面、戦闘 HUD、`stages.json`、`GameSession` 導線接続（7d 本体 wire は別 PR）

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `validateGameData.test.ts` | **18 passed** |
| `StageSelectionPanel.test.ts` | **2 passed** |

## 26. Phase 7d — StageSelectionPanel demo app flow 最小接続（2026-07-07）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/spec/stage-selection-ui.md` | 7d 導線正本 |
| 3 | `src/ui/StageSelectionPanel.ts` | 一覧・詳細・出撃 UI |
| 4 | `src/game/GameSession.ts` | 画面 state・save・戦闘開始 |
| 5 | `src/main.ts` + `src/game/gameScreen.ts` | app entry・`GameScreen` 型 |
| 6 | `src/platform/DomFormationScreenHost.ts` + `src/ui/BattleView.ts`（Grep） | 編成導線・verify / Debug 周辺 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/game/gameScreen.ts` | `GameScreen` に `'map'` 追加 |
| `src/game/StageSelectionScreenHost.ts` | **新規** — `StageSelectionPanel` の mount / show / hide |
| `src/game/GameSession.ts` | `mapHost`・sortie ハンドラ・非 verify 起動時 `map` 表示 |
| `src/styles/game-shell.css` | `.game-shell__map` |
| `src/game/stageSelectionWire.test.ts` | **新規** — currentStageId 同期・sortie callback |
| `docs/ai-handoff/current-task.md` | 本節 |

**触らなかった:** `BattleView` / 戦闘 HUD、`classes.json` / skills、`stages-demo.json` 数値、`MetaMenuOverlay` 大改修、`stageRecords` / リザルト導線、verify 時の起動画面

### demo app flow / screen state 確認結果

| 項目 | 内容 |
| ---- | ---- |
| 起動（`main.ts`） | `GameSession` 生成 → `start()` → RAF tick |
| 画面 state（接続前） | `'battle' \| 'formation'` のみ。`setGameScreen` で host 表示切替 |
| verify ON（既定） | 起動 **battle**。`DebugMenuPanel` で stage loop / 編成 preview。`MetaMenuOverlay` は party ボタンから |
| verify OFF（release） | 接続前は起動即 battle。編成は map 経由なし |
| 勝敗後 | 勝利で `applyVictoryRewards` が `currentStageId` 自動進行（レガシー）。`respawnAfterEnd` 相当は verify 側に残置 |
| `currentStageId` | `save.stageProgress.currentStageId`。`resolveKnownStageId` で正規化 |

### 接続内容

| 項目 | 内容 |
| ---- | ---- |
| 接続先 | `GameSession` の新 `mapHost`（`.game-shell__map`） |
| データ | `gameData.stages` + `save.stageProgress.currentStageId` を `StageSelectionScreenHost` 経由で `StageSelectionPanel` へ |
| 起動画面 | **verify OFF → `map`**。verify ON → 従来どおり `battle`（Debug 導線維持） |
| 出撃 | `currentStageId` 更新 → `restartBattle` → `menuHost.open('party')`（既存編成全画面）→ 編成の「戦闘へ」で `battle` |
| `formationHintJa` | `StageSelectionPanel` / `stageDetailDom` 経由で **維持**（ch1_05 のみ表示） |
| 未接続（意図的） | 勝利後 map 復帰（7f）、トップ画面（7c）、map へ戻る battle HUD ボタン、level sync、stageRecords 表示 |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `stageSelectionWire.test.ts` | **2 passed** |
| `StageSelectionPanel.test.ts` | **2 passed** |

## 27. Phase 7e — map → party → battle 導線確認（2026-07-07）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `src/game/GameSession.ts` | sortie / screen state / restartBattle |
| 3 | `src/game/StageSelectionScreenHost.ts` + `src/ui/StageSelectionPanel.ts` | map 出撃 UI |
| 4 | `src/platform/menuHost.ts` + `DomFormationScreenHost.ts` | 編成 open / close |
| 5 | `src/game/gameScreen.ts` | `GameScreen` 型 |
| 6 | `src/game/stageSelectionWire.test.ts` | 既存 wire テスト |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/game/gameSessionWire.test.ts` | **新規** — verify ON/OFF 起動画面、sortie → formation → battle、`currentStageId` 維持 |
| `docs/ai-handoff/current-task.md` | 本節 |

**production code 変更なし** — 7d 接続で導線は成立。`restartBattle` タイミングも現状維持。

### map → party → battle 確認結果

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | 出撃 → `menuHost.open('party')` | `handleStageSortie` → `currentStageId` 更新 → `restartBattle` → `menuHost.open('party')`。**成立** |
| 2 | 編成中の `currentStageId` | `save.stageProgress.currentStageId` に保持。編成 UI は stage 非参照（意図どおり）。sortie 後も **維持** |
| 3 | 編成「戦闘へ」→ 選択 stage の battle | `SkillMenuPanel` の `returnToBattle` → `MetaMenuOverlay.onClose` → `DomFormationScreenHost.close` → `setGameScreen('battle')`。`engine.tick` は battle 画面のみ。sortie 時 `restartBattle` 済みの戦場が **選択 stage** で開始 |
| 4 | verify ON Debug 導線 | 起動 `battle` 維持。`openPartyMenu` → formation → close で **同一 `currentStageId`**。map sortie 不要。**壊れていない** |
| 5 | verify OFF 体験版 | 起動 `map`。出撃のみが formation 入口（map 上に party ボタンなし）。**map 起点維持** |
| 6 | `restartBattle` タイミング | **出撃時**（編成前）に 1 回。編成中スロット変更でも再実行。formation 中は `engine.tick` 停止のため戦闘は進行しない |
| 7 | 戦闘生成を編成確認後へ寄せる案 | **今回は未実装**。verify の「戦闘中 party 確認 → close で restart しない」経路と両立するには `pendingSortie` フラグ等が必要。**構造変更が大きいため見送り** |

### `restartBattle` 維持理由（1 行）

verify 中の party close は restart しない設計のため、sortie 専用の「編成 close 時 restart」へ寄せると分岐が増える。出撃時 restart + formation 中 tick 停止で M1 要件は満たす。

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | **4 passed** |
| `stageSelectionWire.test.ts` | **2 passed** |
| `StageSelectionPanel.test.ts` | **2 passed** |

## 28. Phase 7f — verify OFF 勝利後 map 復帰 最小実装（2026-07-07）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `src/game/GameSession.ts` | 勝敗処理・画面 state |
| 3 | `src/progression/victoryRewards.ts` | `applyVictoryRewards` / `currentStageId` 進行 |
| 4 | `src/battle/BattleEngine.ts`（`respawnAfterEnd` / `battleEnd`） | verify 側の自動再スポーン経路 |
| 5 | `src/game/StageSelectionScreenHost.ts` | map 表示時の `selectStage` 同期 |
| 6 | `src/game/gameSessionWire.test.ts` | 既存 wire テスト拡張 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/game/GameSession.ts` | `handleVictory` 末尾 — **verify OFF のみ** `setGameScreen('map')` |
| `src/game/gameSessionWire.test.ts` | 勝利後 map 復帰・`currentStageId` 進行・verify ON は battle 維持 |
| `docs/ai-handoff/current-task.md` | 本節 |

**触らなかった:** `BattleEngine` / `respawnAfterEnd`、`classes.json` / skills、`stages-demo.json` 数値、リザルト UI、unlock toast、`stageRecords`、敗北導線、編成画面

### battle result / victory 処理

| 項目 | 内容 |
| ---- | ---- |
| 終了検知 | `BattleEngine` → `battleEnd` イベント（`victory` / `defeat`） |
| 勝利 | `GameSession.handleVictory` → EXP ログ → `applyVictoryRewards` → `resolveVictoryNextStageId`（verify loop 上書き可）→ `stageDamageStats.reset` |
| 敗北 | `handleDefeat` → verify loop 時は rollback なし。通常は `applyStageRollbackOnDefeat`（先頭 stage は stay） |
| verify ON 再戦 | `BattleEngine.respawnAfterEnd`（3 秒後 `reloadBattlefield`）— **維持** |
| verify OFF 勝利後 | `setGameScreen('map')` — engine tick 停止のため `respawnAfterEnd` は走らない。次出撃で `restartBattle` |

### `currentStageId` 進行

`applyVictoryRewards` 内で `getNextStageId(stages, clearedStageId)` → `save.stageProgress.currentStageId` 更新。最終 stage は同 id 周回。map 復帰時 `StageSelectionScreenHost.show()` が `selectStage(currentStageId)` で一覧選択を同期。

### verify OFF map 復帰

**実装済み** — `handleVictory` 末尾 3 行。

### verify ON Debug 導線

勝利後も `battle` 画面維持。`respawnAfterEnd` 経路・loop stage 上書き・party メニュー導線はテストで確認。**壊れていない**。

### 敗北時

**現状維持** — battle 画面のまま。rollback 後 `respawnAfterEnd` で同一画面再戦（verify OFF）。map へは戻さない。

### `unlockClassIdsOnClear` 表示

**後回し** — データ・`applyVictoryRewards` 処理は既存。ステージ詳細 UI への表示・解禁 toast は未実装（今回スコープ外）。

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | **6 passed** |
| `stageSelectionWire.test.ts` | **2 passed** |
| `victoryRewards.unlock.test.ts` | **5 passed** |

## 29. Phase 7g — verify OFF first-play guidance 最小実装（2026-07-07）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `docs/spec/stage-selection-ui.md` | map / 詳細 UI 正本 |
| 3 | `src/ui/StageSelectionPanel.ts` | 一覧・詳細・出撃 |
| 4 | `src/ui/stageDetailDom.ts` | 敵編成・`formationHintJa` |
| 5 | `src/styles/stage-selection-panel.css` | 既存 panel スタイル |
| 6 | `src/game/StageSelectionScreenHost.ts` + `GameSession.ts` | verify OFF map 導線 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/ui/stageDetailDom.ts` | `FIRST_PLAY_GUIDANCE_JA`・`STAGE_FIRST_PLAY_GUIDANCE_CLASS` |
| `src/ui/StageSelectionPanel.ts` | `showFirstPlayGuidance` オプション・パネル上部 1 行 |
| `src/styles/stage-selection-panel.css` | guidance プレート・`panel-body` grid 分離 |
| `src/game/StageSelectionScreenHost.ts` | `showFirstPlayGuidance` を panel へ転送 |
| `src/game/GameSession.ts` | verify OFF 時 `!verifyMode` で host へ渡す |
| `src/ui/StageSelectionPanel.test.ts` | guidance 表示 / 非表示 |
| `src/game/stageSelectionWire.test.ts` | host 経由の ON/OFF |
| `src/game/gameSessionWire.test.ts` | verify OFF/ON で DOM 有無 |
| `docs/spec/stage-selection-ui.md` | §2 初回ガイド 1 行 |
| `docs/ai-handoff/current-task.md` | 本節 |

**触らなかった:** `classes.json` / skills、`stages-demo.json` 数値、save 既読フラグ、overlay / modal、編成画面、戦闘 HUD、`formationHintJa` データ・表示経路、敗北導線

### first-play guidance

| 項目 | 内容 |
| ---- | ---- |
| 表示場所 | `StageSelectionPanel` ルート上部（一覧・詳細 grid の上） |
| 表示条件 | **verify OFF**（`GameSession` → `StageSelectionScreenHost(..., !verifyMode)`）。既読フラグなし・常時表示 |
| 文言 | ステージ情報を見て出撃し、編成画面で役割を調整してください。戦闘は自動で進みます。 |
| `formationHintJa` | 敵編成直下の stage 別ヒント（ch1_05 のみ）— **別ブロック・別クラスで競合なし** |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `StageSelectionPanel.test.ts` | **4 passed** |
| `stageSelectionWire.test.ts` | **4 passed** |
| `gameSessionWire.test.ts` | **6 passed** |

## 30. Phase 7d〜7g 体験版導線棚卸し — verify OFF main flow 確認（2026-07-08）

**production code 変更なし**。コード読取 + 既存 wire テスト再実行のみ。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `src/game/GameSession.ts` | verify ON/OFF 起動・sortie・勝敗・画面遷移 |
| 2 | `src/game/gameSessionWire.test.ts` | main flow 統合 wire |
| 3 | `src/game/stageSelectionWire.test.ts` | map / sortie / guidance wire |
| 4 | `src/ui/StageSelectionPanel.ts` | first-play guidance・formationHintJa |
| 5 | `src/progression/victoryRewards.ts` | `applyVictoryRewards` / `currentStageId` 進行 |
| 6 | `src/dev/verifyMode.ts` | verify 既定 ON・save slot 分離 |

### verify OFF main flow 確認結果

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | 起動画面 = map | **成立** — `setGameScreen(verifyMode ? 'battle' : 'map')`（`GameSession` L171） |
| 2 | first-play guidance（map 上部） | **成立** — verify OFF 時 `StageSelectionScreenHost(..., !verifyMode)` → `STAGE_FIRST_PLAY_GUIDANCE_CLASS` |
| 3 | `demo_ch1_05` `formationHintJa`（敵編成直下） | **成立** — `StageSelectionPanel.test.ts` / `stageDetailDom.ts` |
| 4 | 出撃 → `currentStageId` 更新 → party | **成立** — `handleStageSortie` → save 更新 → `restartBattle` → `menuHost.open('party')` |
| 5 | 編成 → battle | **成立** — `skill-menu-return-to-battle-button` → `setGameScreen('battle')` |
| 6 | 勝利 → `applyVictoryRewards` → map 復帰 | **成立** — `currentStageId` 進行 + verify OFF のみ `setGameScreen('map')`。map 一覧は `selectStage` で同期 |

**一連導線:** map → stage detail → sortie → party formation → battle → victory → next stage map — **verify OFF で成立**

### verify ON Debug flow 確認結果

| 項目 | 結果 |
| ---- | ---- |
| 起動画面 | **battle**（従来どおり） |
| 勝利後 | **battle 維持**。`applyVictoryRewards` で `currentStageId` 進行。`respawnAfterEnd` 経路維持 |
| 編成 | map 不要で `openPartyMenu()` → formation → battle。**壊れていない** |

### 敗北時の現状（§31 formation 復帰 → §32 で verify OFF rollback 停止）

| 項目 | 内容 |
| ---- | ---- |
| verify OFF | **formation 復帰** — `restartBattle` + `menuHost.open('party')`。**`currentStageId` は維持**（§32）。自動再戦なし |
| verify ON | **battle 維持** + `respawnAfterEnd`（~3 秒後 `reloadBattlefield`）— 従来どおり |
| 進行 | **verify ON のみ** `applyStageRollbackOnDefeat`（先頭 stay / それ以外 1 つ前）。verify loop 時は rollback なし |
| 未実装 | 敗北リザルト UI・map 復帰・retry ボタン |

### 残タスク（Phase 7 以降・今回やらない範囲）

| 優先 | 項目 | 備考 |
| ---- | ---- | ---- |
| **7c** | トップ画面（Continue / New Game） | 現状 verify OFF は map 直起動 |
| **7f** | リザルト画面・報酬演出 | 勝利後は map 直行。`stageRecords` 表示未接続 |
| **7h** | `demo_ch1_07` クリア後 体験版終了 / Debug UI 整理 | `unlockClassIdsOnClear` 通知も未着手 |
| **7e2** | 編成画面 M1 polish | グラフィック方針後。大改修しない |
| **§13** | `DEFAULT_ROSTER_EXTRAS.demo` 縮小 + `unlockClassIdsOnClear` 接続 | データ・progression 最小案あり |
| — | battle HUD から map 戻るボタン | スコープ外 |
| — | level sync / per-group level | M1 対象外 |
| — | `stageRecords` 横断ビュー | Phase 14 |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `StageSelectionPanel.test.ts` | **4 passed** |
| `stageSelectionWire.test.ts` | **4 passed** |
| `gameSessionWire.test.ts` | **8 passed** |
| `victoryRewards.unlock.test.ts` | **5 passed** |
| **合計** | **21 passed** |

## 31. Phase 7g — verify OFF 敗北後 formation 復帰 最小実装（2026-07-08）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | handoff・制約 |
| 2 | `src/game/GameSession.ts` | `handleDefeat` / `handleVictory` / screen state |
| 3 | `src/progression/stageProgression.ts` | `applyStageRollbackOnDefeat` |
| 4 | `src/battle/BattleEngine.ts` | `respawnAfterEnd` / `applyDefeatTransition` |
| 5 | `src/platform/DomFormationScreenHost.ts` | formation 画面切替 |
| 6 | `src/game/gameSessionWire.test.ts` | wire テスト拡張 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/game/GameSession.ts` | verify OFF のみ `handleDefeat` 末尾 — `restartBattle` + `menuHost.open('party')`。先頭 stage 敗北時の early return を除去 |
| `src/game/gameSessionWire.test.ts` | verify OFF 敗北 → formation + rollback stage。verify ON 敗北 → battle 維持 |
| `docs/ai-handoff/current-task.md` | 本節・§30 敗北行更新 |

**触らなかった:** `BattleEngine` / `respawnAfterEnd`、`classes.json` / skills、`stages-demo.json` 数値、リザルト UI、map 復帰、編成画面 UI

### 敗北処理フロー確認

| 段階 | 処理 |
| ---- | ---- |
| 終了検知 | `BattleEngine.applyDefeatTransition` → `battleEnd` defeat → `GameSession.handleDefeat` |
| verify loop | `loopStageId` ありなら rollback なし・return（従来） |
| rollback | `applyStageRollbackOnDefeat` — `getPreviousStageId`。先頭は同 id 維持 |
| verify ON | battle 維持。`engine.tick` 継続 → ~3 秒後 `respawnAfterEnd` |
| verify OFF | `restartBattle`（rollback 後 stage で battlefield 再構築）→ formation。tick 停止のため自動再戦なし |

### rollback 後 `currentStageId`（§32 で verify OFF は rollback 廃止）

| モード | 敗北後 id | formation / 再戦 stage |
| ------ | --------- | ---------------------- |
| verify OFF | **敗北 stage と同じ** | 同 stage で再挑戦 |
| verify ON（通常） | 先頭 stay / それ以外 1 つ前 | rollback 後 + `respawnAfterEnd` |
| verify ON（loop 固定） | **変更なし** | loop stage のまま |

### 実装判断

**§31:** formation 復帰を実装。**§32:** verify OFF の rollback を停止（本タスク）。

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | **8 passed** |
| `stageSelectionWire.test.ts` | **4 passed** |

## 32. currentStageId / stageProgress 棚卸し — ステージ選択型フロー再設計案（2026-07-08）

**前提修正:** Hensei-Only は一本道クリア型ではなく、**ステージを選び編成相性を見て挑戦・再挑戦するゲーム**。`currentStageId` を「進行上の現在ステージ」として勝利で次へ・敗北で前へ、という Phase 2 レガシー前提は見直し対象。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本 |
| 2 | `src/game/GameSession.ts` | sortie / 勝敗 / verify 分岐 |
| 3 | `src/progression/stageProgression.ts` | next / previous / rollback |
| 4 | `src/progression/victoryRewards.ts` | 初期化・勝利時進行 |
| 5 | `src/save/SaveManager.ts` | save 読書 |
| 6 | `src/game/gameSessionWire.test.ts` | wire 回帰 |

### 変更（今回の最小実装）

| ファイル | 内容 |
| -------- | ---- |
| `src/game/GameSession.ts` | verify OFF 敗北時 — `applyStageRollbackOnDefeat` を**呼ばない**。同 `currentStageId` のまま `restartBattle` + formation |
| `src/game/gameSessionWire.test.ts` | 敗北テスト期待値を「rollback 後」→「同 stage 維持」に更新 |
| `docs/ai-handoff/current-task.md` | 本節・§30/§31 敗北行更新 |

**触らなかった:** save schema、`selectedStageId` 本格導入、勝利時自動進行の変更、`stages-demo.json` / クラス数値、UI 大改修、`demo_ch1_07` 体験版終了扱い

### `currentStageId` 読み書き箇所（production）

| 箇所 | 操作 | 役割 |
| ---- | ---- | ---- |
| `SaveManager.parseStageProgress` | 読 | localStorage から復元 |
| `SaveManager.save` | 書 | persist（値は GameSession 等が更新済み） |
| `createDefaultSave` | 書 | 新規セーブ `stages[0].id` |
| `resolveKnownStageId` | 読→正規化 | 未知 id → `stages[0]`（flavor 不整合 fallback） |
| `loadSaveForMode` | 読→書 | 起動時正規化 + 即 persist |
| `handleStageSortie` | 書 | map 出撃で選択 stage を反映 |
| `applyVictoryRewards` | 読→書 | クリア stage 読取 → `getNextStageId` で次 id |
| `applyStageRollbackOnDefeat` | 読→書 | **verify ON 敗北のみ**（`GameSession.handleDefeat` 経由） |
| `GameSession` ctor / `setVerifyMode` | 書 | verify loop stage ピン留め時 |
| `setLoopStage` | 書 | Debug 周回ステージ選択 |
| `handleVictory` | 読 | クリア stage ログ・EXP。`resolveVictoryNextStageId` で loop 上書き可 |
| `BattleEngine` コールバック `() => currentStageId` | 読 | 戦闘中の敵生成・wave |
| `StageSelectionScreenHost` | 読 | map 一覧の選択ハイライト・`initialStageId` |
| `BattleView` | 読 | HUD ステージ名。`getNextStageId` は Debug 表示用 |

テスト・harness では多数の fixture 書き込みあり（本節では省略）。

### `currentStageId` が兼ねている意味 — 分類

| 意味 | 現状 | 該当経路 |
| ---- | ---- | -------- |
| **map で選択中** | **兼用** | sortie 前は前回値／勝利後は自動進行した「次」がハイライト。ユーザーが別 stage をクリックするまで sortie 対象と一致しない場合あり |
| **次に戦う stage** | **兼用** | sortie 後〜次 sortie まで同一フィールド |
| **戦闘中の stage** | **兼用** | `BattleEngine` が save 上の `currentStageId` を直接参照。セッション専用 `battleStageId` なし |
| **勝利後に進む stage** | **兼用** | `applyVictoryRewards` が即 `getNextStageId` で上書き。map 復帰時にその id が選択表示される |
| **敗北 rollback 先** | **verify ON のみ** | `applyStageRollbackOnDefeat`。**verify OFF は維持**（§32 実装） |
| **Debug loop 用** | **兼用** | `loopStageId` 非 null 時は `setLoopStage` / 勝利 `resolveVictoryNextStageId` が `currentStageId` をピン留め |

**多義性の核心:** 1 フィールドが「プレイヤー選択」「戦闘実体」「レガシー自動進行」「Debug ピン」を同時に表す。

### 勝利時 `currentStageId` 自動進行

| 項目 | 現状 | ステージ選択型への方向 |
| ---- | ---- | ---------------------- |
| `applyVictoryRewards` | クリア直後に `getNextStageId` で **必ず次 id へ**（最終 stage は同 id 周回） | **将来:** クリア記録（`clearedStageIds` / `stageRecords`）のみ更新。**`currentStageId` は変えない**か、map でユーザーが選んだ id のみ更新 |
| verify OFF map 復帰 | 勝利後 map へ。一覧は **進行後の id** を `selectStage` | **将来:** クリアした stage のまま詳細表示、または直前選択を維持。プレイヤーが次 stage を選ぶ |
| verify ON | 勝利後も battle。進行 + `respawnAfterEnd` | **維持** — Debug / legacy 用に `getNextStageId` + loop 上書きを残す |
| `handleStageSortie` | 出撃時に選択 id を **上書き** | **維持** — これが「選択中 stage」の正しい書き込み経路 |

**今回の判断:** verify OFF 敗北 rollback 停止（§32）に続き、**verify OFF 勝利時も自動進行を停止（§33）**。verify ON は従来維持。

### 敗北時 rollback

| モード | §32 後 | 理由 |
| ------ | ------ | ---- |
| verify OFF | **rollback なし**。同 stage で formation 再挑戦 | ステージ選択型 — 敗北で「前のステージ」へ戻す一本道前提と矛盾 |
| verify ON | **従来どおり** rollback + battle + `respawnAfterEnd` | Phase 2 放置 MVP / バランス診断の legacy 導線を壊さない |
| verify ON + loop | rollback なし | 従来どおり |

### verify OFF / ON と `getNextStageId` / `getPreviousStageId`

| 関数 | verify OFF 体験版 | verify ON Debug |
| ---- | ----------------- | --------------- |
| `getNextStageId` | 勝利時 `applyVictoryRewards` のみ（**まだ使用中**） | 同上 + loop 時は `resolveVictoryNextStageId` が loop id を返す |
| `getPreviousStageId` | **不使用**（§32） | 敗北 rollback で使用 |
| 将来 | verify OFF 勝利から **外す**方向 | **残す**（自動周回・rollback・HUD 次 stage 表示） |

### 将来的な最小再設計案（save schema 大変更なし・段階導入）

**短期（save フィールド名は `currentStageId` のまま）**

- 意味を **「最後に map で選んだ / 次に出撃する stageId」** に固定する文書化
- verify OFF 敗北: **維持**（rollback なし）— 実装済み
- verify OFF 勝利: **維持** — `advanceCurrentStage: false`（§33 実装済み）

**中期（schema 追加は小さく、migration は薄く）**

| 概念 | 置き場案 | 役割 |
| ---- | -------- | ---- |
| `selectedStageId` | save 新フィールド or `currentStageId` リネーム | map ハイライト・sortie 対象のみ |
| `battleStageId` | **セッションのみ**（`GameSession` private） | sortie〜戦闘終了まで。save に書かない |
| `clearedStageIds` | save `string[]` または `stageRecords` のキー集合 | クリア済み・解禁判定。勝利で merge |
| `stageRecords` | 既存 spec どおり | best time / 星 / 再挑戦参考 |

**導入順（推奨）**

1. verify OFF 敗北 rollback 停止 — **完了（§32）**
2. verify OFF 勝利で `currentStageId` を進めない — **完了（§33）**。`clearedStageIds` 追加は未着手
3. map `selectStage` を `selectedStageId` 専用に（sortie / 表示）。`battleStageId` は `handleStageSortie` でセット
4. verify ON は `currentStageId` + next/previous を **Debug 専用パス**として分離（本番 save slot とは既に分離済み）

**やらない（今回どおり）:** StageArchetype / Recipe / Generator、per-group level、save 大 migration、demo 終了画面

### `demo_ch1_07` 体験版終了

**扱っていない** — 最終 stage クリア後も map 周回・`currentStageId` 同 id ループは従来どおり。7h 体験版終了画面は未着手。

### テスト（§32）

| コマンド | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | **8 passed** |
| `stageProgression.test.ts` | **4 passed** |
| `victoryRewards.unlock.test.ts` | **5 passed** |
| **合計** | **17 passed** |

## 33. verify OFF 勝利時 currentStageId 維持 — 調査・最小実装（2026-07-08）

### 読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§32 前提 |
| 2 | `src/progression/victoryRewards.ts` | `applyVictoryRewards` 責務 |
| 3 | `src/game/GameSession.ts` | `handleVictory` / verify 分岐 |
| 4 | `src/dev/verifyMode.ts` | verify 判定 |
| 5 | `src/game/gameSessionWire.test.ts` | wire 期待値 |
| 6 | `src/game/StageSelectionScreenHost.ts` | map 復帰時 `selectStage` |

### 調査結果

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | `applyVictoryRewards` 責務 | EXP 付与・`unlockClassIdsOnClear` merge・`totalClears++`・**`getNextStageId` で `currentStageId` 更新**（従来は常時） |
| 2 | 報酬と進行の分離 | **可能** — `clearedStageId` 読取後に unlock を適用し、`currentStageId` 更新だけをオプション化 |
| 3 | verify OFF のみ維持 | **可能** — `advanceCurrentStage: this.verifyMode`。`handleVictory` の loop 上書きも verify ON のみ |
| 4 | verify ON 維持 | **維持** — 既定 `advanceCurrentStage: true` + `resolveVictoryNextStageId` |
| 5 | map 復帰選択表示 | `selectStage(currentStageId)` — **クリアした stage がハイライト** |
| 6 | 影響範囲 | 小 — `victoryRewards.ts`・`GameSession.ts`・2 テストファイルのみ |

**注意:** `applyVictoryRewards` だけ止めても `handleVictory` が `resolveVictoryNextStageId` で上書きするため、**両方の修正が必要**だった。

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `src/progression/victoryRewards.ts` | `ApplyVictoryRewardsOptions.advanceCurrentStage`（既定 `true`） |
| `src/game/GameSession.ts` | verify OFF は `advanceCurrentStage: false`、loop 上書きは verify ON のみ |
| `src/game/gameSessionWire.test.ts` | verify OFF 勝利後は同 stage 維持 |
| `src/progression/victoryRewards.unlock.test.ts` | `advanceCurrentStage: false` テスト追加 |

**触らなかった:** save schema、`selectedStageId` / `clearedStageIds` 本格導入、`stages-demo.json` / クラス数値、UI 大改修

### 判断

| 項目 | 内容 |
| ---- | ---- |
| 実装 | **実施** — §32 に続く第二歩 |
| verify OFF 勝利 | `currentStageId` **維持** |
| verify ON 勝利 | **従来どおり** 次 stage 進行 |
| `unlockClassIdsOnClear` | **壊れていない** |

### テスト（§33）

| コマンド | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | **8 passed** |
| `victoryRewards.unlock.test.ts` | **6 passed** |
| `stageProgression.test.ts` | **4 passed** |
| **合計** | **18 passed** |

## 34. 体験版 demo stage 編成パズル棚卸し — 順不同問題セット再分類（2026-07-08）

**コード・データ変更なし**（調査・診断・文書整理のみ）。`class` / `stage` 数値 / `enemyGroups` は未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§32/§33 前提 |
| 2 | `data/stages-demo.json` | 7 stage 敵編成・`formationHintJa`・`unlockClassIdsOnClear` |
| 3 | `data/parties.json` | デフォルト編成（guardian / swordsman / cleric / ranger） |
| 4 | `src/battle/demoStageBalance.puzzle.test.ts` | baseline / bad / universal / counter 期待値 |
| 5 | `src/battle/demoStageBalance.smoke.test.ts` | 標準編成 smoke（勝利保証なし） |
| 6 | `src/game/GameSession.ts` | `demo_ch1_07` 体験版終了導線の有無 |

**追加参照:** `src/progression/partyCompose.ts`（`DEFAULT_ROSTER_EXTRAS.demo`）、`src/ui/StageSelectionPanel.ts`（全 stage 一覧・ロックなし）

### 体験版の位置づけ（今回固定）

| 観点 | 内容 |
| ---- | ---- |
| ゲーム型 | **放置ではない** — ステージ選択型の編成解法オートバトルパズル |
| 解放 | **全 7 stage 最初から map で選択可**（`StageSelectionPanel` にロック UI なし） |
| 進行 | verify OFF は勝敗後も **同 stage 維持** → map / formation へ（§32/§33） |
| 難易度 | `recommendedLevel` 表示のみ（ch1_01〜06 = **Lv1**、ch1_07 = **Lv2**）。順クリア制御なし |
| default-answer 許容 | 体験版内 **最大 1 stage**。それも「雑通過」ではなく敵構成に筋よく刺さる tutorial 枠 |

### デフォルト編成（baseline）

`parties.json` demo: **`df_guardian` / `at_swordsman` / `sp_cleric` / `at_ranger`**

初期解禁（`DEFAULT_ROSTER_EXTRAS.demo`）: `df_paladin`, `at_assassin`, `at_sorcerer`, `sp_wardweaver` — **`at_ballista` は含まない**（ch1_07 クリア報酬のみ）

### puzzle quad 診断（今回実行・`BUILD_FLAVOR=demo`）

| stage | baseline | bad | universal | counter |
| ----- | -------- | --- | --------- | ------- |
| ch1_01 | victory 670/670 @154s | **defeat** | victory 642/642 @58s | victory 650/650 @85s |
| ch1_02 | victory 670/670 @123s | victory 200/480 @208s | victory 642/642 @40s | victory 642/642 @40s |
| ch1_03 | victory 340/670 (3人) @46s | victory 285/480 @41s | victory 570/642 @76s | victory 740/740 @48s |
| ch1_04 | victory 670/670 @181s | **victory 220/680** @136s | victory 642/642 @63s | victory 650/650 @101s |
| ch1_05 | victory 297/670 (2人) @21s | victory 272/680 @24s | **defeat** | victory 546/650 @18s |
| ch1_06 | victory 670/670 @74s | **victory 104/680** @81s | victory 380/642 @46s | victory 650/650 @58s |
| ch1_07 | **defeat** @64s | defeat @40s | defeat @31s | **victory** 650/650 @112s |

- **bad 定義:** ch1_01〜03 = `configureNoGuardianParty`（guardian→assassin）。ch1_04〜07 = `configureNoHealerParty`（cleric→assassin）
- **counter 定義:** ch1_01/04/05/06/07 = paladin tank。ch1_02 = ranger→sorcerer。ch1_03 = ranger→swordsman（double melee）
- **universal:** ranger→sorcerer

### stage 別分類表

| stageId | 敵編成の特徴 | 難易度表示 | 主に刺さるクラス / 編成方針 | 分類 | counter で明確改善 | 何を考えさせるか | 現状の問題点 | 調整要否 |
| ------- | ------------ | ---------- | --------------------------- | ---- | ------------------ | ---------------- | ------------ | -------- |
| `demo_ch1_01` | 敵 guardian×1 + swordsman×3（前衛耐久・近接圧） | Lv1・序盤 | 前衛タンク維持。速攻なら sorcerer 枠 | **default-answer 候補（1枠）** | やや（sorcerer で ~3× 短縮） | 前衛役の重要性（bad=タンク外しで即死） | baseline は遅いが満血勝利。**universal が最速** — default は「正解」だが最適ではない | 役割整理は doc のみで可。数値は後続 |
| `demo_ch1_02` | 敵 guardian×1 + ranger×3（後衛遠隔） | Lv1 | 弓術士の後衛処理 / sorcerer AoE。前衛維持 | **default-viable** | **はい**（sorcerer で 123s→40s） | 遠隔優先・後衛への到達 | baseline 満血勝利。**通過は容易**だが後衛処理の「より良い解」は明確 | ヒント追加検討（formationHint なし）。数値は後続 |
| `demo_ch1_03` | swordsman×5（弱 scale）+ assassin×2（**7 体ラッシュ**） | Lv1 | 前衛＋範囲/二刀流。double melee counter | **default-viable** | はい（4人生存・満血寄り） | 数の圧・前衛耐久 | baseline 勝つが **3 人残・HP 半減**。bad も勝利 — 編成欠陥が弱い | bad を defeat 寄りにする調整は**将来**（今回触らない） |
| `demo_ch1_04` | guardian + **敵 cleric** + swordsman×2（回復耐久壁） | Lv1 | **ヒーラー必須** puzzle。paladin でも可 | **counter-required-ish** | はい（no-healer は設計上 defeat 想定） | 回復戦・耐久編成 | **no-healer が victory 220HP** — puzzle テスト **fail**（flaky）。universal は速いが healer あり | **要調整**（scale またはテスト閾値）。今回は未実施 |
| `demo_ch1_05` | sorcerer×2 + assassin×2（優先撃破・短期決着） | Lv1 | paladin 耐久 / assassin 仕留め（spotlight）。healer 維持 | **default-viable** | **はい**（paladin で 4 人・546HP） | 低 HP 優先・短期火力。**assassin 体験枠** | baseline **雑勝ち**（297/670・2人）。bad も勝利。**puzzle counter は paladin** で assassin 必須ではない | formationHintJa は妥当。数値微調は将来 |
| `demo_ch1_06` | 5 体混成（paladin / ranger×2 / sorcerer / swordsman） | Lv1 | healer 維持・paladin 前衛。AoE は苦戦 | **default-viable**（**通過ステージ寄り**） | 中（paladin で満血寄り） | 混成への総合対応 | baseline **満血勝利**。bad も **勝利 104HP** — §15 意図（bad=defeat）と**矛盾** | **要調整**（bad defeat 復帰）。今回は未実施 |
| `demo_ch1_07` | Lv2・6 体フルロール（**敵 at_ballista** 含む） | Lv2・終盤 | **paladin 前衛 + healer**（M1 counter）。敵 ballista は高 MaxHP 狙い | **counter-required-ish** | **はい**（baseline/universal/bad 全滅） | 終盤総合試験・役割分担 | baseline 敗北は意図どおり。プレイヤー **at_ballista 不要** | 現状維持で puzzle 意図は成立 |

### default-answer が複数あるか

| 判定 | 内容 |
| ---- | ---- |
| **複数あり（方針違反）** | 満血または容易勝利の default 通過: **ch1_01・ch1_02・ch1_06**。ch1_05 も低 HP だが勝利 |
| **推奨 1 枠** | **`demo_ch1_01` のみ default-answer** — 敵も前衛+近接ミラーで「基本編成が筋よく刺さる」tutorial。他は default-viable 以下に格下げ |
| ch1_02 | 勝ちやすいが「後衛処理」の学びがあり **default-answer にはしない** |
| ch1_06 | baseline 満血 — **通過ステージ**。default-answer から外す |

### デフォルト編成で雑に勝てる通過ステージ

| stage | smoke（baseline） | 判定 |
| ----- | ----------------- | ---- |
| ch1_01 | victory 満血 @152s | tutorial 許容枠 |
| ch1_02 | victory 満血 @123s | **通過寄り** — 編成を考えなくても勝てる |
| ch1_03 | victory 3人 @47s | 勝つが傷つく — やや puzzle |
| ch1_04 | victory 満血 @184s | 遅いが楽勝 — **healer puzzle として弱い** |
| ch1_05 | victory 2人 297HP @21s | ギリ勝ち — puzzle としては弱い |
| ch1_06 | victory 満血 @74s | **明確な通過ステージ** |
| ch1_07 | defeat | 意図どおり |

### counter 診断とステージ意図の矛盾

| stage | 矛盾 |
| ----- | ---- |
| **ch1_04** | healer 必須 puzzle なのに **no-healer が勝利**（今回 220HP）。テスト fail |
| **ch1_05** | assassin spotlight だが **puzzle counter=paladin**。bad（assassin/no-healer）も勝利 — spotlight と counter 軸がずれる（§18 既知） |
| **ch1_06** | §15 調整後 bad=defeat 想定だが **今回 bad=victory 104HP** |
| **ch1_03** | bad（no guardian）も勝利 — 前衛欠陥のペナルティ弱い |
| ch1_01/02/07 | 大きな矛盾なし |

### formationHintJa

| 項目 | 結果 |
| ---- | ---- |
| 設定 stage | **`demo_ch1_05` のみ** |
| 文言 | 「双刃士は低HPの敵を優先…試してみましょう」 |
| 問題 | **なし** — 必須 counter / 正解編成に読めない（`EXPERIENCE_SPOTLIGHT_SUBSTITUTE_OK` と整合） |
| 不足 | ch1_02（後衛処理）・ch1_04（回復戦）・ch1_07（終盤試験）にヒントなし — **将来追加候補** |

### `demo_ch1_07` 体験版終了扱い

| 項目 | 結果 |
| ---- | ---- |
| `GameSession` / 画面 state | **`demoEnd` なし**。勝利後 verify OFF は **map 復帰**（§28/§33） |
| クリア後遷移 | 体験版終了画面（7h）**未実装** |
| `unlockClassIdsOnClear` | データに `at_ballista` あり。勝利報酬 merge は実装済み。UI 通知は未着手 |

### `at_ballista` を ch1_07 以前の player counter 前提にしていないか

| 項目 | 結果 |
| ---- | ---- |
| `DEFAULT_ROSTER_EXTRAS.demo` | **`at_ballista` なし**（M1 8 + 在籍 4 のみ） |
| puzzle counter（ch1_07） | **`df_paladin`**（`configurePaladinTankParty`） |
| harness 診断 | 「do NOT require at_ballista player side」明記 |
| 敵 `at_ballista` | ch1_07 のみ。弓術士 P2 の高 MaxHP ターゲット / 終盤ボス枠 |

### 役割が曖昧な stage（優先度順）

1. **ch1_06** — baseline 通過 + bad 勝利。混成試験なのか通過枠なのか不明瞭
2. **ch1_04** — healer puzzle の芯はあるが no-healer 勝利で信頼性低下
3. **ch1_05** — assassin spotlight / paladin counter / baseline 雑勝ちが同居
4. **ch1_02** — 勝ちやすいが「後衛をどう処理するか」の学びは counter でしか出ない
5. **ch1_03** — ラッシュ枠だが bad でも勝てる

### 見直し案（実装は今回しない）

| 優先 | 案 | 対象 |
| ---- | -- | ---- |
| P1 | **default-answer を ch1_01 に 1 本化** — 他を default-viable / counter-required に doc・ヒントで明示 | 導線・文案 |
| P1 | **ch1_04 no-healer を defeat 安定化**（scale またはテスト閾値再検討） | 6c 数値（別 PR） |
| P2 | **ch1_06 baseline を「考えさせる」方向へ** — 満血勝利をやめ bad=defeat 復帰 | 6c 数値（別 PR） |
| P2 | **ch1_02/04 に formationHintJa 追加**（後衛処理・回復戦。必須 counter 表現は避ける） | データ 1 行 + UI 既存経路 |
| P3 | **ch1_03 bad を defeat 寄り** | 6c |
| P3 | **ch1_05** — paladin counter と assassin spotlight の主軸を doc で分離（counter=安全解、assassin=体験解） | doc のみ |
| 導線 | map 初回ガイドを「順不同で好きな stage を選べ」に寄せる（現状は汎用） | Phase 7 copy |
| 進行 | `clearedStageIds` 導入は §32 中期案のまま送り | スコープ外 |

### テスト（今回実行）

| コマンド | 結果 |
| -------- | ---- |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **8 passed / 1 failed** — `demo_ch1_04` noHealerMarginal（bad victory hp=220）。Vitest worker `onTaskUpdate` timeout **ノイズ 1 件** |

### 触らなかった範囲

- `data/stages-demo.json` 数値 / `enemyGroups`
- `data/classes.json` / skills
- `GameSession` / progression コード
- UI 大改修 / save schema

## 35. demo_ch1_04 / demo_ch1_06 — §34 P1 scale 再調整（2026-07-08）

**§34 棚卸し受けの P1**。`enemyGroups` scale のみ。class 数値・UI・save・他 stage 未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§34 |
| 2 | `data/stages-demo.json` | ch1_04 / ch1_06 enemyGroups |
| 3 | `src/battle/demoStageBalance.puzzle.test.ts` | puzzle 期待値 |
| 4 | `src/battle/test/demoStageSim.harness.ts` | 診断 harness |
| 5 | `docs/dev/balance-diagnostics.md` | 診断方針 |
| 6 | `src/battle/demoStageBalance.smoke.test.ts` | smoke 回帰 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `data/stages-demo.json` | ch1_04 / ch1_06 の `enemyGroups` scale 微調整（下表） |
| `demoStageBalance.puzzle.test.ts` | ch1_06 `badMustDefeat` + 編成差 assertion |
| `demoStageSim.harness.ts` | ch1_04 / ch1_06 診断 read 文言 |
| `docs/dev/balance-diagnostics.md` | §7 excludeRoles 後表の ch1_04/06 行 |
| `docs/ai-handoff/current-task.md` | 本節 |

### demo_ch1_04 scale（§14 → §35）

| group | §14 後 | §35 |
| ----- | ------ | --- |
| `df_guardian` atkScale | 1.3 | **1.42** |
| `sp_cleric` resScale | 1.4 | **1.48** |
| `at_swordsman` atkScale | 1.32 | **1.45** |

### demo_ch1_06 scale（§15 → §35）

| group | §15 後 | §35 |
| ----- | ------ | --- |
| `df_paladin` atkScale | 1.05 | **1.13** |
| `at_ranger` atkScale | 1.02 | **1.09** |
| `at_ranger` resScale | 1.28 | **1.3** |
| `at_sorcerer` resScale | 1.45 | **1.48** |
| `at_swordsman` atkScale | 1.08 | **1.15** |

### 調整前後（§34 診断 → §35、`BUILD_FLAVOR=demo` puzzle quad）

| stage | 編成 | 調整前（§34） | 調整後（§35） |
| ----- | ---- | ------------- | ------------- |
| **ch1_04** | baseline | victory 670/670 @181s | victory 670/670 @~181s |
| | bad | **victory 245/680** @137s | **defeat** 0/680 @~53s |
| | universal | victory 642/642 @61s | victory 642/642 @~61s |
| | counter | victory 650/650 @101s | victory 650/650 @~101s |
| **ch1_06** | baseline | victory 670/670 @74s | victory 670/670 @~74s |
| | bad | **victory 104/680** @81s | **defeat** 0/680 @~67s |
| | universal | victory 380/642 @46s | victory **234**/642 @47s（3 survivors） |
| | counter | victory 650/650 @58s | victory 650/650 @~58s |

### 原因・判断

| stage | 要点 |
| ----- | ---- |
| **ch1_04** | no-healer は戦闘短縮 + guardian 被ダメ不足で ranger DPS 勝ち。**敵 atkScale 上げ**で無ヒーラー全滅。baseline は cleric healing（~620）が guardian 被ダメを相殺し満血維持 |
| **ch1_06** | bad が ranger 後衛処理で勝利しうる。**敵 atk / res 上げ**で bad=defeat 復帰。baseline 満血は cleric 相殺で残存 — **default-answer ではない**（universal 低 HP・counter スコア優位） |

### default-answer

**`demo_ch1_01` のみ** — ch1_04 / ch1_06 は default-viable 以下

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **9 passed** |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |
