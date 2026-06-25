# スキル確定表（作業用）

最終更新: 2026-06

目的: Phase 3 再オープン中の「クラス別パッシブ / アクティブスキル再設定」を、実装チャットへ分割して渡せる粒度まで整理する。ここでは数値バランスではなく、**クラスの役割、習得段階、既存スキルの採否、実装影響**を確定対象にする。

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

## 判定ラベル

| ラベル | 意味 |
| --- | --- |
| **残す** | 現行スキルの役割・形状を v1 に採用する。名称・数値調整は可 |
| **見直し** | 方向性は近いが、対象・習得段階・効果形状を再定義する |
| **追加** | Lv10 / Lv20 など未配置枠へ新規スキルを足す |
| **置換** | 現行スキルを別コンセプトへ差し替える |
| **要判断** | 新メカニクス導入可否または設計判断が必要 |

## 共通の実装ゲート

| ゲート | v1 方針 |
| --- | --- |
| `conditionalEffect` | 印術師の核として採用候補。ただし editor / validate / text / spec 同期が必須 |
| Hit / Attack / Gauge | 仕様語としては重要。ただし gauge 系は v1 では増やさず、既存の `basicAttackCount`, `hitCount`, `basicAttackTransform` で代替する |
| 貫通ライン | 槍術士・弩砲士の核。既存 `targetShape: pierce` で表現できる範囲を優先し、フィールド端貫通などは別ゲート |
| 地点指定範囲 / 持続範囲 | 単純な範囲攻撃、狩猟士の罠範囲、法陣師の法陣範囲で共有する。範囲指定そのものは共通化し、単発 effect なら通常範囲攻撃、持続効果を持たせれば罠 / 法陣 / 領域効果として扱う。狩猟士は DoT 圧縮 / 行動制限、法陣師は damage routing / transfer など、設定する effect 内容で役割を分ける。法陣師は自分で直接 damage を出さない方向を候補にする |
| 罠 / DoT 圧縮 / 行動制限 | 狩猟士の核。広範囲 DoT 火力ではなく、地点指定範囲 + 持続効果に DoT 残り時間圧縮と局所行動制限を置いて Field Flow を作る。既存 `scatter` / `dot` / `stun` は土台にできるが、地点指定範囲の持続化と DoT 圧縮は新 effect / condition ゲート |
| 法陣のダメージ分配・転送 | 法陣師の核。自分で damage を出すのではなく、既存の味方 / 敵 damage の流れを分配・転送・集中する。通常攻撃も含めて非 damage 化する場合は、新 effect / target / UI 表示が必要 |
| 反応型 heal | 療養師 Lv20 候補。v1 は `time` + `firePolicy: smart` + `fireConditions` で先行するか要判断 |
| `threatControl.frontDamageTakenReduction` | **新規設計では使わない**。Threat は「誰が殴られるか」、被ダメ軽減は「殴られた後の損失をどう減らすか」で責務が異なるため、前列被ダメ軽減は passive `damageReduction` として分離する。既存データ互換として残す場合も、新規スキル定義では `damageReductionTargetRule` 側へ移す |
| 魔法 block | Paladin 後半 passive 候補。現行 block は物理直接ダメージ対策なので、魔法も block 可能にするなら新フィールドまたは新 effect が必要。editor / validate / `formatSkillText` / combat / spec 同期が必須 |

## Passive 監査表

| classId | 現行 passive | v1 確定方針 |
| --- | --- | --- |
| `df_guardian` | block、Threat 維持、旧 Wave barrier 重複 | **v1.6 確定**。Lv0=大盾使い+立ちはだかる壁。Lv10=迎撃態勢（`blockResonance`）。Lv20=不撓の誓い。barrier / 重複 passive 削除 |
| `df_paladin` | block、front Threat floor、全体 barrier、全体 damageReduction | **v1 確定・実装済**。護身手 / 護法陣 / 真言加護 / 不退転 + 光明剣 / 障身法 / 慈光 / 降魔光明。`frontBlockAura` / 魔法 block / `lastStandRecovery` |
| `df_duelist` | block、低 HP DEF / ATK、counter | **残す**。Duelist の被弾起点・反撃・低 HP 逆転を passive 側の核にする |
| `at_warrior` | 高 DEF 狙い、DEF 無視 | **残す**。Warrior の高 DEF 単体処理の正本 |
| `at_assassin` | 低 HP 比率狙い、evasion、低 HP 対象 damage bonus | **残す**。瀕死処理と背後アクセスの補助に限定し、Defender 的な生存性能には寄せない |
| `at_lancer` | pierce 範囲 ATK debuff、近傍 ally ATK aura | **残す**。Position Flow の常時圧力として扱う |
| `at_ranger` | 遠隔敵優先、attackSpeed buff、ranged counter | **残す / 見直し**。遠隔敵処理と連射構造は残す。counter は Lv 段階または active との重複を確認する |
| `at_ballista` | 高 Max HP 狙いが重複、DEF 無視が古い仕様として残存 | **整理 / 置換**。高 HP targeting は 1 つに統合し、常時 DEF 無視は外す。高 Max HP 対象に限り、相手 DEF 参照の追加ダメージなど「重装甲を重撃へ変換する」新 effect 候補を許容する |
| `at_hunter` | debuff 中対象への damage bonus | **置換**。古い Kill 寄り仕様として外し、DoT 圧縮・行動制限・拘束精度を支える Field Flow passive へ置き換える |
| `at_sorcerer` | 現行データ上、専用 passive 未確認 | **追加候補**。条件分岐なしの安定出力を支える、魔法 damage / multiLock 再配分補助などを検討 |
| `at_sigilist` | 現行データ上、専用 passive 未確認 | **追加 / 説明 passive 候補**。Lv0 passive 1 は「条件でスキル効果が分岐する」ことを明示するクラス説明 passive でもよい。数値補助を無理に入れない |
| `at_conductor` | AoE crowd bonus、AoE / scatter 攻撃寄り active（旧 `at_geomancer`） | **置換**。既存攻撃スキルは正本にしない。Conductor は自身で damage を出さず、観測・蓄積・法陣による damage routing / distribution / recycling を扱う |
| `sp_cleric` | 低 HP heal 強化、余剰 heal → barrier、Lv10 余剰 heal 転送、Lv20 癒しの残響 | **残す / 実装済**。Recovery Control の核。passive 3 = `excessHealRedirect`、passive 4 = `healReservation` |
| `sp_wardweaver` | 低 HP barrier 特効、枯渇回復、障壁（ward）、先読み smart | **実装済**（Stability Control リデザイン） |
| `sp_alchemist` | party HoT aura、高 HP ally DEF、Wave 回数限定の debuff cleanse | **残す**。debuff cleanse は薬草師専用の補助個性だが、必須インフラにはしない |

## Defender

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `df_guardian` | 前線構築。単一路線の完全防衛、高 HP 正面受け、被弾による前線押上 | v1.6: basic+4passive+4active。`active_3` 鉄身、`active_4` 城塞の構え | **v1.6 実装済**。barrier / HoT 候補は削除。迎撃態勢・不退・城塞で前線保持を強化 | `blockResonance` / `lastStandInvulnerable` / `invulnerable` overlay / `blockResonanceConsume` |
| `df_paladin` | 戦線安定。範囲・魔法ダメージを含む戦場全体の被害緩和 | v1: 護身手 / 護法陣 / 真言加護 / 不退転 + 光明剣 / 障身法 / 慈光 / 降魔光明 | **v1 実装済**。Defender 内唯一の barrier（障身法）。前列 block + 魔法 block + 半復活 DR | `frontBlockAura` / 魔法 block / `lastStandRecovery` / `targetFormationRow` |
| `df_duelist` | 攻撃防御。単体強敵への制圧・拘束・カウンター・行動阻害 | `active_1` 戦叫び、`active_2` 体力温存、`active_3` 隙撃ち、`active_4` 血気煽り | 4 枠構造は最も進んでいるため **残す** 寄り。`active_4` の全敵 ATK debuff + 自己被害増は範囲が広いので、単体強敵制圧へ寄せる | 既存 debuff / damageDelay / stun / damageIncrease で対応可能。数値は Phase 8 |

### Defender 枠確定案

Defender 3 種は「硬さの大小」ではなく、被害入口の作り方で分ける。Threat は [combat.md](../spec/combat.md) の受け口設計値を正とし、恒常的な受け口は passive 側へ寄せる。active は一時的な防御・保護・制圧として扱い、active だけで Defender の Threat 構造を成立させない。

| classId | 枠 | 方針 | 採否 |
| --- | --- | --- | --- |
| `df_guardian` | basic | 最近接敵への通常攻撃。main tank の Threat は basic 火力ではなく passive で維持する | 現行 `df_guardian_basic_attack` を **残す** |
| `df_guardian` | Lv0 passive 1-2 | block + 被弾 / block による Threat 維持。Guardian は単体前線の main tank | **v1.6 確定**（大盾使い / 立ちはだかる壁） |
| `df_guardian` | Lv0 active 1-2 | 防御強化 / 防御専念 | **v1.6 残す** |
| `df_guardian` | Lv10 / Lv20 passive | 迎撃態勢（`blockResonance`）+ 不撓の誓い（`lastStandInvulnerable`） | **v1.6 確定** |
| `df_guardian` | Lv10 active 3 | 鉄身: smart 自己 `damageTaken` 低下（息入れ HoT 廃止） | **v1.6 確定** |
| `df_guardian` | Lv20 active 4 | 城塞の構え: `blockResonanceConsume` + 構え中 block 範囲反撃 | **v1.6 確定** |
| `df_paladin` | basic | 最近接敵への通常攻撃。火力ではなく前線安定の補助 | 現行 `df_paladin_basic_attack` を **残す** |
| `df_paladin` | Lv0 passive 1-2 | 護身手（`frontBlockAura`）+ 護法陣（`threatControl` のみ） | **v1 確定** |
| `df_paladin` | Lv10 / Lv20 passive | 真言加護（魔法 block）+ 不退転（`lastStandRecovery`） | **v1 確定** |
| `df_paladin` | Lv0 active 1-2 | 光明剣 + 障身法（前列 barrier stack） | **v1 確定** |
| `df_paladin` | Lv10 active 3 | 慈光（全体軽減 + REG、バリアなし） | **v1 確定** |
| `df_paladin` | Lv20 active 4 | 降魔光明（BAT: magic DEF ダメ + heal） | **v1 確定** |
| `df_duelist` | basic | 最近接敵への通常攻撃。Duelist は攻撃防御だが基本攻撃は標準でよい | 現行 `df_duelist_basic_attack` を **残す** |
| `df_duelist` | Lv0 passive 1-2 | block + 低 HP DEF など、被弾を耐える基礎 | 現行 passive を **整理** し、Lv0 2 枠へ収める |
| `df_duelist` | Lv10 / Lv20 passive | counter、低 HP ATK など、被弾を反撃・制圧へ変換する段階強化 | **追加 / 整理** |
| `df_duelist` | Lv0 active 1 | 敵の攻撃速度低下。単体強敵または近傍敵の行動密度を落とす | 現行 `df_duelist_active_1`（戦叫び）を **残す** |
| `df_duelist` | Lv0 active 2 | damageDelay による被害の一時預かり。正面受けではなく局所戦闘の時間稼ぎ | 現行 `df_duelist_active_2`（体力温存）を **残す** |
| `df_duelist` | Lv10 active 3 | debuff 中対象への追撃 + stun。制圧から反撃へつなぐ | 現行 `df_duelist_active_3`（隙撃ち）を **残す** |
| `df_duelist` | Lv20 active 4 | 全敵弱体ではなく、単体強敵を挑発的に崩す上位制圧へ寄せる。自己被害増はリスク演出として残すか要確認 | 現行 `df_duelist_active_4`（血気煽り）を **見直し** |

Defender pass の実装方針:

- Guardian の Threat 維持は passive `threatControl` を正本にする。active では Threat 値を直接操作せず、受け続けるための防御状態を作る。
- Paladin の Threat は front 全体の受け口を安定させる passive を正本にする。active は barrier / damageTaken / 補助 heal で前線崩壊を遅らせる。
- Paladin の Lv0 passive 2 枠は `frontThreatFloor` 系 + 前列 `block` aura に使う。盾を持つ直感を優先しつつ、自己だけでなく front 全体を守る shared tank として表現する。
- Paladin の前列被ダメ軽減は `threatControl` に含めない。Threat 制御と damage reduction は責務が異なるため、必要なら前列向け `damageReduction` passive として別スキル化する。ただし Lv0 の柱は前列 block を優先する。
- 現行 block は物理直接ダメージのみの対策とする。Paladin が魔法も block できるようになるのは Lv10 / Lv20 passive の候補であり、実装時は新メカニクスとして扱う。
- Duelist は Threat を広域に集める main tank ではなく、被弾・反撃・制圧で単体強敵を崩す local tank として扱う。
- Defender active に新 effect を増やさない。既存の `buff`, `debuff`, `barrier`, `damageDelay`, `stun`, `damageIncrease`, `basicAttackTransform` の範囲で実装する。

## Physical Kill / Flow

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `at_warrior` | 単体安定。高 DEF 単体を DEF 貫通・固定 DPS で処理 | `active_1` 叩き付け、`active_2` 薙ぎ払い。`active_3` / `active_4` 未配置 | `active_1` は **残す**。`active_2` は範囲処理に寄りすぎる場合、近接標準の複数対応として弱めに維持。Lv10 は armor break / 高 DEF 追撃、Lv20 は高 DEF 対象への上位単体処理を **追加** | 既存 damage / defenseIgnore / debuff で対応可能 |
| `at_assassin` | 高速処理。Hit 数、背後侵入、瀕死処理 | `active_1` 引き裂き、`active_2` 影の刃。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は basic attack / hitCount / attack count を使った回転加速、Lv20 は瀕死対象の execute 系を **追加** | gauge は増やさず、既存 `basicAttackCount`, `hitCount`, `damageIncrease` で表現する |
| `at_lancer` | Position Flow。前線バフ・前線デバフ・接敵領域制御 | `active_1` 踏み込み突き、`active_2` 足払い。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は味方近接への ATK aura / 戦線維持、Lv20 は pierce + stun / knockback など前線再形成を **追加** | 既存 pierce / buff / debuff / stun を優先。knockback 採用時は combat / text 同期確認 |
| `at_ranger` | 連射変形。攻撃回数、攻撃速度、遠隔敵処理 | `active_1` 連射、`active_2` 連ね矢。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は連射の維持・回転改善、Lv20 は遠隔敵優先を強める上位 volley を **追加** | 既存 hitCount / basicAttackTransform / attackSpeed buff で対応可能 |
| `at_ballista` | 貫通重撃。高 Max HP 対象、時間圧縮、貫通範囲 | `active_1` 重撃態勢、`active_2` 貫く一射。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は reload / stance のリズム改善、Lv20 は高 Max HP 対象へ大きく刺さる siege shot を **追加** | 既存 pierce / target HP 条件で v1 可。フィールド端貫通ラインは要判断 |
| `at_hunter` | Field Flow。罠、DoT 圧縮、行動制限、戦闘テンポ制御 | `active_1` 毒罠、`active_2` 拘束罠。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **見直し / 残す**。罠範囲は法陣師と同じ地点指定範囲を使い、広範囲 DoT 火力ではなく、短い局所 DoT を圧縮し、stun / moveLock / knockback / attackSpeed debuff などの行動制限へつなぐ。命中・視界干渉は v1 では増やさない | 地点指定範囲は法陣師と共有。scatter / dot / stun / atk debuff は既存土台。DoT 圧縮は新規 effect / condition ゲート。命中干渉・視界妨害は将来ゲート |

### Physical pass A 枠確定案

Warrior / Assassin / Ranger は v1 では新 effect を増やさず、既存の target override、defenseIgnore、specialEffect、hitCount、basicAttackTransform、damageIncrease を中心に 4 枠化する。

| classId | 枠 | 方針 | 採否 |
| --- | --- | --- | --- |
| `at_warrior` | basic | 最近接敵への標準物理攻撃 | 現行 `at_warrior_basic_attack` を **残す** |
| `at_warrior` | Lv0 passive 1-2 | 高 DEF 敵優先 + DEF 無視。Warrior の「高 DEF 単体処理」を Lv0 で成立させる | 現行 `at_warrior_passive_1` / `at_warrior_passive_2` を **残す** |
| `at_warrior` | Lv10 / Lv20 passive | 高 DEF 対象への安定性を段階強化。Paladin と組むと前衛 sub-defender も担うため、攻撃を続けるための防御手段も候補にする。近接 counter も可 | **追加 / 整理**。既存 counter / buff / barrier の範囲を優先 |
| `at_warrior` | Lv0 active 1 | 高 HP または高 DEF 対象へ重い単体打撃 | 現行 `at_warrior_active_1`（叩き付け）を **残す** |
| `at_warrior` | Lv0 active 2 | 近接標準の複数対応。主役は単体処理なので範囲火力に寄せすぎない | 現行 `at_warrior_active_2`（薙ぎ払い）を **残す / 弱めに整理** |
| `at_warrior` | Lv10 active 3 | armor break / 高 DEF 追撃。DEF debuff または高 DEF 条件 damageIncrease。攻撃命中時に短い self damageTaken 低下 / barrier を得る案、または近接 counter を付与する案も可 | **追加** |
| `at_warrior` | Lv20 active 4 | 高 DEF 対象への上位単体処理。大技だが汎用 AoE にはしない | **追加** |
| `at_assassin` | basic | 2 Hit 通常攻撃。Hit 密度の基礎 | 現行 `at_assassin_basic_attack` を **残す** |
| `at_assassin` | Lv0 passive 1-2 | 低 HP 比率狙い + evasion。瀕死処理と背後アクセスの補助 | 現行 `at_assassin_passive_1` / `at_assassin_passive_2` を **残す** |
| `at_assassin` | Lv10 / Lv20 passive | 低 HP 対象 damage bonus、Hit / basic attack count との相互作用。防御職化しない。回避は既に Lv0 passive にあるため、追加防御を重ねない | 現行 `at_assassin_passive_3`（刈り取り）を Lv10 候補として **残す / 整理**。Lv20 は **追加** |
| `at_assassin` | Lv0 active 1 | DoT 付与 + debuff 対象への追加ダメージ。瀕死処理の下準備 | 現行 `at_assassin_active_1`（引き裂き）を **残す** |
| `at_assassin` | Lv0 active 2 | 背後侵入 + 低 HP 条件の追撃。rear assault は Kill アクセスであり前線保持ではない | 現行 `at_assassin_active_2`（影の刃）を **残す** |
| `at_assassin` | Lv10 active 3 | 連撃回転の加速。`basicAttackCount` / `hitCount` / `basicAttackTransform` の範囲で表現 | **追加** |
| `at_assassin` | Lv20 active 4 | execute 系。瀕死対象を処理する上位 finisher | **追加** |
| `at_ranger` | basic | 遠隔物理の標準攻撃 | 現行 `at_ranger_basic_attack` を **残す** |
| `at_ranger` | Lv0 passive 1-2 | 遠隔敵優先 + attackSpeed。遠隔処理と連射構造を Lv0 で成立させる | 現行 `at_ranger_passive_1` / `at_ranger_passive_2` を **残す** |
| `at_ranger` | Lv10 / Lv20 passive | 応射 / 連射維持 / 遠隔敵への継続火力強化。counter は Lv0 ではなく段階強化に置く | 現行 `at_ranger_passive_3`（応射）を Lv10 候補として **残す / 整理**。Lv20 は **追加** |
| `at_ranger` | Lv0 active 1 | 2 Hit の連射攻撃 | 現行 `at_ranger_active_1`（連射）を **残す** |
| `at_ranger` | Lv0 active 2 | 一定時間 basic の Hit 構造を変形 | 現行 `at_ranger_active_2`（連ね矢）を **残す** |
| `at_ranger` | Lv10 active 3 | 連射の維持・回転改善。attackSpeed buff または basicAttackTransform 延長系 | **追加** |
| `at_ranger` | Lv20 active 4 | 遠隔敵優先を強める上位 volley。対象は遠隔敵または複数ロック | **追加** |

Physical pass A の実装方針:

- Warrior は高 DEF 対象処理を崩さない。範囲対応は副次で、Ranger / Hunter の領域を奪わない。Paladin と組んだ際は前衛 sub-defender も担うため、Lv10 以降に攻撃寄りの防御手段を持ってよい。ただし Guardian 的な受け専用性能ではなく、攻撃継続のための短時間 barrier / damageTaken 低下、または近接 counter に留める。Ranger の応射は遠隔 counter、Warrior は近接で受けて返す counter として分ける。
- Assassin の rear assault は Kill アクセスであり、Threat / frontline ownership を変えるものではない。
- Assassin は既に Lv0 passive に evasion を持つため、防御手段をさらに積むより、Hit 密度・瀕死処理・回転加速へ伸ばす。
- Ranger は Hit 数と attackSpeed の相互作用を軸にする。counter は遠隔敵制圧の段階強化として扱い、Lv0 から過剰に盛らない。
- Gauge は v1 では増やさない。`basicAttackCount`, `hitCount`, `basicAttackTransform`, `damageIncrease` で表現する。

### Physical pass B 枠確定案

Lancer / Ballista / Hunter は、物理職の中でも「対象をどう倒すか」だけでなく、戦線・射線・局所領域をどう作るかを扱う。既存 `pierce` / `scatter` / `dot` / `stun` / `buff` / `debuff` / `targetRuleOverride` / `defenseIgnore` / `skillPropertyOverride` を優先するが、Flow を成立させるために必要な新 trigger / condition / effect はゲート化して採用候補にする。Lancer の「前列味方被攻撃時の援護反撃」を採用する場合は、現行 counter が自己被弾専用のため新 trigger が必要になる。Ballista の「高 Max HP 対象」を厳密に扱う場合は、現行 `stat: "hp"`（現在 HP）ではなく `maxHp` target 拡張が必要になる。また現状は高 HP / 高 Max HP 対象への `specialEffect` 条件も存在しないため、Ballista の高耐久特効を実装するなら新 condition が必要になる。Hunter は広範囲 DoT 火力ではなく DoT 圧縮と行動制限を主軸にするため、DoT 圧縮 effect が新規実装対象になる。罠の範囲指定は法陣師と同じ地点指定範囲を使い、Hunter / Conductor の違いは範囲形状ではなく配置する effect 内容で分ける。地点指定範囲は単発範囲攻撃にも使える汎用 target とし、持続効果を組み合わせると罠 / 法陣 / 領域効果になる。

| classId | 枠 | 効果カテゴリ・対象・条件 | 方針 | 採否 / 実装影響 |
| --- | --- | --- | --- | --- |
| `at_lancer` | basic | physical damage。対象は自身前方 `selfOrigin` の `pierce`。条件なし | 槍術士の通常攻撃自体を Position Flow の常時圧力にする | 現行 `at_lancer_basic_attack` を **残す**。新実装なし |
| `at_lancer` | Lv0 passive 1-2 | passive debuff + passive buff。敵前方 `pierce` ATK debuff、味方 `selfOrigin` + `aoe` ATK aura。条件なし | 前線に入った敵の接触圧を下げ、近傍味方の前線維持を支える | 現行 `at_lancer_passive_1` / `at_lancer_passive_2` を **残す**。数値は Phase 8 |
| `at_lancer` | Lv10 / Lv20 passive | passive buff / debuff / assist counter 候補。対象は前線敵または近傍味方。援護反撃は「自分以外の前列味方が攻撃された時」を条件に、攻撃者へ反撃 | Lv0 の前線圧力を段階強化する。Kill 対象特化や Defender 的 Threat 操作には寄せず、前列の横連携として扱う | **追加**。援護反撃を採用する場合は既存 counter では不可。`frontAllyDamaged` / `allyDamaged` 系 trigger、editor / validate / `formatSkillText` / combat / spec 同期が必要 |
| `at_lancer` | Lv0 active 1 | move + physical `pierce` damage。対象は nearest enemy へ接近後、自身前方 `selfOrigin` | 戦線へ踏み込んで前方ラインへ圧力を作る | 現行 `at_lancer_active_1`（踏み込み突き）を **残す** |
| `at_lancer` | Lv0 active 2 | physical `pierce` damage + `stun` / DEF debuff。対象は自身前方 `selfOrigin`。条件なし | 前線に入った敵群の足を止め、接敵領域を一時的に薄くする | 現行 `at_lancer_active_2`（足払い）を **残す / 整理**。stun と stat debuff の形状を実装時に確認 |
| `at_lancer` | Lv10 active 3 | buff / debuff / pierce damage 候補。対象は近傍味方または自身前方敵。条件は位置・範囲のみ | 味方近接帯の押し上げ、または敵前線の ATK / DEF 低下で戦線を維持する | **追加**。既存 buff / debuff / pierce で対応 |
| `at_lancer` | Lv20 active 4 | pierce + stun、または knockback を含む前線再形成。対象は自身前方ライン | 上位 Position Flow。敵を倒す大技ではなく、崩れた接触ラインを作り直す | **追加**。knockback 採用時は既存実装・`formatSkillText`・editor 表示を確認。未対応なら pierce + stun に留める |
| `at_ballista` | basic | physical single damage。対象は通常 enemy target。条件なし | 遠隔物理の重撃前提の標準射撃 | 現行 `at_ballista_basic_attack` を **残す** |
| `at_ballista` | Lv0 passive 1-2 | targetRuleOverride + 高 HP / 高 Max HP 特効候補。対象は高 Max HP 敵優先。条件は高 HP / 高 Max HP 対象 | 高 HP targeting は 1 枠へ統合し、もう 1 枠は高耐久処理の攻城性へ寄せる。常時 DEF 無視は古い仕様の残骸として採用しない | `at_ballista_passive_1` / `passive_2` の重複を **整理**。`at_ballista_passive_3`（常時 DEF 無視）は **置換 / 削除**。Max HP 厳密化は `maxHp` target 拡張が必要 |
| `at_ballista` | Lv10 / Lv20 passive | skillPropertyOverride / specialEffect / target DEF 参照追加ダメージ候補。対象は自身または高 Max HP target。条件は高 HP / 高 Max HP 対象 | reload / stance の扱いや貫通射撃の保持を段階強化する。高 HP ボス / エリートが高 DEF でも完全に止まらないよう、DEF 対策は「無視」ではなく「装甲を重撃の追加量に変える」方向を優先する | **追加 / 整理**。高 HP 特効は現状存在しないため新 condition が必要。target DEF 参照追加ダメージを採用する場合は新 effect / amount 参照として tooling 同期必須。Warrior の高 DEF 処理を奪わないよう high maxHp 条件つきにする |
| `at_ballista` | Lv0 active 1 | self ATK buff + self attackSpeed debuff。発動は `targetHp` smart 条件 | 重撃態勢として残す。火力増減の数値は扱わず、攻撃間隔を火力へ変換する構造を採用する | 現行 `at_ballista_active_1`（重撃態勢）を **残す**。数値は Phase 8 |
| `at_ballista` | Lv0 active 2 | physical `pierce` damage + hold。対象は自身前方 `selfOrigin`。発動は enemyCount smart 条件 | 射線上の敵をまとめて抜く攻城射撃の基礎 | 現行 `at_ballista_active_2`（貫く一射）を **残す** |
| `at_ballista` | Lv10 active 3 | reload / stance 補助。self buff、basicAttackTransform、または charge 保持候補。条件は高 HP target または enemyCount | `active_1` と `active_2` の間をつなぐ装填リズムを作る | **追加**。既存 buff / basicAttackTransform / skillPropertyOverride で検討。新 gauge は作らない |
| `at_ballista` | Lv20 active 4 | 高 Max HP 対象への siege shot。physical damage + pierce + 高 HP / 高 Max HP 特効。必要なら高 Max HP 条件つきの target DEF 参照追加ダメージ。対象は高 Max HP target / 自身前方ライン | 高耐久処理の上位枠。汎用 AoE ではなく、高 Max HP 対象と射線上の敵へ刺さる形にする。高 DEF 汎用処理にはしない | **追加**。高 HP 特効 condition を新規追加する。`maxHp` target 拡張を採用するか、現行 `hp/highest` を暫定 proxy にするか実装前に確定。DEF 無視ではなく target DEF 参照追加ダメージを入れる場合は新 effect / amount 参照として扱う。フィールド端貫通はゲートに残す |
| `at_hunter` | basic | physical single damage。対象は通常 enemy target。条件なし | 罠・DoT の補助に留める標準射撃 | 現行 `at_hunter_basic_attack` を **残す** |
| `at_hunter` | Lv0 passive 1-2 | trap 補助 / DoT 圧縮補助 / 行動制限補助。対象は自身の罠スキル、または dot / stun / moveLock / attackSpeed debuff 中の敵 | `追い込み` の damage bonus は古い Kill 寄り仕様として置換する。Lv0 は罠が Field Flow として働く精度を支える | 現行 `at_hunter_passive_1` を **置換**。DoT 圧縮補助を採用する場合は新 effect / condition と tooling 同期が必要。Lv0 2 枠目は **追加** |
| `at_hunter` | Lv10 / Lv20 passive | DoT 圧縮、行動制限時間、罠 active の性質変更候補。対象は自身の罠スキルまたは局所範囲 | Field Flow の精度・維持を段階強化する。広範囲 DoT 火力ではなく、短時間に状態を畳み、敵の行動密度を落とす | **追加**。`skillPropertyOverride` だけで足りない場合は DoT 圧縮 effect / action restriction condition を新規実装 |
| `at_hunter` | Lv0 active 1 | 地点指定範囲 + 持続効果 + dot。対象は指定地点周辺の局所範囲。条件なし | 毒罠として残すが、広範囲 DoT 火力ではなく DoT 圧縮の下準備にする。初期基本スキルとして、罠範囲と DoT 付与を分かりやすく成立させる | 現行 `at_hunter_active_1`（毒罠）を **見直し / 残す**。地点指定範囲と持続効果を入れるなら新 target / effect が必要 |
| `at_hunter` | Lv0 active 2 | 地点指定範囲 + 持続効果 + DoT 圧縮 + stun / ATK debuff / moveLock 候補。対象は指定地点周辺の局所範囲、または dot 中敵を含む局所範囲 | 拘束罠を強めスキルとして扱い、DoT 圧縮をここに入れる。敵の行動密度と接触圧を下げつつ、既存 DoT を短時間に畳んで戦闘テンポを崩す | 現行 `at_hunter_active_2`（拘束罠）を **見直し / 残す**。DoT 圧縮、地点指定範囲、持続効果、moveLock 等を使う場合は新 effect / target と既存 knockback / moveLock 仕様の整合を確認 |
| `at_hunter` | Lv10 active 3 | DoT 圧縮 + attackSpeed debuff / 行動制限延長候補。対象は dot 中敵または局所範囲 | DoT の残り時間を短く畳んで戦闘テンポを変える。単なる範囲 DoT 維持・拡張にはしない | **追加**。DoT 圧縮 effect / condition、editor / validate / `formatSkillText` / combat / spec 同期が必要 |
| `at_hunter` | Lv20 active 4 | 上位行動制限。scatter stun / knockback / moveLock / DoT 圧縮連動候補。対象は局所範囲。条件は dot 中敵または enemyCount | 上位 Field Flow。局所的に敵の進行・行動を止め、DoT 圧縮で戦闘テンポを崩す | **追加**。knockback は既存仕様、DoT 圧縮 / action restriction condition は新規ゲート。視界・命中干渉は将来ゲートに残す |

Physical pass B の実装方針:

- Lancer は Kill 対象を持たない Position Flow として扱う。target override や Threat 操作ではなく、`selfOrigin` の前方ライン、味方近傍 aura、敵前線 debuff で「どこで戦うか」を調整する。自分以外の前列味方が攻撃された際の援護反撃は、Defender 的な Threat 代替ではなく、槍の間合いで前列横方向を支える Position Flow として扱える。ただし現行 counter は自己被弾専用なので、採用するなら新 passive trigger と tooling 同期が必要。
- Ballista は高 Max HP 対象と貫通射線を正本にする。高 HP targeting の重複 passive は 1 枠へ整理し、追加枠は reload / stance / pierce / 高 HP 特効のどれかに使う。`at_ballista_passive_3` のような常時 DEF 無視は古い仕様の残骸として置換 / 削除対象にする。ただし Ballista の処理対象であるボス / エリート敵は高 DEF も併せ持つ可能性が高いため、高 Max HP 条件に閉じた DEF 対策は許容する。差別化として、Warrior は高 DEF 単体を対象に取り DEF を抜く職、Ballista は高 Max HP 対象へ重撃を通し、必要なら target DEF を追加ダメージ源として参照する職に分ける。DEF 無視は「防御をなかったことにする」ため Warrior 側、target DEF 参照追加ダメージは「重装甲ほど衝撃が乗る」ため Ballista 側の表現にできる。現行 target stat の `hp/highest` は現在 HP 比較なので、Max HP targeting を正確に実装するなら `TargetStat` に `maxHp` を追加し、editor / validate / `formatSkillText` / docs を同期する。さらに現行 `specialEffect` 条件は `debuff` と低 HP 側の `targetHp` のみなので、高 HP / 高 Max HP 特効 condition も追加対象にする。target DEF 参照追加ダメージを採用する場合も新 effect / amount 参照として editor / validate / `formatSkillText` / docs 同期が必要。フィールド端までの特別な貫通ラインは v1 では増やさず、既存 `pierce` の `range` と `selfOrigin` で表現する。
- Hunter は Field Flow であり、Warrior / Ranger のような処理対象特化に寄せない。現行 `at_hunter_passive_1` の debuff 中 damage bonus は古い Kill 寄り仕様として置換する。広範囲 DoT 火力も主軸にせず、DoT 残り時間を圧縮して短時間に状態を畳み、stun / knockback / moveLock / attackSpeed debuff などの行動制限で局所戦闘テンポを崩す。地点指定範囲は単発範囲攻撃にも使える汎用 target とし、持続効果を付けると罠 / 法陣 / 領域効果になる。Hunter はその範囲に DoT 圧縮・行動制限を置き、Conductor は damage concentration / distribution / recycling を置くことで分ける。
- Physical pass B では Lancer の援護反撃 trigger、Ballista の `maxHp` target、高 HP 特効 condition、target DEF 参照追加ダメージ、地点指定範囲 / 持続範囲、Hunter の DoT 圧縮 / action restriction condition 以外、新 effect / targetShape / condition を増やさない。新要素を採用する場合は editor / validate / `formatSkillText` / docs 同期を同じ実装単位に含める。knockback は既存仕様だが、Hunter の行動制限として使う場合は moveLock / stun との責務差を combat / text で確認する。視界妨害、命中干渉、フィールド端貫通ラインは未決ゲートに残す。

## Caster

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `at_sorcerer` | 純出力。安定 DPS、基準火力、マルチロック再配分 | `active_1` / `active_2` は placeholder 名の単体・multiLock。`active_3` / `active_4` 未配置 | 名前と習得段階を **見直し**。条件分岐なし、領域再定義なしの安定魔法として、単体・multiLock・大火力・継続火力の 4 枠へ整理 | 既存 damage / multiLock で対応可能。名称・説明・VFX 対応が必要 |
| `at_sigilist` | Earth / Wind Mark 分岐。条件適応型 Kill | 旧 JSON 廃棄済み | 設計は **確定**。combat / JSON / tooling は **Phase 8 以降** | Mark state / effect、editor / validate / `formatSkillText` / spec 同期（Phase 8 以降） |
| `at_conductor` | Damage Routing / Distribution / Recycling | 旧 JSON 廃棄済み | 設計は **確定**。combat / JSON / tooling は **Phase 8 以降** | damage reservoir、地点指定範囲、非 damage basic 等（Phase 8 以降） |

### Caster pass 枠確定案

Caster 3 種は魔法 damage を扱うが、役割は「火力の大小」ではなく出力構造の違いで分ける。Phase 3 では `at_sorcerer` のみ JSON / combat 実装の対象とし、`at_sigilist` / `at_conductor` は独自システムのため設計確定のみ行い実装は **Phase 8 以降** とする。

| classId | 枠 | 効果カテゴリ・対象・条件 | 方針 | 採否 / 実装影響 |
| --- | --- | --- | --- | --- |
| `at_sorcerer` | basic | magic single damage。対象は通常 enemy target。条件なし | キャスターの標準魔法弾。条件分岐や領域再定義は持たせない | 現行 `at_sorcerer_basic_attack` を **残す**。名称は「魔弾」を維持可 |
| `at_sorcerer` | Lv0 passive 1-2 | 軽めの REG 無視 + magic damage / multiLock 補助候補。対象は自身または習得魔法。条件なし | 純出力の基準値を支える。軽い REG 無視は魔法基準火力の下支えとして採用可。状況条件や構造操作ではなく、安定 damage / multiLock 再配分の損失低減へ寄せる | **追加**。REG 無視は既存 `defenseIgnore.reg.percent` で対応可能。既存 `specialEffect` 空条件、`skillAmountOverride`、`skillPropertyOverride` 候補。数値は Phase 8 |
| `at_sorcerer` | Lv10 passive | MultiLock Count Increase。対象は自身の multiLock active | Lock 数を増やし、単体・少数・多数戦すべてを強化する。条件分岐ではなく、Sorcerer の multiLock 純出力を段階強化する | **追加**。採用候補。既存 multiLock の hit / lock 数拡張で対応する。editor / validate / `formatSkillText` 同期確認 |
| `at_sorcerer` | Lv20 passive | Full Saturation。同一対象への Lock 集中時追加効果。対象は自身の multiLock active | Lock が一定数以上同一対象へ集中した際に追加攻撃を発生させる。少数戦でもロックが無駄にならない Sorcerer の完成形 | **追加**。採用候補。Lock 集中数参照 condition / property 追加が必要。editor / validate / `formatSkillText` / docs 同期必須 |
| `at_sorcerer` | Lv0 active 1 | magic single damage。対象は nearest enemy。条件なし | 基本スキル。安定単体魔法として、Caster 火力の基準を示す | 現行 `at_sorcerer_active_1` を **残す / 改名**。placeholder 名を置換 |
| `at_sorcerer` | Lv0 active 2 | magic `multiLock` damage。対象は nearest enemy から複数ロック。条件なし | 強めスキル。対象数が少なくてもロックが無駄にならない安定出力として扱う | 現行 `at_sorcerer_active_2` を **残す / 改名**。multiLock 再配分は Sorcerer の個性 |
| `at_sorcerer` | Lv10 active 3 | magic damage。候補は高威力 single、または hitCount / multiLock の継続火力 | 純出力の段階強化。条件分岐や地点指定範囲は使わない | **追加**。既存 damage / hitCount / multiLock で対応 |
| `at_sorcerer` | Lv20 active 4 | 上位 magic `multiLock` damage。対象は nearest enemy から複数ロック、少数戦では同一対象へ集中 | Caster 基準火力の上位枠。範囲大火力ではなく、multiLock のロック集中で少数戦にもロスなく火力を出す | **追加**。既存 `multiLock` / damage で本体は対応可能。ロック集中ボーナスを入れる場合は新 property / condition が必要 |
| `at_sigilist` | basic | magic single damage 候補。対象は通常 enemy target。条件なし | 標準魔法弾は設計上あり得るが、現行 JSON は廃棄。再実装時に確定 | 現行 `at_sigilist_basic_attack` JSON は **廃棄**。再設計まで合成 basic または未配置 |
| `at_sigilist` | Lv0 passive 1-2 | passive 1 は説明 / ルール解放 passive 候補。「スキル対象の条件によって、より適した効果へ分岐する」ことを明示する。passive 2 は対象読解 / 分岐対象選定候補 | 印術師の初期 passive は強化ではなく基本能力として扱う。passive 1 で分岐ルールを示し、passive 2 で条件分岐スキルの対象を「分岐が意味を持つ候補」へ寄せる。charge 増加などは active 側の設計で扱い、passive には置かない | **追加**。説明 passive を採用する場合は、効果なし passive または class rule 表示を editor / validate / UI / `formatSkillText` で扱えるか確認。対象読解を採用する場合は best-area anchor / branch-aware targeting など新 targetRule または conditionalEffect 対象選定補助が必要 |
| `at_sigilist` | Lv10 / Lv20 passive | 対象条件分岐の扱いやすさ・効果調整補助。対象は自身または条件分岐 active | Lv0 passive 1/2 はクラス基本能力にする。Lv10 / Lv20 で対象読解の範囲、分岐条件の種類、または条件分岐 active の扱いやすさを段階強化する。回復 / 支援分岐、multiLock 純出力にはしない | **追加**。新 effect はできるだけ避け、conditionalEffect tooling と対象選定補助の同期を優先 |
| `at_sigilist` | Lv0 active 1 | Earth / Wind Branch + Mark 付与・起爆。基本スキル | 条件分岐 + 対応 Mark +1 + 1 個起爆 | 現行 `at_sigilist_active_1`（連印）JSON は **廃棄**。**追加** |
| `at_sigilist` | Lv0 active 2 | 強め Branch + 複数 Mark 付与・起爆 | 条件分岐 + 対応 Mark +2 + 2 個起爆 | 現行 `at_sigilist_active_2`（爆印）JSON は **廃棄**。**追加** |
| `at_sigilist` | Lv10 active 3 | `conditionalEffect`。候補は HP 条件 / 敵数条件 / 密集条件 / debuff 条件による効果調整 | 条件適応の段階強化。Flow ではなく Kill 内で、対象に合わせて攻撃効果を最適化する | **追加**。条件種類を増やす場合は editor / validate / `formatSkillText` / spec 同期 |
| `at_sigilist` | Lv20 active 4 | 上位 `conditionalEffect`。対象条件に応じた明確な効果分岐 | 印術師の完成形。ランダムではなく予測可能な条件分岐にする。Sorcerer の multiLock 純出力とは分ける | **追加**。conditionalEffect tooling 完了が前提 |
| `at_conductor` | basic | 非 damage。自身で攻撃しない | Conductor 自身は攻撃しない | 現行 `at_conductor_basic_attack` JSON は **廃棄**。**追加**（非 damage basic） |
| `at_conductor` | Lv0 passive 1 | Damage Observation。スキル非発動中、戦場で発生した damage の一部を蓄積プールへ加算 | スキル非発動時間の価値創出、damage 流量の観測、蓄積システムの基盤 | **追加**。採用候補。新 state（damage reservoir）/ effect（damageObservation）が必要。editor / validate / `formatSkillText` / docs 同期 |
| `at_conductor` | Lv0 passive 2 | Self Reservoir。Conductor が受けた damage を全量蓄積プールへ加算 | Defender 副属性。後列狙い・範囲攻撃への耐性価値。「受けた流れも記録する」 | **追加**。採用候補。self damage → reservoir 転送 effect が必要 |
| `at_conductor` | Lv10 passive | Enhanced Observation。スキル非発動中の damage 回収量増加 | 蓄積システムの成長。シンプルな上位 passive | **追加**。採用候補。damageObservation 係数拡張 |
| `at_conductor` | Lv20 passive | Advanced Observation。スキル非発動中の damage 回収量増加（上位） | 蓄積システム最終強化。数値成長担当 | **追加**。採用候補。damageObservation 係数拡張 |
| `at_conductor` | Lv0 active 1 | Convergence Field（集中法陣）。地点指定範囲 + 持続。法陣内 damage を収束。敵は現在 HP 絶対値最大へ、味方は現在 HP 絶対値最大へ | Damage Concentration。基本スキル | **追加**。現行 `at_conductor_active_1`（大法陣）JSON は **廃棄** |
| `at_conductor` | Lv0 active 2 | Distribution Field（分散法陣）。法陣内 damage を頭割り。敵集団 / 味方集団内で分散 | Damage Distribution。強めスキル | **追加**。現行 `at_conductor_active_2`（小法陣）JSON は **廃棄** |
| `at_conductor` | Lv10 active 3 | Continuous Observation。永続自己強化。発動後、スキル発動中の damage もごく一部を蓄積プールへ加算（非スキル中回収とは別枠・低係数）。軽減・転送・無効化は行わない | Observation Expansion。「法陣展開中も流量を観測できる」 | **追加**。採用候補。activeObservation または damageObservation 発動中拡張が必要 |
| `at_conductor` | Lv20 active 4 | Reflux Field（返流法陣）。法陣展開中、法陣内 damage を追加で蓄積へ記録（通常適用は維持）。法陣終了時、蓄積プールを敵へ再配分 | Damage Recycling。戦場 damage を貯留し再び放流する完成形 | **追加**。採用候補。damageRecycling、reservoir 放出 effect が必要 |

Caster pass の実装方針:

- Sorcerer は条件分岐なし・領域再定義なしの純出力に限定する。placeholder 名は必ず置換し、`active_1` は基本単体、`active_2` は強め multiLock として Lv0 からクラスの基準火力を示す。Lv0 passive 1 には軽めの REG 無視を置ける。Lv10 passive は MultiLock Count Increase、Lv20 passive は Full Saturation（同一対象への Lock 集中時追加効果）として扱う。Lv20 active も範囲大火力ではなく上位 multiLock にし、少数戦でもロックが無駄にならない純出力へ寄せる。
- Sigilist は `conditionalEffect` を本採用する場合に成立する。Sorcerer を multiLock 純出力へ寄せるため、Sigilist はスキル対象の条件によってより適した効果へ調整する攻撃最適化にする。分岐は回復 / 支援ではなく、対象の状態・数・密集度などに応じて damage / debuff / hit 構造 / 範囲形状を変える中で完結させる。成立側 / 未成立側の性能差は付けず、どちらも同格の効果として扱う。Sigilist の Lv0 passive 1 は、数値補助ではなく「スキル対象の条件で効果が分岐する」ことを説明する class rule passive として採用してもよい。Lv0 passive 2 は強化ではなく、条件分岐スキルの対象を分岐が意味を持つ候補へ寄せる対象読解 / 分岐対象選定として扱う。branch 内の effect 表示、validate、editor 保存、`formatSkillText` は同じ実装単位で同期する。
- Conductor は地点指定範囲 / 持続範囲を Hunter と共有するが、置く effect が異なる。Hunter は DoT 圧縮 / 行動制限、Conductor は damage concentration / distribution / recycling を置く。既存 AoE / scatter 攻撃は正本にせず、通常攻撃を含めて自分で damage を出さない。ダメージ軽減職・ATK/DEF buff 職ではなく、damage の発生量を直接増減せず routing / distribution / recycling が主役。蓄積プールは主役ではなく補助エンジン。成長ラインは Lv0=観測・集中・分散、Lv10=観測拡張、Lv20=再循環。
- Caster pass で増やす新要素は、Phase 3 では `at_sorcerer` の既存 effect 整理に限定する。`at_sigilist` / `at_conductor` 向けの Mark 系・damage reservoir 系は **Phase 8 以降**。
- `at_sigilist` と `at_conductor` の現行 `data/skills/actives/*.json` は設計確定に伴い **廃棄済み**。`classes.json` の Lv0 active 習得も空。新スキルは Phase 8 以降に設計表どおり追加する。

## Survival

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `sp_cleric` | Recovery Control。欠損 HP の即時復元、余剰回復を barrier 化 | `active_1` 癒しの光、`active_2` 広域治療。仕様上は `active_2` が Lv10 とされ、Lv0=2 との整合が未解決 | `active_1` は **残す**。広域治療は Lv10 へ移し、Lv0 2 枠目は低 HP smart heal として **追加**。Lv20 は反応型大 heal 候補 | 既存 heal / hot / fireConditions で先行可能。真の被ダメ反応 trigger は新規ゲート |
| `sp_wardweaver` | Stability Control。崩壊前猶予、barrier max、障壁（ward）、先読み smart | **実装済**（2025 リデザイン） | Lv0: heal 補助 + barrier 特効 + 枯渇回復。Lv10: 単体 barrierStack。Lv20: 三重の障壁（障壁2+バリア） | `barrierDepletionHeal` / `wardBarrier` / `pendingIncomingDamage` / `fireConditionMatch` |
| `sp_alchemist` | Sustain Control。薬効浸潤（`herbalPotency`）HoT + stack 蓄積 + 薬効顕現 | **実装済**（2025 リデザイン） | Lv0: aura + stack 基礎 + 近接 HoT。Lv20: 体質段階 + 薬効顕現 | `herbalPotency` / `herbalPotencyConsume` / `stackOnApply` / `potencyStackScale` |

### Supporter 枠確定案

Supporter 3 種は「回復量の大小」ではなく、損失を処理するタイミングで分ける。

| classId | 枠 | 方針 | 採否 |
| --- | --- | --- | --- |
| `sp_cleric` | basic | 最低 HP 比率の味方へ小さな即時 heal。Recovery の常時基礎 | 現行 `sp_cleric_basic_attack` を **残す** |
| `sp_cleric` | Lv0 passive 1-2 | 低 HP heal 強化、余剰 heal → barrier | 現行 `sp_cleric_passive_1` / `sp_cleric_passive_2` を **残す** |
| `sp_cleric` | Lv10 passive 3 | オーバーヒールの一部を次低 HP 味方へ転送（`excessHealRedirect`、1 ホップ）。残り余剰は barrier 等へ | `sp_cleric_passive_3`（生命調律）を **実装** |
| `sp_cleric` | Lv20 passive 4 | 低 HP 回復時にバフ「癒しの残響」を付与。被ダメ後の短期保険回復（`healReservation`、蘇生ではない） | `sp_cleric_passive_4`（ヒール予約）を **実装** |
| `sp_cleric` | Lv0 active 1 | 単体欠損を戻す主 heal。対象は最低 HP 比率、即時 heal + 短い HoT | 現行 `sp_cleric_active_1`（癒しの光）を **残す** |
| `sp_cleric` | Lv0 active 2 | 低 HP の味方だけに反応する救命 heal。真の被ダメ反応 trigger は使わず、`time` + `firePolicy: smart` + `fireConditions` で先行 | **追加**。`sp_cleric_active_2` をこの役割へ再定義する案 |
| `sp_cleric` | Lv10 active 3 | Recovery の範囲化・維持化。全体または複数対象の HoT / heal | 現行 `sp_cleric_active_2`（広域治療）は Lv10 枠へ **移動 / 改番** |
| `sp_cleric` | Lv20 active 4 | 上位 Recovery。大きな欠損を即座に立て直す smart heal。被ダメ反応 trigger は将来ゲート | **追加** |
| `sp_wardweaver` | basic | 最低 HP 味方へ heal ATK×0.7 のみ（barrier なし） | **実装** |
| `sp_wardweaver` | Lv0 passive 1-2 | 低 HP barrier 特効 1.25、バリア枯渇時 instant heal | **実装** |
| `sp_wardweaver` | Lv10 / Lv20 passive | Lv10: Wave 開始全体 barrier×0.5（`passive_3`）。Lv20: `barrierBreakRegen`（`passive_4`） | **実装** |
| `sp_wardweaver` | Lv0 active 1 | 支えの御盾: heal×0.35 + barrier×1.9 | **実装** |
| `sp_wardweaver` | Lv0 active 2 | 双璧の護り: barrier×2 multiLock、smart HP≤50%、`targetBarrierBelowGrant` | **実装** |
| `sp_wardweaver` | Lv10 active 3 | 庇護の帷: `barrierStack` 単体最低 HP barrier×1.0 | **実装** |
| `sp_wardweaver` | Lv20 active 4 | 三重の障壁: 障壁×2 + barrier×1.25、smart any（先読み OR HP≤50%） | **実装** |
| `sp_alchemist` | basic | 最低 HP 比率の味方へ短い `percentMaxHp` HoT（即時 heal なし） | `sp_alchemist_basic_attack`（薬手当て）**実装** |
| `sp_alchemist` | Lv0 passive 1-2 | `herbalPotency` aura + stack 基礎、高 HP ally hp buff | **実装** |
| `sp_alchemist` | Lv10 / Lv20 passive | dot 限定 `periodicDispel`、体質段階（max stack 9） | **実装** |
| `sp_alchemist` | Lv0 active 1 | 近接帯 HoT + `stackOnApply`（敵 debuff なし） | **実装** |
| `sp_alchemist` | Lv0 active 2 | 薬香の霧: 味方全体中程度 HoT | **実装** |
| `sp_alchemist` | Lv10 active 3 | 滋養強壮薬: 味方全体長 HoT + hp flat buff | **実装** |
| `sp_alchemist` | Lv20 active 4 | 薬効顕現: 全 stack 消費 + `conditionalEffect` 分岐（即時 heal なし） | **実装** |

Supporter pass の実装方針:

- `sp_cleric_active_2` は **広域治療のまま Lv0 に置かない**。設計書の「広域治療は Lv10」を正とし、Lv0 2 枠目は低 HP smart heal として追加する。
- `sp_wardweaver` は direct heal 量を主役にしない。heal は barrier を成立させる補助で、役割の本体は barrier / damageTaken / Wave 猶予。
- `sp_alchemist` は毒・罠による Field Flow へ寄せない。敵への干渉は Survival 範囲の ATK debuff / 被害速度低下に限定する。
- `sp_alchemist` の味方 ATK buff は Lv10 以降なら許容する。ただし [`classes-and-skills.md`](../spec/classes-and-skills.md) の Survival 設計原則を正とし、Kill 主目的の火力支援ではなく、近接帯の味方を長く戦わせる継戦リズム調整として実装する。
- debuff cleanse は薬草師専用だが、active 化しない。passive の Wave 回数限定解除に閉じ、解除が必須になる戦闘設計にはしない。

## 優先実装順

1. **Supporter 3 種の passive / active Lv0=2 整合**
   - `sp_cleric` の広域治療は Lv10 正本に寄せ、Lv0 active 2 枠目は低 HP smart heal として追加する。passive も Lv0 2 / Lv10 1 / Lv20 1 へ整理する。
2. **Defender 3 種の passive / active 4 枠化**
   - 既存 effect でほぼ進められる。戦線維持・戦線安定・攻撃防御の差分を明確化する。
3. **物理 Kill / Flow 6 種の passive / active Lv10 / Lv20 追加**
   - 多くは既存 effect で進められる。Hunter と Ballista の新メカニクスだけゲート化する。
4. **Caster — `at_sorcerer` の passive / active 4 枠化**
   - 印術師・法陣師は独自システムのため **Phase 8 以降**（設計は本表で確定済み、JSON / combat 実装は送る）。
5. **印術師・法陣師（Phase 8 以降）**
   - `at_sigilist`: Mark 系 state / effect、Branch 分岐 tooling、`data/skills/` 投入。
   - `at_conductor`: damage reservoir、法陣 routing / recycling、地点指定範囲、非 damage basic。

## 実装チャットへ渡す単位

| 実装単位 | 対象 | 目的 |
| --- | --- | --- |
| Supporter pass | `sp_cleric`, `sp_wardweaver`, `sp_alchemist` | passive / active の Lv0=2 整合、Lv10 / Lv20 の Survival 構造確定 |
| Defender pass | `df_guardian`, `df_paladin`, `df_duelist` | passive / active の 4 枠化、戦線維持系の重複整理 |
| Physical pass A | `at_warrior`, `at_assassin`, `at_ranger` | 既存 effect 中心で Kill クラスの passive / active 4 枠化 |
| Physical pass B | `at_lancer`, `at_ballista`, `at_hunter` | passive / active 4 枠化、Flow / pierce / trap のゲート整理 |
| Caster pass A | `at_sorcerer` | passive / active 4 枠化（Phase 3） |
| Caster pass B | `at_sigilist`, `at_conductor` | 独自システム実装（**Phase 8 以降**）。設計確定は本表、JSON / combat / tooling は未着手 |
| Tooling pass | editor / validate / `formatSkillText` / spec | 新 effect / targetShape / condition を採用した場合の同期 |

## 未決事項

- `at_sigilist` / `at_conductor` の combat 実装タイミングは **Phase 8 以降**（独自システムのため Phase 3 では設計確定のみ）。
- Hunter の DoT 残り時間圧縮と行動制限 condition の具体仕様。視界・命中干渉は将来ゲートに残す。
- Ballista のフィールド端貫通ラインを既存 `pierce` の範囲に留めるか、戦場座標仕様として拡張するか。

## 完了条件

- 15 クラスすべてに basic + Lv0 2 passive + Lv10 passive + Lv20 passive + Lv0 2 active + Lv10 active + Lv20 active が存在する。
  - **例外:** `at_sigilist` / `at_conductor` は独自システムのため Phase 8 以降まで JSON / combat 未実装を許容する。設計表と docs の確定を Phase 3 の完了条件とする。
- `data/skills/actives/*.json` に placeholder 名、未実装メモ、習得段階と矛盾するスキルが残らない。
- `classes.json` の習得テーブルがこの表の段階と一致する。
- 新 effect / target / condition を追加した場合、editor / validate / `formatSkillText` / spec が同じ作業で更新されている。
- `docs/spec/classes-and-skills.md` の TBD が、この表または実装済み仕様に置き換わっている。
