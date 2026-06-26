# フェーズロードマップ

Auto Battle Idle の開発フェーズ一覧。ゲームルールは [spec](../spec/README.md) を参照。

## 概要

| Phase  | ゴール                                                                                        | 状態                            |
| ------ | --------------------------------------------------------------------------------------------- | ------------------------------- |
| **1**  | 戦闘コアデモ（自動戦闘 + Canvas 表示・プレースホルダー）                                      | **完了**                        |
| **2a** | 放置 MVP：セーブ・ステージ進行・個別 Lv（ステのみ）                                           | **完了**                        |
| **2b** | 戦闘計算（`combatMath` 等）                                                                   | **完了**                        |
| **2c** | JSON 駆動クラス、ビルドのハードコード排除                                                     | **完了**                        |
| **3**  | Lv アップ時スキル習得、習得済み passive / active 常時使用枠（各最大 4）+ クラス別スキル再設定 | **再オープン中**                |
| **4**  | クラスマスタ + スキル説明；4a **見直し中** / 4c **完了** / 4b 説明（データ PR 同梱）          | **Phase 3 後に再確定**          |
| **5**  | 演出アセット + VFX PNG + **演出調整ツール**；**5d Combat Feedback**（Damage / Event Popup） | **基盤のみ**（本番 PNG 未実装） |
| **6**  | ステージ作成 — 敵テンプレート・固定ステージコンテンツ・ステージ編集 GUI                       | 未着手（4a 後）                 |
| **9**  | ローグライクモード（仮称）— 既存 effect 中心 13 クラス向けランダム問題・ラン進行              | 未着手                          |
| **7a** | バランス調整 — 既存 effect 中心 13 クラス + 固定ステージ                                      | 未着手                          |
| **7b** | 印術師の独自システム実装                                                                      | 未着手                          |
| **7c** | 法陣師の独自システム実装                                                                      | 未着手                          |
| **8**  | Electron シェル本番化                                                                         | 未着手                          |
| **10** | 印術師・法陣師対応ローグライクモード（仮称）                                                  | 未着手                          |
| **11** | 解法評価メタ（07582b6）— グローバル `playerLevel` / Stage Records / Level Sync              | 未着手（Phase 6 後）            |

全フェーズ共通のスコープ外：アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。

**開発優先:** **Phase 3（クラス別パッシブ / アクティブスキル再設定）** — 仕様見直しにより、既存クラスの一部でスキル構成を再定義する。Phase 3 の習得・常時使用枠の実装は維持しつつ、`classes.json` / `data/skills/` / スキル説明 / validate / エディタ保存経路が新しいクラス設計と一致するまで Phase 5 へ進まない。4c JSON 分割は **完了**。接敵ビジュアルは [master-work-order.md](./master-work-order.md) Phase 3a/3b、接近 Intent 一本化は Phase 3d。Electron は Phase 8。globalExp / 強化ツリー / オフライン報酬は Phase 8 から外し、別途再計画する。

---

## Phase 1 — 戦闘コアデモ（完了）

**ゴール：** ブラウザ上で味方パーティ vs 敵の完全自動戦闘。開始後はプレイヤー入力なし。

### 実装済み

- Vite vanilla-ts プロジェクト（`base: './'`）
- JSON ゲームデータ：`data/classes.json`, `data/skills/`, `enemies.json`, `stages.json`, `parties.json`
- 戦闘ロジック：`BattleEngine`, `SkillExecutor`, `targeting`, `combatMath`, `validateGameData`
- 3 ロール、4 人編成（鉄衛士 / 剣術士 / 療養師 / 弓術士）、`stage_1` に test_enemy × 2
- スキル枠：**basic**（非表示・常時稼働）+ **習得済み active 枠**（HUD に CD 表示）。Phase 3 再確定後は passive も同じ Lv 段階枠で扱う
- パッシブは Phase 3 再確定後、active と同じ Lv0=2 / Lv10=3 / Lv20=4 の段階解放へ揃える
- ステータス効果：`atk`, `def`, `damageTaken` への buff / debuff
- Victory / Defeat → 3 秒待機 → HP 全回復 → 再スポーン（Phase 2 でセーブ連動の進行ルールを追加）
- Canvas 2D：**アニメーション基盤**（`SpriteAnimator`、イベント連動、近接突進/遠隔弾、ダメージポップアップ）
- **プレースホルダースプライト**（ロール別色分け PNG。本番ドット絵は Phase 5）
- **戦闘 VFX**（PNG strip `sheets/vfx/`、64×64）
- buff VFX：対象スプライトの白い光（約 0.8 秒）
- Canvas UI：ステージ名（左上）、パーティ HUD（クラス名 / Exp / HP / スキル CD）
- バトルログ：**console のみ**（DOM ログは意図的に未実装）

### デモ編成

| classId       | 表示名 |
| ------------- | ------ |
| `df_guardian` | 鉄衛士 |
| `at_warrior`  | 剣術士 |
| `sp_cleric`   | 療養師 |
| `at_ranger`   | 弓術士 |

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

Phase 1 の時点で `src/battle/combatMath.ts` に実装済み。数値の体感調整は **Phase 7a**。

### 2c — クラス基盤（完了）

- セーブ + JSON のみからパーティ/ビルドを構築（`parties.json`）
- `levelCurves.json` による Lv 成長（Phase 4 で **growthPresets + classes.growthTier** 方式に刷新）

---

## Phase 3 — スキル・戦闘拡張（再オープン中）

**ゴール：** LvUP で習得済みスキルが増え、passive / active はどちらも Lv0=2、Lv10=3、Lv20=4 の各最大 4 枠で常時使用可能になる。ビルドは付け替えではなく習得構造としてセーブに永続化。

### 実装済み

- LvUP 時、`classes.json` の `skills[]`（レベル別 `skillIds`）から `learnedPassiveIds` / `learnedActiveIds` を再計算（`resolveLearnedSkills`, `reconcileMemberBuild`）
- 勝利報酬・セーブロード・デバッグ Lv 変更時に習得リストを同期；LvUP ログに新スキル名を表示
- アクティブ **最大 4 枠**（`MAX_ACTIVE_SLOTS = 4`）：習得即参加（`learnedActiveIds`）。段階解放 Lv0=2 / Lv10=3 / Lv20=4
- パッシブも active と同じ段階解放（Lv0=2 / Lv10=3 / Lv20=4）へ再確定する。現行実装が `passiveIds` を全展開している場合は Phase 3 再確定作業で修正する
- 付け替え・セット・装備変更は行わない。`equippedActiveSlots` は歴史的互換のみで、設計上の戦闘参加判定には使わない
- セーブに `CharacterBuild` を含め、ロード時 `reconcilePartyBuilds` でレベルと整合

### 再オープン理由（2026-06）

仕様見直しにより、クラスによってはパッシブ / アクティブスキルの役割・習得順・効果構成を再設定する必要が出た。習得システム自体は完了済みだが、Phase 4 以降のクラスマスタ・演出・バランス調整の前提になるため、現在地は Phase 3 へ戻す。

### 未完了タスク

- 影響クラスを洗い出し、各クラスのパッシブ / アクティブスキル構成を再定義
- `classes.json` の習得テーブルと `data/skills/` の効果・ターゲット・数値フィールドを更新
- 新 effect / target / 条件 / 表示要素が増える場合は、`SkillEditorStep`・validate・`formatSkillText`・関連 spec を同じ作業で同期
- 変更後のクラスマスタを [classes-and-skills.md](../spec/classes-and-skills.md) と突き合わせ、Phase 4a を再確定

### Phase 3d — 接近・接敵 Intent 一本化（完了）

**位置づけ:** P3 剣術士完了後、Position Flow 系スキルの本格実装前に挟む。Phase 3b の `resolveEngagedLayout` 一本化は layout / display 側の cleanup であり、Phase 3d は approach / attack / move / display の Target Intent 境界を揃える別作業。

**ゴール:**

- defender 専用の「敵全体の接触点へ前進」接近本体を廃止する
- 全ロール共通で `ChaseTarget → standoff battleX → AttackTarget` の停止判定へ寄せる
- ロール差は接近パイプラインではなく target spec / target rule に閉じる
- `contact` / `frontline` / `display` / `move anchor` / `attack target` の責務境界を [battle-field.md](../spec/battle-field.md) と [combat.md](../spec/combat.md) に同期する
- Stage 1 Wave 2 の `test_to_ranged` 残存時に鉄衛士が不連続に接敵しないことを regression 化する
- Phase 3d 後 regression として、Engaged 中 overlap 補正は approach と合算した 1 tick の総移動量を自動接近 step 内に制限し、front row spacing が `battleX` を 32px 級で snap したり 2倍速に見える加速を起こしたりしないことを固定する

**Phase 3d 後 cleanup:** `battleX` 単一正本の runtime 整理は [master-work-order.md](./master-work-order.md) の battle-field cleanup 表を正とする。`battleCamera.ts` と skill move の旧 visual フィールドは削除済み。`visualX` は snapshot 互換ミラー、`engagedVisualTarget*` は deprecated alias として次フェーズ送り。

### スコープ外（Phase 3）— 独自システムクラス

`at_sigilist`（印術師）と `at_conductor`（法陣師）は、Earth / Wind Mark 系・damage reservoir / routing 系など **戦闘エンジン拡張を伴う独自システム** を持つ。設計確定（[skill-finalization-table.md](./skill-finalization-table.md)）は Phase 3 で行うが、**combat 実装・`data/skills/` 投入・tooling 本番化は Phase 7b / 7c 以降** とする。

| classId        | Phase 3 で行うこと                                                     | Phase 7b / 7c 以降へ送ること                                                                            |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `at_sigilist`  | 枠設計・Mark / Branch 仕様の docs 確定。現行 JSON active は廃棄済み    | Mark state / effect、conditionalEffect tooling、passive / active JSON                                   |
| `at_conductor` | 枠設計・蓄積プール / 法陣仕様の docs 確定。現行 JSON active は廃棄済み | damage reservoir、observation / concentration / distribution / recycling、非 damage basic、地点指定範囲 |

Phase 3 の Caster pass は **`at_sorcerer` のみ** を対象とする。印術師・法陣師はクラスマスタ上は存在するが、スキル未実装のまま据え置き可。

---

## Phase 4 — クラスマスタ + スキル

Phase 3 の習得機構 + **キャラクターデータ GUI** でクラス JSON を確定する。**一次職 / 二次職の区別は廃止**し、`jobTier` / `promotion` / `promotesFrom` の予約は行わない。

| サブフェーズ | 内容                                                                          | 状態               |
| ------------ | ----------------------------------------------------------------------------- | ------------------ |
| **4a**       | クラス 15 種・スキル JSON・GUI・validate・`epithetEn` データ                  | **見直し中**       |
| **4c**       | 巨大 JSON のファイル分割（AI / エディタ / Git のトークン・差分効率）          | **完了**           |
| **4b**       | スキル説明の自動生成（`formatSkillText`）— データ PR 同梱・Phase 7a 前 polish | **随時**（コア済） |

### クラスマスタ（見直し中）

ロスター全表は [classes-and-skills.md](../spec/classes-and-skills.md) を正とする。`displayName`（漢字）+ `epithetEn`（英語肩書き）を `classes.json` に保持し、デモ編成は `parties.json` の最新構成（鉄衛士 / 剣術士 / 療養師 / 弓術士）とする。

- 旧デモ 4 クラス（Bulwark 等）は削除済み
- `epithetEn` の 2 段ルビ UI は master-work-order Phase 3c
- 数値バランスの最終版は Phase 7a

### 4a — クラスデータ + GUI（見直し中）

- 15 クラスを `classes.json` + `data/skills/` に投入済み。ただし Phase 3 再オープンにより、一部クラスのパッシブ / アクティブ構成は再確定待ち
- **ステータス・成長** — Lv1 基準 + `growthTier`（低/中/高）+ `levelCurves.growthPresets` + `attackSpeedPresets`；術師は `growthPresetKey: caster`；`ClassEditorStep` 成長 UI + Lv10 プレビュー（[stats.md](../spec/stats.md)）
- **複数ターゲットスキル**（`targetShape` 等）— 実装検証用 WIP データ。**仕様書へのスキル一覧転記はマスタ確定後**
- キャラクターデータ GUI で編集・保存
- `validateGameData` 整合確認

### 4b — スキル説明自動生成（随時）

スキル JSON に `description` フィールドは持たず、UI は `src/ui/formatSkillText.ts` から説明文を組み立てる（`SkillMenuPanel` ツールチップ・`SkillEditorStep` テキストプレビュー）。

**方針:** コア（自動生成 + エディタプレビュー）は **既に稼働**。新 effect / ターゲット形状を足す **データ PR ごと** に `formatSkillText` とテストを同梱。全クラス目視の仕上げは **Phase 7a 前** でよい。

**4b スコープ外**

- 手書き `description` フィールドの JSON 追加
- 戦闘ログ・Canvas HUD への説明文表示
- Canvas 演出プレビュー（**Phase 5 演出調整ツール**）

### 4c — 巨大 JSON の分割（開発効率）— **完了**

**背景：** 4a 完了時点で `skills.json` は ~2000 行。`.cursorignore` と [data-json-lightweight.mdc](../../.cursor/rules/data-json-lightweight.mdc) で全文 Read 禁止を運用していた。**物理分割済み** — 必要ファイルだけ開ける。

**レイアウト（実装）**

```
data/
  skills/
    passives/
      df_guardian.json         # スキル ID 先頭2セグメント単位
      at_warrior.json
      …
    actives/
      df_guardian.json         # スキル ID 先頭2セグメント単位（17 ファイル）
      at_warrior.json
      …
  classes.json                 # 据え置き（~600 行）
```

- ランタイムの `GameData.skillRegistry` 形状は **変更なし**（`loadGameData` が `import.meta.glob` でマージ）。
- エディタ API は **論理上 1 マスタ**（GET はマージ、保存時は該当ファイルへ upsert）。

**実装済み**

- `src/battle/data/loadGameData.ts` — 分割 JSON の import / マージ
- `src/battle/data/skillsJsonFs.ts` — Node 側 read/write / upsert
- `validateGameData.ts` — マージ後に現行と同じ検証（変更なし）
- `vite-plugin-editor-api.ts` — 読み書きパス・HMR 対象の更新
- `scripts/split-skills-json.mjs` — 初回移行用（actives）
- `scripts/split-passives-json.mjs` — パッシブ分割移行用
- `.cursorignore` — `data/skills.json` 除外を解除（`classes.json` のみ除外継続）

**4c スコープ外**

- スキル数値・ID のバランス変更（**Phase 7a**）
- `classes.json` の 15 分割（効果が小さいため任意。4c 完了後に別タスク可）
- ステージ・敵 JSON の分割（行数が少なく優先度低。**Phase 6** で必要になれば再検討）

**タイミング：** 4a でスキーマが固まったあと。**4b と並行** してよい（説明文生成はマージ後の型・validate に依存するだけ）。

### スコープ外（Phase 4）

- 固定ステージコンテンツ・ステージ編集 GUI（**Phase 6**）
- 演出アセット本番化・演出調整ツール（**Phase 5**）

---

## Phase 5 — 演出アセット + VFX PNG + 演出調整ツール

Phase 1 の `render/` 基盤（`SpriteAnimator`, `IBattleRenderer`, イベント連動）は維持。Phase 3 のスキル再設定と Phase 4a のクラスマスタ再確定後、**確定した classId / skillId / enemyId から順次** 本番 PNG・VFX PNG・タイミングを載せる。アセット規約は [classes-and-skills.md](../spec/classes-and-skills.md#スプライト演出アセット) と [sheets/README.md](../../src/assets/sprites/sheets/README.md)。

### アセット仕様（目標）

| 種別         | 配置                                            | 内容                                                                                           |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| entity 本体  | `sheets/bodies/{classId\|enemyId}.png` **1 枚** | idle / move / death のみ（48×48）。レイアウト正本 `data/entityAnimLayout.json`（味方・敵共通） |
| スキル body  | `sheets/skills/{skillId}[_index].png`           | **通常攻撃 + 全 active**。64×48 横 strip。attack は entity に含めない                          |
| 先頭 idle    | strip 0 コマ目任意                              | entity idle 0 と同絵で位置合わせ可 → effect `animStartFrame: 1` で再生スキップ                 |
| 遠隔通常攻撃 | `{id}_basic_attack.png`                         | **弓引き PNG を置けば skill anim**。未配置時は VFX のみ                                        |
| VFX          | `sheets/vfx/*.png`                              | 64×64 横 strip。スキル単位の `vfx` / `hitVfx` / `basicAttackVfx` と対応                        |

### 演出調整ツール（スコープ）

- **Canvas プレビュー必須** — 1 スキル / 1 effect の isolated 再生（本番と同じ `resolveEffectPresentation` → `BattleCanvas` 経路）
- **VFX パラメータ調整を統合** — `vfx.placement` / `animStartFrame` 等 / `moveDurationSec`（別 VFX エディタは作らない）
- タイムライン表示（body strip / VFX / particles / presentationLock）
- JSON 書き戻し（`data/skills/actives/` 等）。BattleEngine 全体は回さない薄いランナー
- SkillEditorStep から「演出プレビューを開く」連携（任意）

**実装済み（演出ラボ MVP / PR3）**

- `presentation-lab.html` — Vite 別エントリ（`npm run dev` → `/presentation-lab.html`）
- `src/presentation/PresentationPreviewRunner.ts` — 擬似 2 体配置 + `BattleCanvas.play*`
- `src/presentation/PresentationLabApp.ts` — classId / enemyId・skill・effect 選択、▶ / ↺、JSON 編集・保存
- `PUT /__editor/presentation-skill` — `skillsJsonFs` upsert + validate
- SkillEditorStep effect 演出セクションから演出ラボ deep link（任意）

### 5d — Combat Feedback（Damage / Event Popup）

**着手条件:** Phase 3d 完了後。**Phase 4a / 4b と並行可**。本番 PNG・VFX 投入（5a〜5c）の前後どちらでもよいが、クラス別スキル再設定の目視検証には **4a 前でも着手推奨**。

**ゴール:** [combat-architecture.md](../combat-architecture.md) §8 の HUD / Damage Popup / Event Popup 分離を戦闘描画へ反映する。正本は §8（07582b6）。

| 項目 | 内容 | 状態 |
| ---- | ---- | ---- |
| Damage Popup | Damage / Heal / DoT の数値のみ。頭上表示。内訳・Barrier 吸収量は出さない | 基盤済み（`DamagePopupManager`）。仕様合わせ・DoT 経路の漏れがあれば修正 |
| Event Popup | Block / Counter / Evade 等の瞬間イベント。Damage より上に表示 | 基盤済み（`CombatReactionPopupManager`）。未配線イベントの追加 |
| レイアウト | `damagePopupLayout` と reaction popup の Y 衝突回避を regression 化 | 未着手 |
| HUD 境界 | Barrier 残量・Buff / Debuff は HUD のみ（ポップアップに出さない） | 要確認 |

**未配線 Event（例）:** `Redirect!`、`Barrier Break!`、`Execute!`、`Armor Break!` — 戦闘イベント → `BattleView` → `IBattleRenderer`。

**実装済み（部分）:** `showDamagePopup` / `showHealPopup`、`showBlockPopup` / `showCounterPopup` / `showEvadePopup` 等、`damagePopupLayout.test.ts`。

**スコープ外:** 戦闘ログ DOM、手書き `description`、演出ラボ、Stage Records（**Phase 11**）。

### 進め方

1. **5d** — Combat Feedback 仕上げ（Phase 3d 後、4a と並行可）
2. インフラ — `entityAnimLayout.json`、body atlas 描画、スキル strip 64px、`animStartFrame`
3. 演出調整ツール MVP（プレースホルダー PNG でもタイミング調整可）
4. VFX PNG — `sheets/vfx/` に strip 投入、スキル JSON の `vfx` / `hitVfx` / `basicAttackVfx` と対応付け
5. 確定クラス / 敵ごと — `bodies/` → `basic_attack` → 各 active → VFX → 演出ラボで詰め → 本番 battle 目視

### Phase 1 との境界

| 項目            | Phase 1（済）            | Phase 5                                  |
| --------------- | ------------------------ | ---------------------------------------- |
| アニメ状態機械  | あり                     | 変更最小（atlas / skill strip 解決追加） |
| entity 素材     | ロール別プレースホルダー | `bodies/{id}.png` + スキル strip         |
| VFX 素材        | 基盤のみ                 | `sheets/vfx/*.png` + `SkillVfxDef`       |
| battle ロジック | —                        | **触らない**                             |

### VFX PNG 描画

Phase 5 の演出調整ツールで編集した JSON・タイミングを、戦闘でも **同一 PNG strip 経路** で描画する。VFX の正本は `sheets/vfx/*.png` + `SkillVfxDef`（`placement` / `AnimPhaseFields` / `hitVfx` / `basicAttackVfx`）。

**現状:** 型・レジストリ・再生パイプラインは実装済みだが、`sheets/vfx/` に本番 PNG が未投入のため、スキル単位の VFX 描画は未完了。

### 基盤実装済み

- **型・レジストリ:** `SkillVfxDef`、`VFX_ANIM_CELL_*` 64×64、`vfxAnimRegistry.ts`（`resolveVfxAnimKey`）
- **再生・描画:** `vfxAnimPlayback.ts` / `vfxPlacement.ts` / `VfxPlaybackManager.ts` / `BattleCanvas.playSkillVfx`（`layer` behind → entities → front）
- **データ形状:** スキル JSON は `vfx` / `hitVfx` のみ（traits は `basicAttackVfx`）。旧 preset フィールドは削除済み

### 未完了

- `sheets/vfx/` への VFX PNG strip 投入（`{skillId}_vfx` / `{skillId}_{effectIndex}_vfx` / `_vfx_hit` 規約）
- スキル JSON の `vfx` / `hitVfx` / `basicAttackVfx` と実 PNG の対応付け・戦闘 / 演出ラボでの目視確認
- 確定クラス / スキル単位 PR で順次載せる（Phase 5 本番アセットと並行可）

### スコープ外（Phase 5）

- PixiJS 描画層移行
- 全 15 クラス一括完成（**確定分から順次**で可）
- VFX 専用編集ツール（**Phase 5 演出ラボに統合済**）
- 既存 JSON の一括移行（クラス / スキル単位 PR で順次）

---

## Phase 6 — ステージ作成

Phase 4a で確定したクラス・スキルを前提に、メインモード用の **固定ステージ群**（`stages.json`）と **敵テンプレート**（`enemies.json`）を作成・編集できる状態にする。敵編成方針は [enemy-design-concept.md](../enemy-design-concept.md)（クラス体系ベース・問題提示型）に従う。進行ルールは [progression.md](../spec/progression.md) Phase 2 の `currentStageId` 連鎖を正とする。

| サブフェーズ | 内容                                                                                          | 状態   |
| ------------ | --------------------------------------------------------------------------------------------- | ------ |
| **6a**       | 敵テンプレート整備 — クラス参照型 `enemies.json`、既存 `EnemyEditorStep` 経由の編集・validate | 未着手 |
| **6b**       | 固定ステージコンテンツ — `stages.json` 進行順・Wave / `spawnX`・解法提示型編成                | 未着手 |
| **6c**       | ステージ編集 GUI — Wave 編成・`spawnX`・保存（`StageEditorStep`）                             | 未着手 |

### 6a — 敵テンプレート整備

- [enemy-design-concept.md](../enemy-design-concept.md) に沿い、プレイヤークラスを流用した敵テンプレートを `enemies.json` に整備
- 既存 **`EnemyEditorStep`** + `vite-plugin-editor-api` の敵保存経路を利用。`classId` 参照・スキル割当・`exp` は validate 整合
- 雑魚 / エリート / ボス相当の **テンプレート骨格**（HP 倍率・専用パッシブ等はデータ PR 単位）。数値の最終調整は **Phase 7a**
- test / 検証用ダミー敵と本番用テンプレートの整理

### 6b — 固定ステージコンテンツ

- `stages.json` の **配列順 = メイン進行チェーン**（Victory で次 ID、Defeat で 1 つ前へ — Phase 2a 済）
- 各ステージ：`id` / `displayName` / `waves[]` / 各 Wave の `enemies[]`（`templateId` + `spawnX`）。座標規約は [battle-field.md](../spec/battle-field.md)
- [enemy-design-concept.md](../enemy-design-concept.md) の編成パターン（雑魚ラッシュ・バランス編成・魔術編成等）を **意図した解法体験** としてステージに配置
- 学習導線となる早期〜中盤ステージの骨格。難易度カーブ・EXP ペースの **最終調整は Phase 7a**

### 6c — ステージ編集 GUI

- 新規 **`StageEditorStep`**（`EditorApp` タブ追加）
- ステージ一覧・新規 / 複製・Wave 追加削除・敵 `templateId` 選択・`spawnX` 編集
- `validateGameData` 連動保存（`stages.json` PUT — 読み取り API は既存）
- 任意：`spawnX` のフィールド上プレビュー（本番 battle 起動なしの簡易配置表示）

### 進め方

1. **6a** — 編成パターンに必要な敵テンプレートを先に揃える（GUI は既存）
2. **6b** — 手書き JSON または暫定フォームで最初の進行チェーンを投入し、validate / 戦闘目視
3. **6c** — 反復編集のため GUI 化。6b と **並行可**（コンテンツ先行）

### スコープ外（Phase 6）

- ローグライクのランダム問題生成（**Phase 9**）
- ステージ難易度・敵 `exp`・周回テンポの最終チューニング（**Phase 7a**）
- 敵・味方の本番演出 PNG（**Phase 5**）
- 敵コスト制による自動生成（enemy-design-concept §8 は将来拡張。初期は手組み）

---

## Phase 9 — ローグライクモード（仮称）

**着手条件:** Phase 6 完了後。詳細仕様は [roguelike-mode.md](../spec/roguelike-mode.md) §18。

**ゴール:** 既存 effect 中心の 13 クラスで、メインステージ攻略後も編成実験・クラス研究・解法探索を供給するランダム問題モード。

### スコープ（概要）

- ラン専用 state（メインセーブと分離）
- 問題生成（敵構成・傾向・ステージ補正）
- 分岐マップ・進路選択・報酬選択 UI
- 世界補正・制約・クラスルール変化型報酬
- 既存 `BattleEngine` への Mod 注入
- エンドレス継続

### スコープ外（初期）

- 印術師・法陣師の独自システム対応（**Phase 10**）
- メインモードへのラン報酬永続転用
- 戦闘中プレイヤー操作
- ラン専用新クラス

---

## Phase 7 — バランス調整 + 独自システムクラス実装

Phase 3〜6 と Phase 9（および Phase 4 のクラスマスタ・**Phase 6 の固定ステージ骨格**）で **既存 effect 中心の 13 クラス** の機能・コンテンツ・見た目・ランダム問題基盤が揃ったあとに着手する。ゲーム全体の数値チューニング、Phase 3 で設計のみ確定した **印術師・法陣師の独自システム実装** を 3 つに分けて行う。

| サブフェーズ | 内容                                                     | 状態   |
| ------------ | -------------------------------------------------------- | ------ |
| **7a**       | バランス調整 — 既存 effect 中心 13 クラス + 固定ステージ | 未着手 |
| **7b**       | 印術師の独自システム実装                                 | 未着手 |
| **7c**       | 法陣師の独自システム実装                                 | 未着手 |

### 7a — バランス調整

- [combat.md](../spec/combat.md) との突き合わせ・検証
- 敵 `exp`、**growthPresets 表**・クラス `growthTier` 割当、LvUP ペース
- 既存 effect 中心 13 クラスの Lv1 基礎ステ・スキル威力（具体スキルはマスタ確定後）
- ステージ難易度カーブ（敵ステ・ウェーブ構成）— Phase 6 で置いた骨格の数値 polish
- Phase 3 以降のスキル習得との整合
- **passive / active 枠構造**の最終確認（Lv0=2 / Lv10=3 / Lv20=4）
  - active は `getUnlockedActiveSlotCount`、passive は同じ Lv 段階に対応する解決処理へ固定
  - **UI**（HUD / スキル表示）と**戦闘**（`createCooldowns` / `reconcileMemberBuild` 等）の両方で習得済み passive / active 常時使用として扱う

### 7b — 印術師の独自システム実装

- Earth / Wind Mark、Branch 分岐、Mark 付与・起爆
- Mark state / effect、conditionalEffect tooling、passive / active JSON
- `SkillEditorStep`・validate・`formatSkillText`・関連 spec の同期

### 7c — 法陣師の独自システム実装

- damage reservoir、observation / concentration / distribution / recycling
- 地点指定範囲 / 持続法陣、非 damage basic
- `SkillEditorStep`・validate・`formatSkillText`・関連 spec の同期

### スコープ外（Phase 7）

- 職階追加の再導入
- 印術師・法陣師をローグライク問題生成へ組み込む作業（**Phase 10**）

---

## Phase 8 — Electron

Phase 7 完了後に着手。クラスマスタ・数値チューニングが揃ってからデスクトップシェルを本番化する。

- Electron シェル：frameless、常に前面、トレイ、片隅配置（`electron/main.mjs` に基盤のみ一部実装済み）

### スコープ外（Phase 8）

- globalExp
- 強化ツリー（`enhancementTree.json`）
- オフライン報酬

---

## Phase 10 — 印術師・法陣師対応ローグライクモード（仮称）

**着手条件:** Phase 7b / 7c と Phase 8 完了後。

**ゴール:** Phase 9 の基本ローグライクに、印術師・法陣師の独自システムを問題生成・報酬・ラン中ルールへ組み込む。

### スコープ（概要）

- Mark / Branch、damage reservoir / 法陣を前提にした問題生成
- 印術師・法陣師向けの世界補正・制約・報酬候補
- ラン内 Mod と独自システム state の整合
- Phase 9 のラン基盤への追加テスト

### スコープ外（初期）

- ラン専用新クラス
- メインモードへのラン報酬永続転用
- 戦闘中プレイヤー操作

---

## Phase 11 — 解法評価メタ（07582b6）

**着手条件:** Phase 6 完了後（6b で進行チェーン骨格が存在すること）。

**ゴール:** [design-philosophy.md](../design-philosophy.md) と [system-mechanics.md](../system-mechanics.md) で追記した「理解度評価」を、セーブ・ステージ・オプションに反映する。戦闘表示（Damage / Event Popup）は **Phase 5d** で扱う。

**正本:** 進行メタは `system-mechanics.md`（Player Level / Instant Lv20 / Level Sync / Stage Records）。Combat Feedback は [combat-architecture.md](../combat-architecture.md) §8 → **Phase 5d**。セーブ schema の詳細は [progression.md](../spec/progression.md) Phase 11。

| サブフェーズ | 内容                                                                             | 状態   |
| ------------ | -------------------------------------------------------------------------------- | ------ |
| **11b**      | グローバル `playerLevel` 移行 + Instant Lv20 / Level Sync オプション             | 未着手 |
| **11c**      | Stage Records — クリア履歴セーブ、`recommendedLevel`、リザルト / ステージ選択 UI | 未着手 |

### 11b — グローバル `playerLevel`（B 案）

Phase 2 の **メンバー個別** `CharacterProgress.level` を廃止し、セーブ直下の **アカウント共通** `playerProgress` を正本とする。

```typescript
interface PlayerProgress {
  level: number; // 初期 1。全クラスの習得・枠解放の単一基準
  exp: number;
}
```

- **習得・枠解放** — `playerProgress.level` を `classes.json` の `skills[]` 閾値と `getUnlockedActiveSlotCount` / passive 段階解放の入力に使う。編成にいないクラスも同じ Lv で解放状態が決まる。
- **戦闘ステ計算** — 味方・敵の Lv 参照は `resolveEffectiveLevel(member, stage, options)` の単一経路へ集約。通常は `playerProgress.level`、Level Sync ON 時は `min(playerLevel, stage.recommendedLevel)`、Instant Lv20 ON 時は 20 扱い。
- **EXP 付与** — 勝利時の敵 `exp` 合計は `playerProgress.exp` に加算。メンバー別 EXP は持たない。
- **Lv20 以降** — `playerProgress.level` が 20 を超えても習得・枠は Lv20 完成で頭打ち。超過分はステータス救済のみ（[design-philosophy.md](../design-philosophy.md) §4）。
- **移行** — ロード時に旧 `party[].progress` から `playerProgress` へマイグレーション（例: パーティ内最大 `level` / 最大 `exp` を採用）。移行後はメンバー `progress` を削除または読み取り専用互換に落とす。
- **UI** — パーティ HUD / 編成画面は **プレイヤー Lv / Exp** を表示。クラス行は「この Lv での完成度」として読む。

**波及:** `reconcileMemberBuild` / `resolveLearnedSkills`、`levelGrowth.ts`、セーブ型、`SaveManager`、Victory 報酬、`SkillMenuPanel`、デバッグ Lv 変更。Phase 3 の習得機構は維持し、**Lv の正本だけ**をグローバル化する。

### 11c — Stage Records

- `stages.json` に `recommendedLevel`（推奨プレイヤー Lv）を追加。`validateGameData`・`StageEditorStep`（Phase 6c 済みなら同時、前なら暫定 JSON 手編集）
- `SaveGameState` にステージ別記録を追加:
  - First Clear Level / Lowest Clear Level / Best Time / Latest Party（`classId[]`）/ Level Sync Clear
- Victory 時に `playerProgress.level`（Level Sync 適用前の実 Lv）とクリア時間で更新
- デフォルト表示順: `Lowest Clear Level ASC` → `Best Time ASC`
- ステージ選択またはクリア後 UI で表示（Canvas / メニューは最小 MVP で可）

### 進め方

1. **11b schema** — `playerProgress` 型・マイグレーション・`resolveEffectiveLevel` の単一経路を先に確定
2. **11b オプション** — Instant Lv20 / Level Sync を `resolveEffectiveLevel` に接続
3. **11c** — `recommendedLevel` + Stage Records セーブ + Victory フック
4. **11c UI** — 記録表示

### スコープ外（Phase 11）

- globalExp / 強化ツリー / オフライン報酬（別途再計画）
- ローグライクの問題生成・ラン記録（**Phase 9**）
- 全ステージの推奨レベル・記録閾値の最終チューニング（**Phase 7a**）
- クラスごとに別々のプレイヤー Lv を持つ A 案（採用しない）

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
Phase 3（スキル習得 + 習得済み passive / active 常時使用枠 + クラス別スキル再設定）  ← **現在**
    ↓
Phase 3d（接近・接敵 Intent 一本化）
    ↓
Phase 5d（Combat Feedback — Damage / Event Popup）  ← 4a / 4b と並行可
    ↓
Phase 4a（クラスマスタ + GUI）  ← 見直し中
    ↓
Phase 4c（JSON 分割）  ← 完了
    ↓
Phase 4b（formatSkillText）  ← データ PR 随時
    ↓
Phase 5（演出アセット + VFX PNG + 演出調整ツール）  ← スキル再確定後
    ↓
Phase 6（ステージ作成 — 6a 敵 / 6b コンテンツ / 6c GUI）
    ↓
Phase 11（解法評価メタ — 07582b6）
    ↓
Phase 9（ローグライクモード — 既存 effect 中心 13 クラス）
    ↓
Phase 7a（バランス調整）
    ↓
Phase 7b（印術師の独自システム実装） ── 7c と並行可
Phase 7c（法陣師の独自システム実装）
    ↓
Phase 8（Electron）
    ↓
Phase 10（印術師・法陣師対応ローグライクモード — [roguelike-mode.md](../spec/roguelike-mode.md)）
```
