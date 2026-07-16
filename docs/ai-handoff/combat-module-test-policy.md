# CombatModule テスト作成方針

**目的:** R12g 以降の兵科 CombatModule（M1/M2）データ再設計で、専用 test が **確定仕様の runtime 挙動** を固定するようにする。JSON 形状・registry 件数だけでは Backend 完了にしない。

**位置づけ:** 本ファイルは [test-policy.md](test-policy.md)（テスト全体方針）の **CombatModule 向け詳細**。全体の「確定仕様どおりか」観点はそちらを正とする。

**参照実装例:** `src/battle/atAssassinModules.test.ts`（R12g-e2）、`src/battle/atSwordsmanModules.test.ts`（R12g-e1）、`src/battle/survivalCombatModules.integration.test.ts`（R12g-d5）。

---

## 1. 不合格になる確認（これだけでは足りない）

次だけでは **仕様どおりとはみなさない**。

- JSON snapshot / フィールド存在 / ID 文字列一致だけ
- `combatModuleRegistry` の件数だけ
- 関数が呼ばれた回数・モック呼び出し回数だけ
- `description` や validation エラー文字列だけを runtime 仕様の代替にする
- Module 選択後の basic `skillId` だけ見て Approach / damage を未確認のまま合格にする

形状・validation・editor round-trip は **補助**として書いてよいが、本体は下記の runtime 確認とセットにする。

---

## 2. 必須の runtime 確認

各兵科の専用 test（または統合 test）で、確定仕様どおりかを **実結果** で確認する。

| 観点 | 確認すること |
| ---- | ------------ |
| **target 選択** | 実際にどの unit id が選ばれたか。禁止優先（支援役固定・遠隔役固定・高 DEF 等）が混入していないか |
| **Approach** | 接近目標 X / 停止位置 / 前線追い越しの有無。M1 と M2 で停止規則が分岐すること |
| **damage** | 実際の対象、Hit 数、HP・Barrier の変化。特効や heal/lifesteal が無いこと（仕様どおり） |
| **M1/M2 排他** | 選択中 Module の挙動だけが出ること。未選択方式の Approach / target / effect が混入しないこと |
| **敵味方対称** | actor の `isEnemy` を反転した runtime 結果で同じ規則が成り立つこと |
| **Operation / Wave 切替** | `OperationState` 等で Module を切り替えたあと、**再生成ユニットの実戦挙動**（Approach 等）が変わること |

数値本調整（R12i）前は仮数値でよいが、**大小関係・排他・到達可否**など仕様の構造は仮数値でも崩さない。

---

## 3. production 経路の優先順位

可能なら次の順で production に近い経路を使う。

1. `createAllyFromMember` / `createAlliesFromPartyState` + 選択 Module ID
2. `resolvePlayerChaseTargetEnemy` / `resolveAllPlayerApproachBattleX` / `resolvePlayerAttackTargetEnemy`（および敵側対称 API）
3. `SkillExecutor.tryExecute`（実際の HP / Barrier / damage event）
4. 必要なら `BattleEngine` + Operation Wave prep API

**困難な場合:** 完了報告に次を明記する。

- 困難な理由
- 代替した確認経路
- 未確認範囲（例: 長時間 tick のスプライト重なり、Player 画面での見た目）

代替経路でも「誰が選ばれたか」「どこで止まったか」「HP がどう変わったか」は残す。

---

## 4. 仕様と食い違う結果が出たとき

1. **test 期待値を現行実装に合わせて通さない**
2. 次のどれが誤っているかを分類してから直す
   - 正本（`docs/spec/` / R12f 分配）
   - 実装
   - test（fixture・射程配置・誤解）
3. 分類結果を完了報告に一行残す

---

## 5. pre-existing failure の扱い

失敗を単に pre-existing と書かない。少なくとも次で区別する。

1. 基準 commit ですでに失敗する
2. 直前 Phase（例: R12g-d1〜d5）で発生した
3. 直前の同系列タスク（例: R12g-e1）で発生した
4. **今回**のタスクで発生した

| 禁止 | 許容 |
| ---- | ---- |
| skip で隠す | 今回差分由来なら今回直す |
| 今回と無関係な assertion を「ついでに」直す | 今回が原因の件数・legacy 参照切れは同タスクで直す |

---

## 6. Backend 完了時の test 報告

報告に含める。

- 追加・更新した test ファイル
- **何を保証したか**（上表の観点ごとの一言）
- production 困難項目の代替・未確認範囲
- pre-existing failure の因果分類（該当時）

「N 件 pass」だけを完了根拠にしない（[tests-not-proof](../../.cursor/rules/tests-not-proof.mdc)）。

---

## 7. R12g 兵科タスクへの適用

`R12g-e*` / Survival Module データ再設計では、専用 test を本方針に従わせる。ChatGPT → Cursor の実装プロンプトにも本ファイルへのリンクと「runtime 挙動必須」を転記する（[.cursor/rules/project-implementation-prompts.mdc](../../.cursor/rules/project-implementation-prompts.mdc)）。
