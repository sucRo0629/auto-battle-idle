# M1 体験版 — バランス診断基盤

**正本:** 本ドキュメント（開発・運用向け。ゲーム仕様ではない）

**実装:** `src/battle/demoStageBalance.smoke.test.ts` / `demoStageBalance.puzzle.test.ts` / `demoStageAssassinCoverage.test.ts` / `src/battle/test/demoStageSim.harness.ts` / `src/battle/test/rangerTargetReport.ts` / `src/battle/test/assassinRoleReport.ts`

**データ:** `data/stages-demo.json`（`demo_ch1_01`〜`07`）

---

## 1. このドキュメントの目的

Phase 6c 以降、`data/stages-demo.json` の難易度調整と並行して追加された **smoke / puzzle テスト** と **診断ログ** は、将来「理由が分からないテスト」として削除・弱体化されやすい。

本ドキュメントは次を明文化する。

- 各テスト・ログが **何を保証し、何を保証しないか**
- 診断結果を **どう読み、どう stage scale 調整に使うか**
- M1 体験版の **対象範囲と非対象**

**前提（変更しない）**

- Hensei Only は **編成解法型** RPG。体験版デフォルト編成（`parties.json` demo: guardian / swordsman / cleric / ranger）は **序盤導入用** であり、中盤以降は baseline で勝てない設計が望ましい。
- 本基盤は **StageArchetype / StageRecipe / StageGenerator ではない**。既存 demo stage を手動シミュレーションする **開発用診断** である。
- クラスデータ・ステージデータの調整は、診断結果を見てから **最小限** に行う。魔法耐性表記は **REG ではなく RES**（`resScale`）を使う。

**スコープ（M1 / 体験版のみ）**

| 対象 | 内容 |
| ---- | ---- |
| ステージ | `demo_ch1_01`〜`07`（`stages-demo.json`） |
| プレイヤー側クラス | M1 で使える 8 クラス（下表） |
| 敵側クラス | 上記 demo stages に登場するクラス |
| 非対象 | M1 外 6 クラス、未実装クラス、将来の StageArchetype / StageRecipe / StageGenerator |

**M1 プレイヤー側 8 クラス**

`df_guardian` `df_paladin` `at_swordsman` `at_assassin` `at_ranger` `at_sorcerer` `sp_cleric` `sp_wardweaver`

**`at_ballista` の扱い**

- **ch1_07 クリア報酬**（プレイヤー解禁）。ch1_07 以前の **プレイヤー側活躍は未評価** とする。
- ch1_07 の **敵側**（`demo_ch1_07` の `at_ballista`）として機能しているかは確認対象に含めてよい。

class coverage diagnostics でも **全 15 クラスの完全網羅は求めない**。上記 M1 スコープ内で、demo stages を通じた活躍・未評価・敵としての機能を見る。

---

## 2. smoke test の役割

**ファイル:** `src/battle/demoStageBalance.smoke.test.ts`

**実行例:** `npm test -- src/battle/demoStageBalance.smoke.test.ts`

### 何を見るか

各 demo stage を **標準 demo 編成**（`parties.json` demo、Lv1 基準）で 1 回シミュレーションし、次を確認する。

- 戦闘が **victory または defeat で完走** する（`timeout` しない）
- **即終了** しない（`MIN_DEMO_BATTLE_TICKS` 以上）
- tick 予算内に収まる（`MAX_DEMO_BATTLE_TICKS` 未満）
- `durationSec` / `survivors` / `remainingHp` を `[demo-smoke]` ログに記録

### 何を保証しないか

- **勝利は保証しない**。baseline 全 stage 勝利は Hensei Only の設計目標ではない。
- 編成差分・ puzzle 妥当性は **puzzle test** の担当。

### なぜ残すか

- `enemyGroups` + scale 変更後の **ランタイム回帰**（ハング・即死・spawn 異常）を CI で早期検知する。
- puzzle 調整中も smoke が通ることで、**戦闘エンジン自体の破壊** と **数値バランス** を切り分けられる。

---

## 3. puzzle / balance test の役割

**ファイル:** `src/battle/demoStageBalance.puzzle.test.ts`

**実行例:** `npm test -- src/battle/demoStageBalance.puzzle.test.ts`

### 編成 quad（4 パターン）

各 stage で同じ敵に対し、次の 4 編成を比較する（harness: `runCompositionQuad`）。

| ラベル | 内容 | 意図 |
| ------ | ---- | ---- |
| **baseline** | `parties.json` demo 標準編成 | 体験版の初期導線。序盤は勝て、中盤以降は **負けてよい** |
| **bad** | stage ごとの「悪手」編成（例: ガーディアン抜き、ヒーラー抜き） | 問題提示が効いているか |
| **universal** | ranger → sorcerer 差し替え | 汎用火力編成の過剰勝利を検知 |
| **counter** | stage ごとの対策編成（例: paladin タンク、double melee、ranged counter） | **解法編成で勝てる** ことを確認 |

**bad / counter の stage 別定義**（puzzle test 内 `STAGE_PUZZLES` および個別 `it` を参照）

- ch1_01〜03: bad = no guardian、counter = paladin / ranged counter / double melee
- ch1_04: bad = no healer（assassin 差し替え）、counter = paladin
- ch1_05: bad = no healer、counter = paladin（`skipBadVsBaseline`: Ranger contact-cap 以降 bad が baseline 以上になり得る）
- ch1_06: bad = no healer、counter = paladin（`requireCounterVictory`）
- ch1_07: bad = no healer、counter = paladin（finale: baseline / bad / universal は defeat、counter のみ victory）

### 判定の考え方

- **outcome score**（`demoStageOutcomeScore`）: victory > defeat。同 outcome なら remaining HP が高いほど良い。
- 原則: **bad < baseline < counter**（late-game stage は例外フラグあり）。
- **default（baseline）で負け、counter で勝つ** → 編成解法ステージとして **良い**。
- ch1_06 / ch1_07 は **counter 勝利を必須** とし、baseline 敗北は許容・期待。

### なぜ smoke と分離するか

- puzzle 期待値は 6c 調整で **意図的に更新** される。smoke を puzzle 基準にすると CI が不安定になる。
- 編成差分の失敗は「エンジン破壊」ではなく「設計・数値」の信号として読む。

---

## 4. demo stage 診断ログの役割

**主な出力元:** `demoStageSim.harness.ts`（puzzle test 実行時に `sixCDiagnostics: true` 等で emit）

### ログタグ一覧

| タグ | 役割 |
| ---- | ---- |
| `[demo-puzzle]` | 各編成の outcome / survivors / remainingHp / durationSec の概要 |
| `[demo-puzzle-stats]` | 編成内クラス別 damage / healing / attack 統計（class coverage の補助） |
| `[demo-6c-report]` | **1 編成** の詳細: outcome、クラス別 `damageDealt` / `damageTaken` / `healingDealt` / `basicActionCount` / active 使用、frontliner 被ダメ |
| `[demo-6c-quad]` | **4 編成横並び** 比較 + summary 行 |
| `[demo-ch1_04-diag]` 等 | stage 固有の ripple 解説（healer puzzle、finale margin 等） |

### 使い方

- stage scale 調整 **前後** で puzzle test を実行し、`[demo-6c-quad]` summary と `[demo-6c-report]` のクラス行を diff する。
- 勝敗だけでなく **durationSec・frontliner damageTaken・healingDealt** で「なぜ bad が勝ったか / counter が効いたか」を説明する。
- ch1_04 / 06 / 07 の stage 固有 diag は、過去調整の **意図メモ** 兼ねる。削除せず、新調整時の比較基準にする。

---

## 5. ranger target diagnostics の役割

**主な出力元:** `rangerTargetReport.ts`（`rangerTargetDiagnostics: true` で puzzle quad 実行時に emit）

### ログタグ

| タグ | 役割 |
| ---- | ---- |
| `[demo-ranger-target-report]` | **1 編成** の at_ranger ターゲット・射程・後衛 share 分析 |
| `[demo-class-coverage]` | quad 横断の at_ranger 役割判定サマリ + 敵 backline 撃破タイミング比較 |
| `[demo-assassin-role-report]` | **1 編成** の at_assassin 生存・ターゲット share・execute 寄与 |
| `[demo-assassin-coverage-summary]` | 複数編成横断の assassin `ROLE_OK` / `ROLE_THIN` / `ROLE_UNMET` |

### 設計意図

`at_ranger` は **単純 DPS 役ではない**。後衛・遠隔敵（ranger / sorcerer / cleric / wardweaver / ballista 等）を **優先処理** する backline processor として評価する。

### 判定ルール（実装と一致）

- **`damageDealt` だけで活躍判定しない**。
- 見る指標:
  - `backlineDamageShare` — 与ダメのうち priority backline/ranged への割合
  - `backlineTargetShare` — 基本攻撃ターゲット取得の priority 割合
  - `damageByTargetClassId` / `targetClassHitCount` / `killOrLastHitTargetClassId`
  - `outOfRangeSkipCount` / `movingSkipCount` — 射程・追撃停滞の回帰検知
- **現時点の目安:** `backlineDamageShare >= 35%`（0.35）で `roleFulfilled = true` とみなす。
- **`outOfRangeSkipCount` が増加** した場合は **contact cap / ranged chase** の回帰を疑い、戦闘 AI・射程ロジック側を調査する（stage scale だけで誤魔化しない）。

### `[demo-class-coverage]` summary の読み方

- `BACKLINE_OK` / `ROLE_UNMET` — ranger 編成での役割充足
- ranger なし編成 — 敵 backline の `deathSec`（ranger あり vs なしの delta）
- aggregate 行 — quad 全体の roleFulfilled 件数

---

## 5b. assassin role diagnostics の役割

**主な出力元:** `assassinRoleReport.ts`（`demoStageAssassinCoverage.test.ts` および harness `logDemoAssassinRoleReportsForQuad` / `logDemoAssassinRoleReportsForRuns`）

### ログタグ

| タグ | 役割 |
| ---- | ---- |
| `[demo-assassin-role-report]` | **1 編成** の at_assassin 生存・与ダメ・ターゲット share・execute 寄与分析 |
| `[demo-assassin-coverage-summary]` | 複数編成横断の `ROLE_OK` / `ROLE_THIN` / `ROLE_UNMET` サマリ |

### 設計意図

`at_assassin` は **低 HP ・後衛・優先撃破対象を仕留める execute/finish 役** として評価する。勝利編成に入っているだけでは活躍と判定しない。

### 判定ルール（実装と一致）

- **`damageDealt` だけで活躍判定しない**。
- 見る指標:
  - `priorityTargetDamageShare` — 与ダメのうち priority band（`sp_cleric` / `at_sorcerer` / `sp_wardweaver` / `at_ranger` / `at_assassin`）への割合
  - `frontlineDamageShare` — 前衛（`df_guardian` / `df_paladin` / `at_swordsman`）への吸われ
  - `damageByTargetClassId` / `killOrLastHitTargetClassId`
  - `survived` / `deathTimeSec` / `damageTaken` — 早期脱落
  - `firstBasicActionSec` / `basicActionCount` / `activeSkillUseCount`
- **現時点の目安:** `priorityTargetDamageShare >= 35%` で execute band 充足の一要素。`frontlineDamageShare >= 65%` かつ priority 寄与なしは `ROLE_UNMET` 候補。
- **bad（no-healer）編成でのみ assassin が出る stage** では、負け役・bad 枠としての出番かどうかを quad の `bad` 行で見る。

### 診断専用編成（harness）

| 関数 | 内容 |
| ---- | ---- |
| `configureAssassinInsteadOfRangerParty` | ranger 枠 → assassin（ch1_05 受け皿 probe） |
| `configureAssassinDoubleFinishParty` | cleric + ranger 両方 → assassin（二体 finish probe） |

`data/parties.json` / `stages-demo.json` は変更しない。player party の `configureSave` のみ。

### `[demo-assassin-coverage-summary]` の読み方

- `ROLE_OK` — 低 HP 狙い・後衛崩し・短期決着のいずれかに明確な寄与
- `ROLE_THIN` — ダメージはあるが priority 寄与が不明瞭
- `ROLE_UNMET` — 早期脱落 + 極端に低い damage、または前衛吸い込み
- `NO_ASSASSIN` — 当該編成に assassin 不在（baseline / counter 等）

---

## 6. class coverage diagnostics の役割

**関連ログ:** `[demo-puzzle-stats]`、`[demo-6c-report]`、`[demo-class-coverage]`、stage 固有 `[demo-ch1_*-diag]`

M1 demo stages を通じ、**プレイヤーが使える 8 クラス** と **demo に登場する敵クラス** が次のどれに当たるかを整理する。全クラス完全網羅は目的ではない。**クラス別の主処理対象・想定 counter・診断観点の一覧** は [§7 M1 Class Responsibility Matrix](#7-m1-class-responsibility-matrix) を正とする。

### 分類

| 分類 | 意味 | 例 |
| ---- | ---- | -- |
| **明確な活躍ステージがある** | 特定 stage / 編成で役割指標が満たされ、勝敗にも寄与 | ch1_02 で at_ranger の backline share 達成、ch1_04 で sp_cleric の healing が guardian 被ダメを相殺 |
| **勝利編成には入るが貢献が薄い** | baseline / counter に常駐するが damage 偏重・役割未達 | damage はあるが backline 以外を殴り続ける ranger |
| **負け役・bad 編成でしか出番がない** | bad 側の差し替え枠としてのみ機能 | no-healer の at_assassin、no-guardian 編成の前衛 |
| **まだ解禁前なので未評価** | プレイヤー側としてまだ使えない | **at_ballista**（ch1_07 クリア前） |
| **敵側では機能しているがプレイヤー側活躍は未確認** | 敵として stage 課題に寄与、味方編成では未検証 | ch1_07 の **at_ballista** 敵、sp_wardweaver 敵（ch1_07） |

### demo stages に登場する敵クラス（参考）

`df_guardian` `at_swordsman` `at_ranger` `at_assassin` `sp_cleric` `at_sorcerer` `df_paladin` `sp_wardweaver` `at_ballista`（ch1_07）

プレイヤー側 8 クラスのうち、敵として **未登場** のもの（例: `df_guardian` は ch1_01 敵にもいるが、プレイヤー初期枠 — 敵側の「教材」として ch1_04 等で別役割）もある。敵登場有無とプレイヤー活躍は **別軸** で見る。

---

## 7. M1 Class Responsibility Matrix

M1 体験版（`demo_ch1_01`〜`07`）の puzzle / 診断ログを読むとき、**各クラスが意図した対象に機能しているか** を確認するための観点表。正解編成の固定リストではない。ステージ設計・敵編成・scale 補正によって、有効な counter は揺れる。

### 7.1 M1 対象範囲

| 区分 | 内容 |
| ---- | ---- |
| ステージ | `data/stages-demo.json` の `demo_ch1_01`〜`07` |
| 味方クラス | M1 攻略中に使える **8 クラス**（下表 Ally） |
| 敵クラス | 上記 demo stages に登場する M1 8 クラス（ch1_07 の `at_ballista` **敵** は含む。プレイヤー側活躍表からは除外） |
| スキル | Lv0 のみ（M1 スコープ） |
| 非対象 | M1 外 6 クラス、`stages.json` dev / legacy stage |

**M1 味方 8 クラス:** `df_guardian` `df_paladin` `at_swordsman` `at_assassin` `at_ranger` `at_sorcerer` `sp_cleric` `sp_wardweaver`

**本節から除外したクラス**

| classId | 表示名 | 除外理由 |
| ------- | ------ | -------- |
| `at_ballista` | 弩砲士 | M1 最終ステージ（`demo_ch1_07`）クリア報酬で解禁されるだけ。M1 攻略中の **味方** 活躍診断表には入れない（ch1_07 **敵** としての脅威は Enemy 表で扱う） |
| `sp_alchemist` | 薬草師 | M1 体験版スコープ外（未解禁・demo stage 敵にも不使用） |

### 7.2 Ally Class Responsibilities（味方）

勝敗だけでなく、§4〜§6 のログ指標と照合して **役割対象に当たっているか** を見る。

| classId | 表示名 | 主な処理対象 | 苦手になりやすい対象 | 診断観点 |
| ------- | ------ | ------------ | -------------------- | -------- |
| `df_guardian` | 鉄衛士 | 物理単体圧・正面接敵ライン | 後衛への迂回・範囲魔法・低 HP 集中（execute 系） | 前衛として **物理圧を受け止めているか**。`damageTaken`・survivors・block 系の寄与。bad（no-guardian）との frontliner 被ダメ差 |
| `df_paladin` | 護法士 | 魔法・範囲・戦線全体の崩壊リスク | 開幕 burst で aura / 分担が立つ前の単体物理 | **魔法 / 範囲被害を軽減** し、前列全体の被害分散が効いているか。party 全体の `damageTaken` 分布・RES 系被ダメ |
| `at_swordsman` | 剣術士 | 高 DEF・硬い前衛敵 | 後衛のみ・高 RES 魔法主体 | **硬い前衛を処理** できているか。`damageDealt` の主ターゲットが `df_guardian` / `at_swordsman` 等であること。duration 過長は DEF 突破不足の信号 |
| `at_assassin` | 双刃士 | 低 HP・削れた敵 | 硬い前衛単体・フィニッシュ対象がいない持久戦 | **低 HP・削れた敵を倒し切る** か。瀕死敵への hit 密度・`killOrLastHit` 寄与。bad 編成でのみ活躍していないか |
| `at_ranger` | 弓術士 | 後衛・遠隔敵（ranger / sorcerer / cleric / wardweaver 等） | 前衛硬体のみ・射程外停滞 | **後衛・遠隔敵を処理** しているか（§5 参照）。`backlineDamageShare`・`targetClassHitCount`。`outOfRangeSkipCount` 増加は AI 回帰疑い |
| `at_sorcerer` | 魔術師 | 少数編成・物理耐久寄りの敵 | 高 RES 全体・弱体多数で効率が割れる編成 | **魔法火力** が意図対象に届いているか。敵 `resScale` と `damageDealt` のバランス。universal 編成の duration 過短は RES 不足の信号 |
| `sp_cleric` | 療養師 | 味方 HP 崩壊の回復・継戦 | 回復量を上回る瞬間 burst | **HP 崩壊を戻し sustain を成立** させているか。`healingDealt` と frontliner `damageTaken` の相殺（ch1_04 / 06）。no-healer bad との outcome 差 |
| `sp_wardweaver` | 結界師 | バースト・集中攻撃の事前防御 | 継続 chip のみで spike がない戦闘 | **バーストや集中攻撃を事前防御** できているか。spike 前のバリア / 軽減・味方 `deathSec` の遅延。healer 単独では防げない burst 局面での寄与 |

### 7.3 Enemy Threat Counters（敵）

敵クラスが stage 課題として機能しているか、**想定対策が puzzle / 診断ログ上で効いているか** を見る。単一正解編成ではない。

| classId | 表示名 | 主な脅威 | 想定対策（例） | 診断観点 |
| ------- | ------ | -------- | -------------- | -------- |
| `df_guardian` | 鉄衛士 | 正面物理ラインの固定・戦闘長期化 | 剣術士・魔術師など DEF / 耐久突破 | **剣術士 / 魔術師で突破** できているか。baseline の duration・frontliner 被ダメ。counter 編成での前衛処理速度 |
| `df_paladin` | 護法士 | 魔法・範囲圧と前列全体の安定 | 剣術士・双刃士など物理処理 / execute | **剣術士 / 双刃士で突破** できているか。魔法圧が護法士単体に吸われず戦線が崩れるか |
| `at_swordsman` | 剣術士 | 硬い前衛 DPS・前衛維持 | 鉄衛士・療養師・結界師 | **鉄衛士 / 療養師 / 結界師で前衛維持** できるか。味方 frontliner の `deathSec`・healing 相殺 |
| `at_assassin` | 双刃士 | 低 HP 狩り・前衛以外への差し込み | 鉄衛士・結界師・療養師 | **低 HP 狩りを防げているか**。瀕死味方の `deathSec`・バリア / heal の間に合い |
| `at_ranger` | 弓術士 | 後衛からの継続火力・後衛狙い | 味方弓術士の backline 処理、前衛で時間を稼ぐ編成 | **後衛狙いが成立しているか**（敵 AI として）。味方側に **後衛処理 / 前衛時間確保** が必要か。§5 の backline 撃破タイミング |
| `at_sorcerer` | 魔術師 | 魔法 AoE・RES 前提の火力 | 護法士・弓術士・双刃士 | **護法士 / 弓術士 / 双刃士が対策として機能** するか。魔法圧と後衛処理の両立 |
| `sp_cleric` | 療養師 | 敵側 sustain・戦闘長期化 | 後衛処理・優先撃破 | **放置すると sustain で長引くか**。`durationSec` と敵 cleric の `healingDealt`。**後衛処理** が必要になっているか |
| `sp_wardweaver` | 結界師 | バリアによる burst 無効化 | バリア突破・継続 DPS・execute | **バリア突破役が必要** になっているか。障壁消費後の spike 処理。counter 編成での breakthrough |

### 7.4 注意書き

- 本節は **M1 時点** の診断表である。M1 後に弩砲士（`at_ballista`）や薬草師（`sp_alchemist`）を味方診断に含める場合は **別途更新** する。
- **Counter は単一正解ではない。** ステージ設計・敵編成・`hpScale` / `atkScale` / `defScale` / `resScale` によって有効な編成は揺れる。puzzle test の counter 例は **参考** であり、本表はログ読み取りの観点を固定する。
- 次の **基本責務** は、揺れがあっても診断基準として扱う:
  - 弓術士 — 後衛・遠隔敵の処理（§5）
  - 剣術士 — 硬い前衛の処理
  - 護法士 — 魔法圧・範囲被害の軽減
  - 結界師 — バースト・集中攻撃の事前防御

**関連:** クラス設計の正本は [class-philosophy.md](../class-philosophy.md) / [classes-and-skills.md](../spec/classes-and-skills.md)。本節は M1 demo 診断ログ向けの **読み方** のみを担う。

---

## 8. 診断ログを見るときの注意

### 必ず横断で見る指標

勝敗（`outcome`）に加え、少なくとも次を確認する。

- `damageDealt` / `healingDealt` / `damageTaken`
- `activeSkillUseCountBySkillId`（または `skillUseCount`）
- `basicActionCount`
- `durationSec` / `survivors` / `remainingHp`

### 活躍判定の誤りやすい点

- **damage が高くても、役割対象に当たっていないなら活躍とは判定しない**（特に at_ranger → §5 参照）。
- **early death** — `deathSec` や survivors 減少。bad 編成で前衛が先落ちしていないか。
- **`out_of_range` / `moving` 停滞** — ranger diagnostics の skip カウント。DPS ゼロに見えて実は動けていないケース。
- **universal の速勝** — sorcerer AoE で duration が短すぎる場合、敵 RES（`resScale`）不足の信号。
- **healer puzzle** — cleric `healingDealt` と guardian `damageTaken` の **相殺関係** を見る（ch1_04 / 06）。

---

## 9. 今後ステージを調整するときの流れ

1. **診断** — puzzle test（必要なら `-t demo_ch1_XX`）を実行し、`[demo-6c-quad]` / `[demo-ranger-target-report]` / stage diag を保存
2. **原因分類**
   - エンジン回帰（timeout・spawn 異常）→ smoke 失敗。scale 前にコード調査
   - puzzle  soft / hard → bad が勝ちすぎ / counter が勝てない / baseline が勝ちすぎ
   - 役割未達 → ranger backline share、healer 相殺、特定クラス DPS 偏重
3. **最小限の stage scale 調整** — `data/stages-demo.json` の `hpScale` / `atkScale` / `defScale` / **`resScale`（RES）** のみを対象 group に適用。クラス JSON は原則触らない
4. **puzzle / smoke / regression 確認**
   - `demoStageBalance.puzzle.test.ts` pass
   - `demoStageBalance.smoke.test.ts` pass
   - 変更していない stage の quad summary が意図せず崩れていないかログで確認

---

## 10. 非対象

本診断基盤・本ドキュメントのスコープ外:

| 項目 | 理由 |
| ---- | ---- |
| StageGenerator / StageArchetype / StageRecipe 実装 | 未実装。将来別設計 |
| UI 大改修 | Phase 7 以降 |
| クラスデータ変更（`classes.json` / skills） | 6c は stage scale 優先。クラス変更は別タスク |
| per-group level 追加 | M1 ではレベル実装しない |
| M1 外 6 クラスのプレイヤー活躍 | 体験版非表示 |
| baseline 全 stage 勝利の要求 | 編成解法型と矛盾 |
| `stages.json` dev / legacy stage | demo 診断対象外 |

---

## 関連

- 作業 handoff（一時）: [docs/ai-handoff/current-task.md](../ai-handoff/current-task.md) §10 demo stage テスト方針
- 体験版 stage データ: `data/stages-demo.json`
- 敵 scale フィールド: [docs/spec/progression.md](../spec/progression.md) / handoff v0.3.2 方針
