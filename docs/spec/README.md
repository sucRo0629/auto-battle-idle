# ゲーム仕様（Spec）

実装の設計リファレンス。**実行時の正本は `data/*.json`**。本ドキュメントは意図とルールの説明。

**`data/skills/`** の個別スキル（ID・数値・名称）は Phase 4a で確定済み。仕様書には **JSON スキーマと戦闘ルール** のみ記載し、現行ファイルの内容をスキル一覧として転記しない。エージェントは **触るクラス分の active ファイルだけ** Read / Grep する（[../README.md](../README.md#json-の読み方トークン節約)）。

**用語：** スキルは習得した時点で常時使用可能。スキルの付け替え・セット・装備変更は行わない。将来のアイテムのみ「装備」。詳細は [classes-and-skills.md](classes-and-skills.md#用語スキル習得-vs-装備)。

**R2 注記（2026-07-12）:** [stats.md](stats.md)、[combat.md](combat.md)、[classes-and-skills.md](classes-and-skills.md) は **§現行方針（R2）** と **Legacy** を分離済み。

**R3 注記（2026-07-12）:** [operation-loop.md](operation-loop.md) が Wave 作戦ループの正本。[battle-field.md](battle-field.md) / [progression.md](progression.md) に legacy 分離と 3 層進行を反映済み。

**R12a 注記（2026-07-15）:** [operation-loop.md §5.3.1 / §15](operation-loop.md#531-wave-勝利条件r12a) — Wave 勝利条件（敵全滅）、敵問題・戦術目標・敗因の識別可能性の authoring 正本。

**R12b 注記（2026-07-15）:** [operation-loop.md §16](operation-loop.md#16-1-wave-単位の敵問題r12b) — 1 Wave 成立条件、敵側戦術（保護 / 分担 / 相乗）。クラス能力・CombatModule・実データは後続再設計。

**R12c 注記（2026-07-15）:** [operation-loop.md §17](operation-loop.md#17-作戦全体の敵問題r12c) — 作戦全体の敵問題、Wave 間関係（継続 / 転換 / 複合 / 対立）、編成・資源・最終 Wave 原則。具体 Stage・数値は後続。

**R4 注記（2026-07-12）:** データ責務・エディタ設計・validate / migration は [combat-data-schema-refactor.md](../plans/combat-data-schema-refactor.md)（plans）。spec 各書の R2 ゲームルール正本は維持。

| ファイル | 内容 |
|----------|------|
| [operation-loop.md](operation-loop.md) | **作戦ループ**（R3）— 作戦状態 / 戦闘状態、Wave 間準備、チェックポイント、リトライ、途中セーブ方針。**敵問題・戦術目標**（R12a §15）、**1 Wave 敵問題・敵側戦術**（R12b §16）、**作戦全体の敵問題・Wave 間関係**（R12c §17）、Wave 勝利条件＝敵全滅（§5.3.1） |
| [stats.md](stats.md) | 兵科基礎ステ、攻撃間隔（R2）。Legacy: Lv 成長、growthPresets、attackSpeedTier |
| [combat.md](combat.md) | Attack / Hit、攻撃間隔、戦闘方式、DoT・一時効果（R2）、**作戦内パッシブの戦闘中表示**（R8 doc）。Legacy: ダメージパイプライン、CD、gauge |
| [battle-field.md](battle-field.md) | 戦闘フィールド（座標、隊形、Wave、接敵、描画パイプライン）、**戦闘画面 UI / HUD**、戦闘中統計 UI、**1 次元効果範囲のフィールド表示**（R8 doc）。Legacy: BattlePhase 自動 Wave 遷移 |
| [classes-and-skills.md](classes-and-skills.md) | 兵科・戦闘方式・作戦内パッシブ（R2 候補）、M1 方式表。Legacy: 旧スキル JSON スキーマ・UI 用語辞書 |
| [i18n-en.md](i18n-en.md) | **英語 i18n 文案方針**（Phase 4e — M1 直前）— スキル効果文・用語・表記統一・スキルカード英語 |
| [progression.md](progression.md) | 進行 3 層（R3）、作戦外進行。Legacy: EXP、レベル、セーブ、Stage Records、Phase 2〜12 |
| [party-formation-ui.md](party-formation-ui.md) | パーティ編成メニュー（`SkillMenuPanel`）の画面設計 — Phase 4d |
| [ui-fonts.md](ui-fonts.md) | **UI フォント方針**（M PLUS 1p、`--font-body`） |
| [ui-visual-rules.md](ui-visual-rules.md) | **全 UI 共通ビジュアル**（Web アプリ風禁止・HUD プレート推奨） |
| [stage-selection-ui.md](stage-selection-ui.md) | ステージ選択・詳細・出撃。Legacy: Level Sync / 想定 Lv / ☆ |
| [roguelike-mode.md](roguelike-mode.md) | ローグライクモード（仮称）— ランダム問題・ラン進行・報酬設計（Phase 10） |
