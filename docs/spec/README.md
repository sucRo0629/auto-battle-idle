# ゲーム仕様（Spec）

実装の設計リファレンス。**実行時の正本は `data/*.json`**。本ドキュメントは意図とルールの説明。

**`data/skills/`** の個別スキル（ID・数値・名称）は Phase 4a で確定済み。仕様書には **JSON スキーマと戦闘ルール** のみ記載し、現行ファイルの内容をスキル一覧として転記しない。エージェントは **触るクラス分の active ファイルだけ** Read / Grep する（[../README.md](../README.md#json-の読み方トークン節約)）。

**用語：** スキルは習得した時点で常時使用可能。スキルの付け替え・セット・装備変更は行わない。将来のアイテムのみ「装備」。詳細は [classes-and-skills.md](classes-and-skills.md#用語スキル習得-vs-装備)。

| ファイル | 内容 |
|----------|------|
| [stats.md](stats.md) | 基礎ステ（Lv1）、成長段階、growthPresets、SPD（attackSpeedTier） |
| [combat.md](combat.md) | ダメージ、回復、CD、ステータス効果 |
| [battle-field.md](battle-field.md) | 戦闘フィールド（座標、隊形、Wave、接敵、描画パイプライン）、**戦闘画面 UI / HUD**、戦闘中統計 UI |
| [classes-and-skills.md](classes-and-skills.md) | ロール、クラス、スキル JSON スキーマ、**UI 用語辞書**、**ゲーム用語表（表示分類）**、**スプライト・演出アセット** |
| [i18n-en.md](i18n-en.md) | **英語 i18n 文案方針**（Phase 4e — M1 直前）— スキル効果文・用語・表記統一・スキルカード英語 |
| [progression.md](progression.md) | EXP、レベル、セーブ、Stage Records、Phase 2〜12 |
| [party-formation-ui.md](party-formation-ui.md) | パーティ編成メニュー（`SkillMenuPanel`）の画面設計 — Phase 4d |
| [ui-fonts.md](ui-fonts.md) | **UI フォント方針**（M PLUS 1p、`--font-body`） |
| [ui-visual-rules.md](ui-visual-rules.md) | **全 UI 共通ビジュアル**（Web アプリ風禁止・HUD プレート推奨） |
| [stage-selection-ui.md](stage-selection-ui.md) | マップ選択・ステージ詳細・Level Sync・リザルト履歴 — Phase 6d |
| [roguelike-mode.md](roguelike-mode.md) | ローグライクモード（仮称）— ランダム問題・ラン進行・報酬設計（Phase 10） |
