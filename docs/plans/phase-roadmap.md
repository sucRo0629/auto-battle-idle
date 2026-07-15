# フェーズロードマップ

Hensei Only の開発フェーズ一覧。**2026-07-12 方針転換以降、本書の正本は R0〜R13** とする。ゲームルールの現行 spec は [spec](../spec/README.md) を参照するが、**旧仕様と新方針の差分は R1 以降の設計 Phase で順次 spec へ反映する**（本書では方針のみ記載）。

**直近目標:** システム縦切り（R5〜R11）の上に、**データ再設計で「ゲームとして遊べる試作」を成立**させる（R12）。その後に初めて「繰り返し遊びたいか」を評価する（R13）。正式画像・VFX・効果音・i18n・packaging・itch.io 公開は **R13 完了後**に再開する。

**現在地:** **R12d / R12e Backend（設計）完了**（試作 Stage 敵問題と必要能力導出を `operation-loop.md` §18 / §19 へ正本化）。公式次は **R12f**（兵科・CombatModule・作戦内パッシブへの分配）。ゲームとしての成立は **R12j** まで未達。反復評価は **R13**。詳細は [§R12](#r12--試作をゲームにするデータ再設計) / [current-task.md §103](../ai-handoff/current-task.md)。

---

## フェーズ完了の二層判定

各 R フェーズの完了条件は **Backend 完了** と **Player 完了** の二層で書く。詳細・例は [planning-rules.md §2](../ai-handoff/planning-rules.md#2-フェーズ完了条件の二層) を正本とする。

| 層 | 定義 |
| -- | ---- |
| **Backend 完了** | API、型、validate、engine、統合テストの縦切りが成立している |
| **Player 完了** | プレイヤーがゲーム画面上で新仕様を確認・利用できる |

Backend 完了だけの場合は「縦切り成立」「Backend 完了」と記録し、**「Phase 完了」とは書かない**。legacy 共存は移行中の実装手段として許容するが、新仕様の Player 完了条件には使用しない。「後で対応」「スコープ外」とする項目には、戻し先 Phase ID・Player 完了条件・触るファイル候補を併記する。

---

## 概要（R0〜R13）

| Phase | ゴール | Backend | Player | 状態 |
| ----- | ------ | ------- | ------ | ---- |
| **R0** | 方針転換の正本化 — 旧 M1 路線凍結、維持・廃止・再設計・保留の整理、legacy 扱い、新実装順の確定 | 完了 | 設計 Phase として完了 | **完了** |
| **R1** | 上位戦闘設計 — 戦闘方式、兵科責務、旧 active / gauge / level 廃止、Wave 方式選択、作戦内パッシブ方針 | 完了 | 設計 Phase として完了 | **完了** |
| **R2** | 詳細戦闘・兵科仕様 — 攻撃間隔、Attack / Hit、方式効果形状、各兵科 2 方式 | 完了 | 設計 Phase として完了 | **完了** |
| **R3** | Wave 作戦ループ — 初期準備 → Wave 戦闘 → Wave 間準備 → 次 Wave → 最終結果 | 完了 | 設計 Phase として完了 | **完了** |
| **R4** | データスキーマとエディタ設計 — class / combat module / passive / enemy group / stage-wave / operation state / validate / editor API / legacy 移行（**設計のみ**） | 完了 | 設計 Phase として完了 | **完了** |
| **R5** | 戦闘方式 runtime 縦切り — 少数兵科・各 2 方式・敵方式指定・同一兵科禁止・module 通常行動 | **完了** | R9.5a〜b 完了。出撃前方式選択の正式 UI は **R9.6** | **Backend 完了** |
| **R6** | 複数 Wave・OperationState — Wave 間準備、checkpoint、retry、複数 Wave spawn | **完了** | R9.5c で画面導線を確認（正式 作戦準備 UI は R9.6） | **Backend 完了** |
| **R7** | 反復プレイ — 倍速、Wave 再生 / 再試行、作戦最初からの再試行 | **完了** | 導線 Backend。反復評価は **R13** | **Backend 完了** |
| **R8** | 作戦内パッシブ — 取得・保持・効果縦切り、戦闘中表示、範囲プレースホルダ | **完了** | UI は R9.6-B。判断差の成立は **R12** | **Backend 完了** |
| **R9a** | authoring 骨格 — エディタ現状調査・タスク分割 | 完了 | 開発者向け確認済み | **完了** |
| **R9.5** | R5 Player completion / R10 preparation — legacy active 停止、HUD 攻撃間隔、統合確認 | **R9.5a〜c Backend 完了** | R9.5a〜b 完了。R9.5c は暫定 UI 縦切りのみ（正式 作戦準備 UI は **R9.6**） | **Backend 完了** |
| **R9b〜h / R9f** | 新仕様 authoring 完成 — Stage / Wave / 敵方式 / 作戦内パッシブ / validate / **効果範囲** / **class 方式 pool** / **Stage 新規作成** | **R9b〜h・R9f 完了**（§87〜93） | tooling 完了 | R9 Tooling 完了 |
| **R9.6** | 作戦準備 Player UI — CombatModule（R9.6-A）・作戦内パッシブ（R9.6-B）の選択（**試作・Player 完了用**。製品 polish ではない） | 完了（表示 metadata + 回帰） | **完了** | R9.5c Backend |
| **R10** | 新仕様 2 Wave 以上の試作と反復評価 — 「繰り返し遊びたいか」を判断 | **完了**（`r10_prototype` + 統合） | **構造のみ**（§95）。**遊べる試作 / 反復評価は未達** | 再判定 |
| **R11** | システム縦切り — 効果範囲新仕様・作戦専用パッシブ枠・資源/積み上げコスト・基礎ステ極端化 | **完了**（a〜d） | **システム Player のみ**。**ゲームとしてのプレイアビリティは未達** | 再判定 |
| **R12** | 試作をゲームにする — Stage 先行の敵問題設計 → 能力導出・分配 → データ実装 → 手元成立 | R12a〜e 設計完了 / R12f 未着手 | R12a〜e 設計 Phase 完了。ゲーム成立は **R12j** | **R12f へ** |
| **R13** | 反復評価 — 「繰り返し遊びたいか」を判断（本来の R10 評価） | **R12j 後** | **R12j 後** | 未着手 |

| R11 分割 | ゴール | 状態 |
| -------- | ------ | ---- |
| **R11a** | 効果範囲カテゴリ新仕様化（`pierce` / `multiLock` → §5.7。R5 modules 優先） | **完了**（effectRange + bridge） |
| **R11b** | R5 4 兵科の新仕様作戦内パッシブ候補（枠・専用 ID） | **完了**（各 3・専用 ID）。**効果データ再設計は R12f〜g** |
| **R11c** | 取得レベル基準コスト + 同一クラス積み上げ加重 + Wave 資源（約 6 人分×1〜2） | **完了**（grant 12）。**配分感の再調整は R12i** |
| **R11d** | R5 基礎ステ極端化 + `r10_prototype` 強度再調整 | **完了**（初回）。**成立線の再調整は R12i〜j** |

| R12 分割 | ゴール | 状態 |
| -------- | ------ | ---- |
| **R12a** | 敵問題・戦術目標・敗因の識別可能性を spec 正本化。Wave 勝利条件＝敵全滅（ゲームルール） | **完了** |
| **R12b** | **1 Wave 単位の敵問題設計**（成立条件・敵側戦術 3 分類の抽象構造） | **Backend 完了**（設計 Phase）。**Player 未達** |
| **R12c** | **作戦全体の敵問題**（Wave 間関係・編成変更・資源・汎用編成の扱い） | **Backend 完了** / **Player 完了**（設計 Phase） |
| **R12d** | 試作 Stage の**敵問題設計**（具体 Wave / 戦術。JSON 入力はしない） | **完了**（設計 Phase） |
| **R12e** | 敵問題から**必要能力・対処能力を導出** | **完了**（設計 Phase） |
| **R12f** | 必要能力を兵科・CombatModule・作戦内パッシブへ**分配**（設計） | 未着手 |
| **R12g** | class / module / passive の**データ再設計**（入力） | 未着手 |
| **R12h** | Stage / Wave **データ実装**（問題構造の JSON 化） | 未着手 |
| **R12i** | **数値強度調整**（scale / grant / stackStep / 基礎ステ等） | 未着手 |
| **R12j** | 手元プレイ成立ゲート — 「ゲームとして遊べる」（反復欲求の評価はしない） | 未着手 |

**順序の正本:** 敵問題定義 → 1 Wave → 作戦全体 → **具体 Stage の敵問題を先に** → 必要能力導出 → 兵科へ統合 → module / パッシブへ分配 → データ実装 → 数値調整 → 手元成立 → **R13**。

**旧番号メモ:** 旧 R12c（Stage / Wave データ再設計）→ **R12d（問題設計）+ R12h（データ実装）**。旧 R12d（手元ゲート）→ **R12j**。旧案の module / passive データ再設計 → **R12f（分配）+ R12g（データ）**。

**R13 完了後（順序再計画可）:** 兵科拡張、診断基盤再構築、**Stage 削除**、**戦場移動 legacy cleanup**（[battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)）、正式コンテンツ、UI 仕上げ、画像、**正式 VFX**（範囲パッシブ・**遠隔弾道 projectiles** 含む）、効果音、i18n、packaging、公開準備。

---

## 2026-07-15 再判定 — なぜ R10 / R11 Player 完了を取り消すか

R10 の目標は「試作として遊べる」こと、R11 の目標は「プレイアビリティまで成立」だった。実装・テスト上はループと数値枠が存在するが、**ゲームとして楽しめる水準には達していない**。

| 層 | 現状 | 誤って完了にしていたこと |
| -- | ---- | ------------------------ |
| システム | R5〜R11 の API・UI・catalog・2 Wave 導線は存在 | 「存在する」＝「遊べる」と記録した |
| データ | module / 作戦内パッシブ / 試作 Stage が、問題提示と複数解の材料になっていない | スケール調整・専用 ID 追加だけで R11 Player 完了とした |
| 評価 | 「繰り返し遊びたいか」より前の段階 | R10 §95.5 を構造 Yes で前進させた |

**具体ギャップ（試作 Stage）:**

- `r10_prototype` は Wave ごとに敵グループが違うが、**クリア後に別解を試す動機を生む問題設計になっていない**。
- 敵の提示する圧・方式・要求が薄いと、旧仕様の「1 度クリアしたら二度と遊ぶ意義がないステージ」と同型になる。
- 反復導線（R7）があっても、**同じ問題に対する複数の有効判断**が無ければ再挑戦性は成立しない。

**具体ギャップ（module / パッシブ）:**

- R11b は専用 ID と catalog 接続まで。**Wave 問題に対して挙動差が効くデータ再設計は未完了**。
- 資源・積み上げコストの仕組み（R11c）はあっても、候補効果が「広く薄く vs 深掘り」を意味ある判断にしていない。

**再判定の帰結:**

- R10 = **Backend + 構造 Player のみ**（遊べる試作・反復評価は未達）
- R11 = **システム縦切り完了**（ゲームとしてのプレイアビリティは未達）
- 「繰り返し遊びたいか」の評価は **R13** に移す。R12 完了前に行わない
- 正式コンテンツ・presentation・公開準備は **R13 完了後**

---

## 開発目標と凍結した旧方針

### 新しい開発目標

- 旧 **M1 体験版公開中心**のロードマップ（旧 Phase 6〜9 / Release M1）を**凍結**する。
- 既存 **7 体験版ステージ**（`data/stages-demo.json` の `demo_ch1_01`〜`07`）および **`data/stages.json` の legacy 5 件**は、新仕様へそのまま移行せず **legacy / reference** 扱いとする。
- 既存の**診断基盤**（例: [balance-diagnostics.md](../dev/balance-diagnostics.md)）は、再利用できる仕組みだけ残し、新仕様向けに**後から再構築**する。

### 凍結した旧 Release / Phase 路線

| 凍結対象 | 内容 |
| -------- | ---- |
| **Release M1** | itch.io 体験版公開、Lv1 キャップ、8 クラス、Phase 7 導線完成 → Phase 4e → Phase 8 → Phase 9 |
| **Release M2** | 初版 Chapter 1 本編、13 クラス、Phase 10 |
| **旧 Phase 6〜9 以降の優先順** | 6c バランス、7 残タスク（トップ / リザルト / 体験版終了）、presentation、packaging |
| **旧 Phase 10〜14** | 本編拡張、印術師・法陣師、ローグ、解法評価メタ — **新試作成立まで着手しない** |

旧 Phase 1〜4 の**実装済みコード資産**（戦闘コア、JSON 駆動、編成 UI 等）は残るが、**今後の設計・実装順の正本ではない**。

---

## 廃止・再設計・保留（R0 で整理）

### 旧スキル・成長仕様（廃止方向）

次は新仕様では採用しない。現行 spec / 実装との差分は R1〜R2 で doc に反映する。

- active スキル最大 4 枠
- passive スキル最大 4 枠
- 戦闘スキルゲージ
- 習得済み active の自動発動
- Lv0 / Lv10 / Lv20 によるスキル解放
- レベルによるステータス成長
- EXP
- スキル装備枠
- [skill-finalization-table.md](./skill-finalization-table.md) を**今後の実装計画の正本**にすること

**[skill-finalization-table.md](./skill-finalization-table.md)** は正本から外し、**旧クラス役割・旧スキル案を参照する legacy 資料**としてのみ扱う。

### 戦闘方式（新設計の核）

- 各**兵科**は Wave ごとに **2 つの「戦闘方式」**から 1 つを選択する。
- プレイヤー向け UI 表記は **「戦闘方式」**。内部実装では **`module` 系名称**を候補とする。
- **「単体方式 / 複数方式」**を全兵科共通の分類にはしない。各兵科がそれぞれ異なる 2 種類の攻撃・回復・防護方法を持つ。
- 戦闘方式は、射程、停止位置、移動方法、対象数、Hit 構造、効果範囲、攻撃・回復・防護内容などを変更できる設計候補とする。
- **個別兵科の具体的な戦闘方式は R0 では未確定**（R2 で詳細化）。
- **優先ターゲット**は当面兵科ごとに固定し、戦闘方式では変更しない。
- **ダメージ属性・基本ロール**は原則兵科側に固定する。

### 編成

- 味方は **4 人編成**を維持する。
- **同一兵科を味方編成に複数入れることは当面禁止**（Wave 間再編成でも同制約）。
- 敵側は同一兵科を複数配置できる。

### 攻撃間隔と Hit

- 現在の「遅い〜早い」の**攻撃速度 Tier 表現を廃止**する。
- 通常攻撃の周期を、秒単位の **「攻撃間隔」**として扱う（UI: `攻撃間隔: X秒`）。
- **攻撃間隔**は兵科側の基礎値。**Hit 数・Hit 係数・対象数・攻撃形状**は戦闘方式側の責務。
- 兵科本体に固定 Hit 構造を持たせる前提にはしない。**Attack と Hit は別概念**として R2 以降の spec で整理する。

### 魔術師

- **RES 無視は廃止方向**。
- 複雑な耐性無視・追加補正を持たせず、**単純な魔法攻撃兵科**として再設計。
- 種火・熾火の扱いや具体戦闘方式は **R2 以降**で判断（R0 未確定）。

### 作戦内パッシブ

- 作戦中に**リソース**を使用してパッシブを取得する。
- プレイヤーが**兵科と取得パッシブを直接指定**する（ランダム 3 択報酬にしない）。
- 取得パッシブは作戦中維持し、**作戦終了時にリセット**。
- 取得上限・必要コスト・兵科ごとの候補数などは**未確定**。

### 移動系メカニクス（保留）

戦場横幅拡大により、移動阻害・移動速度差・ノックバック・特殊移動・射程差が有効になる**可能性**はあるが、**現段階では実装対象にしない**。最小縦切り（R5）の必須仕様にも含めない。

- 鉄衛士の周囲移動速度低下など、具体的な移動系効果は**未確定アイデア**。
- **R8（作戦内パッシブ）設計時に再検討**する保留事項として記録する。
- 現段階では通常移動・ターゲット挙動を複雑化させない。

### Wave 作戦ループ

```
初期準備 → Wave 戦闘 → Wave 間準備 → 次 Wave → … → 最終結果
```

**Wave 間準備**（将来）で扱う候補: 次 Wave 敵情報確認、編成変更、戦闘方式変更、作戦内パッシブ取得、出撃確定。

現行実装の**自動 Wave 遷移**には Wave 間準備が存在しないため、**新しいゲーム状態または上位進行状態**が必要（R3 / R6）。

### リトライ・速度変更（後続実装候補 — R7）

具体仕様は未確定。ロードマップに含める候補:

- 戦闘速度 1 倍 / 2 倍 / 4 倍
- 同じ設定で現在 Wave を再生
- 現在 Wave を準備段階からやり直す
- ステージ（作戦）を最初からやり直す
- 確認ダイアログを挟まない

### 作戦途中セーブ

- **最初の縦切り（R5）では作戦途中セーブを実装しない**。
- 作戦中の取得パッシブ・リソース・クリア済み Wave 等は**メモリ上**で保持する前提。
- 中断復帰は**試作成立後**に再検討。

### エディタ（新仕様への改修対象 — 実装は R9）

設計対象（R4 完了）: [combat-data-schema-refactor.md](combat-data-schema-refactor.md) — クラス、戦闘方式、作戦内パッシブ、敵グループ、Stage / Wave、validate、normalize、editor API、テキスト整形、legacy 移行方針。

対象エディタ: クラスエディタ、スキル / **戦闘方式**エディタ、敵エディタ、ステージ / Wave エディタ。

---

## R0 — 方針転換の正本化（完了）

**ゴール:** 旧 M1 公開ロードマップの凍結、維持・廃止・再設計・保留の整理、legacy 文書・legacy ステージの扱い、新実装順（R1〜R10）の確定。

| 項目 | 結果 |
| ---- | ---- |
| 旧 M1 / Phase 6〜9 路線 | 凍結 |
| 新ロードマップ | R0〜R10 を本書に正本化 |
| legacy ステージ | `stages-demo.json`（7 件）、`stages.json` legacy 5 件 — reference のみ |
| legacy 文書 | [skill-finalization-table.md](./skill-finalization-table.md) — 旧スキル案参照用。実装計画の正本から除外 |
| 診断基盤 | 再利用可能部分のみ温存。新仕様向け再構築は試作成立後 |
| spec / code | **R0 では未変更**（R1 以降で doc → 実装の順） |

---

## R1 — 上位戦闘設計

**対象 doc 候補:** [combat-architecture.md](../combat-architecture.md)、[system-mechanics.md](../system-mechanics.md)、[class-philosophy.md](../class-philosophy.md)

**内容:**

- 戦闘方式の定義（UI「戦闘方式」/ 内部 `module` 候補）
- 兵科本体と戦闘方式の責務分離
- active / gauge / level 成長の廃止方針の doc 反映
- Wave ごとの方式選択
- 作戦内パッシブの上位方針
- 優先ターゲット固定方針
- 同一兵科禁止（味方）の上位ルール

**着手物:** 上記 doc の更新（**spec 本文の詳細数値は R2 へ**）。

---

## R2 — 詳細戦闘・兵科仕様

**対象 doc 候補:** [combat.md](../spec/combat.md)、[stats.md](../spec/stats.md)、[classes-and-skills.md](../spec/classes-and-skills.md)

**内容:**

- 攻撃間隔（秒単位）、Attack / Hit の分離
- 戦闘方式の効果範囲（射程、停止位置、Hit 構造、範囲形式・適用方式等）
- Wave 間の状態リセット
- DoT、一時バフ / デバフ整理
- 各兵科の 2 方式（**兵科・数値はこの Phase で初めて具体化。R0 では未確定**）
- 作戦内パッシブ候補の列挙

**保留:** 移動阻害・移動速度差・ノックバック等の移動系パッシブ — 必須仕様にせず、R8 再検討候補として doc に明記。

---

## R3 — Wave 作戦ループ（完了）

**対象 doc:** [operation-loop.md](../spec/operation-loop.md)（新規）、[battle-field.md](../spec/battle-field.md)、[progression.md](../spec/progression.md)

**確定内容:**

- 作戦状態 / 戦闘状態の分離、混在禁止原則
- 上位ループ: 初期準備 → Wave 戦闘 → Wave 終了 → Wave 間準備 → … → 作戦結果
- Wave 間 HP **全回復**（各 Wave を独立編成問題として扱う）
- 戦闘方式は次 Wave へ **保持**（準備画面で変更可）
- Wave 開始チェックポイント（出撃確定時点）
- 3 種リトライ（同設定再戦 / 準備へ戻る / 作戦最初から）— R7 実装接続
- 作戦途中セーブ **なし**
- 旧線形 stage progression を legacy 化
- legacy BattlePhase 自動 Wave 遷移を battle-field に分離記載

**production code / JSON / test / editor:** 未変更。

---

## R4 — データスキーマとエディタ設計（完了）

**対象 doc:** [combat-data-schema-refactor.md](combat-data-schema-refactor.md)（新規）

**ゴール:** 新データ形状とエディタ責務を **設計で先に固定** する。**R4 では設計のみ** — production 実装・全面エディタ実装には進まない。実装は **R5**（最小縦切り）〜 **R9**（エディタ）。

**確定内容（要約）:**

- 兵科 / 戦闘方式 / 作戦内パッシブ / 敵グループ / Stage-Wave / 作戦状態 / Wave 戦闘状態の **責務分離**
- 味方同一兵科禁止、敵は `count` 複数可。敵 scale はグループ側
- 新 Stage 正本: `waves[].enemyGroups`。直下 `enemyGroups` は legacy 省略記法
- 作戦状態はメモリのみ（R5）。checkpoint は作戦復元用、BattleEngine 完全コピーではない
- validate 層（マスタ / Stage / 編成 / 作戦状態）、normalize / migration 方針（新規少数データ作成を推奨）
- エディタ責務分離。SkillEditorStep → CombatModuleEditor 改修を **推奨案**
- R5 最小 schema の必須 / 後回し一覧

**production code / JSON / test / editor:** 未変更。

---

## R5 — 戦闘方式 runtime 縦切り

**ゴール:** **少数兵科**だけで、新戦闘方式による戦闘を Backend 縦切りとして成立させる。

### Backend 完了（R5b〜g 成立済み）

- 戦闘方式の最小型・データ・validate
- module から通常行動定義への接続
- R5 対象 4 兵科それぞれの 2 方式
- 味方・敵の方式選択
- 味方同一兵科禁止
- module 通常行動の engine 接続

したがって R5 は **Backend 完了** として維持する。R5 単独を「Phase 完了」とは記載しない。

### Player 未達（R9.5 へ割当）

R5 実装時点では未達であり、**R9.5a〜c** で解消する。

| 項目 | 戻し先 |
| ---- | ------ |
| module 兵科で legacy active を発動させない | **R9.5a** |
| module 兵科の味方 HUD から legacy 2×2 gauge を除去する | **R9.5b** |
| 味方 HUD に攻撃間隔を表示する | **R9.5b** |
| 出撃前編成で戦闘方式を選択する（正式 Player UI） | **R9.6**（R9.5c は暫定 combobox 配線のみ） |

`learnedActiveIds=[]` のテスト fixture だけでは Player 完了にならない。

**スコープ外（R5 に含めない）:** 移動阻害、作戦内パッシブ、全面エディタ改修、legacy 全面移行、Wave 間準備 UI、作戦途中セーブ、倍速・リトライ、Wave 報酬、Save 統合。

### R5 サブフェーズ（R5a 調査で確定 — すべて Backend 完了）

| サブ | 内容 | 状態 |
| ---- | ---- | ---- |
| **R5a** | 現行実装調査・最小実装計画 | **完了** — [current-task.md §47](../ai-handoff/current-task.md#47-r5a--現行実装調査と最小実装計画2026-07-12) |
| **R5b** | 最小型 + 新データ + 新 validate | **完了** — §48 |
| **R5c** | 通常行動実行（module → SkillExecutor） | **完了** — §49 |
| **R5d** | 味方方式選択（Save 非統合） | **完了** — §51 |
| **R5e** | 敵 group module 指定 | **完了** — §52 |
| **R5f** | 編成制限（味方 classId 重複禁止） | **完了** — §53 |
| **R5g** | 統合テスト（4 兵科 × 2 方式・1 Wave） | **完了** — §54 |

---

## R6 — Wave 間準備

- 自動 Wave 進行の停止
- **WavePreparation**（仮称）状態
- 編成変更、戦闘方式変更
- Wave 開始、Wave 状態リセット
- チェックポイント（再試行の前提）

**R6a 調査完了（2026-07-12）:** [current-task.md §56](../ai-handoff/current-task.md#56-r6a--wave-遷移状態寿命の調査2026-07-12)。現行は味方 Combatant を wave 間再利用・自動 `tickWaveExitMarch` → `beginWaveAnnouncement`。停止の最小挿入点は `tickWaveExitMarch` 完了直前。

### R6 実装分割（依存順・handoff §56.11）

| ID | 内容 | 手動確認 |
|----|------|----------|
| **R6b** | Wave 終了停止 + 仮次 Wave 開始 API | **完了（§57）** — Wave1 クリア後停止、Debug「次Wave開始」 |
| **R6c** | OperationState 最小型（メモリ・wave index / clearedCount / module） | **完了（§58）** |
| **R6d** | Wave 状態リセット（HP/CC/CD/runtime）+ 次 Wave 敵生成 | **完了（§59）** — 次 Wave で味方再生成・全回復 |
| **R6e** | Wave 間準備 screen（formation 流用・編成/module gate） | **完了（§60）** — Wave 間のみ編成変更可 |
| **R6f** | checkpoint（出撃確定・メモリ snapshot） | **完了（§61）** — 出撃/次 Wave 確定時 deep snapshot |
| **R6g** | 複数 Wave `waves[].enemyGroups` spawn（schema 候補） | legacy multi-wave で先行可 |
| **R6h** | 最終 Wave → 作戦結果（`operationResult` 仮） | 最終 wave のみ結果画面 |
| **R6i** | retry 3 種（最小経路） | **完了（§67）** — GameSession retry API + debug 配線 |
| **R6j** | 統合テスト（2 wave + stop/resume） | **完了（§68）** — legacy stage `1` 縦切り自動テスト |

**次タスク:** **R7** — 反復プレイ（完了）

---

## R7 — 反復プレイ

- 倍速（1 / 2 / 4 倍）
- 現在 Wave 再生（= 同設定再戦 / R6i checkpoint）
- Wave 準備からの再試行
- 作戦最初からの再試行
- 確認ダイアログなし（方針 — [operation-loop.md §9](../spec/operation-loop.md#9-リトライ導線r7-接続)）

**R7a 調査完了（2026-07-12）:** [current-task.md §69](../ai-handoff/current-task.md#69-r7a--反復プレイ調査タスク分割2026-07-12-完了)。**R7b 完了（2026-07-12）:** [current-task.md §70](../ai-handoff/current-task.md#70-r7b--倍速-simulation2026-07-12-完了) — `GameSession` tick gate で 1/2/4 倍 + **最小 UI**（Pause 右隣 Speed ボタン。2026-07-13 追補）。**R7c 完了（2026-07-12）:** [current-task.md §71](../ai-handoff/current-task.md#71-r7c--敗北時-retry-正式導線2026-07-12-完了) — verify OFF 敗北で retry 3 種 UI・legacy auto-restart 廃止。**R7d 完了（2026-07-12）:** [current-task.md §72](../ai-handoff/current-task.md#72-r7d--wave-準備-retry--spec-整合2026-07-12-完了) — `wavePrep` から retry 3 種・formation suspend 往復。**R7e 完了（2026-07-12）:** [current-task.md §73](../ai-handoff/current-task.md#73-r7e--作戦結果後再戦--遷移統一2026-07-12-完了) — verify OFF 最終勝利で作戦結果 UI・rematch / stageSelect 導線。

### R7 実装分割（依存順・handoff §69.7）

| ID | 内容 | 手動確認 |
| ---- | ---- | -------- |
| **R7a** | 調査・4 タスク分割 | **完了（§69）** |
| **R7b** | 倍速 1 / 2 / 4 倍（`GameSession.tick` multiplier + 最小 UI） | **完了（§70）** — API + 最小 Speed ボタン + tick / wire テスト |
| **R7c** | 敗北時 retry 正式導線（release 含む・legacy defeat 置換） | **完了（§71）** — verify OFF 敗北で retry 3 種 |
| **R7d** | Wave 準備 retry + 「準備へ戻る」spec 整合（`wavePrep`） | **完了（§72）** — wavePrep retry 3 種・formation suspend |
| **R7e** | 作戦結果後再戦 + verify/release 勝利導線統一 | **完了（§73）** — `operationResult` → rematch / stageSelect |

**次タスク:** **R8** — 作戦内パッシブ（runtime 適用・戦闘中表示）。

---

## R8 — 作戦内パッシブ

**ゴール:** 作戦中に取得・維持するパッシブの **runtime 適用** と、戦況判断に必要な **戦闘中の視認性** を成立させる。

### コア機能

- 作戦内リソース
- 任意パッシブ取得（兵科 + パッシブ直接指定）
- 取得状態の作戦中保持
- Wave 再試行時の巻き戻し
- 敵側パッシブ設定
- **移動阻害等の保留アイデアをこの Phase で改めて検討**

### 戦闘中表示（R8 確定 — doc 反映済）

正本: [combat.md §作戦内パッシブの戦闘中表示](../spec/combat.md#作戦内パッシブの戦闘中表示r8-方針)、[battle-field.md §範囲系・オーラ系効果のフィールド表示](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針)。

**方針の要点（active 廃止による自動削減には依存しない）:**

| 効果種別 | HUD 状態アイコン | 備考 |
| -------- | ---------------- | ---- |
| 常時ステータス補正（作戦中ずっと有効） | **原則非表示** | 効果種別で表示対象を整理 |
| 条件付き発動（HP 閾値等、発動中かどうかが戦況判断に必要） | **発動中のみ表示** | |
| DoT / CC / 一時デバフ（残時間・解除確認が必要） | **従来どおり表示** | |
| Barrier（`barrierHp`） | **非表示** | HP バー上の残量表示が正本 |
| 範囲系・オーラ系 | **非表示**（対象全員へ同一アイコンを付けない） | フィールド上の範囲表示を基本とする |

### 範囲系パッシブ — runtime 判定とプレースホルダ範囲描画（R8 スコープ）

- 周囲の味方・敵など、一定範囲内の対象へ影響するパッシブは **runtime 判定 + プレースホルダ範囲描画** を R8 に含める
- **範囲内判定と表示範囲は同一の実行時データ** を参照し、別々の数値を持たせない
- 発生源死亡・無効化・範囲外移動時に **表示と効果が同期** して切り替わること
- 正式 VFX・演出素材の制作は **試作成立後の presentation / VFX フェーズ** へ送る
- R8 では **正式素材を待たず**、1 次元戦闘軸上の **帯・区間・境界線・起点マーカー** 等、判定と一致するプレースホルダを **必須** とする（2 次元 shape — 円・扇形・矩形 — は使わない）
- 正式 VFX 導入後も、位置依存効果であることが分かる **最低限の範囲表現** は残す方向

**1 次元効果範囲の用語・大カテゴリ統合・legacy 移行方針:** [combat-data-schema-refactor.md §5.7](../plans/combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)。範囲形式（単体 / 地点 N / 範囲 N / 周囲 N / 前方 N）と適用方式（即時 / 進行 / 持続 / 乱打）のプレースホルダ要件は [battle-field.md §9](../spec/battle-field.md#9-範囲系オーラ系効果のフィールド表示r8-方針) を正本とする。

**プレースホルダで最低限確認可能にすること:**

- 表示範囲と内部判定の一致
- 範囲内外の切り替え
- 発生源消滅時の解除
- 味方由来と敵由来の識別
- 複数範囲の重なり

**採用しない確定仕様:** 既存 status system へ範囲内対象全員を一時 status として付与する方式。**runtime 実装の詳細**（aura 解決の所有クラス、tick 更新タイミング等）は R8 実装前に判断する。

### R8 完了条件

- 常時パッシブが状態アイコンを無駄に占有しない
- 条件付き発動効果は **発動中のみ** 確認できる
- Barrier は **HP バー表示のみ**（状態アイコンなし）
- 範囲パッシブは **プレースホルダ区間表示** で判定範囲を確認できる
- **表示範囲と実際の効果対象が一致する** テストまたは診断手段がある

### R8 実装分割（R8a 調査 — 2026-07-12）

**調査:** [current-task.md §74](../ai-handoff/current-task.md#74-r8a--作戦内パッシブ既存基盤調査タスク分割2026-07-12-完了)。production code 未変更。

| ID | 内容 | 手動確認 |
| -- | ---- | -------- |
| **R8a** | 既存基盤調査・5 タスク分割 | — **完了** |
| **R8b** | `OperationState` + checkpoint — slot 別取得パッシブ・`unspentResource` の snapshot / restore / retry 整合 | — **完了** |
| **R8c** | Wave 間準備 UI — passive 直接選択 + 固定コスト取得（**暫定 UI**。正式 Player UI は R9.6-B） | — **Backend 完了** |
| **R8d** | 戦闘開始注入 — operation passive → `learnedPassiveIds` マージ。**最小縦切り:** `df_guardian` + `df_guardian_passive_2` | — **完了** |
| **R8e** | 戦闘中表示 — 常時 stat 非表示・条件付きのみアイコン・HUD read-only 一覧 | — **完了** |
| **R8f** | 範囲系 runtime 判定 + 1 次元プレースホルダ描画 | — **完了** |

**次タスク:** **R9.5** — R5 Player completion / R10 preparation（公式次: **R9.5a**）。

**R8 スコープ外:** 移動阻害・ノックバック・特殊移動・射程差 passive、Lv / EXP 連動、M1 レベル機能、敵側パッシブ（縦切り後）、エディタ（R9）。

### 後続 VFX フェーズへ送るもの

- 範囲パッシブの **正式演出素材**（粒子・テクスチャ・アニメーション等）
- プレースホルダ区間表示の **ビジュアル仕上げ**（色・線種・識別の polish）
- 範囲内外切り替え時の **リッチなフィードバック**（最低限の範囲輪郭は R8 完了後も維持する方針）
- **遠隔弾道（projectile）** — 下記「遠隔弾道」節。着弾 VFX・scatter 各 hit の複数弾道・演出ラボ統合は本節の後続

### 遠隔弾道（projectile）— 試作成立後

現行 VFX（`VfxPlaybackManager`）は **固定アンカー + strip コマ送り** のみ。矢を actor→target へ飛ばすには **別 Manager** が必要（既存固定 VFX 経路に相乗りしない）。

| 項目 | 方針 |
| ---- | ---- |
| 画像 | **32×32 静止 1 コマ**。`src/assets/sprites/sheets/projectiles/{skillId}_projectile.png`（多 effect 時は `{skillId}_{effectIndex}_projectile.png`）。`sheets/vfx/`（64×64 strip）とは **フォルダ分離** |
| 再生 | 新規 **`ProjectilePlaybackManager`** — 毎 tick で世界座標を放物線補間し、接線方向へ `rotate` 描画 |
| データ | `SkillVfxDef.projectile`（`from` / `to` アンカー、`arcPeakPx`、`durationSec`、`spinFollowsArc`、`layer`）。通常攻撃は `traits.basicAttackVfx.projectile` |
| タイミング | `applyFrame` あり → `skillWindup` で発射、`durationSec` ≈ `resolveEffectApplyDelaySec`。なし → `skill` 命中イベントと同時に短い飛翔 |
| 着弾 | **後回し** — `_vfx_hit` / `hitVfx` は別フェーズ。試作 v1 は弾道のみ |
| 編集 | 演出ラボ + validate + `SkillEditorStep` / `classes.json` traits 同期（[classes-and-skills.md](../spec/classes-and-skills.md)・[sheets/README.md](../../src/assets/sprites/sheets/README.md) も同作業内） |

#### 実装方針

**採用しない案:** `VfxPlaybackManager` に軌道補間を足す（固定 VFX の責務と混ざり、64×64 strip 前提と衝突する）。旧 JSON `arc: true` の復活（validate 拒否済み）。

**レイヤ構成（単一経路）:**

```text
BattleEvent (skillWindup / skill)
  → resolveSkillPresentation / resolveEffectPresentation
  → playSkillProjectile（新規）
  → BattleCanvas.playSkillProjectile
  → ProjectilePlaybackManager.spawn / tick / draw
```

固定 VFX（`playSkillHitFeedback`）・body strip（`playSkillBody`）・戦闘ルール（`BattleEngine`）は **触らない**。弾道だけ `render/` に閉じる。

**追加・変更ファイル（目安）:**

| 区分 | パス | 内容 |
| ---- | ---- | ---- |
| 定数 | `src/render/spriteLayout.ts` | `PROJECTILE_CELL_SIZE = 32` |
| 型 | `src/battle/types.ts` | `ProjectileVfxDef` + `SkillVfxDef.projectile` |
| 読込 | `src/render/projectileAnimRegistry.ts` | `import.meta.glob('../assets/sprites/sheets/projectiles/*.png')`、`resolveProjectileAnimKey`（`vfxAnimRegistry` と同型） |
| 軌道 | `src/render/projectileTrajectory.ts` | 純関数: `t∈[0,1]` の位置 + 接線角 |
| 解決 | `src/render/projectilePlayback.ts` | 端点（`resolveVfxWorldPosition` 再利用）、duration 既定、`resolveProjectilePlayback` |
| 再生 | `src/render/ProjectilePlaybackManager.ts` | `spawn` / `tick` / `draw`（`ctx.rotate` + 32px 中央描画） |
| 接続 | `src/render/BattleCanvas.ts` | Manager 登録、`tick`/`draw`（behind → entities → front の front 層） |
| 接続 | `src/render/SpriteRegistry.ts` | `preloadProjectileAnims()` |
| 解決 | `src/render/skillVfx/resolveEffectPresentation.ts` | `EffectPresentation.projectile` |
| ヘルパ | `src/render/skillPresentation.ts` | `playSkillProjectile` |
| イベント | `src/ui/BattleView.ts` | `skillWindup` で発射；`applyDelaySec===0` の damage/dot のみ `skill` で発射（二重 spawn 禁止） |
| ラボ | `src/presentation/PresentationPreviewRunner.ts` | windup 相当の遅延後に弾道 spawn |
| validate | `src/battle/data/validateGameData.ts` | `parseProjectileVfx` を `parseSkillVfx` から呼ぶ |
| 編集 | `PresentationLabApp.ts` | `projectile.*` フィールド（arcPeakPx / durationSec / from / to） |
| テスト | `projectileTrajectory.test.ts` 等 | 放物線頂点・端点・角度；resolve の PNG フォールバック |
| docs | `sheets/README.md`、`classes-and-skills.md` | 配置規約・JSON フィールド（本 roadmap は計画のみ） |

**JSON 形状（`ProjectileVfxDef`）:**

| フィールド | 既定 | 説明 |
| ---------- | ---- | ---- |
| `enabled` | 有効 | `false` で抑制 |
| `from` | `footActor` | 発射アンカー（既存 `VfxAnchor`） |
| `to` | `footTarget` | 着弾アンカー |
| `arcPeakPx` | `32` | 放物線の上げ量（canvas Y 下向き。`y -= arcPeakPx * 4t(1-t)`） |
| `durationSec` | 省略可 | 飛翔秒。省略時は `resolveEffectApplyDelaySec`、それも 0 なら `0.25` |
| `spinFollowsArc` | `true` | 接線方向回転。`false` は発射→着弾の固定角 |
| `layer` | `front` | `behind` / `front` |

PNG 解決: `resolveProjectileAnimKey(skillId, effectIndex)` — index 付き → 無 index（`hitVfx` と同順）。`projectile` JSON 省略でも PNG があれば `{}` で再生可。

**放物線・回転（`projectileTrajectory.ts`）:**

- 位置: `x = lerp(fromX, toX, t)`、`y = lerp(fromY, toY, t) - arcPeakPx * 4 * t * (1 - t)`
- 接線角（`spinFollowsArc`）: `atan2(dy/dt, dx/dt)`  where `dy/dt = (toY-fromY) - arcPeakPx * 4 * (1 - 2t)`
- 描画: 画像は **右向き（+X）** を正とし、32×32 中心を軌道上の点に合わせて `rotate`

**発火タイミング:**

| 条件 | 発射イベント | 飛翔時間 |
| ---- | ------------ | -------- |
| `effect.applyFrame` あり | `skillWindup`（既存。body strip 先出し） | `durationSec` 未指定なら `resolveEffectApplyDelaySec` |
| `applyFrame` なし + damage/dot | `skill` イベント | 既定 `0.25s` または JSON `durationSec` |
| `hitIndex > 0` | 各 hit ごとに独立 instance（instanceId に hitIndex 含む） | 同上 |

`skillWindup` 経路で既に spawn した場合、`skill` 側では **再 spawn しない**（`applyDelaySec > 0` をゲート）。

**初回データ（弓術士試作）:**

- `sheets/projectiles/at_ranger_basic_attack_projectile.png`（32×32 静止）
- `classes.json` `at_ranger.traits.basicAttackVfx.projectile`（`arcPeakPx` / `durationSec`）
- 任意: `at_ranger_basic_attack` に `applyFrame`（弓引き body は `sheets/skills/`、別アセット）

**実装順（推奨 PR 分割）:**

1. 型 + validate + registry + trajectory 単体テスト（描画なし）
2. `ProjectilePlaybackManager` + `BattleCanvas` + preload
3. `resolveEffectPresentation` + `playSkillProjectile` + `BattleView` 配線
4. 弓術士 PNG + class traits + 目視
5. 演出ラボ + editor フィールド + docs 同期

**完了条件（v1）:**

- 戦闘で矢 PNG が放物線に沿って移動・回転する（着弾 VFX なしでも可）
- `applyFrame` ありスキルで「引く → 飛ぶ → 着弾ダメ」のリズムがずれない
- 演出ラボと戦闘で同一 `resolveEffectPresentation` 経路
- validate が `projectile` を受理し、廃止 `arc` は引き続き拒否

**参照例（弓術士）:** `at_ranger_basic_attack_projectile.png` + `traits.basicAttackVfx.projectile` + 任意で basic `applyFrame`（弓引き body strip は `sheets/skills/`、弾とは別）。

**スコープ外（初回）:** 着弾 VFX、フィールド端貫通の弾道延長、`scatter` ヒットごとの独立弾道、旧 `arc: true`（廃止済み）の復活。

---

---

## R9.5 — R5 Player completion / R10 preparation

**目的:** R5〜R8 で成立した Backend 縦切りを、プレイヤーが新仕様だけで利用できる状態へ接続する。R9（authoring）の代替ではない。

**推奨順序:** **R9.5a → R9.5b → R9.5c → R9b〜f → R9.6（A→B）→ R10**。R9.5a と R9b は担当ファイルの衝突が少なければ技術的並行可だが、**公式進捗上は R9.5 を優先**する。

| ID | 内容 | Backend 完了条件 | Player 完了条件 | 依存 |
| -- | ---- | ---------------- | --------------- | ---- |
| **R9.5a** | module 兵科の legacy active runtime 停止 | **完了** — 4 兵科で legacy active cooldown を生成せず、`runUnitSkills` から発動しない | **完了** — 4 兵科を戦闘へ出しても legacy active が一度も発動しない | R5 |
| **R9.5b** | 味方 HUD 攻撃間隔表示 | **完了** — CombatModule 兵科の legacy 2×2 gauge を HUD から非表示（`hasCombatModuleBasic`）、戦闘中ステータスに攻撃間隔（秒）を表示。攻撃間隔は HUD 本体ではなく §7.1.1 ツールチップ内のみ | **完了** — 4 兵科に legacy 2×2 gauge がなく、攻撃間隔を読める | R9.5a |
| **R9.5c** | R5〜R8 Backend 縦切り + 暫定 UI 配線確認 | **完了** — 下記「Backend 完了維持」参照 | **部分完了のみ** — 統合 smoke・暫定 UI 配線確認。**正式 Player UI は未完了**（→ **R9.6**） | R9.5a、R6 |

**対象兵科（`R5_COMBAT_MODULE_CLASS_IDS`）:** `df_guardian`、`at_swordsman`、`at_sorcerer`、`sp_cleric`。別一覧を重複定義しない。

### R9.5c Backend 完了（維持）

以下は R9.5c で成立済みとする。

- CombatModule の Backend / runtime 配線
- party slot 単位の選択状態更新
- Wave 1 / 次 Wave への反映
- 作戦内パッシブの Backend 候補生成
- cost 判定
- resource 消費
- 次 Wave への passive 注入
- 作戦終了時のリセット
- DOM / 統合テストによる縦切り確認

### R9.5c Player 完了から取り下げた項目

以下は **正式 Player UI として未完了** とし、**R9.6** へ送る。

- 出撃前編成画面の正式な CombatModule 選択 UI
- Wave 間準備画面の正式な CombatModule 選択 UI
- Wave 間準備画面の正式な作戦内パッシブ選択 UI
- 候補の違いをプレイヤーが画面上で理解できる情報設計
- 1280×720 の実画面で成立するレイアウト
- 正式 UI に対する手動 Player 確認

### R9.5c 暫定 UI と正式 Player UI の区別

R9.5c で追加・改善した UI は **暫定 UI / 配線確認用 UI / Backend 縦切り確認 UI** である。**正式 Player UI ではない。** R9.5c の Player 完了根拠にしない。

| 画面 | 暫定 UI（R9.5c） | 正式 Player UI（R9.6） |
| ---- | ---------------- | ---------------------- |
| 出撃前編成（`SkillMenuPanel`） | combobox + 表示名 + description。内部 ID に近い select 操作 | R9.6-A — 候補比較・選択可否・理由表示 |
| Wave 間準備 module（`WavePrepScreenHost`） | 既存 UI + 配線確認 | R9.6-A — 出撃前と整合した正式 module 選択 |
| Wave 間準備 passive（`WavePrepScreenHost`） | 候補名・cost・短い description・取得済み表示 | R9.6-B — 効果対象・効果量・条件・状態区別の正式選択 |

単純な combobox、文字列一覧、cost・description の追記だけでは Player 完了扱いにしない。

### R9.5 Player 完了条件（現状）

| 項目 | 状態 | 担当 |
| ---- | ---- | ---- |
| legacy active が発動しない | **完了** | R9.5a |
| legacy 2×2 gauge が表示されない | **完了** | R9.5b |
| 攻撃間隔が表示される | **完了** | R9.5b |
| 2 Wave 作戦の画面導線・統合 smoke（暫定 UI） | **完了** | R9.5c |
| 出撃前・Wave 間の**正式な** CombatModule 選択 UI | **未完了** | **R9.6-A** |
| Wave 間準備の**正式な**作戦内パッシブ選択 UI | **未完了** | **R9.6-B** |

R9.5 全体の Player 完了は **R9.6（A+B）完了後** とする。Backend テスト pass や暫定 combobox の配線確認だけでは R9.5 Player 完了としない。handoff 正本: [current-task.md §85〜86](../ai-handoff/current-task.md)。

**R9.5 スコープ外:** module 未対応兵科の legacy active 廃止、legacy passive 全面撤去、敵 HUD への同等表示、`stages-demo.json` 移行、i18n / VFX polish、**作戦準備の正式 Player UI**（→ R9.6）。

---

## R9 — 新仕様 authoring

R9 は新仕様の Stage、Wave、敵方式、作戦内パッシブをエディタで作成する Phase である。**Player 向け legacy 除去の代替ではない。** R9.5 Player 未完了（正式 作戦準備 UI = R9.6）の場合、R9 完了後も R10 Player へ進めない。

**R9a 調査完了（2026-07-13）:** [current-task.md §80](../ai-handoff/current-task.md#80-r9a--エディタ現状調査r9-分割2026-07-13-完了)。

### R9 実装分割（依存順）

| ID | 内容 | 手動 / 自動確認 |
| -- | ---- | --------------- |
| **R9a** | エディタ骨格・現状調査 | **完了（§80）** |
| **R9b** | Stage / Wave `enemyGroups[].selectedCombatModuleId` authoring | **完了（§87）** — `StageEnemyEditorStep` + `stageEnemyCombatModuleEditor` + save round-trip |
| **R9c** | 複数 Wave・`enemyGroups` 構造 authoring | **完了（§88）** — Wave 追加削除 UI + 2 Wave save round-trip |
| **R9d** | 作戦内パッシブ候補・付与条件 authoring | **完了（§89）** — `operation-passive-catalog.json` + editor GET/PUT + WavePrep 反映 |
| **R9e** | preview・validation・参照整合の統合 | **完了（§90）** — `authoringValidationPreview` + Stage/Catalog 警告 UI + client validate 拡張 |
| **R9g** | **効果範囲 authoring（試作前提）** — CombatModule editor + passive 範囲フィールド | **完了（§91）** — `GET/PUT /__editor/combat-modules` + effect-range UI + passive radius round-trip |
| **R9h** | **Class 方式 pool** — `combatModuleIds` 編集（R5 4 兵科） | **完了（§92）** — ClassEditorStep pool UI + class bundle save validate pass |
| **R9f** | authoring closure — **Stage 新規作成**、回帰テスト・spec 一致・R10 用作戦作成可能判定 | **完了（§93）** — `createDefaultStageDraft` + 新規 UI + identity validate / round-trip |

**次タスク（R9 系列）:** **R10** — 新仕様 2 Wave 以上の試作・反復評価。R9.6（A+B）完了。

### R9g — 効果範囲 authoring（試作前提）

**目的:** R10 試作用の戦闘方式・パッシブ範囲を **手編集 JSON なし** で設定できるようにする。設計上の新効果範囲用語（[combat-data-schema-refactor.md §5.7](combat-data-schema-refactor.md#57-効果範囲1次元戦闘--r8-doc-反映--2026-07-12)）を editor で編集可能にするが、**legacy `targetShape` 全面移行・JSON schema 改名は含めない**（R9f migration / R10 後）。

**背景:** R9a §80.1 で CombatModule 専用 UI が未接続のまま残置されていた。R10 は「方式の挙動差が認識できるか」を評価するため、試作ステージ制作前に module の効果範囲を editor から触れる必要がある。

**スコープ:**

| 領域 | 内容 |
| ---- | ---- |
| **CombatModule editor** | `GET/PUT /__editor/combat-modules` + 編集 UI。`attackIntervalSec`・`action`・**効果範囲**（§5.7 最小 — 単体 / 地点 N / 範囲 N / 周囲 N / 前方 N、対象数・Hit・適用方式の試作に必要な欄のみ）。R5 4 兵科 × 2 方式を対象 |
| **passive 範囲** | `SkillEditorStep`（クラス / 敵 bundle 内）に R8 範囲 passive フィールド（`buffAoeRadiusPx` 等）を追加。schema 変更と同一タスク |
| **横断** | `sanitize` / validate / `formatSkillText` preview の round-trip。表示用語は §5.7 に合わせる |

**スコープ外:** `ClassEditorStep` の Lv 成長・legacy スキル枠改修、legacy active 枠・Lv 習得 UI 削除、M1 外 class、legacy `targetShape` 一括削除、正式 VFX。**`combatModuleIds` 編集は R9h。**

**責務メモ（R4 §13）:** 範囲形状は `ClassEditorStep` ではなく **CombatModule editor**（方式）と **SkillEditorStep**（passive 定義）が担う。ユーザー向け「クラスエディタ」= クラスタブ全体を指す場合、本タスクはその **スキル / 方式側** に相当する。

**完了条件:**

- `data/combat-modules/*.json` を editor から読込・保存・再読込できる
- R5 4 兵科の既存 8 module を壊さず、効果範囲フィールドを 1 件以上編集して validate pass
- 作戦内パッシブ候補の範囲 passive（例: `buffAoeRadiusPx`）を `SkillEditorStep` から編集し save round-trip できる
- preview（R9e）と runtime の範囲解決が一致する

**触るファイル候補:** `vite-plugin-editor-api.ts`、`src/editor/editorApi.ts`、新規 `CombatModuleEditorStep.ts`（または `SkillEditorStep` 派生改修）、`skillEditorCombatFields.ts` / `effectTargetingFields.ts`、`src/battle/data/validateGameData.ts`、`editorApi.test.ts`。

**依存:** R9e の preview / validate 基盤の上（完了 §90）。**R9h・R9f（Stage 新規作成）・R10 試作ステージ制作の前提。**

### R9h — Class 方式 pool（`combatModuleIds`）

**目的:** 兵科（class）がプレイヤー / Stage に提供する **2 方式の参照**（`ClassPreset.combatModuleIds`）を、手編集 `classes.json` なしで設定できるようにする。

**背景:** R9g で module 本体を編集できるようになっても、class → module の紐付けが editor 未対応のままだと、新規 module 追加や試作用の差し替えが class bundle 保存経路で閉じない。R9a §80.6 で当初 R9 前提とされていたが、R9g（効果範囲）と責務が異なるため独立タスクとする。

**スコープ:**

| 領域 | 内容 |
| ---- | ---- |
| **ClassEditorStep**（または class bundle 保存 UI） | R5 4 兵科のみ `combatModuleIds` を **2 件必須**で編集。候補は `combatModuleRegistry` から同一 `classId` の module に限定 |
| **validate** | 未知 ID・件数不足・classId 不一致を editor save 時に拒否（既存 `validateGameData` `mode: 'editor'` を利用・拡張） |
| **read-only** | M1 外 class、`combatModuleIds` 未定義の legacy class は編集不可表示 |

**スコープ外:** module 本体の効果範囲編集（**R9g**）、legacy active / passive 枠、Lv 成長、M1 外 class の一括対応、Stage / enemyGroups 側の `selectedCombatModuleId`（**R9b 完了**）。

**完了条件:**

- R5 4 兵科の `combatModuleIds` を editor から変更し、`PUT /__editor/class-bundle` で `classes.json` に残る
- 保存後 `parseAndValidateGameDataJson({ mode: 'editor' })` が pass
- R9g で編集した module ID を pool に追加した場合、Stage `enemyGroups` / Player 候補生成（`stageEnemyCombatModuleEditor` 等）に反映される

**触るファイル候補:** `src/editor/ClassEditorStep.ts`、`src/editor/editorApi.ts`（`buildClassPresetFromDraft` / `validateClassDraftForSave`）、`src/editor/editorClassList.test.ts`、`editorApi.test.ts`。

**依存:** **R9g 完了後**（module 本体の editor 経路が先）。**R9f・R10 試作の前提**（class → module 参照の authoring 閉ループ）。

### Stage 一覧 — 追加・削除（現状ギャップ）

R9b〜c で **既存 stage の選択・Wave / enemyGroups 編集・保存** は成立。一方 **stage 自体の新規作成・削除** は未実装（R9a §80.1「Stage / Wave」不足欄）。

| 操作 | 現状 | 予定 Phase | 備考 |
| ---- | ---- | ---------- | ---- |
| 既存 stage の選択・編集・保存 | **完了**（R9b〜c） | — | `StageEnemyEditorStep` + `PUT /__editor/stages` |
| Wave 追加・削除 | **完了**（R9c） | — | stage **内**の wave。stage 自体の追加ではない |
| **Stage 新規作成** | **完了（R9f / §93）** | — | 新規 id・displayName・既定 waveEnemyGroups・validate・save round-trip |
| **Stage 削除** | **未実装** | **R10 以降（試作成立後）** | legacy stage（`1` / `2` / `test` 等）・テスト依存・`resolveKnownStageId` の `stages[0]` fallback との兼ね合い。**R9〜R10 では対象外**

**触るファイル候補（Stage 新規作成）:** `src/editor/editorApi.ts`（`createDefaultStageDraft` / `addStageToBundle` 等）、`src/editor/StageEnemyEditorStep.ts`（一覧 + 新規ボタン）、`src/editor/editorApi.test.ts` / `StageEnemyEditorStep.test.ts`。

**当面のフェーズ順:** **R10**。R9b〜**R9h**・**R9f**・**R9.6（A+B）** は完了。

### R9a §80.6 技術前提（R9 Backend 完了に必要・R9.5 と並行可）

R9a 調査で分割した以下は、上表 R9b〜h の authoring 前提として **R9 Backend 完了前に成立させる**。詳細・テスト条件は [current-task.md §80.6](../ai-handoff/current-task.md#806-r9-小タスク一覧) を参照。

| 項目 | 内容 |
| ---- | ---- |
| CombatModule editor + 効果範囲 | **R9g** — `GET/PUT /__editor/combat-modules` + 編集 UI（`attackIntervalSec` + `action` + §5.7 効果範囲） |
| Class `combatModuleIds` | **R9h** — R5 4 兵科のみ、2 件必須。`ClassEditorStep` + class bundle save |
| `operationPassiveCatalog` JSON 化 | **R9d 完了** — `data/operation-passive-catalog.json` + editor GET/PUT |

### Backend 完了

- 新仕様の 2 Wave 以上の作戦をエディタで**新規作成**・保存・再読込できる（**Stage 新規作成 UI は R9f 完了 §93**）
- 敵方式と作戦内パッシブ候補を設定できる
- **戦闘方式の効果範囲と passive 範囲を editor から設定できる**（**R9g 必須**）
- **class の方式 pool（`combatModuleIds`）を editor から設定できる**（**R9h 必須**）
- 不正参照を validate できる
- preview と runtime の解決結果が一致する

### Player 完了

- エディタで作った新作戦をゲームから開始できる
- 設定した Wave、敵方式、パッシブ候補がプレイ画面へ反映される
- 新仕様プレイ全体の完了判定は **R9.6 および R10** で行う

**R9 スコープ外:** M1 外 class の一括 editor 対応、`stages-demo.json` 編集切替、正式 VFX、legacy フィールド一括削除（R9f 後・別 PR 可）、**Stage 削除**（**R10 以降・試作成立後**）、**作戦準備の正式 Player UI**（→ R9.6）。

`stages-demo.json` は legacy reference として維持し、R9 の移行対象にしない。

---

## R9.6 — 作戦準備 Player UI

**状態:** **A+B Player 完了**（2026-07-14）。handoff: [current-task.md §94](../ai-handoff/current-task.md)。

**「正式」の意味:** 対 **暫定配線 UI（R9.5c）** の後継で、R10 評価に足る比較・選択ができる **試作 UI**。直近目標のプレースホルダー／新ループ試作の一部であり、**画像・VFX・i18n・最終ビジュアル polish・公開向け仕上げは含めない**（試作成立後）。

**目的:** CombatModule と作戦内パッシブを、プレイヤーが理解・比較して選択できる **Player 完了用の準備 UI（試作）** を実装する。R9b（Stage editor 敵設定 UI）とは分離する。

**背景:** R9.5c で暫定 UI による Backend / runtime 配線は完了したが、プレイヤーが候補を理解・比較して選択できる UI ではない。本 Phase で Player 完了とする（製品 UI 完成ではない）。

**サブフェーズ:**

| ID | 内容 | 対象画面 |
| -- | ---- | -------- |
| **R9.6-A** | CombatModule 正式選択 UI | 出撃前編成画面、Wave 間準備画面 |
| **R9.6-B** | 作戦内パッシブ正式選択 UI | Wave 間準備画面 |

R9.6-A と R9.6-B は実装上分割しても構わないが、**両方が完了するまで R9.6 Player 完了としない。**

---

### R9.6-A — CombatModule 正式選択 UI

#### 対象画面

- 出撃前の編成画面（`SkillMenuPanel` 等）
- Wave 間準備画面（`WavePrepScreenHost`）

#### 必須表示（各候補）

- 表示名
- 効果説明
- 戦闘挙動の違い
- 現在選択中かどうか
- 選択可能かどうか
- 選択できない場合の理由

内部 ID や短い description だけで候補の違いを判断させない。

#### 必須挙動

- party slot 単位で選択する
- 対象クラスまたは兵科に対応する候補だけを出す
- legacy active skill を混ぜない
- `classId` 変更時に不正な module を残さない
- 出撃前選択を Wave 1 に反映する
- Wave 間選択を次 Wave に反映する
- 現在選択中の module を明確にする

---

### R9.6-B — 作戦内パッシブ正式選択 UI

#### 対象画面

Wave 間準備画面。既存の候補名、cost、description、取得済み表示が存在していても、**正式 Player UI として十分か再評価**する。

#### 必須表示（各パッシブ候補）

- 表示名
- resource cost
- 現在の所持 resource
- 効果説明
- 効果対象
- 効果量
- 発動条件または適用条件
- 取得済みかどうか
- 取得可能かどうか
- 取得できない理由

「攻撃力上昇」などの抽象的な説明だけでなく、データ上取得可能な範囲で、何がどのように変化するかを表示する。例:

- 対象兵科 / 対象クラス
- 自分のみ／味方全体
- 基礎攻撃への補正、ダメージ軽減率、回復量補正
- 効果の重複可否
- 次 Wave のみか、作戦終了までか

存在しない情報を UI 用に推測して表示しない。表示に必要な構造化情報が Backend に存在しない場合は、R9.6 内で最小限の表示用 metadata 整備を検討する。

#### 選択状態（視覚的・文言的に区別）

- 未取得・取得可能
- 未取得・resource 不足
- 取得済み
- 条件不一致
- 選択対象外
- 候補なし

**色だけで状態を区別しない。**

#### 取得操作

- 取得前に cost と効果を確認できる
- 操作後に取得済み状態へ変化する
- resource 残量が更新される
- 二重取得できない
- resource 不足時は操作できない
- 取得したパッシブが次 Wave に反映される
- 作戦終了後にリセットされる

#### 情報設計

CombatModule 選択とパッシブ取得を同じ画面に置く場合も、意味が混ざらないようにセクションを明確に分ける。

- **CombatModule** — 戦闘方式の選択（R9.6-A）
- **作戦内パッシブ** — resource を消費する作戦中強化（R9.6-B）

両者を同じ select 要素や同じ一覧として扱わない。

---

### R9.6 UI 完了条件（Player）

以下をすべて満たした場合のみ **R9.6 Player 完了** とする。

- プレイヤーが内部 ID を知らなくても操作できる
- CombatModule 候補の違いを画面上で比較できる
- パッシブ候補の cost と具体的効果を画面上で確認できる
- 現在選択中・取得済み・取得不能の状態が明確
- resource 不足理由が分かる
- 選択／取得結果が次 Wave に反映される
- legacy active skill と混同しない
- CombatModule とパッシブの用途が混同されない
- キーボードまたは通常の UI 操作で利用できる
- 色以外でも状態を判別できる
- 1280×720 基準で主要情報が欠落しない
- スクロールが必要な場合も確定操作や resource 表示を見失わない
- 実画面による手動確認が完了している

Backend pass だけでは Player 完了としない。暫定 UI（R9.5c）での動作確認と、正式 UI 完了を区別する。

### R9.6 Backend 完了条件

R9.5c で Backend 縦切りは成立済み。R9.6 の Backend 作業は、正式 UI 実装に伴う表示用 metadata 整備（必要時）と、UI 連携の回帰テストを含む。

### テスト要件（最低限）

**CombatModule（R9.6-A）**

1. slot に対応する候補だけが表示される
2. 表示名と効果説明が表示される
3. 現在選択中の候補が分かる
4. 変更が party slot state に反映される
5. Wave 1 と次 Wave に反映される
6. `classId` 変更時に不正な module が残らない
7. legacy active skill が候補に出ない

**作戦内パッシブ（R9.6-B）**

8. 候補名、cost、効果説明が表示される
9. 現在 resource が表示される
10. resource が十分なら取得できる
11. resource 不足なら取得できず、理由が表示される
12. 取得時に resource が減少する
13. 取得済み状態へ変化する
14. 二重取得できない
15. 次 Wave に passive が注入される
16. 作戦終了・再挑戦で仕様どおりリセットされる
17. 候補なしの状態を正常に表示できる

**レイアウト・操作**

18. CombatModule とパッシブが別セクションとして識別できる
19. 主要操作が通常の DOM 操作で実行できる
20. 既存の Wave 間準備、編成、戦闘開始導線を壊さない

**触る候補:** `src/ui/SkillMenuPanel.ts`、`src/game/WavePrepScreenHost.ts`、`src/game/GameSession.ts`、`src/game/OperationState.ts`、`src/platform/menuHost.ts`、`docs/spec/party-formation-ui.md`

**スコープ外:** Stage editor 敵設定 UI（R9b）、CombatModule / passive データ authoring（R9）、legacy 兵科の module 移行、i18n / VFX polish。

---

## R10 — 新仕様 2 Wave 試作・反復評価

**状態:** **Backend + 構造 Player のみ**（2026-07-14）。**「遊べる試作」「繰り返し遊びたいか」評価は 2026-07-15 に未達へ再判定** → [R12](#r12--試作をゲームにするデータ再設計) / [R13](#r13--反復評価繰り返し遊びたいか)。handoff: [current-task.md §95](../ai-handoff/current-task.md#95-r10--新仕様-2-wave-試作反復評価2026-07-14)。

### 開始条件

**Backend 前提:**

- R5〜R8 の Backend 縦切りが維持されている
- R9b〜h により、新作戦を authoring・validate・preview できる（**効果範囲は R9g・class 方式 pool は R9h 完了が前提**）
- `stages.json` に R10 専用の新作戦を追加できる状態である
- 2 Wave 以上の OperationState・WavePrep・作戦内パッシブ経路が接続済みである

**Player 前提（[planning-rules.md §1](../ai-handoff/planning-rules.md#1-r10-の前提定義)）:**

- R9.5a 完了: 4 兵科で legacy active が発動しない
- R9.5b 完了: 4 兵科の HUD に legacy gauge がなく、攻撃間隔が表示される
- **R9.6 Player 完了（A+B）:** 出撃前・Wave 間で CombatModule を正式 UI から選択でき、作戦内パッシブを正式 UI から理解・取得できる（R9.5c の暫定 UI は Player 完了根拠にしない）

**R9.6 は R10 Player 評価前の必須依存。** CombatModule と作戦内パッシブは作戦中の主要な選択要素であるため、暫定 UI のままでは正式な Player 評価を行えない。

- Backend が動作するだけでは R10 Player 完了にならない
- 暫定 UI による動作確認と正式 UI による体験評価を分ける
- R9.6 完了後に R10 の正式な Player 評価を行う
- R10 の実装作業を先行できる場合でも、完了判定は R9.6 に依存する

### 目的

新仕様の構造が技術的に動くことではなく、以下を判断できる試作を作る。

> 編成、戦闘方式、Wave 間変更、作戦内パッシブを使って、同じ作戦を別の判断で繰り返し遊びたいと思えるか。

### 評価軸

- Wave1 の選択が Wave2 への準備判断につながるか
- 戦闘方式の変更が単なる倍率差ではなく、処理対象や挙動差として認識できるか
- 作戦内パッシブの取得が次 Wave の編成・方式判断に影響するか
- 初回失敗後に別案を試したくなるか
- legacy active / legacy gauge が新仕様の理解を混乱させていないか

テスト pass・データ追加・2 Wave 完走だけを R10 完了条件にしない。

### Backend 完了

- **達成（§95）:** 新仕様専用 2 Wave 作戦 `r10_prototype` がロード・完走できる
- OperationState、WavePrep、方式変更、パッシブ保持、作戦終了リセットが成立する（統合テスト）
- 主要状態遷移の自動テストが pass する（`r10PrototypeIntegration.test.ts`）

Backend 完了だけでは R10 完了としない → **評価記録は §95.5**。

### Player 完了

- **達成（構造）:** プレイヤーが新仕様だけで 2 Wave 以上を遊べる（ステージ選択 → `r10_prototype`）
- 出撃前と Wave 間の判断が戦闘結果へ反映される
- **CombatModule を正式 UI から理解・比較して選択できる**（R9.6-A）
- **作戦内パッシブを正式 UI から理解・取得できる**（R9.6-B）
- legacy active と legacy gauge が R5 4 兵科プレイへ混在しない（既定 party の `at_ranger` は差し替え推奨）
- 異なる編成・方式・パッシブで再挑戦できる（導線）
- 「繰り返し遊びたいか」について評価結果を記録できる（§95.5）— **※ 2026-07-15: 構造記録のみ。本番評価は R13**

### スコープ外

正式画像、VFX 最終版、効果音、i18n、packaging、itch.io 公開、非 M1 兵科の全面 module 移行、`stages-demo.json` 移行、Save を使った作戦途中再開、大量ステージ制作、メタ進行。

### 未確定事項（R10 着手前に doc または実装から確認）

- R10 新作戦で使用する作戦内パッシブの具体的候補数
- Wave 開始前に次 Wave 敵構成をどこまで表示するか
- 初期方式のデフォルト選択規則
- 攻撃間隔表示の表記形式
- R10 手動評価の記録先
- R9d の authoring 対象が Stage 定義か別 passive pool 定義か

未確定事項は一般 RPG の慣例で補完しない。

**次:** [R11](#r11--システム縦切り範囲パッシブ資源基礎ステ) → [R12](#r12--試作をゲームにするデータ再設計)（ゲーム成立）→ [R13](#r13--反復評価繰り返し遊びたいか)（評価）。

---

## R11 — システム縦切り（範囲・パッシブ枠・資源・基礎ステ）

**状態:** **システム縦切り完了**（2026-07-14）。**ゲームとしてのプレイアビリティ完了は取り消し**（2026-07-15）。handoff: [current-task.md §97](../ai-handoff/current-task.md)。

**達成したこと:** 効果範囲 bridge、作戦専用パッシブ ID / catalog、積み上げコスト式、基礎ステ極端化、`r10_prototype` の初回 scale。runtime と枠は試作評価の土台になる。

**達成していないこと:** 上記データを使って「編成・方式・パッシブで敵問題を解く」体験が成立していること。無強化でも惨敗すぎない／Wave 間判断が意味を持つ、は **R12j** で改めてゲートする。

### 確定方針（仕組み — 維持）

| 項目 | 内容 |
| ---- | ---- |
| 取得上限 | **なし** |
| 基本コスト | 取得レベル（`unlockLevel`）帯。Lv ゲートではなくコスト帯 |
| 同一クラス加重 | `cost = base(unlockLevel) + n × stackStep`（固定加算） |
| Wave 資源 | クリアごと **約 6 人分×1〜2 回**強化できる量（初期値。配分感は R12i） |
| 基礎ステ | **極端化方針は維持**（数値の再調整は R12i） |
| 効果範囲 | R11a で `pierce` / `multiLock` 等を §5.7 へ（完了） |

### R11a〜d（記録）

| ID | ゴール | 結果 |
| -- | ------ | ---- |
| **R11a** | 効果範囲の新仕様化 | **完了** — effectRange + bridge |
| **R11b** | 作戦専用パッシブ候補枠 | **完了** — 各 3・専用 ID。**効果の中身は R12f〜g** |
| **R11c** | Wave 資源と積み上げコスト | **完了** — 式と grant 12。**体感調整は R12i** |
| **R11d** | 基礎ステ極端化 + 初回強度 | **完了** — 初回。**成立線は R12i〜j** |

**次:** [R12](#r12--試作をゲームにするデータ再設計)。

---

## R12 — 試作をゲームにする（データ再設計）

**状態:** **R12d / R12e Backend（設計）完了**。公式次 **R12f**。ゲーム成立は **R12j** まで未達。反復評価は **R13**。handoff: [current-task.md §103](../ai-handoff/current-task.md)。

**全体ゴール:** 機能がある状態から、**プレースホルダー素材のままで「敵問題を編成・方式・パッシブで解く」ゲームとして成立**させる。製品 polish・正式画像は含めない。

**完了しないもの:** 「繰り返し遊びたいか」の主観評価（→ **R13**）。兵科拡張、診断本格、VFX、i18n、公開。

**順序（確定）:**

```
R12a 敵問題・戦術目標の基本定義（完了）
  → R12b 1 Wave の敵問題・敵側戦術（Backend 完了）
  → R12c 作戦全体の敵問題（Backend 完了）
  → R12d 試作 Stage の敵問題設計（完了）
  → R12e 必要能力・対処能力の導出（完了）
  → R12f 兵科・CombatModule・作戦内パッシブへの分配（設計）
  → R12g class / module / passive データ再設計
  → R12h Stage / Wave データ実装
  → R12i 数値強度調整
  → R12j 手元プレイ成立ゲート
  → R13 「繰り返し遊びたいか」
```

**責務分離の原則:** 敵問題設計・能力導出・分配設計・データ入力・数値調整・手元評価を **1 タスクにまとめない**。数値強度（R12i）は Stage データ実装（R12h）と分ける — 構造を入れてから強度を触る。

### R12a — 敵問題・戦術目標の基本定義（完了）

**状態:** **完了**（2026-07-15）。正本: [operation-loop.md §5.3.1 / §15](../spec/operation-loop.md#531-wave-勝利条件r12a)。

**確定内容（要約。詳細は spec）:**

| 項目 | 内容 |
| ---- | ---- |
| Wave 勝利条件 | **敵全滅**で固定。ゲームルールであり敵問題ではない |
| 敵問題 | 敵編成・敵戦闘方式・Wave 構成により戦術目標を提示し、達成方法の選択と代償を考えさせる構造 |
| 戦術目標 | 勝利達成のために満たす課題。設計用**内部概念**。通常プレイでは非表示。停滞時は攻略支援として段階提示可 |
| 最小属性 | 対象 / 目標状態 / 期限・成立時点（固有期限なし → Wave クリアまで） |
| 戦術目標数 | 1 以上。上限なし |
| 5 要素（二層） | 戦術目標単位と敵問題全体。目標・未達時敗北原因・有効な対処・代償・敗因の識別可能性 |
| 問題全体 | 目標同士の関係・支配的敗因・対処間競合・代償・全体の識別可能性 |
| 敗因の識別可能性 | 仮説→変更要素→再挑戦で検証。UI 表示ではない。推測可能性と検証可能性を含む |

**Backend / Player:** 設計 Phase として完了（JSON・runtime 変更なし）。

**スコープ外だったもの:** module/passive 数値、新 engine API、正式コンテンツ量産、1 Wave 抽象構造の詳細（→ R12b）。

### R12b — 1 Wave の敵問題と敵側戦術（Backend 完了 / Player 未達）

**状態:** **Backend 完了**（2026-07-15・設計 Phase）。**Player 未達**。正本: [operation-loop.md §16](../spec/operation-loop.md#16-1-wave-単位の敵問題r12b)。

**ゴール:** R12a の枠組みに沿い、**1 Wave 単位**の敵問題と敵側戦術の抽象構造を確定し spec へ正本化する。

**確定内容（要約。詳細は spec）:**

| 項目 | 内容 |
| ---- | ---- |
| 戦術目標の成立時点 | Wave 開始時点ですべて成立。途中追加は基本形に含めない |
| 事前予測可能性 | 敵編成・敵戦闘方式から合理的に予測可能（対処の一意特定は不要） |
| 複数目標 | 個別に記述・判定可能。期限・敗因・対処・代償・支配的敗因移動で相互作用可 |
| 敵数 | 最低 2 体以上。2 体以上だけでは不足。敵側戦術が必要。単独の敵は戦術目標を成立させない |
| 敵側戦術 | 保護 / 分担 / 相乗。1 Wave あたり少なくとも 1 つ |
| 成立条件 | §16.8 の 10 項目すべて |
| 結果差 | 勝利必須ではない。達成可否・時点・支配的敗因の変化等で検証 |
| 現行クラス | **依存しない**。分類採否の根拠にしない。具体能力は後続で再設計 |

**Backend 完了:** 設計 Phase — §16 が正本化され、成立条件・敵側戦術 3 分類が参照可能（production code / JSON 変更なし）。

**Player 完了:** **未達**（本 Phase のスコープ外）。ゲームとしてのプレイ成立は **R12j**。

**触るファイル（本 Phase）:** `docs/spec/operation-loop.md`、関連索引・handoff。コード / JSON は触らない。

**スコープ外:** 具体クラス再設計、CombatModule / 作戦内パッシブ設計、敵 AI、複数 Wave 作戦全体（→ R12c）、Stage 自動生成、UI、数値、`r10_prototype` 修正。

**次:** [R12c](#r12c--作戦全体の敵問題)。

### R12c — 作戦全体の敵問題（Backend 完了）

**状態:** **Backend 完了**（2026-07-15）。正本: [operation-loop.md §17](../spec/operation-loop.md#17-作戦全体の敵問題r12c)。

**ゴール:** 複数 Wave を通した**作戦全体**の敵問題と Wave 間関係を確定し、authoring 正本にする。

**確定内容（要約）:**

| 項目 | 内容 |
| ---- | ---- |
| 作戦全体の敵問題 | 各 Wave の敵問題を、Wave 間関係でつなぐ構造 |
| Wave 間関係 | **継続** / **転換** / **複合** / **対立**。一作戦に **1 種類以上** |
| Wave 数 | 2 Wave と 3 Wave 以上で成立基準は分けない。3 Wave 以上は 2 Wave より**高難度**として扱う |
| 事前開示 | 全 Wave の敵編成を事前開示。戦術目標は表示せず、敵編成から推測させる |
| 編成変更 | Wave 間では 4 枠すべて変更可。編成変更自体への制限・追加コストは設けない |
| 資源 | 作戦ポイント配分で集中と分散の代償を作る。原則 Wave クリア後付与。高難度 Stage では初期資源配布を許容 |
| 最終 Wave | 通常 Stage では原則、過去 Wave で提示した敵側戦術または戦術目標を統合した**複合問題** |
| 戦術目標の転換 | Wave ごとの完全転換を許容 |
| 敗因 | どの戦術目標を処理できなかったか識別できればよい |
| 万能編成 | 全 Stage を同一編成で攻略できる万能編成は**認めない** |
| 作戦内汎用編成 | 特定 Stage の全 Wave を同一編成で攻略するのは**許容**（やり込み・縛り・高度な別解） |
| Stage 先行 | **Stage の敵問題を先に作り、必要能力を後から導出**する |
| 能力継承 | 現行能力をある程度継承しつつ、必要な敵問題の能力を統合する |

**Backend 完了:** 設計 Phase — 上記が [operation-loop.md §17](../spec/operation-loop.md#17-作戦全体の敵問題r12c) へ正本化済。R12d 以降が参照できる（production code / JSON 変更なし）。

**Player 完了:** 設計 Phase として **完了**（画面変更なし）。実 Stage での確認は R12d 以降。

**触る候補（正本化時）:** `docs/spec/operation-loop.md`、`docs/spec/README.md`、必要なら `docs/enemy-design-concept.md`。

**スコープ外:** 具体 Stage の Wave 表（→ R12d）、class / module / passive の具体設計（→ R12e〜g）、JSON・数値・UI。

**次:** Backend 完了後 → [R12d](#r12d--試作-stage-の敵問題設計)。

### R12d — 試作 Stage の敵問題設計（完了）

**状態:** **完了**（2026-07-15・設計 Phase）。正本: [operation-loop.md §18](../spec/operation-loop.md#18-試作stageの敵問題r12d)。

**ゴール:** R12a〜c に沿い、試作作戦の **各 Wave の敵問題・敵側戦術・Wave 間関係** を具体設計する。**Stage 先行** — 能力や JSON より先に問題を書く。

**確定内容（要約。詳細は spec）:**

| 項目 | 内容 |
| ---- | ---- |
| 試作 Stage | **1 本のみ**。既存 `r10_prototype` 流用か後継かは後続実装で判断。JSON / Stage ID は未確定 |
| 中心判断 | 保護突破の集中と複数圧力への分担を、3 Wave でどう配分するか |
| Wave 数 | 3 Wave（Wave 数自体は難度条件にしない） |
| Wave 1 | 保護問題単独。鉄衛士（前衛）+ 療養師・魔術師（後衛）。通常解 A 鉄衛士先行 / B 療養師先行 |
| Wave 2 | 分担問題単独。双刃士（前衛）+ 魔術師（後衛）。通常解 A〜C。Wave 1 との関係は転換＋対立 |
| Wave 3 | Wave 1・2 の複合。鉄衛士・双刃士（前衛）+ 療養師・魔術師（後衛）。同一編成通しは高度な別解 |
| Wave 間関係 | 1→2: 転換＋対立 / 1・2→3: 複合＋継続＋対立 |
| 作戦ポイント | Wave クリア後の集中・分散判断と代償のみ。具体量は R12i |

**Backend 完了:** 設計 Phase — §18 正本化。production code / JSON 変更なし。

**Player 完了:** 設計 Phase として **完了**（画面・プレイ確認なし。手元成立は R12j）。

**スコープ外だったもの:** 必要能力の導出（→ R12e）、module/passive 分配（→ R12f）、データ実装（→ R12h）、数値調整（→ R12i）。

**次:** [R12e](#r12e--敵問題から必要能力対処能力を導出完了)。

### R12e — 敵問題から必要能力・対処能力を導出（完了）

**状態:** **完了**（2026-07-15・設計 Phase）。正本: [operation-loop.md §19](../spec/operation-loop.md#19-必要能力対処能力r12e)。

**ゴール:** R12d の敵問題に対し、**プレイヤー側に必要な対処能力**を導出する。兵科への正式割当・JSON 入力はしない。

**確定内容（要約。詳細は spec）:**

| 項目 | 内容 |
| ---- | ---- |
| 4 層 | 処理 / 到達 / 抑制 / 維持 |
| 能力カテゴリ | A 高耐久突破 / B1 支援役到達 / B2 攻撃中核到達 / C 即応処理 / D 抑制 / E 複数対象耐久 / F 中核決定力 / G 分担・切り替え |
| 必須 | B2・E・F・G |
| 条件付き必須 | A または B1（鉄衛士）/ C または D（双刃士） |
| 能力セット | A 正面突破型 / B 後方攻略型 / C 分担安定型 |
| 暫定対応 | 支援役到達↔双刃士、攻撃中核到達↔弓術士等。正式分配は R12f |

**Backend 完了:** 設計 Phase — §19 正本化。R12f で分配可能な粒度。production code / JSON 変更なし。

**Player 完了:** 設計 Phase として **完了**。

**スコープ外だったもの:** 兵科・module・passive への割当（→ R12f）、データ入力（→ R12g/h）。

**次:** [R12f](#r12f--必要能力を兵科combatmodule作戦内パッシブへ分配)。

### R12f — 必要能力を兵科・CombatModule・作戦内パッシブへ分配

**ゴール:** R12e の導出結果を、現行能力をある程度継承しつつ **兵科 / CombatModule / 作戦内パッシブ** に分配する（設計）。JSON の本書きは **R12g**。

**Backend 完了:**

- R5 対象 4 兵科（必要なら敵側含む）について、方式 A/B と作戦内パッシブへの役割割当が文書化されている
- 「どの問題のどの対処を、どの枠が担うか」が R12d/e と対応している

**Player 完了:** 設計 Phase として完了。

**スコープ外:** 効果数値の最終化（→ R12i）、Stage JSON（→ R12h）、実データファイルの全面書き換えは R12g で行う。

### R12g — class / module / passive データ再設計

**ゴール:** R12f の分配に従い、`classes` / CombatModule / 作戦内パッシブ候補の **データを再設計・入力**する。

**Backend 完了:**

- 再設計データが validate / 既存 runtime 経路で読める
- R12d の敵問題に必要な対処が、データ上の方式・パッシブ差として存在する（数値の最終強度は R12i）

**Player 完了:** 編成・WavePrep で候補の差が読める（成立の合否は R12j）。

**触る候補:** `data/classes.json`、CombatModule データ、`operation-passive-catalog.json`、関連 validate / editor。全文 Read 禁止（Grep・diff・関連 spec）。

**スコープ外:** Stage / Wave の敵配置本入力（→ R12h）、強度チューニング本作業（→ R12i）。

### R12h — Stage / Wave データ実装

**ゴール:** R12d の敵問題設計を、試作作戦の **`waves[].enemyGroups` + `selectedCombatModuleId` + 構成** として JSON に実装する。数値の本調整は最小限（動く状態）に留め、本調は **R12i**。

**Backend 完了:**

- `stages.json`（試作 ID）が R12d の Wave 構造・敵側戦術配置に追従する
- ステージ詳細で全 Wave の敵編成が事前に要約できる（既存 preview）
- 統合テストが新データで完走する

**Player 完了:** Wave 間の問題差が敵形から読める（合否ゲートは R12j）。

**触る候補:** `data/stages.json`、必要なら `formationHintJa`、統合テスト、[stage-selection-ui.md](../spec/stage-selection-ui.md)。

**スコープ外:** `stages-demo.json` 移行、多数作戦量産、Stage 削除 UI、強度の本調（→ R12i）。

### R12i — 数値強度調整

**ゴール:** R12g/h のデータ上で、scale / grant / stackStep / 基礎ステ等を調整し、手元成立の前提強度にする。**問題設計の書き換えはしない**（構造不足なら R12d へ戻す）。

**Backend 完了:** 必要パラメータの再調整と回帰。仕組みの新設はしない。

**Player 完了:** 強度として「触れる」水準（最終合否は R12j）。

**スコープ外:** 敵問題の再設計、新 module 効果の追加設計、反復欲求評価。

### R12j — 手元プレイ成立ゲート

**ゴール:** データ再設計後の試作を手元で遊び、**惨敗／即溶かし／判断無効**を解消する。ここまでを「試作プレイアビリティ」の Player 完了とする。

**Backend 完了:** ゲート不合格時の最小修正（強度は R12i、構造は R12d へ戻す判断を明示）。仕組みの新設はしない。

**Player 完了（すべて満たす）:**

1. 無強化〜最小判断でも **即全滅だけ** ではない（学べる敗却がある）
2. 適切な方式・パッシブ配分で **クリア可能**
3. Wave 間で「広く薄く」と「深掘り」が **資源上どちらも捨て難い**（R11c 方針の体感）
4. 兵科差がステと方式の両方で読める

**明示的に含めない:** 「もう一周したい」という感情の最終判定（→ R13）。

### R12 スコープ外（共通）

兵科拡張、診断基盤再構築、戦場移動 legacy cleanup、Stage 削除、正式画像 / VFX / 効果音、i18n、packaging、itch.io、作戦途中セーブ、ローグライク問題生成。

---

## R13 — 反復評価（「繰り返し遊びたいか」）

**状態:** **未着手**。**R12j Player 完了後**。

**目的:** 本来 R10 が担うはずだった評価を、**ゲームとして遊べる試作の上で**行う。

> 編成、戦闘方式、Wave 間変更、作戦内パッシブを使って、同じ作戦を別の判断で繰り返し遊びたいと思えるか。

**評価軸（R10 から継承）:**

- Wave1 の選択が Wave2 への準備判断につながるか
- 戦闘方式の変更が処理対象・挙動差として認識できるか
- 作戦内パッシブの取得が次 Wave の編成・方式判断に影響するか
- 初回失敗後に別案を試したくなるか
- legacy active / gauge が新仕様の理解を混乱させていないか

**Backend 完了:** 追加実装は原則不要。必要なら評価記録用の最小注記のみ。

**Player 完了:**

- 手元評価結果が handoff に記録されている
- テスト pass だけを完了根拠にしない（[tests-not-proof](../ai-handoff/planning-rules.md)）
- 評価が否定的なら、不足を R12 のどの層（敵問題 / 能力分配 / Stage データ / 強度 / 手元ゲート）へ戻すかを明示する

**スコープ外:** 正式コンテンツ量産、presentation、公開準備。

**次:** R13 完了後バックログ（兵科拡張 → 診断 → 戦場移動 cleanup → Stage 削除 → 正式コンテンツ → presentation → 公開）。

---

## 戦場移動 legacy cleanup（R13 完了後・未着手）

**目的:** Phase 3d で完了した接近・接敵 Intent 一本化の**残り** — X 方向デプロイ / 隊形 sort に残る `formationRow` 依存と、[battle-field.md](../spec/battle-field.md) §2.6 / §3.3 の spec 矛盾を解消する。

**着手条件:** **R12j で試作がゲームとして成立してから**（R9.5 / R12 と並行しない）。接近・隊形レイヤは `battleLayout` / `partyFormation` / 多数テストと接するため、データ再設計の安定後にまとめて扱う。

**詳細タスク:** [battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)

| 区分 | 内容 | 状態 |
| ---- | ---- | ---- |
| 前提 | 接近 Intent 一本化、`battleX` 単一正本、`formationRow` JSON 導出化、クラスエディタ旧 UI 削除 | **完了** |
| A | X デプロイ配置正本の確定（§3.3 vs §2.6） | 未着手 |
| B〜F | `partyFormation` / `battleLayout` / `resolveApproachBattleX` から X 方向 `formationRow` 排除、デッドコード削除、`CombatantState.formationRow` 去就、データ・テスト整理 | 未着手 |

**スコープ外:** R12 / R13 の Player 完了条件。新 combat module・operation passive・Wave authoring とは別 PR を推奨。

---

## 依存関係（R0〜R13）

```
R0（完了）
  ↓
R1〜R4（設計・完了）
  ↓
R5〜R8 Backend → R9 系列 → R9.6 → R10（構造のみ）
  ↓
R11a〜d システム縦切り（完了）
  ↓
R12a 敵問題・戦術目標（完了）
  ↓
R12b 1 Wave 敵問題・敵側戦術（Backend 完了 / Player 未達）
  ↓
R12c 作戦全体の敵問題（Backend 完了）
  ↓
R12d 試作 Stage の敵問題設計（完了）
  ↓
R12e 必要能力・対処能力の導出（完了）
  ↓
R12f 兵科・module・パッシブへの分配
  ↓
R12g class / module / passive データ再設計
  ↓
R12h Stage / Wave データ実装
  ↓
R12i 数値強度調整
  ↓
R12j 手元プレイ成立ゲート
  ↓
R13 反復評価「繰り返し遊びたいか」
  ↓
戦場移動 legacy cleanup（任意）
  ↓
（R13 完了後）コンテンツ・診断・presentation・公開
```

補足:

- R9.5a は R5 Backend に直接依存する
- R9.5c は R6 の OperationState にも依存する（暫定 module 配線。正式 Player UI は R9.6）
- R9d は R7〜R8 のパッシブ基盤に依存する
- **R9.6**・**R9b〜h / R9f** は完了（成立済み）
- R10 は構造のみ。**遊べる試作と反復評価は R12 / R13**
- **R11** はシステム縦切り完了。**プレイアビリティ Player は R12j**
- **公式次は R12f（兵科・CombatModule・作戦内パッシブへの分配）**。その後 R12g〜j → R13
- R12j まではゲームとしての成立未達。R13 までは反復評価しない
- **戦場移動 legacy cleanup** は R13 完了後を推奨 — [battle-movement-unification-remaining.md](battle-movement-unification-remaining.md)

R5 は R4 の設計（[combat-data-schema-refactor.md](combat-data-schema-refactor.md) §16 最小 schema）を前提に着手する。

---

## Legacy 資料・ステージ（reference のみ）

| 種別 | パス / 名称 | 扱い |
| ---- | ----------- | ---- |
| 体験版ステージ | `data/stages-demo.json` — `demo_ch1_01`〜`07`（7 件） | legacy / reference。新仕様へ移行しない |
| dev / smoke ステージ | `data/stages.json` — `test`, `ranged_test`, `1`, `2`, `eg_smoke` 等 | legacy / dev 用 |
| 旧スキル確定表 | [skill-finalization-table.md](./skill-finalization-table.md) | legacy 資料。実装計画の正本ではない |
| 旧 Phase 4 詳細 | [phase-4-roadmap.md](./phase-4-roadmap.md) | 完了済み作業の記録。M1 向け未完了項目（4e 等）は凍結 |
| 旧 M1 handoff | [current-task.md §5 以降](../ai-handoff/current-task.md) | 2026-07-12 以前の Phase 6/7 作業ログ。凍結 |

---

## Legacy ロードマップ（凍結 — 2026-07-12）

**旧 Phase 1〜14 / Release M1〜M2** 中心の計画は凍結した。以下は凍結時点のサマリのみ。詳細な旧 Phase 節は git 履歴（本ファイル 2026-07-12 改定前）を参照。

### 旧概要（凍結）

| Phase | 旧ゴール | 旧状態 |
| ----- | -------- | ------ |
| 1〜3 | 戦闘コア、放置 MVP、Lv スキル習得・4 枠 | 完了 |
| 4 | クラスマスタ、編成 UI（4a〜4d 完了、4e 凍結） | 4e 除き完了 |
| 5 | 演出 VFX 基盤 | 基盤のみ |
| 6 | M1 demo content（6b 完了、6c 未完了） | 凍結 |
| 7 | M1 demo app flow（7d〜7g 最小実装済み） | 凍結 |
| 8 | M1 presentation | 凍結 |
| 9 | M1 packaging / itch | 凍結 |
| 10〜14 | 本編、印術師・法陣師、ローグ、メタ | 凍結 |

### 旧 Release（凍結）

| Release | 旧ゴール |
| ------- | -------- |
| **M1** | itch.io 体験版、8 クラス、Chapter 1 前半 |
| **M2** | 有料初版、13 クラス、Chapter 1 全文 |
| **M3+** | Lv10/Lv20、印術師・法陣師、Steam 等 |

### 旧開発優先（凍結）

Phase 6 → 7 → 4e → 8 → 9 → itch.io 公開 → Phase 10（M2）— **すべて凍結**。

---

## 全フェーズ共通のスコープ外（継続）

アイテム、装備、ショップ、インベントリ、クリティカル、命中/回避ロール。
