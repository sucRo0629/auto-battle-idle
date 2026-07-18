# Planning Rules（ChatGPT ↔ Cursor handoff）

**目的:** フェーズ分割・完了判定・受け渡し時の落とし穴を防ぐ。正本仕様ではない。仕様変更は `docs/spec/` へ反映する。

**読むタイミング:** 新しい R フェーズを切るとき、`current-task.md` を更新するとき、`phase-roadmap.md` を改定するとき。

---

## 1. R10 の前提定義

R10 は「新作戦ステージを 1 本追加する」だけではない。

**R10 開始条件（Player 完了）:**

- プレイヤーが **新仕様だけ** で 2 Wave 以上の作戦を遊べる
- Wave ごとの編成・戦闘方式・作戦内パッシブが **判断として意味を持つ**

**新仕様のプレイ体験に必須（R10 前）:**

| 項目 | 内容 |
| ---- | ---- |
| active 廃止（module 兵科） | `combatModuleIds` がある兵科で legacy active が **発動しない** |
| HUD | 味方 HUD に legacy スキルゲージ（2×2 active recast）を **出さない**。攻撃間隔表示へ |
| 戦闘方式 UI | **出撃前編成**でも選べる（Wave 間 `WavePrep` だけでは不十分） |
| 新作戦 | `stages.json` に新仕様専用作戦（`stages-demo.json` は legacy reference のまま触らない） |

**R10 の評価軸:** 「繰り返し遊びたいか」。backend / テスト pass は R10 完了条件に **しない**。

**2026-07-17 追記:** 評価フェーズの前に、評価対象となる仕組みが実装されていなければならない。「繰り返し遊びたいか」を評価するなら、固定 Stage の再試行導線だけでなく、プレイごとに異なる問題・構築判断を供給するメイン反復構造を先に設計・実装する。評価項目をロードマップに置くだけでは、その性質はゲームへ生まれない。

---

## 2. フェーズ完了条件の二層

各 R フェーズの完了条件は **必ず二層** で書く。

| 層 | 意味 | 完了の言い方 |
| -- | ---- | ------------ |
| **Backend 完了** | API / 型 / validate / 統合テスト / engine 経路 | 「縦切り成立」「legacy 共存で成立」 |
| **Player 完了** | プレイヤーが画面で確認できること | 「Phase 完了」 |

**Backend だけ完了したら「Phase 完了」と書かない。**

### 例: R5（2026-07-12 時点の教訓）

| 層 | 内容 | 状態 |
| -- | ---- | ---- |
| Backend | module → SkillExecutor、4 兵科 × 2 方式、味方/敵 module 選択、重複禁止 | **完了**（R5b〜g） |
| Player | active/gauge 停止、HUD 刷新、出撃前 module UI | **未達**（計画漏れ） |

`learnedActiveIds=[]` のテスト fixture だけでは Player 完了にならない。

### 2.1 評価対象先行ゲート（再発防止・必須）

R10 と旧 R12 では、**反復性を生む仕組みが無いまま「繰り返し遊びたいか」の評価だけを後続 Phase に置く**不具合を2回起こした。以後、楽しさ・反復性・選択の意味・継続意欲などを評価する Phase は、次の表を埋めない限りロードマップへ追加・開始・完了してはならない。

| 必須欄 | 書く内容 |
| ------ | -------- |
| **評価命題** | 何を Player に判定してもらうか |
| **発生機構** | その性質をゲーム内に生む具体的な仕組み。UI導線・テスト・評価項目だけは不可 |
| **設計 Phase** | 発生機構の仕様、情報、状態遷移、データ責務を確定する Phase ID |
| **実装 Phase** | 発生機構を Player 導線まで接続する Phase ID |
| **成立ゲート** | 評価前に、機構が実画面で機能することを判定する Phase ID と Player 完了条件 |
| **評価 Phase** | 成立後に主観・体感を判定する Phase ID |
| **反証例** | 何が同じままだと、その評価を実施できないか |

**依存順は必ず `設計 → 実装 → 手元成立 → 評価`。** 数値調整、固定コンテンツ追加、retry導線、テスト passを、発生機構の代用にしない。

#### ロードマップ承認チェック

新設・再編時に、次をすべて Yes にする。1つでも No / 未確定なら、評価 Phase は **blocked ではなく計画未成立**として前段を追加する。

1. 評価したい性質を生む仕組みが、名詞ではなくプレイ中の状態変化として説明されているか
2. その仕組みを作る設計 Phase と実装 Phase が評価 Phase より前にあるか
3. 実装 Phase の Player 完了条件で、実画面上の差を確認できるか
4. 評価 Phase の開始条件が、直前の成立ゲートの **Player 完了**になっているか
5. 発生機構が前段の「スコープ外」へ送られていないか
6. 「1回目と2回目で何が変わるか」に具体的に答えられるか（反復性評価の場合）
7. 固定問題の複数解と、問題自体を反復供給する仕組みを混同していないか（反復性評価の場合）

このチェックは、(a) `phase-roadmap.md` 改定時、(b) Phase 実装開始時、(c) handoff で次 Phase を指定するとき、の **3回**行う。過去のチェック結果を流用せず、現在の仕様と実装で再確認する。

**面白さの最終判定者は人間の Player。** LLM はテスト、構造、選択肢の数、推定プレイ結果から「面白い」「繰り返したい」を完了判定しない。LLM の責務は、評価対象となる仕組みを欠落なく設計・実装順へ置き、比較可能な状態と観察項目を用意するところまで。

### 2.2 対象網羅・本文選択読解ゲート（再発防止・必須）

トークン節約では、**読む量は絞っても、確認対象の範囲は絞らない**。[docs/README.md「JSON の読み方」](../README.md#json-の読み方トークン節約)の対象網羅規則を、JSONだけでなく設計・仕様・ロードマップ監査にも適用する。

作業開始前に次を列挙し、handoff に確認済み / 該当なし / 未確認を残す。

| 対象群 | 最低限の確認 |
| ------ | ------------ |
| 上位方針 | design philosophy、該当する設計思想 |
| 仕様索引 | `spec/README.md` とそこから辿れる関連正本 |
| 直接依存 | 対象文書のリンク先・リンク元 |
| 計画 | `phase-roadmap.md`、`current-task.md`、`planning-rules.md` |
| 実体 | 関連データ、runtime、validation、editor、Player UI |
| legacy | 同じ用語・旧 Phase・旧仕様が現行扱いで残っていないか |

**禁止:**

- 「全文 Read 禁止」を理由に、ファイル自体を確認対象から外す
- 最初に思いついた2〜3文書だけを関連文書全体とみなす
- 検索ヒットの1行だけで正本判断し、節の前提・状態注記を読まない
- 前提変更後も、変更前の確認対象一覧をそのまま使う

確認対象が多い場合は、全対象へ横断検索してから、ヒット節・正本節・矛盾候補だけを読む。これが節約手段であり、対象削減は節約手段にしない。

### テスト作成の観点

テストは現行実装のスナップショットではなく、**確定仕様どおりか**を確かめるために書く。  
**正本:** [test-policy.md](test-policy.md)。CombatModule 詳細は [combat-module-test-policy.md](combat-module-test-policy.md)。

---

## 3. R5 と R10 の橋渡し（R9.5 / R10-prep）

R10 の前に、番号は **R9.5** または **R10-prep** として明示フェーズを切る。

| ID | 内容 | 主な触り先 |
| -- | ---- | ---------- |
| **R9.5a** | runtime: module 兵科で active cooldown 生成・`runUnitSkills` 発動を止める | `entities.ts`, `BattleEngine.ts`, `skillBuild.ts` |
| **R9.5b** | HUD: `PartyHudPanel` を攻撃間隔表示へ（module 兵科） | `PartyHudPanel.ts`, `partyHudTypes.ts`, `battle-field.md` §8.7 |
| **R9.5c** | 編成: `SkillMenuPanel` に戦闘方式選択（出撃前、`OperationState` と整合） | `SkillMenuPanel.ts`, `party-formation-ui.md` |

**推奨順序:** R9.5（Player 完了）→ R9b〜d（authoring）→ R10（試作・評価）

R9b だけ先に進めても「エディタでは作れるがプレイは legacy 混在」のまま。

---

## 4. 「後でやる」の書き方

「後でやる」「R6 以降 UI Phase」「スコープ外」と書くときは **必ず**:

1. **戻し先 Phase ID**（例: R9.5b、R10-prep）
2. **Player 完了条件**（プレイヤーが何を見ないか / 何ができるか）
3. **触るファイル候補**

「R6 以降」だけでは **未割当** 扱い。次の handoff で必ず拾う。

---

## 5. legacy 共存の扱い

legacy 共存は **移行期の実装手段** であり、新仕様の完了条件ではない。

| 許容（移行期） | R10 前に解消 |
| -------------- | ------------ |
| `combatModuleIds` なし兵科の旧 active | R5 対象 4 兵科の戦闘中 active 発動 |
| dev / smoke ステージ | 上記兵科の味方スキルゲージ表示 |
| `stages-demo.json`（reference・移行しない） | 新作戦での Lv 習得 active 前提の編成 UI |

**R9 = エディタ（authoring）**。プレイヤー向け legacy 除去の代替にはならない。

---

## 6. 役割分担

| 側 | 役割 |
| -- | ---- |
| **ChatGPT** | フェーズ分割、二層完了条件、handoff（`current-task.md`）、`phase-roadmap.md` 改定 |
| **Cursor** | handoff どおり実装。計画の穴は指摘するが `docs/spec/` を勝手に拡張しない |

**仕様判断の正本:** `docs/` と現在の実装。一般 RPG テンプレで補完しない。

### handoff 各 Phase に必ず含める項目

- 触るファイル候補
- Backend 完了条件 / Player 完了条件
- スコープ外（明示）
- 次 Phase へ送る未接続事項（**戻し先 ID 付き**）
- 後続に体感評価がある場合は、§2.1 の **評価対象先行ゲート7項目の再確認結果**
- §2.2 の **確認対象一覧**と、各対象の確認済み / 該当なし / 未確認

---

## 7. R5 対象兵科（参照）

`R5_COMBAT_MODULE_CLASS_IDS`（`src/battle/types.ts`）:

- `df_guardian`
- `at_swordsman`
- `at_sorcerer`
- `sp_cleric`

Player 完了の検証は **この 4 兵科を編成に入れたプレイ** で行う。

---

## 8. 現在地メモ（更新: 2026-07-18・R12k 完了 / 公式次 R12l）

| 項目 | 状態 |
| ---- | ---- |
| R5〜R8 | Backend 完了 |
| R9 系列 | R9b〜h / R9f / R9.6 完了 |
| **R10** | Backend + **構造** Player のみ。遊べる試作 / 反復評価は **未達** |
| **R11** | a〜d **システム縦切り完了**。ゲームとしてのプレイアビリティは **未達** |
| **R12a〜f** | **完了**（設計 Phase） |
| **R12g-a** | **完了** — schema / damage 初回調査 |
| **R12g-b** | **Backend 完了**（設計 Phase）— Attack Hit / HP damage event 契約。Player 未達 |
| **R12g-b1** | **Backend 完了** — `DamageAppliedEvent` 型・emission 統一 |
| **R12g-b2** | **Backend 完了** — 鉄衛士 M2 runtime（固定自己回復本体） |
| **R12g-b3** | **Backend 完了** — 実経路統合テスト・M2 検証経路・module 選択安定性確認 |
| **R12g-c** | **Backend 完了 / Player 未完了** — 護法士 M2 danger targeting（c1〜c5） |
| **R12g-c2** | **Backend 完了** — danger 集計 runtime API（`dangerTargeting.ts`） |
| **R12g-c3** | **Backend 完了** — 最小 `TargetSpec` `kind: danger` + resolver 接続 |
| **R12g-c4** | **Backend 完了** — 護法士 M2 防護 runtime / `TargetingRuntimeContext` 実戦注入 |
| **R12g-c5** | **Backend 完了** — 統合 test / debug 検証 |
| **R12g-d1** | **Backend 完了 / Player 未完了** — 鉄衛士 M1/M2 CombatModule データ再設計 |
| **R12g-d2** | **Backend 完了 / Player 未完了** — 護法士 M1/M2 CombatModule データ再設計 |
| **R12g-d3** | **Backend 完了 / Player 未完了** — 療養師 M1/M2 CombatModule データ再設計 |
| **R12g-d4** | **Backend 完了 / Player 未完了** — 結界師 M1/M2 CombatModule データ再設計 |
| **R12g-d5** | **Backend 完了 / Player 未完了** — Survival 4 兵科共通統合確認 |
| **R12g-e1** | **Backend 完了 / Player 未完了** — 剣術士 M1/M2 CombatModule データ再設計 |
| **R12g-e2** | **Backend 完了 / Player 未完了** — 双刃士 M1/M2 CombatModule データ再設計 |
| **R12g-e3** | **Backend 完了 / Player 未完了** — 弓術士 M1/M2 CombatModule データ再設計 |
| **R12g-e4** | **Backend 完了 / Player 未完了** — 魔術師 M1/M2 CombatModule データ再設計 |
| **R12g-e5** | **Backend 完了 / Player 未完了** — Kill 4 兵科 CombatModule 共通統合確認（`killCombatModules.integration.test.ts`） |
| **R12g-e 全体** | Kill Module data（e1〜e4）+ 共通統合（e5）は **Backend 完了 / Player 未完了** |
| **R12g-g** | **Backend 完了** — validation / authoring 統合（8 兵科 × 各 2 方式 = 16 件の round-trip / game-data validation）。Player 未判定。正本: [current-task.md §105.15](current-task.md) |
| **R12g-d/e Player** | **未完了** — Survival（d5）/ Kill（e5）の手元画面確認なし |
| **R12h** | **Backend 完了 / Player 未判定** — Stage / Wave データ実装 |
| **R12i** | **Backend初回完了 / characterization** — cost `1 / 10 / 20`・grant `[0, 12, 12]`・stackStep `1`。新パッシブ / 反復構造後の本調整ではない |
| **R12j** | **判定無効 / 未完了** — 固定 Stage の一部経路は実画面クリア、B側は膠着。旧 Lv パッシブとメイン反復構造欠落のためゲーム全体の成立根拠にしない |
| **R12k〜o** | メイン反復構造設計（**R12k 完了**）→ R5対象4兵科パッシブ再編 → 4兵科反復試作（系列 A/B）→ 数値調整 → 手元成立 |
| **公式次タスク** | **R12l** — R5対象4兵科のパッシブ・旧active再編（初期 3/2/2、全表示）。正本の反復構造は [operation-loop.md §21](../spec/operation-loop.md#21-メイン反復構造r12k) |

**R12f で確定した主要境界（短縮）:**

- Kill / Flow / Survival 分類を維持（A〜G は能力カテゴリ）
- B1 支援役到達 / B2 攻撃中核到達を分離
- 鉄衛士 M2 は「敵の Attack Hit による実 HP ダメージ」トリガー（直接ダメージ上位概念あり。schema は R12g）
- D / E は兵科単位ではなく **Module 単位**で担当が変わる。鉄衛士は D/E 直接担当外
- 将来拡張境界: 闘技士（自己回復なし・反撃/妨害）/ 槍術士（Flow・射程差ではない）/ 印術師（区域魔法領域を魔術師に食わせない）

---

## 8b. R11 システム縦切り（2026-07-14）/ 再判定（2026-07-15）

R11 は仕組み（範囲・専用パッシブ枠・資源式・基礎ステ極端化）まで。**反復可能なゲームとしての「遊べる」は R12o**。

| 確定（仕組み・維持） | 内容 |
| ---- | ---- |
| 取得上限 | なし |
| コスト | `base(unlockLevel) + sameClassCount × stackStep`（固定加算） |
| Wave 資源 | 約 6 人分×1〜2 回強化できる量（体感は R12i） |
| 効果範囲 | R11a で `pierce` / `multiLock` を §5.7 へ |

詳細は [phase-roadmap.md §R11](../plans/phase-roadmap.md#r11--システム縦切り範囲パッシブ資源基礎ステ) / [§R12](../plans/phase-roadmap.md#r12--試作をゲームにするデータ再設計)。

---

## 8c. R12 データ・反復構造再設計（更新: 2026-07-18）

**設計順（正本）:** R12a〜j の敵問題・module・固定 Stage 技術材料 → **メイン反復構造（R12k 完了）** → **R5対象4兵科パッシブ再編** → **4兵科反復試作** → 数値調整 → 手元成立 → R13。

| ID | 内容 | 状態 |
| -- | ---- | ---- |
| **R12a** | 敵問題・戦術目標・敗因の識別可能性を spec 正本化。勝利条件＝敵全滅 | **完了** |
| **R12b** | **1 Wave 単位の敵問題設計**（成立条件・敵側戦術。現行クラス能力に非依存） | **Backend 完了** / **Player 未達** |
| **R12c** | **作戦全体の敵問題**（Wave 間関係・編成・資源・汎用編成の扱い） | **Backend 完了** / **Player 完了**（設計 Phase） |
| **R12d** | 試作 Stage の敵問題設計（JSON 入力なし） | **完了**（設計 Phase） |
| **R12e** | 必要能力・対処能力の導出 | **完了**（設計 Phase） |
| **R12f** | 兵科・CombatModule・作戦内パッシブへの分配（設計） | **完了**（設計 Phase） |
| **R12g** | class / module / passive データ再設計 | R12g-g Backend 完了（validation / authoring 統合）。d/e Player 未完了 |
| **R12h** | Stage / Wave データ実装 | **Backend 完了 / Player 未判定** |
| **R12i** | 固定 Stage 数値強度調整 | **Backend初回完了 / characterization** |
| **R12j** | 固定 Stage 手元成立ゲート | **判定無効 / 未完了** |
| **R12k** | メイン反復構造の設計（seed 付き作者設計 3 Wave 問題系列） | **完了** |
| **R12l** | R5対象4兵科のパッシブ・旧active再編（初期 3 / 2 / 2、全表示） | **公式次** |
| **R12m** | 4兵科だけの反復可能メイン試作（系列 A/B） | 未着手 |
| **R12n** | 新構造後の数値強度調整 | 未着手 |
| **R12o** | 反復試作の手元成立ゲート | 未着手 |
| **R13** | 「繰り返し遊びたいか」 | **R12o 後** |

**旧番号対応:** 旧 R12c（Stage / Wave データ）→ **R12d + R12h**。旧 R12d（手元ゲート）→ **R12j**。旧案の module / passive データ再設計 → **R12f + R12g**。

「繰り返し遊びたいか」は **R13**。**R12o 完了前に評価しない**。

| 不採用 | 理由 |
| ------ | ---- |
| R11 を Player 完了のまま presentation へ進む | データ未成立のまま正式作業に入る |
| 強度チューニングだけ先にやる | 問題設計・判断差が無いと旧一発クリアと同型のまま |
| 旧 roguelike-mode.md をそのまま復活する | 固定メイン + 副モード、Lv / EXP、旧 Phase 10 前提が現行方針と不一致。採用要素は [operation-loop.md §21](../spec/operation-loop.md#21-メイン反復構造r12k) で再設計済み |
| 固定 Stage 成立後すぐ反復評価する | 反復性を生む仕組みが未実装なら評価対象が存在しない |
| 敵側戦術分類を現行クラス能力の可否で採否する | R12b は抽象構造。能力は後続再設計 |
| Stage データ／能力設計／手元評価を一タスクにまとめる | 責務が混ざり回帰原因と完了判定が曖昧になる |
| 数値調整をデータ実装に内包する | 構造未確定のまま強度だけ触る事故を防ぐ（R12h と R12i を分離） |

---

## 9. 採用しなかった分割案（2026-07-13 改定）
| 案 | 不採用理由 |
| -- | ---------- |
| R9b を予定どおり先行する | authoring は進むが、R10 最大ブロッカーである legacy 混在を解除しない |
| R9.5a〜c を一括実装する | runtime・HUD・OperationState 接続の責務が混ざり、回帰原因と Player 完了判定が曖昧になる |
| R10 の中で active 停止・HUD・編成 UI も実装する | 試作評価と基盤移行が混在し、「繰り返し遊びたいか」を評価する時間が失われる |
| R5 を未完了に戻して全面再実装する | R5〜R8 の Backend 資産と完了記録を不必要に覆す |
| R9 を Player 完了 Phase として扱う | R9 は authoring であり、プレイヤー画面の legacy 除去を保証しない |
| HUD 変更を R10 後へ送る | legacy gauge が残ったままでは新仕様の攻撃間隔と方式を正しく評価できない |
| 出撃前方式選択を WavePrep だけで代用する | Wave1 の準備判断が欠け、作戦開始時点から新仕様を遊べない |
| 非 M1 兵科も同時に全面移行する | R10 評価に不要で、移行範囲と回帰リスクを拡大する |
| `stages-demo.json` を新仕様へ移行する | legacy reference として維持する制約に反し、R10 試作用の責務が混ざる |

---

## 10. 参照

- [phase-roadmap.md](../plans/phase-roadmap.md) — R0〜R13 開発順の正本
- [current-task.md](current-task.md) — 作業中 handoff
- [combat-data-schema-refactor.md](../plans/combat-data-schema-refactor.md) — データ責務
- [operation-loop.md](../spec/operation-loop.md) — 作戦ループ・初期準備 / Wave 間準備
