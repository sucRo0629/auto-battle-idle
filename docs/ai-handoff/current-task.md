# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: 敵エディタ v0.3.2 — ステージ `enemyGroups` 編成
- 状態: **Phase A〜C 完了・Phase D 完了・Phase E3（b/c/d）完了・Phase E4b 完了・Phase E5b 完了**
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
- フィールド: `classId`, `count`, `hpScale`, `atkScale`, `defScale`, `regScale`（初期 1.0）
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
| **E5b** | pilot stage `eg_smoke` 追加（enemyGroups のみ・実データ smoke） | [x] |
| **E 残** | legacy ステージ移行・`stages-demo.json` 分離など | [ ] |

### Phase E3d（完了）

- `StageEnemyEditorStep` に編成概要（`recommendedLevel`、方式、グループ明細、scale summary）を追加
- 5 体以上は `.editor-warning` で注意表示（cap 圧縮・HUD 整理は未実装）
- legacy は `enemyGroups 未設定` + templateId 一覧（read-only）。自動変換なし
- テスト: `stageEnemyCompositionPreview.test.ts` + `StageEnemyEditorStep.test.ts`

## 7. 次にやること

- [ ] **Phase E 残** — legacy ステージの `enemyGroups` 移行（`eg_smoke` 以外。`test` / `ranged_test` / `1` / `2` は未変更）
- [ ] `stages-demo.json` 分離（roadmap 6b、タイミング未確定）

### Phase E5b（完了）

- `data/stages.json` に pilot stage `eg_smoke` を 1 件追加（`recommendedLevel: 10`、`df_guardian` + `at_hunter` 各 1、`waves` は空 placeholder のみ・templateId なし）
- `entities.enemyGroups.test.ts` に実データ smoke（`loadGameData` + `createEnemiesForStage`）を追加
- legacy ステージ・`enemies.json` / `classes.json` / エディタ UI / 戦闘ロジックは未変更

### Phase E4b（完了）

- EditorApp: タブ順を クラス → ステージ → 敵テンプレ → バランス → 状態アイコン に整理。旧「敵」→「敵テンプレ」
- subtitle に stages.json を追記
- EnemyEditorStep / StageEnemyEditorStep: legacy templateId と enemyGroups の導線を説明文で明示

## 8. やらないこと（全体）

- legacy データの即削除
- ステージ選択画面 UI
- [enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) のスキル参照分離（別 PR）
- 数値バランス調整
- `at_ballista` 専用 stage フラグ
- enemy-design-concept §12 の段階サブセット（Lv0/10/20 全解放が v0.3.2 正）

## 9. 未確定・注意点

- 旧敵テンプレ UI は残置（E4b で導線整理済み。非表示・削除はしない）
- `stages-demo.json` 分離タイミング
- validate の classId allowlist subset 化
- enemyGroups ステージの EXP 集計
- 5 体以上 cap 圧縮の見え方・多数敵 HUD 整理
- legacy ステージを stage タブで enemyGroups へ変換する UI を入れるか
- `attackSpeed` scale を `StageEnemyGroup` に追加するか

## 10. ChatGPT へ戻すときのメモ

- 目的: v0.3.2 敵編成の段階実装
- 現在地: Phase E5b 完了。`eg_smoke` が stages.json 上の初の enemyGroups 実データ pilot
- 次: **Phase E 残**（legacy ステージ移行・`stages-demo.json` 分離）
- 判断待ち: 上記 §9 未確定事項
