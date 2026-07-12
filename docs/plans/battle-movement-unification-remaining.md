# 戦場移動 一本化の残タスク

戦場移動（`battleX` 接近・接敵・隊形デプロイ）を **クラス・ロール・`formationRow` で分岐しない** 一本化の残タスクを集約する。

正本: [battle-field.md](../spec/battle-field.md)（座標・隊形・接敵）、[classes-and-skills.md](../spec/classes-and-skills.md#配置)（配置導出）。ゲームルール変更を伴うものは同作業内で該当 spec を更新する（[documentation-sync.mdc](../../.cursor/rules/documentation-sync.mdc)）。

## 完了済み（前提）

| 項目 | 状態 |
| ---- | ---- |
| 接近・接敵 Intent 一本化（`ChaseTarget → standoff → AttackTarget`、defender 専用接近廃止） | 完了（Phase 3d / [master-work-order.md](master-work-order.md)） |
| `battleX` 単一正本（`visual/screen/camera` pipeline 撤去） | 完了（battle-field cleanup） |
| `classes.json` の `formationRow` を **`role` + `rangePx` から導出**（読み込み時 JSON 値無視） | 完了（`validateGameData.ts` / `entities.ts`） |
| クラスエディタの「配置列」手動 UI 削除・保存時 strip | 完了 |

## 現状の課題（要点）

`formationRow` は「Y 描画・ターゲット用」と spec に書かれているが、**実装では render / production targeting のどちらも `formationRow` を参照していない**（`src/render/**` に参照なし、`src/battle/skills/**` の参照はテストのみ）。実際に `formationRow` が残って効いているのは **X 方向のデプロイ順・隊形スペーシング**であり、これは「射程で分けない一本化」と矛盾する。

さらに **spec 内部で矛盾** がある。

- [battle-field.md §3.3](../spec/battle-field.md) — 「X 配置正本 = 全生存味方を射程降順一列」
- [battle-field.md §2.6](../spec/battle-field.md) — 「同一 `formationRow` 内の X 深度」表（front/back 帯で分割）

どちらを正とするかが未確定。これを先に決めないとコード修正の方向が定まらない。

## 残タスク一覧

### A. 方針決定（先行・ブロッカー）

- [ ] **X デプロイ配置の正本を確定する** — §3.3「射程降順一列」に一本化するか、§2.6「front/back 帯 + 帯内深度」を残すか。
  - 一本化する場合: `formationRow` は X から完全排除。
  - 帯を残す場合: それは「ロール・射程による分岐」なので「一本化」の定義を spec 側で明文化し直す。
- [ ] 決定を [battle-field.md](../spec/battle-field.md) §2.6 / §3.3 に反映し、矛盾を解消。

### B. コード（X 移動から `formationRow` を排除）※方針 A に依存

- [ ] `partyFormation.ts` `comparePartyFormationSlot` — 先頭で `FORMATION_ROW_DEPLOY_ORDER`（back→front）で帯分割してから深度を決めている。射程一列に統一するなら帯分割を撤去。
- [ ] `battleLayout.ts` `applyPartyFormationApproachSpacing` — デプロイ帯境界（`deployRow !== prevDeployRow`）で `prevX` をリセットしている分岐を撤去。
- [ ] `resolveApproachBattleX.ts` — `toPlacementInput` / `toMeleeFormationSlot` / `resolvePlayerApproachWithoutEnemyContact` が `player.formationRow` を placement へ渡している。判定自体は `battleX` / `role` / `rangePx` で行っているため、`formationRow` 依存を導出または削除に置換。

### C. デッドコード削除

- [ ] `battleLayout.ts` `getLeadingPlayerFormationRow`（`@deprecated`。production 呼び出しなし）
- [ ] `battleLayout.ts` `applyFormationRowApproachSpacing`（`@deprecated` alias。呼び出しなし）
- [ ] `battleLayout.ts` `resolveFrontRowSameRangeMeleeDepthPx`（`@deprecated`。呼び出しなし）

### D. `CombatantState.formationRow` フィールドの去就 ※方針 A に依存

- [ ] X から排除後、`formationRow` を実行時に参照する箇所が残るか再確認。
  - 残らない → `CombatantState` / `PlayerPlacementInput` から `formationRow` を削除し、`resolveClassFormationRow` は編成 UI 表示専用に降格。
  - 残る（Y 描画等で必要と判明） → その用途を spec に明記し、生成時導出（`entities.ts`）だけを正とする。

### E. データ・spec クリーンアップ

- [ ] `data/classes.json` から永続 `formationRow` を一括除去（読み込みは既に導出。エディタ保存で漸次 strip されるが手動一括も可）。
- [ ] [battle-field.md §187](../spec/battle-field.md) の「`formationRow` は Y 描画・ターゲット用」を実装実態に合わせて修正（render/targeting は未使用）。
- [ ] `docs/dev/balance-diagnostics.md` の弓術士診断 band（`formationRow: back` 条件）を、導出 or `role`+`rangePx` 表現へ更新。

### F. テスト

- [ ] `formationRow` を手動設定している多数のテストは、生成経路（`resolveClassFormationRow`）由来へ寄せるか、X 移動の不変条件を `battleX` / 射程で固定するよう見直す（`partyFormation.test.ts` / `battleLayout.test.ts` / `resolveApproachBattleX.player.test.ts` など）。

## ゲート（bug-fix-project.mdc 準拠）

- 同種の分岐・補正を増やしていないか（`formationRow` 依存を別 helper へ移すだけにしない）。
- battle の単一経路（`resolveAllPlayerApproachBattleX` 共有 clamp / formation レイヤ）を壊していないか。
- テストは不変条件（接敵ライン・隊形間隔・射程順）を固定しているか。
- spec 変更理由を doc に残しているか（特に方針 A）。

## 参照

| 用途 | ファイル |
| ---- | -------- |
| 接近・接敵・隊形の正本 | [battle-field.md](../spec/battle-field.md) |
| 配置導出ルール | [classes-and-skills.md §配置](../spec/classes-and-skills.md#配置) |
| Intent 一本化の経緯 | [master-work-order.md](master-work-order.md) §Phase 3d |
