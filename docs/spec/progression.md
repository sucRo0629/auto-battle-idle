# 進行・育成

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（完了）

- セーブなし・EXP/Lv なしの戦闘サンドボックス。
- Victory / Defeat 後、3 秒待って HP 全回復し同一ウェーブ再スポーン。
- 描画：アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 6）。

---

## Phase 2 — 個別成長とステージ（完了）

### ステージ進行

- `stages.json` に順序付きステージを定義。
- **Victory** → 次のステージへ進行（最終ステージの次は同ステージを周回）。`totalClears` を +1。
- **Defeat** → `currentStageId` を 1 つ前のステージへロールバック（先頭ステージでは据え置き）。
- 戦闘終了後は 3 秒待って HP 全回復し再スポーン（Phase 1 と同様）。

### EXP 報酬

- ステージ単位の `expReward` は使わない。
- 勝利時、**撃破した敵の `exp` 合計**（`enemies.json` の各テンプレート）を生存味方全員に付与。
- 計算：`computeStageExpReward` がステージ内の全ウェーブ・全敵の `exp` を合算。

### 個別レベル（ステのみ）

> **Phase 11 予定:** メンバー個別 `CharacterProgress` は廃止し、セーブ直下のグローバル `playerProgress`（B 案）へ移行する。以下は Phase 2〜10 現行実装の記述。

```typescript
interface CharacterProgress {
  level: number; // 初期 1
  exp: number;
}
```

- LvUP で **maxHp, atk, def** が上昇（**Phase 4** で成長段階 + `growthPresets` 方式に刷新。詳細は [stats.md](stats.md)）。
- **REG は成長しない。**
- **Phase 2 では LvUP してもスキルは増えない。**

### セーブ（`SaveManager`）

`localStorage` キー：

| モード         | キー                            |
| -------------- | ------------------------------- |
| 確認モード     | `auto-battle-idle:save:verify`  |
| リリースモード | `auto-battle-idle:save:release` |

```typescript
interface SaveGameState {
  version: number;
  stageProgress: { currentStageId: string; totalClears: number };
  party: {
    classId: ClassId;
    progress: CharacterProgress;
    build: CharacterBuild;
  }[];
}
```

初回セーブは `parties.json` からパーティを生成。

保存タイミング：Victory/Defeat 後、60 秒ごと、`beforeunload` 時。パーティ編集時は即時。

### 習得済みビルドの永続化

各メンバーの `build: CharacterBuild` をセーブに含める。

| フィールド                               | 永続化のタイミング                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `learnedPassiveIds` / `learnedActiveIds` | LvUP 時に `classes.json` の `skills[]` から再計算して更新                           |

- ロード時：`migrateSaveClassIds` で旧 classId（例: `at_sniper` → `at_ballista`）を置換したうえで、`reconcilePartyBuilds` がレベルと習得リストを突き合わせ、不整合を修復してから再保存する。
- `equippedActiveSlots` は歴史的互換フィールドとして残る場合があるが、設計上は使用しない。ロード時の整合対象は習得済みリストを正とする。
- 新アクティブ習得時は、付け替え操作なしで常時使用可能になる。

### 進行 UI

- 現在ステージ名（Canvas 左上）
- メンバー別 Lv / Exp バー（パーティ HUD）
- **パーティ編成メニュー**（`SkillMenuPanel`）— 画面設計の正本は [party-formation-ui.md](party-formation-ui.md)（Phase 4d）。現行は選択中メンバーの **Lv 反映ステータス**を表示
  - **HP** のみ英字表記、それ以外は日本語（攻撃力 / 防御力 / 魔法耐性 / 攻撃速度）
  - 攻撃速度は内部略称 **SPD**（`attackSpeedTier`）。UI では 5 段階ラベル（遅い〜早い）
  - 編成画面ではスキル buff 込みの実効値は表示しない（素のクラス + Lv）
- ステージクリア / LvUP / ステージロールバックのログ（console）

---

## Phase 3 — スキル習得・戦闘拡張（完了）

### スキル習得

```typescript
interface ClassSkillUnlock {
  level: number; // この Lv 以上で習得
  skillIds: string[];
}
// classes.json の skills[] に定義。種別は data/skills/ から解決
```

- LvUP 時、`resolveLearnedSkills` が該当 `skillIds` を `learnedPassiveIds` / `learnedActiveIds` に反映。
- 習得したアクティブは、Lv に応じた枠数内で常時使用可能になる。付け替え・セット操作は行わない。
- 習得エントリは `classes.json` の各クラス `skills[]` に定義する。

### アクティブ枠（最大 4）

- 戦闘参加は **`learnedActiveIds`**（習得即参加）。
- 段階解放: Lv0=2 / Lv10=3 / Lv20=4（`getUnlockedActiveSlotCount`）。
- Party HUD: 2×2 リキャスト + 多段チャージストックピップ（`maxCharges > 0` 時）。

### 習得済みビルドの永続化

`reconcileMemberBuild` / `reconcilePartyBuilds`（`skillBuild.ts`）がレベルと `skills[]` から習得リストを同期する。詳細は Phase 2 セーブ節を参照。

---

## Phase 4 — クラスマスタ

Phase 3 の習得機構 + キャラクターデータ GUI で **クラス 15 種**を確定する。

- 数値・習得タイミングの最終調整は **Phase 8**
- スキル説明（`formatSkillText`）は **データ PR ごと** に同梱（Phase 4b）。一括 polish は Phase 8 前

### ステータス・成長（Phase 4a）

- **Lv1 基準値** — `classes.json` の `maxHp` / `atk` / `def`
- **成長段階** — 同ファイルの `growthTier`（HP / ATK / DEF 各 低・中・高）
- **成長マスタ** — `levelCurves.json` の `growthPresets`（defender / attacker / supporter）
- **術師** — `growthPresetKey: "caster"` で HP/DEF は supporter 表、ATK は attacker 表
- **攻撃速度** — `attackSpeedTier` + `attackSpeedPresets`（基本攻撃 CD のみ）
- 計算: `src/progression/levelGrowth.ts`（`resolveStatGrowth`, `computeStatsAtLevel`）
- 開発 GUI: `ClassEditorStep` に成長段階・SPD・Lv10 プレビュー

詳細は [stats.md](stats.md)。

---

## Phase 5 — ステージ作成

Phase 4a で確定したクラス・スキルを前提に、メインモード用の固定ステージ（`stages.json`）と敵テンプレート（`enemies.json`）を整備する。敵編成方針は [enemy-design-concept.md](../enemy-design-concept.md)。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 5（5a 敵 / 5b コンテンツ / 5c 編集 GUI）。

- `stages.json` 配列順 = メイン進行チェーン（Phase 2a の Victory / Defeat ルール）
- Wave / `spawnX` — [battle-field.md](battle-field.md)
- 難易度・EXP の最終調整は **Phase 8**

---

## Phase 6 — 演出アセット + 演出調整ツール

進行・育成とは独立。**確定 classId / enemyId から順次** PNG とタイミングを載せる。詳細は [phase-roadmap.md](../plans/phase-roadmap.md)。

- `data/entityAnimLayout.json` + `sheets/bodies/{id}.png`（idle/move/death、味方・敵共通レイアウト）
- 通常攻撃・全 active = `sheets/skills/*.png`（64×48 strip）。遠隔 basic も弓引き PNG で body 可
- **演出調整ツール** — Canvas プレビュー + VFX / タイミング調整
- **Combat Feedback（roadmap 5d）** — Damage / Heal / DoT ポップアップと Event ポップアップの分離・レイアウト。正本 [combat-architecture.md](../combat-architecture.md) §8。Phase 3d 後・4a と並行可

---

## Phase 7 — VFX PNG 描画（基盤のみ）

Phase 6 の演出ラボで VFX **調整** は可能。Phase 7 では PNG strip（`sheets/vfx/`）描画の型・再生パイプラインは実装済みだが、本番 VFX PNG の投入とスキル対応は未完了。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 7。

---

## Phase 8 — バランス調整

Phase 3〜7 および Phase 5 の固定ステージ骨格完了後。敵 `exp`、成長曲線、クラス/スキル/ステージ数値の体感チューニング。詳細は [phase-roadmap.md](../plans/phase-roadmap.md) を参照。

### passive / active 枠構造

- 全クラス共通で passive / active ともに Lv0=2、Lv10=3、Lv20=4。
- active は `getUnlockedActiveSlotCount`、passive は同じ Lv 段階に対応する解決処理を使う。
- **UI**（HUD / スキル表示）と**戦闘**（`createCooldowns` 等）の両方で、習得済み passive / active の常時使用枠として扱う。
- 付け替え・セット・装備変更によるビルド分岐は行わない。ビルドは `classes.json` の習得構造で決まる。

---

## Phase 9 — パーティ全体メタ

Phase 8（バランス調整）完了後に着手。Electron シェルは `electron/main.mjs` に基盤のみ一部実装済み。

### globalExp

- 個別 EXP とは別リソース。
- 勝利とオフライン時間で付与（抽象計算、戦闘シミュレーションなし）。

### 強化ツリー

- `data/enhancementTree.json`
- globalExp を消費；**maxHp / atk / def** をパーティ全体に強化。
- REG は対象外。

### オフライン報酬

- セーブに `lastActiveAt` を保持。
- 起動時に経過時間分の globalExp を付与（上限あり）。

### Electron デスクトップ

- 小さな常に前面ウィンドウ
- セーブ形式はブラウザと同一

---

## 最終ステータス式（目標）

```
finalStat = Lv1 基準値（classes.json）
          + resolveStatGrowth(growthTier, growthPresets) × (Lv - 1)
          × enhancementMultiplier   // Phase 9
```

スキル・パッシブは戦闘時に上乗せ（[combat.md](combat.md) 参照）。

---

## Phase 11 — プレイヤーレベル + 解法評価メタ（07582b6）

Phase 6 完了後に着手。タスク一覧は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 11。設計思想は [design-philosophy.md](../design-philosophy.md)、Player Level / Stage Records は [system-mechanics.md](../system-mechanics.md)。

### グローバル `playerProgress`（B 案）

プレイヤーレベルは **アカウント共通** の 1 本。Phase 2 の `party[].progress`（メンバー個別 Lv / Exp）は Phase 11 で廃止する。

```typescript
interface PlayerProgress {
  level: number; // 初期 1。全 15 クラスの習得・枠解放の単一基準
  exp: number;
}

interface SaveGameState {
  version: number;
  playerProgress: PlayerProgress;
  stageProgress: { currentStageId: string; totalClears: number };
  party: {
    classId: ClassId;
    build: CharacterBuild;
    // progress は削除（移行期のみ読み取り互換）
  }[];
  stageRecords?: Record<StageId, StageRecord>;
  options?: {
    instantLv20?: boolean;
    levelSync?: boolean;
  };
}
```

| 項目 | ルール |
| ---- | ------ |
| EXP 付与 | 勝利時、撃破敵 `exp` 合計を `playerProgress.exp` に加算（メンバー別配分なし） |
| LvUP | `playerProgress.level` 上昇で **全クラス** の習得テーブル・枠段階が更新される |
| 戦闘 Lv | `resolveEffectiveLevel` が `playerProgress.level` を基準に、Level Sync / Instant Lv20 を適用 |
| Lv20 完成 | 習得・枠は Lv20 で頭打ち。Lv21+ はステータス救済のみ |
| 移行 | 旧セーブは `party[].progress` の最大 `level` / `exp` 等から `playerProgress` を生成 |

### Instant Lv20 / Level Sync

- **Instant Lv20** — 任意オプション。戦闘計算・習得表示を Lv20 扱いにする（編成検証・周回削減用）。セーブ上の実 `playerProgress.level` は変えない。
- **Level Sync** — 任意オプション。`effectiveLevel = min(playerProgress.level, stage.recommendedLevel)` で戦闘ステ・習得判定を行う。育成差を除外し編成解法を検証する。

### Stage Records

ステージ ID ごとに攻略履歴を保持する。主要指標は **最低クリアレベル**（`playerProgress.level` の実値。Level Sync 中の effective Lv ではない）。

```typescript
interface StageRecord {
  firstClearLevel?: number;
  lowestClearLevel?: number;
  bestTimeMs?: number;
  latestPartyClassIds?: ClassId[];
  levelSyncClear?: boolean;
}
```

`stages.json` に `recommendedLevel` を追加する。ソート既定: `lowestClearLevel ASC` → `bestTimeMs ASC`。

---

## Phase 10 — ローグライクモード（仮称）

Phase 9 完了後に着手。メインモードのステージ進行・EXP とは **独立したラン** で、ランダム問題の解法探索を提供する。

詳細は [roguelike-mode.md](roguelike-mode.md)。実装タスクは同 doc §18 および [phase-roadmap.md](../plans/phase-roadmap.md) Phase 10。
