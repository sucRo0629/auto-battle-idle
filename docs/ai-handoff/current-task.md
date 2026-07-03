# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: 敵エディタ v0.3.2 — ステージ `enemyGroups` 編成
- 状態: **Phase A〜C 完了・Phase D 完了・Phase E3（b/c/d）完了・Phase E4b 完了・Phase E5 完了（E5b/c/d/e）**
- 対象: ステージ敵編成、`enemyGroups`、戦闘生成、デバッグ表示、データ編集ツール
- 完了条件: Phase A〜E の完了条件（§6 参照）

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

- [ ] **enemyGroups stage の EXP 集計** — `computeStageExpReward` は現状 legacy `waves` / `templateId` のみ。`enemyGroups` ステージ（`eg_smoke` / `ranged_test`）で撃破 EXP が 0 になる。正本: [progression.md](../spec/progression.md) §未確定（Phase B2）

### 代替

- [ ] **`test` / `1` / `2` の legacy → `enemyGroups` 移行調査** — 各 stage の templateId 構成・再現方針を整理してからデータ移行

### その他バックログ（優先度は上記より下）

- [ ] `stages-demo.json` 分離（roadmap 6b、タイミング未確定）
- [ ] validate の classId allowlist subset 化
- [ ] 5 体以上 warning の cap 圧縮・多数敵 HUD 整理
- [ ] `attackSpeed` scale を `StageEnemyGroup` に追加するか
- [ ] legacy ステージを stage タブで `enemyGroups` へ変換する UI

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
| `stages-demo.json` 分離 | roadmap 6b。体験版専用ステージを本編 `stages.json` から分離するタイミング未確定 |
| EXP 集計 | `enemyGroups` ステージの撃破 EXP が `computeStageExpReward` 未対応 |
| validate allowlist | classId の subset 化は未実装 |
| 5 体以上 | エディタ warning のみ。cap 圧縮・多数敵 HUD 整理は未実装 |
| `attackSpeed` scale | `StageEnemyGroup` 型・編集 UI とも未実装 |
| legacy 変換 UI | stage タブで legacy → `enemyGroups` へ変換する UI は未実装（read-only 表示のみ） |
| 旧敵テンプレ UI | E4b で導線整理済み。非表示・削除はしない |

## 10. ChatGPT へ戻すときのメモ

- 目的: v0.3.2 敵編成の段階実装
- 現在地: **Phase E5 完了**（pilot `eg_smoke` 追加、`ranged_test` 移行、smoke 経路・主要テスト確認済み）
- 次（推奨）: **enemyGroups stage の EXP 集計**（`computeStageExpReward` 拡張）
- 次（代替）: `test` / `1` / `2` の legacy 移行調査
- 判断待ち: §9 未対応・未確定事項
