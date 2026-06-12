# Auto Battle Idle — ドキュメント

トピックごとに **分割** してあり、作業時は必要なファイルだけ開く（Cursor ルール: `.cursor/rules/documentation-index.mdc`）。

- **[Plans](plans/README.md)** — 開発ロードマップ（[フェーズ詳細](plans/phase-roadmap.md)）
- **[Spec](spec/README.md)** — ゲーム設計リファレンス（ステータス・戦闘・クラス・進行）

## コード ↔ ドキュメント対応表

仕様変更時は下表の doc を同タスクで更新する（`.cursor/rules/documentation-sync.mdc`）。

| 触るコード / データ | 読む・更新する doc |
|---------------------|-------------------|
| `data/classes.json`, `data/skills.json`, スキル UI | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| `data/levelCurves.json`, ステ計算 | [spec/stats.md](spec/stats.md) |
| `combatMath.ts`, `SkillExecutor.ts`, 効果・ターゲット | [spec/combat.md](spec/combat.md) |
| `battleLayout.ts`, `combatPosition.ts`, 描画 | [spec/battle-field.md](spec/battle-field.md) |
| `data/stages.json`, セーブ, EXP, LvUP | [spec/progression.md](spec/progression.md) |
| フェーズ・作業順 | [plans/phase-roadmap.md](plans/phase-roadmap.md) |

## クイックリンク

| トピック | ファイル |
|----------|----------|
| フェーズ状況 | [plans/phase-roadmap.md](plans/phase-roadmap.md) |
| デモ編成・スキル | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| ダメージ・バフ | [spec/combat.md](spec/combat.md) |
| 戦場・座標 | [spec/battle-field.md](spec/battle-field.md) |
| セーブ・EXP | [spec/progression.md](spec/progression.md) |
