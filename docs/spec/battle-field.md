# 戦闘フィールド（位置・移動・描画）

実装：`src/battle/battleLayout.ts`, `combatPosition.ts`, `partyFormation.ts`, `bodyAnimMarching.ts`, `BattleEngine.ts`
描画：`src/render/BattleCanvas.ts`（`screenX = battleX`）
戦闘中統計 UI：`src/ui/PartyHudPanel.ts`, `BattleStatsDrawer.ts`, `PartyMemberStatsDisplay.ts`（sync ヘルパー）, `PartyMemberEffectiveStatsPanel.ts`, `combatantBattleStatsDisplay.ts`, `src/styles/battle-stats-drawer.css`, `party-member-stats.css`, `party-member-effective-stats.css`

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
- `screenX` は `battleX` の別名として扱う。`battleCamera.ts` 互換層は持たない
- `src/render` は `battleX`（= `screenX`）を描画座標として参照し、戦闘ルールを持たない

### 2.3 毎 tick パイプライン

```
BattlePhase 判定
  → tickBattleX（PartyDeploy / 自動接近・knockback・隊形 overlap 解消）
  → skill move（busy actor。SkillSequenceRunner が battleX を補間）
  → BattleSnapshot
```

接敵中の生存ユニット `battleX` 更新は §4.4 の系統（approach / skill move / forced movement / overlap）のみ。**毎 tick の layout 再計算・visual 補間は行わない。** 非接敵配置確定時のみ `applyEngagedFormationToBattleX`（§4.2）。

verify/debug mode の `battleX debug` 表は、tick 内の `battleX` 更新内訳（approach / skillMove / knockback / enemyReelIn / overlap / deploy / victoryExit / layoutBake / corpseAnchor 等）を調査するための表示であり、runtime 正本ではない。`approach` 行は **移動量 0 でも** `target` / `skip` / **PHT id** / **heal withhold 理由** があるとき表に載せ、`details` 列と行 hover（`title`）の両方で見られる（[combat.md](combat.md) §回復 PHT）。通常 snapshot には trace を含めない。

確認モード ON 時は、Wave 内 tick ごとの `BattleSnapshot` と当 tick の trace をリングバッファ（最大 3600 frame ≒ 60 秒）に保持し、debug UI で pause / seek / warning ジャンプできる。Wave 切替で buffer はクリアする。**replay pause 中は `BattleEngine.tick` も停止**し、Wave 進行や buffer 上書きを防ぐ。完全な決定論 replay 再計算は行わず、保存済み snapshot の playback のみ。

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

- 射程内: `Math.abs(getBattleX(actor) - getBattleX(target)) <= effectiveRangePx`（`isWithinSkillRange`。敵対・味方問わず 1D 絶対距離）
- 停止 `battleX`（プレイヤー → 対象）: `target.battleX - effectiveRangePx`
- 停止 `battleX`（敵 → 対象）: `target.battleX + effectiveRangePx`

**`move` の `moveMode`（プレイヤー actor・新軸）：**

| mode       | 目標 `battleX`                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engage`   | `anchor.battleX - effectiveRangePx`（敵の手前＝後方側）                                                                                                |
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
| `PLAYER_VISUAL_MIN_GAP`              | プレイヤー overlap 解消（≈ `SPRITE_WIDTH + bodyClearance`）。射程加算には使わない                               |
| `CONFIGURABLE_RANGE_PX_MAX`          | `traits.rangePx` / `effect.range` の設定上限（`CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR`）                        |
| `MOVE_PX_PER_SEC`（120）             | 1 秒あたりの戦闘移動量（px）。進軍・接敵接近・PartyDeploy・隊形復帰に使用。Victory 退場は `MOVE_PX_PER_SEC × 2` |

`formationRow` は Y 描画・ターゲット用。X 深度の正本は射程順一列（`partyFormation.ts`）。

**同一 `formationRow` 内の X 深度（左＝後方、右＝前方）：**

| 列      | 深度ルール（左 → 右）                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `front` | 近接帯の attacker/defender を最前帯（右）。帯内は `rangePx` 降順 → 同値は `id` 順。それ以外（supporter・前列遠隔など）は後方帯（左） |
| `back`  | ロール順: attacker → supporter → defender → `rangePx` 降順 → `id` 順（従来どおり）                                                   |

前列の supporter は近接最前帯（attacker/defender かつ `rangePx < RANGED_ATTACK_MIN_PX`）の手前に留める。接敵接近では supporter の停止 X をその最前帯の手前に cap する（`resolveApproachBattleX.ts` の `capFrontRowSupporterBehindMeleeFront`）。
この例外は defender の代替壁を作るためではなく、`sp_alchemist` のような近接帯 Survival に **前線直後から局所 sustain を差し込む位置** を与えるためのものとして扱う。

### 2.7 スプライト描画順（重なり）

Canvas 2D の描画順（先に描いた方が下層）で重なりを決める。実装：`src/render/spriteDrawOrder.ts` → `BattleCanvas.ts`。

| 優先 | ルール                           | 意味                                     |
| ---- | -------------------------------- | ---------------------------------------- |
| 1    | **敵を先に描画**                 | プレイヤー側スプライトが敵より手前（上） |
| 2    | **味方はロール帯で重なり**       | 下表の順で手前に重なる（上→下）          |
| 3    | **敵内は射程が長い方を先に描画** | 射程の短い敵ほど上に重なる               |
| 4    | **同一帯内は後方を先に描画**     | 手前に立つユニットが後方ユニットより上   |

**味方のロール帯（手前＝上層 → 奥＝下層）：**

| 手前（上） | ロール帯                  | 判定                                        |
| ---------- | ------------------------- | ------------------------------------------- |
| 1          | 近接 `attacker` UI ロール | `role === "attacker"` かつ `rangePx < 100`  |
| 2          | 遠隔 `attacker` UI ロール | `role === "attacker"` かつ `rangePx >= 100` |
| 3          | ディフェンダー            | `role === "defender"`                       |
| 4          | `supporter` UI ロール     | `role === "supporter"`                      |

**後方の定義（陣営ごとの battleX 向き）：**

| 陣営         | 後方（下層）                       | 前方（上層）                       |
| ------------ | ---------------------------------- | ---------------------------------- |
| プレイヤー側 | 小さい `battleX`（画面左）         | 大きい `battleX`（敵寄り）         |
| 敵           | 大きい `battleX`（画面右・退却側） | 小さい `battleX`（プレイヤー寄り） |

ソートキーはまず陣営で分け、味方同士は `allyRoleBackDepth`（0〜3 の昇順）、敵同士は `rangePx` の降順（長い方が下層）、同一帯内は `factionBackDepth`：`isEnemy ? -battleX : battleX` の昇順。同深度は `id` 辞書順。

### 2.8 擬似奥行き（Y オフセット）

同一 `battleX` 付近でスプライトが重ならないよう、**描画のみ** Y をずらす。`battleX`（戦闘正本）は変えない。スケールは変えずドット絵の等倍を維持する。

| 項目         | 内容                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| 足元アンカー | `layout.y` = `groundY`（全員共通）                                                |
| 奥行き       | `depthOffsetY` — `spriteDrawOrder` と同じ並びで陣営内に割当（奥ほど大きい）       |
| 敵の正本     | Wave 内の全敵（倒れた敵含む `snapshot.enemies`）。生存敵の Y は撃破後も変わらない |
| 描画 Y       | `spriteDrawY = layout.y - depthOffsetY`                                           |
| 段幅         | `VISUAL_DEPTH_STEP_PX`（10px × スプライト scale）                                 |

実装：`src/render/spriteVisualDepth.ts`（`assignVisualDepthOffsets`）→ `BattleCanvas.ts`、VFX・ポップアップは `spriteDrawY` を参照。§2.7 の描画順と同一キーで深度を決める。

**背景（§2.8 続き）：** 地面は水平のまま固定。草タイル帯は `MAX_VISUAL_DEPTH_RISE`（最大オフセット 30px + 余白 10px = 40px）だけ上へ延長し、最大奥行きユニットの足元が草の上端に乗らないよう余白を確保。パララックス（`worldOffsetX`）のみ動的。キャンバス上端は `VISUAL_DEPTH_TOP_PAD_PX`（30px）を追加。

### 2.9 entity body アニメ（idle / move）

`BattleEngine` がスナップショット各ユニットに `bodyAnimMarching` を付与し、`BattleCanvas` が `move` / `idle` を切り替える。判定正本は `src/battle/bodyAnimMarching.ts`（`battleX` のフレーム差分や overlap 微調整は使わない）。

| `bodyAnimMarching === true` | PartyDeploy 目標へ未着、接敵自動接近中、スキル `move` 実行中、Wave 間/Victory 退場 march |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `false`                     | 配置完了待ち、射程内で自動接近停止、死亡、その他静止                                     |

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
3. **`formationRow`** — Y 描画・クラス既定の編成分類（`classes.json`）。**X 深度・接敵・aura 範囲には使わない**
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

| Phase                | 概要                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------- |
| `WaveAnnouncement`   | 各 Wave 開始。告知オーバーレイ（Victory 同様の fade/hold/fade）                         |
| `PartyDeploy`        | 告知と **同時**。味方左外 → 隊形アンカー、敵右外 → spawn 位置（接敵接近はまだ行わない） |
| `Engaged`            | 告知 fade-out 開始 + 250ms かつ Deploy 到達後。味方・敵とも自動接近・スキル開始         |
| `PostCombatSettle`   | 敵全滅後の死亡演出待ち                                                                  |
| `VictoryExit`        | Wave 間・ステージクリア。位置維持のまま右退場（`worldOffsetX` パララックス）            |
| `Defeat` / `Respawn` | 既存 combat フローに準拠                                                                |

`PartyDeploy` / 告知中はスキル発動を停止。CD / DoT / HoT は継続。

### 4.2 `applyEngagedFormationToBattleX`（R1-fix + L10）

**`layout bake` の用途：** **非接敵配置確定用** layout bake。Engaged 中の前列死亡・敵近接死亡・構成変化では bake しない。

| タイミング                       | layout bake | 実装箇所                                                                               |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Wave 開始 / PartyDeploy 目標確定 | しない      | deploy 終点を維持。接敵は自動接近のみ                                                  |
| 通常 Wave 接敵開始               | しない      | `setupEngagedCombat`（凍結・署名のみ）                                                 |
| 訓練ステージ                     | する        | `prepareTrainingWave` → `resolveEngagedLayoutForEvent` + `applyEngagedFormationLayout` |
| 初期配置                         | する        | 同上（訓練と同経路）                                                                   |
| **Engaged 中の前列死亡**         | **禁止**    | `maybeRecomputeEngagedLayout` — target / contact / 凍結のみ                   |
| **Engaged 中の敵近接死亡**       | **禁止**    | 同上                                                                                   |
| **Engaged 中の構成変化**         | **禁止**    | 同上（署名更新・`freezeEngagedMeleeVisualSlots`・ranged display target 更新）          |

```
1. スロット ideal battleX（§3.3）
2. 接敵アンカーへ前衛を配置（§2.5: 敵接触 − 最前列最短 `effectiveRangePx`。`engagedMinBodyGap` は加算しない）
3. 敵接触帯: 味方最前列 `battleX` + 接触帯最短 `effectiveRangePx`（body gap 加算なし）
4. resolveOverlaps(PLAYER_VISUAL_MIN_GAP) on battleX  ← 味方同士・敵同士の overlap のみ
5. 上記 bake は非接敵配置確定（訓練等）のみ。Engaged 中の構成変化では `applyEngagedFormationToBattleX` を呼ばない
```

**禁止：**

- `battleX` / `visualX` 二重パイプラインと橋渡し sync
- 毎 tick の layout 目標再計算 + visual 補間
- Engaged 中の layout bake（前列死亡・敵近接死亡・構成変化を含む）
- layout 外の座標直接 mutation（§4.4 の approach target cap を除く）

**Engaged 中の構成変化時（前列死亡・敵近接死亡含む）：**

- target / contact / frontline owner の再評価のみ
- `freezeEngagedMeleeVisualSlots`（敵近接構成変化時）
- `engagedDisplayAnchorPlayerId` の再凍結（`freezeRangedTargets`）
- 生存ユニットの `battleX` を formation snap **しない**

**凍結フィールド（接敵開始時）：**

- `engagedMeleeDepthSlot` — 接敵開始時に固定する射程 px 奥行き（近接敵の列内深度）
- `engagedDisplayAnchorPlayerId` — 遠距離敵の DisplayAnchor（L5）

### 4.3 接敵開始

**正本：** Wave 告知と PartyDeploy が同時開始。接敵（`engaged = true`）は **告知 fade-out 開始 + 250ms** 経過 **かつ** 全ユニットが deploy 目標に到達した時点。接敵開始フレームでは `battleX` を layout で上書きせず、自動接近（§4.4）で味方・敵とも接敵する。なお、`layout bake` の詳細は[§4.2](#42-layout-bake)を参照。

敵左進軍・standoff cap による接敵トリガーは廃止。

### 4.4 自動接近（`battleX`）

接近（chase）と攻撃停止（attack）は **同じ target 判定系** を共有し、停止距離だけ `effectiveRangePx` で解く（`resolveApproachBattleX.ts`）。defender も例外にせず、全ロール共通で `ChaseTarget → standoff battleX → AttackTarget` の順に扱う。
`getEnemyContactX` / `getMeleeEnemyContactX` は contact / frontline / clamp / 表示 helper 用で、ロール専用の接近停止正本ではない。

**Target Intent 境界:** 接近・攻撃・移動・表示は対象選択の目的が異なる。

| Intent           | この章での用途                 | 正本                                                                                          |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `ChaseTarget`    | 自動接近で追う相手             | 敵は [combat.md](combat.md) §敵の単体ターゲット選定、味方は target spec / target rule |
| `AttackTarget`   | 射程内停止と実際の攻撃対象     | 敵は `ChaseTarget` の射程内判定。味方は同じ target spec 系の attack プール                     |
| `MoveAnchor`     | スキル `move` の到達基準       | 使用者との `battleX` 距離                                                          |
| `FrontlineOwner` | 現在その戦線を保持している味方 | `resolvePlayerFrontlineOwners`（`combatPosition.ts`）。rear assault アクセス中は含めない      |
| `DisplayAnchor`  | 遠隔敵の表示凍結・VFX 基準     | 描画専用。`engagedDisplayAnchorPlayerId`（`battleDisplay.ts` helper）。戦闘判定へ逆流させない |

| 側                                     | chase（毎 tick 再評価）                                                                                                                       | attack / 停止判定                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 敵                                     | [combat.md](combat.md) §敵の単体ターゲット選定（`resolveEnemyChaseTargetPlayer`）                                                             | `ChaseTarget` が射程内のときのみその 1 体（`resolveEnemyAttackTargetPlayer`） |
| 味方（全ロール共通）                   | target spec / target rule の敵プールから `ChaseTarget` を選ぶ。既定 `distance/enemy/nearest` は battle-line depth の **奥**（`battleX` 最大） | 同じ target spec 系の attack プールで `effectiveRangePx` 内なら停止 |
| 味方（ally-heal 通常攻撃の supporter） | 射程外の **PHT**（[combat.md](combat.md) §回復 PHT）へ接近。全員健康なら **現位置維持**（敵 chase しない）                                      | 射程内に **PHT** がいれば停止（`shouldSkipEngagedAutoApproach`）。任意の軽傷者では停止しない |

敵の chase 候補は敵の前方側にいるプレイヤー（`enemyForwardFacingPool`）。rear assault アクセス中のプレイヤーは敵の新しい `ChaseTarget` や前線所有者にはしない。

**rear assault アクセス状態（runtime）:** 背後滞在の runtime フラグは `CombatantState.accessState === "rearAssault"`（`setPlayerRearAssaultAccess` / `clearPlayerRearAssaultAccess`）。**戦線外判定の正本は `isPlayerRearAssaultAccess` のみ**（`combatPosition.ts`）。

| 呼び出し | 用途 |
| -------- | ---- |
| `isPlayerRearAssaultAccess(player, enemyAnchorX)` | 敵 anchor 基準（`enemyForwardFacingPool` 等） |
| `isPlayerRearAssaultAccess(player, { players, enemies })` | 接敵中の統一判定。`FrontlineOwner` / formation / overlap / march follow / approach clamp |

接敵 context の判定順: (1) `accessState === "rearAssault"` (2) 生存味方 peer 集合の固定点から「最前線 + `PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX`（3px）より前方」を除外 (3) **単独生存時のみ** `battleX > getEnemyContactX` fallback。遠隔だけ残って contact が大きく振れても、peer frontline で戦線外を判定する。

rear assault 中の味方は `applyFormationMarchFollow`・`resolveEngagedFormationOverlaps`・spacing の **基準から除外**する（戦線外の単独アクセス）。`applyPartyFormationApproachSpacing` は dead-chain 維持のため on-field 全スロットを入力に含めるが、戦線外ユニットの `baseApproach` は clamp する。

立てる条件: 味方 actor が敵対 anchor へ `moveMode: "toAnchor"` かつ `anchorOffsetPx > 0` の move を適用したとき（効果形状で判定）。解除: 非 rear の move 適用時、**`shouldClearRearAssaultAccess`（peer frontline 付近へ戻ったとき）**、スキルシーケンス完了時（同条件）、死亡・wave reset。`waitAfterSec` 中も move 完了だけでは解除しない。敵側のプレイヤー背後 move は本 spec のスコープ外。

**背後侵入後の復帰:** 専用 `engage` 帰還 step に依存しない。シーケンス完了後は通常 approach（`resolveAllPlayerApproachBattleX`）が正本。`battleX` が敵最前線より右（敵背後）に残っている間は `resolveApproachAttackBattleX` が **後退（battleX 減少）を許可**し、ChaseTarget の停止 X へ戻す。射程内に入れば `shouldSkipEngagedAutoApproach` で停止し攻撃可能。

**停止 X：** chase 対象の `battleX` に対し `resolveApproachAttackBattleX`（§2.5 と同じ射程式）。敵は `capEngagedEnemyApproachBattleX` により左（`battleX` 減少）のみ。味方 defender 専用の contact 停止 resolver は持たない。

**自動接近スキップ：** `shouldSkipEngagedAutoApproach` — attack プールに 1 体でもいれば接近しない（射程内で攻撃待機）。`test_ranged` も通常の attack プールとして扱う。

**pierce 敵向け通常攻撃の接近停止（`isPierceEnemyBasicAttack`）：** `selfOrigin` + `pierce` の敵向け通常攻撃は、接近停止の正本が「射程内に敵 1 体」ではない（上記 `shouldSkipEngagedAutoApproach` の単体射程内停止を使わない）。停止目標 `battleX` = `getEnemyContactX() − effectiveRangePx`（`resolvePierceApproachStopBattleX` / `capOnFieldBeforeEnemyContact` と同式）。pierce basic 持ちユニットはこの停止 X に到達するまで接近を継続する（`shouldSkipEngagedAutoApproach` 相当の意味。実装は別タスク）。`battleX >= pierceStopX − settleEpsilon` で接近停止。過前進（`battleX > pierceStopX`）時は `shouldSkip` を false のまま `updateUnitApproach` の双方向補間で `pierceStopX` へ戻す。接近目標 X も chase 個体ではなく contact 基準（`resolvePlayerChaseApproachBattleX`）。battle-line depth の **nearest**（`battleX` 最大＝戦線奥）を pierce 接近アンカーにしない。後列遠隔に引きずられて前進しすぎない。停止は contact 基準。

**用語（battle-line depth）：** プレイヤー敵 target の `nearest` = 奥（`battleX` 最大）、`farthest` = 手前。本節の pierce 接近はこの depth 用語と混同しない。

貫通形状・ターゲット仕様は [combat.md](combat.md) の `pierce` / `selfOrigin` 節を参照。

**味方の共有 clamp / formation レイヤ：**

- 戦線 on-field ユニット（rear assault 除外）：生存敵 contact より右へ過進軍しない（`capOnFieldBeforeEnemyContact`）。`formationRow` は使わない
- 前列 supporter（`role: supporter`）：近接最前帯の直後へ留める（`capFrontRowSupporterBehindMeleeFront`）。battleX / 近接帯で判定し `formationRow` は使わない。これは defender 代替壁ではなく前線直後 sustain 用の formation clamp。PHT 接近は cap 位置まで試み、cap 到達後も PHT が selfOrigin aoe / basic heal 射程内に入るまで withhold で空振りしない（[combat.md](combat.md) §回復 PHT）
- 接近ターゲットの depth-order clamp は全 on-field ユニット共通で、`applyPartyFormationApproachSpacing`（partyFormation ソート順）の後に `capApproachFormationOrder`（`resolveApproachBattleX.ts`）で適用する。supporter の個別接近意図（全員健康時の heal 静止など）を連鎖で上書きしない
- rear assault 中の味方は `applyFormationMarchFollow` の leader / follower から除外。`baseApproach` は formation chain 用に clamp し、背後位置を他ユニットの spacing 基準にしない

**敵の追い替え：** 毎 tick 手順 4（defender 優先・最近傍）または `targetRuleOverride` / 闘技場の掟で再選定する。ヒステリシスや `threatFocusTargetId` は使わない（[combat.md](combat.md) §敵の単体ターゲット選定）。射程内に入ったら attack プールで停止・攻撃。

**遠隔敵の表示凍結：** 接敵開始時 `engagedDisplayAnchorPlayerId`（`battleDisplay.getEngagedDisplayAnchorPlayerId` / `setEngagedDisplayAnchorPlayerId`）は attack プール → なければ chase（`battleDisplay.freezeRangedTargets`）。接敵中の攻撃ターゲット解決とは独立。DisplayAnchor は描画専用で `AttackTarget` / `ChaseTarget` / `MoveAnchor` へ逆流させない。

**スキル `move` 中・シーケンス busy 中**の actor は自動接近対象外。接敵中の `resolveEngagedFormationOverlaps` でも **スキルモーション中ユニットと rear assault アクセス中ユニットは overlap 対象から除外**（一時的な `battleX` で味方を引っ張らない）。

**敵対 `toAnchor` スキル:** 自動接近で anchor が通常攻撃射程内に入るまで発動を保留（`SkillExecutor`）。射程内発動後の背後移動は `effect.range` で 1 ステップ上限（§2.5）。

**Engaged 中の生存ユニット `battleX` 更新系統：**

| 系統            | 実装                                                                                              | 境界                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| approach        | `updateEngagedBattleMovement` → `resolveAllPlayerApproachBattleX` / `resolveEnemyApproachBattleX` | 通常の接近・射程停止。Phase 3d の Intent 一本化を正本とし、role 専用接近分岐を持たない             |
| skill move      | `SkillSequenceRunner.tickMoves`                                                                   | busy actor の `battleX` を moveDurationSec で補間。auto approach / overlap 対象から一時除外        |
| forced movement | `ccEffects.applyKnockbackToTarget` / `enemyReelIn.applyEnemyReelIn`                               | effect 成功時に `battleX` を即時更新。layout bake ではない     |
| overlap         | `resolveEngagedFormationOverlaps`（frontline melee クラスタ限定・生存のみ・skill motion / rear assault 除外） | 味方同士・敵同士の重なり解消だけ。射程停止・target 選択・死体固定には使わない。Engaged 中は approach と合算した 1 tick の総移動量を自動接近 step 内に制限し、formation snap や 32px 級の直接押し出し、不自然な加速を起こさない |

target / contact / frontline owner は **座標 snap の理由ではない**。approach / attack / display / clamp の入力として毎 tick 再評価するが、Engaged 中の生存ユニットを layout bake で再配置しない。

死亡敵は生存ユニット更新系統から外れ、`freezeEnemyCorpseBattleAnchor` / `syncDeadEnemyCorpseBattleX` が死亡時の `corpseBattleAnchorX` に `battleX` を固定する。これは死体表示の固定アンカーであり、`screenX` / camera の互換経路ではない。

**前列過進軍 cap：** `capOnFieldBeforeEnemyContact` は `resolveAllPlayerApproachBattleX` 内の共有 clamp / formation safety layer として適用する。`ChaseTarget` / `AttackTarget` の代替正本ではなく、Engaged 中に `battleX` を直接 mutation する独立 clamp 経路も持たない（旧 `clampEngagedFrontRowBattleX` 相当）。

### 4.5 スキル `move`

- `battleX` — `SkillSequenceRunner` が線形補間（正本・描画も同値）
- `battleX` — 唯一の横位置正本。描画 = ロジック
- `effectiveRangePx` — `resolveMaxEffectiveRangePx(unit, gameData)`（debug / 検証用の実効射程）
- 敵背後へのプレイヤー `toAnchor`（正オフセット）はスコープ内。敵のプレイヤー背後移動はスコープ外

### 4.6 非接敵 tick

`PartyDeploy` / `PostCombatSettle` 中も DoT/HoT・バフ/デバフ持続・CD 進行は継続。スキル発動・脅威 decay は `Engaged` 中のみ（[combat.md](combat.md) と整合）。

---

## 5. モジュール構成（作り直し後）

| モジュール                                 | 責務                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `combatPosition.ts`                        | **pure `battleX`**。接近・cap・`resolveMoveBattleX`・snapshot 互換同期。render へ import しない |
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
- **Engaged 中の構成変化 layout bake** — 前列死亡・敵近接死亡・構成変化で `applyEngagedFormationToBattleX` を呼ばない。target / contact / 凍結のみ
- **Engaged 中の直接 mutation clamp** — 旧 `clampEngagedFrontRowBattleX` を廃止。contact cap は approach target 解決（`capOnFieldBeforeEnemyContact`）に統合

**監視中：**

- Wave 跨ぎ時の ally 位置（VictoryExit march → 次 Wave PartyDeploy。layout bake なし）
- 混成前列の overlap 補正タイミング（leading row 限定・skill motion 除外・生存のみの制約維持）

### 6.2 根本原因

| ID  | 内容                                                                     |
| --- | ------------------------------------------------------------------------ |
| R1  | `battleX` と `visualX` の二重パイプライン + 橋渡し散在                   |
| R2  | `BattleEngine` の位相フラグごと分岐（bake 対象が不一致）                 |
| R3  | `combatPosition` ↔ `formationLayout` 循環依存・重複定数                 |
| R4  | 射程計算と分類の正本が battle-field / combat / classes-and-skills に分散 |

### 6.3 解消ロジック（確定済み）

| ID         | 採用                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| **R1-fix** | **`battleX` 単一座標。** 描画 = ロジック（`visualX` 二重パイプライン廃止済み）                              |
| L2         | 単一 `FormationReset`（Wave 1 は背景・時間差分のみ）                                                       |
| L5         | `engagedDisplayAnchorPlayerId` を layout で必ず参照（`resolveRangedTargetBattleX`）                        |
| L6         | 分類用途の `isMeleeUnit` は [combat.md](combat.md) / [classes-and-skills.md](classes-and-skills.md) に委譲 |
| L7         | モジュール分割 + 一方向 import                                                                             |
| L8         | 軸反転を座標系として一括適用                                                                               |
| L9         | layout snapshot 単体テストへ置換                                                                           |
| L10        | overlap は `resolveOverlaps` のみ。`engagedMinBodyGap()` / `PLAYER_VISUAL_MIN_GAP` は射程加算に使わない    |

**廃止：** L1（毎 tick layout tick）、L3（visual 双方向補間を approach 正本へ統合）、接敵 layout 収束タイマー（`engagedEnemyLayoutTargets`）、`engageStandoff.ts` 等の未使用 helper。

**overlap 解消は維持。** 捨てるのは二重パイプライン・毎 tick layout 再計算・layout 収束と approach の競合。

### 6.4 背後移動スコープ

| 対象                                           | 含む       |
| ---------------------------------------------- | ---------- |
| 敵のプレイヤー背後移動                         | **いいえ** |
| プレイヤー `move`（`toAnchor` 正オフセット等） | **はい**   |

---

## 7. 戦闘中統計 UI（戦闘詳細）

戦闘画面の **戦闘詳細**（`PartyHudPanel` 詳細モード + `BattleStatsDrawer` タブ）の画面設計正本。与ダメ / 被ダメ / 詳細バッジの sync は `PartyMemberStatsDisplay.ts` の関数を流用。ダメージ集計は [combat.md](combat.md)。DOM UI の共通デザイン言語は [party-formation-ui.md §11](party-formation-ui.md#11-デザイン方針dom-ui-共通) を参照（Phase 4d で編成 UI と揃える）。

**ヘイト廃止に伴う UI:** 詳細行の Threat バーは削除する（与ダメ / 被ダメバーのみ）。実装移行はヘイト廃止タスクに含める。

### 7.1 役割とデータ

| 要素 | 内容 |
| ---- | ---- |
| 起動 | Party HUD（`.party-hud-panel`）直下の **ドロワータブ**（`.party-hud-drawer-tab`、CSS シェブロンのみ）。`Escape` または同タブで閉じる |
| 配置 | `battle-canvas-frame` 内 — **上:** キャンバスオーバーレイ HUD（`.battle-canvas-hud`：左上ステージ名・中央上 Wave・右上 VERIFY バッジ）、`.battle-hud-stack`（パーティ帯 + Party HUD + ドロワータブ）。キャンバス幅（最大 480px）に揃える |
| キャンバス HUD | 戦闘キャンバス **内**オーバーレイ。**左:** ステージ表示名。**中央:** `Wave {n}/{total}`。**右上:** 確認モード切替バッジ — ON 時 `VERIFY`（琥珀）、OFF 時 `DEBUG`（控えめ）。クリックでトグル。独立した画面上部ヘッダー帯は **使わない** |
| パーティ帯 | Party HUD **直上**の帯。**左:** `プレイヤー Lv {n}` のみ（`resolvePlayerDisplayLevel`）。**右:** `.battle-party-menu-button`（テキスト「編成」のみ）→ `MetaMenuOverlay`（`initialView: "party"`）。**アイコンフォントは使わない** |
| 表示切替 | **詳細**（**起動時デフォルト**）= メンバー縦リスト（同一 `.party-hud-panel` 枠）。**コンパクト** = 横 4 列（HP・リキャスト・簡易バッジ）。下のタブで排他切替。別パネルの積み増しはしない |
| メンバー行（詳細） | 編成スロット順。`.party-hud-panel-slots` が **3 列トラック**（class **固定**（24px アイコン + 4px + **8ch** 名前幅。英語 `Swordsman` 基準、`--hud-header-font-size` 基準。§7.1.3）／bars **min 168px・`max(168px, 210px − class 拡張分)`・`1fr`**／damage 120px）の親グリッド、**`width: 100%`**。各 `.party-hud-slot` → `.party-hud-unit` は **`subgrid`** で同一トラックを共有し **bar 列開始 X は全ユニットで揃える**。class 列を広げた分は bars 最小幅から差し引く（合計幅不変）。**上段:** `"class bars damage"` × 2 行 — bars = HP + リキャスト 2×2。**下段 `status`:** 同一 3 列 `subgrid` — DEBUFF/BUFF ラベルは class 列、アイコン列は bars+damage 列。アイコン列は canvas 透過余白 + ゲージ外枠分を `margin-left` で左補正。**与列:** 非ヒーラー = 与ダメ（ATK タグ）、**ヒーラー（`role: supporter`）= 与回復量**（HoT タグ・短ラベル **癒**）。**被列:** 全員被ダメ。damage 列内は tag / 数値 / ゲージの固定幅グリッド。inline 数値は 4 桁以上を `1.2k` / `12k` のように短縮表示し、内部データ・非表示ラベル・アクセシビリティ用ラベルはステージ内累計値を保持する。**Exp・メンバー別 Lv は表示しない**（クラス表示名は 1 行・`readClassDisplayLabel`） |
| 与回復バー | ヒーラー同士で相対比較（与ダメと同型）。**ヒーラー 1 人のみ**のとき与列バーは **常に 100%**。集計は `StageDamageStatsTracker.recordHeal` — 実 HP 回復量（instant / HoT tick / heal 予約 / バリア枯渇 heal 等） |
| 状態バッジ帯 | debuff / buff でラベル行を分ける（例: Debuff / Buff）。`status` 行は unit と同じ 3 列 `subgrid` — ラベルは class 列、アイコンは bars+damage 列。**空行もラベルは維持**（低コントラスト）。**アイコン 0 件のときアイコン列は非表示・高さ 0**。詳細 HUD のバッジ canvas 行高 **22px**（内部 24px 描画の下透明 2px のみクロップ。buff/debuff 共通）。buff アイコン列下・debuff アイコン列上の行間はそれぞれ `--hud-detail-buff-icons-bottom-pull` / `--hud-detail-debuff-icons-top-pull`（各 3px）で CSS 負 margin。Debuff ラベル上 margin は buff アイコンあり時 0。行間 1px。**簡易 3+N 省略なし**（[combat.md](combat.md) HUD バッジ §簡易/詳細） |
| 更新 | 詳細モード中は `PartyHudPanel.updateDetailMetrics` で与ダメ / 与回復 / 被ダメ / 全バッジを refresh。HP / リキャストはコンパクトと同経路 |
| HP / リキャスト枠 | コンパクト・詳細とも **`.party-hud-bars` 全体の高さ**（`--hud-body-bar-h`）は最大 4 スロット（2×2）時で固定。解放 2 スロット時は `--hud-recast-slot-rows: 1` に下げ、リキャスト領域を 1 行分だけ低くし、差分は **HP バー高さ**（`flex: 1`）が吸収する。3〜4 スロット時は 2 行。未解放セルは `party-hud-recast-cell--locked`（`display: none`） |
| データ源 | `getStageDamageDisplayRows`（ステージ内累計与ダメ / **与回復（ヒーラーのみ）** / 被ダメ）、`CombatantSnapshot`（`statusEffects`）。**Exp / `partyProgress` は統計 UI スコープ外** |
| 確認モード | 現行は verify 経路でダメージ行が供給される。本番 Stage Records は **Phase 12** |

#### 7.1.1 戦闘中ステータス（Party HUD クリック）

| 要素 | 内容 |
| ---- | ---- |
| 起動 | Party HUD の **アイコン+HP/リキャスト行**（`.party-hud-icon-wrap` / `.party-hud-bars`）へ **マウスオーバー**。詳細モードでも同じ。パネル上にカーソルがあれば表示維持。離れたら非表示 |
| 配置 | 選択スロットの **クラス名行の直上**（`.party-hud-slot` 内、`bottom: 100%`）。Canvas 上ではなく HUD 列にアンカー |
| 対象 | **選択中スロット 1 人のみ** |
| 表示項目 | **HP**（`現在HP / 実効MaxHP`）、**攻撃力 / 防御力 / 魔法耐性 / 攻撃速度**（5 段階 tier ラベル）。**射程・基本攻撃は表示しない** |
| 補正列 | 各ステの右に `(+N)` / `(-N)`（REG は `(+N%)`）。SPD buff/debuff は **`(×倍率)`**（例: `(×1.25)`）。差分 0 は空 |
| 色 | 上昇（buff）= やや青（`#8eb8e8`）、低下（debuff）= やや赤（`#e89595`）。中央の実効値は通常色 |
| データ | `CombatantSnapshot`（`baseMaxHp` + `statusEffects` + ベース atk/def/reg）とクラス `attackSpeedTier`。実効計算は [combat.md](combat.md) の `getEffective*` / `aggregateStatEffects` と同一 |
| 更新 | パネル表示中は `BattleView.tick` 毎に refresh |

#### 7.1.2 状態バッジクリック（用語パネル）

| 要素 | 内容 |
| ---- | ---- |
| 起動 | Party HUD（コンパクト / 詳細）の **状態バッジ**（`.party-hud-status-badge-hit--interactive`）を **クリック**。辞書 `statusCategory` 対応エントリに **`description` があるときのみ** |
| パネル | 編成 UI と同じ **`GameTermPanel`**（`BattleView` が `canvasFrame` に 1 インスタンス）。見出し・本文・パネル内用語リンク・戻るは [party-formation-ui.md §6.4](party-formation-ui.md#64-インライン用語パネル) に準拠 |
| クリック不可 | `description` 省略の HUD 表示名のみ（例: stat 系 `hp` / `atk`）は **ホバーで表示名 tooltip のみ**（クリックで用語パネルは開かない） |
| ホバー | **全バッジ** — 表示名 tooltip（`resolveStatusBadgeTooltipLabel`）。`description` ありのバッジも同様 |
| `+N` 省略枠 | **ホバーのみ** — 省略分の表示名を `、` 連結（従来どおり）。個別の用語パネルは開かない |
| 演出 | クリック可能バッジは `cursor: pointer` + ホバー / 展開時のアウトライン（`battle-view.css`） |

#### 7.1.3 詳細 HUD — class 列幅

詳細 HUD の class 列は、英語クラス名 **`Swordsman` が収まる幅**を基準に **固定**する（`--hud-detail-class-name-ch: 8` @ `--hud-header-font-size`）。

| 項目 | 方針 |
| ---- | ---- |
| 目的 | 日本語名・英語名のどちらでもレイアウトが崩れない。全ユニットで **HP バー（bar 列）の開始 X を揃える**。詳細 HUD 全体をグリッドとして安定させる |
| 幅 | **固定**。クラス名の長さで bar 列開始位置を変えない |
| 日本語名 | 短い表示名では class 列内に余白が出ても **許容**（日本語名だけに幅を詰めない） |
| 長い名前 | **折り返さない**。`white-space: nowrap` + `text-overflow: ellipsis`。正式名は §7.1.1 ステータスパネル見出しで確認（ラベルへの `title` は付けない） |
| やらない | 名前の 2 行表示。クラスごとに可変幅にして bar 列をずらす |

### 7.2 デザイン方針（Phase 4d 刷新）

[party-formation-ui.md §11](party-formation-ui.md#11-デザイン方針dom-ui-共通) と同一。統計 UI 固有の目標:

| 現行（避ける） | 目標 |
| -------------- | ---- |
| 中央モーダル + 強 backdrop + 大角丸 + 強 box-shadow | **HUD 直下の同一枠** — コンパクト / 詳細を排他切替。枠は控えめ |
| ダッシュボード風 title bar（角丸 `×` ボタン等） | 閉じる操作は **ドロワータブ** と `Escape` のみ。装飾より可読性 |
| メンバー行の角丸グラデーション棒のみの区切り | **コンパクトと同じ控えめなメンバー枠**（`party-hud-slot`・inset 枠線 + 角丸 3px）で縦に並べる。枠間は `gap: 5px` |
| カードグリッド風の横並びダッシュボード | 詳細は **縦リスト**（各 `.party-hud-unit` = `grid-template-areas` による 3 列プレート + 全幅 status 行） |

**スコープ:** 表示項目・集計ロジックは変更しない（見た目のみ）。バー色の意味（与ダメ・被ダメ・down 時の減衰）は維持してよい。

### 7.3 受け入れ条件（Phase 4d — 統計部分）

1. 戦闘詳細が Web モーダル / ダッシュボード風に見えない（§11 準拠）。Party HUD **同一枠**でコンパクト / 詳細を切替する
2. 詳細モードで 4 人分の名前・与ダメ / 被ダメ・**全状態バッジ（debuff/buff ラベル付き）**・**HP / リキャスト**が **縦リスト**で読める。コンパクトモードのホバー（§7.1.1）も維持
3. `party-member-stats.css` のダメージ / 詳細バッジスタイルが Party HUD 詳細行に反映される
4. ドロワータブ / `Escape` で詳細モードを閉じられる

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
- [party-formation-ui.md](party-formation-ui.md) — DOM UI 共通デザイン（§11）、編成画面
- [classes-and-skills.md](classes-and-skills.md) — スキル `move` スキーマ
- `data/stages.json` — Wave / `spawnX`
