# Auto Battle Idle — ドキュメント

トピックごとに **分割** してあり、作業時は必要なファイルだけ開く（Cursor ルール: `.cursor/rules/documentation-index.mdc`）。

- **[Plans](plans/README.md)** — 開発ロードマップ（[フェーズ詳細](plans/phase-roadmap.md)）
- **[Spec](spec/README.md)** — ゲーム設計リファレンス（ステータス・戦闘・クラス・進行）
- **[Design Philosophy](design-philosophy.md)** — ゲーム全体の評価軸と設計判断基準
- **[Combat Architecture](combat-architecture.md)** — 戦闘システム全体の上位構造（Kill / Flow / Survival）
- **[System Mechanics](system-mechanics.md)** — 複数クラスが共有する戦闘メカニクス
- **[Class Philosophy](class-philosophy.md)** — 職群の基礎 / 発展 / 変則と 3 職構成の設計思想
- **[Enemy Design Concept](enemy-design-concept.md)** — 敵をクラス体系で構成する設計方針（問題提示・教材化）

## コード ↔ ドキュメント対応表

仕様変更時は下表の doc を同タスクで更新する（`.cursor/rules/documentation-sync.mdc`）。

| 触るコード / データ                                                               | 読む・更新する doc                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `data/classes.json`, `data/skills/`, スキル UI                                    | [spec/classes-and-skills.md](spec/classes-and-skills.md)                        |
| `data/levelCurves.json`, ステ計算                                                 | [spec/stats.md](spec/stats.md)                                                  |
| `combatMath.ts`, `SkillExecutor.ts`, 効果・ターゲット                             | [spec/combat.md](spec/combat.md)                                                |
| `battleLayout.ts`, `combatPosition.ts`, `SpriteAnimator`, `IBattleRenderer`, 描画 | [spec/battle-field.md](spec/battle-field.md)                                    |
| `vfxAnimRegistry.ts`, `VfxPlaybackManager`, `presentation/`, `sheets/vfx/`        | [spec/classes-and-skills.md](spec/classes-and-skills.md#スプライト演出アセット) |
| `data/stages.json`, セーブ, EXP, LvUP                                             | [spec/progression.md](spec/progression.md)                                      |
| `data/enemies.json`, 敵編成・ボス設計の方針                                       | [enemy-design-concept.md](enemy-design-concept.md)                              |
| ローグライクモード（ラン・問題生成・報酬）                                        | [spec/roguelike-mode.md](spec/roguelike-mode.md)                                |
| フェーズ・作業順                                                                  | [plans/phase-roadmap.md](plans/phase-roadmap.md)                                |

## JSON の読み方（トークン節約）

| ファイル                           | 行数目安           | AI / エージェント向け                                      |
| ---------------------------------- | ------------------ | ---------------------------------------------------------- |
| `data/skills/passives/<stem>.json` | ~10–80 / ファイル  | **触るクラス分だけ** Read / Grep（例: `df_guardian.json`） |
| `data/skills/actives/<stem>.json`  | ~30–150 / ファイル | **触るクラス分だけ** Read / Grep（例: `df_guardian.json`） |
| `classes.json`                     | ~600               | 全文読まない。`.cursorignore` 除外。ID で Grep             |
| その他 `data/*.json`               | ~100 以下          | 必要なら全文可                                             |

- スキーマ・effect 定義 → [spec/classes-and-skills.md](spec/classes-and-skills.md)
- 型の正本 → `src/battle/types.ts`, `src/battle/data/gameDataSchema.ts`
- ルール詳細 → `.cursor/rules/data-json-lightweight.mdc`

## クイックリンク

| トピック           | ファイル                                                 |
| ------------------ | -------------------------------------------------------- |
| フェーズ状況       | [plans/phase-roadmap.md](plans/phase-roadmap.md)         |
| ゲーム全体哲学     | [design-philosophy.md](design-philosophy.md)             |
| 戦闘アーキテクチャ | [combat-architecture.md](combat-architecture.md)         |
| 共通戦闘メカニクス | [system-mechanics.md](system-mechanics.md)               |
| 職群設計思想       | [class-philosophy.md](class-philosophy.md)               |
| 敵設計コンセプト   | [enemy-design-concept.md](enemy-design-concept.md)       |
| デモ編成・スキル   | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| ダメージ・バフ     | [spec/combat.md](spec/combat.md)                         |
| 戦場・座標         | [spec/battle-field.md](spec/battle-field.md)             |
| セーブ・EXP        | [spec/progression.md](spec/progression.md)               |
| ローグライクモード | [spec/roguelike-mode.md](spec/roguelike-mode.md)         |
