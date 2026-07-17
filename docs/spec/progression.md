# 進行・育成

**R3 注記（2026-07-12）:** 新作戦ループの進行正本は **§進行の 3 層（R3）** と [operation-loop.md](operation-loop.md)。Wave 作戦ループ・作戦状態 / 戦闘状態・リトライ・作戦途中セーブ方針はそちらを優先する。

**R12k 再設計（2026-07-17）:** 「固定 Stage のメイン進行 + 独立したローグライク副モード」という旧構成を撤回候補とする。ローグライク / ローグライトを含む候補をゲーム適合性で比較し、ラン内進行・固定クエスト・作戦外解禁の境界を R12k で再定義する。旧 Phase 10 と [roguelike-mode.md](roguelike-mode.md) は現行正本ではない。

---

## 進行の 3 層（R3）

新作戦ループでは、進行を次の 3 層に分離する。**レベル・EXP を進行の中心に置かない。**

| 層 | 内容 | 正本 |
| -- | ---- | ---- |
| **作戦外進行** | 作戦選択、クリア記録、兵科解禁など将来の恒久報酬 | 本書 §作戦外進行 |
| **作戦内進行** | 現在 Wave、クリア済み Wave、作戦内リソース、取得パッシブ、Wave 開始チェックポイント | [operation-loop.md](operation-loop.md) |
| **Wave 戦闘** | 一時的な combat state、勝敗判定、Wave 終了時破棄 | [operation-loop.md §5](operation-loop.md#5-wave-戦闘) + [battle-field.md](battle-field.md) |

### 作戦外進行（R3 方針）

| 項目 | 内容 |
| ---- | ---- |
| 作戦選択 | **任意選択**。選択順は固定しない |
| クリア記録 | 作戦完了時に恒久記録へ反映する候補（具体は後続） |
| 兵科解禁等 | 恒久報酬として設計。旧 `unlockClassIdsOnClear`（例: demo 弩砲士）を **そのまま継承しない** |
| セーブ | 作戦 **途中** は保存しない。作戦 **完了時** のみ既存 Save へ反映する設計候補 |

**参考として残す:** 既存 7 ステージの非一本道選択、`clearedStageIds` の考え方は作戦選択 UI の参考にできる（[stage-selection-ui.md](stage-selection-ui.md)）。

**新仕様の原則:**

- 作戦内では **Wave 順** に進む
- 作戦敗北で **別作戦の選択状態を巻き戻さない**
- **ステージに想定レベル / ランクは置かない**（敵の強さは兵科基礎ステ + `enemyGroups` scale）
- **クラス側に恒久 Lv / ランク成長は置かない**（強化は作戦内リソース → パッシブ取得。[operation-loop.md](operation-loop.md)）

### Stage / Wave データ（現行方針）

正本の詳細責務は [combat-data-schema-refactor.md §6–7](../plans/combat-data-schema-refactor.md#6-敵グループenemygroups)。実装追随メモ:

| 項目 | 現行方針 |
| ---- | -------- |
| Wave 編成 | `waves[].enemyGroups`（stage 直下 `enemyGroups` は単一 Wave 省略 / 移行期） |
| 敵の強さ | **`level` / `recommendedLevel` で表現しない**。`classId` 基礎ステ × `hpScale` / `atkScale` / `defScale` / `resScale` |
| `recommendedLevel` | **legacy 任意フィールド**（旧 Level Sync・☆・UI）。新 Stage では未設定。validate でも `enemyGroups` 必須条件にしない |
| 味方強化 | Wave 勝利後の **作戦内リソース** でパッシブ取得（恒久 EXP / Lv ではない） |
| 敵内部 spawn | 互換のため `ENEMY_GROUP_BASE_LEVEL`（=1）を `computeStatsAtLevel` 等へ渡すが、強さ差の正本ではない |

```typescript
/** 新仕様 Stage（概念）。実装型は types.ts StageDef */
interface StageDefCurrent {
  id: string;
  displayName: string;
  waves: Array<{
    enemies: []; // 移行期 placeholder 可
    enemyGroups: StageEnemyGroup[];
  }>;
  formationHintJa?: string;
  // recommendedLevel?: number; // legacy — 新規に書かない
}
```

### Legacy — 旧線形ステージ進行（新作戦ループの正本から外す）

以下は **Phase 2 放置 MVP / Phase 6d 目標** の記述。**R3 以降の作戦ループ正本ではない。**

| 旧仕様 | 扱い |
| ------ | ---- |
| ステージ勝利で自動的に次ステージへ進む一本道 | legacy |
| 敗北で前ステージへ戻る rollback | legacy（リトライは [operation-loop.md §9](operation-loop.md#9-リトライ導線r7-接続)） |
| `currentStageId` を線形進行位置として扱うこと | legacy |
| Level / EXP 報酬を進行の中心とすること | 廃止方向（R1） |
| Instant Lv20 / Level Sync | legacy（R1 廃止方向） |
| 旧ローグライク解禁条件 | 採用しない（[operation-loop.md §13](operation-loop.md#13-旧ローグライク仕様との関係)） |

---

## Legacy — Phase 1〜12 進行仕様（現行コード資産）

> 以下は **2026-07-12 方針転換前** の Phase 記述と、現行 production が参照しうる Save / EXP / Stage Records の説明。**新作戦ループ（R3）の正本ではない。** 実装追随は R5 以降。

**Phase 1** で存在するものと、以降のフェーズで追加するもの。

## Phase 1（完了）

- セーブなし・EXP/Lv なしの戦闘サンドボックス。
- Victory / Defeat 後、3 秒待って HP 全回復し同一ウェーブ再スポーン（**Phase 6d 以降はリザルト → マップ導線に置換**）。
- 描画：アニメーション基盤 + ロール別プレースホルダー（本番スプライトは Phase 6）。

---

## Phase 2 — プレイヤー成長とステージ（完了）

### ステージ進行（Legacy）

> **R3:** 新作戦ループでは [operation-loop.md](operation-loop.md) の作戦選択・Wave 順進行が正本。本節は legacy。

- `stages.json` に順序付きステージを定義。

**Phase 2（放置 MVP）— レガシー。Release M1 前の Phase 6d で置き換え**

以下は **Phase 2 当時の放置型プロトタイプ** 向けルール。現行コードに残っているが、**本番導線（Phase 6d）の正本ではない**。

| ルール | レガシー挙動（現行コード） | Phase 6d 以降（目標） |
| ------ | -------------------------- | --------------------- |
| Victory 後 | `currentStageId` を **自動で次ステージ**へ更新（最終後は同ステージ周回）。`totalClears` +1 | 報酬・クリア記録は即時。**次ステージの出撃はマップ選択**（自動で `currentStageId` を進めない） |
| Defeat 後 | `currentStageId` を **1 つ前へ自動ロールバック**（先頭は据え置き） | ロールバックルール自体は維持可。**リザルト → マップ**で明示。戦闘への即再開なし |
| 戦闘終了後 | **3 秒待機 → HP 全回復 → 同一画面で再スポーン**（Phase 1 継承） | 勝利演出後 **リザルト画面**。再戦は **マップ → 編成 → 出撃** |

**レガシー実装の主な所在（Phase 6d で改修）**

| 箇所 | 内容 |
| ---- | ---- |
| `BattleEngine` | `RESTART_DELAY_SEC = 3` → `respawnAfterEnd()` で **無入力再開** |
| `applyVictoryRewards` / `handleVictory` | 勝利時に `getNextStageId` で **`currentStageId` 自動更新** |
| `applyStageRollbackOnDefeat` / `handleDefeat` | 敗北時に **自動ロールバック**（セーブ更新） |
| ステージ選択（リリース） | **UI なし**。`currentStageId` は自動進行のみ |
| `DebugMenuPanel` | **verify ON 時のみ**。「周回ステージ」`<select>` + Wave 固定（`setLoopStage` / `setLoopWave`）。本番マップ（6d）の暫定代替 |
| `GameSession.start()` | 起動 **即 `startBattle()`**（トップ / マップなし） |

詳細な画面遷移は [phase-roadmap.md §6d](../plans/phase-roadmap.md#6d--画面構成導線release-m1) を正とする。

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
| ステ成長 | LvUP で **maxHp, atk, def** が上昇（**Phase 4** で成長段階 + `growthPresets` 方式。詳細は [stats.md](stats.md)）。**RES（魔法耐性）は成長しない** |
| 戦闘 Lv | `resolveEffectiveLevel` が `playerProgress.level` を基準に Level Sync / Instant Lv20 を適用（オプション詳細は [Phase 11](#phase-11--解法評価メタ07582b6)） |
| Lv20 完成 | 習得・枠は Lv20 で頭打ち。Lv21+ はステータス救済のみ（[design-philosophy.md](../design-philosophy.md) §4） |

### セーブ（`SaveManager`）

`localStorage` キー：

| モード         | キー                            |
| -------------- | ------------------------------- |
| 確認モード     | `hensei-only:save:verify`  |
| リリースモード | `hensei-only:save:release` |

起動時に `migrateLegacyProjectStorage()` が旧 `auto-battle-idle:*` キーを上記 prefix へ移行する（`src/projectIdentity.ts`）。

```typescript
interface SaveGameState {
  version: number;
  playerProgress: PlayerProgress;
  stageProgress: { currentStageId: string; totalClears: number; clearedStageIds?: string[] };
  party: {
    classId: ClassId;
    build: CharacterBuild;
  }[];
  stageRecords?: Record<StageId, StageRecord>; // Phase 6d 記録 / Phase 12c UI 拡張
  options?: {
    instantLv20?: boolean;
    levelSync?: boolean;
  }; // Phase 11b
}
```

初回セーブは `parties.json` からパーティを生成（`playerProgress` は level 1 / exp 0）。編成画面で選べるクラスは `unlockedClassIds`（新規 demo は `parties.json` 在籍 + `DEFAULT_ROSTER_EXTRAS.demo` = M1 8 クラス）。

**ステージクリア報酬（クラス解禁）:** `StageDef.unlockClassIdsOnClear`（任意 `ClassId[]`）。勝利時 `applyVictoryRewards` がクリアした stage の id を参照し、`save.unlockedClassIds` へ merge（重複除去・冪等）。体験版 `demo_ch1_07` は `["at_ballista"]`。ロード時に extras へ再同期しないため、既存セーブの `unlockedClassIds` は維持される。

**クリア済み stage 一覧（最小）:** `stageProgress.clearedStageIds?: string[]`。verify OFF（リリース導線）の勝利時のみ、クリアした `stageId` を重複除去 merge。**進行制御・ロックには使わない**。verify ON（Debug ループ）では記録しない。

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
- **ステージ選択** — **本番 UI なし**。リリースモードではセーブ上の `currentStageId` と勝利時自動進行のみ。**確認モード（verify ON）** では `DebugMenuPanel`（`BattleView` 内）の **周回ステージ** `<select>` で任意ステージをピン留め可能（`GameSession.setLoopStage`）。Wave 固定・プレイヤー Lv 変更も同パネル。**Phase 6d** でリリース向けマップ選択を追加し、本番導線では `DebugMenuPanel` を出さない（**Phase 7** demo ビルド）
- **プレイヤー共通 Lv（数値）+ Exp バー（戦闘 HUD）** — Exp バーの具体レイアウトは **TBD**（HUD 内の共通表示 1 か所を想定）
- **パーティ HUD スロット行** — クラス名 + HP 等。**メンバー別 `Lv{n}` 表記は廃止**。プレイヤー Lv / Exp は HUD 内の共通表示（レイアウト TBD）。**クラス名またはアイコン+HP 行**へマウスオーバーで **当該スロットのクラス名直上**に **戦闘中実効ステ**（HP 現在/Max・ATK/DEF/RES/SPD + 右列補正）— [battle-field.md §7.1.1](battle-field.md#711-戦闘中ステータスparty-hud-クリック)
- **パーティ編成メニュー**（`SkillMenuPanel`）— 画面設計の正本は [party-formation-ui.md](party-formation-ui.md)（Phase 4d）。ヘッダーに **`プレイヤー Lv {n}` のみ**（Exp バーは編成画面に出さない）
  - **HP** のみ英字表記、それ以外は日本語（攻撃力 / 防御力 / 魔法耐性 / 攻撃速度）
  - 攻撃速度は内部略称 **SPD**（`attackSpeedTier`）。UI では 5 段階ラベル（遅い〜早い）
  - 編成画面ではスキル buff 込みの実効値は表示しない（素のクラス + `playerProgress.level`）。**戦闘 HUD クリックパネル**は buff/debuff 込みの実効値 + 補正差分を表示（[battle-field.md §7.1.1](battle-field.md#711-戦闘中ステータスparty-hud-クリック)）
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
- Party HUD: Lv 帯解放枠数（Lv1=2 / Lv10=3 / Lv20=4）の 2 列リキャスト + 多段チャージ縦セグメント（`maxCharges > 0` 時・バー左端オーバーレイ）。

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

## Phase 5 — ステージ作成（旧節・要更新）

> **正本は [phase-roadmap.md](../plans/phase-roadmap.md)** — 体験版 **Phase 6**、本編 **Phase 8**。本節の Phase 5/6/7/8 表記は旧ロードマップの残骸。

Phase 4a で確定したクラス・スキルを前提にステージ・敵を整備。敵編成方針は [enemy-design-concept.md](../enemy-design-concept.md)。

- 体験版: `stages-demo.json` 等 — **Phase 6b**
- 本編: `stages.json` — **Phase 8b**
- 難易度・EXP の最終調整 — **Phase 6c / 8c**

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

## Phase 8 — バランス調整（旧節・要更新）

> **正本は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 6c / 8c**。

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
- RES（魔法耐性）は対象外。

### オフライン報酬

- セーブに `lastActiveAt` を保持。
- 起動時に経過時間分の globalExp を付与（上限あり）。

### デスクトップ配布（Phase 7）

配信・Release スコープは [phase-roadmap.md §Release マイルストーン](../plans/phase-roadmap.md#release-マイルストーン) を正とする。

- **Release M1/M2:** itch.io 等向け zip（Electron パッケージ）。**常時前面・トレイ常駐は廃止** — 通常ゲームウィンドウ
- セーブ形式はブラウザと同一（demo / full でキー分離）
- `electron/main.mjs` に開発用シェル基盤あり（M1 前に通常ウィンドウへ寄せるリファクタ予定）

---

## 最終ステータス式（目標）

```
finalStat = Lv1 基準値（classes.json）
          + resolveStatGrowth(growthTier, growthPresets) × (Lv - 1)
          × enhancementMultiplier   // Phase 9
```

スキル・パッシブは戦闘時に上乗せ（[combat.md](combat.md) 参照）。

---

## Phase 12 — 解法評価メタ（07582b6）

Phase 8 完了後に着手（[phase-roadmap.md](../plans/phase-roadmap.md) Phase **12b / 12c**）。**Lv / Exp 正本は Phase 2 の `playerProgress`**（[上記](#プレイヤーレベルplayerprogress)）。Stage Records の **データ更新は Phase 6d（Victory 時）** から開始。Instant Lv20 / Level Sync の戦闘反映と横断 UI は 12b / 12c。設計思想は [design-philosophy.md](../design-philosophy.md)、概要は [system-mechanics.md](../system-mechanics.md)。

### Instant Lv20 / Level Sync

- **Instant Lv20** — 任意オプション（**Phase 12b**）。戦闘計算・習得表示を Lv20 扱いにする（編成検証・周回削減用）。セーブ上の実 `playerProgress.level` は変えない。
- **Level Sync** — **出撃ごと** にステージ詳細のチェックで指定（[stage-selection-ui.md §4](stage-selection-ui.md#4-レベルシンクチェックボックス)）。`effectiveLevel = min(playerProgress.level, stage.recommendedLevel)` で戦闘ステ・習得判定。`levelSyncUsed` を履歴に記録。

### Stage Records

ステージ ID ごとに **2 枠のベスト記録** を保持する。各枠は **更新されるまでずっと残す**（新規クリアがその枠を上回らなければ上書きしない）。集約指標の主指標は **最低クリアレベル** = 低レベル枠の `clearLevel`。

#### 記録するレベル（`clearLevel`）

**`clearLevel` = その出撃でステージをクリアした実効レベル**（戦闘・習得判定に使った Lv）。`playerProgress.level`（アカウント Lv）そのものではない。

Victory 確定時に、当該 sortie のオプションを入力として **`resolveEffectiveLevel`**（Phase 12b で単一経路化）と同じ式で求める。

| 出撃オプション | `clearLevel` |
| -------------- | ------------ |
| Level Sync **OFF** | `playerProgress.level` |
| Level Sync **ON** | `min(playerProgress.level, stage.recommendedLevel)` |
| Instant Lv20 **ON**（Phase 12b） | `20`（他オプションと併用時の優先順位は 12b で `resolveEffectiveLevel` に固定） |

例: アカウント Lv 35・想定 Lv 20・Level Sync ON → **`clearLevel = 20`**（記録・☆・最低 Lv 集計すべて 20 として扱う）。

#### データ形状

```typescript
/** ステージ JSON — legacy Phase 12 / 体験版記録用の形状メモ（新正本ではない） */
interface StageDef {
  id: string;
  displayName: string;
  /** legacy — 想定レベル。新仕様 Stage では未使用・未設定可 */
  recommendedLevel?: number;
  /** クラスベース敵編成。新仕様では `waves[].enemyGroups` が正本 */
  enemyGroups?: StageEnemyGroup[];
  /** legacy 敵編成。新正本では enemyGroups あり時は **不要**（省略可）。 */
  waves?: StageWave[];
}

/** v0.3.2 — ステージ直下の敵グループ（wave 単位ではない） */
interface StageEnemyGroup {
  classId: ClassId;
  count: number; // 正の整数
  hpScale?: number; // 省略時 1.0。正数
  atkScale?: number;
  defScale?: number;
  resScale?: number;
}
```

**敵編成の二系統（v0.3.2 → 現行）**

| 経路 | データ | 戦闘生成 |
| ---- | ------ | -------- |
| **新（現行方針）** | `waves[].enemyGroups`（または stage 直下）+ scale。**`recommendedLevel` 不要** | `expandEnemyGroups` → 基礎ステ（内部 `ENEMY_GROUP_BASE_LEVEL`）× scale。配置は `enemyFormation.ts` |
| **legacy** | `waves[].enemies[]` の `templateId` + `spawnX` | `enemies.json` テンプレから生成 |

- **Phase B1/B2（旧記述の訂正）:** かつては `recommendedLevel` を敵 Lv に使っていた。**現行方針では敵ステに使わない**（[上記 §Stage / Wave データ](#stage--wave-データ現行方針)）。
- `enemyGroups` ありでも `recommendedLevel` は **任意**（validate 必須にしない）。
- **正本:** `enemyGroups` があれば **`waves` は不要**（省略可）。体験版は 1 stage = 1 `enemyGroups` 配列。
- **移行期（Phase A validate / loader）:** 現行 `parseStages` が `waves` 非空配列を要求するため、データ上は `waves: [{ enemies: [] }]` プレースホルダを置く。空 wave では legacy `templateId` 検証をスキップ。将来 validate を正本に合わせて `waves` 省略可にする。
- legacy ステージ（`enemyGroups` なし）は従来どおり `waves[].enemies` 非空必須。
- `enemies.json` / `templateId` / `spawnX` は移行期間中も維持。

```typescript
/** enemyGroups 展開後の 1 体分（CombatantState 生成前） */
interface ResolvedEnemySpawnSpec {
  classId: ClassId;
  level: number; // 内部互換 ENEMY_GROUP_BASE_LEVEL。強さの正本ではない
  hpScale?: number;
  atkScale?: number;
  defScale?: number;
  resScale?: number;
  groupIndex: number;
  indexInGroup: number;
  groupCount: number;
  spawnUnitKey: string; // `g{groupIndex}_i{indexInGroup}`
}
```

```typescript
/** 1 回の勝利ごとに 1 件追加（legacy Stage Records） */
interface StageClearEntry {
  clearLevel: number; // 勝利時の実効 Lv（上記 §記録するレベル）
  clearTimeMs: number; // 戦闘開始〜全 Wave クリア
  partyClassIds: ClassId[]; // 編成 4 スロット順（空き枠は null 不可 — 勝利時 4 人前提）
  levelSyncUsed: boolean;
  atRecommendedLevel: boolean; // clearLevel <= recommendedLevel（実効 Lv 基準）
}

interface StageRecord {
  /** 低レベルクリア枠（1 件）— 史上最低 clearLevel の run */
  lowestLevelClear?: StageClearEntry;
  /** 最短タイム枠（1 件）— 史上最短 clearTimeMs の run */
  fastestTimeClear?: StageClearEntry;
}
```

同一 run が両枠を保持しているときは **同内容を 2 フィールドに持ってよい**（リザルト表示では 1 行にまとめてよい）。

セーブ: `stageRecords?: Record<StageId, StageRecord>`。

#### 2 枠の更新ルール（Victory 時）

新規 `StageClearEntry` を生成したあと、枠ごとに **現 holder と比較** する。敗北では更新しない。

| 枠 | 更新条件（新記録が現 holder を置き換える） |
| -- | -------------------------------------------- |
| **低レベルクリア** (`lowestLevelClear`) | `clearLevel` がより **低い**。同 Lv なら `clearTimeMs` がより **短い** |
| **最短タイム** (`fastestTimeClear`) | `clearTimeMs` がより **短い**。同タイムなら `clearLevel` がより **低い** |

- 枠が空（初クリア）ならその run で埋める。
- 条件を満たさない新規クリアは **その枠を更新しない**（他枠のみ更新されうる）。
- **Release M1（体験版）** からリザルト記録・2 枠表示を **必須**（Phase **6d**）。

#### Victory 時の手順

1. 勝利確定後、当該 sortie から **`clearLevel`（実効 Lv）** を算出。
2. `StageClearEntry` を 1 件生成（`atRecommendedLevel` = `recommendedLevel` ありかつ `clearLevel <= recommendedLevel`）。
3. 上記 **2 枠の更新ルール** で `lowestLevelClear` / `fastestTimeClear` をそれぞれ判定・更新。
4. 敗北では更新しない。

#### リザルト・詳細の表示

- **最大 2 行**（低レベル枠・最短枠。同一 run なら **1 行** にまとめてよい）。
- ラベル例: 「最低 Lv」「最速」— i18n は **4e**。
- 行内ソート（2 行あるとき）: **`clearLevel` ASC** → **`clearTimeMs` ASC**。
- ステージ選択一覧のサマリー: `lowestLevelClear.clearLevel` / `fastestTimeClear.clearTimeMs`。

ステージ横断の Records 一覧（Phase 12c）は、各ステージの低レベル枠・最短枠を集約して表示する。ステージ選択一覧の並びは **JSON 配列順**（表示順。解放順ではない）のまま（[stage-selection-ui.md §2](stage-selection-ui.md#2-ステージ選択)）。

#### 適正クリアマーク（☆）

- **適正クリア:** `atRecommendedLevel === true` — 記録 **`clearLevel`（実効 Lv）≤ `recommendedLevel`**。
- UI: 履歴行とステージ選択一覧に ☆（[stage-selection-ui.md §5](stage-selection-ui.md#5-適正クリアマーク)）。
- Level Sync ON で実 Lv が想定超過でも、**`clearLevel` が想定以下なら ☆ あり**（実際にその Lv 帯でクリアした記録として扱う）。

#### 実装フェーズ

| 内容 | Phase |
| ---- | ----- |
| `recommendedLevel` 投入（体験版ステージ） | **6b** |
| Victory 時 `stageRecords` 更新、リザルト / 詳細の **2 枠** 表示（**M1 必須**） | **6d** |
| Instant Lv20、横断 Records UI、`resolveEffectiveLevel` 一本化 | **12b / 12c** |

---

## Phase 10 — ローグライクモード（仮称）

> **Legacy。** Phase 9 完了後に「メインモードのステージ進行・EXPとは独立した副モード」を作る計画は凍結した。現行ロードマップの R12k で、ローグライクをメインにする可能性を含めて再設計する。

旧案の詳細は [roguelike-mode.md](roguelike-mode.md)。マップ・報酬・進行の発想素材に限り、R12k の判断を経て再利用する。

---

## 実装追随（doc 正本 vs 現行コード）

本 PR は doc のみ更新。コード・セーブ schema の追随は別 PR。

| 項目 | doc 正本 | 実装がまだ古い可能性 |
| ---- | -------- | -------------------- |
| `SaveGameState` | `playerProgress` 直下 | `party[].progress` 残存 |
| 表示 Lv | `playerProgress.level`（Party HUD スロット行に Lv は出さない） | `resolvePlayerDisplayLevel`、旧 HUD `Lv{n}` |
| 統計 UI Exp 行 | なし（戦闘詳細は与ダメ / 被ダメ / 全状態バッジ） | `PartyMemberStatsDisplay` の Exp ラベル（あれば） |
| Victory EXP | `playerProgress.exp` 加算 | `member.progress.exp` への加算 |
| 習得 / 成長 Lv 入力 | `playerProgress.level` | `member.progress.level`（`skillBuild.ts` / `entities.ts` 等） |
| ステージ進行 UX | Phase 6d — マップハブ・リザルト経由 | Phase 2 放置 MVP — 勝利で `currentStageId` 自動更新 + 3 秒後 `respawnAfterEnd`（[§ステージ進行](#ステージ進行)） |
| ステージ選択 UI | Phase 6d マップ + 詳細 spec | 本番 UI なし + verify 時 `DebugMenuPanel`（[§進行 UI](#進行-ui)） |
| `stageRecords` | Phase 6d — **2 枠**（低レベル / 最速）、M1 必須 | 未実装 |
