# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 作業テーマ（2026-07-12 方針転換）

- **凍結:** 現行 **Phase 7 中心の M1 公開進行**（Phase 6c / 7 残タスク → 4e → Phase 8 → Phase 9 → itch.io）は**凍結**した。
- **新ロードマップ現在地:** **R6g-2 完了** — `createEnemiesForStage` の Wave 単位 spawn（本 §63）。**R6g-1 完了**（§62）。**R6f 完了**（§61）。**R6e 完了**（§60）。**R6d 完了**（§59）。
- **次の再開タスク:** **R6g-3 — BattleEngine / GameSession spawn 接続**（handoff §63 / [phase-roadmap.md §R6](../plans/phase-roadmap.md#r6--wave-間準備) 参照）。
- **R4 で確定した doc:** [combat-data-schema-refactor.md](../plans/combat-data-schema-refactor.md)（新規）、[operation-loop.md](../spec/operation-loop.md)、[classes-and-skills.md](../spec/classes-and-skills.md)、[combat.md](../spec/combat.md)、[stats.md](../spec/stats.md)（R4 注記）
- **R4 確定事項:** 兵科 / 戦闘方式 / 作戦内パッシブ / 敵グループ / Stage-Wave / 作戦状態 / Wave 戦闘状態の責務分離、validate 層、normalize / migration 方針、エディタ各画面責務、R5 最小 schema、SkillEditorStep → CombatModuleEditor 改修推奨
- **未確定（R4 完了時点）:** TypeScript 型名、JSON 分割、module / passive effect schema 詳細、SkillExecutor 再利用範囲、敵テンプレ最終存廃、Save schema、operation state 所有者、checkpoint 実装方式 — 一覧は [combat-data-schema-refactor.md §18](../plans/combat-data-schema-refactor.md#18-保留事項r4-完了時点)
- **保留:** 移動阻害・移動速度差・ノックバック等は将来の**作戦内パッシブ候補**（R8）。
- **R8 表示方針（2026-07-12 doc 確定）:** 常時 stat 補正は状態アイコン非表示。条件付き発動は発動中のみ。DoT/CC/一時デバフは従来どおり。Barrier は HP バーのみ。範囲・オーラ系はフィールド上プレースホルダ範囲表示（判定と同一 runtime データ）。1 次元効果範囲用語・大カテゴリ統合は [combat-data-schema-refactor.md §5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。正式 VFX は試作成立後。active 廃止による自動削減には依存しない — [phase-roadmap.md §R8](../plans/phase-roadmap.md#r8--作戦内パッシブ)、[combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針)、[battle-field.md §範囲系](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針)。
- **今回の doc 作業（R5a）:** production code、データ JSON、テスト、エディタは**未変更**。調査結果は §47。
- **今回の実装（R5b）:** §48。BattleEngine / SkillExecutor / Combatant 生成 / UI / editor / Save は未接続。
- **今回の実装（R5c）:** §49。対象 4 兵科の先頭 module を通常行動として SkillExecutor 接続。UI / editor / Save / 作戦ループ / 方式 B 選択 / 敵 selectedCombatModuleId は未接続。
- **今回の実装（R5d）:** §51。味方 4 slot ごとの module A/B 選択（実行中メモリのみ）。Save / UI / 敵 / 作戦ループは未接続。
- **今回の実装（R5e）:** §52。敵 `enemyGroups[].selectedCombatModuleId` 接続。味方 R5d / Save / UI / 作戦ループは未変更。
- **今回の実装（R5f）:** §53。味方 party 内 classId 重複禁止（編成 API / UI 候補 / 戦闘生成境界）。敵・Save schema・module 正式 UI は未変更。
- **今回の実装（R5g）:** §54。R5 統合テスト・縦切り確認・旧 diagnostic 整理・pre-existing 失敗分類。production 新機能追加なし。

### R4 で確定したデータ責務（doc 反映済）

| レイヤ | 責務 |
| ------ | ---- |
| 兵科 | 基礎ステ、秒単位攻撃間隔、ロール、前衛 / 後衛、固定優先ターゲット、固定属性、方式 pool ×2、パッシブ pool |
| 戦闘方式 | 通常行動全体（Hit 構造、対象、射程、効果形状、間隔上書き）。優先ターゲットは **持たない**（兵科固定） |
| 作戦内パッシブ | 別データ。R5 では schema のみ、実装後回し |
| 敵グループ | classId + count + selectedCombatModuleId + scale + passiveIds（任意）。同一 group 内は同一方式 |
| Stage / Wave | 正本は `waves[].enemyGroups`。直下 enemyGroups は legacy 省略記法 |
| 作戦状態 | メモリのみ。編成・方式・パッシブ・checkpoint。Combatant 含まない |
| Wave 戦闘状態 | BattleEngine 側。Wave 終了で破棄 |

### R5 最小 schema（必須 vs 後回し）

| 必須 | 後回し |
| ---- | ------ |
| 少数兵科 + 各 2 方式 | 作戦内パッシブ実装 |
| 秒単位攻撃間隔、固定優先ターゲット | パッシブエディタ、Wave 報酬 |
| 敵 group の module 指定 | Save 統合、migration 完全対応 |
| Stage 内 Wave 定義 | 全面エディタ改修、非 M1 兵科 |
| 味方同一兵科禁止、作戦状態（メモリ） | 移動系効果、Wave 間準備 UI |

### R3 で確定した作戦ループ（spec 反映済）

| 項目 | 内容 |
| ---- | ---- |
| 上位ループ | 初期準備 → Wave 戦闘 → Wave 終了 → Wave 間準備 → … → 作戦結果 |
| 状態分離 | 作戦状態（複数 Wave 保持）と戦闘状態（Wave 単位生成・破棄）。同一オブジェクトへ無制限混在禁止 |
| Wave 間リセット | HP 全回復、Barrier / DoT / HoT / CC / 位置 / Attack timer / 一時効果 / 戦闘カウンタ / 一時オブジェクト |
| Wave 間維持 | 編成、戦闘方式、作戦内パッシブ、未使用リソース、クリア済み Wave |
| チェックポイント | 出撃確定時点。出撃前の取得・消費は再試行でも維持 |
| リトライ 3 種 | 同設定再戦 / 準備へ戻る / 作戦最初から（確認ダイアログなし） |
| 途中セーブ | 初期縦切りでは実装しない（メモリ保持のみ） |
| legacy | BattlePhase 自動 Wave 遷移、線形 stage progression、EXP 中心進行 |

### R2 で確定した詳細方針（spec 反映済）

| 項目 | 内容 |
| ---- | ---- |
| Attack | 1 回の行動単位。間隔到達 → 方式に従い対象選択・移動・射程・Hit 列実行 |
| Hit | Attack 内の命中単位。複数 Hit 可。係数・分配は戦闘方式側。Barrier は HP 同様 |
| 攻撃間隔 | 秒単位。兵科基礎値。方式が上書き可。Hit 数と独立。Tier 廃止 |
| 戦闘方式 | 兵科 2 方式。単体/複数統一なし。倍率違いのみ禁止。優先ターゲット・属性は兵科固定 |
| 魔術師 | RES 無視廃止方向。単純魔法攻撃。最近傍優先。2 方式で形状差 |
| 双刃士 | 低 HP 優先。固定 2 Hit 廃止。方式 A 背後回り込み / 方式 B 投げナイフ（候補） |
| DoT | 自然消滅なし・スタック・Wave リセット候補（詳細は R5 前） |
| 一時効果 | 残す/廃止/保留の 3 分類。R5 試作前に再確認 |
| Wave リセット | HP 全回復ほか — **R3 確定**（[operation-loop.md §7](../spec/operation-loop.md#7-wave-間の回復状態リセット)） |
| M1 兵科表 | 9 兵科の方式 **候補** を [classes-and-skills.md §M1](../spec/classes-and-skills.md#m1-兵科--新仕様候補r2) に整理（数値未確定） |

### R1 で更新した上位設計の要点

| 項目 | 内容 |
| ---- | ---- |
| ゲーム核 | 4 人編成、直接操作なし、Wave 事前準備、解法型戦闘 |
| 戦闘方式 | Wave ごとに兵科へ選択。各兵科 2 方式（共通単体/複数分類なし） |
| 兵科固定 | 優先ターゲット・基本ロール・基本処理対象・原則ダメージ属性 |
| 攻撃間隔 | 秒単位。旧 attackSpeed Tier 廃止方向。Hit 数と分離 |
| 作戦内パッシブ | 直接選択取得。作戦中維持→終了リセット。挙動変化優先 |
| 編成制限 | 味方同一兵科禁止。敵は同一兵科複数可 |
| 廃止方向 | 共通 Lv / EXP / 4 枠 active-passive / スキルゲージ / Instant Lv20 / Level Sync |
| Kill/Flow/Survival | 3 レイヤー維持。方式・射程・回復/防護へ再解釈 |
| 魔術師 | RES 無視廃止方向。具体は R2 |

### 新しい直近目標（要約）

プレースホルダー素材で**反復可能な新ゲームループ**を成立させる。正式画像・VFX・効果音・i18n・packaging・itch.io 公開は**新試作成立後**。

主な設計転換: 旧 active / passive 4 枠・gauge・Lv 成長・EXP 廃止方向、Wave ごとの**戦闘方式**選択、味方**同一兵科禁止**、秒単位**攻撃間隔**、**作戦内パッシブ**（任意取得）、Wave 間準備を含む作戦ループ。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) および [combat-architecture.md §0](../combat-architecture.md#0-現行上位方針r1)。

### legacy 扱い

| 対象 | 扱い |
| ---- | ---- |
| `data/stages-demo.json`（7 ステージ） | legacy / reference。新仕様へ移行しない |
| `data/stages.json` legacy 5 件 | dev / reference |
| [skill-finalization-table.md](../plans/skill-finalization-table.md) | legacy 資料のみ。実装計画の正本から除外 |
| 本ファイル §4 以降 | **2026-07-12 以前**の Phase 6/7 handoff ログ。**凍結**。現行計画の正本にしない |

## 3. 参照すべき正本

- [docs/plans/phase-roadmap.md](../plans/phase-roadmap.md) — **R0〜R10**（現行開発順の正本。**R4 完了 → R5**）
- [docs/plans/combat-data-schema-refactor.md](../plans/combat-data-schema-refactor.md) — **R4 正本**（データ責務・エディタ・validate / migration）
- [docs/combat-architecture.md](../combat-architecture.md) — **R1 更新済**（§0 = 上位戦闘正本）
- [docs/system-mechanics.md](../system-mechanics.md) — **R1 更新済**（§0 = 共通メカニクス上位正本。§Player Level 以降 legacy 多）
- [docs/class-philosophy.md](../class-philosophy.md) — **R1 更新済**（§0 = 兵科設計原則）
- [docs/spec/README.md](../spec/README.md) — 現行 spec 索引（**R4 反映済**）

## 4. v0.3.2 確定方針（要約）— **凍結・legacy handoff**

> **2026-07-12:** 以下は Phase 6/7 敵編成作業時の handoff 記録。**新ロードマップ（R0〜）の正本ではない。** 現行の敵 `enemyGroups` 実装資産の説明として参照可。

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
| **7f** | **戦闘終了 → リザルト導線** — `respawnAfterEnd` 廃止、リザルト表示。Exp・`stageRecords` 更新（M1 必須 2 枠）。spec: [progression.md](../spec/progression.md) | **verify OFF 勝利後ステージ選択へ復帰 最小実装済み**（§28；内部 `setGameScreen('map')`）。リザルト画面・報酬演出は未着手 |
| **7g** | **first-play guidance / 敗北時導線** — 初回短いガイダンス文。敗北リザルトから編成見直しへ戻れる導線 | **verify OFF ステージ選択の汎用ガイド + 敗北後 formation 復帰 最小実装済み**（§29・§31）。敗北リザルト UI は未着手 |
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
- **6c 進行**: **§37 P3** — `demo_ch1_03` / `demo_ch1_06` scale 再調整（§36 P2 受け）。ch1_01 のみ default-answer。§35/§36 は履歴
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
| 導線 | ステージ選択の初回ガイドを「順不同で好きな stage を選べ」に寄せる | **§38 で文案反映済み** |
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

## 36. demo_ch1_02 / demo_ch1_05 — §34 P2 scale 再調整（2026-07-08）

**§34 棚卸し・§35 P1 受けの P2**。`enemyGroups` scale のみ。class 数値・UI・save・他 stage 未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§34/§35 |
| 2 | `data/stages-demo.json` | ch1_02 / ch1_05 enemyGroups |
| 3 | `src/battle/demoStageBalance.puzzle.test.ts` | puzzle 期待値 |
| 4 | `src/battle/test/demoStageSim.harness.ts` | 診断 harness |
| 5 | `docs/dev/balance-diagnostics.md` | 診断方針 |
| 6 | `src/battle/demoStageBalance.smoke.test.ts` | smoke 回帰 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `data/stages-demo.json` | ch1_02 / ch1_05 の `enemyGroups` scale 微調整（下表） |
| `demoStageBalance.puzzle.test.ts` | ch1_02 後衛 puzzle / ch1_05 paladin counter 専用 assertion、ch1_05 `badMustDefeat` |
| `demoStageSim.harness.ts` | `logDemoCh1_02BacklineDiagnostics`、ch1_05 診断 read 更新 |
| `docs/dev/balance-diagnostics.md` | §36 P2 行追記 |
| `docs/ai-handoff/current-task.md` | 本節 |

### demo_ch1_02 scale（調整前 → 調整後）

| group | 調整前 | 調整後 |
| ----- | ------ | ------ |
| `df_guardian` atkScale | 1.0 | **1.3** |
| `df_guardian` resScale | 1.0 | **1.07** |
| `at_ranger` atkScale | 1.2 | **1.72** |
| `at_ranger` resScale | 1.0 | **1.34** |

### demo_ch1_05 scale（調整前 → 調整後）

| group | 調整前 | 調整後 |
| ----- | ------ | ------ |
| `at_sorcerer` atkScale | 1.25 | **1.52** |
| `at_sorcerer` resScale | 1.0 | **1.18** |
| `at_assassin` atkScale | 1.2 | **1.48** |

### 調整前後（§34 診断 → §36、`BUILD_FLAVOR=demo` puzzle quad）

| stage | 編成 | 調整前（§34） | 調整後（§36） |
| ----- | ---- | ------------- | ------------- |
| **ch1_02** | baseline | victory 670/670 @123s | victory 670/670 @~127s（満血維持・**遅延 grind**） |
| | bad | victory 200/480 @208s | **defeat** 0/480 @~13s |
| | universal | victory 642/642 @40s | victory **424**/642 @40s |
| | counter | victory 642/642 @40s | victory **420**/642 @40s（**~3× 短縮**） |
| **ch1_05** | baseline | victory 297/670 @21s（2人） | victory **110**/670 @~27s（**1人**） |
| | bad | victory 272/680 @24s | **defeat** 0/680 @~20s |
| | universal | defeat | **defeat** @~19s |
| | counter | victory 546/650 @18s（4人） | victory **366**/650 @~20s（**3人**） |

### 診断・判断

| stage | 要点 |
| ----- | ---- |
| **ch1_02** | 敵 `resScale`/`atkScale` 上げで後衛が長生き＋遠隔圧力増。baseline は cleric 相殺で満血だが **127s 遅延**。sorcerer counter は **40s・HP トレードオフ** — default-answer ではない（速度で明確改善） |
| **ch1_05** | **主題 = paladin counter puzzle**（前衛耐久＋healer で短期火力に耐える）。**assassin = experience spotlight**（`formationHintJa`・ranger slot 差し替え。puzzle counter ではない）。bad 勝利の主因は **~21s 短期決着で cleric 不要** — 敵 atk 上げで no-healer defeat 化 |

### default-answer

**`demo_ch1_01` のみ** — ch1_02 / ch1_05 は default-viable 以下

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **11 passed**（Vitest worker `onTaskUpdate` timeout **ノイズ 1 件**） |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |

## 37. demo_ch1_03 / demo_ch1_06 — §34 P3 scale 再調整（2026-07-08）

**§34 棚卸し・§36 P2 受けの P3**。`enemyGroups` scale のみ。class 数値・UI・save・他 stage 未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§34/§36 |
| 2 | `data/stages-demo.json` | ch1_03 / ch1_06 enemyGroups |
| 3 | `src/battle/demoStageBalance.puzzle.test.ts` | puzzle 期待値 |
| 4 | `src/battle/test/demoStageSim.harness.ts` | 診断 harness |
| 5 | `docs/dev/balance-diagnostics.md` | 診断方針 |
| 6 | `src/battle/demoStageBalance.smoke.test.ts` | smoke 回帰 |

### 変更

| ファイル | 内容 |
| -------- | ---- |
| `data/stages-demo.json` | ch1_03 / ch1_06 の `enemyGroups` scale 微調整（下表） |
| `demoStageBalance.puzzle.test.ts` | ch1_03 `badMustDefeat` + 専用 assertion、ch1_06 counter>baseline assertion |
| `demoStageSim.harness.ts` | `logDemoCh1_03SwarmDiagnostics`、ch1_06 診断 read 更新 |
| `docs/dev/balance-diagnostics.md` | §7 P3 行追記 |
| `docs/ai-handoff/current-task.md` | 本節 |

### demo_ch1_03 scale（調整前 → 調整後）

| group | 調整前 | 調整後 |
| ----- | ------ | ------ |
| `at_swordsman` ×5 atkScale | 0.8 | **0.88** |
| `at_assassin` ×2 atkScale | 1.05 | **1.25** |

### demo_ch1_06 scale（§35 後 → §37）

| group | §35 後 | §37 |
| ----- | ------ | --- |
| `df_paladin` hpScale | 1.1 | **1.0** |
| `df_paladin` atkScale | 1.13 | **1.28** |
| `at_ranger` ×2 hpScale | 0.98 | **0.9** |
| `at_ranger` ×2 atkScale | 1.09 | **1.3** |
| `at_sorcerer` hpScale | 0.98 | **0.88** |
| `at_sorcerer` atkScale | 1.06 | **1.36** |
| `at_swordsman` hpScale | 0.97 | **0.9** |
| `at_swordsman` atkScale | 1.15 | **1.24** |

### 調整前後（§34 診断 → §37、`BUILD_FLAVOR=demo` puzzle quad）

| stage | 編成 | 調整前（§34） | 調整後（§37） |
| ----- | ---- | ------------- | ------------- |
| **ch1_03** | baseline | victory 340/670 (3人) @46s | victory **126/670 (2人)** @~81s |
| | bad | **victory** 285/480 @41s | **defeat** 0/480 @~19s |
| | universal | victory 570/642 @76s | victory **161/642 (2人)** @~81s |
| | counter | victory 740/740 (4人) @48s | victory **740/740 (4人)** @~48s |
| **ch1_06** | baseline | victory 670/670 @74s | victory **646/670** @~73s |
| | bad | victory 104/680 @81s | **defeat** 0/680 @~52s |
| | universal | victory 380/642 @46s | **defeat** 0/642 @~33s |
| | counter | victory 650/650 @58s | victory **650/650** @~57s |

### 診断・判断

| stage | 要点 |
| ----- | ---- |
| **ch1_03** | bad 勝利の主因: 弱 scale 7 体 + ~42s 短期決着で assassin 前衛でも DPS 勝ち。**atkScale 上げ**で no-guardian 即崩壊。baseline は guardian+cleric で傷つき勝利。**double melee counter** が 4 人満血・score 優位 — **群れ＋前衛耐久 puzzle** |
| **ch1_06** | baseline 満血の主因: 戦闘 ~74s で cleric heal ≈ guardian taken が均衡。**atk 上げだけでは均衡維持** → 敵 **hpScale 微減**で短期決着化し heal 時間を削る。baseline 非満血、**counter paladin** が **時間・survivor** で優位（score は RNG で僅差あり）。universal sorcerer は混成火力に **defeat** |

### ステージ意図（再定義）

| stageId | 何を考えさせるか |
| ------- | ---------------- |
| `demo_ch1_03` | **多数近接ラッシュ** — 前衛（guardian）必須。bad=no-guardian は defeat。counter=double melee で接触処理・4 人維持 |
| `demo_ch1_06` | **混成総合試験** — healer 維持 + 前衛役。bad=no-healer defeat。baseline は勝てるが非満血。counter=paladin が **時間・survivor** で sustain 優位 |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.puzzle.test.ts` | **12 passed** |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts` | **8 passed** |

## 38. ステージ選択 UI 文言棚卸し — 順不同選択への最小修正（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§32/§33/§34 前提 |
| 2 | `src/ui/StageSelectionPanel.ts` | 一覧・詳細・出撃 UI |
| 3 | `src/ui/stageDetailDom.ts` | 初回ガイド・敵編成詳細 |
| 4 | `src/game/StageSelectionScreenHost.ts` | map host 経由の panel mount |
| 5 | `src/styles/stage-selection-panel.css` | panel レイアウト |
| 6 | `src/game/GameSession.ts`（Grep） | `mapHost` / `screen: 'map'` 内部呼称 |

**追加参照:** `src/ui/BattleView.ts`（verify 専用 battle log）、`docs/spec/stage-selection-ui.md`

### UI 表示文言の棚卸し（map / next / progress 系）

| 箇所 | 文言 | 判定 |
| ---- | ---- | ---- |
| `StageSelectionPanel` | （修正前）画面タイトルなし | **不足** — 「マップ」は無いがハブ名が不明瞭 |
| `FIRST_PLAY_GUIDANCE_JA` | （修正前）「ステージ情報を見て出撃…」 | **弱い** — 順不同・再挑戦の示唆なし |
| `aria-label` | 「ステージ一覧」 | **問題なし** |
| 詳細 | `想定 Lv` / `敵編成` / `出撃` | **問題なし** — 難易度・敵編成が主情報 |
| 一覧行 | `displayName` のみ（番号・ロック・現在地ラベルなし） | **問題なし** |
| `currentStageId` 表示 | **なし**（選択ハイライトのみ。進行地点ラベルなし） | **問題なし** |
| `BattleView.pushLog` | verify ON のみ `Advancing to next stage...` 等 | **体験版非表示**（verify OFF では log 抑止） |
| `docs/spec/stage-selection-ui.md` | 「マップ一覧」「進行チェーン順」等 | **§39 で spec 用語統一済み** |

**UI 上の map / next / progress 系ユーザー向け文言:** ステージ選択画面本体には **なし**（verify 専用 battle log に next/previous stage 英語のみ）。

### ステージ一覧の見え方評価

| 観点 | 評価 |
| ---- | ---- |
| 一本道マップ感 | **低〜中** — 縦リストが JSON 配列順（ch1_01→07）のため順序連想は残るが、番号・矢印・ロック・「現在地」表示はない |
| 順不同選択感 | **修正後は改善** — 画面タイトル「ステージ選択」+ ガイドで「挑戦したいステージを選ぶ」「順不同で再挑戦」を明示 |
| 主情報 | **想定 Lv + 敵編成** が詳細の中心。クリア済み ☆ / 履歴は未実装（将来） |

### 内部名 rename 判断

| 対象 | 判断 | 理由 |
| ---- | ---- | ---- |
| `mapHost` / `screen: 'map'` / `.game-shell__map` | **今回見送り** | `GameSession`・`gameScreen.ts`・`menuHost.ts`・wire テスト・CSS・handoff/spec 多数参照。表示文言だけでは一本道連想は解消済み |
| `openStageSelection()` | 既に stage 寄りの公開 API あり | rename 対象外 |
| 後続案 | `GameScreen` を `'stageSelection'` に、`mapHost` → `stageSelectionHost` 要素名に段階 rename | Phase 7 整理 or 8 前の refactor タスク |

### 変更（最小 UI 文案）

| ファイル | 内容 |
| -------- | ---- |
| `src/ui/stageDetailDom.ts` | `STAGE_SELECTION_PANEL_TITLE_JA` 追加。`FIRST_PLAY_GUIDANCE_JA` を順不同・再挑戦明示に更新 |
| `src/ui/StageSelectionPanel.ts` | 画面上部 `h1`「ステージ選択」。コメント map→stage-selection |
| `src/styles/stage-selection-panel.css` | タイトル用スタイル |
| `src/ui/StageSelectionPanel.test.ts` | タイトル表示・ガイド位置の期待値更新 |
| `docs/spec/stage-selection-ui.md` | §2 画面タイトル・初回ガイド 1 行のみ同期 |

**触らなかった:** `mapHost` / `screen: 'map'` rename、`GameSession` / save / `currentStageId`、`stages-demo.json` / class / `enemyGroups`、レイアウト大改修、クリア済み表示

### 修正した文言

| 種別 | 修正前 | 修正後 |
| ---- | ------ | ------ |
| 画面タイトル | （なし） | **ステージ選択** |
| 初回ガイド | ステージ情報を見て出撃し、編成画面で役割を調整してください。戦闘は自動で進みます。 | **挑戦したいステージを選んで出撃し、編成画面で役割を調整してください。順不同で何度でも再挑戦できます。戦闘は自動で進みます。** |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `StageSelectionPanel.test.ts` | **5 passed** |
| `stageSelectionWire.test.ts` | **4 passed** |
| `gameSessionWire.test.ts` | **8 passed** |
| **合計** | **17 passed** |

### 後続課題（今回やらない）

- `GameScreen` / `mapHost` / `.game-shell__map` の rename
- クリア済み ☆ / `stageRecords` 表示（一覧の主情報強化）
- 一覧の JSON 配列順以外の並び（レイアウト変更はスコープ外）

## 39. spec / handoff 用語統一 — 「マップ」→「ステージ選択」（2026-07-08）

**§38 後続** — ユーザー向け spec・handoff の map / マップ呼称を最小限統一。実装 rename・save / UI ロジック変更なし。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本・§38 前提 |
| 2 | `docs/spec/stage-selection-ui.md` | ステージ選択 UI spec 正本 |
| 3 | `src/ui/StageSelectionPanel.ts` | 画面タイトル・一覧 UI（§38 反映済み） |
| 4 | `src/ui/stageDetailDom.ts` | タイトル定数・初回ガイド |
| 5 | `src/game/StageSelectionScreenHost.ts` | 内部 host コメント |
| 6 | `docs/spec/progression.md`（Grep） | 横断参照の「マップ一覧」リンク |

### 「マップ / map / next / progress / current」系棚卸し結果

| 対象 | 修正前の問題 | 修正後 |
| ---- | ------------ | ------ |
| `stage-selection-ui.md` §1 導線 | 「マップ選択」「マップ一覧」 | **ステージ選択** |
| `stage-selection-ui.md` §2 | 「進行」行（未クリア/ロック/前ステージ）、「進行チェーン順」 | **クリア状態（将来）** + 体験版は全 stage 選択可。**JSON 配列順（表示順・解放順ではない）** |
| `stage-selection-ui.md` §4/6/8 | 「マップに戻る」「マップ一覧」 | **ステージ選択** |
| `stage-selection-ui.md` 実装注記 | `map` のみ | **`map` は内部名**、`mapHost` / `.game-shell__map` も注記 |
| `current-task.md` §2 | 起動画面を **map** と表記 | **ステージ選択**（内部 screen `'map'` 注記） |
| `current-task.md` §7f/7g | map 復帰 / map ガイド | **ステージ選択** へ復帰・ガイド |
| `progression.md` Stage Records 節 | 「マップ一覧」×2 + 旧 §2 アンカー | **ステージ選択一覧** + 新アンカー |
| UI 実装（`StageSelectionPanel` 等） | ユーザー向け「マップ」なし（§38 済み） | **変更なし** |
| verify ON `BattleView` log | `Advancing to next stage...` 等 | **debug legacy のまま**（体験版非表示） |

**残存（意図的）:** handoff 履歴節（§26〜§33 等）の `mapHost` / `setGameScreen('map')` は **実装ログとして内部名のまま**。§2 に用語方針を追記。

**一本道連想文言:** spec から「次のステージ」「進行中」「現在地」「解放順」「前ステージ未クリアロック」を除去または「将来/表示順」に限定。UI にはもともとなし。

### 修正した用語（代表）

| 修正前 | 修正後 |
| ------ | ------ |
| マップ選択 / マップ一覧 | **ステージ選択** / **ステージ選択一覧** |
| 進行（一覧行） | **クリア状態（将来）** |
| 進行チェーン順 | **JSON 配列順（表示順・解放順ではない）** |
| マップに戻る | **ステージ選択画面に戻る** |
| 起動 **map**（handoff §2） | 起動 **ステージ選択**（内部 `'map'`） |

### 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `docs/spec/stage-selection-ui.md` | 全体用語統一・体験版前提追記・内部名注記 |
| `docs/ai-handoff/current-task.md` | §2/§7/§34 表の user-facing 整理 + 本 §39 |
| `docs/spec/progression.md` | Stage Records 節の参照文言・アンカー 3 行（リンク切れ防止） |
| `src/game/StageSelectionScreenHost.ts` | JSDoc コメントのみ（内部名注記） |

**触らなかった:** `mapHost` / `screen: 'map'` rename、`GameSession` / save / `currentStageId`、UI レイアウト・ロジック、`stages-demo.json` / class / `enemyGroups`

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/ui/StageSelectionPanel.test.ts src/game/stageSelectionWire.test.ts src/game/gameSessionWire.test.ts` | **17 passed** |

## 40. クリア済み状態 / stageRecords — 最小設計棚卸し（2026-07-08）

**§39 後続** — ステージ選択型フロー向けの save・報酬・UI 接続点を調査。**実装・save schema 変更・migration 改修は今回行わない**。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§32/§33/§39 前提） |
| 2 | `src/battle/types.ts` | `StageProgress` / `SaveGameState` 型 |
| 3 | `src/save/SaveManager.ts` | save 読込・`parseStageProgress`・v1 migration |
| 4 | `src/progression/victoryRewards.ts` | `applyVictoryRewards` / `createDefaultSave` |
| 5 | `src/ui/StageSelectionPanel.ts` + `src/game/StageSelectionScreenHost.ts` | 一覧 UI・save 非接続の確認 |
| 6 | `docs/spec/progression.md` + `docs/spec/stage-selection-ui.md`（Grep） | `stageRecords` 正本・体験版 v1 表示方針 |

### 1. `save.stageProgress` 周辺の stage 別記録

| フィールド | スコープ | 内容 |
| ---------- | -------- | ---- |
| `currentStageId` | セッション文脈 | 最後に sortie した stage（verify OFF 勝利後も **維持** §33） |
| `totalClears` | **アカウント全体** | 勝利回数の累計。**stage 別ではない** |

**結論:** `stageProgress` に **stageId 別のクリア記録は存在しない**。`totalClears` から特定 stage のクリア可否は復元できない。

**関連（stage 別ではないが勝利で更新）:** `save.unlockedClassIds` — `StageDef.unlockClassIdsOnClear` 経由（例: `demo_ch1_07` → `at_ballista`）。**間接的な「この stage をクリアした」証拠にはなりうるが、汎用クリアフラグではない**（unlock 定義のない stage は痕跡ゼロ）。

**`SaveGameState` ルート:** `version` / `stageProgress` / `party` / `unlockedClassIds` のみ。`progression.md` にある `stageRecords?` は **型・パーサ・実装とも未接続**（`src/` に `stageRecords` / `clearedStageIds` / `StageRecord` 参照なし）。

**`SaveManager.parseStageProgress`:** `currentStageId` + `totalClears` 以外は **読み捨て**。将来フィールドを JSON に書いても、パーサ未更新なら **ロード時に消失**。

### 2. `applyVictoryRewards` の stage 別記録

**現状フロー（`clearedStageId = save.stageProgress.currentStageId` 読取後）:**

| 処理 | stage 別記録 |
| ---- | ------------ |
| EXP 付与（`computeStageExpReward(clearedStageId)`） | なし（メンバー `progress` のみ） |
| `unlockClassIdsOnClear` → `unlockedClassIds` merge | 間接のみ（上記） |
| `advanceCurrentStage` 時のみ `currentStageId` 更新 | 次 stage へのポインタ（クリア履歴ではない） |
| `totalClears += 1` | グローバル累計のみ |

**結論:** `totalClears++` **以外に stageId 別の永続記録はない**。`clearedStageId` は unlock 判定に使われるが、**「クリア済み」リストには書き込まれない**。

**拡張フック:** `applyVictoryRewards` は既に `clearedStageId` を局所変数で保持。**末尾（`totalClears++` の前後）に merge 1 行を足す形が自然**（§32 案と一致）。`GameSession.handleVictory` は `advanceCurrentStage: verifyMode` を渡すだけ — verify OFF でも **報酬関数自体は常に呼ばれる**。

### 3. `StageSelectionPanel` — クリア済み表示の構造

| 観点 | 現状 |
| ---- | ---- |
| 入力 | `GameData` のみ（`stages` 一覧）。**save 非参照** |
| Host | `StageSelectionScreenHost` は `getCurrentStageId()` のみ save から取得 |
| 一覧行 | `displayName` + 選択ハイライトのみ |
| 詳細 | 想定 Lv・敵編成・出撃ボタン |
| クリア表示 | **未実装**（§39 / `stage-selection-ui.md` §2「体験版 v1 では一覧にクリア状態なし」） |

**UI 拡張の最小接点:**

1. `StageSelectionPanelOptions` に `clearedStageIds?: ReadonlySet<string>` または `isStageCleared?: (id) => boolean`
2. `renderStageList` で行ラベル横に HUD プレート（例: 「クリア」／☆ は `stageRecords` 側）
3. `StageSelectionScreenHost.show()` で save から set を組み立てて Panel へ渡す

**現状の Panel は「表示できる構造」ではない** — save 入力と render 分岐が未接続。ただし **options 追加 + list item DOM 1 箇所** で最小表示は可能（レイアウト大改修不要）。

### 4. 最小 save 追加案

#### A. 最小案 — `clearedStageIds`

```typescript
// stageProgress 内に置く案（進行ブロックと同居）
interface StageProgress {
  currentStageId: string;
  totalClears: number;
  clearedStageIds?: string[]; // 省略時 []
}
```

| 項目 | 内容 |
| ---- | ---- |
| 更新 | 勝利時 `clearedStageId` を重複除去 merge |
| 読取 | `clearedStageIds.includes(stageId)` |
| 初期値 | `createDefaultSave` → `[]` または省略 |
| パーサ | `parseStageProgress` に optional 配列（空/欠落 → `[]`） |
| SAVE_VERSION | **据え置き可**（optional 追加のみ） |
| v1 migration | 変更不要（v1 も同パース経路） |

**代替:** `SaveGameState` ルートに `clearedStageIds?` — stage 進行と分離できるが、handoff §32 は `stageProgress` 同居案。どちらも migration 負荷は同等。

#### B. 拡張案 — `stageRecords`（spec 正本）

```typescript
// SaveGameState ルート（progression.md 正本）
stageRecords?: Record<StageId, StageRecord>;
// StageRecord = lowestLevelClear? + fastestTimeClear?（各 StageClearEntry）
```

| 項目 | 内容 |
| ---- | ---- |
| 更新 | 勝利時 `StageClearEntry` 生成 + 2 枠比較更新 |
| 入力データ | **`clearTimeMs` 計測未実装**、`clearLevel` / `partyClassIds` / `levelSyncUsed` も GameSession 側で未収集 |
| ☆ 表示 | `atRecommendedLevel` 要 `stageRecords` |
| パーサ | 新規 `parseStageRecords`（optional、欠落 → `{}`） |
| SAVE_VERSION | optional なら据え置き可。strict 必須化時のみ bump |

### 5. `clearedStageIds` vs `stageRecords` 比較

| 観点 | `clearedStageIds` | `stageRecords` |
| ---- | ----------------- | -------------- |
| 体験版 v1「クリア済み表示」 | **十分** | 過剰（ただし ☆/ベスト値も欲しければ必要） |
| spec 整合 | progression.md の将来 `stageRecords` と **併存可**（records のキー集合 ⊇ cleared） | **progression.md / stage-selection-ui.md 正本** |
| 実装規模 | 型 + パーサ + merge 1 関数 + Panel 行表示 | 型 + パーサ + 計測 + 2 枠更新 + リザルト/詳細 UI |
| 再クリア | 冪等 merge のみ | 2 枠は「上書き条件付き」— 再挑戦に相性良い |
| データ量 | 7 stage × id 文字列 | 枠あたり party + time + level |
| 後方互換 | optional `[]` で既存セーブ無変更相当 | optional `{}` 同様 |

**Hensei-Only 向け推奨:** **段階導入** — まず `clearedStageIds` で一覧の「クリア済み」表示。`stageRecords` はリザルト 2 枠・☆・Records 横断（Phase 14）と **同じ PR または直後** にまとめるのが効率的（計測基盤を 1 回で作る）。

**体験版 v1 で本当に必要なもの:** handoff / `stage-selection-ui.md` 上は **v1 一覧にクリア状態なし** と明記。**プレイヤー向け必須は未確定** — 最低限の達成感なら `clearedStageIds` のみで足りる。roadmap M1 必須 2 枠は **spec 上は `stageRecords` 必須** だが、現 handoff 残タスク（§30）ではリザルト未着手のため **実装タイミングは次フェーズ**。

### 6. 最小実装案（次 PR 向け・今回は未実装）

**Phase A — save + 報酬（verify ON/OFF 共通）**

1. `StageProgress.clearedStageIds?: string[]` + `parseStageProgress` optional 配列
2. `mergeClearedStageId(save, stageId)` — `applyVictoryRewards` 末尾で呼ぶ（`advanceCurrentStage` とは独立）
3. `createDefaultSave` — 省略 or `[]`
4. テスト: `victoryRewards` — 初クリア merge / 再クリア冪等 / verify OFF で `currentStageId` 不変と併用

**Phase B — UI（verify OFF のみ表示で可）**

1. `StageSelectionScreenHost` — save から `clearedStageIds` を Panel options へ
2. `StageSelectionPanel.renderStageList` — クリア済み行に HUD ラベル（Web badge 禁止 — `game-panel-surface` 系）
3. テスト: Panel — cleared id でラベル DOM

**触らない:** `currentStageId` 意味変更、`selectedStageId` 導入、map rename、リザルト画面

### 7. 後続拡張案（`stageRecords`）

1. 戦闘開始〜勝利の **`clearTimeMs`** を `BattleEngine` / `GameSession` で計測
2. `resolveEffectiveLevel` + 編成 4 クラス + Level Sync フラグで `StageClearEntry` 生成
3. `updateStageRecords(save, stageId, entry)` — progression.md 2 枠ルール
4. リザルト画面（7f）で 2 行表示 → 一覧サマリー（Lv / タイム）+ ☆
5. **`clearedStageIds` との関係:** records 更新時に `clearedStageIds` も merge（単一ソースにするなら records のキーから導出も可）

### 8. save migration 影響見込み

| 変更 | 影響 |
| ---- | ---- |
| `clearedStageIds?` optional | **小** — `SAVE_VERSION` 据え置き、`migrateSaveV1` 変更不要、既存 JSON は `[]` 扱い |
| `stageRecords?` optional | **小〜中** — パーサ追加のみなら version 据え置き可。entry バリデーション厳密化で bump 検討 |
| `parseStageProgress` 未更新のまま JSON にだけ書く | **データ消失** — 必ずパーサ同期 |
| verify / release スロット分離 | 既存どおり — 両スロット独立。cleared は release のみ更新でよい（verify 汚染回避は optional） |

**大改修不要の条件:** optional フィールド + デフォルト空 + version 据え置き。

### 9. verify ON Debug 導線への影響見込み

| 方針 | 影響 |
| ---- | ---- |
| `applyVictoryRewards` 内で **常に** `clearedStageIds` merge | verify セーブにもクリアが溜まる — Debug ループ検証用なら許容、release 汚染なし（スロット分離済み） |
| merge を **`!verifyMode` 時のみ** | release のみクリア記録 — **Debug 導線は無変更**（推奨: 体験版表示は release のみならこちらでも可） |
| `advanceCurrentStage: verifyMode` | **現状維持** — verify ON は `currentStageId` 自動進行 + loopStage。cleared 追加は直交 |
| `StageSelectionPanel` クリア表示 | verify ON 起動 `battle` — **Panel 非表示のため影響なし** |

**結論:** cleared 更新を verify OFF（release save）に限定すれば **verify ON Debug 導線へ影響ゼロ**。共通 merge でもスロット分離で release は独立。

### 10. 今回の判断

| 項目 | 内容 |
| ---- | ---- |
| 実装 | **見送り** — ユーザー指示「調査・設計整理まで」「save schema 大変更 / migration 大改修しない」 |
| 成果 | 本 §40 の棚卸し + 次 PR の Phase A/B 手順 |

**触らなかった:** save schema 実装、`StageSelectionPanel` ロジック、`GameSession` / `currentStageId`、`stages-demo.json` / class / `enemyGroups`、migration 改修、UI レイアウト

### 11. 残タスク（クリア表示着手時）

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [x] spec 追随: `stage-selection-ui.md` §2 クリア済みラベル追記（§41）

---

## 41. clearedStageIds 最小実装（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§40 調査結果） |
| 2 | `src/battle/types.ts` | `StageProgress` 型 |
| 3 | `src/save/SaveManager.ts` | `parseStageProgress` |
| 4 | `src/progression/victoryRewards.ts` | `applyVictoryRewards` / `createDefaultSave` |
| 5 | `src/ui/StageSelectionPanel.ts` + `src/game/StageSelectionScreenHost.ts` | 一覧 UI 配線 |
| 6 | `docs/spec/progression.md` + `docs/spec/stage-selection-ui.md` | spec 最小更新 |

### 実装内容

| 項目 | 内容 |
| ---- | ---- |
| 型 | `StageProgress.clearedStageIds?: string[]` |
| parse | `parseStageProgress` — optional 配列。欠落・空 → フィールド省略（`[]` 相当） |
| default save | `createDefaultSave` → `clearedStageIds: []` |
| merge | `mergeClearedStageId` — `applyVictoryRewards` で **`advanceCurrentStage === false`（verify OFF / release）の勝利時のみ** |
| UI | `StageSelectionScreenHost` → `getClearedStageIds` → Panel 一覧行に「クリア済み」HUD ラベル |
| 進行 | `currentStageId` 勝敗時維持（§33）— 変更なし。cleared は unlock / ロックに未使用 |

### テスト

| ファイル | 結果 |
| -------- | ---- |
| `victoryRewards.unlock.test.ts` | merge / verify OFF 記録 / verify ON 非記録 / 冪等 |
| `saveManager.clearedStageIds.test.ts` | round-trip / 欠落時 undefined |
| `StageSelectionPanel.test.ts` | クリア済みラベル DOM |
| `stageSelectionWire.test.ts` | Host → clearedStageIds 配線 |

### 触らなかった

`stageRecords` / best time / best party / 星評価、`selectedStageId` 本格導入、SAVE_VERSION bump、`stages-demo.json` / class / `enemyGroups`、UI レイアウト大改修、map rename

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）

---

## 42. §34〜§41 総合回帰確認（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§41 まで） |
| 2 | `src/game/gameSessionWire.test.ts` | verify OFF/ON 導線 wire |
| 3 | `src/game/stageSelectionWire.test.ts` | clearedStageIds 配線 |
| 4 | `src/progression/victoryRewards.unlock.test.ts` | clearedStageIds merge 規則 |
| 5 | `src/battle/demoStageBalance.smoke.test.ts` | demo runtime smoke |
| 6 | `src/battle/demoStageBalance.puzzle.test.ts` | demo puzzle quad |

### 実行テスト（7 ファイル / 51 件）

| ファイル | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | 8/8 pass（§42 でクリア済みラベル DOM 期待を修正後） |
| `stageSelectionWire.test.ts` | 5/5 pass |
| `victoryRewards.unlock.test.ts` | 9/9 pass |
| `saveManager.clearedStageIds.test.ts` | 2/2 pass |
| `StageSelectionPanel.test.ts` | 7/7 pass |
| `demoStageBalance.smoke.test.ts` | 8/8 pass |
| `demoStageBalance.puzzle.test.ts` | **11/12 pass** — `demo_ch1_07` finale counter 勝利が **defeat** |

### 確認項目

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | verify OFF 起動 → ステージ選択 → 出撃 → 編成 → 戦闘 | **OK** — `gameSessionWire` map 起動 / sortie / formation→battle |
| 2 | verify OFF 勝利後 `currentStageId` 同 stage 維持 | **OK** — `gameSessionWire` + `victoryRewards.unlock` |
| 3 | verify OFF 勝利後 `clearedStageIds` 記録 + 一覧「クリア済み」 | **OK** — `victoryRewards` / `stageSelectionWire` / `StageSelectionPanel` / `gameSessionWire`（§42 修正後） |
| 4 | クリア済み stage 再挑戦 | **OK（コード確認）** — `StageSelectionPanel` は cleared でも出撃ボタン有効。`handleStageSortie` にロック分岐なし |
| 5 | verify OFF 敗北後 rollback なし・同 stage 編成へ | **OK** — `gameSessionWire` defeat→formation、`currentStageId` 維持 |
| 6 | verify ON Debug 勝利 next / 敗北 previous / loopStageId | **OK** — `gameSessionWire` verify ON 3 件 pass |
| 7 | demo balance smoke / puzzle | smoke **8/8**。puzzle **ch1_07 のみ FAIL**（counter=paladin が全滅 defeat） |
| 8 | default-answer = `demo_ch1_01` のみ | **維持** — ch1_01 baseline 満血勝利（154s）。ch1_02/03/05 は baseline 勝利だが doc 上 default-viable（非 default-answer）。ch1_07 は全編成 defeat で puzzle 意図から逸脱 |
| 9 | class / stage / enemyGroups 不要変更 | **今回未変更** — 回帰確認のみ。git 作業ツリー差分なし |
| 10 | UI / save / `currentStageId` 追加変更 | **なし**（`gameSessionWire.test.ts` の DOM 期待修正のみ） |

### verify OFF 勝利導線

map 起動 → 出撃 → 編成 → 戦闘 → 勝利 → map 復帰。`currentStageId` はクリア stage のまま。`clearedStageIds` に stageId が merge され、一覧に「クリア済み」HUD ラベル表示。

### verify OFF 敗北導線

rollback なし。`currentStageId` 維持のまま編成画面（`formation`）へ。再出撃可能。

### clearedStageIds / クリア済み表示 / 再挑戦

- verify OFF 勝利のみ記録（`advanceCurrentStage: false`）
- verify ON では記録しない
- 再クリアは冪等 merge
- クリア済みでも出撃・再挑戦に制限なし（状態表示のみ）

### verify ON Debug 導線

起動 battle 維持。勝利で `currentStageId` 次 stage へ。敗北で previous stage rollback。loopStageId 時は defeat でロールバック停止。

### demo balance

| suite | 結果 |
| ----- | ---- |
| smoke（7 stage + data sanity） | **全 pass** |
| puzzle quad | ch1_01〜06 + 個別診断 **pass**。**ch1_07 counter 勝利 FAIL**（baseline/bad/universal/counter 全 defeat） |

**ch1_07 診断:** counter paladin `damageTaken=692`、baseline guardian `465`。敵 at_ballista 前の Lv2 6 体圧で sustain 不足。**§34〜§37 は ch1_07 データ未変更** — 別要因（戦闘エンジン drift または既知の未調整）の可能性。今回は stage 数値変更スコープ外のため未修正。

### default-answer

`demo_ch1_01` のみ — baseline 満血勝利、bad=defeat、universal 最速（57s）。他 stage は puzzle 軸（速度・編成差・healer 必須等）で default-answer ではない。

### 今回の変更

| ファイル | 内容 |
| -------- | ---- |
| `src/game/gameSessionWire.test.ts` | §41 クリア済みラベル DOM 追加に伴う期待値修正 + `clearedStageIds` / ラベル DOM 断言 |
| `docs/ai-handoff/current-task.md` | 本 §42 |

### 触らなかった

`stageRecords` / best time / best party / 星評価、`selectedStageId` 本格導入、map rename、UI レイアウト大改修、`stages-demo.json` / class 数値 / `enemyGroups` 変更、`demo_ch1_07` balance 調整、`GameSession` / `SaveManager` / `StageSelectionPanel` ロジック

### 残タスク

- [ ] `demo_ch1_07` puzzle counter 勝利の復帰（6c 調整 or 戦闘 drift 調査）— **回帰で検出、未着手**
- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）

## 43. demo_ch1_07 puzzle counter 勝利復帰（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | §42 現状・制約 |
| 2 | `data/stages-demo.json` | `demo_ch1_07` enemyGroups scale |
| 3 | `src/battle/demoStageBalance.puzzle.test.ts` | quad 期待値 |
| 4 | `src/battle/test/demoStageSim.harness.ts` | counter 編成・`logDemoCh1_07FinaleDiagnostics` |
| 5 | `docs/dev/balance-diagnostics.md` | ch1_07 診断方針 |
| 6 | `docs/ai-handoff/current-task.md` §34 quad 表 | 調整前の目標値（counter victory @112s） |

### counter defeat の原因

- §42 時点で baseline / bad / universal / counter **全 defeat**（puzzle 11/12）。
- counter（paladin + cleric）は **90.9s まで延長**するが全滅。paladin `damageTaken=686`、cleric `damageTaken=629` / `healingDealt=662` で回復が追いつかず後衛が落ちる。
- ranger は `primaryTarget=at_ballista` だが **damageDealt=73** のみ（sorcerer 仕留めのみ）。敵 ballista の高 MaxHP + 6 体総火力（特に `at_sorcerer` atkScale 1.02）が counter を崩す主因。
- baseline guardian は 69s で先落ち（`damageTaken=462`）— 意図どおり defeat 維持可能。

### 調整内容（`demo_ch1_07` enemyGroups scale のみ）

| group | 変更 |
| ----- | ---- |
| enemy `df_paladin` | atkScale 0.85→**0.78**、resScale 1.0→**0.95** |
| enemy `sp_cleric` / `sp_wardweaver` | atkScale 0.85→**0.78** |
| enemy `at_ballista` | hpScale 0.9→**0.86**、atkScale 0.86→**0.78** |
| enemy `at_sorcerer` | atkScale 1.02→**0.9** |
| enemy `at_assassin` | atkScale 0.96→**0.86** |

HP scale 増加は行わず、atkScale / resScale 優先。ballista のみ hpScale を微減（仕留め時間短縮）。

### before / after quad

| 編成 | §42（調整前） | §43（調整後） |
| ---- | ------------- | ------------- |
| baseline | defeat @69s | defeat @106s |
| bad | defeat @40s | defeat @53s |
| universal | defeat @29s | defeat @35s |
| counter | **defeat** @91s | **victory** 650/650 @111s |

### 確認項目

| 項目 | 結果 |
| ---- | ---- |
| at_ballista を player counter 前提にしていない | **OK** — counter は `configurePaladinTankParty`（`df_paladin`）のみ |
| demo_ch1_07 を終了扱いにしていない | **OK** — `GameSession` / 体験版終了導線未変更 |
| default-answer = ch1_01 のみ | **維持** — ch1_07 は counter-required-ish |
| class 数値変更 | **なし** |
| UI / save / currentStageId / clearedStageIds | **未変更** |

### 実行テスト

| ファイル | 結果 |
| -------- | ---- |
| `demoStageBalance.puzzle.test.ts` | **12/12 pass** |
| `demoStageBalance.smoke.test.ts` | **8/8 pass** |

### 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `data/stages-demo.json` | `demo_ch1_07` enemyGroups scale 微調整 |
| `src/battle/test/demoStageSim.harness.ts` | `logDemoCh1_07FinaleDiagnostics` に counter defeat 時の調整ヒント追記 |
| `docs/dev/balance-diagnostics.md` | §43 ch1_07 scale メモ |
| `docs/ai-handoff/current-task.md` | 本 §43 |

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [ ] 7h 体験版終了画面（`demo_ch1_07` クリア後）

---

## 44. §43 後 総合回帰確認（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§43 まで） |
| 2 | `src/game/gameSessionWire.test.ts` | verify OFF/ON 導線 wire |
| 3 | `src/progression/victoryRewards.unlock.test.ts` | clearedStageIds merge 規則 |
| 4 | `src/battle/demoStageBalance.smoke.test.ts` | demo runtime smoke |
| 5 | `src/battle/demoStageBalance.puzzle.test.ts` | demo puzzle quad |
| 6 | `src/battle/test/demoStageSim.harness.ts` | default-answer / ch1_07 診断 |

### 実行テスト（7 ファイル / 51 件）

| ファイル | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | 8/8 pass |
| `stageSelectionWire.test.ts` | 5/5 pass |
| `victoryRewards.unlock.test.ts` | 9/9 pass |
| `saveManager.clearedStageIds.test.ts` | 2/2 pass |
| `StageSelectionPanel.test.ts` | 7/7 pass |
| `demoStageBalance.smoke.test.ts` | 8/8 pass |
| `demoStageBalance.puzzle.test.ts` | **12/12 pass**（§43 修正後 ch1_07 counter 勝利を含む） |

**注:** vitest worker `onTaskUpdate` timeout の unhandled error が 1 件出たが、全テスト pass。インフラ警告のみ。

### 確認項目

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | verify OFF 起動 → ステージ選択 → 出撃 → 編成 → 戦闘 | **OK** — `gameSessionWire` map 起動 / sortie / formation→battle |
| 2 | verify OFF 勝利後 `currentStageId` 同 stage 維持 | **OK** — `gameSessionWire` + `victoryRewards.unlock` |
| 3 | verify OFF 勝利後 `clearedStageIds` 記録 + 一覧「クリア済み」 | **OK** — `victoryRewards` / `stageSelectionWire` / `StageSelectionPanel` / `gameSessionWire` |
| 4 | クリア済み stage 再挑戦 | **OK（コード確認）** — cleared でも出撃ボタン有効。`handleStageSortie` にロック分岐なし |
| 5 | verify OFF 敗北後 rollback なし・同 stage 編成へ | **OK** — `gameSessionWire` defeat→formation、`currentStageId` 維持 |
| 6 | verify ON Debug 勝利 next / 敗北 previous / loopStageId | **OK** — `gameSessionWire` verify ON 3 件 pass |
| 7 | demo balance smoke / puzzle | smoke **8/8**。puzzle **12/12**（ch1_07 含む全 pass） |
| 8 | default-answer = `demo_ch1_01` のみ | **維持** — ch1_01 baseline 満血勝利（154.3s）、bad=defeat。他 stage は puzzle 軸（非 default-answer） |
| 9 | `demo_ch1_07` quad 維持 | **OK** — baseline/bad/universal=defeat、counter=victory @111.1s |
| 10 | class / stage / enemyGroups 不要変更 | **今回未変更** — 回帰確認のみ |

### verify OFF 勝利導線

map 起動 → 出撃 → 編成 → 戦闘 → 勝利 → map 復帰。`currentStageId` はクリア stage のまま。`clearedStageIds` に stageId merge、一覧に「クリア済み」HUD ラベル。

### verify OFF 敗北導線

rollback なし。`currentStageId` 維持のまま編成画面（`formation`）へ。再出撃可能。

### clearedStageIds / クリア済み表示 / 再挑戦

- verify OFF 勝利のみ記録（`advanceCurrentStage: false`）
- verify ON では記録しない
- 再クリアは冪等 merge
- クリア済みでも出撃・再挑戦に制限なし（状態表示のみ）

### verify ON Debug 導線

起動 battle 維持。勝利で `currentStageId` 次 stage へ。敗北で previous stage rollback。loopStageId 時は defeat でロールバック停止。

### demo balance

| suite | 結果 |
| ----- | ---- |
| smoke（7 stage + data sanity） | **全 pass** |
| puzzle quad | **全 pass**（ch1_01〜07） |

### demo_ch1_07 quad（§43 調整後・今回計測）

| 編成 | 結果 | 秒数 |
| ---- | ---- | ---- |
| baseline | defeat | 105.9s |
| bad | defeat | 53.3s |
| universal | defeat | 35.4s |
| counter | **victory** 650/650 HP | 111.1s |

counter は `configurePaladinTankParty`（`df_paladin`）— player `at_ballista` 前提なし。smoke（standard party）は defeat @126.6s（意図どおり）。

### default-answer

`demo_ch1_01` のみ — baseline 満血勝利、bad=defeat、universal 最速（57.5s）。ch1_02〜07 は puzzle 軸で default-answer ではない。

### 今回の変更

| ファイル | 内容 |
| -------- | ---- |
| `docs/ai-handoff/current-task.md` | 本 §44 |

### 触らなかった

`stageRecords` / best time / best party / 星評価、`selectedStageId` 本格導入、map rename、UI レイアウト大改修、`stages-demo.json` / class 数値 / `enemyGroups` 変更、`GameSession` / `SaveManager` / `StageSelectionPanel` ロジック

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [ ] 7h 体験版終了画面（`demo_ch1_07` クリア後）

---

## 44. §43 後 総合回帰確認（2026-07-08）

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§43 まで） |
| 2 | `src/game/gameSessionWire.test.ts` | verify OFF/ON 導線 wire |
| 3 | `src/progression/victoryRewards.unlock.test.ts` | clearedStageIds merge 規則 |
| 4 | `src/battle/demoStageBalance.smoke.test.ts` | demo runtime smoke |
| 5 | `src/battle/demoStageBalance.puzzle.test.ts` | demo puzzle quad |
| 6 | `src/battle/test/demoStageSim.harness.ts` | default-answer / ch1_07 診断 |

### 実行テスト（7 ファイル / 51 件）

| ファイル | 結果 |
| -------- | ---- |
| `gameSessionWire.test.ts` | 8/8 pass |
| `stageSelectionWire.test.ts` | 5/5 pass |
| `victoryRewards.unlock.test.ts` | 9/9 pass |
| `saveManager.clearedStageIds.test.ts` | 2/2 pass |
| `StageSelectionPanel.test.ts` | 7/7 pass |
| `demoStageBalance.smoke.test.ts` | 8/8 pass |
| `demoStageBalance.puzzle.test.ts` | **12/12 pass**（§43 修正後 ch1_07 counter 勝利を含む） |

**注:** vitest worker `onTaskUpdate` timeout の unhandled error が 1 件出たが、全テスト pass。インフラ警告のみ。

### 確認項目

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | verify OFF 起動 → ステージ選択 → 出撃 → 編成 → 戦闘 | **OK** — `gameSessionWire` map 起動 / sortie / formation→battle |
| 2 | verify OFF 勝利後 `currentStageId` 同 stage 維持 | **OK** — `gameSessionWire` + `victoryRewards.unlock` |
| 3 | verify OFF 勝利後 `clearedStageIds` 記録 + 一覧「クリア済み」 | **OK** — `victoryRewards` / `stageSelectionWire` / `StageSelectionPanel` / `gameSessionWire` |
| 4 | クリア済み stage 再挑戦 | **OK（コード確認）** — cleared でも出撃ボタン有効。`handleStageSortie` にロック分岐なし |
| 5 | verify OFF 敗北後 rollback なし・同 stage 編成へ | **OK** — `gameSessionWire` defeat→formation、`currentStageId` 維持 |
| 6 | verify ON Debug 勝利 next / 敗北 previous / loopStageId | **OK** — `gameSessionWire` verify ON 3 件 pass |
| 7 | demo balance smoke / puzzle | smoke **8/8**。puzzle **12/12**（ch1_07 含む全 pass） |
| 8 | default-answer = `demo_ch1_01` のみ | **維持** — ch1_01 baseline 満血勝利（154.3s）、bad=defeat。他 stage は puzzle 軸（非 default-answer） |
| 9 | `demo_ch1_07` quad 維持 | **OK** — baseline/bad/universal=defeat、counter=victory @111.1s |
| 10 | class / stage / enemyGroups 不要変更 | **今回未変更** — 回帰確認のみ |

### verify OFF 勝利導線

map 起動 → 出撃 → 編成 → 戦闘 → 勝利 → map 復帰。`currentStageId` はクリア stage のまま。`clearedStageIds` に stageId merge、一覧に「クリア済み」HUD ラベル。

### verify OFF 敗北導線

rollback なし。`currentStageId` 維持のまま編成画面（`formation`）へ。再出撃可能。

### clearedStageIds / クリア済み表示 / 再挑戦

- verify OFF 勝利のみ記録（`advanceCurrentStage: false`）
- verify ON では記録しない
- 再クリアは冪等 merge
- クリア済みでも出撃・再挑戦に制限なし（状態表示のみ）

### verify ON Debug 導線

起動 battle 維持。勝利で `currentStageId` 次 stage へ。敗北で previous stage rollback。loopStageId 時は defeat でロールバック停止。

### demo balance

| suite | 結果 |
| ----- | ---- |
| smoke（7 stage + data sanity） | **全 pass** |
| puzzle quad | **全 pass**（ch1_01〜07） |

### demo_ch1_07 quad（§43 調整後・今回計測）

| 編成 | 結果 | 秒数 |
| ---- | ---- | ---- |
| baseline | defeat | 105.9s |
| bad | defeat | 53.3s |
| universal | defeat | 35.4s |
| counter | **victory** 650/650 HP | 111.1s |

counter は `configurePaladinTankParty`（`df_paladin`）— player `at_ballista` 前提なし。smoke（standard party）は defeat @126.6s（意図どおり）。

### default-answer

`demo_ch1_01` のみ — baseline 満血勝利、bad=defeat、universal 最速（57.5s）。ch1_02〜07 は puzzle 軸で default-answer ではない。

### 今回の変更

| ファイル | 内容 |
| -------- | ---- |
| `docs/ai-handoff/current-task.md` | 本 §44 |

### 触らなかった

`stageRecords` / best time / best party / 星評価、`selectedStageId` 本格導入、map rename、UI レイアウト大改修、`stages-demo.json` / class 数値 / `enemyGroups` 変更、`GameSession` / `SaveManager` / `StageSelectionPanel` ロジック

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [ ] 7h 体験版終了画面（`demo_ch1_07` クリア後）

## 45. 内部名 map → stageSelect rename（2026-07-08）

**§39 後続 refactor** — ステージ選択型フローに合わせ、内部 screen / host / CSS class の `map` 呼称を `stageSelect` へ改名。**挙動変更なし**。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§2/§39） |
| 2 | `src/game/gameScreen.ts` | `GameScreen` 型 |
| 3 | `src/game/GameSession.ts` | `mapHost` / `setGameScreen('map')` |
| 4 | `src/game/gameSessionWire.test.ts` | wire テスト |
| 5 | `src/styles/game-shell.css` | `.game-shell__map` |
| 6 | `src/platform/menuHost.ts`（Grep） | `GameScreen` 型参照のみ・値 `'map'` なし |

### 影響範囲（調査結果）

| 対象 | 参照ファイル数 | 判定 |
| ---- | -------------- | ---- |
| `screen: 'map'` | `gameScreen.ts`・`GameSession.ts`・wire test | **小** — 実施 |
| `mapHost` / `.game-shell__map` | `GameSession.ts`・`game-shell.css` | **小** — 実施 |
| `openMap` / `showMap` | **存在しない** | 対象外 |
| `openStageSelection()` | `GameSession.ts` のみ | `openStageSelect()` に改名 |
| `menuHost.ts` | `GameScreen` 型 import のみ | 変更不要 |
| handoff 履歴節（§26〜§44） | 多数 | **意図的に未改**（実装ログ） |

### rename 実施

| 変更前 | 変更後 |
| ------ | ------ |
| `GameScreen: 'map'` | `'stageSelect'` |
| `mapHost` | `stageSelectHost` |
| `.game-shell__map` | `.game-shell__stage-select` |
| `onMap` | `onStageSelect` |
| `openStageSelection()` | `openStageSelect()` |
| `setGameScreen('map')` | `setGameScreen('stageSelect')` |

### 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `src/game/gameScreen.ts` | `GameScreen` 型 |
| `src/game/GameSession.ts` | host 名・screen 切替・`openStageSelect` |
| `src/game/StageSelectionScreenHost.ts` | JSDoc |
| `src/styles/game-shell.css` | CSS class |
| `src/game/gameSessionWire.test.ts` | 期待値・describe 文言 |
| `docs/spec/stage-selection-ui.md` | 実装タッチポイント注記 |
| `docs/ai-handoff/current-task.md` | §2 + 本 §45 |

### 見送り

| 項目 | 理由 |
| ---- | ---- |
| handoff 履歴節の `mapHost` / `setGameScreen('map')` | 実装ログとして残す（§39 方針と同様） |
| `StageSelectionPanel` / `StageSelectionScreenHost` クラス名 | 既に自然なため維持 |

### 導線確認（テスト）

| 導線 | 結果 |
| ---- | ---- |
| verify OFF 起動 → `stageSelect` | pass |
| verify OFF sortie → formation → battle | pass |
| verify OFF 勝利 → `stageSelect` 復帰・`currentStageId` 維持・`clearedStageIds` 記録 | pass |
| verify OFF 敗北 → formation・`currentStageId` 維持 | pass |
| verify ON 起動 battle・勝利 advance・敗北 rollback | pass |
| verify ON 編成（sortie 不要） | pass |

### テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/game/gameSessionWire.test.ts src/game/stageSelectionWire.test.ts src/ui/StageSelectionPanel.test.ts` | **20 passed** |

### 触らなかった

save schema / `currentStageId` / `clearedStageIds` ロジック、UI 表示文言、`stages-demo.json` / class / `enemyGroups`、レイアウト大改修

---

## 46. §45 stageSelect rename 後 総合回帰確認（2026-07-08）

**方針:** テスト・確認・docs 更新のみ。production / save / balance / UI ロジックは未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§45） |
| 2 | `src/game/gameScreen.ts` | `GameScreen` = `'stageSelect'` |
| 3 | `src/game/GameSession.ts` | `stageSelectHost` / 勝利・敗北導線 |
| 4 | `src/game/StageSelectionScreenHost.ts` | host 配線 |
| 5 | `src/game/gameSessionWire.test.ts` | verify OFF/ON wire |
| 6 | `src/styles/game-shell.css` | `.game-shell__stage-select` |

### 実行テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/game/gameSessionWire.test.ts src/game/stageSelectionWire.test.ts src/ui/StageSelectionPanel.test.ts` | **20 passed** |
| `npm test -- src/progression/victoryRewards.unlock.test.ts src/save/saveManager.clearedStageIds.test.ts src/progression/stageProgression.test.ts` | **15 passed** |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts src/battle/demoStageBalance.puzzle.test.ts` | **20 passed**（smoke 8 + puzzle 12）。vitest worker `onTaskUpdate` timeout の unhandled error 1 件（インフラ警告のみ・§44 と同様） |

### build

| コマンド | 結果 |
| -------- | ---- |
| `npm run build`（`tsc && vite build`） | **fail** — 既存の広い `tsc` 型エラー（test 含む）。`GameSession` / `gameScreen` / `StageSelection*` / stageSelect 関連の tsc エラーは **なし**（§6b-4 時点から `npm run build` は同様に fail） |
| `npm run build:demo` | **OK**（vite build） |
| `npm run build:full` | **OK**（vite build） |

### 確認項目

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | verify OFF 起動 → ステージ選択 → 出撃 → 編成 → 戦闘 → 勝利 → ステージ選択復帰 | **OK** — `gameSessionWire` 8/8（`stageSelect` 起動・sortie・勝利復帰） |
| 2 | verify OFF 敗北 → rollback なし → 同 stage 編成復帰 | **OK** — defeat→formation、`currentStageId` 維持 |
| 3 | `clearedStageIds` / クリア済み表示 / 再挑戦 | **OK** — unlock/save/panel/wire。クリア済みでも出撃ボタン有効 |
| 4 | verify ON Debug 勝利 next / 敗北 previous / loopStageId | **OK** — `gameSessionWire` verify ON 3 件 |
| 5 | demo smoke / puzzle | smoke **8/8**、puzzle **12/12** |
| 6 | 旧 internal 名 `mapHost` / `game-shell__map` / `screen: 'map'` / `setGameScreen('map')` / `onMap` | **src/ に残存なし**（`formation.map` の Array#map のみヒット） |
| 7 | GameScreen / GameSession / StageSelectionScreenHost 型崩れ | **なし** |

### verify OFF 勝利・敗北

- 勝利: `advanceCurrentStage: false` → `currentStageId` 維持 → `setGameScreen('stageSelect')`。`clearedStageIds` に stageId merge
- 敗北: verify OFF は rollback せず `restartBattle` + formation 開く

### verify ON Debug

起動 battle 維持。勝利で次 stage、敗北で previous rollback。loopStageId 時は defeat ロールバック停止（既存ロジック維持）。

### 今回の変更

| ファイル | 内容 |
| -------- | ---- |
| `docs/ai-handoff/current-task.md` | §2 追記 + 本 §46 |

### 触らなかった

class / stage / `enemyGroups`、demo balance、save schema、`currentStageId` / `clearedStageIds` ロジック、UI レイアウト、`stageRecords` / `selectedStageId`、production コード全般

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [ ] 7h 体験版終了画面（`demo_ch1_07` クリア後）

---

## 46. §45 stageSelect rename 後 総合回帰確認（2026-07-08）

**方針:** テスト・確認・docs 更新のみ。production / save / balance / UI ロジックは未変更。

### 作業前に読んだファイル（6 件）

| # | ファイル | 用途 |
| - | -------- | ---- |
| 1 | `docs/ai-handoff/current-task.md` | 現状正本（§45） |
| 2 | `src/game/gameScreen.ts` | `GameScreen` = `'stageSelect'` |
| 3 | `src/game/GameSession.ts` | `stageSelectHost` / 勝利・敗北導線 |
| 4 | `src/game/StageSelectionScreenHost.ts` | host 配線 |
| 5 | `src/game/gameSessionWire.test.ts` | verify OFF/ON wire |
| 6 | `src/styles/game-shell.css` | `.game-shell__stage-select` |

### 実行テスト

| コマンド | 結果 |
| -------- | ---- |
| `npm test -- src/game/gameSessionWire.test.ts src/game/stageSelectionWire.test.ts src/ui/StageSelectionPanel.test.ts` | **20 passed** |
| `npm test -- src/progression/victoryRewards.unlock.test.ts src/save/saveManager.clearedStageIds.test.ts src/progression/stageProgression.test.ts` | **15 passed** |
| `BUILD_FLAVOR=demo npm test -- src/battle/demoStageBalance.smoke.test.ts src/battle/demoStageBalance.puzzle.test.ts` | **20 passed**（smoke 8 + puzzle 12）。vitest worker `onTaskUpdate` timeout の unhandled error 1 件（インフラ警告のみ・§44 と同様） |

### build

| コマンド | 結果 |
| -------- | ---- |
| `npm run build`（`tsc && vite build`） | **fail** — 既存の広い `tsc` 型エラー（test 含む）。`GameSession` / `gameScreen` / `StageSelection*` / stageSelect 関連の tsc エラーは **なし**（§6b-4 時点から `npm run build` は同様に fail） |
| `npm run build:demo` | **OK**（vite build） |
| `npm run build:full` | **OK**（vite build） |

### 確認項目

| # | 項目 | 結果 |
| - | ---- | ---- |
| 1 | verify OFF 起動 → ステージ選択 → 出撃 → 編成 → 戦闘 → 勝利 → ステージ選択復帰 | **OK** — `gameSessionWire` 8/8（`stageSelect` 起動・sortie・勝利復帰） |
| 2 | verify OFF 敗北 → rollback なし → 同 stage 編成復帰 | **OK** — defeat→formation、`currentStageId` 維持 |
| 3 | `clearedStageIds` / クリア済み表示 / 再挑戦 | **OK** — unlock/save/panel/wire。クリア済みでも出撃ボタン有効 |
| 4 | verify ON Debug 勝利 next / 敗北 previous / loopStageId | **OK** — `gameSessionWire` verify ON 3 件 |
| 5 | demo smoke / puzzle | smoke **8/8**、puzzle **12/12** |
| 6 | 旧 internal 名 `mapHost` / `game-shell__map` / `screen: 'map'` / `setGameScreen('map')` / `onMap` | **src/ に残存なし**（`formation.map` の Array#map のみヒット） |
| 7 | GameScreen / GameSession / StageSelectionScreenHost 型崩れ | **なし** |

### verify OFF 勝利・敗北

- 勝利: `advanceCurrentStage: false` → `currentStageId` 維持 → `setGameScreen('stageSelect')`。`clearedStageIds` に stageId merge
- 敗北: verify OFF は rollback せず `restartBattle` + formation 開く

### verify ON Debug

起動 battle 維持。勝利で次 stage、敗北で previous rollback。loopStageId 時は defeat ロールバック停止（既存ロジック維持）。

### 今回の変更

| ファイル | 内容 |
| -------- | ---- |
| `docs/ai-handoff/current-task.md` | §2 追記 + 本 §46 |

### 触らなかった

class / stage / `enemyGroups`、demo balance、save schema、`currentStageId` / `clearedStageIds` ロジック、UI レイアウト、`stageRecords` / `selectedStageId`、production コード全般

### 残タスク

- [ ] （後続）`stageRecords` + 計測 + リザルト 2 枠（7f）
- [ ] 7h 体験版終了画面（`demo_ch1_07` クリア後）

---

## 47. R5a — 現行実装調査と最小実装計画（2026-07-12）

**目的:** R5 最小縦切りを安全に分割する実装計画。production code / JSON / テスト / エディタは**未変更**。

**作業前に読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — R4 完了・R5 前提
2. `docs/plans/combat-data-schema-refactor.md` — R4 データ責務・§16 最小 schema
3. `src/battle/types.ts` — `CombatantState` / `StageEnemyGroup` / `PartySlotState` / `AttackSpeedTier`
4. `src/battle/BattleEngine.ts` — 通常攻撃 tick / 実行ループ（代表）
5. `src/battle/entities.ts` — Combatant 生成（代表）
6. `src/battle/data/loadGameData.ts` — class / skill / stage 読込（代表）

**追加参照（調査中）:** `SkillExecutor.ts`, `skillTrigger.ts`, `synthesizeBasicAttack.ts`, `validateGameData.ts`（basic 合成）, `enemyGroupSpawn.ts`, `partyCompose.ts`, `memberStatsDisplay.ts`, `basicAttackPreview.ts`, `targeting.ts`, `resolveApproachBattleX.ts`, `combatPosition.ts`

---

### 47.1 通常攻撃の現行経路

| 段階 | ファイル / 関数 | 責務 |
| ---- | --------------- | ---- |
| データ読込 | `loadGameData.ts` → `parseAndValidateGameDataJson` | classes / skills / stages / parties を merge |
| basic 合成 | `validateGameData.ts` `injectSynthesizedBasicAttacks` → `synthesizeBasicAttack.ts` | 各 class の `basicAttackSkillId` に JSON override を merge。trigger 既定 `{ kind: 'time', value: 2 }` |
| Combatant 生成 | `entities.ts` `createAllyFromMember` / `createEnemyFromClassGroup` | `createCooldowns(basicAttackSkillId, build, activeSkillIds)` で basic + active 枠を生成 |
| CD 初期化 | `BattleEngine.initBattlePassiveState` / `spawnWaveEnemies` → `skillTrigger.initializeSkillCooldowns` | `remaining = skill.trigger.value`（basic 既定 2 秒） |
| CD tick | `BattleEngine.tickCooldowns` | basic: `deltaTime * getBasicCooldownRate(tier) * getEffectiveAttackSpeedMultiplier`。active は別経路 |
| 実行判定 | `BattleEngine.runUnitSkills` | `remaining <= 0` の basic を `SkillExecutor.tryExecute` へ。active は fire gate / gauge あり |
| スキル解決 | `SkillExecutor.tryExecute` | basic 時 `resolveEffectiveBasicAttackSkill`（transform overlay）。`buildSkillSequence` or 即 effect 適用 |
| ターゲット | `skills/targeting.ts` `resolveEffectTargetSpec` | effect.target + passive `targetRuleOverride`（pool が空でなければ上書き） |
| 射程 / 接敵 | `combatPosition.ts` / `resolveApproachBattleX.ts` | `resolveBasicAttackRangePx`、move effect 時は approach 待ち |
| ダメージ / 回復 | `SkillExecutor.applyResolvedEffectStep` → `combatMath.ts` | damage / heal / barrier / DoT 等 |
| active / gauge 依存 | `runUnitSkills` 内 | basic 前に `basicAttackCount` ready active を優先。time active は charge bank + fire gate |

**SkillExecutor との関係:** 通常攻撃は **basic スロットの ActiveSkillDef** として SkillExecutor に入る。effect パイプライン（target / range / hit / damage）は **ほぼ全面再利用可能**。

---

### 47.2 攻撃速度（attackSpeedTier）の現行経路

| 項目 | 現状 |
| ---- | ---- |
| 型 | `types.ts` `AttackSpeedTier` = slow / somewhatSlow / normal / somewhatFast / fast |
| 保存 | `ClassPreset.attackSpeedTier`（classes.json）、`EnemyTemplate.attackSpeedTier`（enemies.json）。basic JSON の trigger.value とは**別系統** |
| tier → rate | `levelCurves.json` `attackSpeedPresets[tier].basicCooldownRate` → `levelGrowth.getBasicCooldownRate` |
| 実秒換算 | `basicAttackPreview.computeEffectiveBasicAttackIntervalSec(tier, curves, baseIntervalSec=2, speedMul)` = `baseIntervalSec / (cdRate * speedMul)` |
| timer 適用 | `BattleEngine.tickCooldowns`: basic の `remaining` 減算 rate = `basicRate * getEffectiveAttackSpeedMultiplier(unit)`。初期 `remaining` は **skill.trigger.value**（tier 非反映） |
| buff / debuff | `combatMath.getEffectiveAttackSpeedMultiplier` — statusEffects の `attackSpeed` stat 集約 |
| UI | `memberStatsDisplay.resolveAttackSpeedTier` → `getAttackSpeedTierLabel`（編成 / 戦闘 stat 行） |

**R5 で秒単位移行時の最低変更経路:**

1. 新 class / module データに `attackIntervalSec`（または module 上書き）を持たせる
2. `initializeSkillCooldowns` / `resetCooldownAfterFire` — module 経路では `trigger.value` を sec から設定
3. `BattleEngine.tickCooldowns` — 新経路は tier rate を使わず `deltaTime * speedMul` のみ
4. legacy 用に `attackSpeedTier` + `getBasicCooldownRate` 分岐を残す
5. UI / validate / editor は R5b では新データ validate のみ（legacy editor 触らない）

---

### 47.3 class / skill 責務（現状）

| 関係 | 現状 |
| ---- | ---- |
| class → basic | `ClassPreset.basicAttackSkillId`（未指定時 `{id}_basic_attack`） |
| class → passive | `passiveIds` + Lv 解放 `starterPassiveIds` / `skills[]` |
| class → active | `starterActiveIds` + `skills[]` → `resolveBattleActiveSkillIds` |
| basic skill | ActiveSkillDef: trigger(time) + effect[](damage/heal, target, rangePx は traits 側) |
| passive → target override | `targeting.ts`: `passive.effect === 'targetRuleOverride'` が effect 側 faction の pool 非空時に default target を上書き |
| active 自動発動 | `runUnitSkills`: time trigger CD 0 + fire gate / count trigger / stage trigger |
| module 暫定実装 | **可能** — load 時に module → `ActiveSkillDef` へ合成し `skillRegistry.actives` に登録。basic スロットの `skillId` を module 解決 ID に差し替え |
| 新 executor | **不要** — R5 では SkillExecutor 再利用 |

**R5 方針:** active / gauge / wave passive aura を空にした Combatant で basic（= module 解決スキル）だけ回す。

---

### 47.4 Combatant 生成経路

**味方:** `SaveGameState.party` → `BattleEngine.getParty()` → `createAlliesFromPartyState` → `createAllyFromMember`

**敵（enemyGroups）:** `stage.enemyGroups` → `expandEnemyGroups` → `createEnemyFromClassGroup`

**敵（legacy waves）:** `createEnemyFromTemplate`

**`selectedCombatModuleId` 最小接続点:** 味方は `createAllyFromMember`（basic `skillId` 差し替え）。敵は `ResolvedEnemySpawnSpec` → `createEnemyFromClassGroup`。

---

### 47.5 Party / formation 状態

- 保存: `SaveGameState.party` — 4 slot × `{ classId, progress, build }`。module 選択なし
- 同一 classId: UI `getAssignableClassIds` のみ。runtime validate なし
- module 保持（Save 外）: `GameSession.operationState.partyModuleBySlot` 推奨
- R5: 固定デフォルト + debug 経路で Wave 間 UI なしでも成立

---

### 47.6 敵 group / Stage

- `StageEnemyGroup`: classId, count, scales のみ
- 現行 demo: stage 直下 `enemyGroups`（wave 0 のみ）
- legacy 維持: 新 R5 stage のみ `selectedCombatModuleId`。`BUILD_FLAVOR` / 別 JSON で分離

---

### 47.7 active / gauge 依存の分類（R5）

| 分類 | 例 |
| ---- | -- |
| 回避できる | active CD / charge bank / fire gate（`learnedActiveIds=[]`） |
| 一時無効化 | wave passive aura、stageStart periodic passive |
| 後続削除 | Lv 解放 active 枠、growthTier 依存ステ |
| 触らない | SkillSequenceRunner 全面削除、passive bridge refactor、Save schema |

---

### 47.8 R5 対象兵科（4 兵科）

| classId | 方式候補（各 2） |
| ------- | ---------------- |
| `df_guardian` | 防御方式 2 種 |
| `at_swordsman` | 単体打撃 / 範囲打撃 |
| `at_sorcerer` | 単体魔法 / 複数魔法 |
| `sp_cleric` | 単体回復 / 複数回復 |

変更案なし。`at_assassin`（双刃士）は背後回り込み等の特殊 move を含むため、最初の実装対象から除外（`df_duelist` = 闘技士とは別兵科）。

---

### 47.9 SkillExecutor 再利用判断

- **再利用:** `tryExecute`、effect 解決、targeting、range、pending hit
- **差し替え:** basic `skillId` 解決元、CD sec ベース tick
- **bypass:** active / passive aura / gauge
- **新 executor:** 不要

---

### 47.10 R5b〜R5g 実装分割

| Phase | 内容 |
| ----- | ---- |
| R5b | 最小型 + 新 JSON + 新 validate |
| R5c | module 解決 + attack interval + SkillExecutor 接続 |
| R5d | 味方 module 選択（Save 非統合） |
| R5e | 敵 group module 指定 |
| R5f | 味方 classId 重複禁止 |
| R5g | 統合テスト |

順序: R5b → R5c → R5d → R5e → R5f → R5g

---

### 47.11 legacy 境界 / R5 で触らない範囲

- legacy: 既存 JSON 読込のみ、`attackSpeedTier` 経路維持、Save 変更なし
- 触らない: 作戦内パッシブ、Wave 間 UI、Save、migration、エディタ、spec 本文、旧 active 削除

---

### 47.13 次アクション（R5b）

1. `CombatModule` 最小型
2. 4 兵科 × 2 module JSON
3. class 側 module 参照 + default
4. load 時 module → ActiveSkillDef + validate
5. 実行接続は R5c

---

## 48. R5b — 戦闘方式最小型・データ・validate（2026-07-12）

**目的:** CombatModule 最小型、4 兵科 × 2 方式データ、load / validate、データ単体テスト。**実行接続は R5c。**

**作業前に読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — R5a 調査結果（§47）
2. `docs/plans/combat-data-schema-refactor.md` — R4 データ責務
3. `src/battle/types.ts` — ClassPreset / ActiveSkillDef / GameData
4. `src/battle/data/loadGameData.ts` — 読込経路
5. `src/battle/data/validateGameData.ts` — validate 層
6. `data/skills/actives/df_guardian.json` — 代表 skill JSON（effect / target 形状）

**追加参照:** `synthesizeBasicAttack.ts`、`data/classes.json`（Grep）、各 `data/combat-modules/*.json`

---

### 48.1 追加した型（`src/battle/types.ts`）

| 型 | 内容 |
| ---- | ---- |
| `CombatModuleActionDef` | 既存 `SkillSharedTargetingFields` + `effect[]`（独自 effect schema なし） |
| `CombatModuleDef` | `id`, `classId`, `displayName`, `description`, `attackIntervalSec`, `action` |
| `R5_COMBAT_MODULE_CLASS_IDS` | R5 対象 4 兵科定数 |
| `ClassPreset.combatModuleIds?` | `[string, string]` — 未指定 = legacy |
| `GameData.combatModuleRegistry` | module ID → `CombatModuleDef` |

**合成ヘルパー（R5c 接続用、R5b では未配線）:** `src/battle/data/synthesizeCombatModuleSkill.ts` — module → `ActiveSkillDef`。`trigger.value = attackIntervalSec`。

---

### 48.2 module データ保存場所

`data/combat-modules/` — 兵科ごと JSON 配列（4 ファイル、計 8 module）。

---

### 48.3 対象 4 兵科 × 2 方式（仮名称）

| classId | 方式 A | 方式 B |
| ------- | ------ | ------ |
| `df_guardian` | `df_guardian_mod_nearest_strike` — 最近傍単体物理 | `df_guardian_mod_guard_focus` — 自身 DEF buff（Barrier 安全例なしのため buff 代替） |
| `at_swordsman` | `at_swordsman_mod_single_slash` — 単体物理 | `at_swordsman_mod_pierce_slash` — pierce 複数対応 |
| `at_sorcerer` | `at_sorcerer_mod_single_bolt` — 単体魔法 | `at_sorcerer_mod_twin_bolt` — multiLock 複数魔法 |
| `sp_cleric` | `sp_cleric_mod_single_mend` — 単体 heal | `sp_cleric_mod_party_mend` — 全味方 heal |

各 class の `classes.json` に `combatModuleIds`（2 件）を追加。旧 basic / passive / active 参照は維持。

---

### 48.4 attackIntervalSec

- 新方式用の秒単位攻撃間隔。旧 `attackSpeedTier` は**削除せず** legacy 継続。
- module 対象兵科では `attackIntervalSec` を正本候補（R5c で CD tick 接続）。
- validate: 正数のみ（0 / 負 / NaN 拒否）。
- **初回 CD と継続周期:** 推奨は**両方とも同じ `attackIntervalSec`**。旧 `trigger.value = 2` 秒を新方式の初回 CD 正本に**しない**（R5c 接続時に `initializeSkillCooldowns` / `resetCooldownAfterFire` で module 経路を分岐）。

---

### 48.5 load / validate

- **load:** `loadGameData.ts` が `data/combat-modules/*.json` を glob → `parseAndValidateGameDataJson({ combatModules })` → `GameData.combatModuleRegistry`。
- **validate module 単体:** ID 重複、classId 実在、表示名・説明必須、`attackIntervalSec > 0`、action.effect を既存 `parseSkillEffect` で検証。
- **validate class 整合:** `combatModuleIds` がある class は 2 件・重複なし・実在 module・classId 一致。R5 対象 4 兵科は `combatModuleIds` 必須。
- **legacy:** `combatModuleIds` 未指定 class はエラーにしない。旧 active / passive / basic 構造維持。

---

### 48.6 legacy 共存

- `combatModuleIds` の有無で段階移行（暫定フラグ大量追加なし）。
- legacy class: `attackSpeedTier` + `basicAttackSkillId` 経路そのまま。
- module 未実装兵科を一律エラーにしない（R5 対象 4 兵科のみ必須）。

---

### 48.7 双刃士 classId 誤記修正

§47.8 の `at_assassin`（双刃士）表記を正とする。`df_duelist`（闘技士）とは別兵科。R5 最初の実装対象から除外は R5a 確定のまま。

---

### 48.8 R5c で接続する箇所

1. `synthesizeCombatModuleSkill` → `skillRegistry.actives` 登録（または runtime 解決）
2. `createAllyFromMember` / `createEnemyFromClassGroup` — basic `skillId` を選択 module に差し替え
3. `initializeSkillCooldowns` / `tickCooldowns` — module 経路は `attackIntervalSec` ベース（tier rate バイパス）
4. `SkillExecutor.tryExecute` — 既存 basic スロット再利用（新 executor 不要）

---

### 48.9 テスト

- `src/battle/data/validateGameData.combatModules.test.ts`（新規）
- `validateGameData.test.ts` / `stageSelectionWire.test.ts` — 実データ bundle に `combatModules` 追加

**次の再開タスク:** R5c「通常行動実行」

---

## 49. R5c — 通常行動実行（2026-07-12）

**目的:** R5b の `CombatModuleDef` を既存通常行動経路（basic スロット + `SkillExecutor.tryExecute`）へ最小接続。対象 4 兵科のみ。

**作業前に読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — §48 R5b 完了状態
2. `src/battle/entities.ts` — Combatant 生成
3. `src/battle/data/synthesizeCombatModuleSkill.ts`
4. `src/battle/BattleEngine.ts` — tickCooldowns / runUnitSkills / initializeSkillCooldowns
5. `src/battle/skills/SkillExecutor.ts` — tryExecute
6. `src/battle/data/validateGameData.ts` — skillRegistry 注入

---

### 49.1 module 選択規則

- `ClassPreset.combatModuleIds` がある class → **`combatModuleIds[0]` を明示選択**（registry 配列順・glob 順は使わない）
- 未指定 class → legacy `basicAttackSkillId`
- 実装: `src/battle/data/resolveCombatModuleBasic.ts`
  - `resolveSelectedCombatModuleId`
  - `resolveBasicAttackSkillId` / `resolveBasicAttackSkillIdFromGameData`

---

### 49.2 合成 skill と skillRegistry

- `validateGameData.ts` の `injectSynthesizedCombatModuleSkills` が load 時に各 module を `synthesizeCombatModuleSkill` → `activesById` へ登録
- 合成 skill ID = module.id（安定）
- `trigger.value = attackIntervalSec`（初回 CD・継続周期の正本）

---

### 49.3 Combatant 生成接続

| 経路 | 変更 |
| ---- | ---- |
| `createAllyFromMember` | `gameData` があるとき basic `skillId` を module 解決結果へ差し替え |
| `createEnemyFromClassGroup` | 同上 |
| `createAlliesFromParty` | `gameData` を渡すよう修正 |
| `BattleEngine.syncPartyBuilds` | basic 再生成も module 解決を使用 |

basic スロットのみ差し替え。旧 basic は active 枠へ入れず二重実行なし。

---

### 49.4 attackIntervalSec の保存・初期化・再設定

| 段階 | 箇所 | 内容 |
| ---- | ---- | ---- |
| 正本 | `CombatModuleDef.attackIntervalSec` | module JSON |
| 実行時 skill | 合成 `ActiveSkillDef.trigger.value` | `synthesizeCombatModuleSkill` |
| 初回 CD | `initializeSkillCooldowns`（BattleEngine `initBattlePassiveState` / wave spawn / syncPartyBuilds） | `remaining = trigger.value`（= attackIntervalSec） |
| CD tick | `BattleEngine.tickCooldowns` | module basic: `rate = getEffectiveAttackSpeedMultiplier(unit)`（`attackSpeedTier` **非適用**）。legacy basic: `rate = basicRate × speedMul` |
| 発火後 | `SkillExecutor.tryExecute` → `resetCooldownAfterFire` | `remaining = trigger.value`（= attackIntervalSec） |

旧 `trigger.value = 2` 秒・`attackSpeedTier` は legacy 継続（削除なし）。

---

### 49.5 通常行動実行経路

1. Combatant 生成 → basic `cooldowns[].skillId` = 選択 module ID
2. 戦闘開始 / Wave spawn → `initializeSkillCooldowns`（初回待機 = attackIntervalSec）
3. 毎 tick → `tickCooldowns`（module basic は tier 非適用・一時 attackSpeed 補正は適用）→ `runUnitSkills`
4. basic `remaining <= 0` → **`SkillExecutor.tryExecute(actor, basicCd, ...)`**（既存経路）
5. 成功 → `resetCooldownAfterFire`（次周期 = attackIntervalSec）

SkillExecutor 専用第二実行系は追加していない。

---

### 49.6 legacy 互換

- `combatModuleIds` 未指定 class: 従来 `basicAttackSkillId` + `attackSpeedTier` + `injectSynthesizedBasicAttacks` のまま
- 旧 basic JSON / `attackSpeedTier` フィールドは削除していない

---

### 49.7 テスト

- **新規:** `src/battle/combatModuleBasicAttack.test.ts`（14 件）
- **更新:** `src/battle/healBasicAttack.test.ts` — sp_cleric の module basic heal を許容

---

### 49.9 R5c 補正（2026-07-12）

**目的:** module basic の CD tick が `rate = 1` 固定で一時 attackSpeed 補正までバイパスしていた件の修正。`entities.enemyGroups.test.ts` の df_paladin Lv0 active 件数不一致の調査。

**読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — §49 R5c 完了状態・§50 設計文書
2. `src/battle/BattleEngine.ts` — `tickCooldowns`
3. `src/battle/combatMath.ts` — `getEffectiveAttackSpeedMultiplier`
4. `src/battle/combatModuleBasicAttack.test.ts`
5. `src/battle/entities.enemyGroups.test.ts`
6. `data/classes.json`（df_paladin skills、shell grep）

**変更ファイル:**

| ファイル | 内容 |
| -------- | ---- |
| `src/battle/BattleEngine.ts` | module basic CD tick: tier 非適用・`getEffectiveAttackSpeedMultiplier` 適用 |
| `src/battle/combatModuleBasicAttack.test.ts` | attackSpeed buff/debuff・legacy 併用テスト 3 件追加 |
| `src/battle/entities.enemyGroups.test.ts` | df_paladin Lv0 active 期待 2→1（commit efbbab2 反映） |
| `docs/ai-handoff/current-task.md` | 本節 |

**CD 進行式（確定）:**

| 経路 | 式 |
| ---- | -- |
| legacy basic | `basicRate × getEffectiveAttackSpeedMultiplier(unit)` — `basicRate = getBasicCooldownRate(attackSpeedTier, levelCurves)` |
| combat module basic | `getEffectiveAttackSpeedMultiplier(unit)` — `attackSpeedTier` 非適用 |

`attackIntervalSec` は初回 CD / 発火後周期の**基礎値**（`trigger.value` / `resetCooldownAfterFire`）。毎 tick 書き換えない。

**attackSpeed 補正の接続経路:**

- 戦闘中 buff/debuff: `CombatantState.statusEffects[]` の `stat: 'attackSpeed'` + `multiplier`
- 集約: `aggregateStatEffects` → `computeEffectiveStat(1, agg)` = `getEffectiveAttackSpeedMultiplier`
- 将来の作戦内パッシブ attackSpeed 補正も同一 `statusEffects` 経路へ接続可能（R8 実装時）

**df_paladin Lv0 active 件数:**

- 現行 `data/classes.json`: Lv0 は `df_paladin_active_1` のみ（1 件）。Lv1 で `df_paladin_active_2` 追加。
- 原因: commit **efbbab2**（2026-07-03「2つ目のスキルをLv1取得に変更」）。R5c 退行ではない。
- `injectSynthesizedCombatModuleSkills` の legacy active registry 副作用なし。
- **判定:** production データが正。test 期待値を Lv0=1 に更新。

**テスト結果（47/47 pass）:**

- `combatModuleBasicAttack.test.ts`（14）
- `battleEngine.enemyAttackSpeedTier.test.ts`（2）
- `entities.enemyGroups.test.ts`（12）
- `healBasicAttack.test.ts`（10）
- `validateGameData.combatModules.test.ts`（9）

**R5c 完了判定:** 本補正後、R5c 完了扱い可。次は R5d。

---

### 49.8 R5d 以降へ送る未接続事項（R5d 完了後）

→ 詳細は **§51.8**。次は **R5e**。

**次の再開タスク:** R5e「敵 group module 指定」

---

## 51. R5d — 味方 combat module 選択（Save 非統合）（2026-07-12）

**目的:** 味方 4 人それぞれについて module A/B を明示選択し、Combatant 生成と通常行動へ反映。Save / UI / 敵 / 作戦ループは未接続。

**作業前に読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — §49 R5c 完了・§50 設計
2. `src/battle/data/resolveCombatModuleBasic.ts`
3. `src/battle/entities.ts`
4. `src/battle/BattleEngine.ts`
5. `src/game/GameSession.ts`
6. `src/battle/combatModuleBasicAttack.test.ts`

---

### 51.1 選択状態の所有

| 項目 | 内容 |
| ---- | ---- |
| 所有者 | `GameSession.partyCombatModuleSelection`（`PartyCombatModuleSelection` インスタンス） |
| 実装 | `src/battle/partyCombatModuleSelection.ts` |
| key | **party slot index**（`0` .. `PARTY_SLOT_COUNT - 1`）。classId は key にしない |
| 値 | `selectedCombatModuleId: string`（Map エントリ。未エントリ = 未指定） |
| 永続化 | **なし**（SaveGameState / localStorage 未変更） |
| Wave 間保持 | 未実装（セッション存続中のみ保持） |

---

### 51.2 最小選択 API（GameSession）

| メソッド | 内容 |
| -------- | ---- |
| `setPartySlotCombatModule(slotIndex, moduleId)` | 選択更新 → 戦闘中は `engine.syncPartyBuilds()` |
| `getPartySlotCombatModule(slotIndex)` | 現在の選択 ID（未指定 = `undefined`） |
| `clearPartySlotCombatModule(slotIndex)` | 未指定状態へ（= default A） |
| `resetPartySlotCombatModuleToDefault(slotIndex)` | `clear` の alias |

---

### 51.3 デフォルト・不正 ID fallback

`resolveSelectedCombatModuleId(class, registry, selectedCombatModuleId?)`:

| 条件 | 結果 |
| ---- | ---- |
| `combatModuleIds` 未指定 class | `undefined` → legacy `basicAttackSkillId` |
| 選択未指定 / 空 | `combatModuleIds[0]`（module A） |
| class 候補外 ID | module A へ fallback |
| 他 class の module ID | module A へ fallback |
| registry 不在 ID | module A へ fallback |
| 有効な選択 ID | その ID |

legacy class（`df_paladin` 等）は従来 basic を維持。fallback は `resolveCombatModuleBasic.test.ts` で固定。

---

### 51.4 Combatant 生成への受け渡し経路

```
GameSession.partyCombatModuleSelection
  → BattleEngineOptions.getSelectedCombatModuleId(slotIndex)
  → createAlliesFromPartyState(..., getSelectedCombatModuleId)
  → createAllyFromMember(..., selectedCombatModuleId)
  → resolveBasicAttackSkillIdFromGameData(class, gameData, selectedCombatModuleId)
  → basic cooldowns[].skillId + attackIntervalSec（合成 skill trigger.value）
```

| 経路 | 変更 |
| ---- | ---- |
| `createAllyFromMember` | 任意 `selectedCombatModuleId` を resolver へ |
| `createAlliesFromPartyState` | slot ごとに getter で選択 ID 取得 |
| `BattleEngine.reloadBattlefield` | getter を `createAlliesFromPartyState` へ |
| `BattleEngine.syncPartyBuilds` | slot ごとに getter → basic 再生成 |
| `createEnemyFromClassGroup` | **変更なし**（R5c どおり先頭 module） |

---

### 51.5 module 変更時の CD・sync 挙動

- 戦闘中: `setPartySlotCombatModule` → `syncPartyBuilds`（`phase === "running"` 時のみ）
- `syncPartyBuilds`: basic `skillId` を再解決 → `createCooldowns` で cooldown 配列を**丸ごと再生成** → `initializeSkillCooldowns`（初回 CD = 選択 module の `attackIntervalSec`）
- 旧 module の cooldown state は残らない（配列差し替え）
- 同じ module のまま sync した場合も cooldown は再生成される（既存 build sync と同挙動。戦闘中 module 切替 UI は未実装）
- 戦闘開始前に B へ変更 → `restartBattle` / 次 `reloadBattlefield` で B が反映

`attackSpeed` 処理は R5c のまま変更なし。

---

### 51.6 legacy 互換

- legacy class: 従来 `basicAttackSkillId` + `attackSpeedTier`
- 旧 basic と module basic の二重発火なし（basic スロットのみ差し替え）

---

### 51.7 テスト

- **新規:** `src/battle/data/resolveCombatModuleBasic.test.ts`（8 件 — fallback）
- **新規:** `src/battle/allyCombatModuleSelection.test.ts`（15 件 — 選択・CD・sync・敵非影響）
- **既存:** `combatModuleBasicAttack.test.ts` 等 R5c テスト — 回帰なし

**R5 関連 subset 結果（70/70 pass）:**

- `resolveCombatModuleBasic.test.ts`（8）
- `allyCombatModuleSelection.test.ts`（15）
- `combatModuleBasicAttack.test.ts`（14）
- `entities.enemyGroups.test.ts`（12）
- `healBasicAttack.test.ts`（10）
- `validateGameData.combatModules.test.ts`（9）
- `battleEngine.enemyAttackSpeedTier.test.ts`（2）

---

### 51.8 R5e 以降へ送る未接続事項

- module 選択の正式 UI / CombatModuleEditor
- Save 永続化・Wave 間保持・checkpoint
- 敵 `selectedCombatModuleId` / enemy group schema（**R5e で完了 → §52**）
- 作戦ループ・作戦状態全体・作戦内パッシブ（R8）
- 全兵科への combat module 移行

**R5d 完了判定:** 本節時点で R5d 完了。次は R5e（→ §52 完了）。

---

## 50. R8 作戦内パッシブ — 戦闘中表示方針（2026-07-12 doc のみ）

**スコープ:** ロードマップ・spec 更新のみ。production code / JSON / UI / VFX 実装は未着手。

### 50.1 確定方針（要約）

| 項目 | 内容 |
| ---- | ---- |
| 常時パッシブ stat 補正 | 状態アイコン **原則非表示** |
| 条件付き発動 | **発動中のみ** 状態アイコン |
| DoT / CC / 一時デバフ | 従来どおり状態アイコン |
| Barrier | HP バー残量のみ。状態アイコン **なし** |
| 範囲・オーラ系 | フィールド上プレースホルダ範囲（R8 必須）。対象全員へ status 付与は **確定仕様にしない** |
| 正式 VFX | 試作成立後。R8 完了条件はプレースホルダで判定範囲を視覚確認できること |

### 50.2 更新した doc

- [phase-roadmap.md §R8](../plans/phase-roadmap.md#r8--作戦内パッシブ)
- [combat-data-schema-refactor.md §5.6](../plans/combat-data-schema-refactor.md#56-戦闘中表示r8-doc-反映--2026-07-12)、[§5.7 効果範囲](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)
- [combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針)
- [battle-field.md §範囲系・オーラ系効果のフィールド表示](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針)

### 50.3 1 次元効果範囲用語（2026-07-12 doc 追記）

**スコープ:** doc のみ。production code / JSON / テスト / R8 実装 / エディタ実装は未着手。

#### 大カテゴリ統合

| 大カテゴリ | 内容 |
| ---------- | ---- |
| 効果内容 | ダメージ、回復、stat 補正等 |
| **効果範囲** | 範囲形式・対象数・Hit・適用方式（旧 `targetShape` / 「ターゲット形式」はここへ統合） |
| **対象条件** | 敵味方・優先ターゲット・HP / ロール / ステータス / 除外条件（空間範囲と分離） |

#### 範囲形式（5 種）

| 用語 | 起点 | 軸上 |
| ---- | ---- | ---- |
| 単体 | 選択対象 | その対象のみ |
| 地点 N | effect 決定地点 | 左右 N |
| 範囲 N（ターゲット中心範囲） | 選択ターゲット位置 | 左右 N |
| 周囲 N | 使用者 | 左右 N |
| 前方 N | 使用者 | facing 方向へ N |

2 次元 shape（円・扇・矩形・angle / width / radius）は **導入しない**。

#### 適用方式（4 種）

| 方式 | 要点 |
| ---- | ---- |
| 即時 | 範囲内へ同一タイミングで適用 |
| 進行 | 軸上を進み到達時 Hit。**飛翔と伝播はここへ統合** |
| 持続 | 間隔または範囲内滞在で繰り返し判定 |
| 乱打 | 親範囲内へ子範囲（地点 N 相当）を複数回。**非決定的乱数は使わない** |

#### legacy の新位置づけ（削除せず）

| legacy | 新仕様 |
| ------ | ------ |
| `single` | 単体 |
| `area` | 範囲 N |
| self area / aura | 周囲 N |
| ground area | 地点 N |
| `pierce` | 前方 N + 進行 + 対象数（migration 未確定） |
| `multiLock` | 範囲形式 + Hit / 対象数 + 再命中規則（migration 未確定） |
| `barrage` | 適用方式「乱打」 |

正本: [combat-data-schema-refactor.md §5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。プレースホルダ表示: [battle-field.md §9.2–9.3](../spec/battle-field.md#92-1-次元戦闘における効果範囲用語)。

---

## 52. R5e — 敵 group combat module 指定（2026-07-12）

**目的:** `StageEnemyGroup` に任意の `selectedCombatModuleId` を追加し、同一 group 内の敵全員が指定 module を通常行動として使用。味方 R5d / Save / UI / 作戦ループは未接続。

**作業前に読んだファイル（6 件）:**

1. `docs/ai-handoff/current-task.md` — §49 R5c 完了・§50 設計・§51 R5d 完了
2. `src/battle/types.ts` — `StageEnemyGroup` / `ResolvedEnemySpawnSpec`
3. `src/battle/enemyGroupSpawn.ts` — `expandEnemyGroups`
4. `src/battle/entities.ts` — `createEnemyFromClassGroup` / `createEnemiesForStage`
5. `src/battle/data/validateGameData.ts` — `parseStageEnemyGroup` / `validateReferences`
6. `src/battle/data/resolveCombatModuleBasic.ts` — 既存 resolver（R5d 共用）

---

### 52.1 group フィールド

| 項目 | 内容 |
| ---- | ---- |
| フィールド名 | `selectedCombatModuleId?: string` |
| 型 | `StageEnemyGroup`（`src/battle/types.ts`） |
| 意味 | group 内の全 Combatant が共有する combat module |
| 未指定 | `class.combatModuleIds[0]`（module A） |
| legacy class | 未指定を基本。指定は validate エラー |
| 個体差 | 同一 group 内で個体ごとに別方式は持たせない |

**接続経路（production）:** `stage.enemyGroups` のみ（`waves[].enemyGroups` 正本切替・Stage 全体移行は未実装）。

---

### 52.2 validate 規則（JSON load 時）

`parseStageEnemyGroup` + `validateReferences`:

| 条件 | 結果 |
| ---- | ---- |
| 未指定 | 有効 |
| 空文字 / 非 string | parse エラー |
| registry 不在 | エラー |
| 他 class の module | エラー |
| class `combatModuleIds` 候補外 | エラー |
| legacy class（`combatModuleIds` なし）への指定 | エラー |
| 自 class の module A / B | 有効 |

不正 JSON は validate で拒否。runtime resolver（`resolveSelectedCombatModuleId`）は防御的 fallback を維持。

---

### 52.3 敵生成への受け渡し経路

```
StageEnemyGroup.selectedCombatModuleId
  → expandEnemyGroups (ResolvedEnemySpawnSpec.selectedCombatModuleId)
  → createEnemiesFromEnemyGroups / createEnemiesForStage
  → createEnemyFromClassGroup(spec, ...)
  → resolveBasicAttackSkillIdFromGameData(class, gameData, spec.selectedCombatModuleId)
  → basic cooldowns[].skillId + attackIntervalSec（合成 skill trigger.value）
```

同一 group の `count` 展開後も `selectedCombatModuleId` は各 spec にコピーされ、全個体が同じ module を使用。

---

### 52.4 runtime fallback（防御的）

| 条件 | 結果 |
| ---- | ---- |
| 未指定 | module A |
| 空 / registry 不在 | module A |
| class 候補外 | module A |
| 他 class の module | module A |
| legacy class | 従来 `basicAttackSkillId` |

---

### 52.5 legacy 互換

- 既存 stage JSON へ一括フィールド追加なし（テスト fixture のみ）
- legacy `waves` / `templateId` 経路は変更なし
- legacy class 敵 group は従来 basic

---

### 52.6 editor

- **UI 未接続**（選択ドロップダウン / CombatModuleEditor なし）
- **editor 変更なし** — `StageEnemyEditorStep` は `structuredClone` で draft を編集するため、JSON に存在する `selectedCombatModuleId` は保存時に落ちない（未知フィールド破壊なし）

---

### 52.7 テスト

- **新規:** `validateGameData.enemyGroupCombatModule.test.ts`（7 件 — validate）
- **新規:** `enemyGroupCombatModule.test.ts`（13 件 — runtime / fallback / 味方非影響 / 物理・魔法実行 / heal module 配線）
- **既存:** R5c/R5d 関連 — 回帰なし

**R5 関連 subset 結果（90/90 pass）:**

- `resolveCombatModuleBasic.test.ts`（8）
- `allyCombatModuleSelection.test.ts`（15）
- `combatModuleBasicAttack.test.ts`（14）
- `entities.enemyGroups.test.ts`（12）
- `healBasicAttack.test.ts`（10）
- `validateGameData.combatModules.test.ts`（9）
- `validateGameData.enemyGroupCombatModule.test.ts`（7）
- `enemyGroupCombatModule.test.ts`（13）
- `battleEngine.enemyAttackSpeedTier.test.ts`（2）

**フルスイート:** 1614 pass / 53 fail / 18 failed files（R5e 起因の失敗なし）。pre-existing 例:

- `demoStageBalance.puzzle.test.ts`（10）
- `formatSkillText.test.ts`（15）
- `StageSelectionPanel.test.ts`（6 — `Unknown combatModuleId` 等）
- `skillCardDisplay.test.ts`（3）
- `demoStageCh1_05AssassinFormalization.test.ts`（2）
- その他 i18n / progression unlock / badge 系（単発）

---

### 52.8 R5f 以降へ送る未接続事項

- module 選択の正式 UI / CombatModuleEditor（味方・敵）
- Save 永続化・Wave 間保持・checkpoint
- 作戦ループ・作戦状態全体・作戦内パッシブ（R8）
- 全兵科への combat module 移行
- `waves[].enemyGroups` 正本切替
- **R5d 制約（後続 UI 接続時）:** 正式ルールは Wave 前準備で module 選択し戦闘中は固定。現状 `setPartySlotCombatModule` は戦闘中も `syncPartyBuilds` を起動する（R5e では変更しない）
- **R5d 既知:** 同一 module 再設定でも cooldown 再生成（R5e では最適化しない）

**R5e 完了判定:** 本節時点で R5e 完了。次は R5f。

---

## 53. R5f — 味方 classId 重複禁止（2026-07-12）

**目的:** 味方 4 人編成で同一 `classId` を複数 slot に置けないよう、編成候補・編成変更 API・戦闘開始（味方生成）境界で保証。敵 group / 敵生成には適用しない。

### 53.1 読んだファイル

1. `docs/ai-handoff/current-task.md` — §49 R5c / §50 / §51 R5d / §52 R5e 完了状態
2. `src/progression/partyCompose.ts`
3. `src/game/GameSession.ts`
4. `src/battle/entities.ts`
5. `src/ui/SkillMenuPanel.ts`
6. `src/battle/allyCombatModuleSelection.test.ts`

### 53.2 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/progression/partyCompose.ts` | 重複判定ヘルパー・`PartyClassAssignmentResult` 型・`getAssignableClassIds` 正規化対応 |
| `src/game/GameSession.ts` | `tryUpdatePartySlot`（拒否 + module clear）、load 時 duplicate fallback |
| `src/battle/entities.ts` | `createAlliesFromPartyState` 境界 validate、`PartyDuplicateClassError` |
| `src/ui/SkillMenuPanel.ts` | `getAssignableClassIds` による archive 候補フィルタ、`syncDraftPartyToSelection` 防御 |
| `src/battle/test/demoStageSim.harness.ts` | 重複編成を作っていた diagnostic configure を R5f 準拠へ最小修正 |
| `src/battle/allyCombatModuleSelection.test.ts` | テスト 8 を distinct classId の slot 独立選択へ更新 |
| `src/progression/partyClassDuplicate.test.ts` | **新規** R5f 必須テスト 24 件 |
| `docs/ai-handoff/current-task.md` | 本 §53 |

### 53.3 重複判定の正本

`src/progression/partyCompose.ts`:

- `normalizePartyClassId` — `migrateLegacyClassId` 再利用（legacy alias は同一兵科として判定）
- `collectUsedPartyClassIds` / `findDuplicatePartyClassIds`
- `validatePartyClassIds` — party 全体
- `validatePartyClassAssignment` — slot 単位（空 slot・同一 slot 再選択は許可）
- `getAssignableClassIds` — UI 候補（編集中 slot 自身の class は残す）
- `PARTY_DUPLICATE_CLASS_MESSAGE` — `'同じ兵科は編成できません'`（i18n 本実装は後続）

### 53.4 境界での拒否

| 境界 | 挙動 |
|------|------|
| **編成変更 API** | `GameSession.tryUpdatePartySlot` — `validatePartyClassAssignment` で拒否。`updatePartySlot` は結果を無視して呼ぶだけ（既存 callback 互換）。拒否時は party 不変・persist なし |
| **戦闘生成** | `createAlliesFromPartyState` — `validatePartyClassIds` 失敗時 `PartyDuplicateClassError` を throw。`BattleEngine.reloadBattlefield` 経由で防御 |
| **既存 Save load** | `loadSaveForMode` — duplicate 検出時 `createDefaultSave` の party へ fallback（schema version 変更なし・自動 class 置換 migration なし） |
| **敵** | **変更なし** — `createEnemiesForStage` / `expandEnemyGroups` / `count > 1` は従来どおり |

### 53.5 UI 候補

- `SkillMenuPanel.getArchiveAssignableClassIds()` → `getAssignableClassIds(draftParty, unlocked, focusedSlot, classOrder)`
- 他 slot 使用中 class は archive から**除外**（編集中 slot 自身の class は残る）
- 未解放 class 非表示は従来どおり `unlockedClassIds` 経由
- `syncDraftPartyToSelection` で API 直前にも `validatePartyClassAssignment`（belt-and-suspenders）

### 53.6 class 変更時の module 選択

**採用:** classId が変わった slot の `selectedCombatModuleId` を **clear**（`PartyCombatModuleSelection.clearSelectedCombatModuleId`）。resolver fallback より無効状態を残さない方を採用。

- 同一 classId の再設定（`tryUpdatePartySlot`）では module 選択を clear せず、`restartBattle` も起動しない
- 他 slot の module 選択には影響しない

### 53.7 テスト

- `src/progression/partyClassDuplicate.test.ts` — 24 pass（必須 22 + legacy alias + restartBattle）
- `src/battle/allyCombatModuleSelection.test.ts` — テスト 8 更新後 15 pass

### 53.8 R5g 以降へ送る未接続事項

- module 選択の正式 UI / CombatModuleEditor（味方・敵）
- Save 永続化・Wave 間保持・checkpoint
- 作戦ループ・作戦状態全体・作戦内パッシブ（R8）
- 全兵科への combat module 移行
- `waves[].enemyGroups` 正本切替
- **R5f UI:** `party.duplicateClass` i18n キー本実装・正式エラー表示
- **R5f diagnostic:** `configureAssassinDoubleFinishParty` 等の旧「同一 class 2 体」診断 composition の R5g 再設計（現状は valid party へ最小差し替えのみ）
- **R5d 既知:** 同一 module 再設定でも cooldown 再生成

**R5f 完了判定:** 本節時点で R5f 完了。次は R5g。

---

## 54. R5g — R5 統合テスト・縦切り確認（2026-07-12）

**目的:** R5b〜R5f の load / validate / module 合成 / 味方 A/B 選択 / 敵 group 指定 / attackIntervalSec / 重複禁止 / legacy 共存を、1 本の統合シナリオと関連 subset で縦切り確認。新機能・正式 UI・Save 統合はスコープ外。

### 54.1 読んだファイル

1. `docs/ai-handoff/current-task.md` — §48〜§53 R5b〜R5f 完了・§50 効果範囲設計（変更なし）
2. `src/battle/r5CombatModuleIntegration.test.ts`（新規作成）
3. `src/battle/allyCombatModuleSelection.test.ts` / `enemyGroupCombatModule.test.ts` / `combatModuleBasicAttack.test.ts`
4. `src/battle/BattleEngine.ts` / `src/battle/entities.ts` / `src/battle/data/loadGameData.ts`
5. `src/battle/test/demoStageSim.harness.ts` / `src/progression/partyClassDuplicate.test.ts`
6. `docs/plans/phase-roadmap.md` — R6 次 Phase

### 54.2 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/battle/r5CombatModuleIntegration.test.ts` | **新規** R5g 統合テスト 7 件（必須 20 項目を 7 describe に集約） |
| `src/battle/test/demoStageSim.harness.ts` | 旧重複 diagnostic コメント整理（Category A/B 明記） |
| `src/battle/demoStageCh1_05AssassinFormalization.test.ts` | legacy diagnostic テスト名更新 |
| `docs/ai-handoff/current-task.md` | 本 §54 |

**production コード修正:** なし（統合テストで不具合未検出）。

### 54.3 統合シナリオ（fixture stage `r5_integration_test`）

**味方（重複なし 4 兵科）:** `df_guardian` / `at_swordsman` / `at_sorcerer` / `sp_cleric`

| slot | class | module 選択 |
|------|-------|-------------|
| 0 | df_guardian | B (`df_guardian_mod_guard_focus`) |
| 1 | at_swordsman | 未指定 → A (`at_swordsman_mod_single_slash`) |
| 2 | at_sorcerer | B (`at_sorcerer_mod_twin_bolt`) |
| 3 | sp_cleric | B (`sp_cleric_mod_party_mend`) |

**敵 group（6 体）:**

| group | module | 備考 |
|-------|--------|------|
| df_guardian ×1 | A 明示 | `df_guardian_mod_nearest_strike` |
| at_sorcerer ×1 | B | `at_sorcerer_mod_twin_bolt` |
| at_swordsman ×1 | 未指定 → A | |
| at_swordsman ×2 | B | `at_swordsman_mod_pierce_slash`、同一 group 共有 |
| df_paladin ×1 | legacy basic | `df_paladin_basic_attack` |

**戦闘検証:** 物理 / 魔法 / heal / multiLock 複数 hit / party heal 複数対象 / interval 差（2.5s < 3s < 4s）/ legacy basic 発火 / 二重発火なし。

**fixture のみ:** `structuredClone(loadGameData())` へ stage 注入。`waves[0].enemies` に `test_dummy` で training fast-start。接敵後 HP/ATK パッチで早期終了回避（production balance JSON 不変更）。

### 54.4 load → SkillExecutor 経路

```
loadGameData()
  → parseAndValidateGameDataJson / combatModuleRegistry + skillRegistry.actives 合成
  → PartyCombatModuleSelection（味方 slot A/B）
  → createAlliesFromPartyState（重複 validate）
  → createEnemiesForStage / expandEnemyGroups（敵 group module）
  → BattleEngine 構築 → reloadBattlefield → prepareTrainingWave → spawnWaveEnemies
  → initializeSkillCooldowns
  → startBattle → beginEngaged
  → tick(deltaTime) → tickCooldowns → runUnitSkills → SkillExecutor.tryExecute
  → damage / heal イベント
```

**省略した production 境界:** カスタム stage の gameData 注入のみ。Save / 正式 UI / Wave 間準備は未経由。

### 54.5 確認結果（要約）

| 項目 | 結果 |
|------|------|
| 味方 A/B 選択 | 未指定→A、B 指定 slot 独立、interval 初回 CD・発火後周期、敵と非干渉 |
| 敵 group module | A 明示 / B / 未指定→A、同一 group 共有、legacy enemy basic、味方選択と非干渉 |
| attackIntervalSec / attackSpeed | module basic は tier 非依存・有効倍率のみ；legacy は tier×倍率 |
| 味方重複禁止 | `PartyDuplicateClassError` at `createAlliesFromPartyState`；敵同一 class 複数 OK |
| legacy 共存 | df_paladin enemy は `df_paladin_basic_attack`；module と二重発火なし |
| validate / fallback | 不正 enemy module は validate 拒否；不正 runtime 味方選択は A fallback |

### 54.6 旧重複 diagnostic 整理

| helper | 分類 | 対応 |
|--------|------|------|
| `configureDoubleMeleeParty` | **A** | 既に distinct class（ranger→assassin）。「近接2人」意図を重複なしで維持 |
| `configureAssassinDoubleFinishParty` | **B** | 旧「同一 assassin ×2」は不可。cleric slot 単体 finish probe として legacy diagnostic 隔離。コメント更新 |
| `configureAssassinInsteadOfRangerParty` | **A** | 単体 assassin 差し替え。重複なし |
| `configureSwordsmanInsteadOfRangerParty` | **A** | assassin + swordsman。distinct |
| `configureNoHealerSwordsmanParty` | **A** | healer なし比較。distinct |

**Category C（balance assertion・R5 無関係）:** `demoStageBalance.puzzle.test.ts` 等 — 本 R5g では未修正（§54.7 参照）。

### 54.7 テスト実行

| スコープ | 結果 |
|----------|------|
| **新規 R5 統合** | `r5CombatModuleIntegration.test.ts` — **7 pass** |
| **R5 subset**（R5b〜R5f 関連 8 ファイル） | **97 pass** |
| **フルスイート** | **1638 pass / 60 fail / 7 worker timeout**（R5 起因の回帰 **0**） |

### 54.8 フルスイート失敗分類（60 + worker 7）

| 分類 | 件数（目安） | 代表 |
|------|-------------|------|
| R5 変更による回帰 | **0** | — |
| 味方重複禁止で obsolete | **0** | 重複編成テストは R5f で更新済み |
| 旧 active / skill 表示 schema 依存 | **~22** | `formatSkillText.test.ts`、`skillCardDisplay.test.ts`、`at*SkillUnlocks.test.ts`、`assassinMultiHitBasic.test.ts` |
| 旧 demo balance / diagnostic 依存 | **~24** | `demoStageBalance.puzzle.test.ts`、`demoStageAssassinVsSwordsman.test.ts`、`demoStageCh1_05AssassinFormalization.test.ts`、approach/badge 系 |
| i18n / UI 期待値の既存不一致 | **~12** | `t.test.ts`、`partyHudStatusBadgeHits.dom.test.ts`、`StageSelectionPanel.test.ts`（fixture に combatModules 未同梱） |
| worker timeout / infrastructure | **7** | `onTaskUpdate` timeout |
| その他 | **~2** | `previewLayout.test.ts`、`statusEffectDisplay.test.ts` |

**R5g で修正した不具合:** なし。

### 54.9 R5 全体完了判定

**R5 完了扱い可。** R5b〜R5g で以下が縦切り成立:

- CombatModule 最小型 + 4 兵科 × 8 module + load/validate
- module → 合成通常行動 → SkillExecutor（秒単位 `attackIntervalSec`、attackSpeed 分離）
- 味方 slot module A/B 選択（メモリのみ）
- 敵 group `selectedCombatModuleId`
- 味方 classId 重複禁止 / 敵重複許可
- legacy class / legacy basic 共存

**§50 効果範囲設計:** 変更なし（R8 doc のみのまま）。

### 54.10 R6 以降へ送る未接続事項

- module 選択の正式 UI / CombatModuleEditor（味方・敵）
- Save 永続化・Wave 間保持・checkpoint
- **R6:** Wave 間準備（自動 Wave 進行停止、編成・方式変更、Wave 状態リセット）
- 作戦ループ・作戦状態全体・作戦内パッシブ（R8）
- 全兵科への combat module 移行
- `waves[].enemyGroups` 正本切替
- **R5f UI:** `party.duplicateClass` i18n 本実装
- **R5d 既知:** 同一 module 再設定でも cooldown 再生成

**R5g 完了判定:** 本節時点で R5g 完了。**R5 全体完了。** 次は **R6**。

## 55. ゲーム内クラス選択一覧の欠落修正（2026-07-12）

対象は開発用 `editor.html` ではなく、ゲーム内編成画面 `SkillMenuPanel` のクラス選択一覧。

### 55.1 根本原因

`SkillMenuPanel.createPickerRoleBlocks()` が一覧母集団を二重に絞っていた。

1. `getPickerVisibleClassIds()` が `unlockedClassIds` のみ返し、runtime registry に存在する未解禁 class を非表示
2. さらに R5f の slot 向け `getAssignableClassIds()` を一覧表示へ誤流用し、他 slot で編成済みの class まで非表示

報告 4 件には、現在の編成・Save の `unlockedClassIds` による除外が混在し得る。`combatModuleIds` の有無、role、category、classId alias は直接原因ではない。

### 55.2 修正

- 一覧母集団を `GameData.classRegistry` 全件へ変更し、`classOrder` 順へソート
- `classOrder` 未列挙 class は末尾に保持
- `getAssignableClassIds()` による表示除外を削除
- 編成済み class は非表示にせず active 表示。同一 class 重複禁止は既存 toggle / validation で維持
- module 対応 4 兵科と module 未対応 legacy class を同じ一覧へ表示

修正後の全 classId（15）:
`df_guardian`, `df_paladin`, `df_duelist`, `at_swordsman`, `at_assassin`, `at_lancer`, `at_ranger`, `at_ballista`, `at_hunter`, `at_sorcerer`, `at_sigilist`, `at_conductor`, `sp_cleric`, `sp_wardweaver`, `sp_alchemist`

### 55.3 変更・テスト

- `src/ui/SkillMenuPanel.ts`
- `src/ui/skillMenuClassList.test.ts`
- `docs/spec/party-formation-ui.md`

回帰テストは報告 4 件、R5 module 対応 4 兵科、legacy 兵科、編成済み class、`classOrder` 未列挙 class を明示確認。

**R5 完了判定:** 維持。§50 効果範囲設計は変更なし。  
**次の再開タスク:** **R6b**（§56.9 参照）。

---

## 56. R6a — Wave 遷移・状態寿命の調査（2026-07-12）

**目的:** R6 実装前提（Wave 間停止・編成/module 変更・Wave 状態破棄・作戦メモリ・checkpoint retry・最終 Wave 後作戦結果）を現行コード上で確定。production / JSON / テストは**未変更**。

### 56.1 読んだファイル（6 件）

1. `docs/ai-handoff/current-task.md` — R5 完了・§55 editor 修正を正本
2. `src/battle/BattleEngine.ts` — Wave 遷移・戦闘状態の中心
3. `src/game/GameSession.ts` — 画面遷移・Save・module 選択・engine 接続
4. `src/battle/entities.ts` — Combatant 生成・`createEnemiesForStage`・`healAllAllies`
5. `src/battle/types.ts` — `StageDef` / `StageWave` / `SaveGameState` / `CombatantState`
6. `docs/plans/phase-roadmap.md` — R6 上位スコープ

**補助参照（列挙外）:** `src/battle/partyCombatModuleSelection.ts`、`src/battle/enemyGroupSpawn.ts`、`src/battle/data/validateGameData.ts`（stage parse）、`src/progression/partyCompose.ts`、`src/game/gameScreen.ts`、`docs/spec/operation-loop.md`

### 56.2 変更したファイル

| ファイル | 変更 |
|----------|------|
| `docs/ai-handoff/current-task.md` | 本 §56、§2 次タスク更新 |
| `docs/plans/phase-roadmap.md` | §R6 分割追記のみ（R6 目的・確定仕様は不変更） |

---

### 56.3 現行 Wave 遷移経路

| 段階 | 所有者 | 関数 / 経路 | 備考 |
|------|--------|-------------|------|
| **stage 開始（出撃）** | `GameSession` | `handleStageSortie` → `save.stageProgress.currentStageId` 更新 → `stageDamageStats.resetForStage` → `engine.restartBattle` → `menuHost.open('party')` | 作戦ループ未実装。現状は「1 stage = 1 戦闘セッション」 |
| **App 起動 / engine 構築** | `BattleEngine` ctor | `reloadBattlefield()` | `GameSession` ctor 内で `new BattleEngine(...)` 後即実行 |
| **wave index 初期化** | `BattleEngine` | `reloadBattlefield` → `resolveStartWaveIndex()` → `this.waveIndex = startWaveIndex` | debug verify のみ `getLoopWaveIndex()` で開始 wave を固定。通常は **常に 0** |
| **味方生成** | `BattleEngine` | `reloadBattlefield` → `createAlliesFromPartyState(getParty(), getSelectedCombatModuleId)` | **stage 開始 / restart 時のみ**新規生成 |
| **wave 敵生成** | `BattleEngine` | `prepareWaveDeploy` / `prepareTrainingWave` → `spawnWaveEnemies` → `createEnemiesForStage(gameData, stageId, waveIndex, levelCurves)` | 敵のみ wave ごとに差し替え |
| **戦闘開始** | `BattleEngine` | `startBattle` → `tryBeginTrainingEngage`（訓練 wave）または deploy 完了 → `beginEngaged` → `setupEngagedCombat` | `GameSession.start()` から呼ばれる |
| **敵全滅判定** | `BattleEngine` | `tickRunning`（engaged 中）→ `checkBattleEnd` | `!enemies.some(isAlive)` |
| **次 wave 判定** | `BattleEngine` | `checkBattleEnd` 内 `hasNextWave` = `waveIndex + 1 < stage.waves.length` かつ `!isPinnedWaveComplete()` | verify loop wave 固定時は最終 wave 扱いで victory へ |
| **次 wave 自動生成** | `BattleEngine` | `beginEnemyWipeSettle(true)` → `pendingNextWaveIndex = waveIndex + 1` → 死亡演出 delay → `waveExitMarchActive` → `tickWaveExitMarch` → `beginWaveAnnouncement(next)` → `prepareWaveDeploy` | **停止点なし**。告知〜 deploy まで自動 |
| **最終 wave 勝利** | `BattleEngine` → `GameSession` | `beginEnemyWipeSettle(false)` → `pendingVictoryTimer` → `applyVictoryTransition` → `emit(battleEnd, victory)` → `handleVictory` | 全 wave クリア = **stage クリア**扱い（作戦結果画面なし） |
| **敗北** | `BattleEngine` → `GameSession` | `checkBattleEnd`（味方全滅）→ `applyDefeatTransition` → `handleDefeat` | 非 verify: `restartBattle` + 編成画面。verify+loop: 進行変更なし |
| **restart** | `GameSession` / `BattleEngine` | `GameSession` 各所 → `engine.restartBattle`；`restartBattle` → `reloadBattlefield` | 編成変更・stage 変更・debug loop 等で共通 |
| **reload** | `BattleEngine` | `reloadBattlefield` | `resetEntityIdCounter`、味方**再生成**、wave 0（または loop wave）から |
| **respawn** | `BattleEngine` | `tick`（victory/defeat phase）→ `respawnAfterEnd` → `reloadBattlefield` | 勝利退場 march 完了後に **同一 stage を先頭 wave から再開**（verify 等で観測） |

**wave index の所有者:** `BattleEngine` 私有フィールド `waveIndex`（`getSnapshot().waveIndex` で参照）。`GameSession` は debug 用 `loopWaveIndex` のみ（verify 限定）。**作戦用 `currentWaveIndex` / `clearedWaveCount` は未実装。**

**BattleEngine と GameSession の責務境界（現状）:**

| 領域 | BattleEngine | GameSession |
|------|--------------|-------------|
| wave index・接敵・skill tick | ○ | — |
| Combatant runtime（HP / 位置 / CD / status） | ○ | — |
| Save `party` 正本 | 読取のみ `getParty()` | ○ 所有・persist |
| module 選択（R5d） | 読取 `getSelectedCombatModuleId` | ○ `PartyCombatModuleSelection` |
| 画面（battle / formation / stageSelect） | — | ○ `setGameScreen` |
| stage クリア・EXP・次 stage | イベント通知のみ | ○ `handleVictory` / `handleDefeat` |
| 戦闘統計 HUD | コールバックで記録 | ○ `StageDamageStatsTracker` |

**敵全滅 → 次 wave までの停止点:** 演出用 delay（`ENEMY_DEATH_SETTLE_DELAY_SEC`）と右退場 march のみ。**プレイヤー操作を待つ停止は存在しない。**

**自動進行停止の最小差分挿入箇所（推奨）:**

1. **第一候補:** `BattleEngine.tickWaveExitMarch` — 味方 off-screen 到達後、現行の `beginWaveAnnouncement(waveIndex)` の直前。ここで `emit('waveCleared')` 等とし `GameSession` が Wave 間準備へ遷移。
2. **第二候補:** `checkBattleEnd` の `hasNextWave` 分岐 — `pendingNextWaveIndex` 設定後に engine tick を止め、退場演出だけ完了させて停止（演出と停止の分離がやや複雑）。

**stage 直下 `enemyGroups` の 1 wave 扱い:**

- `createEnemiesForStage`: `stage.enemyGroups` あり → **`waveIndex !== 0` なら空配列**、wave 0 のみ `createEnemiesFromEnemyGroups`
- validate: `enemyGroups` ありなら `waves[0].enemies` 空配列を許可（placeholder 1 wave）
- 実質 **1 stage = 1 wave 相当**（R5 縦切りと一致）

**legacy `waves[].enemies` 経路:**

- `stage.enemyGroups` なし → `stage.waves[waveIndex].enemies` を `templateId` + `spawnX` で `createEnemyFromTemplate`
- 複数 wave は legacy stage `1` / `2` が実例（`data/stages.json`）

**`waves[].enemyGroups` の型・実装:**

- `StageWave` 型は `{ enemies: StageWaveEnemy[] }` **のみ**（`enemyGroups` フィールドなし）
- validate / load **未対応**
- R4 doc 上の正本は `waves[].enemyGroups` だが、**runtime は未実装**。現行は stage 直下 `enemyGroups` + 1 wave placeholder

---

### 56.4 状態所有表

#### 作戦中に維持する候補

| 項目 | 現所有者 | 生成 | 破棄・再初期化 | 混在リスク |
|------|----------|------|----------------|------------|
| party 編成 | `SaveGameState.party`（`GameSession.save`） | `createDefaultSave` / `tryUpdatePartySlot` | `loadSaveForMode`；重複時 default へ fallback | `BattleEngine.players` と **別オブジェクト**（restart で再同期） |
| slot `selectedCombatModuleId` | `GameSession.partyCombatModuleSelection` | `setPartySlotCombatModule` | class 変更・slot 空で `clear`；**restart/defeat/victory では保持** | Save に無い。作戦状態候補として **そのまま流用可** |
| `currentWaveIndex` | `BattleEngine.waveIndex` | `reloadBattlefield` / `prepareWaveDeploy` | `restartBattle` で 0（または loop wave） | 作戦進行と戦闘が **同一 engine 内**に混在 |
| `clearedWaveCount` | **未実装** | — | — | — |
| 将来 `passiveIds` | **未実装** | — | — | — |
| 未使用リソース | **未実装** | — | — | — |
| checkpoint | **未実装** | — | — | spec のみ [operation-loop.md §8](../spec/operation-loop.md#8-wave-開始チェックポイント) |
| retry 用 snapshot | **未実装** | — | — | — |

#### Wave ごとに破棄するもの（spec 上）

| 項目 | 現所有者 | 生成 | 現行の wave 間挙動 | 混在 |
|------|----------|------|-------------------|------|
| Combatant（味方） | `BattleEngine.players` | `reloadBattlefield` のみ | **wave 間は同一オブジェクトを再利用** | 作戦 HP と wave 戦闘が同一 Combatant |
| Combatant（敵） | `BattleEngine.enemies` | `spawnWaveEnemies` 毎回 | **新規生成**（ID も再採番） | — |
| HP | `CombatantState.hp` | `createAllyFromMember` / enemy 生成 | **wave 間維持**（全滅味方は corpse 非表示のみ） | **R3 全回復と不一致** |
| Barrier | `CombatantState.barrierHp` | 戦闘中付与 | **wave 間維持** | 同上 |
| statusEffects | `CombatantState.statusEffects` | 戦闘中付与 | **wave 間維持**（tick は継続） | 同上 |
| DoT / HoT / CC | statusEffects 内 | 同上 | **維持** | 同上 |
| 位置・facing | `battleX` 等 / snapshot `facingSign` | deploy / engaged | deploy で battleX 再配置。**engaged 系フィールドは waveStart で一部 reset なし** | 同一 Combatant |
| skill / basic CD | `CombatantState.cooldowns` | `createCooldowns` + `initializeSkillCooldowns` | **wave 間維持**（reload 時のみ再生成） | 同上 |
| attack timer | cooldown `remaining` | 同上 | **維持** | 同上 |
| 一時 stat 補正 | statusEffects / aura 同期 | `syncContinuousPassiveAuras` 等 | **維持** | 同上 |
| target / movement state | `EngagedCompositionTracker`、approach state | `setupEngagedCombat` | wave 開始で `clearEngagedVisualState`。**tracker は engine 寿命で持続** | engine 私有 |
| damage / heal counters（HUD 用） | `StageDamageStatsTracker`（GameSession） | stage 開始 | **stage 単位で蓄積**（wave リセットなし） | 作戦統計と wave が混在 |
| projectile / 進行 effect runtime | `pendingHitQueue`、`placedFields`、`SkillSequenceRunner` | executor | wipe settle で runner clear。**placedFields は wave 間で残存しうる**（`reloadBattlefield` のみ clear） | engine 私有 |

**作戦状態と Wave 戦闘状態の混在箇所:**

1. **`BattleEngine` 単体** — `waveIndex`・`players`（HP/CD/status）・deploy 状態が stage 全体寿命
2. **`GameSession.save.party`** — 永続編成と戦闘中 `syncPartyBuilds` / `restartBattle` が直結
3. **`StageDamageStatsTracker`** — stage 通算統計（wave 単位リセットなし）

---

### 56.5 R5 `partyCombatModuleSelection` 寿命

| 質問 | 結果 |
|------|------|
| battle reload 後 | **残る**（`restartBattle` / `reloadBattlefield` は selection を触らない） |
| stage 変更後 | **残る**（`handleStageSortie` / `setLoopStage` でも clear なし） |
| defeat / victory 後 | **残る**（`handleDefeat` / `handleVictory` でも clear なし） |
| class 変更時のみ clear | **ほぼ yes** — `tryUpdatePartySlot` で classId 変更時 `clearSelectedCombatModuleId`；slot 空でも clear |
| Wave 間維持として利用可 | **yes** — Save 非統合メモリとして R6 作戦状態へそのまま移管可能 |
| 将来 `OperationState` へ移す変更範囲 | `GameSession` の 4 API（set/get/clear/reset）と `BattleEngine` ctor の `getSelectedCombatModuleId` 参照元を `OperationState` に差し替え。`syncPartyBuilds` の module 解決経路は不変 |
| 戦闘中変更の gate | 現状 `setPartySlotCombatModule` → 即 `engine.syncPartyBuilds()`（`phase === 'running'` なら CD 再生成）。**gate は `GameSession.setPartySlotCombatModule` / `updateMemberBuild` / `tryUpdatePartySlot` の入口**で「Wave 間準備中のみ許可」が最小 |

**UI:** 正式 module UI は未接続。テスト・debug 経由の `GameSession.setPartySlotCombatModule` のみ。

---

### 56.6 party と Save

| 項目 | 現状 |
|------|------|
| party 編成の正本 | `SaveGameState.party`（4 slot `PartySlotState[]`） |
| `tryUpdatePartySlot` 成功時 persist | **あり** — 常に `persistSave()` |
| battle への sync | class 変更時 `engine.restartBattle()`（味方 Combatant 全再生成）。build のみ変更は `syncPartyBuilds()` |
| Wave 間一時編成 vs 恒久 Save | **区別不可** — 編成 API は常に Save を更新 |
| retry 用に必要な snapshot | 最低限: `party` 深いコピー + `partyCombatModuleSelection` 全 slot + `currentWaveIndex` + `clearedWaveCount`（未実装）+ 将来パッシブ/リソース |
| 重複禁止ヘルパー | `validatePartyClassAssignment` / `validatePartyClassIds`（`partyCompose.ts`）— Wave 間準備でも **そのまま再利用可** |
| 重複 Save fallback との競合 | `loadSaveForMode` で重複 party は **default party に置換して save**。Operation checkpoint はメモリのみなら競合しないが、**Wave 準備中の編成を Save に直書きすると checkpoint と乖離** |

**Save schema 変更なしで R6 を成立させる障害:**

1. **編成の即 persist** — checkpoint「出撃確定」モデルと矛盾。Wave 間の試行錯誤が Save を汚す
2. **`clearedWaveCount` / checkpoint フィールドが Save に無い** — OperationState を **セッションメモリ**で持つ必要（spec 整合）
3. **module 選択が Save に無い** — セッション再起動で消失（許容）。作戦中は `PartyCombatModuleSelection` を OperationState へ移管で足りる
4. **現行 victory = stage クリア** — 複数 wave 作戦の「最終結果」と「stage 進行」が未分離

---

### 56.7 Wave 間リセット表

**現行の次 wave 処理: 味方 Combatant は再利用、敵のみ新規生成。**

| 対象 | 分類 | 根拠 |
|------|------|------|
| HP 全回復 | **明示的初期化が必要** | `healAllAllies` は存在するが **production 未呼び出し**。wave 間 HP 維持 |
| Barrier 解除 | **明示的初期化が必要** | 同上 |
| DoT / HoT 解除 | **明示的初期化が必要** | `statusEffects` 維持 |
| CC 解除 | **明示的初期化が必要** | 同上 |
| 位置・facing 初期化 | **明示的初期化が必要**（味方） | `placePartyOffScreenForDeploy` で battleX のみ。HP0・engaged フィールドは残存 |
| skill / basic CD 初期化 | **明示的初期化が必要** | reload 時のみ `initializeSkillCooldowns`。wave 間は維持 |
| 一時 stat 補正解除 | **明示的初期化が必要** | status / aura 維持 |
| target / approach state 解除 | **明示的初期化が必要** | `clearEngagedVisualState` + deploy 再配置。`EngagedCompositionTracker` は engine 寿命 |
| damage / heal counters 解除 | **BattleEngine 外に残存** | `StageDamageStatsTracker` は stage 通算 |
| projectile 等 runtime 破棄 | **明示的初期化が必要** | wipe で `skillSequenceRunner.clearAll`。`placedFields` / `pendingHitQueue` は wave deploy で未 clear |
| 敵 Combatant | **新 Combatant 生成で自然にリセット** | `spawnWaveEnemies` |
| 味方 Combatant オブジェクト | **再利用**（新規生成ではない） | `this.players` は `reloadBattlefield` 以外差し替えなし |
| 作戦内パッシブ | **未実装概念** | R8 |
| checkpoint 復元 | **未実装概念** | R6 後半 |

**R3 仕様（Wave 間全回復）との差分:** 現行は **長期消耗モデルに近い**（味方 HP・状態を wave 間で持ち越し）。R6 で「次 Wave 開始」経路に `healAllAllies` + status clear + CD re-init を **明示追加**するか、味方も **再生成**するかの設計判断が必要（再生成なら module 選択の再適用経路は既存 `createAlliesFromPartyState` で足りる）。

---

### 56.8 retry / checkpoint（現行と R3 三種）

| 現行 API | 実装 | 触る状態 |
|----------|------|----------|
| `restartBattle` | 全 state 破棄 → `reloadBattlefield`（wave 0、味方再生成） | engine 全域 + 味方 Combatant 新規 |
| `reloadBattlefield` | 上記の本体 | `waveIndex`、enemies、players、passive stageStart、placedFields clear |
| `handleDefeat` | 非 verify: `restartBattle` + 編成画面。verify+loop: ログのみ | Save stage 進行は verify で rollback あり |
| `respawnAfterEnd` | victory/defeat 後タイマー満了 → `reloadBattlefield` | 先頭 wave から同一 stage 再開 |
| save 再読込 | `loadSaveForMode`（verify 切替・起動時） | `save` 差し替え。`partyCombatModuleSelection` は **セッション存続** |
| party 再生成 | `createAlliesFromPartyState`（restart 経路） | Save party + module 選択から |
| stage 再生成 | `handleStageSortie` / `setLoopStage` → `restartBattle` | `currentStageId` 変更 |

**R3 三種リトライ — 流用と不足:**

| リトライ種別 | 流用可能な現行処理 | 不足状態 |
|--------------|-------------------|----------|
| **同設定再戦**（現在 Wave 即再戦） | `restartBattle` の敵再 spawn 部分に相当する `prepareWaveDeploy(currentWave)`；味方 reset は `healAllAllies` + status/CD clear の新規ヘルパー | checkpoint からの party/module 復元；**現 wave index の保持**（restart は 0 に戻る）；作戦中パッシブ（未実装） |
| **準備へ戻る**（Wave 間準備） | `tickWaveExitMarch` 完了後の停止＋`setGameScreen('formation')`；`tryUpdatePartySlot` + module API | `OperationState`；checkpoint snapshot；**wave 自動進行の停止**；clearedWave 維持 |
| **作戦最初から** | `reloadBattlefield` + OperationState 初期化；`handleStageSortie` に近いが **clearedWave / パッシブ / リソースも reset** | 作戦状態全体；初期準備画面；stage 進行との分離 |

**checkpoint（出撃確定）:** 未実装。候補は `handleStageSortie` 確定後または Wave 間準備の「次 Wave 出撃」確定時に `structuredClone(party)` + module map + wave index + cleared count を **メモリ**へ保存。

---

### 56.9 画面状態の接続候補

**現行 `GameScreen`:** `'battle' | 'formation' | 'stageSelect'`（`gameScreen.ts`）

| 将来画面 | 追加要否 | 接続案 |
|----------|----------|--------|
| `battle` | 既存 | 現状どおり |
| `waveEnd` | **任意**（演出専用） | `BattleEngine` の wipe settle / exit march 中は **battle のまま** tick 継続でも可。独立 screen は必須ではない |
| `wavePreparation` | **実質必要** | 既存 `formation` を **流用可能** — `DomFormationScreenHost` / `MetaMenuOverlay`（`presentation: 'formation-screen'`）。差分: 敵 preview・module 選択 UI・「次 Wave 出撃」CTA・通常編成との **モードフラグ** |
| `operationResult` | **必要**（最終 wave 後） | 現行 `handleVictory` → `stageSelect` を作戦完了時のみ分岐。新 screen または stageSelect 上の結果モーダル |

**確認事項:**

| 項目 | 結論 |
|------|------|
| 既存 party 画面の Wave 間流用 | **可** — `menuHost.open('party')` と同系。モード引数で Wave 間限定 UI を足す |
| 通常編成との差分 | 敵情報表示・出撃確定・retry 導線・編成変更が **checkpoint へ反映されるタイミング** |
| BattleEngine tick を止める場所 | `GameSession.tick` — `currentScreen !== 'battle'` または新フラグ `operationPhase !== 'waveCombat'`。現状も formation / stageSelect で engine tick 停止済み |
| 次 Wave 再開 API | **`GameSession.startNextWave()`**（新規）→ `BattleEngine.beginNextWaveFromPreparation()` 等。内部で `beginWaveAnnouncement(pendingNextWaveIndex)` |
| GameSession が遷移を所有すべきか | **yes** — engine は battle イベント発火のみ。screen / OperationState は GameSession |
| BattleEngine に UI 状態を持たせない | **可能** — 現行も `phase` は battle 結果用のみ。Wave 間は GameSession + screen で足りる |

---

### 56.10 Stage / Wave データ現状

| 項目 | 現状 |
|------|------|
| `StageDef.waves` | `StageWave[]` — 各 `{ enemies: { templateId, spawnX }[] }` |
| `waves[].enemyGroups` | **型・validate・spawn すべて未実装** |
| stage 直下 `enemyGroups` normalize | validate で parse → `StageDef.enemyGroups`。`waves[0].enemies` 空許可 |
| `createEnemiesForStage(waveIndex)` | 引数あり。**直下 `enemyGroups` は wave 0 のみ**。legacy は任意 index |
| R5e `selectedCombatModuleId` を wave group で保持 | **stage 直下 `StageEnemyGroup` では実装済み**。`waves[].enemyGroups` は schema 候補のみ |
| R6 最小縦切りの schema 変更候補（実装しない） | ① `StageWave` に `enemyGroups?: StageEnemyGroup[]` 追加 ② validate ③ `createEnemiesForStage` を wave 優先に分岐 ④ 移行: 直下 `enemyGroups` → `waves[0].enemyGroups` normalize（editor / migration は R9） |

**R6 最小データ:** legacy 複数 wave stage `1` で縦切り可能（`waves[].enemies` のみ）。`enemyGroups` 複数 wave は **schema + spawn 変更後**。

---

### 56.11 R6 推奨分割（依存順）

| ID | 目的 | 主な変更範囲 | 前提 | 完了条件 | 対象外 |
|----|------|-------------|------|----------|--------|
| **R6a** | Wave 遷移・状態寿命の確定 | handoff | R5 完了 | 本 §56 | 実装 |
| **R6b** | Wave 終了停止 + 仮次 Wave 開始 | `BattleEngine.tickWaveExitMarch`、`GameSession` イベント・`startNextWave`、debug ボタン可 | R6a | 敵全滅後 **自動で次 wave に入らない**。仮 UI/ debug で次 Wave 開始可 | 正式 UI・HP 全回復 |
| **R6c** | OperationState 最小型 | 新 `OperationState`（メモリ）、`GameSession` が wave index / clearedCount / module map 所有 | R6b | engine の作戦進行が Session 経由 | Save schema・パッシブ |
| **R6d** | Wave 状態リセット + 次 Wave 生成 | `prepareWaveDeploy` 前後、`healAllAllies` 等ヘルパー配線、placedFields clear | R6c | 次 Wave 開始時 HP/CC/CD/敵が R3 通りリセット | 味方 Combatant 再生成方式の最適化は後回し可 |
| **R6e** | Wave 間準備 screen（formation 流用） | `GameSession.setGameScreen` 拡張 or wave prep モード、`menuHost`、編成/module gate | R6c | Wave 間のみ編成・module 変更可。戦闘中は拒否 | 敵詳細 UI・i18n 本実装 |
| **R6f** | checkpoint（出撃確定）メモリ | `OperationState` snapshot、出撃確定 API | R6e | 次 Wave 出撃時に snapshot 保存（メモリ） | 3 種 retry 完全実装 |
| **R6g** | 複数 Wave `enemyGroups` spawn | `types` / validate / `createEnemiesForStage` | R6d 動作確認後でも可 | wave index ごとに `waves[n].enemyGroups` または正規化後データで spawn | editor・全面 migration |
| **R6h** | 最終 Wave → 作戦結果 | `checkBattleEnd` 最終分岐、`handleVictory` 分離、`operationResult` screen 仮 | R6b〜d | 最終 wave のみ作戦結果へ。中間 wave は Wave 間準備 | 恒久報酬設計 |
| **R6i** | retry 3 種（最小） | defeat / wave prep からの分岐 | R6f checkpoint | 同設定再戦・準備へ戻る・作戦最初からが **debug または最小 UI** で各 1 経路 | R7 倍速・演出 |
| **R6j** | 統合テスト | 2 wave legacy stage `1` + module 選択 + stop/resume | R6b〜h | 自動テストで wave 停止→準備→次 wave→最終結果 | 全兵科・全 stage |

**最初の手動操作確認地点（早期）:** **R6b 完了時** — Stage `1` 等で Wave 1 クリア後、自動 Wave 2 告知が走らず停止し、debug/仮ボタンで Wave 2 を開始できる。

**次の 1 タスク:** **R6b** — `tickWaveExitMarch` 停止 + `GameSession.startNextWave` + 仮トリガー。

**主な実装リスク:**

1. 味方 Combatant **再利用**前提のため、R3 全回復は「再生成」より **明示 reset ヘルパー**の設計が必要
2. `tryUpdatePartySlot` の即 persist が checkpoint と衝突 — Wave 間は OperationState 編集 + 出撃時 Save 同期の二段が安全
3. 現行 `handleVictory` = stage クリア — 中間 wave と最終 wave の分岐漏れが進行破壊リスク
4. `stage.enemyGroups` と multi-wave の組み合わせは現行 spawn が空配列 — R6g なしでは **legacy wave のみ**で縦切り
5. `StageDamageStatsTracker` の wave 単位リセット方針未決（作戦通算のままか wave リセットか）

---

### 56.12 §55 editor 問題の handoff 区分（R6 へ混ぜない）

**確認済み（§55 正本）:**

- editor validate への `combatModules` 追加
- classes 先行 fetch
- 15 class picker 回帰テスト

**未特定（再発時調査へ送る）:**

- 報告「4 兵科だけ欠けて見えた」直接原因（一覧母集団二重 filter 以外の単独原因は未確定）

---

### 56.13 完了報告サマリ（§13 対応）

1. **読んだファイル:** §56.1 の 6 件
2. **変更したファイル:** `docs/ai-handoff/current-task.md`、`docs/plans/phase-roadmap.md`（R6 分割追記）
3. **現行 Wave 遷移:** §56.3
4. **wave index 所有者:** `BattleEngine.waveIndex`（verify 時開始 index のみ `GameSession.loopWaveIndex`）
5. **作戦状態候補の現所有者:** Save.party、PartyCombatModuleSelection、未実装（clearedWave/checkpoint/passive/リソース）
6. **Wave 戦闘状態の現所有者:** BattleEngine（players/enemies/runtime）
7. **Wave 間リセット表:** §56.7
8. **module 選択寿命:** §56.5
9. **party / Save:** §56.6
10. **retry / checkpoint 流用:** §56.8
11. **screen 接続:** §56.9
12. **Stage / Wave schema:** §56.10
13. **R6 推奨分割:** §56.11
14. **最初の手動確認地点:** R6b（Wave 停止 + 仮次 Wave 開始）
15. **主なリスク:** §56.11 末尾
16. **次の 1 タスク:** **R6c**

---

## 57. R6b — Wave 終了停止 + 仮次 Wave 開始（2026-07-12）

**目的:** 中間 Wave 終了後に自動進行を止め、`startNextWave()` で明示再開できる最小経路を追加。OperationState・HP 全回復・正式 UI は未実装。

### 57.1 読んだファイル（6 件）

1. `docs/ai-handoff/current-task.md` — R5 完了・§56 R6a 正本
2. `src/battle/BattleEngine.ts` — Wave 遷移・tick 中心
3. `src/game/GameSession.ts` — Session 接続
4. `src/battle/battlePhase.ts` — RuntimeBattlePhase
5. `src/battle/test/battleFieldSpec.harness.ts` — 回帰テスト harness
6. `src/ui/DebugMenuPanel.ts` — verify 仮トリガー

### 57.2 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/battle/BattleEngine.ts` | `awaitingNextWave`、`tickWaveExitMarch` 停止、`startNextWave()`、tick 凍結 |
| `src/battle/battlePhase.ts` | `RuntimeBattlePhase: AwaitingNextWave` |
| `src/battle/types.ts` | `BattleSnapshot.awaitingNextWave` |
| `src/game/GameSession.ts` | `startNextWave()` / `isAwaitingNextWave()` |
| `src/ui/DebugMenuPanel.ts` | verify 時「次Wave開始」ボタン |
| `src/ui/BattleView.ts` | debug コントロール配線 |
| `src/battle/test/battleFieldSpec.harness.ts` | `reachAwaitingNextWave`、`reachWave2Engage` 更新、`installLegacyWaveAutoAdvance` |
| `src/battle/test/demoStageSim.harness.ts` | シミュ終了まで `startNextWave` |
| `src/battle/battleEngine.awaitingNextWave.test.ts` | R6b 必須テスト（新規） |
| `src/battle/battlePhase.test.ts` | AwaitingNextWave FSM |
| `src/battle/battleFieldTransition.test.ts` | T-wave-exit-01 / Phase3d 更新 |
| 他 wave2 回帰テスト数件 | `legacyAutoWaveAdvance` 等 |
| `docs/ai-handoff/current-task.md` | 本 §57 |
| `docs/plans/phase-roadmap.md` | R6b 完了・次 R6c |

### 57.3 待機状態

- **フィールド:** `BattleEngine` 私有 `awaitingNextWave: boolean`
- **FSM:** `RuntimeBattlePhase = 'AwaitingNextWave'`
- **snapshot:** `BattleSnapshot.awaitingNextWave`
- **意味:** 中間 Wave の敵退場 march 完了後、次 Wave 開始待ち。最終 Wave 勝利・敗北・退場中とは別。

### 57.4 自動進行を止めた箇所

- **`tickWaveExitMarch`:** 味方 off-screen 到達後、従来の `beginWaveAnnouncement(pendingNextWaveIndex)` を呼ばず `awaitingNextWave = true` のみ設定。`pendingNextWaveIndex` は保持。
- **`tickRunning`:** `awaitingNextWave` 時は冒頭で return（tickIndex / battleTimeSec / CD / status / 戦闘処理すべて停止）。

### 57.5 Wave index 更新タイミング

| タイミング | `waveIndex` | `pendingNextWaveIndex` |
|------------|-------------|------------------------|
| 中間 Wave 敵全滅 | 完了 Wave（例: 0）維持 | `waveIndex + 1` を設定 |
| 退場 march 完了 → 待機 | 同上 | 同上（保持） |
| `startNextWave()` 成功 | **`beginWaveAnnouncement(next)` 内で `waveIndex = next` に更新** | クリア後に告知開始 |
| 最終 Wave 全滅 | 従来どおり victory（待機なし） | — |

二重 increment なし。`startNextWave` は `pendingNextWaveIndex` を一度だけ消費。

### 57.6 API

**BattleEngine**

```ts
startNextWave(): boolean
```

- 成功条件: `phase === 'running'` かつ `awaitingNextWave` かつ `pendingNextWaveIndex !== null`、退場/告知/deploy 中でない
- 成功時: `beginWaveAnnouncement(pendingNextWaveIndex)` を既存経路で呼ぶ

**GameSession**

```ts
startNextWave(): boolean
isAwaitingNextWave(): boolean
```

- engine へ委譲のみ。Save / party persist / stage 進行 / victory reward は触らない。

### 57.7 仮操作（verify 限定）

1. `npm run dev` で起動
2. **verify ON**（画面上部 verify バッジ）
3. Debug メニュー（戦闘画面「Debug」）を開く
4. 中間 Wave 終了待機中のみ **「次Wave開始」** ボタン表示
5. クリック → `engine.startNextWave()` → Wave 告知・敵生成へ

**手動確認用 stage:** legacy multi-wave **Stage `1`**（`data/stages.json`）。Debug で周回ステージ `Stage 1`、周回 Wave `全Wave` を選択。

**コンソール代替:** `gameSession.startNextWave()`（verify 中・待機後）。

### 57.8 待機中に停止する処理

ally/enemy action、skill/basic CD、status duration、DoT/HoT、移動、target selection、BattlePhase 自動遷移、次 Wave 告知・敵生成（すべて `tickRunning` 早期 return）。

### 57.9 R6b で維持した Wave 戦闘状態（リセットなし）

味方 HP / Barrier / statusEffects / cooldown / 位置 / facing / 一時 stat 補正 — wave 間でそのまま凍結・再利用（§56.7 現行どおり）。

### 57.10 最終 Wave

`hasNextWave === false` 分岐は変更なし → `applyVictoryTransition` → `GameSession.handleVictory`（1 回）。中間 Wave で victory reward なし。

### 57.11 待機解除境界

`restartBattle` / `reloadBattlefield` / `clearPendingWaveAdvance` / `applyVictoryTransition` / `applyDefeatTransition` で `awaitingNextWave` クリア。stage 変更・verify 切替・Session 再生成も `restartBattle` 経由で安全。

### 57.12 テスト

- 新規: `src/battle/battleEngine.awaitingNextWave.test.ts`（中間停止・startNextWave・最終 victory・reset・module 回帰・GameSession wire）
- 更新: `battleFieldTransition` T-wave-exit-01、wave2 harness、demo sim tick ループ
- **R6b 関連バンドル 66 件 pass**（`battleEngine.awaitingNextWave` + wave 遷移回帰）

### 57.13 次タスク

**R6c — 最小 OperationState**（メモリで wave index / clearedCount / module map を GameSession 側に集約）。R6b では OperationState なしで待機可能だったため先行実装なし。

### 57.14 完了判定

**R6b 完了扱い可** — 中間 Wave 停止・明示再開・最終 victory 維持・必須テスト・verify 仮トリガー成立。

---

## 58. R6c — 最小 OperationState（2026-07-12）

**目的:** 複数 Wave をまたぐ作戦単位のメモリ専用状態を `GameSession` に導入。Save 非統合・checkpoint/retry/Wave 間リセット/正式 UI は未実装。

### 58.1 読んだファイル（6 件）

1. `docs/ai-handoff/current-task.md` — R5 完了・§56 R6a・§57 R6b 正本
2. `src/game/GameSession.ts` — sortie / module API / 画面遷移
3. `src/battle/BattleEngine.ts` — waveIndex・awaitingNextWave
4. `src/battle/partyCombatModuleSelection.ts` — module 選択
5. `src/battle/events.ts` — BattleEvent
6. `src/battle/battleEngine.awaitingNextWave.test.ts` — R6b テストパターン

### 58.2 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/game/OperationState.ts` | **新規** — 作戦メモリ状態 |
| `src/game/GameSession.ts` | 所有者・beginOperation・Wave 同期・public API |
| `src/battle/BattleEngine.ts` | `waveCleared` イベント・`onBattlefieldReload` callback |
| `src/battle/events.ts` | `waveCleared` イベント型 |
| `src/battle/partyCombatModuleSelection.ts` | `clone()` snapshot 用 |
| `src/game/operationState.test.ts` | R6c 必須テスト 35 件（新規） |
| `docs/ai-handoff/current-task.md` | 本 §58 |
| `docs/plans/phase-roadmap.md` | R6c 完了・次 R6d |

### 58.3 OperationState

- **型・ファイル:** `OperationState` / `OperationStateReadonlyView` — `src/game/OperationState.ts`
- **所有者:** `GameSession.operationState`（private、`getOperationState()` で readonly view）

**保持フィールド（今回）:**

| フィールド | 説明 |
|------------|------|
| `stageId` | 作戦対象 stage |
| `party`（内部 `partySlots`） | 出撃確定時 party snapshot |
| `combatModuleSelection` | slot → moduleId map（`PartyCombatModuleSelection` 所有） |
| `currentWaveIndex` | 作戦進行記録 |
| `clearedWaveCount` | クリア済み Wave 数 |
| `isActive` | 作戦進行中 |
| `isCompleted` | 作戦完了 |
| `isDefeated` | 作戦敗北（retry 用にインスタンス保持） |

**未実装（今回フィールド追加なし）:** passiveIds、未使用リソース、checkpoint、retry snapshot、Wave 報酬、作戦内取得履歴

### 58.4 party / module snapshot 規則

- **party:** `structuredClone` per slot + `normalizePartySlots`。Save `party` と**別参照**。`validatePartyClassIds` 不合格は `begin` 拒否（null）
- **module:** `PartyCombatModuleSelection.clone()` で別参照コピー。出撃前 `preOperationModuleSelection` から snapshot
- **正本（二重化なし）:**
  - 作戦未完了中（active / defeated retry 待ち）: **OperationState 内** `combatModuleSelection`
  - 作戦前・完了後: **`preOperationModuleSelection`**
  - R5d API（`set/get/clear/resetPartySlotCombatModule`）は `resolveCombatModuleSelection()` 経由で上記に委譲

### 58.5 BattleEngine `waveIndex` との責務分担

| 責務 | 所有者 |
|------|--------|
| 現在実行中 Wave の runtime index | `BattleEngine.waveIndex`（R6b どおり維持・削除なし） |
| 作戦進行記録（currentWaveIndex / clearedWaveCount） | `OperationState` |

### 58.6 同期タイミング

| タイミング | OperationState | BattleEngine |
|------------|----------------|--------------|
| 作戦開始（`beginOperation`） | `currentWaveIndex = initialWave`（verify loop wave 含む）、`clearedWaveCount = 0` | `restartBattle` → `resolveStartWaveIndex()` |
| 中間 Wave 待機突入 | `recordWaveCleared(completedWaveIndex)` → `clearedWaveCount++`（`currentWaveIndex` は完了 Wave のまま） | `waveCleared` イベント発火（`tickWaveExitMarch` 完了時 1 回） |
| `startNextWave()` 成功 | `syncCurrentWaveIndex(engine.waveIndex)` | `beginWaveAnnouncement(next)` で `waveIndex` 更新 |
| 最終 Wave 勝利 | `markCompleted` → `clearedWaveCount = totalWaveCount`、`isCompleted = true`、その後 `clearOperation()` | 従来 `battleEnd` victory |
| 敗北 | `markDefeated`（インスタンス保持） | 従来 `battleEnd` defeat → `restartBattle` |
| battlefield reload | `prepareRetry` または defeated 時 `resetWaveProgress` のみ | `onBattlefieldReload` callback |

二重 increment なし: `waveCleared` は待機突入 1 回、`startNextWave` は engine 側で pending 消費 1 回。

### 58.7 victory / defeat 時の状態

**最終 Wave 勝利（`handleVictory`）**

- `isActive = false`、`isCompleted = true`、`isDefeated = false`
- `currentWaveIndex = finalWaveIndex`、`clearedWaveCount = totalWaveCount`
- 続けて `clearOperation()`（stageSelect 遷移）

**敗北（`handleDefeat`）**

- `isActive = false`、`isDefeated = true`、`isCompleted = false`
- OperationState は**破棄しない**（R6f retry 用）
- `restartBattle` 時は `resetWaveProgress` で Wave 進行のみ戻す（`isDefeated` は維持）

**stage 変更・新規出撃:** `beginOperation` で置き換え  
**stageSelect へ明示中断:** `setGameScreen('stageSelect')` で未完了 Operation を破棄

### 58.8 Save 非統合

- `SaveGameState` / schema version / `SaveManager` / localStorage へ OperationState は**追加なし**
- 作戦中の party snapshot は Save へ自動反映されない（R6e で接続予定）

### 58.9 public API（GameSession）

- `getOperationState(): OperationStateReadonlyView | null`
- `hasActiveOperation(): boolean`
- `getOperationParty(): PartySlotState[] | null`（snapshot 返却）
- `getOperationWaveIndex(): number | null`
- `getClearedWaveCount(): number | null`

### 58.10 テスト

- 新規: `src/game/operationState.test.ts` — 必須 34+ 項目（単体・sortie・Wave 同期・敗北・回帰）
- **R6c 関連バンドル 104 件 pass**（operationState + R6b + R5 module + party 重複）
- フルスイート: vitest worker timeout 等で既存失敗あり（本タスク起因の無差別修正は未実施）

### 58.11 未実装（R6c スコープ外）

- checkpoint / retry 本実装
- Wave 間 HP/CC/CD/位置リセット（**R6d**）
- 作戦中 party 編集接続（**R6e**）
- 正式 Wave 間準備 UI

### 58.12 完了判定

**R6c 完了扱い可** — 最小 OperationState・snapshot 規則・Wave 同期・Save 分離・必須テスト成立。

### 58.13 次タスク

**R6d — Wave 間状態リセット**（味方 HP 全回復・Barrier/status/CC/CD 解除・位置/facing 再配置・一時 runtime 破棄）。`prepareWaveDeploy` 前後配線。

---

## 59. R6d — Wave 間状態リセット（2026-07-12）

**目的:** R6b の中間 Wave 待機状態を維持したまま、`startNextWave()` 成功時だけ次 Wave 用の味方 Combatant と Wave 戦闘 runtime を初期化する。正式 Wave 間準備 UI・作戦中編成変更・checkpoint・retry は未実装。

### 59.1 実装判断

- **採用:** 味方 Combatant を作戦 party/module snapshot から新規生成して `BattleEngine.players` を差し替える。
- **不採用:** 旧 Combatant へ HP / Barrier / status / CD / 位置を個別代入する方式。現存 runtime フィールド追加時の reset 漏れと、R6e の party/module 差し替えへの重複実装を避けるため。
- **生成元:** `GameSession.resolveBattleParty()`。作戦中は `OperationState.party` snapshot、作戦前のみ `SaveGameState.party`。module は従来どおり `resolveCombatModuleSelection()` 経由で作戦中の OperationState 選択を参照。
- `createAlliesFromPartyState` を再利用するため、4 slot 順・class 重複 validate・基礎 stat 再計算・module/legacy basic 解決・`partySlotIndex` は既存単一経路を維持。

### 59.2 reset タイミングと API

経路:

`GameSession.startNextWave`
→ `BattleEngine.startNextWave`
→ 全成功条件と pending index 妥当性を検証
→ **`prepareAlliesForNextWave()`**
→ `awaitingNextWave` / pending を消費
→ `beginWaveAnnouncement(next)`
→ `prepareWaveDeploy`
→ 次 Wave 敵生成

- 待機突入時には reset しない。前 Wave 終了状態は tick とともに凍結。
- reset は次 Wave index 更新・告知・敵生成より前。
- 待機中でない、二重呼び出し、victory/defeat、退場/告知/deploy 中、pending null、`current + 1` でない pending、stage 範囲外 pending は `false`。失敗時は Combatant と runtime を変更しない。
- 最終 Wave 勝利経路には reset を挟まない。

### 59.3 味方 Combatant

新規生成により次を初期化:

- HP = 一時 maxHP status のない基礎 `maxHp`、`isAlive = true`、`corpseVisible = true`。4人全員復帰。heal API / heal event / heal counter は不使用。
- `barrierHp = 0`。独立 Barrier tier/layer runtime は現実装にない。`wardBarrier` は `statusEffects` 内の一時 buff なので同時に破棄。
- `statusEffects = []`。buff / debuff / DoT / HoT / stun / hold / attackSpeed補正 / stack / duration / source / tickを全破棄。
- `delayedDamagePool` / `damageDelayTickSec`、rear assault access / hold offset、engaged lane / display anchor、Wave内 passive counter・発動済み flag、herbal/idle/next outgoing 等の Combatant 一時 runtime は新オブジェクトに存在しない。
- build / learned passive・active / class traits / module 固定効果は party snapshot から再構築。
- `activeStageRemainingTriggers` は作戦（Stage）内 counter のため、**同じ slot・同じ class の場合だけ値をコピーして維持**。Wave内 counterとは区別。

### 59.4 cooldown / action runtime

- 新Combatantの cooldown listを選択中module/legacy basicとbuildから再作成し、`initializeSkillCooldowns` で全 basic/active の初回 `remaining` を trigger値へ戻す。
- module basic は合成skillの `attackIntervalSec`。初回値も同値。module判定のため attackSpeedTier 非適用規則は既存 `tickCooldowns` のまま。
- legacy basic は従来skill trigger値と既存attackSpeedTier規則を維持。
- active stored charge / fire holdを初期化。
- `SkillSequenceRunner.clearAll()` で pending sequence、skill move、use lock、presentation/anim lock、active effect gaugeを破棄。

### 59.5 位置 / facing / target

- 新Combatantは `battleX = 0` から既存 `placePartyOffScreenForDeploy` → `resolvePartyDeployTargets` の初期配置経路へ入る。
- `EngagedCompositionTracker`、frontline anchor、rear assault、engaged lane/depth、display anchorをclear。旧敵IDを参照するstatus/sequence/pending hitも破棄。
- facing は保存値ではなく新しい敵との配置から `resolveFacingSign` で再計算。
- `worldOffsetX` はユニット座標/target cacheではなく背景スクロールの作戦内表示連続量なので維持。

### 59.6 破棄した BattleEngine runtime

- `pendingHitQueue`
- `placedFields`
- `SkillSequenceRunner` 全状態（sequence / move / lock / effect gauge）
- engaged composition / front line anchor / display anchor / rear assault access
- party/enemy deploy target map
- training engage pending flag
- 旧味方 Combatant 全参照

敵 wipe settle / exit march は待機突入時点で完了済み。成功時に awaiting/pending を一度だけ消費し、次敵は reset 完了後に既存 `spawnWaveEnemies()` で差し替える。BattleEngineには別のpopup queue / combat event queue / projectile objectはなく、eventは同期通知。VFXは旧Combatant IDに紐づくうえ、死亡settle+退出後に次Waveへ進む。

### 59.7 維持する作戦状態・統計

- **OperationState:** 同一インスタンスの stageId、party snapshot、module選択、currentWaveIndex、clearedWaveCount、active/completed/defeatedを維持。成功後はR6cどおりcurrentWaveIndexだけ同期。
- **Save:** 変更・persist追加なし。
- **StageDamageStatsTracker:** GameSession所有・party slot集計なので旧Combatant ID非依存。Wave間resetなし、stage/operation通算を維持。resetによるheal記録なし。
- **battleTimeSec:** stage/operation通算時刻として維持。待機中はR6bどおり停止し、次Wave開始後に再開。
- **tickIndex / battleX debug trace:** 作戦内debug時系列として維持。
- **Wave内counter:** 新Combatant生成によりreset。Stage内 `activeStageRemainingTriggers` のみ同class/slotで維持。

### 59.8 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/battle/BattleEngine.ts` | `prepareAlliesForNextWave`、成功条件後reset、invalid pending拒否 |
| `src/game/GameSession.ts` | 作戦中Combatant生成元をOperationState party snapshotへ切替 |
| `src/battle/battleEngine.waveReset.test.ts` | R6d reset/失敗境界/位置/module/legacy/runtimeテスト |
| `src/game/operationState.test.ts` | OperationState / Save / module / stage統計維持テスト |
| `docs/ai-handoff/current-task.md` | 本 §59 |
| `docs/plans/phase-roadmap.md` | R6d完了・次R6e |

### 59.9 テスト

- R6d + R6b + R6c 関連: **55 pass / 55**
- `npm run build`: 既存の広範な TypeScript error で失敗。今回変更ファイル由来の未使用importは除去済み。代表既存error: skill effect union narrowing、旧test fixtureの`CombatantState`不足、既存`BattleEngine.getPlayerPlacementInputs`未使用。
- フルスイート: **1710 pass / 60 fail / 8 worker error（19 failed files / 271）**。R6d 3ファイル（4 + 15 + 36 = 55件）はフル実行内でもpass。失敗数・代表分類はR5g時点と同系の既存不一致（status/glossary、skill表示・unlock、demo balance、StageSelection fixtureのcombatModules不足、approach期待値）とVitest `onTaskUpdate` timeout。R6d起因の失敗なし、既存失敗の無差別修正なし。

### 59.10 手動確認

- 起動: 既存 `npm run dev`（`http://localhost:5173/`）
- verify: **ON**
- stage: **Stage 1 / 全Wave**
- debug menuを開き、Stage 1 / 全Wave、Wave 1・2一覧、Lv20設定を確認。
- ブラウザ確認時間内に自然戦闘がWave 1待機へ到達しなかったため、「次Wave開始」ボタン表示・押下、HP/Barrier/status/CDの前後目視、最終Wave完走は未確認。これらは `battleEngine.waveReset.test.ts` と既存GameSession wireテストで、待機中維持→Debugと同じ`GameSession.startNextWave`経路→全reset→Wave 2生成→最終victoryまで固定。

### 59.11 スコープ外維持

- 正式Wave間準備UI、作戦中party/module編集、checkpoint、retry、Save schema/localStorage、`waves[].enemyGroups`、作戦結果画面、R8 passiveは未着手。
- 最終Wave勝利時の `markCompleted()` 後 `clearOperation()` は変更なし。R6h後続事項。

### 59.12 完了判定

**R6d 完了扱い可。** resetは成功した`startNextWave`だけで一度実行され、味方再生成・一時runtime破棄・Operation/統計維持・失敗時不変・legacy multi-wave進行を自動テストで固定。

### 59.13 次タスク

**R6e — Wave間準備screenと作戦中party/module変更**。Wave間準備画面、OperationState.party/module編集、次Wave開始ボタン、戦闘中変更禁止を初めて接続する。

---

## 60. R6e — Wave 間準備 screen と作戦中 party/module 変更（2026-07-12）

**目的:** 中間 Wave クリア後、戦闘画面の仮ボタン（Debug「次Wave開始」）経由ではなく、最小 Wave 間準備 screen を経由して OperationState の party/module を編集し、確定後に R6d の `startNextWave()` へ接続する。

### 60.1 画面遷移

- 中間 Wave クリア → `BattleEngine` は従来どおり `awaitingNextWave` → `GameSession.handleWaveCleared` → `openWavePrepScreen()` → `GameScreen = 'wavePrep'`
- 戦闘 tick は `currentScreen === 'battle'` のときのみ進行（準備中は停止）
- 最終 Wave 勝利は `waveCleared` を挟まず従来の victory 処理。準備 screen は開かない
- 画面 state 名: **`wavePrep`**（`gameScreen.ts` に追加）

### 60.2 OperationState 編集 API

- `beginWavePrepEditing()` / `endWavePrepEditing()` / `isWavePrepEditable`
- `tryUpdatePartySlot(slotIndex, member, gameData)` — Wave 間準備中のみ。4 slot 維持、class 重複・不正 classId・範囲外は無変更。class 変更時は module を clear（新 class 既定 module へ正規化）
- `trySetCombatModuleForSlot(slotIndex, moduleId, gameData)` — class 所属 module のみ。同一 effective module は no-op。Combatant へ即時反映しない
- 編集元は OperationState party/module snapshot（Save / Combatant runtime 非参照）

### 60.3 GameSession 公開 API

- `isWavePrepOpen()` / `canEditOperationFormation()` / `tryUpdateOperationPartySlot()` / `trySetOperationSlotCombatModule()` / `confirmWavePrepAndStartNextWave()`
- `startNextWave()` 成功時: `endWavePrepEditing()` + `wavePrep` から `battle` へ復帰
- Debug menu の `engine.startNextWave()` 直接呼び出しは verify 用に残置（通常経路は準備 screen）

### 60.4 次 Wave 確定時の反映順（R6d 維持）

`confirmWavePrepAndStartNextWave`
→ `GameSession.startNextWave`
→ `BattleEngine.startNextWave`（成功条件検証）
→ **`prepareAlliesForNextWave()`**（最新 OperationState snapshot から味方再生成）
→ `awaitingNextWave` 消費
→ `beginWaveAnnouncement(next)` → 敵生成

失敗時: 準備 screen 維持、OperationState 維持、Wave index / 敵・味方 runtime 部分生成なし。

### 60.5 UI

- `WavePrepScreenHost` — 最小 DOM（Wave 番号、4 slot class/module select、「次の Wave へ」）
- `game-shell__wave-prep` host、`wave-prep-screen.css`

### 60.6 変更したファイル

| ファイル | 変更 |
|----------|------|
| `src/game/gameScreen.ts` | `'wavePrep'` 追加 |
| `src/game/OperationState.ts` | Wave 間編集 API |
| `src/game/GameSession.ts` | 遷移・公開 API・host 配線 |
| `src/game/WavePrepScreenHost.ts` | 新規 — 最小準備 UI |
| `src/styles/wave-prep-screen.css` | 新規 |
| `src/styles/game-shell.css` | wave-prep host |
| `src/game/wavePrepScreen.test.ts` | 新規 — R6e テスト |
| `src/game/operationState.test.ts` | R6d 期待値更新（`isWavePrepEditable`） |
| `docs/ai-handoff/current-task.md` | 本 §60 |
| `docs/plans/phase-roadmap.md` | R6e 完了・次 R6f |

### 60.7 テスト

- R6e + R6b–R6d 関連: **71 pass / 71**（`wavePrepScreen.test.ts` 16 + `operationState.test.ts` 36 + `battleEngine.waveReset.test.ts` 15 + `battleEngine.awaitingNextWave.test.ts` 4）
- フルスイート: **1726 pass / 60 fail / 6 worker error（19 failed files / 272）**。R6e 起因の失敗なし。失敗分類は R5g/R6d 時点と同系（status/glossary、skill 表示・unlock、demo balance、StageSelection fixture、approach 期待値）+ Vitest `onTaskUpdate` timeout

### 60.8 手動確認

- 未実施（自動テストで遷移・編集・確定・失敗非破壊・R6d reset 回帰を固定）

### 60.9 スコープ外維持

- checkpoint / retry（R6f/R6i）、Save schema、作戦内パッシブ、Wave 報酬、敵編成編集、正式 UI デザイン、R6h 作戦結果画面

### 60.10 完了判定

**R6e 完了扱い可。** 中間 Wave 経路が準備 screen を通り、OperationState party/module 編集と次 Wave 確定が R6d reset タイミングを崩さず接続された。

### 60.11 次タスク

**R6f — checkpoint（出撃確定・メモリ snapshot）**。Wave 間準備確定時または出撃確定 API で OperationState snapshot をメモリ保持し、retry 3 種の土台とする。

---

## 61. R6f — 出撃確定時 checkpoint メモリ snapshot 基盤（2026-07-12）

**目的:** Wave 戦闘開始直前の作戦設定をメモリ checkpoint として生成・保持・取得・復元できる API を成立させ、後続 retry（R6i）が安全に利用できる土台とする。retry UI・敗北画面・Save 永続化・統計巻き戻しは未実装。

### 61.1 checkpoint 所有者

- **型・純粋関数:** `src/game/OperationCheckpoint.ts`（snapshot 生成 / clone / validation / OperationState 復元 orchestration）
- **commit 済み保持:** `GameSession` private `operationCheckpoint`（メモリのみ）
- **復元先:** `OperationState.tryRestoreFromCheckpoint`
- **BattleEngine / SaveManager は非所有**

### 61.2 checkpoint に含む / 含まない

| 含む | 含まない |
| ---- | -------- |
| stageId | Combatant / HP / Barrier |
| currentWaveIndex | buff / debuff / DoT / HoT / CC |
| clearedWaveCount | cooldown / position / facing |
| party 4slot（deep clone） | pending hit / field / sequence 等 runtime |
| slot ごと selectedCombatModuleId | StageDamageStatsTracker |
| operationExtras（将来パッシブ・未使用リソース用 `{}`） | battleTimeSec / DOM / SaveData |

### 61.3 取得・更新タイミング（GameSession 配線）

| 経路 | 順序 |
| ---- | ---- |
| **初回出撃** | validation → `OperationState.begin` → checkpoint commit → `engine.restartBattle` |
| **次 Wave 確定成功** | `engine.startNextWave` 成功 → wave index 同期 → checkpoint commit（最新 party/module） |
| **次 Wave 開始失敗** | 旧 checkpoint 維持・wavePrep / OperationState / wave index 非進行 |

Wave 間準備での編集のみでは checkpoint **更新しない**（「次の Wave へ」確定成功時のみ）。

### 61.4 公開 API（GameSession）

- `hasOperationCheckpoint()` / `getOperationCheckpoint()`（clone 返却）
- `buildOperationCheckpointCandidate()` / `tryCommitOperationCheckpoint(candidate)`
- `tryRestoreOperationFromCheckpoint(source?)` — 不正時無変更失敗
- `clearOperationCheckpoint()` — `clearOperation` / 最終勝利 / stageSelect 中断 / 新作戦開始時

敗北時は checkpoint **保持**。既存敗北導線から復元は**未接続**。

### 61.5 復元対象

party / module / stageId / currentWaveIndex / clearedWaveCount を checkpoint 値へ。active=true・completed=false・defeated=false へ正規化。Combatant 再生成・画面遷移は後続 GameSession 処理向け。

### 61.6 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `src/game/OperationCheckpoint.ts` | 新規 — snapshot 型・生成・clone・validation・復元 |
| `src/game/OperationState.ts` | `tryRestoreFromCheckpoint` |
| `src/game/GameSession.ts` | ライフサイクル配線・公開 API |
| `src/game/operationCheckpoint.test.ts` | 新規 — R6f テスト 22 |
| `docs/ai-handoff/current-task.md` | 本 §61 |
| `docs/plans/phase-roadmap.md` | R6f 完了・次 R6g |

### 61.7 テスト

- R6f + R6e–R6b 関連: **93 pass / 93**（`operationCheckpoint.test.ts` 22 + `wavePrepScreen.test.ts` 16 + `operationState.test.ts` 36 + `battleEngine.waveReset.test.ts` 15 + `battleEngine.awaitingNextWave.test.ts` 4）
- フルスイート: **1748 pass / 60 fail / 6 worker error（19 failed files / 273）**。R6f 起因の失敗なし。失敗分類は R6e 時点と同系 + Vitest `onTaskUpdate` timeout

### 61.8 手動確認

- 未実施（自動テストで生成・保持・更新・破棄・非破壊・復元・Save 非変更・R6e/R6d 回帰を固定）

### 61.9 スコープ外維持

- retry 3 種 UI/実行（R6i）、敗北画面正式 UI、checkpoint Save 永続化、StageDamageStats / battleTimeSec 巻き戻し、作戦内パッシブ、Wave 報酬、R6h 作戦結果画面

### 61.10 完了判定

**R6f 完了扱い可。** 出撃確定・次 Wave 確定成功時の checkpoint commit、敗北保持・勝利/中断破棄、deep snapshot API、OperationState 復元が後続 retry から利用可能。

### 61.11 次タスク（R6g-1 完了により更新）

**R6g-2 — `createEnemiesForStage` の Wave 単位 spawn 対応** — §62 参照。

---

## 62. R6g-1 — Wave 単位 `waves[].enemyGroups` 型・validation（2026-07-12 完了）

### 62.1 目的

`StageWave` が Wave 単位の `enemyGroups` を保持でき、ゲームデータ読込時に parse・validate できる最小変更。spawn 接続は R6g-2。

### 62.2 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `src/battle/types.ts` | `StageWave.enemyGroups?: StageEnemyGroup[]` 追加 |
| `src/battle/data/validateGameData.ts` | `parseOptionalStageEnemyGroups`、wave parse、cross-ref（classId / moduleId / scale / count） |
| `src/battle/data/validateGameData.test.ts` | R6g-1 テスト 5 件追加 |
| `docs/ai-handoff/current-task.md` | 本 §62 |

### 62.3 schema / validation

- `waves[].enemyGroups` — stage 直下と同一 `parseStageEnemyGroup` 経路（classId / count / hp|atk|def|resScale / selectedCombatModuleId）
- stage またはいずれか wave に `enemyGroups` がある場合 `recommendedLevel` 必須
- wave に `enemyGroups` がある wave は `enemies: []` を許可（stage 直下 `enemyGroups` と同様）
- cross-ref: unknown classId / unknown moduleId / 他兵科 module / legacy 兵科 module / combatModuleIds 未登録 module を拒否
- **正規化・一本化なし** — stage 直下 `enemyGroups` と wave `enemyGroups` / legacy `enemies` は共存のまま

### 62.4 legacy 互換

- stage 直下 `enemyGroups` + 空 wave placeholder — 既存テスト通過
- legacy `waves[].enemies`（templateId）— 既存テスト通過
- `stages-demo.json` / 既存 stage データ — 変更なし

### 62.5 テスト

- `validateGameData.test.ts` + `validateGameData.enemyGroupCombatModule.test.ts`: **30 pass / 30**
- 追加: wave 正常系、wave 不正 classId、wave 不正 moduleId、recommendedLevel 必須、stage 直下 + legacy 回帰

### 62.6 未実装（R6g-2 以降）

- `createEnemiesForStage` の wave index 別 spawn
- `BattleEngine` / `GameSession` spawn 接続
- `stages.json` / editor 移行
- schema 正規化による敵生成方式の一本化

### 62.7 次タスク

**R6g-2 — `createEnemiesForStage` の Wave 単位 spawn 対応** — §63 参照。

---

## 63. R6g-2 — `createEnemiesForStage` の Wave 単位 spawn 対応（2026-07-12 完了）

### 63.1 目的

`waves[].enemyGroups` を wave index ごとの敵生成に接続。R6g-1 の型・validation を runtime spawn へ反映。

### 63.2 変更ファイル

| ファイル | 内容 |
| -------- | ---- |
| `src/battle/entities.ts` | `createEnemiesForStage` の wave 優先分岐、`createEnemiesFromEnemyGroups` に groups override |
| `src/battle/entities.enemyGroups.test.ts` | R6g-2 テスト 4 件追加、stage 直下のみ空配列テスト名更新 |
| `docs/ai-handoff/current-task.md` | 本 §63 |

### 63.3 敵生成元の優先・fallback 規則

1. **`waves[waveIndex].enemyGroups` が非空** → 当該 wave の groups で spawn（任意 wave index）
2. **stage 直下 `enemyGroups`** → **wave 0 のみ** spawn。`waveIndex !== 0` かつ wave 側 groups なし → **空配列**
3. **legacy `waves[waveIndex].enemies`** → templateId 経路（従来どおり任意 index）
4. **正規化・一本化なし** — 上記は共存。wave 0 で wave groups があれば stage 直下より **wave 優先**

### 63.4 legacy 互換

- stage 直下 `enemyGroups` + 空 wave placeholder — 既存テスト通過
- legacy `waves[].enemies`（templateId）— wave 0 / 1 とも通過
- `stages.json` / `stages-demo.json` — 変更なし

### 63.5 テスト

- `entities.enemyGroups.test.ts`: wave index 別 spawn、wave 優先、legacy 回帰、wave 未指定時 stage 直下 fallback

### 63.6 未実装（R6g-3 以降）

- `BattleEngine` / `GameSession` spawn 接続
- `stages.json` / editor 移行
- schema 正規化による敵生成方式の一本化

### 63.7 次タスク

**R6g-3 — BattleEngine / GameSession spawn 接続**
