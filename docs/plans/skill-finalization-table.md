# スキル確定表（作業用）

最終更新: 2026-06

目的: Phase 3 完了時点の「クラス別パッシブ / アクティブスキル再設定」を、実装チャットへ分割して渡せる粒度まで整理する。ここでは数値バランスではなく、**クラスの役割、習得段階、既存スキルの採否、実装影響**を確定対象にする。

正本:

- クラス設計: [`docs/spec/classes-and-skills.md`](../spec/classes-and-skills.md)
- 戦闘効果: [`docs/spec/combat.md`](../spec/combat.md)
- 習得・進行: [`docs/spec/progression.md`](../spec/progression.md)
- データ: `data/classes.json`, `data/skills/`

## 確定ルール

- 全クラス共通で、active / passive はどちらも Lv0=2、Lv10=3、Lv20=4 の最大 4 種を常時使用する。
- 初期アクティブは `active_1` を基本スキル、`active_2` を強めスキルとして扱う。Lv0 の 2 枠でクラスの基礎操作を成立させつつ、`active_2` には初期段階からクラス個性が分かる強い効果形状を置く。
- passive は active と同じ数・習得段階ルールに従う。初期 passive は 2 つまでとし、Lv10 / Lv20 で 1 つずつ追加する。現行実装の `passiveIds` 一括常時有効方式は、この方針に合わせて習得段階を持つ形へ見直す。
- 「スキル装備」「セット枠」「付け替え」は扱わない。習得済み passive / active が常時参加する。
- 数値は Phase 8 で調整する。今決めるのは、効果形状、対象、習得段階、クラス内の役割。
- `atkScale`、倍率、秒数、CD、発動間隔、確率などの細かい数値はこの表では確定しない。実装時は現行値または保守的な仮値を置き、Phase 8 の調整対象として残す。
- 既存 effect / target / condition で表現できる案を優先する。
- 新 effect、targetShape、条件、表示要素を採用する場合は、同じ実装単位で `SkillEditorStep`、`editorApi`、validate、`formatSkillText`、関連 spec を同期する。
- 既存 RPG テンプレートではなく、現在の設計書と実装を正本にする。
- Targeted Kill（処理対象を持つ物理 Kill）の passive 段階: P1 Lv0 = 処理対象選定、P2 Lv0 = クラス基盤、P3 Lv10 = 処理対象特効、P4 Lv20 = 処理完成形。詳細は [classes-and-skills.md §Targeted Kill の passive 段階](../spec/classes-and-skills.md#targeted-kill-の-passive-段階設計ルール) を正とする。

## 判定ラベル

| ラベル     | 意味                                                       |
| ---------- | ---------------------------------------------------------- |
| **残す**   | 現行スキルの役割・形状を v1 に採用する。名称・数値調整は可 |
| **見直し** | 方向性は近いが、対象・習得段階・効果形状を再定義する       |
| **追加**   | Lv10 / Lv20 など未配置枠へ新規スキルを足す                 |
| **置換**   | 現行スキルを別コンセプトへ差し替える                       |
| **要判断** | 新メカニクス導入可否または設計判断が必要                   |

## 共通の実装ゲート

| ゲート                                    | v1 方針                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conditionalEffect`                       | 印術師の核では **不採用**（2026 再設計）。他クラス向け effect として維持                                                                                                                                                                                                                                                               |
| Hit / Attack / Gauge                      | 仕様語としては重要。ただし gauge 系は v1 では増やさず、既存の `basicAttackCount`, `hitCount`, `basicAttackTransform` で代替する                                                                                                                                                                                                           |
| 貫通ライン                                | 槍術士・弩砲士の核。既存 `targetShape: pierce` で表現できる範囲を優先し、フィールド端貫通などは別ゲート                                                                                                                                                                                                                                   |
| 地点指定範囲 / 持続範囲                   | 単純な範囲攻撃、狩猟士の罠範囲、法陣師の法陣範囲で共有する。範囲指定そのものは共通化し、単発 effect なら通常範囲攻撃、持続効果を持たせれば罠 / 法陣 / 領域効果として扱う。狩猟士は DoT 圧縮 / 行動制限、法陣師は damage routing / transfer など、設定する effect 内容で役割を分ける。法陣師は自分で直接 damage を出さない方向を候補にする |
| 罠 / DoT 圧縮 / 行動制限                  | 狩猟士の核。広範囲 DoT 火力ではなく、地点指定範囲 + 持続効果に DoT 残り時間圧縮と局所行動制限を置いて Field Flow を作る。既存 `scatter` / `dot` / `stun` は土台にできるが、地点指定範囲の持続化と DoT 圧縮は新 effect / condition ゲート                                                                                                  |
| 法陣のダメージ分配・転送                  | 法陣師の核。自分で damage を出すのではなく、既存の味方 / 敵 damage の流れを分配・転送・集中する。通常攻撃も含めて非 damage 化する場合は、新 effect / target / UI 表示が必要                                                                                                                                                               |
| 反応型 heal                               | 療養師 Lv20 候補。v1 は `time` + `firePolicy: smart` + `fireConditions` で先行するか要判断                                                                                                                                                                                                                                                |
| `threatControl.frontDamageTakenReduction` | **新規設計では使わない**。Threat は「誰が殴られるか」、ダメージ軽減は「殴られた後の損失をどう減らすか」で責務が異なるため、前列ダメージ軽減は passive `damageReduction` として分離する。既存データ互換として残す場合も、新規スキル定義では `damageReductionTargetRule` 側へ移す                                                           |
| 魔法 block                                | Paladin 後半 passive 候補。現行 block は物理直接ダメージ対策なので、魔法も block 可能にするなら新フィールドまたは新 effect が必要。editor / validate / `formatSkillText` / combat / spec 同期が必須                                                                                                                                       |
| `moveLock` 主目的スキル                   | オートバトルでは移動封じ単体の価値が低い（射程内なら攻撃継続しうる）。主目的にしない。副次効果または `knockback` 付随に留める — [design-philosophy.md](../design-philosophy.md) §8                                                                                                                                                        |

## Passive 監査表

| classId         | 現行 passive                                                               | v1 確定方針                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `df_guardian`   | **R12l で新仕様へ置換済み** | 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の鉄衛士 R12l 節。旧 `blockResonance` / Lv active 表は再利用不可 |
| `df_paladin`    | block、front Threat floor、全体 barrier、全体 damageReduction              | **v1 確定・実装済**。護身手 / 護法陣 / 真言加護 / 不退転 + 光明剣 / 障身法 / 慈光 / 降魔光明。`frontBlockAura` / 魔法 block / `lastStandRecovery`   |
| `df_duelist`    | block、低 HP DEF / ATK、counter                                            | **残す**。Duelist の被弾起点・反撃・低 HP 逆転を passive 側の核にする                                                                               |
| `at_swordsman`    | **R12l で新仕様へ置換済み** | 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の剣術士 R12l 節。旧 Lv active / gauge BAC 表は再利用不可 |
| `at_assassin`   | 低 HP（現在値）狙い、evasion、低 HP 対象 damage bonus                      | **残す**。瀕死処理と背後アクセスの補助に限定し、Defender 的な生存性能には寄せない                                                                   |
| `at_lancer`     | pierce 範囲 ATK debuff、近傍 ally ATK aura                                 | **残す**。Position Flow の常時圧力として扱う                                                                                                        |
| `at_ranger`     | 遠隔敵優先、attackSpeed buff、遠隔特効・二の矢                             | **実装済**（Physical pass A）。応射（counter）廃止。P3 遠隔狩り / P4 二の矢 / A3 早射ち / A4 矢の雨                                                 |
| `at_ballista`   | 高 Max HP 狙いが重複、DEF 無視が古い仕様として残存                         | **実装済**（Physical pass B）。P1 城落としの弩（`maxHp`）/ P2 巻き上げ機構 / P3 城塞穿ち / P4 粉砕する大矢。常時 DEF 無視は置換済み                 |
| `at_hunter`     | debuff 中対象への damage bonus                                             | **実装済**（Physical pass B）。P1 濃縮毒 / P2 毒の武器 / P3 癒えぬ傷 / P4 仕留め時。Field Flow（poison 主軸、placedField / dotCompress / hasDot）   |
| `at_sorcerer`   | **R12l で新仕様へ置換済み** | 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の魔術師 R12l 節および [combat.md](../spec/combat.md) §種火 / 発火。旧種火 DoT / 熾火 / detonate は再利用不可 |
| `at_sigilist`   | P1 印術が通常攻撃を置換（設計確定）                                        | **確定**（2026 再設計）。combat / JSON は Phase 9a |
| `at_conductor`  | AoE crowd bonus、AoE / scatter 攻撃寄り active（旧 `at_geomancer`）        | **置換**。既存攻撃スキルは正本にしない。Conductor は自身で damage を出さず、観測・蓄積・法陣による damage routing / distribution / recycling を扱う |
| `sp_cleric`     | **R12l で新仕様へ置換済み** | 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の療養師 R12l 節。旧 Lv active 表は再利用不可 |
| `sp_wardweaver` | 低 HP barrier 特効、枯渇回復、障壁（ward）、先読み smart                   | **実装済**（Stability Control リデザイン）                                                                                                          |
| `sp_alchemist`  | party HoT aura、高 HP ally DEF、Wave 回数限定の debuff cleanse             | **残す**。debuff cleanse は薬草師専用の補助個性だが、必須インフラにはしない                                                                         |

## Defender

| classId       | 設計の柱                                                         | 現行スキル                                                                            | v1 確定方針                                                                             | 実装影響                                                                                                |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `df_guardian` | 前線構築。単一路線の完全防衛、高 HP 正面受け、被弾による前線押上 | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の鉄衛士 R12l 節 | （同上） | 旧 `blockResonance` / `blockResonanceConsume` / Lv active inventory は再利用不可 |
| `df_paladin`  | 戦線安定。範囲・魔法ダメージを含む戦場全体の被害緩和             | v1: 護身手 / 護法陣 / 真言加護 / 不退転 + 光明剣 / 障身法 / 慈光 / 降魔光明           | **v1 実装済**。Defender 内唯一の barrier（障身法）。前列 block + 魔法 block + 半復活 DR | `frontBlockAura` / 魔法 block / `lastStandRecovery` / 障身法 AoE 50px（スキル共通 target）              |
| `df_duelist`  | 攻撃防御。敵ターゲット操作・単体強敵制圧                         | v1: 闘士の矜持 / 流血闘志 / 攻撃誘導 / 不屈 + 誘い込み / 体捌き / 隙打ち / 闘技場の掟 | **v1 実装済**。敵 Threat 操作が主軸。barrier なし                                       | `lowHpCover` / `duelistPride` / `bloodlustDuelist` / `lastStandGuts` / `enemyReelIn` / `arenaDominance` |

### Defender 枠確定案

Defender 3 種は「硬さの大小」ではなく、被害入口の作り方で分ける。Threat は [combat.md](../spec/combat.md) の受け口設計値を正とし、恒常的な受け口は passive 側へ寄せる。active は一時的な防御・保護・制圧として扱い、active だけで Defender の Threat 構造を成立させない。

| classId       | 枠                  | 方針                                                                               | 採否                                                   |
| ------------- | ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `df_guardian` | （全枠）            | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の鉄衛士 R12l 節。旧 `blockResonance` / Lv active 表は再利用不可 | （旧 v1.6 Lv 表は削除） |
| `df_paladin`  | basic               | 最近接敵への通常攻撃。火力ではなく前線安定の補助                                   | 現行 `df_paladin_basic_attack` を **残す**             |
| `df_paladin`  | Lv0 passive 1-2     | 護身手（`frontBlockAura`）+ 護法陣（`threatControl` のみ）                         | **v1 確定**                                            |
| `df_paladin`  | Lv10 / Lv20 passive | 真言加護（魔法 block）+ 不退転（`lastStandRecovery`）                              | **v1 確定**                                            |
| `df_paladin`  | Lv0 active 1-2      | 光明剣 + 障身法（前列 barrier stack）                                              | **v1 確定**                                            |
| `df_paladin`  | Lv10 active 3       | 慈光（全体軽減 + REG、バリアなし）                                                 | **v1 確定**                                            |
| `df_paladin`  | Lv20 active 4       | 降魔光明（BAT: magic DEF ダメ + heal）                                             | **v1 確定**                                            |
| `df_duelist`  | basic               | 最近接敵への通常攻撃                                                               | 現行 `df_duelist_basic_attack` を **残す**（名称なし） |
| `df_duelist`  | Lv0 passive 1-2     | 闘士の矜持 + 流血闘志（block + 低 HP DEF/ATK 統合）                                | **v1 確定**                                            |
| `df_duelist`  | Lv10 / Lv20 passive | 攻撃誘導 + 不屈の闘士                                                              | **v1 確定**                                            |
| `df_duelist`  | Lv0 active 1        | 誘い込み（遠隔敵・単体引き寄せ）                                                   | **v1 確定**                                            |
| `df_duelist`  | Lv0 active 2        | 体捌き（damageDelay）                                                              | **v1 確定**                                            |
| `df_duelist`  | Lv10 active 3       | 隙打ち（attackSpeed + counter + debuff 追撃）                                      | **v1 確定**                                            |
| `df_duelist`  | Lv20 active 4       | 闘技場の掟（最終 Wave 開始・Stage 1 回・15 秒）                                    | **v1 確定**                                            |

Defender pass の実装方針:

- **`df_guardian`:** R12l で新仕様へ置換済み。現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の鉄衛士 R12l 節（旧 Threat/`blockResonance` 方針は再利用不可）。
- Paladin の Threat は front 全体の受け口を安定させる passive を正本にする。active は barrier / damageTaken / 補助 heal で前線崩壊を遅らせる。
- Paladin の Lv0 passive 2 枠は `frontThreatFloor` 系 + 前列 `block` aura に使う。盾を持つ直感を優先しつつ、自己だけでなく front 全体を守る shared tank として表現する。
- Paladin の前列ダメージ軽減は `threatControl` に含めない。Threat 制御と damage reduction は責務が異なるため、必要なら前列向け `damageReduction` passive として別スキル化する。ただし Lv0 の柱は前列 block を優先する。
- 現行 block は物理直接ダメージのみの対策とする。Paladin が魔法も block できるようになるのは Lv10 / Lv20 passive の候補であり、実装時は新メカニクスとして扱う。
- Duelist は Threat を広域に集める main tank ではなく、被弾・反撃・制圧で単体強敵を崩す local tank として扱う。
- Defender active に新 effect を増やさない。既存の `buff`, `debuff`, `barrier`, `damageDelay`, `stun`, `damageIncrease`, `basicAttackTransform` の範囲で実装する。

## Physical Kill / Flow

| classId       | 設計の柱                                           | 現行スキル                                                               | v1 確定方針                                                                                                                                                                                                  | 実装影響                                                                                                                                                                     |
| ------------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `at_swordsman`  | 単体安定。高 DEF 単体を DEF 貫通・固定 DPS で処理  | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の剣術士 R12l 節 | （同上） | 旧 Lv active / gauge BAC inventory は再利用不可 |
| `at_assassin` | 高速処理。Hit 数、背後侵入、瀕死処理               | basic + 4passive + 4active（Lv0 引き裂き/影の刃）                        | **実装済**（Physical pass A）。P3 刈り取り / P4 無慈悲な刃 / A3 失血刻印 / A4 百花繚乱                                                                                                                       | `bonusBasicAttackOnHit` / 条件付き `specialEffect`+`defenseIgnore` / `dotFlavor: bleed` + smart `damageTaken` debuff                                                         |
| `at_lancer`   | Position Flow。前線バフ・前線デバフ・戦線再形成    | basic + 4passive + 4active（号令／崩勢／鼓舞／追撃／堅陣／援護）         | **実装済**（Physical pass B）。A1 `move` 削除・A2 `stun`+`knockback`（ダメなし）・A4 追撃状態 `allyAttackFollowUp`。P4 援護反撃 `frontAllyDamaged`                                                           | pierce approach（[battle-field.md](../spec/battle-field.md) §4.4）既存。援護反撃は [combat.md](../spec/combat.md) §援護反撃。追撃は [combat.md](../spec/combat.md) §追撃状態 |
| `at_ranger`   | 連射変形。攻撃回数、攻撃速度、遠隔敵処理           | basic + 4passive + 4active（Lv0 連射/連ね矢）                            | **実装済**（Physical pass A）。P3 遠隔狩り / P4 二の矢 / A3 早射ち / A4 矢の雨。応射廃止                                                                                                                     | `attackType` 条件 / `bonusBasicAttackConditions` / scatter / hitCount / basicAttackTransform / attackSpeed buff                                                              |
| `at_ballista` | 貫通重撃。高 Max HP 対象、時間圧縮、貫通範囲       | basic + 4passive + 4active（破城矢装填／重矢／重撃態勢／貫く一射）       | **実装済**（Physical pass B）。`maxHp` target + `idleAtkRamp` + `targetHpRatioDamageScale` + `ballistaMark` + `grantNextOutgoingDamage` + pierce siege                                                       | `stat: maxHp` / `idleAtkRamp` / `ballistaMark` / `grantNextOutgoingDamage`。フィールド端貫通ラインは v1 外（既存 `pierce` range）                                            |
| `at_hunter`   | Field Flow。罠、DoT 圧縮、行動制限、戦闘テンポ制御 | basic + 4passive + 4active（毒罠／粘着罠／追い込み／毒収穫）             | **実装済**（Physical pass B）。`placedField`（`clusterCenter`）+ `dotCompress` / `dotExtend` / `dotHarvest` / `poisonSpread` + `hasDot` + `allyBasicAttackDotProc`。広範囲 DoT 火力ではなく局所 poison Field | `placedField` / dot 圧縮・延長・収穫 / P4 仕留め aura。視界・命中干渉は v1 外                                                                                                |

### Physical pass A 枠確定案

Warrior / Assassin / Ranger は v1 では新 effect を増やさず、既存の target override、defenseIgnore、specialEffect、hitCount、basicAttackTransform、damageIncrease を中心に 4 枠化する。

| classId       | 枠                  | 方針                                                                                                                                                                | 採否                                                                     |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `at_swordsman`  | （全枠）            | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の剣術士 R12l 節。旧 Lv active / BAC 表は再利用不可 | （旧 Physical pass A Lv 表は削除） |
| `at_assassin` | basic               | 2 Hit 通常攻撃。Hit 密度の基礎                                                                                                                                      | 現行 `at_assassin_basic_attack` を **残す**                              |
| `at_assassin` | Lv0 passive 1-2     | 低 HP（現在値）狙い + evasion。瀕死処理と背後アクセスの補助                                                                                                         | 現行 `at_assassin_passive_1` / `at_assassin_passive_2` を **残す**       |
| `at_assassin` | Lv10 / Lv20 passive | P3: 刈り取り（`specialEffect` + 条件付き DEF 無視）。P4: `bonusBasicAttackOnHit`                                                                                    | **実装済**                                                               |
| `at_assassin` | Lv0 active 1        | 出血 DoT 付与 + 出血中への追加ダメージ。瀕死処理の下準備                                                                                                            | 現行 `at_assassin_active_1`（引き裂き）を **残す**（`dotFlavor: bleed`） |
| `at_assassin` | Lv0 active 2        | 背後侵入 + 低 HP 条件の追撃。rear assault は Kill アクセスであり前線保持ではない。move 構成: buff → `toAnchor` → damage（帰還 `engage` なし、通常 approach で復帰） | 現行 `at_assassin_active_2`（影の刃）を **残す**                         |
| `at_assassin` | Lv10 active 3       | 失血刻印 — 出血中の対象へ smart `damageTaken` debuff                                                                                                                | **実装済**                                                               |
| `at_assassin` | Lv20 active 4       | 百花繚乱 — BAC 16・`multiLock` range 100・低 HP 優先                                                                                                                | **実装済**                                                               |
| `at_ranger`   | basic               | 遠隔物理の標準攻撃                                                                                                                                                  | 現行 `at_ranger_basic_attack` を **残す**                                |
| `at_ranger`   | Lv0 passive 1-2     | 遠隔敵優先 + attackSpeed。遠隔処理と連射構造を Lv0 で成立させる                                                                                                     | 現行 `at_ranger_passive_1` / `at_ranger_passive_2` を **残す**           |
| `at_ranger`   | Lv10 / Lv20 passive | P3: 遠隔狩り（`specialEffect` + `attackType.ranged`）。P4: 二の矢（`bonusBasicAttackOnHit` + 遠隔条件、HP ゲートなし）                                              | **実装済**                                                               |
| `at_ranger`   | Lv0 active 1        | 2 Hit の連射攻撃                                                                                                                                                    | 現行 `at_ranger_active_1`（連射）を **残す**                             |
| `at_ranger`   | Lv0 active 2        | 一定時間 basic の Hit 構造を変形（唯一の `basicAttackTransform`）                                                                                                   | 現行 `at_ranger_active_2`（連ね矢）を **残す**                           |
| `at_ranger`   | Lv10 active 3       | 早射ち — self `attackSpeed` buff                                                                                                                                    | **実装済**                                                               |
| `at_ranger`   | Lv20 active 4       | 矢の雨 — BAC 11・小範囲 scatter 短時間弾幕（damage のみ）                                                                                                           | **実装済**                                                               |

Physical pass A の実装方針:

- **`at_swordsman`:** R12l で新仕様へ置換済み（正本: classes-and-skills.md 剣術士 R12l 節）。Assassin / Ranger の方針は下記。
- Assassin の rear assault は Kill アクセスであり、Threat / frontline ownership を変えるものではない。
- Assassin は既に Lv0 passive に evasion を持つため、防御手段をさらに積むより、Hit 密度・瀕死処理・回転加速へ伸ばす。
- Ranger は Hit 数と attackSpeed の相互作用を軸にする。応射（counter）は廃止し、遠隔敵特効（P3）と追い矢（P4）で段階強化する。
- Gauge は v1 では増やさない。`basicAttackCount`, `hitCount`, `basicAttackTransform`, `damageIncrease` で表現する。

### Physical pass B 枠確定案

Lancer / Ballista / Hunter は、物理職の中でも「対象をどう倒すか」だけでなく、戦線・射線・局所領域をどう作るかを扱う。既存 `pierce` / `scatter` / `dot` / `stun` / `buff` / `debuff` / `targetRuleOverride` / `defenseIgnore` / `skillPropertyOverride` を優先するが、Flow を成立させるために必要な新 trigger / condition / effect はゲート化して採用候補にする。Lancer の「前列味方被攻撃時の援護反撃」を採用する場合は、現行 counter が自己被弾専用のため新 trigger が必要になる。Ballista の「高 Max HP 対象」を厳密に扱う場合は、現行 `stat: "hp"`（現在 HP）ではなく `maxHp` target 拡張が必要になる。また現状は高 HP / 高 Max HP 対象への `specialEffect` 条件も存在しないため、Ballista の高耐久特効を実装するなら新 condition が必要になる。Hunter は広範囲 DoT 火力ではなく DoT 圧縮と行動制限を主軸にするため、DoT 圧縮 effect が新規実装対象になる。罠の範囲指定は法陣師と同じ地点指定範囲を使い、Hunter / Conductor の違いは範囲形状ではなく配置する effect 内容で分ける。地点指定範囲は単発範囲攻撃にも使える汎用 target とし、持続効果を組み合わせると罠 / 法陣 / 領域効果になる。

| classId       | 枠                  | 効果カテゴリ・対象・条件                                                                                         | 方針                                                                                | 採否 / 実装影響                                                                |
| ------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `at_lancer`   | basic               | physical damage。対象は自身前方 `selfOrigin` の `pierce`。条件なし                                               | 槍術士の通常攻撃自体を Position Flow の常時圧力にする                               | 現行 `at_lancer_basic_attack` を **残す**。新実装なし                          |
| `at_lancer`   | Lv0 passive 1-2     | passive debuff + passive buff。敵前方 `pierce` ATK debuff、味方 `selfOrigin` + `aoe` ATK aura。条件なし          | 前線に入った敵の接触圧を下げ、近傍味方の前線維持を支える                            | 現行 `at_lancer_passive_1` / `at_lancer_passive_2` を **残す**。数値は Phase 8 |
| `at_lancer`   | Lv10 / Lv20 passive | P3 堅陣（DEF + REG aura）+ P4 援護（`frontAllyDamaged` counter）                                                 | Lv0 の前線圧力を段階強化。Kill 対象特化や Defender 的 Threat 操作には寄せない       | **実装済**                                                                     |
| `at_lancer`   | Lv0 active 1        | 号令 — pierce damage + 味方 ATK buff 短パルス。`move` なし                                                       | 前線への圧力と味方鼓舞                                                              | **実装済**                                                                     |
| `at_lancer`   | Lv0 active 2        | 崩勢 — pierce + `stun` 3s + `knockback` のみ（`damage` なし）                                                    | 前線敵の攻撃停止と戦線押し戻し。`moveLock` / 二重 debuff なし                       | **実装済**                                                                     |
| `at_lancer`   | Lv10 active 3       | 鼓舞 — 味方前線 ATK + `attackSpeed` buff 持続                                                                    | A1 パルスより上位の戦線維持                                                         | **実装済**                                                                     |
| `at_lancer`   | Lv20 active 4       | 追撃 — `allyAttackFollowUp` 追撃状態 + 追撃 basic 命中時 DEF debuff ×0.95                                        | 近傍味方 basic 後の槍術士追撃。撃破大技ではない                                     | **実装済**                                                                     |
| `at_ballista` | basic               | physical single damage。対象は通常 enemy target。条件なし                                                        | 遠隔物理の重撃前提の標準射撃                                                        | 現行 `at_ballista_basic_attack` を **残す**                                    |
| `at_ballista` | Lv0 passive 1-2     | P1 `targetRuleOverride`（`stat: maxHp` highest）。P2 `idleAtkRamp`（非攻撃 ATK 蓄積 + attackSpeed トレードオフ） | 高 Max HP 優先と装填リズム。重複 targeting を 1 枠に統合。常時 DEF 無視は採用しない | **実装済**                                                                     |
| `at_ballista` | Lv10 / Lv20 passive | P3 `targetHpRatioDamageScale`（高 HP 比率ほど与ダメ増）。P4 `ballistaMark` + 着弾飛散 + 自身 attackSpeed debuff  | 高耐久処理の段階強化。DEF 無視ではなく HP 比率スケール + マーク飛散で表現           | **実装済**                                                                     |
| `at_ballista` | Lv0 active 1        | `grantNextOutgoingDamage` + `useDurationSec`。次の与ダメ増                                                       | 破城矢装填。重撃の下準備                                                            | **実装済**                                                                     |
| `at_ballista` | Lv0 active 2        | physical single damage（modest `atkScale`）                                                                      | 重矢。標準的な単体重撃                                                              | **実装済**                                                                     |
| `at_ballista` | Lv10 active 3       | self ATK buff + self attackSpeed debuff。smart `targetHp` 条件                                                   | 重撃態勢。攻撃間隔を火力へ変換                                                      | **実装済**                                                                     |
| `at_ballista` | Lv20 active 4       | physical `pierce` + `selfOrigin` + 最大 `range`。BAC 発動 + 装填 hold                                            | 貫く一射。射線上の攻城射撃。target DEF 参照追加ダメージは v1 未採用                 | **実装済**                                                                     |
| `at_hunter`   | basic               | physical single damage。対象は通常 enemy target。条件なし                                                        | 罠・DoT の補助に留める標準射撃                                                      | 現行 `at_hunter_basic_attack` を **残す**                                      |
| `at_hunter`   | Lv0 passive 1-2     | P1 `dotCompressAssist`（0.7）。P2 `allyBasicAttackDotProc`（味方物理 basic → poison dot）                        | Field Flow の poison 基盤。Kill 寄り debuff 中 bonus は置換済み                     | **実装済**                                                                     |
| `at_hunter`   | Lv10 / Lv20 passive | P3 癒えぬ傷（`dotDurationMultiplierOnApply` + 被 heal 0.8）。P4 仕留め時（`hasDot` 敵への `damageTaken` aura）   | DoT 維持・仕留め補正。広範囲 DoT 火力ではなく poison Field の精度強化               | **実装済**                                                                     |
| `at_hunter`   | Lv0 active 1        | `placedField`（`clusterCenter`）+ enter/stay poison dot                                                          | 毒罠。局所 poison Field の下準備                                                    | **実装済**                                                                     |
| `at_hunter`   | Lv0 active 2        | `placedField` + enter `stun` + stay `dotExtend`                                                                  | 粘着罠。stun + DoT 延長。`moveLock` は v1 では使わない                              | **実装済**                                                                     |
| `at_hunter`   | Lv10 active 3       | `placedField` + stay `dotCompress`（滞在 tick ごとに比率 +0.05 累積）                                            | 追い込み。DoT 残り時間を畳んで戦闘テンポを変える                                    | **実装済**                                                                     |
| `at_hunter`   | Lv20 active 4       | `dotHarvest`（10%）+ `poisonSpread`（70px / 50% duration）。scatter stun / pull は採用しない                     | 毒収穫。既存 DoT を再分配。上位 Field Flow                                          | **実装済**                                                                     |

Physical pass B の実装方針:

- Lancer は Kill 対象を持たない Position Flow として扱う（**Physical pass B 実装済**）。足止め（`moveLock` / 移動封じ）を主目的にしない（[design-philosophy.md](../design-philosophy.md) §8）。target override や Threat 操作ではなく、`selfOrigin` の前方ライン、味方近傍 aura、敵前線 debuff、および pierce approach + `knockback` による戦線形状で「どこで戦うか」を調整する。P4 援護反撃は [combat.md](../spec/combat.md) §援護反撃。
- Ballista は高 Max HP 対象と貫通射線を正本にする（**Physical pass B 実装済**）。P1 `maxHp` target + P2 `idleAtkRamp` で targeting 重複と装填リズムを整理。旧常時 DEF 無視 `passive_3` は `targetHpRatioDamageScale`（城塞穿ち）へ置換。P4 `ballistaMark` でマーク着弾飛散。A1 破城矢装填（`grantNextOutgoingDamage`）+ A2 重矢 + A3 重撃態勢 + A4 貫く一射（`pierce` / BAC）。v1 では target DEF 参照追加ダメージ・高 Max HP 特効 condition は未採用（HP 比率スケールで代替）。フィールド端貫通は既存 `pierce` `range` の範囲内に留める。
- Hunter は Field Flow であり、Warrior / Ranger のような処理対象特化に寄せない（**Physical pass B 実装済**）。旧 `at_hunter_passive_1` の debuff 中 damage bonus は置換済み。広範囲 DoT 火力も主軸にせず、`placedField` による局所 poison Field + `dotCompress` / `dotExtend` / `dotHarvest` + `hasDot` 条件で戦闘テンポを操作する。A2 は stun + DoT 延長（`moveLock` 主目的にしない）。A4 は毒収穫（`dotHarvest` + `poisonSpread`、scatter stun / pull なし）。地点指定は `placedField` + `clusterCenter` anchor。Conductor との差分は effect 内容（routing / recycling vs poison Field）。
- Physical pass B では Lancer の援護反撃 trigger、Ballista の `maxHp` target / `idleAtkRamp` / `targetHpRatioDamageScale` / `ballistaMark` / `grantNextOutgoingDamage`、地点指定範囲 / 持続範囲（Hunter `placedField`）、Hunter の DoT 圧縮 / `hasDot` 以外、新 effect / targetShape / condition を増やさない。採用済み要素は editor / validate / `formatSkillText` / docs 同期済み。視界妨害、命中干渉、フィールド端貫通ライン、Ballista の target DEF 参照追加ダメージは未決ゲートに残す。

## Caster

| classId        | 設計の柱                                  | 現行スキル                                                        | v1 確定方針                                                       | 実装影響                                                                               |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `at_sorcerer`  | 純出力・種火 → 発火（`emberIgnition`） | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の魔術師 R12l 節および [combat.md](../spec/combat.md) §種火 / 発火 | 旧種火 DoT / 熾火 / detonate inventory は再利用不可 |
| `at_sigilist`  | 乾印 / 坤印の付与・手動 / 自動起爆。印起爆型 Kill   | 旧 JSON 廃棄済み                                                  | 設計は **確定**（2026 再設計）。combat / JSON / tooling は **Phase 9a 以降** | `windMark` / `earthMark`、印術 basic、手動起爆、editor / validate / `formatSkillText` / spec 同期 |
| `at_conductor` | Damage Routing / Distribution / Recycling | 旧 JSON 廃棄済み                                                  | 設計は **確定**。combat / JSON / tooling は **Phase 8 以降**      | damage reservoir、地点指定範囲、非 damage basic 等（Phase 8 以降）                     |

### Caster pass 枠確定案

Caster 3 種は魔法 damage を扱うが、役割は「火力の大小」ではなく出力構造の違いで分ける。`at_sorcerer` は **R12l で新仕様へ置換済み**（正本: classes-and-skills.md 魔術師 R12l 節 / combat.md §種火 / 発火）。`at_sigilist` / `at_conductor` は独自システムのため設計確定のみ行い実装は **Phase 8 以降** とする。

| classId        | 枠                  | 効果カテゴリ・対象・条件                                                                                                                                         | 方針                                                                                                                                                                                                                   | 採否 / 実装影響                                                                                                                                                                                                                                                                |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `at_sorcerer`  | （全枠）            | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の魔術師 R12l 節および [combat.md](../spec/combat.md) §種火 / 発火。旧種火 DoT / 熾火 / detonate / active 連鎖は再利用不可 | （旧 Caster pass A Lv 表は削除） |
| `at_sigilist`  | basic               | P1 印術が通常攻撃を置換。直接ダメージなし。敵数で乾印 / 坤印を選択                                                                                                                                                                  | **追加**（Phase 9a）                                                                                                                                                                                                   |
| `at_sigilist`  | Lv0 passive 1       | 印術 — 通常攻撃を印術に置換。同属性印があれば手動起爆、なければ付与。P1 のみ起爆後は再付与しない                                                                                                                                 | **追加**                                                                                                                                                                                                               |
| `at_sigilist`  | Lv0 passive 2       | 刻み返し — 通常攻撃の手動起爆後、同対象へ同属性印を再付与                                                                                                                                                                        | **追加**。未習得時は見習い型（付与↔起爆交互）                                                                                                                                                                          |
| `at_sigilist`  | Lv10 passive 3      | 共鳴する印 — 手動起爆数に応じて起爆ダメージ上昇。自動起爆は対象外                                                                                                                                                                | **追加**                                                                                                                                                                                                               |
| `at_sigilist`  | Lv20 passive 4      | 印術の完成 — 乾印: 通常攻撃 AoE 化。坤印: 通常攻撃 multiLock 化。起爆効果は不変                                                                                                                                                    | **追加**                                                                                                                                                                                                               |
| `at_sigilist`  | Lv0 active 1        | 刻み直し — 対象の印を敵数に応じた属性へ変換。ダメージ・起爆なし                                                                                                                                                                 | 旧 `at_sigilist_active_1`（連印）JSON は **廃棄**。**追加**                                                                                                                                                             |
| `at_sigilist`  | Lv0 active 2        | 重ね刻み — 対象の印 stack を 1.5 倍（切り捨て）。ダメージ・起爆なし                                                                                                                                                              | 旧 `at_sigilist_active_2`（爆印）JSON は **廃棄**。**追加**                                                                                                                                                             |
| `at_sigilist`  | Lv10 active 3       | 重ね鳴り — 次の手動起爆に追加起爆（元起爆数の半分・切り上げ）。消費型                                                                                                                                                            | **追加**                                                                                                                                                                                                               |
| `at_sigilist`  | Lv20 active 4       | 早鳴りの印 — 全乾印・坤印の残り時間短縮で自動起爆を早める。ダメージ・手動起爆なし                                                                                                                                                | **追加**                                                                                                                                                                                                               |
| `at_conductor` | basic               | 非 damage。自身で攻撃しない                                                                                                                                      | Conductor 自身は攻撃しない                                                                                                                                                                                             | 現行 `at_conductor_basic_attack` JSON は **廃棄**。**追加**（非 damage basic）                                                                                                                                                                                                 |
| `at_conductor` | Lv0 passive 1       | Damage Observation。スキル非発動中、戦場で発生した damage の一部を蓄積プールへ加算                                                                               | スキル非発動時間の価値創出、damage 流量の観測、蓄積システムの基盤                                                                                                                                                      | **追加**。採用候補。新 state（damage reservoir）/ effect（damageObservation）が必要。editor / validate / `formatSkillText` / docs 同期                                                                                                                                         |
| `at_conductor` | Lv0 passive 2       | Self Reservoir。Conductor が受けた damage を全量蓄積プールへ加算                                                                                                 | Defender 副属性。後列狙い・範囲攻撃への耐性価値。「受けた流れも記録する」                                                                                                                                              | **追加**。採用候補。self damage → reservoir 転送 effect が必要                                                                                                                                                                                                                 |
| `at_conductor` | Lv10 passive        | Enhanced Observation。スキル非発動中の damage 回収量増加                                                                                                         | 蓄積システムの成長。シンプルな上位 passive                                                                                                                                                                             | **追加**。採用候補。damageObservation 係数拡張                                                                                                                                                                                                                                 |
| `at_conductor` | Lv20 passive        | Advanced Observation。スキル非発動中の damage 回収量増加（上位）                                                                                                 | 蓄積システム最終強化。数値成長担当                                                                                                                                                                                     | **追加**。採用候補。damageObservation 係数拡張                                                                                                                                                                                                                                 |
| `at_conductor` | Lv0 active 1        | Convergence Field（集中法陣）。地点指定範囲 + 持続。法陣内 damage を収束。敵は現在 HP 絶対値最大へ、味方は現在 HP 絶対値最大へ                                   | Damage Concentration。基本スキル                                                                                                                                                                                       | **追加**。現行 `at_conductor_active_1`（大法陣）JSON は **廃棄**                                                                                                                                                                                                               |
| `at_conductor` | Lv0 active 2        | Distribution Field（分散法陣）。法陣内 damage を頭割り。敵集団 / 味方集団内で分散                                                                                | Damage Distribution。強めスキル                                                                                                                                                                                        | **追加**。現行 `at_conductor_active_2`（小法陣）JSON は **廃棄**                                                                                                                                                                                                               |
| `at_conductor` | Lv10 active 3       | Continuous Observation。永続自己強化。発動後、スキル発動中の damage もごく一部を蓄積プールへ加算（非スキル中回収とは別枠・低係数）。軽減・転送・無効化は行わない | Observation Expansion。「法陣展開中も流量を観測できる」                                                                                                                                                                | **追加**。採用候補。activeObservation または damageObservation 発動中拡張が必要                                                                                                                                                                                                |
| `at_conductor` | Lv20 active 4       | Reflux Field（返流法陣）。法陣展開中、法陣内 damage を追加で蓄積へ記録（通常適用は維持）。法陣終了時、蓄積プールを敵へ再配分                                     | Damage Recycling。戦場 damage を貯留し再び放流する完成形                                                                                                                                                               | **追加**。採用候補。damageRecycling、reservoir 放出 effect が必要                                                                                                                                                                                                              |

Caster pass の実装方針:

- **`at_sorcerer`:** R12l で新仕様へ置換済み。現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の魔術師 R12l 節および [combat.md](../spec/combat.md) §種火 / 発火。旧種火 DoT / 熾火 / active 連鎖は再利用不可。
- Sigilist は **乾印 / 坤印**（`windMark` / `earthMark`）の付与と **手動起爆** が火力の核。通常攻撃と active は直接ダメージを与えない（P1 印術が通常攻撃を置換）。敵数で乾印 / 坤印を切替。自動起爆は拡散 / 収束のみでダメージなし。旧 Branch `conditionalEffect` 案は **不採用**（2026 再設計）。**数値 TBD（閾値・持続・ダメージ式等）は Phase 9a 実装まで保留** — [classes-and-skills.md §数値 TBD](../spec/classes-and-skills.md#数値tbd実装まで保留) / [combat.md](../spec/combat.md#印術師の印乾印坤印)。詳細は [classes-and-skills.md §印術師](../spec/classes-and-skills.md#印術師at_sigilist拡張) / [combat.md §印術師の印](../spec/combat.md#印術師の印乾印坤印)。
- Conductor は地点指定範囲 / 持続範囲を Hunter と共有するが、置く effect が異なる。Hunter は DoT 圧縮 / 行動制限、Conductor は damage concentration / distribution / recycling を置く。既存 AoE / scatter 攻撃は正本にせず、通常攻撃を含めて自分で damage を出さない。ダメージ軽減職・ATK/DEF buff 職ではなく、damage の発生量を直接増減せず routing / distribution / recycling が主役。蓄積プールは主役ではなく補助エンジン。成長ラインは Lv0=観測・集中・分散、Lv10=観測拡張、Lv20=再循環。
- `at_sorcerer` は R12l 置換済み（正本上記）。`at_sigilist` 向けの乾印 / 坤印（`windMark` / `earthMark`）・手動起爆系、`at_conductor` 向け damage reservoir 系は **Phase 9 以降**。
- `at_sigilist` と `at_conductor` の現行 `data/skills/actives/*.json` は設計確定に伴い **廃棄済み**。`classes.json` の Lv0 active 習得も空。新スキルは Phase 8 以降に設計表どおり追加する。

## Survival

| classId         | 設計の柱                                                                | 現行スキル                                                                                           | v1 確定方針                                                                                                             | 実装影響                                                                                |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `sp_cleric`     | Recovery Control。欠損 HP の即時復元、余剰回復を barrier 化             | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の療養師 R12l 節 | （同上） | 旧 Lv active inventory は再利用不可 |
| `sp_wardweaver` | Stability Control。崩壊前猶予、barrier max、障壁（ward）、先読み smart  | **実装済**（2025 リデザイン）                                                                        | Lv0: heal 補助 + barrier 特効 + 枯渇回復。Lv10: 単体 barrierStack。Lv20: 三重の障壁（障壁 2+バリア）                    | `barrierDepletionHeal` / `wardBarrier` / `pendingIncomingDamage` / `fireConditionMatch` |
| `sp_alchemist`  | Sustain Control。薬効浸潤（`herbalPotency`）HoT + stack 蓄積 + 薬効顕現 | **実装済**（2025 リデザイン）                                                                        | Lv0: aura + stack 基礎 + 近接 HoT。Lv20: 体質段階 + 薬効顕現                                                            | `herbalPotency` / `herbalPotencyConsume` / `stackOnApply` / `potencyStackScale`         |

### Supporter 枠確定案

Supporter 3 種は「回復量の大小」ではなく、損失を処理するタイミングで分ける。

| classId         | 枠                  | 方針                                                                                                                         | 採否                                                              |
| --------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sp_cleric`     | （全枠）            | **R12l で新仕様へ置換済み。** 現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の療養師 R12l 節。旧 Lv active 表は再利用不可 | （旧 Supporter Lv 表は削除） |
| `sp_wardweaver` | basic               | 最低 HP 味方へ heal ATK×0.7 のみ（barrier なし）                                                                             | **実装**                                                          |
| `sp_wardweaver` | Lv0 passive 1-2     | 低 HP barrier 特効 1.25、バリア枯渇時 instant heal                                                                           | **実装**                                                          |
| `sp_wardweaver` | Lv10 / Lv20 passive | Lv10: Wave 開始全体 barrier×0.5（`passive_3`）。Lv20: `barrierBreakRegen`（`passive_4`）                                     | **実装**                                                          |
| `sp_wardweaver` | Lv0 active 1        | 支えの御盾: heal×0.35 + barrier×1.9                                                                                          | **実装**                                                          |
| `sp_wardweaver` | Lv0 active 2        | 双璧の護り: barrier×2 multiLock、smart HP≤50%、`targetBarrierBelowGrant`                                                     | **実装**                                                          |
| `sp_wardweaver` | Lv10 active 3       | 庇護の帷: aoe barrier×1.0 + 範囲内 HP 最低へ `barrierStack` barrier×1.25                                                     | **実装**                                                          |
| `sp_wardweaver` | Lv20 active 4       | 三重の障壁: 障壁 ×2 + barrier×1.25、smart any（先読み OR HP≤50%）                                                            | **実装**                                                          |
| `sp_alchemist`  | basic               | 最低 HP 比率の味方へ短い `percentMaxHp` HoT（即時 heal なし）                                                                | `sp_alchemist_basic_attack`（薬手当て）**実装**                   |
| `sp_alchemist`  | Lv0 passive 1-2     | `herbalPotency` aura + stack 基礎、高 HP ally hp buff                                                                        | **実装**                                                          |
| `sp_alchemist`  | Lv10 / Lv20 passive | dot 限定 `periodicDispel`、体質段階（max stack 9）                                                                           | **実装**                                                          |
| `sp_alchemist`  | Lv0 active 1        | 近接帯 HoT + `stackOnApply`（敵 debuff なし）                                                                                | **実装**                                                          |
| `sp_alchemist`  | Lv0 active 2        | 薬香の霧: 味方全体中程度 HoT                                                                                                 | **実装**                                                          |
| `sp_alchemist`  | Lv10 active 3       | 滋養強壮薬: 味方全体長 HoT + hp flat buff                                                                                    | **実装**                                                          |
| `sp_alchemist`  | Lv20 active 4       | 薬効顕現: 全 stack 消費 + `conditionalEffect` 分岐（即時 heal なし）                                                         | **実装**                                                          |

Supporter pass の実装方針:

- **`sp_cleric`:** R12l で新仕様へ置換済み。現行正本は [classes-and-skills.md](../spec/classes-and-skills.md) の療養師 R12l 節。旧 Lv active 方針は再利用不可。
- `sp_wardweaver` は direct heal 量を主役にしない。heal は barrier を成立させる補助で、役割の本体は barrier / damageTaken / Wave 猶予。
- `sp_alchemist` は毒・罠による Field Flow へ寄せない。敵への干渉は Survival 範囲の ATK debuff / 被害速度低下に限定する。
- `sp_alchemist` の味方 ATK buff は Lv10 以降なら許容する。ただし [`classes-and-skills.md`](../spec/classes-and-skills.md) の Survival 設計原則を正とし、Kill 主目的の火力支援ではなく、近接帯の味方を長く戦わせる継戦リズム調整として実装する。
- debuff cleanse は薬草師専用だが、active 化しない。passive の Wave 回数限定解除に閉じ、解除が必須になる戦闘設計にはしない。

## 優先実装順

1. **Supporter** — `sp_cleric` は **R12l で新仕様へ置換済み**（正本: classes-and-skills.md 療養師 R12l 節）。`sp_wardweaver` / `sp_alchemist` は本表の各節を参照。
2. **Defender** — `df_guardian` は **R12l で新仕様へ置換済み**（正本: classes-and-skills.md 鉄衛士 R12l 節）。`df_paladin` / `df_duelist` は本表の各節を参照。
3. **物理 Kill / Flow 6 種の passive / active Lv10 / Lv20 追加**
   - 多くは既存 effect で進められる。Hunter と Ballista の新メカニクスだけゲート化する。
4. **Caster** — `at_sorcerer` は **R12l で新仕様へ置換済み**（正本: classes-and-skills.md 魔術師 R12l 節 / combat.md §種火 / 発火）。印術師・法陣師は独自システムのため **Phase 8 以降**（設計は本表で確定済み、JSON / combat 実装は送る）。
5. **印術師・法陣師（Phase 8 以降）**
   - `at_sigilist`: 乾印（`windMark`）/ 坤印（`earthMark`）、印術 basic、手動 / 自動起爆、`data/skills/` 投入。
   - `at_conductor`: damage reservoir、法陣 routing / recycling、地点指定範囲、非 damage basic。

## 実装チャットへ渡す単位

| 実装単位        | 対象                                         | 目的                                                                                    |
| --------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| Supporter pass  | `sp_cleric`（**R12l 置換済**）, `sp_wardweaver`, `sp_alchemist` | `sp_cleric` は classes-and-skills.md 療養師 R12l 節を正本。他は Survival 構造確定 |
| Defender pass   | `df_guardian`（**R12l 置換済**）, `df_paladin`, `df_duelist`    | `df_guardian` は classes-and-skills.md 鉄衛士 R12l 節を正本。他は 4 枠化・重複整理 |
| Physical pass A | `at_swordsman`（**R12l 置換済**）, `at_assassin`, `at_ranger`     | `at_swordsman` は classes-and-skills.md 剣術士 R12l 節を正本。他は Kill 4 枠化 |
| Physical pass B | `at_lancer`, `at_ballista`, `at_hunter`      | **実装済**（Lancer / Ballista / Hunter）。Flow / pierce / trap / siege のゲート整理完了 |
| Caster pass A   | `at_sorcerer`（**R12l 置換済**）             | 正本は classes-and-skills.md 魔術師 R12l 節 / combat.md §種火 / 発火                    |
| Caster pass B   | `at_sigilist`, `at_conductor`                | 独自システム実装（**Phase 8 以降**）。設計確定は本表、JSON / combat / tooling は未着手  |
| Tooling pass    | editor / validate / `formatSkillText` / spec | 新 effect / targetShape / condition を採用した場合の同期                                |

## 未決事項

- `at_sigilist` / `at_conductor` の combat 実装タイミングは **Phase 8 以降**（独自システムのため Phase 3 では設計確定のみ）。
- Hunter の DoT 圧縮 / `hasDot` / `placedField` は **Physical pass B 実装済**（[combat.md](../spec/combat.md) §DoT 圧縮・延長・持続罠）。視界・命中干渉は将来ゲートに残す。
- Ballista の `maxHp` target / `idleAtkRamp` / `ballistaMark` 等は **Physical pass B 実装済**（[classes-and-skills.md](../spec/classes-and-skills.md) §弩砲士）。target DEF 参照追加ダメージ・フィールド端貫通ラインは将来ゲートに残す。

## 完了条件

- 15 クラスすべてに basic + Lv0 2 passive + Lv10 passive + Lv20 passive + Lv0 2 active + Lv10 active + Lv20 active が存在する。
  - **例外:** `at_sigilist` / `at_conductor` は独自システムのため Phase 8 以降まで JSON / combat 未実装を許容する。設計表と docs の確定を Phase 3 の完了条件とする。
- `data/skills/actives/*.json` に placeholder 名、未実装メモ、習得段階と矛盾するスキルが残らない。
- `classes.json` の習得テーブルがこの表の段階と一致する。
- 新 effect / target / condition を追加した場合、editor / validate / `formatSkillText` / spec が同じ作業で更新されている。
- `docs/spec/classes-and-skills.md` の TBD が、この表または実装済み仕様に置き換わっている。
