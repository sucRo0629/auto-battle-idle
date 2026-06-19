# Auto Battle Idle — ドキュメント

トピックごとに **分割** してあり、作業時は必要なファイルだけ開く（Cursor ルール: `.cursor/rules/documentation-index.mdc`）。

- **[Plans](plans/README.md)** — 開発ロードマップ（[フェーズ詳細](plans/phase-roadmap.md)）
- **[Spec](spec/README.md)** — ゲーム設計リファレンス（ステータス・戦闘・クラス・進行）
- **[Combat Architecture](combat-architecture.md)** — 戦闘システム全体の上位構造（Kill / Flow / Survival）
- **[Class Philosophy](class-philosophy.md)** — 職群の基礎 / 発展 / 変則と 3 職構成の設計思想

## コード ↔ ドキュメント対応表

仕様変更時は下表の doc を同タスクで更新する（`.cursor/rules/documentation-sync.mdc`）。

| 触るコード / データ | 読む・更新する doc |
|---------------------|-------------------|
| `data/classes.json`, `data/skills/`, スキル UI | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| `data/levelCurves.json`, ステ計算 | [spec/stats.md](spec/stats.md) |
| `combatMath.ts`, `SkillExecutor.ts`, 効果・ターゲット | [spec/combat.md](spec/combat.md) |
| `battleLayout.ts`, `combatPosition.ts`, `SpriteAnimator`, `IBattleRenderer`, 描画 | [spec/battle-field.md](spec/battle-field.md) |
| `vfxAnimRegistry.ts`, `VfxPlaybackManager`, `presentation/`, `sheets/vfx/` | [spec/classes-and-skills.md](spec/classes-and-skills.md#スプライト演出アセット) |
| `data/stages.json`, セーブ, EXP, LvUP | [spec/progression.md](spec/progression.md) |
| フェーズ・作業順 | [plans/phase-roadmap.md](plans/phase-roadmap.md) |

## JSON の読み方（トークン節約）

| ファイル | 行数目安 | AI / エージェント向け |
|----------|----------|------------------------|
| `data/skills/passives.json` | ~400 | 共有パッシブのみ。必要なら全文可 |
| `data/skills/actives/<stem>.json` | ~30–150 / ファイル | **触るクラス分だけ** Read / Grep（例: `df_guardian.json`） |
| `classes.json` | ~600 | 全文読まない。`.cursorignore` 除外。ID で Grep |
| その他 `data/*.json` | ~100 以下 | 必要なら全文可 |

- スキーマ・effect 定義 → [spec/classes-and-skills.md](spec/classes-and-skills.md)
- 型の正本 → `src/battle/types.ts`, `src/battle/data/gameDataSchema.ts`
- ルール詳細 → `.cursor/rules/data-json-lightweight.mdc`

## クイックリンク

| トピック | ファイル |
|----------|----------|
| フェーズ状況 | [plans/phase-roadmap.md](plans/phase-roadmap.md) |
| 戦闘アーキテクチャ | [combat-architecture.md](combat-architecture.md) |
| 職群設計思想 | [class-philosophy.md](class-philosophy.md) |
| デモ編成・スキル | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| ダメージ・バフ | [spec/combat.md](spec/combat.md) |
| 戦場・座標 | [spec/battle-field.md](spec/battle-field.md) |
| セーブ・EXP | [spec/progression.md](spec/progression.md) |
