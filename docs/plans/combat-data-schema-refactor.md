# 戦闘データスキーマ再設計（R4）

**Phase:** R4 — データスキーマとエディタ設計（**設計のみ**）  
**正本仕様:** [operation-loop.md](../spec/operation-loop.md)、[combat.md](../spec/combat.md)、[classes-and-skills.md](../spec/classes-and-skills.md)、[stats.md](../spec/stats.md)  
**実装:** R5（最小縦切り）以降。エディタ実装は R9。

本書は R1〜R3 で確定した上位仕様を、**実装前のデータ責務・エディタ責務・移行方針**へ落とし込む。具体的な TypeScript 型名・JSON フィールド名・ファイル分割は **確定しない**（R5 試作で subset を決める）。

---

## 1. 共通設計原則

| 原則 | 内容 |
| ---- | ---- |
| 兵科と戦闘方式の分離 | 基礎ステ・ロール・優先ターゲット・属性は兵科。Hit 構造・対象数・射程・効果形状は戦闘方式 |
| 方式と作戦内パッシブの非混在 | 別データ集合。同一 JSON / 同一エディタ画面へ無理に統合しない |
| 作戦状態と Wave 戦闘状態の分離 | 作戦状態は Wave 跨ぎ。Combatant / HP / DoT 等は Wave 単位で生成・破棄 |
| 敵味方の表現統一 | 同一兵科・戦闘方式・パッシブ表現を敵にも適用可能 |
| 敵専用補正の局所化 | `hpScale` 等は **敵グループ**（または Wave 内配置）のみ。兵科データへ混ぜない |
| Stage に戦闘ロジックを埋め込まない | Stage / Wave は編成・ルール参照・報酬 **候補** のみ |
| 表示名と内部 ID の分離 | UI 表示名・説明と `classId` / `moduleId` / `passiveId` を分ける |
| 旧 active / passive / level 中心にしない | 新 schema の中心は兵科 + 戦闘方式 + Wave 敵グループ + 作戦状態 |
| 最小縦切り優先 | R5 に不要な汎用化・全面 migration・非 M1 兵科は先行しない |
| legacy 互換で複雑化しない | 読み込み normalize は **期間限定**。新データ少数作成を第一候補 |

---

## 2. データ責務の全体像

```text
[永続マスタ — JSON]
  兵科 (Class)
  戦闘方式 (Combat Module)
  作戦内パッシブ (Operation Passive) — R5 では schema のみ、実データ最小
  Stage
    └ Wave[]
         └ enemyGroup[]

[実行時 — メモリ、R5 は Save 非統合]
  作戦状態 (Operation State)
    → Wave 開始時に Combatant 生成
  Wave 戦闘状態 (BattleEngine / CombatantState)
    → Wave 終了時に破棄
```

**参照:** 作戦ループは [operation-loop.md §3](../spec/operation-loop.md#3-作戦状態と戦闘状態の分離)。

---

## 3. 兵科データ（Class）

### 3.1 持つ責務（候補）

| カテゴリ | 候補フィールド / 概念 |
| -------- | --------------------- |
| 識別 | `classId`（内部）、表示名（UI） |
| ロール | defender / attacker / supporter |
| 隊形 | 前衛 / 後衛区分 |
| 基礎ステ | 基礎 HP / ATK / DEF / RES |
| 行動基準 | **基礎攻撃間隔**（秒）、基本射程帯または基本行動距離 |
| 固定ルール | **固定優先ターゲット**、固定ダメージ属性または行動属性 |
| 参照 | **使用可能な戦闘方式 ID ×2**（または pool から R5 用に 2 件固定） |
| 参照 | **取得可能な作戦内パッシブ ID**（pool。R5 では空でも可） |
| 表示 | 表示用説明 |

攻撃間隔は戦闘方式が上書きしうるが、**兵科側に基礎値を必ず持つ**（[combat.md §攻撃間隔](../spec/combat.md#攻撃間隔)）。

### 3.2 持たせない責務

| 項目 | 正本 |
| ---- | ---- |
| Hit 数・Hit 係数・対象数・攻撃形状 | 戦闘方式 |
| active CD / gauge / Lv 習得段階 | 廃止方向（legacy） |
| `growthTier` / Lv 成長 | 廃止方向（[stats.md §Legacy](../spec/stats.md#legacy--lv-成長攻撃速度-tier)） |
| 敵専用 scale | 敵グループ |
| Wave 固有補正 | Stage / Wave |
| `passive_1〜4` / `active_1〜4` 枠 | legacy |

### 3.3 legacy との対応（現行 `ClassPreset` / `classes.json`）

現行は Lv1 ステ + `growthTier` + `attackSpeedTier` + basic / passive×4 / active×4 参照を内包。新 schema では **ステ基礎値 + 方式 pool + パッシブ pool** のみを正とする。

---

## 4. 戦闘方式データ（Combat Module）

**プレイヤー向け名称:** 「戦闘方式」  
**内部名称候補:** `moduleId`、Combat Module、combat module bundle

### 4.1 持つ責務（候補）

| カテゴリ | 候補 |
| -------- | ---- |
| 識別 | `moduleId`、対応 `classId`、表示名、説明 |
| 行動 | 行動種別（攻撃 / 回復 / 防護 / barrier 等） |
| 形状 | 効果形状、Hit 数、Hit 係数、対象数、対象分配、target shape |
| 空間 | 射程、停止位置、必要な移動方式 |
| タイミング | **攻撃間隔上書き**（任意） |
| 追加 | 追加効果（DoT 付与、block 等 — effect schema は R5 前に subset 確定） |
| 表示 | 表示用要約（UI / カード用） |

戦闘方式は **通常行動全体** を定義する。旧 active スキルの名前変更 **ではない**（CD / gauge / Lv 解放は引き継がない）。

**防護・軽減・自己強化:** 選択中 **永続**が原則。攻撃間隔ごとの duration 付き周期バフは実装しない（正本: [combat.md §戦闘方式](../spec/combat.md#戦闘方式)）。

**旧 active 廃止の意図:** CD / gauge / smart 条件等で **有効タイミングに発動しない**ケースを減らす。方式は選択中ずっと効く通常行動・永続効果へ寄せる（同節）。

### 4.2 兵科側へ持たせないもの（方式側）

優先ターゲットは **兵科固定**。**初期 schema では戦闘方式側に持たせない。**

将来、方式ごとに優先ターゲット override を許す拡張は **設計上禁止しない** が、R5〜R8 では実装しない方針を明記する。

### 4.3 legacy との関係

旧 `ActiveSkillDef` / basic attack JSON は **手作業で方式案へ再定義** する素材。`active → module` の自動変換は **前提にしない**。

---

## 5. 作戦内パッシブデータ（Operation Passive）

戦闘方式と **別データ集合**。Wave 内の常時発動パッシブ（旧 `PassiveSkillDef`）とは目的が異なる。

### 5.1 持つ責務（候補）

| カテゴリ | 候補 |
| -------- | ---- |
| 識別 | `passiveId`、表示名、説明 |
| 対象 | 対応 `classId` または対象条件 |
| 効果 | 効果定義（schema 未確定） |
| 取得 | 取得可能条件（**具体値は R8**） |
| 将来 | コスト、重複可否、UI 表示用分類 |

### 5.2 R4 / R5 で確定しないもの

コスト具体値、rarity、取得上限、重複数、取得順序、unlock tree、UI レイアウト。

### 5.3 R5 に必須な schema 部分 vs 将来部分

| 区分 | 内容 |
| ---- | ---- |
| **R5 最小** | `passiveId` + `classId` 対応 + 効果 placeholder または空 pool。実装・取得 UI なし |
| **R8 以降** | 取得条件、コスト、重複、敵側パッシブ、巻き戻し連動 |

### 5.4 将来効果候補（記録のみ）

移動阻害、ノックバック強化、移動速度差 — [classes-and-skills.md §作戦内パッシブ](../spec/classes-and-skills.md#作戦内パッシブ設計アイデア--未確定) と同様に **候補としてのみ** 記載。R5 スコープ外。

### 5.5 legacy との関係

旧 passive JSON から **手作業で候補を選別**。`passive → run passive` の一括変換は **しない**。

### 5.6 戦闘中表示（R8 doc 反映 — 2026-07-12）

作戦内パッシブの **runtime 適用** と **視認性** は R8 のスコープ。本節はデータ schema ではなく表示・runtime 方針の参照先を固定する。

| トピック | 正本 |
| -------- | ---- |
| 状態アイコン対象の整理（効果種別） | [combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針) |
| Barrier — HP バーのみ、状態アイコン非表示 | 同上 + [combat.md §バリア](../spec/combat.md#バリア) |
| 範囲系・オーラ系 — フィールド範囲表示 | [battle-field.md §範囲系・オーラ系効果のフィールド表示](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針) |
| **1 次元効果範囲** — 大カテゴリ統合・範囲形式・適用方式・legacy 移行 | [§5.7](#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12) |
| R8 完了条件・VFX 後送 | [phase-roadmap.md §R8](phase-roadmap.md#r8--作戦内パッシブ) |

**R8 に含める:** 範囲パッシブの runtime 判定、プレースホルダ範囲描画、表示範囲と効果対象の一致検証（テストまたは診断）。

**R8 に含めない / 後送:** 正式 VFX 素材、プレースホルダの polish（試作成立後の presentation / VFX フェーズ）。

**採用しない確定仕様:** 既存 status system へ範囲内対象全員を一時 status として付与する方式。

**R8 実装前に判断する:** aura 解決の所有モジュール、tick 更新、プレースホルダ描画 API、passive effect schema の効果範囲フィールド詳細（[§5.7](#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12) 参照）。

### 5.7 効果範囲（1次元戦闘 — R8 doc 反映 — 2026-07-12）

**スコープ:** 設計文書・将来エディタ方針のみ。production code / JSON / テスト / legacy `targetShape` 削除は **今回対象外**。

Hensei-Only の戦場は **1 次元軸**（`battleX`）である。円・扇形・矩形・幅・角度などの **2 次元 shape 分類は使用しない**。

空間的な効果範囲に必要なのは、主に以下である。

| 観点 | 内容 |
| ---- | ---- |
| 起点 | どこを起点にするか |
| 方向 | 両方向か、現在の向きの前方だけか |
| 距離 | 軸上でどれだけ届くか |
| 対象数 / Hit | 何体または何 Hit へ適用するか |
| 適用方式 | どのタイミング・順序で効果を適用するか |

プレースホルダ範囲表示は [battle-field.md §9](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針) を正本とする。

#### 5.7.1 大カテゴリの統合

新仕様の effect 説明および将来の CombatModuleEditor 等では、次の **大分類** を基本とする。

| 大カテゴリ | 内容 |
| ---------- | ---- |
| **効果内容** | ダメージ、回復、stat 補正、状態付与等 |
| **効果範囲** | 空間範囲・対象数・Hit 数・適用方式 |
| **対象条件** | 誰を選択候補にするか（空間範囲とは別） |

現状の `targetShape` や「ターゲット形式」は、**「効果範囲」と並列する独立大カテゴリとして残さず**、原則として大カテゴリ **「効果範囲」** の小分類へ統合する方向とする。

**対象条件**として **分離して維持** する項目（空間範囲と同一概念にしない）:

- 敵 / 味方 / 自身
- 優先ターゲット
- HP 条件
- ロール条件
- ステータス条件
- 除外条件

#### 5.7.2 効果範囲の小分類 — 範囲形式

基本用語は以下の **5 種類** である。`N` は距離値（既存の戦闘距離表現に合わせる）。

| 表示用語 | 起点 | 軸上の範囲 |
| -------- | ---- | ---------- |
| **単体** | 選択された対象 | その対象のみ |
| **地点 N** | effect が決定した地面上の地点 | 起点から左右 N |
| **範囲 N（ターゲット中心範囲）** | 選択されたターゲットの位置 | ターゲット位置から左右 N |
| **周囲 N** | 使用者自身の位置 | 自身位置から左右 N |
| **前方 N** | 使用者自身の位置 | 現在の向きへ N |

`範囲 N` は効果範囲全体の総称ではなく、**ターゲット中心範囲** を表す短縮用語である。仕様書初出時は **範囲 N（ターゲット中心範囲）** と明記する。

**内部概念（schema 具体名は今回未確定）:**

| 概念 | 候補値 |
| ---- | ------ |
| origin | `target` / `ground` / `self` |
| direction | `both` / `forward` |
| distance | 数値 N |
| targetCount / maxTargets | 対象数上限 |
| hitCount | Hit 数 |
| 対象不足時の規則 | 終了 / 同一対象へ再命中 等 |
| 対象陣営 | ally / enemy / self 等 |
| 対象条件 | §5.7.1 の分離項目 |

概念上の対応:

| 表示用語 | origin | direction | distance |
| -------- | ------ | --------- | -------- |
| 単体 | target | — | なし |
| 地点 N | ground | both | N |
| 範囲 N | target | both | N |
| 周囲 N | self | both | N |
| 前方 N | self | forward | N |

**導入しない:** 2 次元用の shape、angle、width、radius 等。

**前方 N と facing:** `前方` は画面上の固定方向ではなく、Combatant の現在 `facing` を基準とする。右向きなら自身位置から右方向へ N、左向きなら左方向へ N。背後の対象へ向き直った場合は、その時点の `facing` に従う。

**地点 N の前提:** プレイヤーが地面を直接クリックして指定することは **前提にしない**。effect が自動決定した地点、ターゲット位置から算出した地点、固定地点、乱打の発生地点、投射物の着弾地点等を含められる。

#### 5.7.3 対象数・Hit・再命中規則

対象数や Hit 数は、**範囲形式とは別の小分類** として扱う。

| 候補 | 例 |
| ---- | -- |
| 1 体 | 単体・1 Hit |
| 最大 N 体 | 範囲 80・最大 3 体 |
| 全対象 | 前方 200・全対象 |
| Hit 数 N | 単体・2 Hit |
| 対象不足時に終了 | — |
| 対象不足時に同一対象へ再命中 | 単体・2 Hit・不足分は同一対象へ再命中 |
| 同一対象への複数 Hit 可否 | — |

#### 5.7.4 適用方式

効果範囲カテゴリ内に、「どのタイミング・順序で Hit を適用するか」を示す小分類を持たせる。内部実装では range と delivery / runtime event を分離してよいが、**設計文書と将来エディタでは「効果範囲」配下へまとめる**。

| 適用方式 | 概要 |
| -------- | ---- |
| **即時** | 範囲内の対象へ、原則として同一タイミングで効果を適用 |
| **進行** | 起点から軸上を進み、距離に応じた到達時刻で Hit を発生 |
| **持続** | 一定時間・一定間隔、または範囲内にいる間、繰り返し対象判定と効果適用 |
| **乱打** | 親範囲内へ小範囲を複数回発生させる（独立した第 6 の範囲形式ではない） |

**即時の例:** `周囲 100・全対象・即時`、`範囲 60・最大 3 体・即時`

**進行 — 飛翔と伝播の統合:** 「飛翔」と「伝播」は **独立した適用方式に分けず**、共通方式 **「進行」** へ統合する。以下はすべて進行方式の表現差として扱う。

- 矢や弾丸などの飛翔体
- 衝撃波や炎の波
- 貫通弾
- 対象地点へ飛び、到達時に範囲効果を発生させる弾
- 軸上を順番に効果が移動する攻撃

違いは進行方式の以下の要素で表現する方向とする（TypeScript 型名は今回未確定）:

- 進行起点
- 進行方向または目的地点
- 進行速度
- 最大到達距離
- 経路上の対象へ命中するか
- 目的地点到達時だけ効果を発生するか
- 同一対象への再命中可否
- 通過時または到達時に発生する子範囲

**Hit タイミング:** ダメージ、回復、状態付与、ヒット VFX、ダメージ表示は、原則として Attack 開始時ではなく、**各 Hit が実際に到達・適用された時点** で発生させる。

**持続の例:** `地点 100・持続・1 秒ごと`、`周囲 80・持続`、`前方 150・持続・0.5 秒ごと`

範囲内全対象へ既存 status を付け続ける方式を **確定仕様にせず**、runtime で直接範囲判定する方式も選べるようにする（[battle-field.md §9.1](../spec/battle-field.md#91-基本方針) と整合）。

**乱打:** 親範囲内へ子範囲を複数回発生させる適用方式。構成要素:

| 要素 | 内容 |
| ---- | ---- |
| 親範囲 | `地点 N` / `範囲 N` / `周囲 N` / `前方 N` |
| 子範囲 | 通常 `地点 N` 相当（地面上の発生地点起点） |
| 発生回数 | 例: 6 |
| 発生間隔 | 例: 0.25 秒 |
| 発生地点列または配置規則 | 後述 §5.7.6 |
| 各 Hit の適用時刻 | — |

**例:** 親範囲 `範囲 200`、子範囲 `地点 30`、適用方式 乱打、回数 6、間隔 0.25 秒。

処理イメージ:

1. 親範囲を決定する
2. 親範囲内の発生地点列を決定する
3. 各時刻に子範囲を生成する
4. その時点の位置を基準に対象判定する
5. Hit 適用とヒット VFX を発生させる

**親範囲内の対象を発動時にすべて固定し、Hit だけ遅延させる方式とは区別する。**

#### 5.7.5 乱打と乱数なし方針

ゲーム内表現として「乱打」という名称は使用可能である。ただし、**内部の発生地点決定に非決定的乱数を使用しない**。

候補: 固定オフセット列、左右交互、中央から外側、外側から中央、対象密度優先、Attack 回数や unitId 等から一意に決まる決定的な列。

**同じ条件なら同じ発生地点・同じ Hit 結果** になることを維持する。具体的な地点列 schema や配置規則は **後続 effect schema 設計時の保留事項** とする。

#### 5.7.6 legacy 形式の新しい位置づけ

| legacy | 新仕様での位置づけ |
| ------ | ------------------ |
| **`single`** | **単体** — 効果範囲カテゴリの最小形式。独立 targetShape 大カテゴリではない |
| **`area` / target-centered area** | **範囲 N（ターゲット中心範囲）** — 選択ターゲット位置から左右 N |
| **self area / aura** | **周囲 N** — 使用者自身から左右 N |
| **ground area** | **地点 N** — effect 決定地点起点・左右 N |
| **`pierce`** | 独立した範囲形状ではない。**前方 N + 対象数（全対象 or 最大 N 体）+ 進行 + 各対象位置への到達時命中**。例: `前方 200・全対象・進行`。legacy `targetShape: pierce` は runtime ブリッジ用に残す |
| **`multiLock`** | 独立した範囲形式ではない。**範囲形式 + 対象数 or Hit 数 + 対象不足時の再命中規則** の組み合わせ。例: `単体・2 Hit・不足分は同一対象へ再命中`。legacy `multiLock` は runtime ブリッジ用に残す |
| **`barrage` / 乱打** | 独立 targetShape や範囲形式ではなく、**効果範囲カテゴリ内の適用方式「乱打」** |

旧 `pierce` の意味（移行参考）: 使用者起点、facing 方向へ射程まで進む、軸上の複数対象へ到達順に命中。

**R11a 確定 — `pierce` / `multiLock` migration（normalize ブリッジ）:**

| 方向 | 規則 |
| ---- | ---- |
| legacy → `effectRange` | `single` → `{ form:'single', applyMode:'instant', hitCount? }`；`aoe` → `{ form:'area', distancePx: aoeRadiusPx, applyMode:'instant', hitCount? }`；`pierce` → `{ form:'forward', applyMode:'progress', maxTargets:'all', distancePx: range? }`；`multiLock` → `{ form:'single', applyMode:'instant', hitCount, refillSameTargetOnShortfall:true }`；`chain` / `scatter` / `poolEach` → effectRange 未設定（targetShape のみ） |
| `effectRange` → legacy | `forward`+`progress` → `pierce`；`area`+`instant` → `aoe`；`single`+`instant`+`hitCount>=2` → `multiLock`；その他 `single` → `single`；`around` → best-effort `aoe`（self target は呼び出し側） |

実装: `src/battle/skills/effectRangeNormalize.ts`。authoring 正本は `effectRange`、runtime は当面 legacy `targetShape`。

#### 5.7.7 将来エディタでの想定

CombatModuleEditor 等では、別々の「ターゲット形式」「範囲形式」「配送方式」欄を並列させず、**「効果範囲」内へまとめる** 方向とする。

**例 1 — 進行型貫通:**

- 形式: 前方
- 距離: 200
- 対象数: 全対象
- 適用方式: 進行
- Hit 数: 1

**例 2 — 乱打:**

- 形式: 範囲
- 距離: 200
- 適用方式: 乱打
- 子範囲: 地点 30
- 回数: 6
- 間隔: 0.25 秒

**例 3 — 持続オーラ:**

- 形式: 周囲
- 距離: 100
- 対象数: 全味方
- 適用方式: 持続
- 判定間隔: 1 秒

具体的な UI 実装や TypeScript 型名は **今回未確定**。

#### 5.7.8 未確定（R8 実装前・後続 schema 設計）

| 項目 | 備考 |
| ---- | ---- |
| 起点 / 方向 / 距離 / 対象数 / Hit 数 / 再命中規則 | 内部 schema フィールド名 |
| 適用方式（即時 / 進行 / 持続 / 乱打） | delivery との分離境界 |
| 進行速度 | 進行方式 |
| 持続時間・判定間隔 | 持続方式 |
| 乱打の子範囲・回数・間隔・配置規則 | 地点列 schema |
| `pierce` / `multiLock` の migration ルール | **R11a 確定**（§5.7.6）。runtime は当面 bridge |
| runtime の具体的 TypeScript 型名 | `EffectRangeSpec` 等は R11a で追加。executor は当面 `targetShape` |

---

## 6. 敵グループデータ（Enemy Group）

敵味方で **同一兵科・戦闘方式・パッシブ表現** を使用可能にする。

### 6.1 グループが持つ候補

| フィールド | 内容 |
| ---------- | ---- |
| `classId` | 兵科参照 |
| `count` | 同一設定の体数（≥1） |
| `selectedCombatModuleId` | 当グループ全員の戦闘方式 |
| `passiveIds` | 作戦内パッシブ相当（敵側）。**R5 では空で可** |
| scale | `hpScale`, `atkScale`, `defScale`, `resScale`（必要なら攻撃間隔補正） |
| 配置 | 出現情報 / 配置ヒント（射程自動配置等は [battle-field.md](../spec/battle-field.md) 側） |

### 6.2 編成ルール

| 側 | ルール |
| -- | ------ |
| 味方 | **同一 `classId` 禁止**（4 人編成） |
| 敵 | **同一 `classId` 禁止を適用しない**。`count` で複数配置 |
| グループ内 | 原則 **同一戦闘方式・同一パッシブ** を共有。個体差分は初期仕様で許可しない |
| 強さ | **`level` で表現しない**。scale + 兵科基礎ステのみ |

### 6.3 現行 `StageEnemyGroup` との差分

現行（`types.ts`）: `classId`, `count`, scale のみ。戦闘方式・パッシブ未指定（legacy スキルセット / Lv 解放に依存）。

新 schema: **`selectedCombatModuleId` 必須**（R5）。`passiveIds` は optional（R5 空可）。

### 6.4 敵テンプレ（`enemies.json`）の位置づけ

| 選択肢 | 評価 |
| ------ | ---- |
| **A. テンプレ廃止、Wave `enemyGroups` を正本** | Stage / Wave から兵科・方式・パッシブが一目で分かる。**推奨方向** |
| B. テンプレをプリセットとして残す | 編集効率は上がるが、正本が二重化しやすい |
| C. legacy `templateId` 維持 | migration 期間のみ。新規 authoring では使わない |

**R4 推奨:** C を legacy 読み込み専用とし、**新本編の正本は Wave 内 `enemyGroups`**。テンプレは R9 エディタで「Wave へコピー」プリセット程度に降格検討。

---

## 7. Stage / Wave データ

**R12k 再設計注記（2026-07-17）:** 本節の固定 `StageDef` / `waves[]` はクエストおよび縦切り試作用として有効だが、反復可能なメイン攻略全体の schema ではない。遭遇 pool、問題テンプレート、経路、シード、報酬候補等が必要かは R12k で決める。決定前に `StageDef` へ推測で混在させない。

### 7.1 現行構造（legacy 把握）

現行 `StageDef`（`types.ts`）:

- `waves: StageWave[]` — `templateId` + `spawnX`（legacy）
- `enemyGroups?: StageEnemyGroup[]` — ステージ直下。体験版は **1 stage = 1 配列 = 1 Wave 相当**
- `recommendedLevel` — 敵 Lv 算出に使用（**新 schema では廃止方向**）

### 7.2 新 schema — Stage 候補責務

| 項目 | 内容 |
| ---- | ---- |
| `stageId` | 内部識別 |
| 表示名・説明 | UI |
| **Wave 一覧** | 正本。1 件以上必須 |
| 作戦全体ルール | modifier 参照（具体は R10 前） |
| 初期作戦内リソース | **候補**（R8） |
| クリア報酬 | **候補**（恒久報酬は作戦外。R10 前） |
| 敵情報開示設定 | **候補**（R6 UI） |

### 7.3 新 schema — Wave 候補責務

| 項目 | 内容 |
| ---- | ---- |
| `waveId` | Wave 識別（または配列 index + 表示名） |
| `enemyGroups` | §6 の敵グループ配列 |
| Wave 固有ルール | 任意 modifier |
| Wave クリア報酬 / 作戦内リソース | **R8 へ送る** |
| プレビュー情報 | 編成ヒント等 |
| 最終 Wave 判定 | **配列末尾で代替可能**（専用フラグは R5 では不要） |
| 背景・演出 | 任意（R5 最小では省略可） |

### 7.4 legacy 省略記法

ステージ直下の `enemyGroups`（現行 v0.3.2）は **legacy または単一 Wave 省略記法** として扱う。

| 方針 | 内容 |
| ---- | ---- |
| 新正本 | `waves[].enemyGroups` |
| normalize 候補 | 直下 `enemyGroups` のみの Stage → 単一 Wave に包む |
| 旧 `waves` + `templateId` | 読み込み互換のみ。新規 authoring 禁止 |
| 自動 Wave 遷移 | Stage データに **埋め込まない**（[operation-loop.md §2](../spec/operation-loop.md#2-上位ループ)） |
| Wave 間準備 | 初期仕様は **全 Wave 間に準備を挟む**。個別 Wave ごとの ON/OFF は複雑化しない |
| 旧 7 ステージ | **自動移行計画を作らない**。`stages-demo.json` は legacy のまま |

---

## 8. 作戦中状態（Operation State）

[operation-loop.md §3.1](../spec/operation-loop.md#31-作戦状態複数-wave-を通して保持) の実行時状態。**永続 Save の正本ではない**（R5）。

### 8.1 候補フィールド

| フィールド | 内容 |
| ---------- | ---- |
| `operationId` / `stageId` | いまの作戦 |
| `currentWaveId` または index | 挑戦中 Wave |
| `clearedWaveIds` | クリア済み Wave |
| `currentPartyClassIds` | 味方 4 兵科（重複なし） |
| `selectedCombatModuleByClassId` | 兵科 → 選択中方式 |
| `acquiredPassiveIdsByClassId` | 取得済み作戦内パッシブ（R8 まで空可） |
| `unspentResource` | 作戦内リソース（R8） |
| `waveStartCheckpoint` | 出撃確定時点のスナップショット |
| `operationRuleState` | 作戦 modifier の runtime |

### 8.2 境界

| 含めない | 理由 |
| -------- | ---- |
| Combatant HP / Barrier / DoT / CC | Wave 戦闘状態 |
| `battleX` / attack timer / projectile | Wave 戦闘状態 |
| BattleEngine 内部 FSM の完全コピー | checkpoint は **作戦状態の復元用** |

### 8.3 永続化方針（R5）

| 方針 | 内容 |
| ---- | ---- |
| 保持 | **メモリのみ**。アプリ終了で破棄可 |
| Save | 作戦途中状態は **入れない** |
| 作戦完了時 | クリア記録・恒久解禁等のみ Save へ反映 **候補** |

具体型名・deep copy 手法は **R5 実装時**。

---

## 9. Wave 戦闘状態

既存 `BattleEngine` / `CombatantState` 側の一時状態。Wave 終了で破棄、次 Wave 開始時に作戦状態から **再生成**。

### 9.1 含む候補

Combatant、HP、Barrier、DoT、HoT、CC、current target、`battleX`、attack timer、一時バフ / デバフ、projectile / placed field、戦闘中カウンタ。

### 9.2 作戦内パッシブの適用タイミング

作戦状態に `acquiredPassiveIdsByClassId` を保持 → **Wave 開始時** に Combatant 生成へ反映（常時効果として解釈）。Wave 中に取得したパッシブ（R8）は別途設計。

---

## 10. 味方編成 validate（実行時）

| ルール | 内容 |
| ------ | ---- |
| 人数 | 4 人以内、R5 最小縦切りでは **4 人固定** |
| 兵科重複 | **同一 `classId` 禁止** |
| 参照整合 | 存在する `classId` のみ |
| 戦闘方式 | 各 `classId` に選択中方式が **必須** |
| 方式所属 | 選択方式が当該 `classId` の pool に属する |
| 解禁 | 恒久解禁チェックは **将来追加**（R5 では全 M1 解禁前提でも可） |

敵側には同一兵科禁止を **適用しない**。

---

## 11. validate 責務（層別）

関数名・配置ファイルは **未確定**。責務のみ固定。

### 11.1 データ単体（マスタ JSON）

- ID 重複なし
- 参照先存在（`classId` → 兵科、`moduleId` → 方式、`passiveId` → パッシブ）
- 数値範囲（scale > 0、基礎ステ > 0 等）
- 必須項目
- class ↔ module 対応（方式の `classId` が一致）
- class ↔ passive 対応

### 11.2 Stage / Wave

- Wave が 1 件以上
- 各 Wave の `enemyGroups` が有効
- `count` が正の整数
- 敵 `selectedCombatModuleId` が敵 `classId` に対応
- 敵 `passiveIds` が class に対応（指定時）
- **旧 `recommendedLevel` / Lv 依存なし**（新データ）

### 11.3 実行時編成（味方）

- §10 の全項目
- 作戦状態との整合（選択方式が作戦状態に記録されている）

### 11.4 作戦状態

- `currentWave` が Stage 内に存在
- `clearedWaveIds` と `currentWave` の整合
- `unspentResource` ≥ 0
- `acquiredPassiveIds` が有効参照
- `checkpoint` が現在 Wave と対応（出撃確定時点）

---

## 12. normalize / migration 方針

**R4 では code を書かない。** 方針のみ。

### 12.1 変換候補（手作業 / 限定自動）

| legacy | 新方針 |
| ------ | ------ |
| `attackSpeedTier` | 秒単位 `attackIntervalSec` へ **手動または参照表** で変換 |
| basic / active JSON | 戦闘方式案へ **手作業再定義** |
| passive JSON | 作戦内パッシブ **候補を手作業選別** |
| `learnedAt` / Lv 段階 | **新正本へ移行しない** |
| Stage 直下 `enemyGroups` | 単一 Wave へ包む **normalize 候補** |
| 既存 `waves[]` | 可能な範囲で維持（templateId 経路は legacy） |
| 旧 7 ステージ | **legacy のまま**。自動移行しない |
| `skill-finalization-table.md` | 移行元正本 **にしない** |

### 12.2 互換戦略の比較

| 方式 | メリット | デメリット |
| ---- | -------- | ---------- |
| **読み込み時 normalize** | 旧ファイルを触らず dev 継続可 | 実行時分岐が増え、テストが複雑 |
| **一括 migration** | 実行時が単純 | 旧データ全面変換コスト、誤変換リスク |
| **新規少数データを別作成（推奨）** | R5 縦切りが最短。legacy と並走 | 二系統が一時共存 |

**R5 推奨:** 新規少数 Stage + 少数兵科 + 新 module JSON を **別ファイルまたは flavor 分離** で作成。legacy は `BUILD_FLAVOR` / 読み込み分岐で残す。

### 12.3 自動変換を前提にしないもの

- `active → module` 一括変換
- `passive → operation passive` 一括変換
- 旧 7 ステージの機械的移植

---

## 13. エディタ責務

R4 では **画面責務と推奨方向のみ**。実装は R9。

### 13.1 クラスエディタ

**編集する:** 基礎ステ、攻撃間隔（秒）、ロール、前衛 / 後衛、固定優先ターゲット、ダメージ属性、使用可能戦闘方式（2 件参照）、使用可能作戦内パッシブ pool、表示説明。

**編集しない:** active 1〜4、passive 1〜4、`learnedAt`、`growthTier`、敵 scale、Hit 列。

現行 `ClassEditorStep` は Lv 成長・SPD Tier・スキル枠が中心 → **新 ClassEditor へ置換方向**（R9）。

### 13.2 戦闘方式エディタ

**編集する:** 対応兵科、表示名、行動種別、Hit 列、係数、対象数、分配、target shape、射程、停止位置、攻撃間隔上書き、効果、説明プレビュー。

**旧 SkillEditorStep との関係 — 比較:**

| 案 | 概要 | 推奨度 |
| -- | ---- | ------ |
| **A. SkillEditorStep を CombatModuleEditor へ改修** | effect / target UI の資産再利用。active/passive タブを削除 | **推奨** — Hit / target / effect 編集の実績が最大 |
| B. 新規 CombatModuleEditor | 旧 UI 負債なし | コスト大 |
| C. 旧 skill editor を legacy 専用残置 | migration 期間の安全策 | **併用** — A とセットで legacy データ編集用に残す |

旧 active / passive を **同一画面で共存させるかは未確定**。R9 では **方式専用画面** を優先。

### 13.3 パッシブエディタ（作戦内）

**編集する:** 対応兵科、効果、表示名、説明、重複可否候補、将来コスト欄、UI 分類。

**R8 まで全面実装不要。** R5 で必要なければ schema 定義のみ。

### 13.4 敵エディタ

Stage / Wave 内 `enemyGroups` 編集を **正** とする。

**編集する:** `classId`, `count`, 戦闘方式, パッシブ（任意）, scale, 配置 / 出現情報。

現行 `EnemyEditorStep`（`enemies.json` テンプレ）と `StageEnemyEditorStep` の責務重複を解消 → **Stage / Wave エディタへ統合**方向。テンプレはプリセット export 程度（§6.4）。

### 13.5 ステージ / Wave エディタ

**編集する:**

- Wave 追加 / 削除 / 並び替え
- Wave ごとの `enemyGroups`
- 敵戦闘方式・scale
- Wave 報酬 **候補**（R8 前は placeholder）
- プレビュー情報
- 作戦全体ルール **候補**

**R5 最小:** Stage + Wave 一覧 + `enemyGroups` + 敵 `selectedCombatModuleId` まで。

現行 `StageEnemyEditorStep` の単一 `enemyGroups` 編集を **Wave 一覧 UI へ統合**する方向。

---

## 14. editor API — 将来責務

endpoint 名・HTTP パスは **未確定**。

| バンドル | 責務 |
| -------- | ---- |
| class bundle | 読込 / 保存 / validate |
| combat module bundle | 読込 / 保存 / validate |
| passive bundle | 読込 / 保存 / validate |
| stage / wave bundle | 読込 / 保存 / validate / preview |
| 横断 | normalize、HMR 連携 |

### 14.1 現行 API の再利用 vs 廃止候補

| 現行（`editorApi.ts` 等） | 方向 |
| -------------------------- | ---- |
| `fetchClasses` / `saveClassBundle` | **改修再利用** — スキル枠削除、方式 pool 追加 |
| `fetchSkills` / skill draft 系 | **分割** — module bundle / legacy skill bundle |
| `savePresentationSkill` | **要検討** — VFX プレゼンは module に紐付け直し |
| `fetchEnemies` / `saveEnemyBundle` | **legacy 期間のみ** — 新正本は stage bundle |
| `fetchStages` / `saveStageBundle` / `validateStageDraftForSave` | **拡張再利用** — Wave 配列 + module 参照 |
| `validateClassDraftForSave`（growthTier 等） | **置換** — 新 validate |
| `createBalanceRowsFromClasses` / Lv10 試算 | **legacy** — Balance エディタ用 |
| `normalizeStageDraftForSave` | **拡張** — 直下 enemyGroups → Wave 包み |

---

## 15. テキスト整形（旧 `formatSkillText` 相当）

| 対象 | 整形内容 |
| ---- | -------- |
| 戦闘方式説明 | 行動種別、効果要約 |
| 数値表示 | Hit 数、対象数、射程、攻撃間隔（**秒**） |
| 効果 | ダメージ / 回復 / barrier 等（effect subset） |
| 作戦内パッシブ | 説明文（R8） |
| 敵プレビュー | class + 方式 + scale 要約 |

**新 UI 正本から外す:** 旧 active CD、Lv 習得表示、gauge 関連。

実装ファイル候補: `formatSkillText.ts` を **module 用に分岐または分割**（R5/R9）。R4 では責務定義のみ。

---

## 16. R5 最小縦切りに必要な最小 schema

### 16.1 必須

| データ / 状態 | 最小内容 |
| ------------- | -------- |
| 兵科 | 少数（2〜3 でも可）の基礎データ + 秒単位攻撃間隔 + 固定優先ターゲット + 固定属性 |
| 戦闘方式 | 各兵科 **2 方式** |
| 敵グループ | `classId`, `count`, `selectedCombatModuleId`, scale |
| Stage / Wave | 1 Stage、1〜2 Wave、`waves[].enemyGroups` |
| 味方編成 | 4 人、同一兵科禁止、方式選択済み |
| 作戦状態 | メモリ上。checkpoint 最小（同一 Wave 再戦用は R6/R7） |
| 戦闘 | Wave 開始時 Combatant 生成、module を通常行動として実行 |

### 16.2 後回し（R5 に含めない）

作戦内パッシブ実装、パッシブエディタ、作戦内リソース、恒久報酬、Save 統合、migration 完全対応、非 M1 兵科、旧データ全面変換、移動系効果、Wave 報酬、高度な特殊ルール、Wave 間準備 UI、倍速・リトライ UI、全面エディタ改修。

---

## 17. 推奨実装順（R5 以降）

R4 では **実装しない**。順序候補:

1. 新 schema の最小型（型 + JSON 例 1 セット）
2. 少数の新 class / module データ（手作業）
3. validate 最小（参照整合 + 編成ルール）
4. `BattleEngine` が module を通常行動として実行
5. 編成へ module 選択状態を追加
6. 敵 group へ module 指定 + spawn 接続
7. **単一 Wave** で動作確認
8. 複数 Wave + 作戦状態へ接続
9. エディタ最小（Stage Wave + module 参照）
10. legacy normalize / 読み込み分岐
11. Wave 間準備 UI（R6）
12. リトライ・倍速（R7）
13. 作戦内パッシブ（R8）
14. エディタ全面（R9）

**R5a（2026-07-12）で確定したサブ分割:** R5b（型+JSON+validate）→ R5c（実行）→ R5d（味方 module）→ R5e（敵 module）→ R5f（編成制限）→ R5g（統合テスト）。詳細は [current-task.md §47](../ai-handoff/current-task.md#47-r5a--現行実装調査と最小実装計画2026-07-12)。

**R5b（2026-07-12）確定:**

- 型: `CombatModuleDef` / `CombatModuleActionDef`（`src/battle/types.ts`）
- データ: `data/combat-modules/*.json`（4 兵科 × 2 方式）
- class 参照: `ClassPreset.combatModuleIds`（2 件 tuple）
- 秒単位: `attackIntervalSec`（正数 validate。旧 `attackSpeedTier` は legacy 維持）
- **R5c 推奨:** 初回攻撃 CD と継続周期の両方に `attackIntervalSec` を使用。旧 `trigger.value = 2` 秒を新方式初回 CD 正本にしない
- 合成: `synthesizeCombatModuleSkill.ts`（R5c で SkillExecutor 接続）

---

## 18. 保留事項（R4 完了時点）

| 項目 | 送り先 |
| ---- | ------ |
| 具体的 TypeScript 型名 | R5 |
| JSON ファイル分割（`classes.json` vs `modules/` 等） | R5 |
| module effect schema 詳細 | R5 試作 |
| passive effect schema 詳細 | R8 — 効果範囲 doc 確定 [§5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。内部フィールド名・migration は R8 実装前 |
| 作戦内パッシブの戦闘中表示・範囲プレースホルダ | **R8 doc 確定** — [combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針)、[battle-field.md §9](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針)、[§5.7 効果範囲](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。runtime 詳細は R8 実装前 |
| 範囲パッシブ正式 VFX | 試作成立後（presentation / VFX） |
| 既存 `SkillExecutor` 再利用範囲 | **R5a 確定** — 新 executor 不要。module → ActiveSkillDef 合成後 basic スロットで `tryExecute` 再利用（[current-task.md §47.9](../ai-handoff/current-task.md#479-skillexecutor-再利用判断)） |
| 旧 SkillEditor の最終存廃 | R9 |
| 敵テンプレ最終存廃 | R9 |
| legacy normalize 期間の長さ | R5〜R10 |
| Save schema（作戦外のみ） | R5 後 |
| operation state 所有者（GameSession 等） | R5 |
| checkpoint 実装方式（deep copy / 差分） | R5/R6 |
| 作戦内リソース | R8 |
| パッシブ取得 UI | R8 |
| Wave 報酬形式 | R8 |
| 非 M1 兵科データ | R10 前 |
| 移動系効果 | R8 候補再検討 |
| 方式ごと優先ターゲット override | 将来。初期は実装しない |
| Wave 数上限 | R10 |

---

## 関連ドキュメント

- [phase-roadmap.md](phase-roadmap.md) — R4 完了 → R5 最小縦切り
- [operation-loop.md](../spec/operation-loop.md) — 作戦 / 戦闘状態の上位ループ
- [classes-and-skills.md](../spec/classes-and-skills.md) — 兵科・方式・パッシブのゲームルール正本
- [combat.md](../spec/combat.md) — Attack / Hit・攻撃間隔
- [stats.md](../spec/stats.md) — 基礎ステ
- [progression.md](../spec/progression.md) — 進行 3 層
