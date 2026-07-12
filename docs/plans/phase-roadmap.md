# フェーズロードマップ

Hensei Only の開発フェーズ一覧。**2026-07-12 方針転換以降、本書の正本は R0〜R10** とする。ゲームルールの現行 spec は [spec](../spec/README.md) を参照するが、**旧仕様と新方針の差分は R1 以降の設計 Phase で順次 spec へ反映する**（本書では方針のみ記載）。

**直近目標:** プレースホルダー素材で**反復可能な新ゲームループ**を成立させる。正式画像・VFX・効果音・i18n・packaging・itch.io 公開は、新しい試作が成立した**後**に再開する。

**現在地:** **R5〜R8 Backend 完了**、**R9a 完了**、**R9.5a Backend 完了**。**公式次タスク: R9.5b**（味方 HUD 攻撃間隔表示・legacy gauge 除去）。詳細は [current-task.md §83](../ai-handoff/current-task.md#83-r95a-完了--module-兵科の-legacy-active-runtime-停止)。

---

## フェーズ完了の二層判定

各 R フェーズの完了条件は **Backend 完了** と **Player 完了** の二層で書く。詳細・例は [planning-rules.md §2](../ai-handoff/planning-rules.md#2-フェーズ完了条件の二層) を正本とする。

| 層 | 定義 |
| -- | ---- |
| **Backend 完了** | API、型、validate、engine、統合テストの縦切りが成立している |
| **Player 完了** | プレイヤーがゲーム画面上で新仕様を確認・利用できる |

Backend 完了だけの場合は「縦切り成立」「Backend 完了」と記録し、**「Phase 完了」とは書かない**。legacy 共存は移行中の実装手段として許容するが、新仕様の Player 完了条件には使用しない。「後で対応」「スコープ外」とする項目には、戻し先 Phase ID・Player 完了条件・触るファイル候補を併記する。

---

## 概要（R0〜R10）

| Phase | ゴール | Backend | Player | 状態 |
| ----- | ------ | ------- | ------ | ---- |
| **R0** | 方針転換の正本化 — 旧 M1 路線凍結、維持・廃止・再設計・保留の整理、legacy 扱い、新実装順の確定 | 完了 | 設計 Phase として完了 | **完了** |
| **R1** | 上位戦闘設計 — 戦闘方式、兵科責務、旧 active / gauge / level 廃止、Wave 方式選択、作戦内パッシブ方針 | 完了 | 設計 Phase として完了 | **完了** |
| **R2** | 詳細戦闘・兵科仕様 — 攻撃間隔、Attack / Hit、方式効果形状、各兵科 2 方式 | 完了 | 設計 Phase として完了 | **完了** |
| **R3** | Wave 作戦ループ — 初期準備 → Wave 戦闘 → Wave 間準備 → 次 Wave → 最終結果 | 完了 | 設計 Phase として完了 | **完了** |
| **R4** | データスキーマとエディタ設計 — class / combat module / passive / enemy group / stage-wave / operation state / validate / editor API / legacy 移行（**設計のみ**） | 完了 | 設計 Phase として完了 | **完了** |
| **R5** | 戦闘方式 runtime 縦切り — 少数兵科・各 2 方式・敵方式指定・同一兵科禁止・module 通常行動 | **完了** | **未達**（R9.5a〜c で解消） | **Backend 完了** |
| **R6** | 複数 Wave・OperationState — Wave 間準備、checkpoint、retry、複数 Wave spawn | **完了** | R9.5 / R10 で画面導線を確認 | **Backend 完了** |
| **R7** | 反復プレイ — 倍速、Wave 再生 / 再試行、作戦最初からの再試行 | **完了** | R10 で再挑戦性を確認 | **Backend 完了** |
| **R8** | 作戦内パッシブ — 取得・保持・効果縦切り、戦闘中表示、範囲プレースホルダ | **完了** | R10 で判断差を確認 | **Backend 完了** |
| **R9a** | authoring 骨格 — エディタ現状調査・タスク分割 | 完了 | 開発者向け確認済み | **完了** |
| **R9.5** | R5 Player completion / R10 preparation — legacy active 停止、HUD 攻撃間隔、出撃前方式選択 | **R9.5a Backend 完了** | 未着手 | **公式次: R9.5b** |
| **R9b〜f** | 新仕様 authoring 完成 — Stage / Wave / 敵方式 / 作戦内パッシブ / validate / closure | R9b 以降未着手 | R10 用作戦反映は未確認 | 未着手 |
| **R10** | 新仕様 2 Wave 以上の試作と反復評価 — 「繰り返し遊びたいか」を判断 | 未着手 | 未着手 | R9.5・R9 待ち |

**試作成立後（R10 以降・順序未固定）:** 兵科拡張、診断基盤再構築、**戦場移動 legacy cleanup**（[battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)）、正式コンテンツ、UI 仕上げ、画像、**正式 VFX**（範囲パッシブの演出制作含む — R8 ではプレースホルダ図形のみ）、効果音、i18n、packaging、公開準備。

---

## 開発目標と凍結した旧方針

### 新しい開発目標

- 旧 **M1 体験版公開中心**のロードマップ（旧 Phase 6〜9 / Release M1）を**凍結**する。
- 既存 **7 体験版ステージ**（`data/stages-demo.json` の `demo_ch1_01`〜`07`）および **`data/stages.json` の legacy 5 件**は、新仕様へそのまま移行せず **legacy / reference** 扱いとする。
- 既存の**診断基盤**（例: [balance-diagnostics.md](../dev/balance-diagnostics.md)）は、再利用できる仕組みだけ残し、新仕様向けに**後から再構築**する。

### 凍結した旧 Release / Phase 路線

| 凍結対象 | 内容 |
| -------- | ---- |
| **Release M1** | itch.io 体験版公開、Lv1 キャップ、8 クラス、Phase 7 導線完成 → Phase 4e → Phase 8 → Phase 9 |
| **Release M2** | 初版 Chapter 1 本編、13 クラス、Phase 10 |
| **旧 Phase 6〜9 以降の優先順** | 6c バランス、7 残タスク（トップ / リザルト / 体験版終了）、presentation、packaging |
| **旧 Phase 10〜14** | 本編拡張、印術師・法陣師、ローグ、解法評価メタ — **新試作成立まで着手しない** |

旧 Phase 1〜4 の**実装済みコード資産**（戦闘コア、JSON 駆動、編成 UI 等）は残るが、**今後の設計・実装順の正本ではない**。

---

## 廃止・再設計・保留（R0 で整理）

### 旧スキル・成長仕様（廃止方向）

次は新仕様では採用しない。現行 spec / 実装との差分は R1〜R2 で doc に反映する。

- active スキル最大 4 枠
- passive スキル最大 4 枠
- 戦闘スキルゲージ
- 習得済み active の自動発動
- Lv0 / Lv10 / Lv20 によるスキル解放
- レベルによるステータス成長
- EXP
- スキル装備枠
- [skill-finalization-table.md](./skill-finalization-table.md) を**今後の実装計画の正本**にすること

**[skill-finalization-table.md](./skill-finalization-table.md)** は正本から外し、**旧クラス役割・旧スキル案を参照する legacy 資料**としてのみ扱う。

### 戦闘方式（新設計の核）

- 各**兵科**は Wave ごとに **2 つの「戦闘方式」**から 1 つを選択する。
- プレイヤー向け UI 表記は **「戦闘方式」**。内部実装では **`module` 系名称**を候補とする。
- **「単体方式 / 複数方式」**を全兵科共通の分類にはしない。各兵科がそれぞれ異なる 2 種類の攻撃・回復・防護方法を持つ。
- 戦闘方式は、射程、停止位置、移動方法、対象数、Hit 構造、効果範囲、攻撃・回復・防護内容などを変更できる設計候補とする。
- **個別兵科の具体的な戦闘方式は R0 では未確定**（R2 で詳細化）。
- **優先ターゲット**は当面兵科ごとに固定し、戦闘方式では変更しない。
- **ダメージ属性・基本ロール**は原則兵科側に固定する。

### 編成

- 味方は **4 人編成**を維持する。
- **同一兵科を味方編成に複数入れることは当面禁止**（Wave 間再編成でも同制約）。
- 敵側は同一兵科を複数配置できる。

### 攻撃間隔と Hit

- 現在の「遅い〜早い」の**攻撃速度 Tier 表現を廃止**する。
- 通常攻撃の周期を、秒単位の **「攻撃間隔」**として扱う（UI: `攻撃間隔: X秒`）。
- **攻撃間隔**は兵科側の基礎値。**Hit 数・Hit 係数・対象数・攻撃形状**は戦闘方式側の責務。
- 兵科本体に固定 Hit 構造を持たせる前提にはしない。**Attack と Hit は別概念**として R2 以降の spec で整理する。

### 魔術師

- **RES 無視は廃止方向**。
- 複雑な耐性無視・追加補正を持たせず、**単純な魔法攻撃兵科**として再設計。
- 種火・熾火の扱いや具体戦闘方式は **R2 以降**で判断（R0 未確定）。

### 作戦内パッシブ

- 作戦中に**リソース**を使用してパッシブを取得する。
- プレイヤーが**兵科と取得パッシブを直接指定**する（ランダム 3 択報酬にしない）。
- 取得パッシブは作戦中維持し、**作戦終了時にリセット**。
- 取得上限・必要コスト・兵科ごとの候補数などは**未確定**。

### 移動系メカニクス（保留）

戦場横幅拡大により、移動阻害・移動速度差・ノックバック・特殊移動・射程差が有効になる**可能性**はあるが、**現段階では実装対象にしない**。最小縦切り（R5）の必須仕様にも含めない。

- 鉄衛士の周囲移動速度低下など、具体的な移動系効果は**未確定アイデア**。
- **R8（作戦内パッシブ）設計時に再検討**する保留事項として記録する。
- 現段階では通常移動・ターゲット挙動を複雑化させない。

### Wave 作戦ループ

```
初期準備 → Wave 戦闘 → Wave 間準備 → 次 Wave → … → 最終結果
```

**Wave 間準備**（将来）で扱う候補: 次 Wave 敵情報確認、編成変更、戦闘方式変更、作戦内パッシブ取得、出撃確定。

現行実装の**自動 Wave 遷移**には Wave 間準備が存在しないため、**新しいゲーム状態または上位進行状態**が必要（R3 / R6）。

### リトライ・速度変更（後続実装候補 — R7）

具体仕様は未確定。ロードマップに含める候補:

- 戦闘速度 1 倍 / 2 倍 / 4 倍
- 同じ設定で現在 Wave を再生
- 現在 Wave を準備段階からやり直す
- ステージ（作戦）を最初からやり直す
- 確認ダイアログを挟まない

### 作戦途中セーブ

- **最初の縦切り（R5）では作戦途中セーブを実装しない**。
- 作戦中の取得パッシブ・リソース・クリア済み Wave 等は**メモリ上**で保持する前提。
- 中断復帰は**試作成立後**に再検討。

### エディタ（新仕様への改修対象 — 実装は R9）

設計対象（R4 完了）: [combat-data-schema-refactor.md](combat-data-schema-refactor.md) — クラス、戦闘方式、作戦内パッシブ、敵グループ、Stage / Wave、validate、normalize、editor API、テキスト整形、legacy 移行方針。

対象エディタ: クラスエディタ、スキル / **戦闘方式**エディタ、敵エディタ、ステージ / Wave エディタ。

---

## R0 — 方針転換の正本化（完了）

**ゴール:** 旧 M1 公開ロードマップの凍結、維持・廃止・再設計・保留の整理、legacy 文書・legacy ステージの扱い、新実装順（R1〜R10）の確定。

| 項目 | 結果 |
| ---- | ---- |
| 旧 M1 / Phase 6〜9 路線 | 凍結 |
| 新ロードマップ | R0〜R10 を本書に正本化 |
| legacy ステージ | `stages-demo.json`（7 件）、`stages.json` legacy 5 件 — reference のみ |
| legacy 文書 | [skill-finalization-table.md](./skill-finalization-table.md) — 旧スキル案参照用。実装計画の正本から除外 |
| 診断基盤 | 再利用可能部分のみ温存。新仕様向け再構築は試作成立後 |
| spec / code | **R0 では未変更**（R1 以降で doc → 実装の順） |

---

## R1 — 上位戦闘設計

**対象 doc 候補:** [combat-architecture.md](../combat-architecture.md)、[system-mechanics.md](../system-mechanics.md)、[class-philosophy.md](../class-philosophy.md)

**内容:**

- 戦闘方式の定義（UI「戦闘方式」/ 内部 `module` 候補）
- 兵科本体と戦闘方式の責務分離
- active / gauge / level 成長の廃止方針の doc 反映
- Wave ごとの方式選択
- 作戦内パッシブの上位方針
- 優先ターゲット固定方針
- 同一兵科禁止（味方）の上位ルール

**着手物:** 上記 doc の更新（**spec 本文の詳細数値は R2 へ**）。

---

## R2 — 詳細戦闘・兵科仕様

**対象 doc 候補:** [combat.md](../spec/combat.md)、[stats.md](../spec/stats.md)、[classes-and-skills.md](../spec/classes-and-skills.md)

**内容:**

- 攻撃間隔（秒単位）、Attack / Hit の分離
- 戦闘方式の効果範囲（射程、停止位置、Hit 構造、範囲形式・適用方式等）
- Wave 間の状態リセット
- DoT、一時バフ / デバフ整理
- 各兵科の 2 方式（**兵科・数値はこの Phase で初めて具体化。R0 では未確定**）
- 作戦内パッシブ候補の列挙

**保留:** 移動阻害・移動速度差・ノックバック等の移動系パッシブ — 必須仕様にせず、R8 再検討候補として doc に明記。

---

## R3 — Wave 作戦ループ（完了）

**対象 doc:** [operation-loop.md](../spec/operation-loop.md)（新規）、[battle-field.md](../spec/battle-field.md)、[progression.md](../spec/progression.md)

**確定内容:**

- 作戦状態 / 戦闘状態の分離、混在禁止原則
- 上位ループ: 初期準備 → Wave 戦闘 → Wave 終了 → Wave 間準備 → … → 作戦結果
- Wave 間 HP **全回復**（各 Wave を独立編成問題として扱う）
- 戦闘方式は次 Wave へ **保持**（準備画面で変更可）
- Wave 開始チェックポイント（出撃確定時点）
- 3 種リトライ（同設定再戦 / 準備へ戻る / 作戦最初から）— R7 実装接続
- 作戦途中セーブ **なし**
- 旧線形 stage progression を legacy 化
- legacy BattlePhase 自動 Wave 遷移を battle-field に分離記載

**production code / JSON / test / editor:** 未変更。

---

## R4 — データスキーマとエディタ設計（完了）

**対象 doc:** [combat-data-schema-refactor.md](combat-data-schema-refactor.md)（新規）

**ゴール:** 新データ形状とエディタ責務を **設計で先に固定** する。**R4 では設計のみ** — production 実装・全面エディタ実装には進まない。実装は **R5**（最小縦切り）〜 **R9**（エディタ）。

**確定内容（要約）:**

- 兵科 / 戦闘方式 / 作戦内パッシブ / 敵グループ / Stage-Wave / 作戦状態 / Wave 戦闘状態の **責務分離**
- 味方同一兵科禁止、敵は `count` 複数可。敵 scale はグループ側
- 新 Stage 正本: `waves[].enemyGroups`。直下 `enemyGroups` は legacy 省略記法
- 作戦状態はメモリのみ（R5）。checkpoint は作戦復元用、BattleEngine 完全コピーではない
- validate 層（マスタ / Stage / 編成 / 作戦状態）、normalize / migration 方針（新規少数データ作成を推奨）
- エディタ責務分離。SkillEditorStep → CombatModuleEditor 改修を **推奨案**
- R5 最小 schema の必須 / 後回し一覧

**production code / JSON / test / editor:** 未変更。

---

## R5 — 戦闘方式 runtime 縦切り

**ゴール:** **少数兵科**だけで、新戦闘方式による戦闘を Backend 縦切りとして成立させる。

### Backend 完了（R5b〜g 成立済み）

- 戦闘方式の最小型・データ・validate
- module から通常行動定義への接続
- R5 対象 4 兵科それぞれの 2 方式
- 味方・敵の方式選択
- 味方同一兵科禁止
- module 通常行動の engine 接続

したがって R5 は **Backend 完了** として維持する。R5 単独を「Phase 完了」とは記載しない。

### Player 未達（R9.5 へ割当）

R5 実装時点では未達であり、**R9.5a〜c** で解消する。

| 項目 | 戻し先 |
| ---- | ------ |
| module 兵科で legacy active を発動させない | **R9.5a** |
| module 兵科の味方 HUD から legacy 2×2 gauge を除去する | **R9.5b** |
| 味方 HUD に攻撃間隔を表示する | **R9.5b** |
| 出撃前編成で戦闘方式を選択する | **R9.5c** |

`learnedActiveIds=[]` のテスト fixture だけでは Player 完了にならない。

**スコープ外（R5 に含めない）:** 移動阻害、作戦内パッシブ、全面エディタ改修、legacy 全面移行、Wave 間準備 UI、作戦途中セーブ、倍速・リトライ、Wave 報酬、Save 統合。

### R5 サブフェーズ（R5a 調査で確定 — すべて Backend 完了）

| サブ | 内容 | 状態 |
| ---- | ---- | ---- |
| **R5a** | 現行実装調査・最小実装計画 | **完了** — [current-task.md §47](../ai-handoff/current-task.md#47-r5a--現行実装調査と最小実装計画2026-07-12) |
| **R5b** | 最小型 + 新データ + 新 validate | **完了** — §48 |
| **R5c** | 通常行動実行（module → SkillExecutor） | **完了** — §49 |
| **R5d** | 味方方式選択（Save 非統合） | **完了** — §51 |
| **R5e** | 敵 group module 指定 | **完了** — §52 |
| **R5f** | 編成制限（味方 classId 重複禁止） | **完了** — §53 |
| **R5g** | 統合テスト（4 兵科 × 2 方式・1 Wave） | **完了** — §54 |

---

## R6 — Wave 間準備

- 自動 Wave 進行の停止
- **WavePreparation**（仮称）状態
- 編成変更、戦闘方式変更
- Wave 開始、Wave 状態リセット
- チェックポイント（再試行の前提）

**R6a 調査完了（2026-07-12）:** [current-task.md §56](../ai-handoff/current-task.md#56-r6a--wave-遷移状態寿命の調査2026-07-12)。現行は味方 Combatant を wave 間再利用・自動 `tickWaveExitMarch` → `beginWaveAnnouncement`。停止の最小挿入点は `tickWaveExitMarch` 完了直前。

### R6 実装分割（依存順・handoff §56.11）

| ID | 内容 | 手動確認 |
|----|------|----------|
| **R6b** | Wave 終了停止 + 仮次 Wave 開始 API | **完了（§57）** — Wave1 クリア後停止、Debug「次Wave開始」 |
| **R6c** | OperationState 最小型（メモリ・wave index / clearedCount / module） | **完了（§58）** |
| **R6d** | Wave 状態リセット（HP/CC/CD/runtime）+ 次 Wave 敵生成 | **完了（§59）** — 次 Wave で味方再生成・全回復 |
| **R6e** | Wave 間準備 screen（formation 流用・編成/module gate） | **完了（§60）** — Wave 間のみ編成変更可 |
| **R6f** | checkpoint（出撃確定・メモリ snapshot） | **完了（§61）** — 出撃/次 Wave 確定時 deep snapshot |
| **R6g** | 複数 Wave `waves[].enemyGroups` spawn（schema 候補） | legacy multi-wave で先行可 |
| **R6h** | 最終 Wave → 作戦結果（`operationResult` 仮） | 最終 wave のみ結果画面 |
| **R6i** | retry 3 種（最小経路） | **完了（§67）** — GameSession retry API + debug 配線 |
| **R6j** | 統合テスト（2 wave + stop/resume） | **完了（§68）** — legacy stage `1` 縦切り自動テスト |

**次タスク:** **R7** — 反復プレイ（完了）

---

## R7 — 反復プレイ

- 倍速（1 / 2 / 4 倍）
- 現在 Wave 再生（= 同設定再戦 / R6i checkpoint）
- Wave 準備からの再試行
- 作戦最初からの再試行
- 確認ダイアログなし（方針 — [operation-loop.md §9](../spec/operation-loop.md#9-リトライ導線r7-接続)）

**R7a 調査完了（2026-07-12）:** [current-task.md §69](../ai-handoff/current-task.md#69-r7a--反復プレイ調査タスク分割2026-07-12-完了)。**R7b 完了（2026-07-12）:** [current-task.md §70](../ai-handoff/current-task.md#70-r7b--倍速-simulation2026-07-12-完了) — `GameSession` tick gate で 1/2/4 倍 + **最小 UI**（Pause 右隣 Speed ボタン。2026-07-13 追補）。**R7c 完了（2026-07-12）:** [current-task.md §71](../ai-handoff/current-task.md#71-r7c--敗北時-retry-正式導線2026-07-12-完了) — verify OFF 敗北で retry 3 種 UI・legacy auto-restart 廃止。**R7d 完了（2026-07-12）:** [current-task.md §72](../ai-handoff/current-task.md#72-r7d--wave-準備-retry--spec-整合2026-07-12-完了) — `wavePrep` から retry 3 種・formation suspend 往復。**R7e 完了（2026-07-12）:** [current-task.md §73](../ai-handoff/current-task.md#73-r7e--作戦結果後再戦--遷移統一2026-07-12-完了) — verify OFF 最終勝利で作戦結果 UI・rematch / stageSelect 導線。

### R7 実装分割（依存順・handoff §69.7）

| ID | 内容 | 手動確認 |
| ---- | ---- | -------- |
| **R7a** | 調査・4 タスク分割 | **完了（§69）** |
| **R7b** | 倍速 1 / 2 / 4 倍（`GameSession.tick` multiplier + 最小 UI） | **完了（§70）** — API + 最小 Speed ボタン + tick / wire テスト |
| **R7c** | 敗北時 retry 正式導線（release 含む・legacy defeat 置換） | **完了（§71）** — verify OFF 敗北で retry 3 種 |
| **R7d** | Wave 準備 retry + 「準備へ戻る」spec 整合（`wavePrep`） | **完了（§72）** — wavePrep retry 3 種・formation suspend |
| **R7e** | 作戦結果後再戦 + verify/release 勝利導線統一 | **完了（§73）** — `operationResult` → rematch / stageSelect |

**次タスク:** **R8** — 作戦内パッシブ（runtime 適用・戦闘中表示）。

---

## R8 — 作戦内パッシブ

**ゴール:** 作戦中に取得・維持するパッシブの **runtime 適用** と、戦況判断に必要な **戦闘中の視認性** を成立させる。

### コア機能

- 作戦内リソース
- 任意パッシブ取得（兵科 + パッシブ直接指定）
- 取得状態の作戦中保持
- Wave 再試行時の巻き戻し
- 敵側パッシブ設定
- **移動阻害等の保留アイデアをこの Phase で改めて検討**

### 戦闘中表示（R8 確定 — doc 反映済）

正本: [combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針)、[battle-field.md §範囲系・オーラ系効果のフィールド表示](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針)。

**方針の要点（active 廃止による自動削減には依存しない）:**

| 効果種別 | HUD 状態アイコン | 備考 |
| -------- | ---------------- | ---- |
| 常時ステータス補正（作戦中ずっと有効） | **原則非表示** | 効果種別で表示対象を整理 |
| 条件付き発動（HP 閾値等、発動中かどうかが戦況判断に必要） | **発動中のみ表示** | |
| DoT / CC / 一時デバフ（残時間・解除確認が必要） | **従来どおり表示** | |
| Barrier（`barrierHp`） | **非表示** | HP バー上の残量表示が正本 |
| 範囲系・オーラ系 | **非表示**（対象全員へ同一アイコンを付けない） | フィールド上の範囲表示を基本とする |

### 範囲系パッシブ — runtime 判定とプレースホルダ範囲描画（R8 スコープ）

- 周囲の味方・敵など、一定範囲内の対象へ影響するパッシブは **runtime 判定 + プレースホルダ範囲描画** を R8 に含める
- **範囲内判定と表示範囲は同一の実行時データ** を参照し、別々の数値を持たせない
- 発生源死亡・無効化・範囲外移動時に **表示と効果が同期** して切り替わること
- 正式 VFX・演出素材の制作は **試作成立後の presentation / VFX フェーズ** へ送る
- R8 では **正式素材を待たず**、1 次元戦闘軸上の **帯・区間・境界線・起点マーカー** 等、判定と一致するプレースホルダを **必須** とする（2 次元 shape — 円・扇形・矩形 — は使わない）
- 正式 VFX 導入後も、位置依存効果であることが分かる **最低限の範囲表現** は残す方向

**1 次元効果範囲の用語・大カテゴリ統合・legacy 移行方針:** [combat-data-schema-refactor.md §5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。範囲形式（単体 / 地点 N / 範囲 N / 周囲 N / 前方 N）と適用方式（即時 / 進行 / 持続 / 乱打）のプレースホルダ要件は [battle-field.md §9](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針) を正本とする。

**プレースホルダで最低限確認可能にすること:**

- 表示範囲と内部判定の一致
- 範囲内外の切り替え
- 発生源消滅時の解除
- 味方由来と敵由来の識別
- 複数範囲の重なり

**採用しない確定仕様:** 既存 status system へ範囲内対象全員を一時 status として付与する方式。**runtime 実装の詳細**（aura 解決の所有クラス、tick 更新タイミング等）は R8 実装前に判断する。

### R8 完了条件

- 常時パッシブが状態アイコンを無駄に占有しない
- 条件付き発動効果は **発動中のみ** 確認できる
- Barrier は **HP バー表示のみ**（状態アイコンなし）
- 範囲パッシブは **プレースホルダ区間表示** で判定範囲を確認できる
- **表示範囲と実際の効果対象が一致する** テストまたは診断手段がある

### R8 実装分割（R8a 調査 — 2026-07-12）

**調査:** [current-task.md §74](../ai-handoff/current-task.md#74-r8a--作戦内パッシブ既存基盤調査タスク分割2026-07-12-完了)。production code 未変更。

| ID | 内容 | 手動確認 |
| -- | ---- | -------- |
| **R8a** | 既存基盤調査・5 タスク分割 | — **完了** |
| **R8b** | `OperationState` + checkpoint — slot 別取得パッシブ・`unspentResource` の snapshot / restore / retry 整合 | — **完了** |
| **R8c** | Wave 間準備 UI — passive 直接選択 + 固定コスト取得（module 選択と共存） | — **完了** |
| **R8d** | 戦闘開始注入 — operation passive → `learnedPassiveIds` マージ。**最小縦切り:** `df_guardian` + `df_guardian_passive_2` | — **完了** |
| **R8e** | 戦闘中表示 — 常時 stat 非表示・条件付きのみアイコン・HUD read-only 一覧 | — **完了** |
| **R8f** | 範囲系 runtime 判定 + 1 次元プレースホルダ描画 | — **完了** |

**次タスク:** **R9.5** — R5 Player completion / R10 preparation（公式次: **R9.5a**）。

**R8 スコープ外:** 移動阻害・ノックバック・特殊移動・射程差 passive、Lv / EXP 連動、M1 レベル機能、敵側パッシブ（縦切り後）、エディタ（R9）。

### 後続 VFX フェーズへ送るもの

- 範囲パッシブの **正式演出素材**（粒子・テクスチャ・アニメーション等）
- プレースホルダ区間表示の **ビジュアル仕上げ**（色・線種・識別の polish）
- 範囲内外切り替え時の **リッチなフィードバック**（最低限の範囲輪郭は R8 完了後も維持する方針）

---

---

## R9.5 — R5 Player completion / R10 preparation

**目的:** R5〜R8 で成立した Backend 縦切りを、プレイヤーが新仕様だけで利用できる状態へ接続する。R9（authoring）の代替ではない。

**推奨順序:** **R9.5a → R9.5b → R9.5c → R9b〜f → R10**。R9.5a と R9b は担当ファイルの衝突が少なければ技術的並行可だが、**公式進捗上は R9.5 を優先**する。

| ID | 内容 | Backend 完了条件 | Player 完了条件 | 依存 |
| -- | ---- | ---------------- | --------------- | ---- |
| **R9.5a** | module 兵科の legacy active runtime 停止 | **完了** — 4 兵科で legacy active cooldown を生成せず、`runUnitSkills` から発動しない | 4 兵科を戦闘へ出しても legacy active が一度も発動しない | R5 |
| **R9.5b** | 味方 HUD 攻撃間隔表示 | module 兵科用 HUD が legacy recast に依存せず、runtime と同じ攻撃間隔を表示 | 4 兵科に legacy 2×2 gauge がなく、攻撃間隔を読める | R9.5a |
| **R9.5c** | 出撃前戦闘方式選択 | `SkillMenuPanel` の選択を出撃時 `OperationState` へ確定し、Wave1 生成へ反映 | 出撃前に方式を確認・変更でき、選んだ方式で Wave1 を開始できる | R9.5a、R6 |

**対象兵科（`R5_COMBAT_MODULE_CLASS_IDS`）:** `df_guardian`、`at_swordsman`、`at_sorcerer`、`sp_cleric`。別一覧を重複定義しない。

### R9.5 完了条件（Player）

対象 4 兵科を含む編成で、出撃前方式選択 → Wave1 → WavePrep で方式変更 → Wave2 を通して以下を確認できること。

1. legacy active が発動しない
2. legacy 2×2 gauge が表示されない
3. 攻撃間隔が表示される
4. 出撃前と Wave 間の方式選択が各 Wave へ反映される

Backend テスト pass だけでは R9.5 完了としない。handoff 正本: [current-task.md §82](../ai-handoff/current-task.md#82-r95a--module兵科のlegacy-active-runtime停止次の再開タスク)。

**R9.5 スコープ外:** module 未対応兵科の legacy active 廃止、legacy passive 全面撤去、敵 HUD への同等表示、`stages-demo.json` 移行、i18n / VFX polish。

---

## R9 — 新仕様 authoring

R9 は新仕様の Stage、Wave、敵方式、作戦内パッシブをエディタで作成する Phase である。**Player 向け legacy 除去の代替ではない。** R9.5 未完了の場合、R9 完了後も R10 へ進めない。

**R9a 調査完了（2026-07-13）:** [current-task.md §80](../ai-handoff/current-task.md#80-r9a--エディタ現状調査r9-分割2026-07-13-完了)。

### R9 実装分割（依存順）

| ID | 内容 | 手動 / 自動確認 |
| -- | ---- | --------------- |
| **R9a** | エディタ骨格・現状調査 | **完了（§80）** |
| **R9b** | Stage / Wave `enemyGroups[].selectedCombatModuleId` authoring | `StageEnemyEditorStep.test.ts` / stage save validate |
| **R9c** | 複数 Wave・`enemyGroups` 構造 authoring | 2 Wave 作成・保存・runtime 読込 |
| **R9d** | 作戦内パッシブ候補・付与条件 authoring | 作成データが WavePrep に出る |
| **R9e** | preview・validation・参照整合の統合 | 不正 ID・重複・未設定警告 |
| **R9f** | authoring closure — 回帰テスト・spec 一致・R10 用作戦作成可能判定 | 新規 2 Wave 作戦をエディタだけで起動 |

**次タスク（R9 系列）:** **R9b** — R9.5 完了後に着手。公式次は **R9.5a**。

### R9a §80.6 技術前提（R9 Backend 完了に必要・R9.5 と並行可）

R9a 調査で分割した以下は、上表 R9b〜f の authoring 前提として **R9 Backend 完了前に成立させる**。詳細・テスト条件は [current-task.md §80.6](../ai-handoff/current-task.md#806-r9-小タスク一覧最大-6) を参照。

| 項目 | 内容 |
| ---- | ---- |
| CombatModule editor | `GET/PUT /__editor/combat-modules` + 編集 UI（`attackIntervalSec` + `action`） |
| Class `combatModuleIds` | R5 4 兵科のみ、2 件必須 |
| `operationPassiveCatalog` JSON 化 | R8 暫定 TS 定数 → JSON + editor（R9d と統合可） |

### Backend 完了

- 新仕様の 2 Wave 以上の作戦をエディタで作成・保存・再読込できる
- 敵方式と作戦内パッシブ候補を設定できる
- 不正参照を validate できる
- preview と runtime の解決結果が一致する

### Player 完了

- エディタで作った新作戦をゲームから開始できる
- 設定した Wave、敵方式、パッシブ候補がプレイ画面へ反映される
- 新仕様プレイ全体の完了判定は **R9.5 および R10** で行う

**R9 スコープ外:** M1 外 class の一括 editor 対応、`stages-demo.json` 編集切替、正式 VFX、legacy フィールド一括削除（R9f 後・別 PR 可）。

`stages-demo.json` は legacy reference として維持し、R9 の移行対象にしない。

---

## R10 — 新仕様 2 Wave 試作・反復評価

### 開始条件

**Backend 前提:**

- R5〜R8 の Backend 縦切りが維持されている
- R9b〜f により、新作戦を authoring・validate・preview できる
- `stages.json` に R10 専用の新作戦を追加できる状態である
- 2 Wave 以上の OperationState・WavePrep・作戦内パッシブ経路が接続済みである

**Player 前提（[planning-rules.md §1](../ai-handoff/planning-rules.md#1-r10-の前提定義)）:**

- R9.5a 完了: 4 兵科で legacy active が発動しない
- R9.5b 完了: 4 兵科の HUD に legacy gauge がなく、攻撃間隔が表示される
- R9.5c 完了: 出撃前に戦闘方式を選択できる
- WavePrep で方式を確認・変更できる

### 目的

新仕様の構造が技術的に動くことではなく、以下を判断できる試作を作る。

> 編成、戦闘方式、Wave 間変更、作戦内パッシブを使って、同じ作戦を別の判断で繰り返し遊びたいと思えるか。

### 評価軸

- Wave1 の選択が Wave2 への準備判断につながるか
- 戦闘方式の変更が単なる倍率差ではなく、処理対象や挙動差として認識できるか
- 作戦内パッシブの取得が次 Wave の編成・方式判断に影響するか
- 初回失敗後に別案を試したくなるか
- legacy active / legacy gauge が新仕様の理解を混乱させていないか

テスト pass・データ追加・2 Wave 完走だけを R10 完了条件にしない。

### Backend 完了

- 新仕様専用の 2 Wave 以上の作戦がロード・完走できる
- OperationState、WavePrep、方式変更、パッシブ保持、作戦終了リセットが成立する
- 主要状態遷移の自動テストが pass する

Backend 完了だけでは R10 完了としない。

### Player 完了

- プレイヤーが新仕様だけで 2 Wave 以上を遊べる
- 出撃前と Wave 間の判断が戦闘結果へ反映される
- legacy active と legacy gauge が新仕様プレイへ混在しない
- 異なる編成・方式・パッシブで再挑戦できる
- 「繰り返し遊びたいか」について評価結果を記録できる

### スコープ外

正式画像、VFX 最終版、効果音、i18n、packaging、itch.io 公開、非 M1 兵科の全面 module 移行、`stages-demo.json` 移行、Save を使った作戦途中再開、大量ステージ制作、メタ進行。

### 未確定事項（R10 着手前に doc または実装から確認）

- R10 新作戦で使用する作戦内パッシブの具体的候補数
- Wave 開始前に次 Wave 敵構成をどこまで表示するか
- 初期方式のデフォルト選択規則
- 攻撃間隔表示の表記形式
- R10 手動評価の記録先
- R9d の authoring 対象が Stage 定義か別 passive pool 定義か

未確定事項は一般 RPG の慣例で補完しない。

**試作成立後:** 兵科拡張 → 診断基盤再構築 → **戦場移動 legacy cleanup** → 正式コンテンツ → UI 仕上げ → 画像 / VFX / 効果音 → i18n → packaging → 公開準備（順序は再計画）。

---

## 戦場移動 legacy cleanup（R10 以降・未着手）

**目的:** Phase 3d で完了した接近・接敵 Intent 一本化の**残り** — X 方向デプロイ / 隊形 sort に残る `formationRow` 依存と、[battle-field.md](../spec/battle-field.md) §2.6 / §3.3 の spec 矛盾を解消する。

**着手条件:** **R9.5 + R9 + R10 の新仕様最小実装が完了してから**（現行の R9.5a 等と並行しない）。接近・隊形レイヤは `battleLayout` / `partyFormation` / 多数テストと接するため、新 schema 縦切りの安定後にまとめて扱う。

**詳細タスク:** [battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)

| 区分 | 内容 | 状態 |
| ---- | ---- | ---- |
| 前提 | 接近 Intent 一本化、`battleX` 単一正本、`formationRow` JSON 導出化、クラスエディタ旧 UI 削除 | **完了** |
| A | X デプロイ配置正本の確定（§3.3 vs §2.6） | 未着手 |
| B〜F | `partyFormation` / `battleLayout` / `resolveApproachBattleX` から X 方向 `formationRow` 排除、デッドコード削除、`CombatantState.formationRow` 去就、データ・テスト整理 | 未着手 |

**スコープ外:** R9.5 / R9 / R10 の Player 完了条件。新 combat module・operation passive・Wave  authoring とは別 PR を推奨。

---

## 依存関係（R0〜R10）

```
R0（完了）
  ↓
R1 上位戦闘設計（doc）
  ↓
R2 詳細戦闘・兵科 spec
  ↓
R3 Wave 作戦ループ spec
  ↓
R4 データスキーマ・エディタ設計
  ↓
R5 Backend
  ↓
R6 Backend
  ↓
R7 Backend
  ↓
R8 Backend
  ├─ R9a ── R9b ── R9c ── R9d ── R9e ── R9f ──┐
  └─ R9.5a ── R9.5b ── R9.5c ───────────────────┤
                                                 └─ R10
                                                      ↓
                                    戦場移動 legacy cleanup（R10 以降・任意タイミング）
                                                      ↓
                                    （試作成立後）コンテンツ・診断・presentation・公開
```

補足:

- R9.5a は R5 Backend に直接依存する
- R9.5c は R6 の OperationState にも依存する
- R9d は R7〜R8 のパッシブ基盤に依存する
- R10 は R9.5（Player 完了）と R9f の両方を開始条件とする
- R9b と R9.5a は技術的並行可能だが、公式次は R9.5a とする
- **戦場移動 legacy cleanup** は R10 完了後（新仕様最小実装安定後）。R9.5 / R9 とは並行しない — [battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)

R5 は R4 の設計（[combat-data-schema-refactor.md](combat-data-schema-refactor.md) §16 最小 schema）を前提に着手する。

---

## Legacy 資料・ステージ（reference のみ）

| 種別 | パス / 名称 | 扱い |
| ---- | ----------- | ---- |
| 体験版ステージ | `data/stages-demo.json` — `demo_ch1_01`〜`07`（7 件） | legacy / reference。新仕様へ移行しない |
| dev / smoke ステージ | `data/stages.json` — `test`, `ranged_test`, `1`, `2`, `eg_smoke` 等 | legacy / dev 用 |
| 旧スキル確定表 | [skill-finalization-table.md](./skill-finalization-table.md) | legacy 資料。実装計画の正本ではない |
| 旧 Phase 4 詳細 | [phase-4-roadmap.md](./phase-4-roadmap.md) | 完了済み作業の記録。M1 向け未完了項目（4e 等）は凍結 |
| 旧 M1 handoff | [current-task.md §5 以降](../ai-handoff/current-task.md) | 2026-07-12 以前の Phase 6/7 作業ログ。凍結 |

---

## Legacy ロードマップ（凍結 — 2026-07-12）

**旧 Phase 1〜14 / Release M1〜M2** 中心の計画は凍結した。以下は凍結時点のサマリのみ。詳細な旧 Phase 節は git 履歴（本ファイル 2026-07-12 改定前）を参照。

### 旧概要（凍結）

| Phase | 旧ゴール | 旧状態 |
| ----- | -------- | ------ |
| 1〜3 | 戦闘コア、放置 MVP、Lv スキル習得・4 枠 | 完了 |
| 4 | クラスマスタ、編成 UI（4a〜4d 完了、4e 凍結） | 4e 除き完了 |
| 5 | 演出 VFX 基盤 | 基盤のみ |
| 6 | M1 demo content（6b 完了、6c 未完了） | 凍結 |
| 7 | M1 demo app flow（7d〜7g 最小実装済み） | 凍結 |
| 8 | M1 presentation | 凍結 |
| 9 | M1 packaging / itch | 凍結 |
| 10〜14 | 本編、印術師・法陣師、ローグ、メタ | 凍結 |

### 旧 Release（凍結）

| Release | 旧ゴール |
| ------- | -------- |
| **M1** | itch.io 体験版、8 クラス、Chapter 1 前半 |
| **M2** | 有料初版、13 クラス、Chapter 1 全文 |
| **M3+** | Lv10/Lv20、印術師・法陣師、Steam 等 |

### 旧開発優先（凍結）

Phase 6 → 7 → 4e → 8 → 9 → itch.io 公開 → Phase 10（M2）— **すべて凍結**。

---

## 全フェーズ共通のスコープ外（継続）

アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。
