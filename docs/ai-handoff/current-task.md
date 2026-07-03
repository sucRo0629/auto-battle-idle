# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ

- 作業名: 敵エディタ v0.3.2 — ステージ `enemyGroups` 編成
- 状態: **Phase A 完了・Phase B 未着手**
- 対象: ステージ敵編成、`enemyGroups`、戦闘生成、デバッグ表示、データ編集ツール
- 完了条件: Phase A〜E の完了条件（§6 参照）

## 3. 参照すべき正本

- **v0.3.2 確定方針**（§4）
- [docs/spec/progression.md](../spec/progression.md)
- [docs/enemy-design-concept.md](../enemy-design-concept.md)
- [docs/plans/enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) — スキル参照分離（別 PR・本計画と並行しない）
- [docs/plans/phase-roadmap.md](../plans/phase-roadmap.md) — Phase 6a/6b
- 現状調査: 前回チャット（v0.3.1 調査報告）

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

## 5. 現状サマリ（調査済み）

| 観点 | 現状 |
| ---- | ---- |
| エディタ | `EnemyEditorStep` = 敵テンプレ 1 件（`enemies.json`） |
| ステージ編集 | 手編集のみ。editor API に stages なし |
| 敵生成 | `createEnemyFromTemplate`（classRegistry 非使用） |
| 配置 | 手動 `spawnX` |
| `enemyGroups` / `recommendedLevel` | 型・validate 実装済み（Phase A）。戦闘生成は Phase B |

## 6. 実装フェーズ

| Phase | 内容 | 状態 |
| ----- | ---- | ---- |
| **A** | 型・validate・`progression.md` 追記 | [x] |
| **B** | `enemyGroups` → `CombatantState` 展開（配置仮） | [ ] |
| **C** | 射程自動配置（enemyGroups 経路のみ） | [ ] |
| **D** | `DebugMenuPanel` 編成・補正表示 | [ ] |
| **E** | ステージ敵編成エディタ + stages 保存 API | [ ] |

### Phase A — 型・データ・validate

- `StageEnemyGroup`, `StageDef` 拡張（`types.ts`）
- `parseStages` / validate（`validateGameData.ts`）
- `enemyGroups` あり → `recommendedLevel` 必須
- legacy `waves` / `templateId` / `spawnX` validate 維持
- 移行期: validate / loader 都合で `waves: [{ enemies: [] }]` プレースホルダを要求（正本では `waves` 省略可）
- **触る:** `types.ts`, `validateGameData.ts`, `validateGameData.test.ts`, `progression.md`
- **完了:** fixture 合法/非法（classId・count・scale・5体以上）、legacy 回帰、doc 形状追記

### Phase B — 戦闘ユニット展開

- `expandEnemyGroups` + `createEnemyFromClassGroup`
- `createEnemiesForStage`: `enemyGroups` あり & `waveIndex===0` → 新経路、else legacy
- stats × scale、スキルは `resolveLearnedSkills` + `getUnlockedSkillSlotCount(level)`
- 配置は暫定 `spawnX: 0`（Phase C で置換）
- **触る:** `entities.ts`（+ `enemySpawn.ts` 推奨）, 新規テスト
- **完了:** Lv/scale/スキル枠テスト、legacy 戦闘回帰

### Phase C — 射程自動配置

- 射程昇順ソート、group 順タイブレーク、`separateByGap`
- legacy `spawnX` 経路は不変
- **触る:** `combatPosition.ts`（+ `enemyFormation.ts` 推奨）, 配置テスト
- **完了:** 近接前・遠隔後、legacy 回帰

### Phase D — デバッグ表示

- 選択ステージの `recommendedLevel`, `enemyGroups`, 総体数
- 5 体以上注意表示。legacy は `templateId` 一覧
- **触る:** `DebugMenuPanel.ts`, `debug-menu.css`, プレビューヘルパー（推奨）
- **完了:** 表示とデータ一致

### Phase E — エディタ化

- `GET/PUT /__editor/stages`、ステージ選択・group 編集・保存
- 旧敵テンプレ UI は移行期温存か隠すか **未確定**
- **触る:** `EnemyEditorStep` or `StageEnemyEditorStep`, `EditorApp`, `editorApi`, `vite-plugin-editor-api`, `data/stages.json`
- **完了:** 保存→validate→戦闘→デバッグ表示の一連

## 7. 次にやること

- [x] **Phase A** 実装（最小差分: types + validate + tests + `progression.md`）
- [ ] **Phase B** 実装（`enemyGroups` → `CombatantState` 展開）

## 8. やらないこと（全体）

- legacy データの即削除
- ステージ選択画面 UI
- [enemy-editor-refactor.md](../plans/enemy-editor-refactor.md) のスキル参照分離（別 PR）
- 数値バランス調整
- `at_ballista` 専用 stage フラグ
- enemy-design-concept §12 の段階サブセット（Lv0/10/20 全解放が v0.3.2 正）

## 9. 互換性

| レイヤ | 方針 |
| ------ | ---- |
| 戦闘 | `enemyGroups` あり & wave 0 → 新経路。else legacy |
| データ | `enemies.json`, `waves`/`templateId`/`spawnX` 残す |
| 配置 | enemyGroups = 射程自動。legacy = `spawnX` |

## 10. 衝突時の優先

**v0.3.2 > 現行実装 > 旧 doc**。legacy 読み取り経路は維持。

## 11. 未確定

- ~~`waves` 省略~~ — **正本: enemyGroups ありなら waves 不要**。移行期 validate は非空 `waves` + 空 `enemies` プレースホルダを要求（Phase A）
- `regScale` 適用、`scale` 下限（0 禁止か）
- `enemyGroups` ステージの EXP 報酬
- multi-wave + `enemyGroups`（体験版スコープ外、wave 0 のみ）
- Phase E で旧敵テンプレ UI を残すか隠すか
- `stages-demo.json` 分離タイミング（roadmap 6b）
- エディタ classId allowlist を validate でも強制するか
- 5 体警告閾値（`>= 5` vs `> 4`）

## 12. リスク（要監視）

- `isEnemy` / 味方専用分岐（`SkillExecutor` 等）
- スキル解放の `PartyMemberState` 前提
- stat scale 乗算順・丸め
- `spawnX` 依存の配置・HUD・reel-in
- EXP が 0 になる可能性（enemyGroups に exp なし）

## 13. 最初の最小差分

Phase A のみ（戦闘・UI に触らない）:

1. 型追加
2. parse / validate + テスト 2 件
3. `progression.md` にデータ形状追記

## 14. ChatGPT へ戻すときのメモ

- 目的: v0.3.2 敵編成の段階実装
- 現在地: Phase A 完了（types + validate + 14 tests + progression.md）
- 次: Phase B（`expandEnemyGroups` + 戦闘生成）
- 判断待ち: EXP、旧エディタ UI 扱い。**waves:** 正本は enemyGroups ありなら省略可。移行期 validate はプレースホルダ要求
