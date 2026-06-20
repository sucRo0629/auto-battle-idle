# 戦闘フィールド（位置・移動・描画）

実装：`src/battle/battleLayout.ts`, `combatPosition.ts`, `partyFormation.ts`, `bodyAnimMarching.ts`, `BattleEngine.ts`
描画：`src/render/BattleCanvas.ts`（`screenX = battleX`）

本ドキュメントは **横 1 軸のバトルライン** における座標・隊形・Wave・接敵・描画の設計正本。ダメージ/CD/脅威等は [combat.md](combat.md) を参照。

**現行コードとの関係：** 軸向き・用語・パイプラインは本書が正本。実装が追いつくまで [combat.md](combat.md) の座標節（旧記述）と不一致があり得る。

---

## 1. 用語

| 概念                 | コード / JSON                                 | 日本語     | 使う場面                         |
| -------------------- | --------------------------------------------- | ---------- | -------------------------------- |
| 後方                 | 小さい `battleX` / 画面左                     | 後方       | パーティ起点・退却方向           |
| 前方                 | 大きい `battleX` / 画面右                     | 前方       | 進行方向・敵出現側               |
| プレイヤー側ユニット | `players[]`（移行後）, `TargetSide: "player"` | プレイヤー | 戦闘ランタイム・ターゲット・脅威 |
| 敵                   | `enemies[]`, `isEnemy`                        | 敵         | 同上                             |
| パーティ             | `party`, `PartySlotState`, `partySlotIndex`   | パーティ   | セーブ・編成 UI・HUD のみ        |
| ユニット             | `CombatantState`                              | ユニット   | player / enemy 共通              |
| スロット             | `(formationRow, slotIndex)`                   | スロット   | visual 隊形の席。§3 参照         |

**移行（実装フェーズ）：**

- ランタイム配列・変数：`allies` → `players`（`ally` コメント廃止）
- JSON `"side": "ally"` はローダーで `"player"` に正規化。保存時は `"player"`
- レガシー `TargetRule`（`closestAlly` 等）は `closestPlayer` 等へ

**`partySlotIndex` とスロットの違い：**

- `partySlotIndex`（0〜3）— 編成スロット。HUD・統計用。**visual 位置の正本ではない**
- `slotIndex` — 同一 `formationRow` 内の横並び順（§3）。同クラス複数時の左右は安定ソートにより `players` 配列順（実質 `partySlotIndex` 昇順）が暗黙的に適用。**現状維持・仕様変更なし**

---

## 2. 座標体系

### 2.1 前後と画面

| 画面   | 意味                                  |
| ------ | ------------------------------------- |
| **左** | **後方** — パーティ起点               |
| **右** | **前方** — 進行方向・敵 Wave の出現側 |

`battleX` / `screenX` は **値が大きいほど前方（右）**。

距離単位は **px** のまま（1 battle 単位 ≒ 1 画面 px）。擬似 m は採用しない。

### 2.2 座標層（R1-fix: 単一座標）

| 層         | コード名       | 更新責務                                                 | 用途                                           |
| ---------- | -------------- | -------------------------------------------------------- | ---------------------------------------------- |
| フィールド | `battleX`      | `combatPosition.ts` / `BattleEngine` / `battleLayout.ts` | 射程・接近・隊形・knockback・描画基準（正本）  |
| 画面       | `screenX`      | 計算値                                                   | **`battleX` と同一**（カメラ廃止）             |
| 背景       | `worldOffsetX` | `BattleEngine`                                           | 地面タイルのパララックス（Victory 退場時のみ） |

**統一原則（R1 解消）：**

- **`battleX` が唯一の横位置正本。** ロジックと描画は同じ値を参照する
- 隊形スペーシングは `battleX` に直接反映（§3.3 スロット ideal を battle 座標として使用）
- 攻撃・回復・自動接近・engage move の距離計算は **`effectiveRangePx` 共通式** を使う。近接/遠隔で分岐しない
- `engagedMinBodyGap()` / `PLAYER_VISUAL_MIN_GAP` は overlap 解消専用。射程停止や range 加算には使わない
- `visualX` は **snapshot 互換ミラー**（`battleX` と同値。layout ロジックは参照しない）
- `src/render` は `battleX`（= `screenX`）のみ参照し、戦闘ルールを持たない

### 2.3 毎 tick パイプライン

```
BattlePhase 判定
  → tickBattleX（PartyDeploy / 自動接近・knockback・隊形 overlap 解消）
  → skill move（busy actor。SkillSequenceRunner が battleX を補間）
  → BattleSnapshot
```

接敵開始・前列死亡・構成変化時のみ `applyEngagedFormationToBattleX`（1 回 bake）。**毎 tick の layout 再計算・visual 補間は行わない。**

### 2.4 一方通行（フェーズ別）

| フェーズ          | プレイヤー `battleX` 自動接近                         | 敵 `battleX` 自動接近                                        |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `PartyDeploy`     | 右のみ（左外 → 初期位置）                             | 左のみ（右外 → spawn 位置）                                  |
| 接敵（`Engaged`） | 射程ベース接近（§4.4 `resolvePlayerApproachBattleX`） | 左のみ・射程ベース接近（§4.4 `resolveEnemyApproachBattleX`） |
| スキル `move` 中  | シーケンスが正本                                      | 同左                                                         |

**スコープ外：** 敵がプレイヤー背後へ回る AI / 敵 `move`（後列狙い）。プレイヤー側の `toAnchor`（正オフセット）等スキル `move` は §4.4 で維持。

### 2.5 攻撃位置・move（新軸）

```
effectiveRangePx = effect.range ?? actor.traits.rangePx
```

攻撃・回復・自動接近・engage move はこの共通式で扱う。

- 射程内: `battleDistance(actor, target) <= effectiveRangePx`
- 停止 `battleX`（プレイヤー → 対象）: `target.battleX - effectiveRangePx`
- 停止 `battleX`（敵 → 対象）: `target.battleX + effectiveRangePx`

**`move` の `moveMode`（プレイヤー actor・新軸）：**

| mode       | 目標 `battleX`                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engage`   | `anchor.battleX - effectiveRangePx`（敵の手前＝後方側）                                                                                                                    |
| `toAnchor` | `anchor.battleX + anchorOffsetPx`（未指定=0。−=味方側、+=敵背後）。**敵／味方など敵対 anchor へ向かう場合**は 1 回の移動量を `effectiveRangePx` で上限 |

**ノックバック：** 各陣営の **後方** へ押す。プレイヤーは `-X`（左）、敵は `+X`（右）。敵は `battleX` が進軍表示下限未満にならない。成功時は **移動硬直 1.5 秒**（攻撃は可能・接近とスキル `move` のみ停止）。実装：`ccEffects.ts` の `KNOCKBACK_MOVE_LOCK_SEC`。

### 2.6 定数（単一正本：`battleConstants.ts` / `types.ts` / `rangeLimits.ts`）

| 定数                                 | 用途                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `CANVAS_W`（480）                    | 画面幅                                                                                                          |
| `COMBAT_CAMERA_CENTER_X`（240）      | 敵 spawn オフセット基準（カメラは廃止、名前のみ残す）                                                           |
| `PARTY_FORMATION_LEFT_ANCHOR`（20）  | 味方隊列左端（射程最長ユニット）                                                                                |
| `PARTY_FORMATION_SLOT_SPACING`（32） | 味方隊列スロット間隔                                                                                            |
| `SPAWN_X_MAX`（240）                 | 敵 `spawnX` 上限（中心からの右オフセット）                                                                      |
| `PLAYER_VISUAL_MIN_GAP`              | プレイヤー overlap 解消（≈ `SPRITE_WIDTH + bodyClearance`）。射程加算には使わない                                |
| `CONFIGURABLE_RANGE_PX_MAX`          | `traits.rangePx` / `effect.range` の設定上限（`CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR`）                        |
| `MOVE_PX_PER_SEC`（120）             | 1 秒あたりの戦闘移動量（px）。進軍・接敵接近・PartyDeploy・隊形復帰に使用。Victory 退場は `MOVE_PX_PER_SEC × 2` |

`formationRow` は Y 描画・ターゲット用。X 深度の正本は射程順一列（`partyFormation.ts`）。

**同一 `formationRow` 内の X 深度（左＝後方、右＝前方）：**

| 列      | 深度ルール（左 → 右）                                                                 |
| ------- | ------------------------------------------------------------------------------------- |
| `front` | 近接帯の attacker/defender を最前帯（右）。帯内は `rangePx` 降順 → 同値は `id` 順。それ以外（supporter・前列遠隔など）は後方帯（左） |
| `back`  | ロール順: attacker → supporter → defender → `rangePx` 降順 → `id` 順（従来どおり）   |

前列の supporter は近接最前帯（attacker/defender かつ `rangePx < RANGED_ATTACK_MIN_PX`）の手前に留める。接敵接近では supporter の停止 X をその最前帯の手前に cap する（`resolveApproachBattleX.ts` の `capFrontRowSupporterBehindMeleeFront`）。
この例外は defender の代替壁を作るためではなく、`sp_alchemist` のような近接帯 Survival に **前線直後から局所 sustain を差し込む位置** を与えるためのものとして扱う。

### 2.7 スプライト描画順（重なり）

Canvas 2D の描画順（先に描いた方が下層）で重なりを決める。実装：`src/render/spriteDrawOrder.ts` → `BattleCanvas.ts`。

| 優先 | ルール                         | 意味                                     |
| ---- | ------------------------------ | ---------------------------------------- |
| 1    | **敵を先に描画**               | プレイヤー側スプライトが敵より手前（上） |
| 2    | **味方はロール帯で重なり**     | 下表の順で手前に重なる（上→下）          |
| 3    | **敵内は射程が長い方を先に描画** | 射程の短い敵ほど上に重なる               |
| 4    | **同一帯内は後方を先に描画**   | 手前に立つユニットが後方ユニットより上   |

**味方のロール帯（手前＝上層 → 奥＝下層）：**

| 手前（上） | ロール帯           | 判定                                      |
| ---------- | ------------------ | ----------------------------------------- |
| 1          | 近接 `attacker` UI ロール | `role === "attacker"` かつ `rangePx < 100` |
| 2          | 遠隔 `attacker` UI ロール | `role === "attacker"` かつ `rangePx >= 100` |
| 3          | ディフェンダー     | `role === "defender"`                     |
| 4          | `supporter` UI ロール | `role === "supporter"`                    |

**後方の定義（陣営ごとの battleX 向き）：**

| 陣営         | 後方（下層）                       | 前方（上層）                       |
| ------------ | ---------------------------------- | ---------------------------------- |
| プレイヤー側 | 小さい `battleX`（画面左）         | 大きい `battleX`（敵寄り）         |
| 敵           | 大きい `battleX`（画面右・退却側） | 小さい `battleX`（プレイヤー寄り） |

ソートキーはまず陣営で分け、味方同士は `allyRoleBackDepth`（0〜3 の昇順）、敵同士は `rangePx` の降順（長い方が下層）、同一帯内は `factionBackDepth`：`isEnemy ? -battleX : battleX` の昇順。同深度は `id` 辞書順。

### 2.8 擬似奥行き（Y オフセット）

同一 `battleX` 付近でスプライトが重ならないよう、**描画のみ** Y をずらす。`battleX`（戦闘正本）は変えない。スケールは変えずドット絵の等倍を維持する。

| 項目 | 内容 |
| ---- | ---- |
| 足元アンカー | `layout.y` = `groundY`（全員共通） |
| 奥行き | `depthOffsetY` — `spriteDrawOrder` と同じ並びで陣営内に割当（奥ほど大きい） |
| 敵の正本 | Wave 内の全敵（倒れた敵含む `snapshot.enemies`）。生存敵の Y は撃破後も変わらない |
| 描画 Y | `spriteDrawY = layout.y - depthOffsetY` |
| 段幅 | `VISUAL_DEPTH_STEP_PX`（10px × スプライト scale） |

実装：`src/render/spriteVisualDepth.ts`（`assignVisualDepthOffsets`）→ `BattleCanvas.ts`、VFX・ポップアップは `spriteDrawY` を参照。§2.7 の描画順と同一キーで深度を決める。

**背景（§2.8 続き）：** 地面は水平のまま固定。草タイル帯は `MAX_VISUAL_DEPTH_RISE`（最大オフセット 30px + 余白 10px = 40px）だけ上へ延長し、最大奥行きユニットの足元が草の上端に乗らないよう余白を確保。パララックス（`worldOffsetX`）のみ動的。キャンバス上端は `VISUAL_DEPTH_TOP_PAD_PX`（30px）を追加。

### 2.9 entity body アニメ（idle / move）

`BattleEngine` がスナップショット各ユニットに `bodyAnimMarching` を付与し、`BattleCanvas` が `move` / `idle` を切り替える。判定正本は `src/battle/bodyAnimMarching.ts`（`battleX` のフレーム差分や overlap 微調整は使わない）。

| `bodyAnimMarching === true` | PartyDeploy 目標へ未着、接敵自動接近中、スキル `move` 実行中、Wave 間/Victory 退場 march |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `false`                     | 配置完了待ち、射程内で自動接近停止、死亡、その他静止                                       |

---

## 3. Wave・フィールド構造

### 3.1 マップ

**2D マップは存在しない。** 横 1 軸のバトルラインのみ。Y は §2.8 の擬似奥行きオフセット（`formationRow` はターゲット等の論理区分）。

### 3.2 データ

```json
{
  "waves": [
    {
      "enemies": [{ "templateId": "stage1_1", "spawnX": 120 }]
    }
  ]
}
```

- `spawnX` — **画面中心（240px）からの右オフセット**。`0 <= spawnX <= 240`。`battleX = 240 + spawnX`（240 で中央、240 で右端 480）

### 3.3 プレイヤー隊形（射程順一列）

1. **X 配置正本** — 全生存味方を **射程降順（長い＝左）** で一列。同射程は **物理 `attacker`** を左
2. **スロット間隔** — 左端 `PARTY_FORMATION_LEFT_ANCHOR`（20px）、以降 `+32px`
3. **`formationRow`** — Y 描画・スキルターゲット用（`classes.json`）。X 深度には使わない
4. **overlap 解消** — §4.2（接敵時プレイヤー必須）

分類用途の `isMeleeRangePx` / `isMeleeUnit` は本書の距離計算・layout 正本から除外し、[combat.md](combat.md) / [classes-and-skills.md](classes-and-skills.md) に委譲する。

### 3.4 Wave ライフサイクル

1. **`WaveAnnouncement` + `PartyDeploy`（同時）** — Wave 告知表示中に、味方を画面左外から **隊形アンカー** へ、敵を画面右外から **spawn 位置** へ移動
2. **接敵** — 告知 fade-out 開始から 250ms 経過 **かつ** PartyDeploy 到達後に `Engaged`（**layout bake なし**。味方・敵とも deploy 終点から自動接近で接敵）
3. 敵全滅 → 死亡演出 → `PostCombatSettle`
4. 次 Wave あり → `VictoryExit` と同様の右退場（`worldOffsetX` パララックス）→ Wave 告知 + PartyDeploy（同時）
5. ステージクリア → `VictoryExit`（接敵終了時の `battleX` を維持し右退場のみ）

**生死と表示：**

- プレイヤー：同一 Wave 中は死体表示。次 Wave 進軍開始でスプライトのみ非表示（HP0・HUD は維持）
- 敵：Wave 終了で差し替え。死体は Wave 内のみ

---

## 4. フェーズと移動

### 4.1 BattlePhase FSM

| Phase                | 概要                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `WaveAnnouncement`   | 各 Wave 開始。告知オーバーレイ（Victory 同様の fade/hold/fade）              |
| `PartyDeploy`        | 告知と **同時**。味方左外 → 隊形アンカー、敵右外 → spawn 位置（接敵接近はまだ行わない） |
| `Engaged`            | 告知 fade-out 開始 + 250ms かつ Deploy 到達後。味方・敵とも自動接近・スキル開始 |
| `PostCombatSettle`   | 敵全滅後の死亡演出待ち                                                       |
| `VictoryExit`        | Wave 間・ステージクリア。位置維持のまま右退場（`worldOffsetX` パララックス） |
| `Defeat` / `Respawn` | 既存 combat フローに準拠                                                     |

`PartyDeploy` / 告知中はスキル発動を停止。CD / DoT / HoT は継続。

### 4.2 `applyEngagedFormationToBattleX`（R1-fix + L10）

**`layout bake` のタイミング：** 接敵開始・前列死亡・構成変化（毎 tick 不可）。`layout bake` の詳細は以下の通り。

| タイミング           | layout bake | 実装箇所                                                         |
| -------------------- | ----------- | ---------------------------------------------------------------- |
| 通常 Wave 接敵開始   | しない      | `setupEngagedCombat`（凍結・署名のみ）                           |
| 訓練ステージ         | する        | `prepareTrainingWave` → `resolveEngagedLayoutForEvent` + `applyEngagedFormationLayout` |
| 接敵中の構成変化     | する        | `maybeRecomputeEngagedLayout` → `applyEngagedFormationLayout`（部分適用可） |

```
1. スロット ideal battleX（§3.3）
2. 接敵アンカーへ前衛を配置（§2.5: 敵接触 − 最前列最短 `effectiveRangePx`。`engagedMinBodyGap` は加算しない）
3. 敵接触帯: 味方最前列 `battleX` + 接触帯最短 `effectiveRangePx`（body gap 加算なし）
4. resolveOverlaps(PLAYER_VISUAL_MIN_GAP) on battleX  ← 味方同士・敵同士の overlap のみ
5. `maybeRecomputeEngagedLayout`（前列死亡・構成変化時）のみ `applyEngagedFormationToBattleX` を実行。Wave 接敵開始（`setupEngagedCombat`）では bake しない
```

**禁止：**

- `battleX` / `visualX` 二重パイプラインと橋渡し sync
- 毎 tick の layout 目標再計算 + visual 補間
- layout 外の座標直接 mutation

**凍結フィールド（接敵開始時）：**

- `engagedVisualSlot` — 接敵開始時に固定する表示上の射程 px 奥行き（legacy: `engagedMeleeVisualSlot`）
- `engagedVisualTargetPlayerId` — 遠距離敵の狙いプレイヤー（L5）

### 4.3 接敵開始

**正本：** Wave 告知と PartyDeploy が同時開始。接敵（`engaged = true`）は **告知 fade-out 開始 + 250ms** 経過 **かつ** 全ユニットが deploy 目標に到達した時点。接敵開始フレームでは `battleX` を layout で上書きせず、自動接近（§4.4）で味方・敵とも接敵する。なお、`layout bake` の詳細は[§4.2](#42-layout-bake)を参照。

敵左進軍・standoff cap による接敵トリガーは廃止。

### 4.4 自動接近（`battleX`）

接近（chase）と攻撃停止（attack）は **同じ target 判定系** を共有し、停止距離だけ `effectiveRangePx` で解く（`resolveApproachBattleX.ts`）。
`getMeleeEnemyContactX` は表示や旧互換 helper 用で、接近停止の正本ではない。

**Target Intent 境界:** 接近・攻撃・移動・表示は対象選択の目的が異なる。

| Intent | この章での用途 | 正本 |
| ------ | -------------- | ---- |
| `ChaseTarget` | 自動接近で追う相手 | 敵は Threat、味方は target spec |
| `AttackTarget` | 射程内停止と実際の攻撃対象 | 射程内プール。敵の対プレイヤーは Threat 優先 |
| `MoveAnchor` | スキル `move` の到達基準 | 使用者との `battleX` 距離。Threat は使わない |
| `DisplayAnchor` | 遠隔敵の表示凍結・VFX 基準 | 描画専用。戦闘判定へ逆流させない |

| 側                           | chase（毎 tick 再評価）                                           | attack / 停止判定                                                  |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| 敵                           | 全生存プレイヤーからヘイト最大（`resolveEnemyChaseTargetPlayer`） | 射程内プレイヤーからヘイト最大（`resolveEnemyAttackTargetPlayer`） |
| 味方（defender）             | 敵全体の接触点を基準に前進                                        | attack プールで `effectiveRangePx` 内なら停止                      |
| 味方（attacker / supporter） | ターゲット spec の敵プールから **奥**（`battleX` 最大）           | 同じ attack プールで `effectiveRangePx` 内なら停止                |
| 味方（ally-heal 通常攻撃の supporter） | 射程外の負傷味方へ接近。全員健康なら **現位置維持**（敵 chase しない） | 射程内の負傷味方がいれば停止（`shouldSkipEngagedAutoApproach`）   |

**停止 X：** chase 対象の `battleX` に対し `resolveApproachAttackBattleX`（§2.5 と同じ射程式）。敵は `capEngagedEnemyApproachBattleX` により左（`battleX` 減少）のみ。

**自動接近スキップ：** `shouldSkipEngagedAutoApproach` — attack プールに 1 体でもいれば接近しない（射程内で攻撃待機）。`test_ranged` も通常の attack プールとして扱う。

**味方の追加 cap：**

- 前衛（`formationRow !== 'back'`）：敵全体の接触点より右へ過進軍しない（`capFrontRowBeforeEnemyContact`）
- 接近ターゲットの row-order clamp は前衛 / 後衛で共通で、`applyFormationRowApproachSpacing` の後に `capApproachFormationOrder`（`resolveApproachBattleX.ts`）で適用する。supporter の個別接近意図（全員健康時の heal 静止など）を連鎖で上書きしない

**敵の追い替え：** 前線ユニットが後列ヘイトへ追いかけている間も、毎 tick でヘイト 1 位を chase 対象にする（スティッキー chase ID なし）。射程内に入ったら attack プールで停止・攻撃。

**遠隔敵の表示凍結：** 接敵開始時 `engagedVisualTargetPlayerId` は attack プール → なければ chase（`battleDisplay.freezeRangedTargets`）。接敵中の攻撃ターゲット解決とは独立。

**スキル `move` 中・シーケンス busy 中**の actor は自動接近対象外。接敵中の `resolveEngagedFormationOverlaps` でも **スキルモーション中ユニットは overlap 対象から除外**（一時的な `battleX` で味方を引っ張らない）。

**敵対 `toAnchor` スキル:** 自動接近で anchor が通常攻撃射程内に入るまで発動を保留（`SkillExecutor`）。射程内発動後の背後移動は `effect.range` で 1 ステップ上限（§2.5）。

### 4.5 スキル `move`

- `battleX` — `SkillSequenceRunner` が線形補間（正本・描画も同値）
- `effectiveRangePx` — `resolveMaxEffectiveRangePx(unit, gameData)`（debug / 検証用の実効射程）
- 敵背後へのプレイヤー `toAnchor`（正オフセット）はスコープ内。敵のプレイヤー背後移動はスコープ外

### 4.6 非接敵 tick

`PartyDeploy` / `PostCombatSettle` 中も DoT/HoT・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は `Engaged` 中のみ（[combat.md](combat.md) と整合）。

---

## 5. モジュール構成（作り直し後）

| モジュール                                 | 責務                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `combatPosition.ts`                        | **pure `battleX`**。接近・cap・knockback・`resolveMoveBattleX`。render へ import しない |
| `battleLayout.ts`                          | 隊形スロット、overlap、`applyEngagedFormationToBattleX`                                 |
| `partyFormation.ts`                        | 射程順一列の ideal `battleX`                                                            |
| `battleConstants.ts`（新設 or `types.ts`） | §2.6 定数の単一正本                                                                     |
| `BattleEngine.ts`                          | BattlePhase FSM、tick 順序のオーケストレーション                                        |
| `formationLayout.ts`                       | `groundY`、HUD 余白、`CANVAS_W` 等 **キャンバス定数のみ**                               |
| `BattleCanvas.ts`                          | snapshot → 描画                                                                         |
| `spriteDrawOrder.ts`                       | スプライト重なり順（§2.7）                                                              |
| `spriteVisualDepth.ts`                     | 擬似奥行き Y オフセット（§2.8）                                                         |
| `battleFieldBackground.ts`                 | 空・草タイル描画（水平地面＋草帯の固定延長）                                            |

**依存方向：** `battleLayout` → `combatPosition` / `battleConstants`（一方向）。`combatPosition` → `formationLayout` **禁止**。

---

## 6. 現状の問題と解消方針

### 6.1 症状（解消済み / 監視中）

**解消済み（2026-06 レガシー整理）：**

- 接敵中の layout 収束フラグ（`engagedEnemyLayoutTargets`）と combat approach の二重分岐
- `battleLayout` が `visualX` を正本として layout bake と approach が乖離
- 後衛が隊形深度 cap で射程停止より前方へ引きずられる問題
- **接敵開始時のワープ** — `setupEngagedCombat` で layout bake せず deploy 終点のまま `Engaged` へ遷移。接敵接近は自動接近のみ（§3.4・§4.3）

**監視中：**

- 前列死亡・Wave 跨ぎ時のワープ（layout snap と approach の競合）
- 混成前列の overlap 補正タイミング

### 6.2 根本原因

| ID  | 内容                                                               |
| --- | ------------------------------------------------------------------ |
| R1  | `battleX` と `visualX` の二重パイプライン + 橋渡し散在             |
| R2  | `BattleEngine` の位相フラグごと分岐（bake 対象が不一致）           |
| R3  | `combatPosition` ↔ `formationLayout` 循環依存・重複定数            |
| R4  | 射程計算と分類の正本が battle-field / combat / classes-and-skills に分散 |

### 6.3 解消ロジック（確定済み）

| ID         | 採用                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| **R1-fix** | **`battleX` 単一座標。** `visualX` 廃止。描画 = ロジック                    |
| L2         | 単一 `FormationReset`（Wave 1 は背景・時間差分のみ）                        |
| L5         | `engagedVisualTargetPlayerId` を layout で必ず参照                          |
| L6         | 分類用途の `isMeleeUnit` は [combat.md](combat.md) / [classes-and-skills.md](classes-and-skills.md) に委譲 |
| L7         | モジュール分割 + 一方向 import                                              |
| L8         | 軸反転を座標系として一括適用                                                |
| L9         | layout snapshot 単体テストへ置換                                            |
| L10        | overlap は `resolveOverlaps` のみ。`engagedMinBodyGap()` / `PLAYER_VISUAL_MIN_GAP` は射程加算に使わない |

**廃止：** L1（毎 tick layout tick）、L3（visual 双方向補間を approach 正本へ統合）、接敵 layout 収束タイマー（`engagedEnemyLayoutTargets`）、`engageStandoff.ts` 等の未使用 helper。

**overlap 解消は維持。** 捨てるのは二重パイプライン・毎 tick layout 再計算・layout 収束と approach の競合。

### 6.4 背後移動スコープ

| 対象                                           | 含む       |
| ---------------------------------------------- | ---------- |
| 敵のプレイヤー背後移動                         | **いいえ** |
| プレイヤー `move`（`toAnchor` 正オフセット等） | **はい**   |

---

## 付録 A. 業界参考（補足）

| 型                 | 参考にした点                           | 採用              |
| ------------------ | -------------------------------------- | ----------------- |
| A 横スクロール     | 右進軍、前方スポーン、パララックス背景 | L2/L8             |
| B 固定スロット     | `row + slotIndex × spacing`            | スロット割当・L10 |
| C リアルタイム接近 | 射程内 approach、凍結アンカー          | L5・自動接近      |
| D レーン TD        | Wave + `spawnX`                        | §3                |

採用しない：A\* / 静止グリッド戦闘 / 敵の背後回り AI。

---

## 付録 B. 仕様準拠テスト ID

| 接頭辞 | ファイル                          | 内容                                                     |
| ------ | --------------------------------- | -------------------------------------------------------- |
| F-\*   | `battleFieldFormation.test.ts`    | §3.3 隊形 pure（BattleEngine 不使用）                    |
| A-\*   | `battleFieldArchitecture.test.ts` | L1 / §4.2 / §4.6 構造 invariant。`it.fails` は現行未準拠 |
| I-\*   | `battleFieldIntegration.test.ts`  | §4.1 画面結果・勝利演出（最小核）                        |

**I-\* 維持ケース（統合）:**

| ID           | 内容                                                       |
| ------------ | ---------------------------------------------------------- |
| I-§4.1-01    | 接敵前 march の味方画面左寄せ                              |
| I-§4.1-03b   | Wave 1 接敵中 15s 味方 on-screen                           |
| I-§4.1-07    | Wave 1 接敵中 敵 on-screen + per-tick delta 安定           |
| I-§4.1-05    | Wave 1 全滅 →Wave 2 march 開始までの ally screen jump 上限 |
| I-§4.1-06a   | 勝利/全滅遷移時の ally screen jump 上限                    |
| I-§4.1-06b   | Wave 2 敵全滅 tick の ally screen jump 上限                |
| I-Victory-01 | 勝利直後 on-screen（退場 march 待ち）                      |
| I-Victory-02 | 勝利後の右方向退場 march                                   |

A-/F- で代替した旧 I-\*（§4.6 カメラ、§3.3 隊形順、振動 sign-flip 等）は削除済み。layout pure テストは `battleLayout.test.ts` に集約。

共通 harness: `src/battle/test/battleFieldSpec.harness.ts`

---

## 関連ドキュメント

- [combat.md](combat.md) — ダメージ、CD、脅威、ステータス（座標節は本書へ委譲）
- [classes-and-skills.md](classes-and-skills.md) — スキル `move` スキーマ
- `data/stages.json` — Wave / `spawnX`
