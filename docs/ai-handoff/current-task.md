# Current Task

## 1. このファイルの目的

- ChatGPT と Cursor の間で、現在の作業内容・前提・制約・結果を受け渡すための一時メモ。
- 正本仕様ではない。
- 仕様変更が確定した場合は、必ず `docs/spec/` 配下（および `docs/` 直下の設計ドキュメント）の該当ドキュメントへ反映する。

## 2. 現在の作業テーマ

- 作業名: （未記入）
- 対象画面 / 対象機能: （未記入）
- 目的: （未記入）
- 完了条件: （未記入）

## 3. 参照すべき正本

作業開始前に、今回の対象に関係するものだけを開く（全 spec 一括読み込みはしない）。

- [docs/combat-architecture.md](../combat-architecture.md) — 戦闘システム全体の上位構造（Kill / Flow / Survival）
- [docs/class-philosophy.md](../class-philosophy.md) — 職群の設計思想
- [docs/system-mechanics.md](../system-mechanics.md) — 複数クラスが共有する戦闘メカニクス
- [docs/spec/classes-and-skills.md](../spec/classes-and-skills.md) — クラス・スキル JSON スキーマ・用語
- [docs/spec/party-formation-ui.md](../spec/party-formation-ui.md) — パーティ編成メニュー UI
- その他、今回の作業に関係するファイルがあれば追記する（例: [docs/spec/battle-field.md](../spec/battle-field.md)、[docs/spec/ui-visual-rules.md](../spec/ui-visual-rules.md)、[docs/spec/combat.md](../spec/combat.md)）

## 4. 今回の前提・決定事項

- Hensei-Only は編成解法型オートバトル RPG。
- 操作技術ではなく「誰を編成するか」が主役。
- UI は Web アプリ風ではなく、ゲーム UI 寄りにする（[docs/spec/ui-visual-rules.md](../spec/ui-visual-rules.md)）。
- 戦闘画面は **1280×720** 基準の絶対 px 座標で設計する（[docs/spec/battle-field.md §8](../spec/battle-field.md#8-戦闘画面-ui1280720-hud)）。
- 実表示では画面全体を等比スケールする。
- 要素の有無で HUD やカードの高さが戦闘中に変わらないようにする。
- 未確定の仕様は Cursor 側で創作しない。判断できない場合は「未確定」と明記し、確認を求める。

## 5. 用語注意

- 「スキルカード」は編成画面側の用語（[docs/spec/party-formation-ui.md](../spec/party-formation-ui.md)、[docs/spec/classes-and-skills.md](../spec/classes-and-skills.md)）。
- 戦闘画面では「スキルカード」と呼ばない。
- 戦闘画面では必要に応じて以下のように呼ぶ。
  - 味方スキルゲージ
  - active 枠
  - allyCard 内スキル欄
  - 戦闘 HUD スキル枠

## 6. 今回やること

- [ ] （未記入 — ChatGPT または作業開始者が記入）
- [ ] 
- [ ] 

## 7. 今回やらないこと

- [ ] 正本仕様にない新仕様の追加
- [ ] 数値バランス調整
- [ ] unrelated なリファクタ
- [ ] UI 全体の別案化
- [ ] `docs/spec/` および `docs/` 設計ドキュメントと矛盾する変更

## 8. 触ってよいファイル

- 未記入の場合、Cursor は作業前に候補を洗い出す。
- 例:
  - `src/...`
  - `docs/...`

## 9. 触らないファイル

- 未記入の場合、Cursor は不要なファイルを変更しない。
- 例:
  - `docs/spec/classes-and-skills.md`（今回の作業で spec 更新が明示されていない限り）
  - `src/data/...` / `data/...`（今回の作業でデータ変更が明示されていない限り）

## 10. Cursor 作業後の報告フォーマット

Cursor は作業完了後、以下の形式で報告する。

### 変更概要

- 

### 変更ファイル

- 

### 実装内容

- 

### 仕様との対応

- 

### 未解決 / 判断保留

- 

### テスト・確認結果

- 

### ChatGPT にレビューしてほしい点

- 

## 11. ChatGPT へ戻すときの貼り付け用メモ

Cursor は必要に応じて、この節に ChatGPT へ貼るための短い要約を書く。

- 今回の目的:
- 実際に変えた内容:
- 気になる点:
- スクショ確認が必要な箇所:
- 次に判断したいこと:
