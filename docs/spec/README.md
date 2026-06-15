# ゲーム仕様（Spec）

実装の設計リファレンス。**実行時の正本は `data/*.json`**。本ドキュメントは意図とルールの説明。

**`data/skills/`** の個別スキル（ID・数値・名称）は Phase 4a で確定済み。仕様書には **JSON スキーマと戦闘ルール** のみ記載し、現行ファイルの内容をスキル一覧として転記しない。エージェントは **触るクラス分の active ファイルだけ** Read / Grep する（[../README.md](../README.md#json-の読み方トークン節約)）。

**用語：** スキル枠への割り当ては「セット」、将来のアイテムは「装備」。詳細は [classes-and-skills.md](classes-and-skills.md#用語スキル-vs-装備)。

| ファイル | 内容 |
|----------|------|
| [stats.md](stats.md) | 基礎ステ（Lv1）、成長段階、growthPresets、SPD（attackSpeedTier） |
| [combat.md](combat.md) | ダメージ、回復、CD、ステータス効果 |
| [battle-field.md](battle-field.md) | 戦闘フィールド（座標、隊形、Wave、接敵、描画パイプライン） |
| [classes-and-skills.md](classes-and-skills.md) | ロール、クラス、スキル JSON スキーマ、**スプライト・演出アセット** |
| [progression.md](progression.md) | EXP、レベル、セーブ、Phase 2〜8 |
