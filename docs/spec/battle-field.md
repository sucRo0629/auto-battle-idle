# 戦闘フィールド（位置・移動・描画）

実装：`src/battle/battleLayout.ts`, `combatPosition.ts`, `partyFormation.ts`, `bodyAnimMarching.ts`, `BattleEngine.ts`
描画：`src/render/BattleCanvas.ts`（`screenX = battleX`）
戦闘画面 UI / 戦闘中統計 UI：`src/ui/PartyHudPanel.ts`, `PartyMemberStatsDisplay.ts`（sync ヘルパー）, `PartyMemberEffectiveStatsPanel.ts`, `combatantBattleStatsDisplay.ts`, `src/ui/BattleView.ts`, `src/game/GameSession.ts`, `src/render/BattleCanvas.ts`, `src/styles/battle-view.css`, `src/styles/battle-stats-drawer.css`, `party-member-stats.css`, `party-member-effective-stats.css`

本ドキュメントは **横 1 軸のバトルライン** における座標・隊形・Wave・接敵・描画、および **戦闘画面 UI / HUD** の設計正本。ダメージ/CD/脅威等は [combat.md](combat.md) を参照。編成画面 DOM UI の設計は [party-formation-ui.md](party-formation-ui.md) を参照。

**現行コードとの関係：** 軸向き・用語・パイプラインは本書が正本。実装が追いつくまで [combat.md](combat.md) の座標節（旧記述）と不一致があり得る。

**Wave 作戦ループ（R3）:** 複数 Wave を通した作戦の上位進行・作戦状態 / 戦闘状態の分離・Wave 間準備・リトライは **[operation-loop.md](operation-loop.md)** が正本。本書 §3.4・§4.1 の BattlePhase FSM は **legacy 実装説明**（後続実装で置換）。

---

## Wave 作戦と legacy BattlePhase

### 新仕様 — 作戦状態と Wave 戦闘の境界

| 層 | 保持内容 | 正本 |
| -- | -------- | ---- |
| **作戦状態** | 編成、戦闘方式、作戦内パッシブ、クリア済み Wave、チェックポイント等 | [operation-loop.md §3.1](operation-loop.md#31-作戦状態複数-wave-を通して保持) |
| **Wave 戦闘** | Combatant、HP、Barrier、DoT、位置、Attack timer 等 | [operation-loop.md §3.2](operation-loop.md#32-戦闘状態wave-開始時に生成wave-終了時に破棄または初期化) |

**混在禁止:** 作戦状態と戦闘状態を同一オブジェクトへ無制限に混在させない（[operation-loop.md §3](operation-loop.md#3-作戦状態と戦闘状態の分離)）。

### 新仕様 — Wave 開始・終了時の責務（上位）

| タイミング | 責務 |
| ---------- | ---- |
| **Wave 開始** | 作戦状態から編成・戦闘方式・作戦内パッシブを読み、Wave 固有敵編成で **戦闘状態を新規構築**。続いて接敵・自動戦闘（本書 §3〜§4 の sim 節） |
| **Wave 勝利** | 戦闘 sim 停止 → 戦闘状態破棄 → 作戦状態へクリア記録 → Wave 間準備または作戦結果 |
| **Wave 敗北** | 戦闘状態破棄 → チェックポイント復元 → 再試行導線（作戦即終了しない） |
| **Wave 間** | HP 全回復ほか戦闘状態リセット。編成・戦闘方式・パッシブは作戦状態で維持（[operation-loop.md §7](operation-loop.md#7-wave-間の回復状態リセット)） |

### Legacy — 現行の自動 Wave 遷移

現行 production の 1 Wave 内 FSM は **§3.4 Wave ライフサイクル** および **§4.1 BattlePhase FSM** を参照。

```
WaveAnnouncement + PartyDeploy → Engaged → PostCombatSettle
  → （次 Wave あり）VictoryExit → WaveAnnouncement + PartyDeploy …
  → （最終 Wave）VictoryExit → ステージクリア
```

- **Wave 間準備が存在しない。** 勝利後は自動で次 Wave の PartyDeploy へ進む。
- **`WavePreparation` を BattlePhase enum へ追加するとは確定しない。** 準備画面は戦闘外ゲーム状態として実装する可能性が高い（[operation-loop.md §2](operation-loop.md#2-上位ループ)）。
- 後続 **R5〜R7** で、上記 legacy 自動遷移を [operation-loop.md](operation-loop.md) の上位ループへ置換する。

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
- `engagedMinBodyGap()` / `PLAYER_VISUAL_MIN_GAP` は overlap 解消と、敵対 `effectiveRangePx` の下限に使う。宣言射程への加算はしない（§2.5）
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
declaredRangePx = effect.range ?? actor.traits.rangePx
effectiveRangePx =
  allyHealOrBuff ? max(declaredRangePx, partyDepth)
  : max(declaredRangePx, engagedMinBodyGap())   // resolveHostileEngageRangePx
```

攻撃・回復・自動接近・engage move はこの共通式で扱う。

- 射程内: `Math.abs(getBattleX(actor) - getBattleX(target)) <= effectiveRangePx`（`isWithinSkillRange`。敵対・味方問わず 1D 絶対距離）
- 停止 `battleX`（プレイヤー → 対象）: `target.battleX - effectiveRangePx`
- 停止 `battleX`（敵 → 対象）: `target.battleX + effectiveRangePx`
- **敵対接近・攻撃**の `effectiveRangePx` は `engagedMinBodyGap()`（≈ `SPRITE_WIDTH`）を下回らない。短射程クラス（例: 双刃士 `rangePx: 25`）でも体幅より手前で止まる。**隊形順・近接/遠隔帯分類**は raw `traits.rangePx` のまま（`resolveFormationRangePx`）
- これは body gap の**加算**ではなく下限。L10 の「射程へ加算しない」と両立する

### 2.5.1 戦闘向き（facing）

| 項目 | 内容 |
| ---- | ---- |
| 既定向き | 味方 **+X（右）** / 敵 **−X（左）** |
| 反転条件 | **AttackTarget**（`resolvePlayerFacingFocus` / `resolveEnemyAttackTargetPlayer`）が既定向きの **背後** にいるとき。味方: より小さい `battleX` の敵または **背後の味方**（ally-heal の PHT 等） / 敵: より大きい `battleX` の味方 |
| ally-heal 接近中 | heal 停止条件（PHT 射程内 / 最前線 anchor 射程内）未達の間は `resolvePlayerFacingFocus` が null を返し **既定向きのまま**（後方味方だけ射程内でも背後反転しない） |
| 反転時 | `facingSign` を反転（`resolveFacingSign`）。`isInForwardSegment`（`pierce` 等）とスプライト描画が反転向きを参照する |
| 射程 | `isWithinSkillRange`（絶対距離）は向き非依存。変更しない |
| 接敵 | **ChaseTarget / 停止 X / formation clamp / rear assault 復帰** 等の自動接近ルールは本節で変更しない |

背後侵入（rear assault）で敵の背後に留まった双刃士などは、既定 +X のままだと背後側の敵が「前方セグメント」外になる。AttackTarget が射程内の背後敵なら向きを反転して攻撃・描画する。

**`move` の `moveMode`（プレイヤー actor・新軸）：**

| mode       | 目標 `battleX`                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `engage`   | `anchor.battleX - effectiveRangePx`（敵の手前＝後方側）                                                                                                |
| `toAnchor` | `anchor.battleX + anchorOffsetPx`（未指定=0。−=味方側、+=敵背後）。**敵／味方など敵対 anchor へ向かう場合**は 1 回の移動量を `effectiveRangePx` で上限 |

**ノックバック：** 各陣営の **後方** へ押す。プレイヤーは `-X`（左）、敵は `+X`（右）。敵は `battleX` が進軍表示下限未満にならない。成功時は **移動硬直 1.5 秒**（攻撃は可能・接近とスキル `move` のみ停止）。実装：`ccEffects.ts` の `KNOCKBACK_MOVE_LOCK_SEC`。

### 2.6 定数（単一正本：`battleConstants.ts` / `types.ts` / `rangeLimits.ts`）

| 定数                                 | 用途                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `CANVAS_W`（1280）                   | 戦闘キャンバス幅（px）。背景描画の全幅 |
| `BATTLE_CANVAS_HEIGHT`（`battleRootLayout` 導出） | 戦闘キャンバス高さ（px）。上部 enemyHud 下端〜下部 partyHud 直上。下端余白は左右余白（24px）と同値 |
| `COMBAT_SAFE_LEFT` / `COMBAT_SAFE_RIGHT` | ユニット配置帯（`combatSafeArea.ts`）。左・右とも画面マージン + 48px gap（左右 HUD 列なし） |
| `COMBAT_SAFE_SCREEN_TOP_Y` / `COMBAT_SAFE_SCREEN_GROUND_Y` | 縦方向の安全領域（battle-root 座標）。上部 enemyHud 下端 / 草ライン（partyHud 直上） |
| `COMBAT_CAMERA_CENTER_X`             | 安全領域中央（レガシー名称。spawn 基準ではない） |
| `ENEMY_SPAWN_ORIGIN_X`               | 敵 `spawnX=0` の battleX（`COMBAT_SAFE_LEFT + COMBAT_SAFE_WIDTH × 2/3`）。敵 deploy 帯の左端（clamp 下限） |
| `PARTY_FORMATION_LEFT_ANCHOR`       | `COMBAT_SAFE_LEFT`（味方隊列左端） |
| `PARTY_FORMATION_SLOT_SPACING`（48） | 味方／敵隊列スロット間隔（広い戦場で奥行きを見せる） |
| `SPAWN_X_MAX`                        | 敵 `spawnX` 上限（`COMBAT_SAFE_RIGHT - ENEMY_SPAWN_ORIGIN_X`）。敵隊形の右端アンカーは `COMBAT_SAFE_RIGHT`（味方左アンカーの鏡像） |
| `BATTLE_FIELD_SPRITE_SCALE`（2）     | 戦闘フィールド描画スケール（32px スプライトを 2 倍表示。`battleX` は 1:1 のまま）                               |
| `PLAYER_VISUAL_MIN_GAP`              | プレイヤー overlap 解消（≈ `SPRITE_WIDTH + bodyClearance`）。射程への加算はしない。敵対 `effectiveRangePx` 下限は `engagedMinBodyGap()`（§2.5） |
| `CONFIGURABLE_RANGE_PX_MAX`          | `traits.rangePx` / `effect.range` の設定上限（`COMBAT_SAFE_RIGHT - PARTY_FORMATION_LEFT_ANCHOR`）                        |
| `MOVE_PX_PER_SEC`（120）             | 1 秒あたりの戦闘移動量（px）。進軍・接敵接近・PartyDeploy・隊形復帰に使用。Victory 退場は `MOVE_PX_PER_SEC × 2` |

`formationRow` は Y 描画・ターゲット用。X 深度の正本は射程順一列（`partyFormation.ts`）。

**同一 `formationRow` 内の X 深度（左＝後方、右＝前方）：**

| 列      | 深度ルール（左 → 右）                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `front` | 近接帯の attacker/defender を最前帯（右）。帯内は `rangePx` 降順 → 同値は `id` 順。それ以外（supporter・前列遠隔など）は後方帯（左） |
| `back`  | ロール順: attacker → supporter → defender → `rangePx` 降順 → `id` 順（従来どおり）                                                   |

前列の supporter は近接最前帯より左（後方）に配置されるが、接敵接近の停止 X は **ChaseTarget ± effectiveRangePx** が正本。前列 sustain 用の個別 depth cap は持たない（`resolveEngagedFormationOverlaps` で X 重なりのみ解消）。

### 2.7 スプライト描画順（重なり）

Canvas 2D の描画順（先に描いた方が下層）で重なりを決める。実装：`src/render/spriteVisualDepth.ts`（`assignVisualDepthOffsets`）→ `BattleCanvas.ts`。

| 優先 | ルール | 意味 |
| ---- | ------ | ---- |
| 1 | **`depthOffsetY` の大きい順に描画** | 画面上で奥（§2.8）のユニットを先に描き、手前が上に重なる（陣営横断） |
| 2 | **同深度のタイブレーク** | `compareSpriteDrawOrder`：`allyRoleBackDepth`（`role` + 解決済み `basicAttackMethod`）、敵は `rangePx` 降順、`factionBackDepth`（`battleX` 奥行き）。敵味方同深度は敵を先に描画（味方が上）。同値は `id` 辞書順 |

近接/遠隔の分類は `traits.rangePx` 帯ではなく、解決済み通常攻撃の `attackMethod`（`CombatantSnapshot.basicAttackMethod`）を使う。距離計算は連続 `rangePx` / `effectiveRangePx` のみ（[classes-and-skills.md](classes-and-skills.md) §射程）。

### 2.8 擬似奥行き（Y オフセット）

同一 `battleX` 付近でスプライトが重ならないよう、**描画のみ** Y をずらす。`battleX`（戦闘正本）は変えない。スケールは変えずドット絵の等倍を維持する。

| 項目         | 内容                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| 足元アンカー | `layout.y` = `groundY`（全員共通）                                                |
| 奥行き       | `depthOffsetY` — `spriteDrawOrder` と同じ並びで陣営内に割当（奥ほど大きい）       |
| 敵の正本     | Wave 内の全敵（倒れた敵含む `snapshot.enemies`）。生存敵の Y は撃破後も変わらない |
| 描画 Y       | `spriteDrawY = layout.y - depthOffsetY`                                           |
| 段幅         | `VISUAL_DEPTH_STEP_PX`（10px × スプライト scale）                                 |
| 上限         | `VISUAL_DEPTH_MAX_STEPS`（編成 4 → 3 段）。敵群れも同上限（空／草境界と一致）   |

実装：`src/render/spriteVisualDepth.ts`（`assignVisualDepthOffsets`）→ `BattleCanvas.ts`、VFX・ポップアップは `spriteDrawY` を参照。§2.7 のタイブレークキーと同一。

**背景（§2.8 続き）：** 地面の論理ライン（足元アンカー）は水平のまま固定。空／地面の**見た目境界**は **ずらし幅最大 + モデル占有** より上へ置く — 草タイル上端 = 空下端 = `groundLineY - maxVisualDepthRisePx(BATTLE_FIELD_SPRITE_SCALE)`（`MAX_VISUAL_DEPTH_OFFSET` + `SPRITE_LAYOUT_SIZE`。scale 1 で 30 + 32 = 62px、フィールド scale 2 では 124px）。ずらし幅最大だけより必ず大きく、奥のユニット足元とスプライト layout 箱が草の上端に乗らないよう余白を確保する。ホライゾンブレンドと DOM 背景勾配（`--battle-ground-line-ratio`）も同 Y。敵群れの `depthOffsetY` は `VISUAL_DEPTH_MAX_STEPS` で上限する。パララックス（`worldOffsetX`）のみ動的。キャンバス上端は `visualDepthTopPadPx(scale)` を追加。

**草タイル縦継ぎ目:** `grass_tile.png` は上部に空〜地平グラデ・下部に濃色帯を含むため、帯全体を無加工で縦タイルすると境界線が現れる。描画は地面色で下塗りしたうえで、繰り返しソースから上空／下濃色を除外し（`grassTileRepeatSource`）、縦方向にも 1px overlap する。

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

- `spawnX` — **`ENEMY_SPAWN_ORIGIN_X` からの右オフセット**。`0 <= spawnX <= SPAWN_X_MAX`（379）。`battleX = ENEMY_SPAWN_ORIGIN_X + spawnX`

### 3.3 プレイヤー隊形（射程順一列）

1. **X 配置正本** — 全生存味方を **射程昇順（ASC）** で並べ、**右＝前（Top）** として割り当てる（短射程ほど右＝敵寄り）
2. **スロット間隔** — 左端 `PARTY_FORMATION_LEFT_ANCHOR`（20px）、以降 `+32px`（昇順ソート後、右端スロットから逆順に割当てるか同等の右 Top 配置）
3. **`formationRow`** — Y 描画・編成分類のみ。**X 初期配置・接敵・ターゲットには使わない**
4. **overlap 解消** — §4.2（接敵時プレイヤー必須）

敵の初期配置は **味方隊形の鏡像**（右端 `COMBAT_SAFE_RIGHT` アンカー・左＝前）。射程 ASC で並べ、最後列を `SPAWN_X_MAX`（=`COMBAT_SAFE_RIGHT`）、前列を左（中央寄り）へ `PARTY_FORMATION_SLOT_SPACING` 間隔で割当てる。`enemyFormation.ts` の `compareEnemyFormationSlot` / `computeEnemyFormationSpawnX` を正とする。

### 3.4 Wave ライフサイクル（Legacy — 現行実装）

> **新仕様の上位ループ**（初期準備 / Wave 間準備 / 作戦結果）は [operation-loop.md](operation-loop.md)。本節は **legacy 自動 Wave 遷移** の 1 Wave 内説明。

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

### 4.1 BattlePhase FSM（Legacy — 現行実装）

> Wave 間準備・作戦結果は BattlePhase に含めない新設計。[operation-loop.md](operation-loop.md) §2・[Wave 作戦と legacy BattlePhase](#wave-作戦と-legacy-battlephase) 参照。

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
`getEnemyContactX` は contact / frontline / clamp / 表示 helper 用で、ロール専用の接近停止正本ではない。

**Target Intent 境界:** 接近・攻撃・移動・表示は対象選択の目的が異なる。

| Intent           | この章での用途                 | 正本                                                                                          |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------- |
| `ChaseTarget`    | 自動接近で追う相手             | [combat.md](combat.md) §敵対単体ターゲット選定（デフォルト敵味方共通） |
| `AttackTarget`   | 射程内停止と実際の攻撃対象     | 敵は `ChaseTarget` の射程内判定。味方は同じ target spec 系の attack プール                     |
| `MoveAnchor`     | スキル `move` の到達基準       | 通常は使用者との `battleX` 距離。敵対 `toAnchor`（正 `anchorOffsetPx`）の distance nearest は**敵前衛＝プレイヤー寄り**（min `battleX`）。`targetRuleOverride`（例: 双刃士 薄命狩り）が enemy scope で効くときは MoveAnchor もその選定に従う。AttackTarget のデフォルト（相手戦線の最前）とは別 |
| `FrontlineOwner` | 現在その戦線を保持している味方 | `resolvePlayerFrontlineOwners`（`combatPosition.ts`）。rear assault アクセス中は含めない      |
| `DisplayAnchor`  | 遠隔敵の表示凍結・VFX 基準     | 描画専用。`engagedDisplayAnchorPlayerId`（`battleDisplay.ts` helper）。戦闘判定へ逆流させない |

| 側                                     | chase（毎 tick 再評価）                                                                                                                       | attack / 停止判定                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 敵                                     | [combat.md](combat.md) §敵対単体ターゲット選定（`resolveEnemyChaseTargetPlayer`）                                                             | `ChaseTarget` が射程内のときのみその 1 体（`resolveEnemyAttackTargetPlayer`） |
| 味方（敵対・全ロール共通）             | 同上デフォルト（相手戦線の最前 defender 優先）または優先ターゲット spec | 同じ spec 系の attack プールで `effectiveRangePx` 内なら停止 |
| 味方（回復 basic 等）                  | [combat.md](combat.md) §回復 PHT（HP 割合最小の負傷味方） | 射程内に PHT がいれば停止 |
| 味方（ally-heal 通常攻撃の supporter） | [combat.md](combat.md) §回復 PHT — PHT 射程外なら PHT 方向へ接近（後方 PHT は左へ後退、前方は前進）。それ以外は最前線 anchor（`resolveAllyHealApproachAnchorX`：接触線内は `getPlayerFrontlineContactX`、前衛の一時越境時は生存味方 max `battleX`）を heal 射程内に入れるまで前進。停止 X は abs 距離の射程バンド（`resolveAllyFrontlineHealApproachBattleX`）。敵接触 cap 非適用 | anchor が heal 射程内なら停止（`shouldSkipEngagedAutoApproach`）。PHT 不在でも可。回復対象は PHT のまま |

敵の chase 候補は敵の前方側にいるプレイヤー（`enemyForwardFacingPool`）。rear assault アクセス中のプレイヤーは敵の新しい `ChaseTarget` や前線所有者にはしない。

**rear assault アクセス状態（runtime）:** 背後滞在の runtime フラグは `CombatantState.accessState === "rearAssault"`（`setPlayerRearAssaultAccess` / `clearPlayerRearAssaultAccess`）。**戦線外判定の正本は `isPlayerRearAssaultAccess` のみ**（`combatPosition.ts`）。

| 呼び出し | 用途 |
| -------- | ---- |
| `isPlayerRearAssaultAccess(player, enemyAnchorX)` | 敵 anchor 基準（`enemyForwardFacingPool` 等） |
| `isPlayerRearAssaultAccess(player, { players, enemies })` | 接敵中の統一判定。`FrontlineOwner` / formation / overlap / march follow / approach clamp |

接敵 context の判定順: (1) `accessState === "rearAssault"` (2) 生存味方 peer 集合の固定点から「最前線 + `PLAYER_OFF_FRONTLINE_PEER_MARGIN_PX`（3px）より前方」を除外 (3) **単独生存時のみ** `battleX > getEnemyContactX` fallback。遠隔だけ残って contact が大きく振れても、peer frontline で戦線外を判定する。

rear assault 中の味方は `applyFormationMarchFollow`・`resolveEngagedFormationOverlaps` の **基準から除外**する（戦線外の単独アクセス）。戦線外ユニットの `baseApproach` は march follow で前進側へ押し出さない。

立てる条件: 味方 actor が敵対 anchor へ `moveMode: "toAnchor"` かつ `anchorOffsetPx > 0` の move を適用したとき（効果形状で判定）。解除: 非 rear の move 適用時、**`shouldClearRearAssaultAccess`（peer frontline 付近へ戻ったとき）**、スキルシーケンス完了時（同条件）、死亡・wave reset。`waitAfterSec` 中も move 完了だけでは解除しない。敵側のプレイヤー背後 move は本 spec のスコープ外。

**背後侵入後の戦闘:** 専用 `engage` 帰還 step に依存しない。シーケンス完了後も **敵接触線（`getEnemyContactX` = 生存敵 min `battleX`＝プレイヤー寄り前衛）より奥にいる間は戦線へ戻らず**、接近目標を `resolvePlayerRearAssaultHoldBattleX`（**いま背後にいる敵**＝`battleX < player` の生存敵のうち最奥 + `rearAssaultHoldOffsetPx`、既定は move の `anchorOffsetPx`。背後敵が居なければ contact フォールバック）で追従する。前衛 contact 固定だと後衛背後から contact 側へ左引きになるため禁止。絶対 `battleX` 固定も敵左進軍でスプライト食い込みになるため禁止。`resolvePlayerRearAssaultAttackRangePx` で接触線までの奥行きを攻撃射程に足し、`resolveFacingSign` で反転向き攻撃・描画する。射程内に入れば `shouldSkipEngagedAutoApproach` で停止し攻撃継続。編成復帰は peer frontline 付近へ戻ったとき（`shouldClearRearAssaultAccess`）または wave reset。

**停止 X：** chase 対象の `battleX` に対し `resolveApproachAttackBattleX`（§2.5 と同じ射程式）。敵は `capEngagedEnemyApproachBattleX` により左（`battleX` 減少）のみ。味方 defender 専用の contact 停止 resolver は持たない。

**自動接近スキップ：** `shouldSkipEngagedAutoApproach` — attack プールに 1 体でもいれば接近しない（射程内で攻撃待機）。`test_ranged` も通常の attack プールとして扱う。

**stance / self basic の接近写像：** CombatModule の通常行動 effect が `target: self`（鉄衛士・護法士の stance 間隔など）でも、自動接近の ChaseTarget / AttackTarget は `resolveApproachTargetSpec` により **敵対 `distance/enemy/nearest`** へ写像する。self のまま攻撃プールに自分だけ入ると射程外でも接近スキップし前線へ出ない。ally-heal / ally-barrier の専用経路は本写像の対象外。

**pierce 敵向け通常攻撃の接近停止（`isPierceEnemyBasicAttack`）：** `selfOrigin` + `pierce` の敵向け通常攻撃は、接近停止の正本が「射程内に敵 1 体」ではない。停止目標 `battleX` = `getEnemyContactX() − effectiveRangePx`（`resolvePierceApproachStopBattleX` / `capOnFieldBeforeEnemyContact` と同式）。pierce basic 持ちユニットはこの停止 X に到達するまで接近を継続する。`battleX >= pierceStopX − settleEpsilon` で接近停止。過前進時は `shouldSkip` を false のまま双方向補間で `pierceStopX` へ戻す。接近目標 X も chase 個体ではなく contact 基準（`resolvePlayerChaseApproachBattleX`）。停止は contact 基準。

貫通形状・ターゲット仕様は [combat.md](combat.md) の `pierce` / `selfOrigin` 節を参照。

**味方の共有 clamp / formation レイヤ：**

- 戦線 on-field ユニット（rear assault 除外）：生存敵 contact より右へ過進軍しない（`capOnFieldBeforeEnemyContact`）。`formationRow` は使わない
- Engaged 接近目標の X 深度積み上げ（`applyPartyFormationApproachSpacing` 等）は持たない。各ユニットの approach target は **ChaseTarget ± effectiveRangePx** が正本。同 X 重なりは `resolveEngagedFormationOverlaps` のみで解消
- rear assault 中の味方は `applyFormationMarchFollow` の leader / follower から除外。`baseApproach` は背後位置を他ユニットの march follow 基準にしない

**敵の追い替え：** 毎 tick [combat.md](combat.md) §敵対単体ターゲット選定（デフォルトまたは優先ターゲット / 闘技場の掟）で再選定。ヒステリシスや `threatFocusTargetId` は使わない。射程内に入ったら attack プールで停止・攻撃。

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
| `battleFieldBackground.ts`                 | 空・草タイル描画（空／地面境界 = ずらし最大 + モデル占有）                              |

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
| L10        | overlap は `resolveOverlaps` のみ。`engagedMinBodyGap()` を射程へ**加算**しない。敵対 `effectiveRangePx` の**下限**には使う（§2.5）    |

**廃止：** L1（毎 tick layout tick）、L3（visual 双方向補間を approach 正本へ統合）、接敵 layout 収束タイマー（`engagedEnemyLayoutTargets`）、`engageStandoff.ts` 等の未使用 helper。

**overlap 解消は維持。** 捨てるのは二重パイプライン・毎 tick layout 再計算・layout 収束と approach の競合。

### 6.4 背後移動スコープ

| 対象                                           | 含む       |
| ---------------------------------------------- | ---------- |
| 敵のプレイヤー背後移動                         | **いいえ** |
| プレイヤー `move`（`toAnchor` 正オフセット等） | **はい**   |

---

## 7. 戦闘中統計 UI（戦闘詳細）

戦闘画面の **戦闘詳細**（`PartyHudPanel` 詳細モード）の Phase 4d 仕様。与ダメ / 被ダメ / 詳細バッジの sync は `PartyMemberStatsDisplay.ts` の関数を流用。ダメージ集計は [combat.md](combat.md)。DOM UI の共通デザイン言語は [ui-visual-rules.md](ui-visual-rules.md) を参照（Phase 4d で編成 UI と揃える）。

**新方針との関係：** 戦闘画面全体の次期レイアウト正本は §8。§7 は既存 Party HUD / 統計 UI の履歴と流用元として扱う。§7 内の「キャンバス幅に揃える」「未解放セルを消す」「状態 0 件で高さ 0」「BattleStatsDrawer を Party HUD 直下の本体表示として扱う」など、§8 の固定 HUD 方針と矛盾する項目は次期戦闘画面 UI では §8 を優先する。

**ヘイト廃止に伴う UI:** 詳細行の Threat バーは削除する（与ダメ / 被ダメバーのみ）。実装移行はヘイト廃止タスクに含める。

### 7.1 役割とデータ

| 要素 | 内容 |
| ---- | ---- |
| 起動 | **詳細モードは常時表示**（§8 固定 HUD）。旧 `.party-hud-drawer-tab` は廃止 |
| 配置 | `battle-canvas-frame` 内 — **上:** キャンバスオーバーレイ HUD（`.battle-canvas-hud`：左上ステージ名・中央上 Wave・右上 VERIFY バッジ）、`.battle-hud-stack`（パーティ帯 + Party HUD）。キャンバス幅（最大 480px）に揃える |
| キャンバス HUD | 戦闘キャンバス **内**オーバーレイ。**左:** ステージ表示名。**中央:** `Wave {n}/{total}`。**右上:** 確認モード切替バッジ — ON 時 `VERIFY`（琥珀）、OFF 時 `DEBUG`（控えめ）。クリックでトグル。独立した画面上部ヘッダー帯は **使わない** |
| パーティ帯 | Party HUD **直上**の帯。**左:** `プレイヤー Lv {n}` のみ（`resolvePlayerDisplayLevel`）。**右:** `.battle-party-menu-button`（テキスト「編成」のみ）→ `MetaMenuOverlay`（`initialView: "party"`）。**アイコンフォントは使わない** |
| 表示切替 | **詳細**（**起動時デフォルト**）= メンバー縦リスト（同一 `.party-hud-panel` 枠）。**コンパクト** = 横 4 列（HP・リキャスト・簡易バッジ）。下のタブで排他切替。別パネルの積み増しはしない |
| メンバー行（詳細） | **射程の短い順**（同射程は `partySlotIndex` 昇順）。空きスロットは末尾。`.party-hud-panel-slots` が **3 列トラック**（class **固定**（24px アイコン + 4px + **8ch** 名前幅。英語 `Swordsman` 基準、`--hud-header-font-size` 基準。§7.1.3）／bars **min 168px・`max(168px, 210px − class 拡張分)`・`1fr`**／damage 120px）の親グリッド、**`width: 100%`**。各 `.party-hud-slot` → `.party-hud-unit` は **`subgrid`** で同一トラックを共有し **bar 列開始 X は全ユニットで揃える**。class 列を広げた分は bars 最小幅から差し引く（合計幅不変）。**上段:** `"class bars damage"` × 2 行 — bars = HP + リキャスト 2×2。**下段 `status`:** 同一 3 列 `subgrid` — DEBUFF/BUFF ラベルは class 列、アイコン列は bars+damage 列。アイコン列は canvas 透過余白 + ゲージ外枠分を `margin-left` で左補正。**与列:** 非ヒーラー = 与ダメ（ATK タグ）、**ヒーラー（`role: supporter`）= 与回復量**（HoT タグ・短ラベル **癒**）。**被列:** 全員被ダメ。damage 列内は tag / 数値 / ゲージの固定幅グリッド。inline 数値は 4 桁以上を `1.2k` / `12k` のように短縮表示し、内部データ・非表示ラベル・アクセシビリティ用ラベルはステージ内累計値を保持する。**Exp・メンバー別 Lv は表示しない**（クラス表示名は 1 行・`readClassDisplayLabel`） |
| 与回復バー | ヒーラー同士で相対比較（与ダメと同型）。**ヒーラー 1 人のみ**のとき与列バーは **常に 100%**。集計は `StageDamageStatsTracker.recordHeal` — 実 HP 回復量（instant / HoT tick / heal 予約 / バリア枯渇 heal 等） |
| 状態バッジ帯 | debuff / buff でラベル行を分ける（例: Debuff / Buff）。`status` 行は unit と同じ 3 列 `subgrid` — ラベルは class 列、アイコンは bars+damage 列。**空行もラベルは維持**（低コントラスト）。**アイコン 0 件のときアイコン列は非表示・高さ 0**。詳細 HUD のバッジ canvas 行高 **22px**（内部 24px 描画の下透明 2px のみクロップ。buff/debuff 共通）。buff アイコン列下・debuff アイコン列上の行間はそれぞれ `--hud-detail-buff-icons-bottom-pull` / `--hud-detail-debuff-icons-top-pull`（各 3px）で CSS 負 margin。Debuff ラベル上 margin は buff アイコンあり時 0。行間 1px。**簡易 3+N 省略なし**（[combat.md](combat.md) HUD バッジ §簡易/詳細） |
| 更新 | 詳細モード中は `PartyHudPanel.updateDetailMetrics` で与ダメ / 与回復 / 被ダメ / 全バッジを refresh。HP / リキャストはコンパクトと同経路 |
| HP / リキャスト枠 | コンパクト・詳細とも **`.party-hud-bars` 全体の高さ**（`--hud-body-bar-h`）は最大 4 スロット（2×2）時で固定。解放 2 スロット時は `--hud-recast-slot-rows: 1` に下げ、リキャスト領域を 1 行分だけ低くし、差分は **HP バー高さ**（`flex: 1`）が吸収する。3〜4 スロット時は 2 行。未解放セルは `party-hud-recast-cell--locked`（`display: none`） |
| データ源 | `getStageDamageDisplayRows`（ステージ内累計与ダメ / **与回復（ヒーラーのみ）** / 被ダメ）、`CombatantSnapshot`（`statusEffects`）。**Exp / `partyProgress` は統計 UI スコープ外** |
| 確認モード | 現行は verify 経路でダメージ行が供給される。本番 Stage Records は **Phase 12** |

#### 7.1.1 戦闘中ステータス（Party HUD クリック）

| 要素 | 内容 |
| ---- | ---- |
| 起動 | **overlay（戦闘画面）:** `.party-hud-header-row`（アイコン・クラス名・HP バーを含む識別行）へ **マウスオーバー**。**lane 詳細:** `.party-hud-icon-wrap` / `.party-hud-bars` へマウスオーバー。パネル上にカーソルがあれば表示維持。離れたら非表示 |
| 配置 | マウスカーソル付近（右下 12px オフセット）。**画面右寄り**では左側へ展開し、**画面左寄り**（味方 HUD は `row-reverse` のため視覚左端＝後衛）では右側へ展開する。DOM の slot index は使わない。Canvas 外へはみ出さない（`clampElementToMountBounds`）。lane 詳細で pointer 未供給時のみ識別行直上にフォールバック |
| 対象 | **選択中スロット 1 人のみ** |
| 表示項目 | **HP**（`現在HP / 実効MaxHP`）、**攻撃力 / 防御力 / 魔法耐性**、最終行に **攻撃間隔**（CombatModule 兵科）または **攻撃速度**（legacy 兵科）。**射程・基本攻撃は表示しない** |
| 攻撃間隔（R9.5b） | CombatModule 通常行動が解決された兵科は **秒単位**の「攻撃間隔」を表示（例 `攻撃間隔: 2秒` / `1.5秒`）。値の正本は runtime で解決された CombatModule の `attackIntervalSec`（選択中 module の上書きを優先）。整数秒は小数桁を省略、`1.25` 等は小数第 2 位まで保持。`NaN秒` / `0秒` などの不正表記は出さない。legacy `attackSpeedTier` は新表示の正本にしない。buff/debuff による実効間隔のリアルタイム反映はしない（基礎値表示） |
| 攻撃速度（legacy） | CombatModule 未解決兵科は移行期間中、従来の 5 段階 tier ラベル（`attackSpeedTier`）を維持する。正規化済み秒単位値がないため tier からの新規換算は行わない |
| 補正列 | 各ステの右に `(+N)` / `(-N)`（RES は `(+N%)`）。SPD（legacy）buff/debuff は **`(×倍率)`**（例: `(×1.25)`）。攻撃間隔行は補正列を出さない。差分 0 は空 |
| 色 | 上昇（buff）= やや青（`#8eb8e8`）、低下（debuff）= やや赤（`#e89595`）。中央の実効値は通常色 |
| データ | `CombatantSnapshot`（`baseMaxHp` + `statusEffects` + ベース atk/def/res + 解決済み `basicSkillId`）とクラス `attackSpeedTier`、`combatModuleRegistry[basicSkillId]?.attackIntervalSec`。実効計算は [combat.md](combat.md) の `getEffective*` / `aggregateStatEffects` と同一 |
| 更新 | パネル表示中は `BattleView.tick` 毎に refresh |

#### 7.1.2 状態バッジクリック（用語パネル）

| 要素 | 内容 |
| ---- | ---- |
| 起動 | Party HUD（コンパクト / 詳細）の **状態バッジ**（`.party-hud-status-badge-hit--interactive`）を **クリック**。辞書 `statusCategory` 対応エントリに **`description` があるときのみ** |
| パネル | 編成 UI と同じ **`GameTermPanel`**（`BattleView` が `canvasFrame` に 1 インスタンス）。見出し・本文・パネル内用語リンク・戻るは [party-formation-ui.md §6.4](party-formation-ui.md#64-インライン用語パネル) に準拠 |
| クリック不可 | `description` 省略の HUD 表示名のみ（例: stat 系 `hp` / `atk`）は **ホバーで表示名 tooltip のみ**（クリックで用語パネルは開かない） |
| ホバー | **`description` なし**（表示名のみ）— 表示名 tooltip（`resolveStatusBadgeTooltipLabel`）。**`description` あり** はホバー tooltip を出さず **クリックで用語パネル** のみ |
| tooltip 配置 | `PartyHudFloatingTooltip` / `PartyMemberEffectiveStatsPanel` は `battle-canvas-host` 内 **最前面レイヤー**（`.battle-layer--tooltip`、z-index 6）にマウント。表示時はレイヤー末尾へ移動。**1280×720 Canvas 外へはみ出さない**（`clampElementToMountBounds`） |
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

[ui-visual-rules.md](ui-visual-rules.md) に準拠。統計 UI 固有の目標:

| 現行（避ける） | 目標 |
| -------------- | ---- |
| 中央モーダル + 強 backdrop + 大角丸 + 強 box-shadow | **HUD 直下の同一枠** — コンパクト / 詳細を排他切替。枠は控えめ |
| ダッシュボード風 title bar（角丸 `×` ボタン等） | 閉じる操作は **設けない**（§8 固定 HUD）。装飾より可読性 |
| メンバー行の角丸グラデーション棒のみの区切り | **コンパクトと同じ控えめなメンバー枠**（`party-hud-slot`・inset 枠線 + 角丸 3px）で縦に並べる。枠間は `gap: 5px` |
| カードグリッド風の横並びダッシュボード | 詳細は **縦リスト**（各 `.party-hud-unit` = `grid-template-areas` による 3 列プレート + 全幅 status 行） |

**スコープ:** 表示項目・集計ロジックは変更しない（見た目のみ）。バー色の意味（与ダメ・被ダメ・down 時の減衰）は維持してよい。

### 7.3 受け入れ条件（Phase 4d — 統計部分）

1. 戦闘詳細が Web モーダル / ダッシュボード風に見えない（[ui-visual-rules.md](ui-visual-rules.md) 準拠）。Party HUD **同一枠**でコンパクト / 詳細を切替する
2. 詳細モードで 4 人分の名前・与ダメ / 被ダメ・**全状態バッジ（debuff/buff ラベル付き）**・**HP / リキャスト**が **縦リスト**で読める。コンパクトモードのホバー（§7.1.1）も維持
3. `party-member-stats.css` のダメージ / 詳細バッジスタイルが Party HUD 詳細行に反映される
4. 詳細モードが Party HUD 固定枠内で常時表示される（§8 準拠）

---

## 8. 戦闘画面 UI（1280×720 HUD）

**フォント:** [ui-fonts.md](ui-fonts.md)（`--font-body`）。Canvas HUD テーマは `--popup-font-family`（ポップアップ）、`--overlay-font-family`（Wave / Victory / Defeat）。

### 8.1 目的と正本

Hensei-Only は「編成だけ」で問題を解く、編成解法型オートバトル RPG。戦闘中の操作は基本なく、戦闘画面は操作画面ではなく **編成結果を観察する画面** として扱う。UI 自体がゲーム体験の中心であり、次期戦闘画面は Web アプリ的な可変レイアウトではなく、**ゲーム内 HUD / 戦術盤 / 観戦画面** に見えることを目標にする。

本節は、戦闘画面の表示構造・HUD 配置・情報整理の正本。座標・接敵・描画パイプラインは §1〜§6、ダメージ / CD / 状態効果の戦闘ルールは [combat.md](combat.md)、編成画面は [party-formation-ui.md](party-formation-ui.md) を参照する。

### 8.2 基準解像度とスケール

| 項目 | 方針 |
| ---- | ---- |
| 基準解像度 | **1280×720** |
| 基準アスペクト比 | **16:9** |
| 配置単位 | 1280×720 内の **絶対 px 座標** |
| 他解像度 | UI 全体を等比スケール |
| 禁止 | 要素ごとのレスポンシブ再配置、可変伸縮、UI 本体の歪んだ引き伸ばし |
| 16:9 以外 | 戦闘 UI 本体は 16:9 安全領域内に維持。余剰領域は背景拡張、レターボックス、ピラーボックスで処理 |

スケール計算:

```text
BASE_WIDTH = 1280
BASE_HEIGHT = 720

scale = min(
  viewportWidth / BASE_WIDTH,
  viewportHeight / BASE_HEIGHT
)
```

実装（`battleRootScale.ts`）では **12 / 20 / 24px HUD アイコンが CSS 整数ピクセルに乗るよう `1/4` 刻みへ切り下げ** してから `--battle-scale` に入れる。`.battle-root` は `transform: scale()` ではなく **`zoom: var(--battle-scale)`** で拡縮する（`transform: scale()` は DOM の `image-rendering: pixelated` を無効化しやすい）。

ピクセルアート表示を前提に、拡大時は nearest-neighbor / pixelated 表示を維持する。**DOM のクラス/スキル/状態アイコンは `pixel-icon-frame.css` を正本**とし、`image-rendering: pixelated` + `crisp-edges` と `object-fit: none`（等倍ネイティブ）を必須とする。

```text
ctx.imageSmoothingEnabled = false
```

CSS では Canvas / 画像に `image-rendering: pixelated` と `image-rendering: crisp-edges` を反映する。`<img>` ピクセルアイコンは `object-fit: none; object-position: 0 0` とする（`fill` / `contain` による補間を禁止）。

### 8.3 基本構造

戦闘画面は CSS Grid 的な三カラム分割ではなく、**全幅の戦闘背景の上に上部敵 HUD・下部味方 HUD をオーバーレイする構造** とする。

```text
┌──────────────────────────────────────────────┐
│ Stage / Wave（topInfo）                        │
│ 敵1  敵2  敵3  敵4  …（enemyHud 横並び）         │
│ ─────────────────────────────────────────── │
│              戦闘レーン（全幅）                  │
│              地面                              │
│ ─────────────────────────────────────────── │
│ 味方1      味方2      味方3      味方4（partyHud）│
└──────────────────────────────────────────────┘
```

| 領域 | 方針 |
| ---- | ---- |
| 背景 / 戦闘空間 | 画面全幅に敷く。HUD の矩形に背景を制限しない |
| 味方 HUD | 画面下部オーバーレイ。編成結果を読む詳細監視用 HUD（横 4 枚） |
| 敵 HUD | 画面上部オーバーレイ（topInfo 直下）。残敵・HP・状態・脅威を読む状況確認用 HUD（生存敵を横並び） |
| 戦闘レーン | top enemyHud 下端〜 bottom partyHud 上端。背景そのものではなく、視線上の主戦場 |
| HUD 表現 | 戦場を分断するカラムではなく、戦場上に浮く監視パネル。半透明、薄い枠、背景となじむ面でゲーム HUD らしく扱う |

**やらない:** Web ツール的な三分割レイアウト、各カラムの可変幅、HUD によって戦場背景を分断する見せ方。

#### 8.3.1 `BattleCanvas` 大型化（中央主役）

1280×720 `battle-root` に **全幅・高さ一杯** の `BattleCanvas` を敷き、上部敵 HUD / 下部味方 HUD はその上に浮かせる。内部基準 `CANVAS_W`（1280px）× `BATTLE_CANVAS_HEIGHT`（`battleRootLayout.ts` 導出）・描画スケール `BATTLE_FIELD_SPRITE_SCALE`（2）で 32px スプライトを観察しやすいサイズにする。

**戦闘空間の使い方:** 背景・Canvas は 1280px 全幅。ユニット配置・接敵・spawn は `combatSafeArea.ts` の `COMBAT_SAFE_LEFT`〜`COMBAT_SAFE_RIGHT`（左・右とも画面マージン + 48px gap。右 HUD 列は Phase 2 以降なし）を正本とする。HUD 幾何の正本は `battleHudGeometry.ts`（`battleRootLayout` と同期）。`PARTY_FORMATION_LEFT_ANCHOR = COMBAT_SAFE_LEFT`。敵 `enemyGroups` 隊形は右端 `COMBAT_SAFE_RIGHT` アンカー（味方の鏡像）。`ENEMY_SPAWN_ORIGIN_X` は spawn 帯の左端（`COMBAT_SAFE_LEFT + COMBAT_SAFE_WIDTH × 2/3`）。`SPAWN_X_MAX = COMBAT_SAFE_RIGHT - ENEMY_SPAWN_ORIGIN_X`。PartyDeploy 左外開始距離は `resolvePartyDeployMarchDistancePx`（最前列 target が画面外左に収まるまで延長。移動速度は `MOVE_PX_PER_SEC` のまま）。

**距離・分類:** 停止位置・移動量は連続 `rangePx` / `effectiveRangePx` のみ。近接/遠隔の分類は `attackMethod`（[classes-and-skills.md](classes-and-skills.md) §射程）。

**Canvas 外枠:** `battle-canvas` に枠線・下部帯を付けない。編成ボタン・Debug トグルは暫定 / 開発用として `battle-transient-controls-dock`（味方 HUD **右上**・カード列の外、`battleRootLayout.ts` の `BATTLE_TRANSIENT_CONTROLS_TOP`）。Party / Enemy HUD・中央戦場とは混ぜない。プレイヤー Lv 表示は戦闘 HUD から外す。

**変更しないもの（戦闘ルール）:**

- `battleX` と射程・移動速度の意味（1 battle 単位 ≒ 1 px）
- ダメージ / スキル / ターゲット選定 / CD / AI

**変更するもの（描画・レイアウト）:**

- `CANVAS_W`、キャンバス高さ（空・草帯余白）、`BATTLE_FIELD_SPRITE_SCALE`
- `battleLane` 寸法（`battleRootLayout.ts` が `CANVAS_W` と `battleCanvasHeight` から導出）
- 背景・エフェクト・ダメージポップ・`targetIndicator` / `hoverHighlight` の描画位置（スケール追従）

### 8.4 レイヤー構造

Canvas / DOM の実装方法に関わらず、見た目上の積層は次を正本にする。

| Layer | 内容 |
| ----- | ---- |
| 0 | 背景 |
| 1 | 戦闘キャラ・エフェクト |
| 2 | ダメージポップ / Block / 回避 / 反撃など |
| 3 | 左右 HUD |
| 4 | 上部 Stage / Wave / Verify |
| 5 | デバッグ UI |

デバッグ UI は本体 HUD を押し下げない。折りたたみ式ドロワー、開発用オーバーレイ、別パネルなどとして扱い、本番 HUD の 1280×720 レイアウトを変形させない。

### 8.5 初期レイアウト寸法

初期実装は次の座標系で開始し、見た目確認後に微調整する。これは最終値ではない。

```yaml
screen:
  width: 1280
  height: 720

topInfo:
  x: 24
  y: 30
  w: 1232
  h: 52   # stage plate（Stage + Wave）を収める（40 だと enemyHud に溢れ）

enemyHud:
  x: 24
  y: 92   # topInfo 直下 + ENEMY_HUD_GAP_BELOW_TOP_INFO（10px）
  w: 1232
  h: 72   # ENEMY_HUD_SLOT_BAND_HEIGHT（固定帯）

partyHud:
  x: 24
  y: 554
  w: 1232
  h: 142
  bottomMargin: 24   # BATTLE_PARTY_HUD_BOTTOM_MARGIN (= side margin)

battleLane:
  x: 0
  y: 164  # BATTLE_LANE_TOP（enemyHud 下端）
  w: 1280 # CANVAS_W（全幅フィールド）
  h: 390  # BATTLE_CANVAS_HEIGHT（下部 partyHud 直上まで）

groundLine:
  screenY: 530 # BATTLE_GROUND_LINE_SCREEN_Y（partyHud 直上の草ライン）
```

この寸法は三カラム分割ではなく、1280×720 基準座標上のオーバーレイ配置。背景は `battleLane` に限定せず、画面全幅に敷く。`battleLane` は中央の読み取り領域であり、戦闘背景そのものの境界ではない。

**左右 HUD 幅:** 味方 HUD は画面下部全幅（`PARTY_HUD_SLOT_RECT.w` = topInfo と同幅 1232px）。敵 HUD も同幅の上部帯（Phase 2 Task 1）。`BATTLE_SIDE_HUD_WIDTH` は battle-x-debug 等の旧サイド列幅にのみ使用。

### 8.6 HUD 固定スロット方針

戦闘 HUD は、戦闘中に内容量でユニットカードや敵スロットの高さを変えない。プレイヤーが視線位置で情報を追えるよう、Web UI 的な可変高さではなく、ゲーム HUD として固定スロットで扱う。

| 要素 | 方針 |
| ---- | ---- |
| HP バー | 固定枠。内容量で高さを変えない |
| スキルゲージ | 固定枠。習得数で高さ・配置を変えない |
| 状態アイコン欄 | 固定枠。状態がない場合も占有領域を維持 |
| 危険予兆バー欄 | 固定枠。予兆がない場合も占有領域を維持 |
| 与ダメ / 被ダメ欄 | 固定枠。数値量でカード高さを変えない |
| 敵スロット（1 体分） | 敵数や状態数で **スロット内部** の高さを変えない |
| 敵 HUD パネル | 上部帯の高さは固定（`ENEMY_HUD_SLOT_BAND_HEIGHT`）。生存敵は横並び。Wave 内生存敵 0 で帯を閉じる |

### 8.7 味方 HUD

味方 HUD は **画面下部** に固定し、4 人固定パーティを **横 4 枚** で表示する。既存の allyCard 内部構造（識別行・状態欄・味方スキルゲージ 2×2・与被ダメ）は流用する。各ユニットカードは固定高さとし、内容量でカード高さを変えない。**スロット枠**は gap 0 で横に接続し、**内容列幅**は状態アイコングリッド（`computePartyHudOverlayStatusColumnWidth`）に揃える。スロットの **適用 padding** は nominal `pad-x` × `PARTY_HUD_OVERLAY_CARD_PAD_SCALE`（**0.3**）。nominal `pad-x` は内容列をスロット中央に置くときの左右余白目安。**partyHud 全体**（`.battle-hud-slot--party`）の battle-root 下余白は `BATTLE_PARTY_HUD_BOTTOM_MARGIN`（**24px**、左右 `BATTLE_HUD_SIDE_MARGIN` と同値）。

**並び順:** **右を先頭**に **射程昇順**（`traits.rangePx` 昇順）。同射程は `partySlotIndex` 昇順。空き編成スロットは左端（先頭の反対側）。`partySlotIndex` は与ダメ統計・ホバー詳細のキーであり、visual 列番号の正本ではない（§1 `partySlotIndex` とスロットの違い）。

初期寸法目安:

```yaml
partyHud:
  x: 24
  y: 554
  w: 1232
  h: 142

allyCard:
  count: 4
  layout: row
  slotWidth: 308   # 1232 / 4 — slots abut (gap 0)
  contentWidth: 250   # status icon grid + wrap padding (computePartyHudOverlayStatusColumnWidth)
  padX: 29            # nominal per-side inset — centers content in slot
  padScale: 0.3         # applied padding = padX * padScale (~8.7px)
  height: 142           # content blocks + 2 * applied pad (computePartyHudSlotHeight)
  gap: 0

total:
  4 * 308 = 1232
```

味方 1 人カード（`allyCard`）の縦 4 段構造:

```text
allyCard
┌────────────────────────────┐
│ [icon] className   HP bar   │  ← 1. キャラ識別 + 生存状況
│ [state icons ............]  │  ← 2. 状態
│ [active_1] [active_2]      │  ← 3. スキルゲージ
│ [active_3] [active_4]      │
│ dmg dealt / dmg taken      │  ← 4. 補助統計（横並び 2 列）
└────────────────────────────┘
```

表示要素:

- クラスアイコン
- クラス名
- HP バー
- スキルゲージ最大 4 枠
- 状態アイコン欄 2 行
- 与ダメ / 被ダメ要約

#### 8.7.1 味方スキルゲージ

> **R9.5b（CombatModule 兵科の legacy active ゲージ非表示）:** 通常行動が CombatModule で解決された兵科（runtime 停止判定 = `isCombatModuleBasicSkillId(basicSkillId)`、[combat.md](combat.md) R9.5a と同一）では、本節の legacy active 2×2 ゲージ領域自体を **非表示**にする（空の 2×2 枠も出さない）。判定は HUD 独自 classId 配列ではなく、runtime 解決済み `basicSkillId`（`CombatantSnapshot.basicSkillId` → `PartyHudEntry.hasCombatModuleBasic`）を使い、HUD と runtime を一致させる。legacy 兵科（CombatModule 未解決）は移行完了まで本節の 2×2 ゲージを従来どおり維持する。**混在パーティ**では兵科ごとに表示形式が異なる。legacy 枠を消した後は既存 HUD 要素を自然に再配置するだけで、戦闘 HUD 本体には**攻撃間隔を常時表示しない**（攻撃間隔は §7.1.1 の戦闘中ステータスで確認）。次行動ゲージ・残り時間・通常行動アイコンも追加しない。

以下は legacy 兵科（CombatModule 未解決）向けの仕様。味方スキルゲージは最大 4 枠を常に表示し、2×2 の田の字配置にする。

```text
active_1  active_2
active_3  active_4
```

| 項目 | 方針 |
| ---- | ---- |
| 枠数 | 最大 4 スキル枠を常時表示 |
| 行高（オーバーレイ） | 基準 11px 行 ×2 + 1px 行間を `--party-hud-overlay-recast-scale`（**0.9**）で縮小。習得数では変えない |
| ラベル | 常時ラベルは表示しない。配置位置で `active_1`〜`active_4` を表す |
| Lv0 | `active_1` / `active_2` のみ有効表示。`active_3` / `active_4` は非アクティブ枠 |
| Lv10 | `active_3` を有効表示。`active_4` は非アクティブ枠 |
| Lv20 | 4 枠すべて有効表示 |
| 未習得枠 | 薄い空ゲージ、暗い溝、低 opacity など。ロックアイコンなどの強い記号は原則使わない |
| 詳細 | スキルゲージ hover では **文字 tooltip・HUD 情報プレート・戦闘中ステータスパネルを出さない**（ゲージ表示のみで観察）。スキル名・残り時間・効果説明は編成 UI 等で確認 |

レベルや習得数によってスキルゲージ欄の高さや配置を変えない。敵 HUD には通常スキルリキャストバーを表示しないため、本仕様は味方 HUD 専用。

#### 8.7.2 味方状態アイコン欄

味方 HUD の状態アイコン欄は、BUFF / DEBUFF の文字ラベル行を廃止し、2 行固定のアイコンスロットとして扱う。

| 項目 | 方針 |
| ---- | ---- |
| 行数 | 2 行固定 |
| 表示数 | 1 行あたり最大 10 個程度、合計 20 枠程度 |
| buff / debuff 区別 | アイコン背景、枠、色、向きなどで示す。文字ラベルには依存しない |
| 状態なし | 状態欄の高さを維持。空スロットは薄く表示するか、透明に近い占有領域として扱う |
| 同種状態 | スタック数で圧縮 |
| 超過 | `+N` 表示または詳細表示へ逃がす |

状態アイコンは、編成結果やスキルの目論見が成功しているかを見るための観測装置。状態が多いクラスや高レベル時でも、状態確認が破綻しないようにする。

### 8.8 敵 HUD

敵 HUD は **画面上部**（topInfo 直下）に配置し、最大 10 group 程度の敵を **生存中のみ** 横並びで索引表示する。**全体を包む外枠パネルは表示しない**（各 group はカード束のみ）。group コンテナ footprint は固定（152×68px、帯 72px 内）。帯領域（`ENEMY_HUD_SLOT_BAND_HEIGHT`）はレイアウト予約のみで、パネル背景・枠線は描画しない。Wave 開始時はスロット列を展開、Wave 内の生存敵が 0 になったら閉じる。撃破した敵スロットはグレーアウトせず HUD から除去し、残存スロットを左方向へ詰める（表示リストのみ。戦闘ロジック上の enemy entity には影響しない）。**同一 Wave 内**の group 並び替え時は FLIP スライド（`enemyHudGroupSlide.ts`、260ms）で横移動する。敵が多い場合は暫定的に `flex-wrap` 折り返しで対応する（横スクロールは使わない）。

**Phase 3 — 表示専用 groupBy:** 同種敵は HUD 表示用の `enemyGroup` にまとめる。group key は `enemyTypeId ?? classId`（未指定時は snapshot の `classId`、敵は template id）。`enemyGroup` は **HUD 専用** — 戦闘ロジック・ターゲット選定・勝敗判定では enemy entity 単位のまま。各 group は `groupId`、代表アイコン / 名前、`count`、グループ内 alive `enemies[]`、`representativeEnemy`、集約 `dangerState` / `importantStates` を持つ。撃破で `count` が減り、0 体の group は非表示。group hover 時はグループ内全敵を `hoverHighlight`。**hover ではカード束を展開しない**（click 展開は §8.11.2。Pause 基盤は §8.11.1）。

**Phase 3 Task 2 — カード束表示:** 各 `enemyGroup` は上部 HUD で **同一 `enemyCard` 要素**を `stackOffset`（8px）でずらして重ねる（HP 専用レーンは使わない）。先頭カードは icon / 名前 / `×N` / 集約状態 / 危険予兆枠 + HP。背面カードは同一 DOM・同一カード枠（背景・枠線は維持）だが CSS で情報欄を隠し HP 行（と状態ミニ）を下端に露出。重ねた各 HP バーは **同じ幅**で、各カード内の同一 inset（icon 列右）に absolute 配置する（カードの `stackOffset` X 分だけ HP も右へずれる）。**背面の状態ミニ行は HP バーを押し上げない**（HP 行は常にカード下端 5px、ミニ行はその直上）。HP 行はカード下端に固定し、重ねると各体の HP バーが下方向に露出してすべて読める。`maxVisibleStack` = 3、超過は `+N`。icon は `pixel-icon-frame--24` 等倍（24×24）。寸法: card 136×48、group footprint 152×64。

初期寸法目安:

```yaml
enemyHud:
  x: 24
  y: 92          # topInfo 下端 + ENEMY_HUD_GAP_BELOW_TOP_INFO（10px）
  w: 1232
  h: 72          # 固定帯（ENEMY_HUD_SLOT_BAND_HEIGHT）

enemySlot:
  count: up to 10   # 同時表示は生存敵 group 数（1 group = 同種複数体のカード束）
  layout: row       # 横並び（overlay-top）
  groupFootprint:   # 最大 visible stack 時の group コンテナ
    w: 152          # ENEMY_HUD_SLOT_WIDTH
    h: 68           # ENEMY_HUD_SLOT_HEIGHT（帯 72px 内）
  enemyCard:
    w: 136          # ENEMY_HUD_CARD_WIDTH
    h: 52           # ENEMY_HUD_CARD_HEIGHT — HP row pinned to bottom
  statusRowH: 18    # ENEMY_HUD_STATUS_ROW_HEIGHT
  stackOffset: { x: 8, y: 8 }
  maxVisibleStack: 3
  gap: 4

panelHeight:
  formula: ENEMY_HUD_SLOT_BAND_HEIGHT when alive > 0, else 0
  collapse: wave 内生存敵 0 で高さ 0 へ
  expand: wave 開始で帯を展開
```

各敵スロットに表示するもの:

- クラスアイコン
- 敵名またはクラス名
- HP バー
- 状態アイコン
- 危険予兆バー予約枠

敵 HUD には通常スキルリキャストバーを表示しない。敵は最大 10 体表示するため、通常リキャストバーまで表示すると情報過多になる。現時点では敵も味方と同じスキルを使うため、敵通常スキル CD を常時可視化する必要は低い。敵専用の危険行動は、通常リキャストではなく危険予兆バーで扱う。

#### 8.8.1 敵状態アイコン

敵 HUD の状態アイコンは、味方と同じアイコン体系を使う。

| 項目 | 方針 |
| ---- | ---- |
| 体系 | 状態アイコンの意味、buff / debuff の背景表現は味方 / 敵で可能な限り共通 |
| 役割 | プレイヤーの編成意図や状態付与が成功しているかを確認する情報 |
| 一覧表示 | 常時表示は 6〜8 個程度。収まらない場合は `+N` |
| 詳細 | **`description` なし** — 個別バッジ hover tooltip + `+N` hover tooltip。**`description` あり** — §7.1.2 と同様にクリックで用語パネルのみ |

敵状態アイコンは単なる敵情報ではなく、こちらの編成結果を観測するための情報。一覧性のために敵側の表示数は絞ってよいが、詳細確認の逃げ道を持たせる。

個別の状態アイコンは味方 HUD と同じ `.party-hud-status-badge-hit` 経路でホバー tooltip と用語パネル（`GameTermPanel`）を開く。状態アイコンが敵スロット内に収まりきらない場合は `+N` 表示にし、`+N` の内容も hover tooltip で確認できる。敵 HUD スロット全体のホバーで全状態をまとめて表示する tooltip は廃止。`hoverHighlight` により、上部敵 HUD の敵スロットと戦闘フィールド上の敵スプライトを対応表示する。

初期実装では、敵をクリック / 選択して固定表示する詳細パネルは必須にしない。後続検討として、右 HUD 内または右下の選択中敵詳細パネル、ボスや危険行動持ちの敵だけ詳細枠を拡張する仕様を検討する。

#### 8.8.2 危険予兆バー

敵 HUD には危険予兆バー用の固定枠を持たせる。ただし、現時点では敵も味方と同一スキルを使うため、通常スキルのリキャスト表示には使わない。

| 項目 | 方針 |
| ---- | ---- |
| 用途 | 敵専用スキル、ボス相当行動、ステージギミック行動などの将来用予約枠 |
| 通常時 | 占有領域を維持。現時点では常に非アクティブ表示でよい。薄い空枠、暗い溝、透明に近い表示 |
| 予兆中 | 赤系バー、発光、明滅、進行量で表示 |
| テキスト | 原則付けない。`WARN` や `危険` などの文字を常時表示しない |
| フィールド演出 | 危険度が高い場合のみ、敵スプライト側にも短い警告演出を出してよい |

危険予兆バーは通常リキャストバーではなく、将来の敵専用危険行動のための事前表示。敵通常スキル CD を赤く表示しない。後から敵専用行動を足しても敵スロット高さが変わらないよう、現段階では予約枠として設計する。

データ源は将来用の予約とし、現時点では戦闘ロジックへ新規実装しない。`EnemyHudSlot` は危険予兆バー用の固定領域を持ち、将来、敵専用スキル、ボス相当行動、ステージギミック行動などに telegraph 情報が追加されたら接続する。実装上は `dangerTelegraphActive` や `dangerTelegraphProgress` のような任意データを受けられる形にしてよいが、現時点では実データ未接続の非アクティブ表示を正とする。

### 8.9 フィールド上の敵付近 HUD

敵 HP と状態は上部敵 HUD に集約する。戦闘フィールド上は、位置、演出、攻撃結果を読む場所にする。

| 分類 | 方針 |
| ---- | ---- |
| 停止 | 敵スプライト付近の HP バー、敵スプライト付近の状態アイコン列 |
| 維持可 | ダメージポップ、Block / 回避 / 反撃などの戦闘フィードバック、`targetIndicator`, `hoverHighlight`, 選択中表示、危険予兆時の短い警告演出 |

同じ情報をフィールド上と右 HUD に二重表示しない。最大 10 体表示時に、フィールド上が HP バーと状態アイコンで混雑することを避ける。

### 8.10 `targetIndicator` と `hoverHighlight`

`targetIndicator` と `hoverHighlight` は別仕様として扱い、同じ状態や同じ描画フラグで混ぜない。見た目も区別できるようにする。

#### 8.10.1 `targetIndicator`

実際の戦闘ターゲットを示す戦闘情報。

用途:

- 味方が現在狙っている敵を示す
- 敵が現在狙っている味方を示す
- スキル対象を示す

表示例:

- 対象スプライト頭上の赤い下向き矢印（▼）。矢印は軽く上下に揺れる（ボブアニメ）
- 対象の足元リング（二重楕円）

表示条件:

- **常時表示しない**。Party HUD / Enemy HUD のスロットにホバーしたときのみ、そのホバー中ユニット（actor）が直近 `skillWindup` / `skill` で狙った相手（target）にマーカーを出す
- フィールド上スプライトのホバー（`hoverHighlight` source `field`）では `targetIndicator` は出さない
- ホバー解除後はマーカーを消す（トラッカー内の actor→target ペアは TTL まで保持し、再ホバー時に再利用）

#### 8.10.2 `hoverHighlight`

HUD スロットと戦闘フィールド上スプライトの対応を示す UI 補助。

用途:

- 右 HUD の敵スロットにホバーしたとき、対応する敵スプライトをハイライトする
- 戦闘フィールド上の敵スプライトにホバーしたとき、対応する右 HUD スロットをハイライトする
- 味方 HUD と味方スプライトでも同様に対応表示できるなら実装対象にしてよい

フィールド上スプライトの表現:

- スプライト外接矩形の点線枠は使わない
- シルエットを **2px** 膨張した **ぼかしなし** の輪郭バンド（8 近傍 dilation）を描き、ゆっくりパルスさせる（周期 3.3 秒。`hoverHighlightOutlineGlow.ts`）
- 色は `--hover-highlight-outline` / `--hover-highlight-glow`（`battle-view.css`）を正本とする

実装：`BattleView.ts` が `hoverHighlight` / `targetIndicator` を別状態で保持し、`BattleCanvas.ts`（フィールド描画）へ `targetIndicator` を配信する。`targetIndicator` は `skillWindup` / `skill` イベント由来の UI 表示（戦闘ロジックは変更しない）。

### 8.11 上部情報

上部情報は戦闘画面上部のオーバーレイとして扱う。

初期寸法目安:

```yaml
topInfo:
  x: 24
  y: 30
  w: 1232
  h: 52   # stage plate（Stage + Wave）を収める
```

上部情報は戦闘画面上部中央の **stage plate**（1 枚の銘板）として扱う。

| 項目 | 方針 |
| ---- | ---- |
| Stage | `STAGE {id}` 形式（例: `STAGE 1`）。20〜24px 目安 |
| Wave | `WAVE {current} / {total}` 形式。14〜16px 目安 |
| 表現 | 角丸タグ・ボタン風チップではなく、直線フレーム付き HUD 銘板（`border-radius: 0`、角欠け / 二重枠 / 内側ハイライト） |
| Verify / DEBUG | 通常 HUD から分離し `.battle-debug-overlay` 右上に配置（Layer 5） |
| 一時停止 | 本番観察用。`battle-top-info` 左端の Pause ボタン（Layer 4）。Debug UI とは分離 |
| 倍速（最小 UI） | 本番観察用。**R7b 最小 UI**。Pause 右隣の Speed ボタン（`×1` / `×2` / `×4`。クリックで 1 → 2 → 4 → 1）。`GameSession` simulation のみ加速（描画 tick は未加速）。正式 UI polish は未実装 |

### 8.11.1 戦闘一時停止（観察 UI — Phase 4 Task 1）

戦闘画面の本番用観察機能として、戦闘シミュレーションとフィールド演出の時間だけを止める。**戦闘ルール・ダメージ計算・ターゲット選定は変更しない。**

| 項目 | 方針 |
| ---- | ---- |
| 状態 | `BattleView` が `battlePaused: boolean` を保持 |
| 操作 | topInfo 左の Pause ボタン。`Space` / `Escape` でもトグル（テキスト入力 focus 時は除く。`Escape` は `GameTermPanel` 開時はパネル閉じを優先） |
| 停止対象 | `BattleEngine.tick`、`BattleCanvas.tick`（スプライト / VFX / ポップアップ等）、`battleElapsedMs` と `targetIndicator` TTL の進行 |
| 継続 | hover / selection / HUD 操作（`hoverHighlight`、`targetIndicator` 表示状態の維持、味方 HUD ホバー詳細、用語パネル等） |
| 非対象 | Pause ボタンでは敵 group を展開しない（束表示のまま）。click 展開は §8.11.2 |
| 表示 | `.battle-pause-overlay`（薄い暗幕、`pointer-events: none`）+ 中央の控えめな `PAUSE` 銘板。作戦進行中は銘板内に **リトライ 3 種 + ステージ選択へ**（確認なし）。操作ボタンのみ `pointer-events: auto`。戦場は読める明度を維持。Debug overlay（Layer 5）とは混ぜない |
| 作戦中断・リトライ | 敗北 / 作戦結果 overlay 非表示時のみ。ポーズ銘板から [operation-loop.md §9](operation-loop.md#9-リトライ導線r7-接続) と同じ 4 操作（同設定再戦 / 準備へ戻る / 作戦最初から / ステージ選択へ）。確認ダイアログは挟まない |
| 敗北 retry | 敗北 overlay（`.battle-defeat-retry-overlay`）に同じ 4 操作（verify ON/OFF）。§9 参照 |
| debug replay pause | 確認モードの battle-x replay pause（§1）とは独立。どちらかが ON なら `BattleEngine.tick` を止める |

実装：`BattleView.ts`（状態・UI・`tick` ゲート）、`GameSession.ts`（`engine.tick` ゲート）、`battle-view.css`。

### 8.11.1a 戦闘倍速（最小 UI — R7b）

R6b の仮 Wave 開始・R6i の最小 retry と同列。**正式 UI**（Save 永続・描画 tick 同期・専用設定）は別 Phase。

| 項目 | 方針 |
| ---- | ---- |
| 倍率 | `1` / `2` / `4` のみ（`GameSession.simulationSpeed`） |
| 操作 | topInfo 左の Speed ボタン（Pause 右隣）。表示 `×{speed}`。クリックで 1 → 2 → 4 → 1 |
| 加速対象 | `BattleEngine.tick` の `deltaSec` のみ（`GameSession.tick` gate） |
| 非加速 | `BattleView.tick` / `BattleCanvas` アニメ（pause と同様、描画 delta は実時間） |
| 停止合成 | pause または debug replay pause 中は engine tick 停止。倍率は保持 |
| 永続化 | Save 対象外（セッション内のみ） |
| 無効化 | 敗北 retry overlay・作戦結果 overlay 表示中は Speed ボタン disabled |

実装：`GameSession.ts`（`getSimulationSpeed` / `cycleSimulationSpeed`）、`BattleView.ts`（Speed ボタン）、`gameSessionSimulationSpeed.test.ts`。

### 8.11.1b 作戦結果 overlay 表示中の味方 party HUD

| 項目 | 方針 |
| ---- | ---- |
| 問題系列 最終勝利 overlay | OperationState 即時消去後に Save 編成へフォールバックする味方 party HUD 全体を非表示（背景に誤編成を見せない） |
| 固定 Stage 勝利 overlay | 味方 party HUD は従来どおり表示 |
| 敵 HUD・戦場・結果 overlay | 変更しない（維持） |

### 8.11.2 敵 group クリック展開（観察 UI — Phase 4 Task 2）

一時停止中に敵 HUD の group を観察しやすくするため、**クリックのみ**でカード束を個体カードへ展開する。hover では展開しない（§8.10.2 の `hoverHighlight` のみ）。

| 項目 | 方針 |
| ---- | ---- |
| 状態 | `BattleView` が `expandedEnemyGroupIds: Set<groupId>` を保持（`battlePaused` と連動） |
| 通常戦闘中 | `battlePaused = false`、`expandedEnemyGroupIds` は空。group はカード束 |
| 通常戦闘中に group クリック | `battlePaused = true`、`expandedEnemyGroupIds` に clicked group を追加 |
| Pause ボタン / `Space` で一時停止 | `battlePaused = true`、`expandedEnemyGroupIds` は空のまま |
| 一時停止中に未展開 group クリック | `expandedEnemyGroupIds` へ追加。他の展開 group は維持 |
| 展開中 group の先頭カードクリック | その group のみ `expandedEnemyGroupIds` から削除（重ね表示へ戻す） |
| Pause 解除（ボタン / `Space` / `Escape`） | `battlePaused = false`、`expandedEnemyGroupIds` を空に戻し全 group を折りたたむ |
| 戦闘ロジック | 変更しない。`enemyGroup` は HUD 表示専用のまま |
| hover | group hover はグループ内全敵を薄くハイライト。展開済み個体カード hover は該当個体のみ強くハイライト。`targetIndicator` とは分離（§8.10） |

**展開表示:**

- 展開 group は重ねていた `enemyCard` を縦一列の個体カードとして開く（`enemyHudExpandedCardOffset`、gap 4px）
- 各個体カードは icon / 名前 / 個体 HP / 個体状態 / 危険予兆枠を表示（集約 `×N` や `importantStates` は使わない）
- 未展開 group は Phase 3 のカード束のまま
- group コンテナ高さは展開体数に応じて伸びる（`--enemy-hud-expanded-slot-h`）。幅は束表示と同じ

実装：`BattleView.ts`（`expandedEnemyGroupIds`・クリック / 解除）、`EnemyHudPanel.ts`（展開レイアウト・個体 hover）、`enemyHudCardStack.ts`（展開 footprint）、`enemy-hud-overlay.css`。

### 8.12 デバッグ UI

デバッグ UI は本体戦闘 HUD とは分離する。

| 項目 | 方針 |
| ---- | ---- |
| 配置 | 別レイヤ、折りたたみ式ドロワー、開発用パネルなど |
| 禁止 | デバッグ UI が本体戦闘 HUD を押し下げること、1280×720 本番 HUD を変形させること |
| 開発中表示 | 必要な表示は残してよいが、ゲーム HUD と混ぜない |

実装：`BattleView.ts` の `.battle-debug-overlay` / `.battle-debug-shell`（`battle-canvas-host` 内 z-index 5）に `DebugMenuPanel`（折りたたみドック）、`BattleXDebugCanvas` を overlay 配置する。本体 HUD スロット座標は `battleRootLayout.ts` の固定 rect のまま。

#### 8.12.1 詳細統計 overlay（将来）

詳細統計の overlay 分離は §8 方針どおり本体 HUD から切り離す。旧 `BattleStatsDrawer`（`.party-hud-drawer-tab` のみ）は廃止済み。将来の開発用 / 詳細確認用ドロワーは別コンポーネントとして再設計する。

### 8.13 既存処理の流用方針

既存処理は、今回の戦闘画面 UI 改修が安定する範囲で流用・共通化する。過剰な抽象化は避ける。

流用候補:

- 既存の味方 HUD
- 既存の簡易 HUD
- HP バー描画
- 状態アイコン描画
- クラスアイコン描画
- スキルゲージ描画
- ツールチップ処理
- `PartyMemberStatsDisplay.ts` の与ダメ / 被ダメ表示 sync
- `GameTermPanel` / 状態バッジ tooltip の既存導線

### 8.14 変更しないもの

今回の UI 改修では、次を変更しない。

- 戦闘ロジック
- ダメージ計算
- スキル効果
- スキル発動条件
- ターゲット選定ロジック
- クラス性能
- 状態異常の意味
- 敵の行動ロジック

今回の対象は、戦闘画面の表示構造・HUD 配置・情報整理。

### 8.15 実装優先順位

今回の UI 改修では、次の優先順位を守る。既存仕様や既存実装との衝突箇所では、本節の新方針を優先する。

1. 1280×720 基準の外側 HUD 構造を作る
2. 左味方 HUD と右敵 HUD をオーバーレイ配置する
3. HUD の高さ固定、状態欄固定、スキル枠固定を守る
4. 敵スプライト付近の HP / 状態表示を右 HUD へ移す
5. `BattleCanvas` 内部座標系の大改修は後回しにする
6. `BattleStatsDrawer` は本体 HUD から分離する
7. 敵詳細パネルや危険予兆データ接続は後続で拡張する

### 8.16 受け入れ条件（戦闘画面 UI）

1. 1280×720 基準解像度と 16:9 基準アスペクト比が明記されている
2. 絶対 px 座標と等比スケール方針が明記されている
3. pixelated / nearest-neighbor 表示方針が明記されている
4. 全幅背景 + 上部敵 HUD / 下部味方 HUD オーバーレイ構造が明記されている
5. 三カラム分割ではないことが明記されている
6. 味方 HUD の固定カード仕様が明記されている
7. 味方スキルゲージの 2×2 固定配置が明記されている
8. 味方状態アイコン欄の 2 行固定仕様が明記されている
9. 敵 HUD の最大 10 体一覧仕様が明記されている
10. 敵 HUD にクラスアイコン、HP、状態アイコン、危険予兆バー予約枠を表示する方針が明記されている
11. 敵 HUD には通常スキルリキャストバーを表示しないことが明記されている
12. 敵スプライト付近の HP バー・状態アイコンを不要とする方針が明記されている
13. `targetIndicator` と `hoverHighlight` の違いが明記されている
14. HUD 要素の高さを内容量で変えない方針が明記されている
15. デバッグ UI を本体 HUD から分離する方針が明記されている
16. 今回変更しない戦闘ロジック範囲が明記されている
17. `BattleCanvas` は `CANVAS_W` 1280px × `BATTLE_CANVAS_HEIGHT`（`battleRootLayout` 導出）・`BATTLE_FIELD_SPRITE_SCALE` 2 で全幅主役。左右マージン基準の combat safe で戦場横幅を使う
18. `BattleStatsDrawer` は常時 HUD へ統合せず、詳細確認 / 開発用ドロワーとして分離する方針が明記されている
19. 敵 HUD の詳細表示は初期実装では hover tooltip を基本とし、選択固定の詳細パネルは後続検討でよいことが明記されている
20. 危険予兆バーは現時点では実データ未接続の予約枠であり、通常スキルリキャストへ接続しないことが明記されている
21. UI 改修の実装優先順位が明記されている

### 8.17 Task 9 — 統合確認・引き継ぎ（2026-06）

Task 1〜8 の戦闘画面 UI 改修完了時点の整理。正本は §8 と `src/ui/battleRootLayout.ts`。

#### 実装完了（Task 1〜8）

| Task | 内容 | 主要ファイル |
| ---- | ---- | ------------ |
| 1 | 1280×720 `battle-root` + 等比スケール | `battleRootScale.ts`, `BattleView.ts`, `battle-view.css` |
| 2 | レイヤー + 大型 `battleLane` / `BattleCanvas` | `battleRootLayout.ts`, `battle-view.css`, `battleConstants.ts`, `formationLayout.ts`, `BattleCanvas.ts` |
| 3 | 左 Party HUD 4 カード overlay | `PartyHudPanel.ts`, `party-hud-overlay.css` |
| 4 | スキルゲージ 2×2 固定 + 状態 2 行固定 | `party-hud-overlay.css`, `partyHudOverlayStatusGrid.ts` |
| 5 | 上部 Enemy HUD（最大 10 group・カード束・表示専用 groupBy） | `EnemyHudPanel.ts`, `enemy-hud-overlay.css`, `enemyHudTypes.ts`, `enemyHudCardStack.ts` |
| 6 | 敵スプライト付近 HP/状態停止 | `BattleCanvas.ts` |
| 7 | `hoverHighlight` / `targetIndicator` 分離 | `BattleView.ts`, `battleHoverHighlight.ts`, `battleTargetIndicator.ts`, `battleFieldIndicatorDraw.ts`, `hoverHighlightOutlineGlow.ts`, `combatantSpriteFootDraw.ts` |
| 8 | Debug UI overlay 分離 | `BattleView.ts`, `battle-view.css` |

#### 自動テスト（受け入れ補助）

- レイアウト rect / スケール: `battleRootLayout.test.ts`, `battleRootScale.test.ts`
- Debug overlay が HUD rect を変えない: `battleDebugOverlay.test.ts`
- hover / target UI: `battleTargetIndicator.test.ts`, `battleCanvasHitTest.test.ts`
- BattleView イベント配線: `BattleView.test.ts`

#### 残 TODO（後続）

| 項目 | 内容 |
| ---- | ---- |
| 常時 targetIndicator | §8.10.1 のとおり HUD ホバー時のみ表示。エンジン snapshot から `ChaseTarget` / `AttackTarget` を常時 UI 公開する場合は戦闘側 API 追加が必要（現状は `skillWindup` / `skill` イベント + TTL） |
| 詳細統計 overlay | 旧 `BattleStatsDrawer` タブは廃止。与ダメ / 被ダメ詳細の overlay 統合は未着手 |
| 危険予兆 | `EnemyHudPanel` の `dangerTelegraph` は予約枠（非アクティブ）。戦闘データ未接続 |

#### 後続 UI polish 候補

- 1280×720 以外 viewport（800×600、超ワイド）での overlay 視認性
- 味方 / 敵 hoverHighlight の同時表示（同一ユニットで target + hover 重なり）のコントラスト
- Enemy HUD `+N` tooltip と状態アイコン密度（10 体 × 多状態）
- 詳細統計 overlay の DOM 実装（§8.12.1）
- 英語 i18n（Phase 4e — **M1 リリース直前**）— 戦闘 HUD ラベル・tooltip

#### 目視確認チェックリスト

1. 1280×720 基準で partyHud / enemyHud / battleLane / topInfo が §8 座標どおり
2. viewport リサイズで `battle-root` 全体が等比スケール（歪みなし）
3. スプライト・24px アイコン・状態バッジが pixelated（ぼやけなし）
4. 敵フィールド HP/状態なし、上部 HUD に集約
5. 敵 HUD ホバー ↔ スプライト hoverHighlight 双方向
6. HUD ホバー時の targetIndicator（頭上の赤▼）が hoverHighlight と区別できる
7. verify ON 時 debug ドック / battle-x-debug が本体 HUD を押し下げない

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

## 9. 範囲系・オーラ系効果のフィールド表示（R8 方針）

**R8 確定（2026-07-12 doc）:** 作戦内パッシブおよび戦闘中の範囲系・オーラ系効果の **フィールド上視認性**。状態アイコン整理は [combat.md §作戦内パッシブの戦闘中表示](combat.md#作戦内パッシブの戦闘中表示r8-方針) を正本とする。

### 9.1 基本方針

| 原則 | 内容 |
| ---- | ---- |
| 表示チャンネル | 範囲系・オーラ系は **フィールド上の範囲表示** を基本とする。HUD 状態アイコンではない |
| 対象への付与 | 影響を受ける **全対象へ同一アイコンを付けない** |
| 軽い反応 | 必要なら対象側に **足元・輪郭などの軽い反応のみ**（範囲図形の代替ではない） |
| データ一致 | **範囲内判定と表示範囲は同一の実行時データ** を参照する。判定用と描画用で別数値を持たせない |
| 同期 | 発生源死亡・無効化・範囲外移動時に **表示と効果が同期** して切り替わる |

**採用しない確定仕様:** 既存 status system へ範囲内対象全員を一時 status として付与する方式。**runtime 実装の詳細**（所有モジュール、更新 tick 等）は R8 実装前に判断する。

### 9.2 1 次元戦闘における効果範囲用語

Hensei-Only の戦場は **1 次元軸**（`battleX`）である。円・扇形・矩形・幅・角度などの **2 次元 shape 分類は使用しない**。

効果範囲の大分類・範囲形式・適用方式・legacy 移行方針の正本は [combat-data-schema-refactor.md §5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12) とする。本節は **フィールド上の視認性** に焦点を当てる。

| 範囲形式 | プレースホルダで示すもの |
| -------- | ------------------------ |
| **地点 N** | 地面上の起点マーカー + 起点から左右 N の有効区間（帯） |
| **範囲 N（ターゲット中心範囲）** | 対象位置を中心とした左右 N の有効区間 |
| **周囲 N** | 使用者中心の左右 N の有効区間 |
| **前方 N** | 使用者から `facing` 方向への有効区間（前方のみ） |
| **単体** | 対象位置または対象マーカー |

1 次元なので、円や扇ではなく、**戦闘軸上の帯・区間・境界線・起点マーカー** 等で確認できればよい。

### 9.3 プレースホルダ範囲表示（R8 必須）

正式 VFX を待たず、**最小実装時から** プレースホルダ範囲表示を必須とする。

| 項目 | 内容 |
| ---- | ---- |
| 表現 | **判定と一致する 1 次元区間**（帯・境界線・起点マーカー等）。2 次元 shape（円・扇形・矩形）は使わない |
| 識別 | **味方由来** と **敵由来** を色・線種等で区別できること |
| 重なり | **複数範囲の重なり** が視認できること |
| データ一致 | 範囲表示・対象判定・進行位置・Hit 時刻は **同一 runtime 情報** を参照する。表示専用の別距離・別 facing・別発生地点列を持たせない |
| R8f 実装 | `BattleSnapshot.allyRangePassiveBands`（`resolveAllyRangePassiveBands`）と `syncBuffAuras` が同一 `battleX` / `buffAoeRadiusPx` を参照。描画は `BattleCanvas` → `drawAllyRangePassiveBands` |
| 確認項目 | 表示範囲と内部判定の一致 / 範囲内外の切り替え / 発生源消滅時の解除 |

**適用方式ごとのプレースホルダ:**

| 適用方式 | プレースホルダで確認可能にすること |
| -------- | ---------------------------------- |
| **即時** | 対象区間と Hit 対象を同時に確認 |
| **進行** | 現在の進行位置と到達時 Hit |
| **持続** | 有効区間と現在範囲内の対象 |
| **乱打** | 親範囲と、各子範囲の発生地点・発生時刻を順次確認 |

正式 VFX 導入後も、位置依存効果であることが認識できる **最低限の範囲表現** は残す方向とする。

**描画層:** `BattleCanvas` 上のフィールド overlay（`battleX` / `spriteDrawY` 基準）。§8.9 の「フィールド上 HP・状態アイコン停止」と矛盾しない — 範囲表示は **ユニット付随 HUD ではなく** 地面 / 発生源起点の overlay とする。

### 9.4 正式 VFX との関係

| Phase | 内容 |
| ----- | ---- |
| **R8** | プレースホルダ区間表示 + runtime 判定 + 一致検証（テストまたは診断） |
| **試作成立後（presentation / VFX）** | 正式演出素材、ビジュアル polish、リッチな切り替えフィードバック |

正式 VFX 導入後も、**位置依存効果であることが分かる最低限の範囲表現** は残す方向とする（完全に非表示にはしない）。

---

## 関連ドキュメント

- [operation-loop.md](operation-loop.md) — **Wave 作戦ループ**（作戦状態 / 戦闘状態、Wave 間準備、リトライ）
- [combat.md](combat.md) — ダメージ、CD、脅威、ステータス（座標節は本書へ委譲）
- [ui-visual-rules.md](ui-visual-rules.md) — 全 UI 共通ビジュアル
- [party-formation-ui.md](party-formation-ui.md) — 編成画面
- [classes-and-skills.md](classes-and-skills.md) — スキル `move` スキーマ
- `data/stages.json` — Wave / `spawnX`
