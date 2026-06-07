# フェーズロードマップ

Auto Battle Idle の開発フェーズ一覧。ゲームルールは [spec](../spec/README.md) を参照。

## 概要

| Phase | ゴール | 状態 |
|-------|--------|------|
| **1** | 戦闘コアデモ（自動戦闘 + Canvas 表示） | **完了** |
| **2a** | 放置 MVP：セーブ・ステージ進行・個別Lv（ステのみ） | 未着手 |
| **2b** | 戦闘計算の整理・調整 | Phase 1 で大部分実装済み（下記） |
| **2c** | JSON 駆動クラス、ビルドのハードコード排除 | 未着手 |
| **3** | Lvアップ時スキル習得、AGI、アクティブ2枠目 | 未着手 |
| **4** | globalExp、強化ツリー、オフライン報酬、Electron | 未着手 |

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
- Victory / Defeat → 3秒待機 → HP全回復 → 同一ステージ再スポーン
- Canvas 2D：スプライト、idle/attack/heal/hurt/death、近接突進/遠隔弾、ダメージポップアップ
- buff VFX：対象スプライトの白い光（約0.8秒）
- 表示モード：`full`（デフォルト）、`?mode=ambient`（コンパクト）
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

### 2a — 進行コア

- オートセーブ / ロード（`localStorage`）
- 複数ステージ進行：Victory で `currentStageId` を進める；Defeat は同ステージ再挑戦
- 勝利時に個別キャラ EXP・レベル
- LvUP で **maxHp / atk / def のみ上昇**（スキル習得なし）
- 進行 UI：ステージ名、パーティ Lv

### 2b — 戦闘計算

Phase 1 の時点で `src/battle/combatMath.ts` に実装済み。Phase 2b は主に検証・調整と [combat.md](../spec/combat.md) との同期。

### 2c — クラス基盤

- セーブ + JSON のみからパーティ/ビルドを構築（コード内デモビルドのハードコード排除）
- `levelCurves.json` によるクラス別ステ成長
- デモ4クラスのバランス調整

---

## Phase 3 — スキル・戦闘拡張

- LvUP 時 `skillUnlocks` → `learnedPassiveIds` / `learnedActiveIds` に追加
- **AGI** ステ：基本攻撃 CD のみ加速
- アクティブ装備2枠目（解放条件は未定）
- セーブに習得済みビルドを永続化

---

## Phase 4 — メタ・デスクトップ

- 勝利・オフライン時間から **globalExp** 付与
- 強化ツリー（`enhancementTree.json`）：パーティ永続のステノード
- オフライン抽象報酬（戦闘シミュレーションはしない）
- Electron シェル：frameless、常に前面、トレイ、片隅配置；`ambient` UI を流用

---

## 依存関係

```
Phase 1（戦闘デモ）
    ↓
Phase 2a（セーブ + ステージ + Lv ステ）
    ↓
Phase 2b（戦闘調整） ── 2c と並行可
Phase 2c（JSON クラス + 成長曲線）
    ↓
Phase 3（スキル習得 + AGI + 2枠目）
    ↓
Phase 4（globalExp + ツリー + オフライン + Electron）
```
