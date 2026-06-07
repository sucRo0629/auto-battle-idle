# フェーズロードマップ

Auto Battle Idle の開発フェーズ一覧。ゲームルールは [spec](../spec/README.md) を参照。

## 概要

| Phase | ゴール | 状態 |
|-------|--------|------|
| **1** | 戦闘コアデモ（自動戦闘 + Canvas 表示・プレースホルダー） | **完了** |
| **2a** | 放置 MVP：セーブ・ステージ進行・個別Lv（ステのみ） | **完了** |
| **2b** | 戦闘計算（`combatMath` 等） | **完了** |
| **2c** | JSON 駆動クラス、ビルドのハードコード排除 | **完了** |
| **3** | Lvアップ時スキル習得、AGI、アクティブ2枠目 | **次フェーズ** |
| **4** | globalExp、強化ツリー、オフライン報酬、Electron | 未着手 |
| **6** | 本番スプライトアニメーション（クラス別ドット絵） | 未着手 |
| **7** | スキル VFX（スキル別設定・新プリセット） | 未着手（Phase 6 後） |
| **8** | バランス調整（数値チューニング全般） | 未着手 |

全フェーズ共通のスコープ外：アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。

---

## Phase 1 — 戦闘コアデモ（完了）

**ゴール：** ブラウザ上で味方パーティ vs 敵の完全自動戦闘。開始後はプレイヤー入力なし。

### 実装済み

- Vite vanilla-ts プロジェクト（`base: './'`）
- JSON ゲームデータ：`data/classes.json`, `skills.json`, `enemies.json`, `stages.json`, `parties.json`
- 戦闘ロジック：`BattleEngine`, `SkillExecutor`, `targeting`, `combatMath`, `validateGameData`
- 3ロール、4デモクラス、4人編成、`stage_1` に test_enemy × 2
- スキル枠：**basic**（非表示・常時稼働）+ **装備アクティブ1枠**（HUD に CD 表示）
- パッシブはすべて同時発動；`snipe` でターゲットルールを `lowestHpEnemy` に上書き
- ステータス効果：`atk`, `def`, `damageTaken` への buff / debuff
- Victory / Defeat → 3秒待機 → HP全回復 → 再スポーン（Phase 2 でセーブ連動の進行ルールを追加）
- Canvas 2D：**アニメーション基盤**（`SpriteAnimator`、イベント連動、近接突進/遠隔弾、ダメージポップアップ）
- **プレースホルダースプライト**（ロール別色分け PNG。本番ドット絵は Phase 6）
- **プレースホルダー戦闘 VFX**（slash / orb / arrow / healRise の4種。role / attackRange から自動選択。`render/skillVfx/` に解決基盤のみ。**スキル別 `vfx` 設定・新プリセット追加は Phase 7**）
- buff VFX：対象スプライトの白い光（約0.8秒）
- Canvas UI：ステージ名（左上）、パーティ HUD（クラス名 / Exp / HP / スキル CD）
- バトルログ：**console のみ**（DOM ログは意図的に未実装）

### デモ編成

| クラス | ロール | 装備アクティブ | パッシブ |
|--------|--------|----------------|----------|
| Bulwark | defender | Iron Guard（buff） | Thick Skin |
| Berserker | attacker | Slash | Brute |
| Cleric | supporter | Heal | Gentle Touch |
| Hawkeye | attacker | Arrow | Snipe |

### アーキテクチャ

```
battle/  → ロジックのみ（DOM/Canvas 非依存）
  ↓ events + getSnapshot()
ui/      → BattleView がエンジン ↔ 描画を仲介
render/  → BattleCanvas（IBattleRenderer）、スプライト、エフェクト
data/    → loadGameData.ts が JSON マスタを読み込み
```

---

## Phase 2 — 放置 MVP（2a / 2b / 2c）

### 2a — 進行コア（完了）

- オートセーブ / ロード（`localStorage`、確認/リリース別キー）
- 複数ステージ：`stages.json` の順序で `currentStageId` を管理
- **Victory** → 次ステージへ進行（最終後は同ステージ周回、`totalClears` +1）
- **Defeat** → 1 つ前のステージへロールバック（先頭では据え置き）
- 勝利時に生存味方へ敵 `exp` 合計を付与し個別 LvUP
- LvUP で **maxHp / atk / def のみ上昇**（スキル習得なし）
- 進行 UI：ステージ名、パーティ Lv / Exp

### 2b — 戦闘計算（完了）

Phase 1 の時点で `src/battle/combatMath.ts` に実装済み。数値の体感調整は **Phase 8**。

### 2c — クラス基盤（完了）

- セーブ + JSON のみからパーティ/ビルドを構築（`parties.json` / `test-parties.json`）
- `levelCurves.json` によるクラス別ステ成長

---

## Phase 3 — スキル・戦闘拡張（次フェーズ）

- LvUP 時 `skillUnlocks` → `learnedPassiveIds` / `learnedActiveIds` に追加
- **AGI** ステ：基本攻撃 CD のみ加速
- アクティブ装備2枠目（解放条件は未定）
- セーブに習得済みビルドを永続化

---

## Phase 4 — メタ・デスクトップ

- 勝利・オフライン時間から **globalExp** 付与
- 強化ツリー（`enhancementTree.json`）：パーティ永続のステノード
- オフライン抽象報酬（戦闘シミュレーションはしない）
- Electron シェル：frameless、常に前面、トレイ、片隅配置

---

## Phase 6 — 本番スプライトアニメーション

Phase 1 の `render/` 基盤（`SpriteAnimator`, `IBattleRenderer`, イベント連動）はそのまま活かし、**見た目のアセットを本番化**する。ゲームプレイ拡張（Phase 3〜4）の後に着手。

### スコープ

- クラス別・敵別の **本番スプライトシート**（`classId` / `spriteKey` 単位）
- `idle` / `attack` / `heal` / `hurt` / `death` のフレームアニメ（横並びシート）
- `SpriteRegistry.ts` をプレースホルダーから本番 PNG 定義へ差し替え
- `classes.json`・`enemies.json` の `spriteKey` を本番アセットに紐付け
- デモ4クラス + 敵（test_enemy / slime 等）分を最低限カバー

### Phase 1 との境界

| 項目 | Phase 1（済） | Phase 6 |
|------|---------------|---------|
| アニメ状態機械 | あり | 変更なし |
| スプライト素材 | ロール別プレースホルダー | クラス別本番ドット絵 |
| 差し替え単位 | `render/` の Registry / アセットパス | 同上（battle ロジックは触らない） |

### スコープ外（Phase 6）

- PixiJS への描画層移行（将来検討）
- スキルごとの VFX 設定・新プリセット追加（**Phase 7**）

---

## Phase 7 — スキル VFX

Phase 1 の Canvas プレースホルダー VFX を、スキル単位で差し替え・拡張する。**Phase 6（本番キャラスプライト）完了後**に着手。

### スコープ

- `skills.json` の `vfx` フィールドを本番データに反映（`ActiveSkillDef.vfx`）
- スキルごとの `preset` / `arc` / `durationMs` 指定（通常攻撃含む）
- 新プリセット追加（Canvas `draw*` または将来のエフェクトスプライト）
- 開発用 `SKILL_VFX_OVERRIDES` からデータ駆動へ移行

### Phase 1 との境界

| 項目 | Phase 1（済） | Phase 7 |
|------|---------------|---------|
| 解決 | `resolveSkillVfx` + ロール/射程フォールバック | スキル ID ごとに `vfx` 指定 |
| 描画 | 4種プレースホルダー | 追加・差し替え |
| battle ロジック | 変更なし | 変更なし |

### スコープ外（Phase 7）

- スキル専用エフェクトスプライトシート（量産アセット。必要なら更に後続）

---

## Phase 8 — バランス調整

Phase 3〜7 で機能・コンテンツ・見た目が揃ったあとに、ゲーム全体の数値をチューニングする。**最終フェーズ**。

### スコープ

- [combat.md](../spec/combat.md) との突き合わせ・検証
- 敵 `exp`、成長曲線（`levelCurves.json`）、LvUP ペース
- デモ4クラス基礎ステ・スキル威力
- ステージ難易度カーブ（敵ステ・ウェーブ構成）
- Phase 3 以降のスキル習得・AGI・強化ツリーとの整合

### スコープ外（Phase 8）

- 新機能追加（数値以外の変更は各フェーズで実施済みとする）

---

## 依存関係

```
Phase 1（戦闘デモ + 描画基盤 + プレースホルダー）
    ↓
Phase 2a（セーブ + ステージ + Lv ステ）
    ↓
Phase 2b（戦闘計算） ── 2c と並行可
Phase 2c（JSON クラス + 成長曲線）
    ↓
Phase 3（スキル習得 + AGI + 2枠目）  ← 次
    ↓
Phase 4（globalExp + ツリー + オフライン + Electron）
    ↓
Phase 6（本番スプライトアニメ）  ← 4 と並行も可（見た目のみ）
    ↓
Phase 7（スキル VFX：スキル別設定・新プリセット）
    ↓
Phase 8（バランス調整）
```
