# 進行・育成

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（完了）

- セーブなし・EXP/Lv なしの戦闘サンドボックス。
- Victory / Defeat 後、3 秒待って HP 全回復し同一ウェーブ再スポーン。
- 描画：アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 6）。

---

## Phase 2 — プレイヤー成長とステージ（完了）

### ステージ進行

- `stages.json` に順序付きステージを定義。
- **Victory** → 次のステージへ進行（最終ステージの次は同ステージを周回）。`totalClears` を +1。
- **Defeat** → `currentStageId` を 1 つ前のステージへロールバック（先頭ステージでは据え置き）。
- 戦闘終了後は 3 秒待って HP 全回復し再スポーン（Phase 1 と同様）。

### EXP 報酬

- ステージ単位の `expReward` は使わない。
- 勝利時、**撃破した敵の `exp` 合計**（`enemies.json` の各テンプレート）を **`playerProgress.exp` に加算**する。
- 計算：`computeStageExpReward` がステージ内の全ウェーブ・全敵の `exp` を合算。
- **廃止:** メンバー別 EXP 配分、「生存味方全員に付与」。

### プレイヤーレベル（`playerProgress`）

プレイヤーレベルは **アカウント共通** の 1 本。Lv / Exp / 習得・枠解放 / 編成ステ表示 / 戦闘ステ計算の入力はすべて `playerProgress` を正本とする。

```typescript
interface PlayerProgress {
  level: number; // 初期 1。全 15 クラスの習得・枠解放の単一基準
  exp: number;
}
```

| 項目 | ルール |
| ---- | ------ |
| EXP 付与 | 勝利時、撃破敵 `exp` 合計を `playerProgress.exp` に加算（メンバー別配分なし） |
| LvUP | `playerProgress.level` 上昇で **全クラス** の習得テーブル・枠段階が更新される |
| ステ成長 | LvUP で **maxHp, atk, def** が上昇（**Phase 4** で成長段階 + `growthPresets` 方式。詳細は [stats.md](stats.md)）。**REG は成長しない** |
| 戦闘 Lv | `resolveEffectiveLevel` が `playerProgress.level` を基準に Level Sync / Instant Lv20 を適用（オプション詳細は [Phase 11](#phase-11--解法評価メタ07582b6)） |
| Lv20 完成 | 習得・枠は Lv20 で頭打ち。Lv21+ はステータス救済のみ（[design-philosophy.md](../design-philosophy.md) §4） |

### セーブ（`SaveManager`）

`localStorage` キー：

| モード         | キー                            |
| -------------- | ------------------------------- |
| 確認モード     | `auto-battle-idle:save:verify`  |
| リリースモード | `auto-battle-idle:save:release` |

```typescript
interface SaveGameState {
  version: number;
  playerProgress: PlayerProgress;
  stageProgress: { currentStageId: string; totalClears: number };
  party: {
    classId: ClassId;
    build: CharacterBuild;
  }[];
  stageRecords?: Record<StageId, StageRecord>; // Phase 11c
  options?: {
    instantLv20?: boolean;
    levelSync?: boolean;
  }; // Phase 11b
}
```

初回セーブは `parties.json` からパーティを生成（`playerProgress` は level 1 / exp 0）。

保存タイミング：Victory/Defeat 後、60 秒ごと、`beforeunload` 時。パーティ編集時は即時。

### 習得済みビルドの永続化

各メンバーの `build: CharacterBuild` をセーブに含める。Lv の入力は **`playerProgress.level`**（`reconcileMemberBuild` / `reconcilePartyBuilds` / `levelGrowth.ts`）。

| フィールド                               | 永続化のタイミング                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `learnedPassiveIds` / `learnedActiveIds` | LvUP 時に `classes.json` の `skills[]` から再計算して更新                           |

- ロード時：`migrateSaveClassIds` で旧 classId（例: `at_sniper` → `at_ballista`）を置換したうえで、`reconcilePartyBuilds` が `playerProgress.level` と習得リストを突き合わせ、不整合を修復してから再保存する。
- `equippedActiveSlots` は歴史的互換フィールドとして残る場合があるが、設計上は使用しない。ロード時の整合対象は習得済みリストを正とする。
- 新アクティブ習得時は、付け替え操作なしで常時使用可能になる。

### 廃止・移行（メンバー個別 progress）

**廃止:** メンバー個別 `CharacterProgress`、`party[].progress`（クラス別 Lv / Exp）。

旧セーブはロード時に **`party[].progress` の最大 `level` / 最大 `exp`** から `playerProgress` を生成し、移行後はメンバー `progress` を削除する（読み取り専用互換は移行期のみ可）。**移行ルールの正本は本節のみ** — 他 doc はリンクのみ。

### 進行 UI

- 現在ステージ名（Canvas 左上）
- **プレイヤー共通 Lv（数値）+ Exp バー（戦闘 HUD）** — Exp バーの具体レイアウトは **TBD**（HUD 内の共通表示 1 か所を想定）
- **パーティ HUD スロット行** — クラス名 + HP 等。**メンバー別 `Lv{n}` 表記は廃止**。プレイヤー Lv / Exp は HUD 内の共通表示（レイアウト TBD）
- **パーティ編成メニュー**（`SkillMenuPanel`）— 画面設計の正本は [party-formation-ui.md](party-formation-ui.md)（Phase 4d）。ヘッダーに **`プレイヤー Lv {n}` のみ**（Exp バーは編成画面に出さない）
  - **HP** のみ英字表記、それ以外は日本語（攻撃力 / 防御力 / 魔法耐性 / 攻撃速度）
  - 攻撃速度は内部略称 **SPD**（`attackSpeedTier`）。UI では 5 段階ラベル（遅い〜早い）
  - 編成画面ではスキル buff 込みの実効値は表示しない（素のクラス + `playerProgress.level`）
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

`reconcileMemberBuild` / `reconcilePartyBuilds`（`skillBuild.ts`）が `playerProgress.level` と `classes.json` の `skills[]` から習得リストを同期する。詳細は Phase 2 セーブ節を参照。

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
- **Combat Feedback（roadmap 5d）** — VFX なし v1: Damage / Heal / DoT 数値 popup + Event popup（8 種）。正本 [combat-architecture.md](../combat-architecture.md) §8、実装表 [combat.md](combat.md#combat-feedbackvfx-なしv1)。Phase 3d 後・4a と並行可

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

## Phase 11 — 解法評価メタ（07582b6）

Phase 6 完了後に着手。**Lv / Exp 正本は Phase 2 の `playerProgress`**（[上記](#プレイヤーレベルplayerprogress)）。本 Phase は Stage Records とオプションの **実装**（schema 移行・`resolveEffectiveLevel`・HUD Exp 表示等）。タスク境界は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 11b / 11c。設計思想は [design-philosophy.md](../design-philosophy.md)、Player Level / Stage Records の概要は [system-mechanics.md](../system-mechanics.md)。

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

---

## 実装追随（doc 正本 vs 現行コード）

本 PR は doc のみ更新。コード・セーブ schema の追随は別 PR。

| 項目 | doc 正本 | 実装がまだ古い可能性 |
| ---- | -------- | -------------------- |
| `SaveGameState` | `playerProgress` 直下 | `party[].progress` 残存 |
| 表示 Lv | `playerProgress.level`（Party HUD スロット行に Lv は出さない） | `resolvePlayerDisplayLevel`、旧 HUD `Lv{n}` |
| 統計 UI Exp 行 | なし（戦闘詳細は Threat / ダメージ / 全状態バッジ） | `PartyMemberStatsDisplay` の Exp ラベル（あれば） |
| Victory EXP | `playerProgress.exp` 加算 | `member.progress.exp` への加算 |
| 習得 / 成長 Lv 入力 | `playerProgress.level` | `member.progress.level`（`skillBuild.ts` / `entities.ts` 等） |
