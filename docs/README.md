# Hensei Only — ドキュメント

トピックごとに **分割** してあり、作業時は必要なファイルだけ開く（Cursor ルール: `.cursor/rules/documentation-index.mdc`）。

- **[Plans](plans/README.md)** — 開発ロードマップ（[フェーズ詳細](plans/phase-roadmap.md)、[Phase 4 詳細](plans/phase-4-roadmap.md)、[itch.io Devlog](plans/itch-io-devlog.md)）
- **[Spec](spec/README.md)** — ゲーム設計リファレンス（ステータス・戦闘・クラス・進行）
- **[Dev](dev/balance-diagnostics.md)** — M1 体験版バランス診断（smoke / puzzle / 診断ログの運用意図）
- **[Design Philosophy](design-philosophy.md)** — コアコンセプト（編成への思考圧縮）、評価軸、設計判断基準
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
| `BattleView.ts`, `BattleCanvas.ts`, `PartyHudPanel.ts`, 戦闘画面 HUD / レイヤー | [spec/battle-field.md §8](spec/battle-field.md#8-戦闘画面-ui1280720-hud) |
| `PartyMemberStatsDisplay.ts`, 戦闘中統計 DOM           | [spec/battle-field.md](spec/battle-field.md#7-戦闘中統計-ui)                    |
| `vfxAnimRegistry.ts`, `VfxPlaybackManager`, `presentation/`, `sheets/vfx/`        | [spec/classes-and-skills.md](spec/classes-and-skills.md#スプライト演出アセット) |
| SE / BGM（`src/assets/sounds/`、再生制御・音量設定）                              | [combat-architecture.md](combat-architecture.md#88-sound初期版体験版)（設定 UI: [party-formation-ui.md §16](spec/party-formation-ui.md#16-音声設定体験版)） |
| `data/stages.json`, セーブ, EXP, LvUP, `stageRecords`                          | [spec/progression.md](spec/progression.md)                                      |
| マップ選択・ステージ詳細・リザルト履歴 DOM（Phase 6d 予定）                    | [spec/stage-selection-ui.md](spec/stage-selection-ui.md)                        |
| `MetaMenuOverlay.ts`, `SkillMenuPanel.ts`, `gameTermGlossary.ts` 等、編成メニュー DOM | [spec/party-formation-ui.md](spec/party-formation-ui.md)（用語表: [classes-and-skills.md §ゲーム用語表](spec/classes-and-skills.md#ゲーム用語表表示分類)） |
| `fonts.css`, UI `font-family`, 戦闘 HUD フォントテーマ | [spec/ui-fonts.md](spec/ui-fonts.md) |
| `game-ui-chrome.css`, DOM / Canvas UI 見た目・ツールチップ方針 | [spec/ui-visual-rules.md](spec/ui-visual-rules.md) |
| `data/enemies.json`, 敵編成・ボス設計の方針                                       | [enemy-design-concept.md](enemy-design-concept.md)                              |
| `EnemyEditorStep`, `editorApi`（敵テンプレ編集）                                  | [plans/enemy-editor-refactor.md](plans/enemy-editor-refactor.md)                |
| ローグライクモード（ラン・問題生成・報酬）                                        | [spec/roguelike-mode.md](spec/roguelike-mode.md)                                |
| `formatSkillText.ts`, 4b 説明文 / 4e i18n（**M1 8 クラス**）                      | [spec/i18n-en.md](spec/i18n-en.md)（進捗: [phase-4-roadmap.md §4e](plans/phase-4-roadmap.md#4e--英語-i18n-en-のみ)） |
| Release M1 / M2 スコープ・配信方針                                                | [plans/phase-roadmap.md §Release マイルストーン](plans/phase-roadmap.md#release-マイルストーン) |
| フェーズ・作業順                                                                  | [plans/phase-roadmap.md](plans/phase-roadmap.md)                                |
| itch.io ストア・Devlog（M1 公開前）                                               | [plans/itch-io-devlog.md](plans/itch-io-devlog.md)                              |

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
| Release M1 / M2    | [plans/phase-roadmap.md §Release マイルストーン](plans/phase-roadmap.md#release-マイルストーン) |
| Phase 4 作業順     | [plans/phase-4-roadmap.md](plans/phase-4-roadmap.md)     |
| コアコンセプト・設計哲学 | [design-philosophy.md](design-philosophy.md)         |
| 戦闘アーキテクチャ | [combat-architecture.md](combat-architecture.md)         |
| 共通戦闘メカニクス | [system-mechanics.md](system-mechanics.md)               |
| 職群設計思想       | [class-philosophy.md](class-philosophy.md)               |
| 敵設計コンセプト   | [enemy-design-concept.md](enemy-design-concept.md)       |
| デモ編成・スキル   | [spec/classes-and-skills.md](spec/classes-and-skills.md) |
| ダメージ・バフ     | [spec/combat.md](spec/combat.md)                         |
| 戦場・座標 / 戦闘画面 HUD | [spec/battle-field.md](spec/battle-field.md)             |
| セーブ・EXP        | [spec/progression.md](spec/progression.md)               |
| パーティ編成 UI    | [spec/party-formation-ui.md](spec/party-formation-ui.md) |
| UI フォント方針    | [spec/ui-fonts.md](spec/ui-fonts.md) |
| UI ビジュアルルール（全画面共通） | [spec/ui-visual-rules.md](spec/ui-visual-rules.md) |
| ステージ選択 UI    | [spec/stage-selection-ui.md](spec/stage-selection-ui.md) |
| ローグライクモード | [spec/roguelike-mode.md](spec/roguelike-mode.md)         |
