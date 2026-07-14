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

---

## 7. R5 対象兵科（参照）

`R5_COMBAT_MODULE_CLASS_IDS`（`src/battle/types.ts`）:

- `df_guardian`
- `at_swordsman`
- `at_sorcerer`
- `sp_cleric`

Player 完了の検証は **この 4 兵科を編成に入れたプレイ** で行う。

---

## 8. 現在地メモ（更新: 2026-07-14）

| 項目 | 状態 |
| ---- | ---- |
| R5〜R8 | Backend 完了 |
| R9 系列 | R9b〜h / R9f / R9.6 完了 |
| **R10** | **Backend + 構造 Player 完了**（§95） |
| **公式次タスク** | R11 完了後バックログ（兵科拡張・cleanup・Stage 削除・presentation 等） |
| **R11** | **a〜d 完了** |

---

## 8b. R11 プレイアビリティ（2026-07-14）

R10 後の正本 Phase。順序固定: **範囲 → パッシブ → 資源/積み上げコスト → 極端基礎ステ**。

| 確定 | 内容 |
| ---- | ---- |
| 取得上限 | なし |
| コスト | `base(unlockLevel) + sameClassCount × stackStep`（固定加算） |
| Wave 資源 | 約 6 人分×1〜2 回強化できる量 |
| 効果範囲 | R11a で `pierce` / `multiLock` を §5.7 へ |

詳細は [phase-roadmap.md §R11](../plans/phase-roadmap.md#r11--試作プレイアビリティ範囲パッシブ資源基礎ステ)。

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

- [phase-roadmap.md](../plans/phase-roadmap.md) — R0〜R11 開発順の正本
- [current-task.md](current-task.md) — 作業中 handoff
- [combat-data-schema-refactor.md](../plans/combat-data-schema-refactor.md) — データ責務
- [operation-loop.md](../spec/operation-loop.md) — 作戦ループ・初期準備 / Wave 間準備
