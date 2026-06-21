# スキル確定表（作業用）

最終更新: 2026-06

目的: Phase 3 再オープン中の「クラス別パッシブ / アクティブスキル再設定」を、実装チャットへ分割して渡せる粒度まで整理する。ここでは数値バランスではなく、**クラスの役割、習得段階、既存スキルの採否、実装影響**を確定対象にする。

正本:

- クラス設計: [`docs/spec/classes-and-skills.md`](../spec/classes-and-skills.md)
- 戦闘効果: [`docs/spec/combat.md`](../spec/combat.md)
- 習得・進行: [`docs/spec/progression.md`](../spec/progression.md)
- データ: `data/classes.json`, `data/skills/`

## 確定ルール

- 全クラス共通で、アクティブは Lv0=2、Lv10=3、Lv20=4 の最大 4 枠を常時使用する。
- 「スキル装備」「セット枠」「付け替え」は扱わない。習得済みアクティブが常時参加する。
- 数値は Phase 7 で調整する。今決めるのは、効果形状、対象、習得段階、クラス内の役割。
- `atkScale`、倍率、秒数、CD、発動間隔、確率などの細かい数値はこの表では確定しない。実装時は現行値または保守的な仮値を置き、Phase 7 の調整対象として残す。
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
| 罠 / scatter / DoT | 狩猟士の核。既存 `scatter` + `dot` + `stun` を v1 範囲にする。DoT 残り時間圧縮は要判断 |
| 法陣のダメージ分配・転送 | 法陣師の核だが実装負荷が高い。v1 で採用するか、既存 AoE / scatter の暫定構造操作に抑えるか要判断 |
| 反応型 heal | 療養師 Lv20 候補。v1 は `time` + `firePolicy: smart` + `fireConditions` で先行するか要判断 |

## Passive 監査表

| classId | 現行 passive | v1 確定方針 |
| --- | --- | --- |
| `df_guardian` | block、Threat 維持、Wave 開始 barrier 系が複数 | **残す / 整理**。重複 ID・同名 passive を整理し、Guardian は自己 block + 被弾 Threat 維持に集約する |
| `df_paladin` | block、front Threat floor、全体 barrier、全体 damageReduction | **残す / 整理**。Paladin は front 全体安定と party protection に寄せ、Guardian と同じ自己壁にしない |
| `df_duelist` | block、低 HP DEF / ATK、counter | **残す**。Duelist の被弾起点・反撃・低 HP 逆転を passive 側の核にする |
| `at_warrior` | 高 DEF 狙い、DEF 無視 | **残す**。Warrior の高 DEF 単体処理の正本 |
| `at_assassin` | 低 HP 比率狙い、evasion、低 HP 対象 damage bonus | **残す**。瀕死処理と背後アクセスの補助に限定し、Defender 的な生存性能には寄せない |
| `at_lancer` | pierce 範囲 ATK debuff、近傍 ally ATK aura | **残す**。Position Flow の常時圧力として扱う |
| `at_ranger` | 遠隔敵優先、attackSpeed buff、ranged counter | **残す / 見直し**。遠隔敵処理と連射構造は残す。counter は Lv 段階または active との重複を確認する |
| `at_ballista` | 高 Max HP 狙いが重複、DEF 無視 | **整理**。高 HP targeting は 1 つに統合し、重撃・貫通・高耐久処理へ寄せる |
| `at_hunter` | debuff 中対象への damage bonus | **見直し**。Hunter は Kill ではなく Field Flow が主軸なので、罠・DoT・拘束への補助として意味づけ直す |
| `at_sorcerer` | 現行データ上、専用 passive 未確認 | **追加候補**。条件分岐なしの安定出力を支える、魔法 damage / multiLock 再配分補助などを検討 |
| `at_sigilist` | 現行データ上、専用 passive 未確認 | **追加候補**。`conditionalEffect` を本採用する場合、条件成立時の効率補助にする |
| `at_geomancer` | AoE crowd bonus | **見直し**。暫定 AoE 法陣なら残せるが、damage routing 採用時は置換候補 |
| `sp_cleric` | 低 HP heal 強化、余剰 heal → barrier | **残す**。Recovery Control の核 |
| `sp_abjurer` | 高 HP ally 軽減、Wave 開始 barrier、全体 barrier / damageReduction | **残す / 整理**。Stability Control として、事前猶予・軽減・barrier の担当を明確化する |
| `sp_alchemist` | party HoT aura、高 HP ally DEF、dot dispel | **残す**。Sustain Control と状態異常対策の核 |

## Defender

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `df_guardian` | 前線構築。単一路線の完全防衛、高 HP 正面受け、被弾による前線押上 | `active_1` 防御強化、`active_2` 防御専念、`active_3` 息入れ。`active_4` 未配置 | `active_1` / `active_2` は **残す**。`active_3` は自己 HoT が Guardian の「壁」から外れすぎないか **見直し**。Lv20 は自己耐久よりも前線保持を強める防御・block・Threat 維持系を **追加** | 既存 buff / heal / block / threatControl 周辺で実装可能。新 effect は避けたい |
| `df_paladin` | 戦線安定。範囲・魔法ダメージを含む戦場全体の被害緩和 | `active_1` 光の剣、`active_2` 聖盾、`active_3` 治療専念。`active_4` 未配置 | `active_1` は heal + magic damage の複合として **見直し**。`active_2` は自己防御寄りなので、front / all ally への barrier・damageTaken 軽減へ寄せる。Lv20 は全体安定装置として **追加** | 既存 heal / barrier / damageTaken / basicAttackTransform で対応可能。対象範囲の整理が必要 |
| `df_duelist` | 攻撃防御。単体強敵への制圧・拘束・カウンター・行動阻害 | `active_1` 戦叫び、`active_2` 体力温存、`active_3` 隙撃ち、`active_4` 血気煽り | 4 枠構造は最も進んでいるため **残す** 寄り。`active_4` の全敵 ATK debuff + 自己被害増は範囲が広いので、単体強敵制圧へ寄せるか **見直し** | 既存 debuff / damageDelay / stun / damageIncrease で対応可能。数値は Phase 7 |

## Physical Kill / Flow

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `at_warrior` | 単体安定。高 DEF 単体を DEF 貫通・固定 DPS で処理 | `active_1` 叩き付け、`active_2` 薙ぎ払い。`active_3` / `active_4` 未配置 | `active_1` は **残す**。`active_2` は範囲処理に寄りすぎる場合、近接標準の複数対応として弱めに維持。Lv10 は armor break / 高 DEF 追撃、Lv20 は高 DEF 対象への上位単体処理を **追加** | 既存 damage / defenseIgnore / debuff で対応可能 |
| `at_assassin` | 高速処理。Hit 数、背後侵入、瀕死処理 | `active_1` 引き裂き、`active_2` 影の刃。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は basic attack / hitCount / attack count を使った回転加速、Lv20 は瀕死対象の execute 系を **追加** | gauge は増やさず、既存 `basicAttackCount`, `hitCount`, `damageIncrease` で表現する |
| `at_lancer` | Position Flow。前線バフ・前線デバフ・接敵領域制御 | `active_1` 踏み込み突き、`active_2` 足払い。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は味方近接への ATK aura / 戦線維持、Lv20 は pierce + stun / knockback など前線再形成を **追加** | 既存 pierce / buff / debuff / stun を優先。knockback 採用時は combat / text 同期確認 |
| `at_ranger` | 連射変形。攻撃回数、攻撃速度、遠隔敵処理 | `active_1` 連射、`active_2` 連ね矢。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は連射の維持・回転改善、Lv20 は遠隔敵優先を強める上位 volley を **追加** | 既存 hitCount / basicAttackTransform / attackSpeed buff で対応可能 |
| `at_ballista` | 貫通重撃。高 Max HP 対象、時間圧縮、貫通範囲 | `active_1` 重撃態勢、`active_2` 貫く一射。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は reload / stance のリズム改善、Lv20 は高 Max HP 対象へ大きく刺さる siege shot を **追加** | 既存 pierce / target HP 条件で v1 可。フィールド端貫通ラインは要判断 |
| `at_hunter` | Field Flow。罠、範囲 DoT、行動精度・テンポ制御 | `active_1` 毒罠、`active_2` 拘束罠。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は範囲 DoT の維持・拡張、Lv20 は局所 knockback / 行動阻害強化を **追加** 候補。命中・視界干渉は v1 では増やさない | scatter / dot / stun / atk debuff は既存。DoT 圧縮・命中干渉・視界妨害は新規ゲート |

## Caster

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `at_sorcerer` | 純出力。安定 DPS、基準火力、マルチロック再配分 | `active_1` / `active_2` は placeholder 名の単体・multiLock。`active_3` / `active_4` 未配置 | 名前と習得段階を **見直し**。条件分岐なし、領域再定義なしの安定魔法として、単体・multiLock・大火力・継続火力の 4 枠へ整理 | 既存 damage / multiLock で対応可能。名称・説明・VFX 対応が必要 |
| `at_sigilist` | 条件適応。2 系統効果の予測可能分岐、攻撃効率最適化 | `active_1` 連印、`active_2` 爆印。`conditionalEffect` 使用。`active_3` / `active_4` 未配置 | `conditionalEffect` を採用するなら `active_1` / `active_2` は **残す**。Lv10 / Lv20 も条件分岐型で **追加**。採用しないなら印術師全体を置換する必要がある | 新 effect ゲートの中核。editor / validate / `formatSkillText` / spec 同期が必須 |
| `at_geomancer` | 構造操作。法陣によるダメージ流量の再配置、味方含む全体最適化 | `active_1` 大法陣、`active_2` 小法陣。AoE / scatter の攻撃寄り。`active_3` / `active_4` 未配置 | v1 方針が要判断。既存 AoE / scatter だけで暫定構造操作にするなら **見直し**。味方ダメージ分配・転送を核にするなら現行は **置換** 寄り | 最も実装負荷が高い。damage routing / transfer を採用するか決めてから着手 |

## Survival

| classId | 設計の柱 | 現行スキル | v1 確定方針 | 実装影響 |
| --- | --- | --- | --- | --- |
| `sp_cleric` | Recovery Control。欠損 HP の即時復元、余剰回復を barrier 化 | `active_1` 癒しの光、`active_2` 広域治療。仕様上は `active_2` が Lv10 とされ、Lv0=2 との整合が未解決 | `active_1` は **残す**。広域治療は Lv10 へ移し、Lv0 2 枠目は低 HP smart heal として **追加**。Lv20 は反応型大 heal 候補 | 既存 heal / hot / fireConditions で先行可能。真の被ダメ反応 trigger は新規ゲート |
| `sp_abjurer` | Stability Control。崩壊前猶予、barrier、軽減 | `active_1` 盾添え、`active_2` 双璧の護り。`active_3` / `active_4` 未配置 | `active_1` / `active_2` は **残す**。Lv10 は複数・範囲 barrier、Lv20 は全体軽減または Wave 開始保護の強化を **追加** | 既存 barrier / damageReduction で対応可能。対象選択を整理 |
| `sp_alchemist` | Sustain Control。HoT、被害速度低下、状態異常対策 | `active_1` 薬粉撒き。`active_2` / `active_3` / `active_4` 未配置 | `active_1` は **残す**。Lv0 2 枠目は前列 supporter としての近接 sustain / 守り薬を **追加**。Lv10 は状態異常対策、Lv20 は長期維持の上位化を **追加** | 既存 HoT / atk debuff / periodicDispel 周辺で対応。dispel を active 化するなら editor / text 確認 |

### Supporter 枠確定案

Supporter 3 種は「回復量の大小」ではなく、損失を処理するタイミングで分ける。

| classId | 枠 | 方針 | 採否 |
| --- | --- | --- | --- |
| `sp_cleric` | basic | 最低 HP 比率の味方へ小さな即時 heal。Recovery の常時基礎 | 現行 `sp_cleric_basic_attack` を **残す** |
| `sp_cleric` | passive | 低 HP heal 強化、余剰 heal → barrier | 現行 `sp_cleric_passive_1` / `sp_cleric_passive_2` を **残す** |
| `sp_cleric` | Lv0 active 1 | 単体欠損を戻す主 heal。対象は最低 HP 比率、即時 heal + 短い HoT | 現行 `sp_cleric_active_1`（癒しの光）を **残す** |
| `sp_cleric` | Lv0 active 2 | 低 HP の味方だけに反応する救命 heal。真の被ダメ反応 trigger は使わず、`time` + `firePolicy: smart` + `fireConditions` で先行 | **追加**。`sp_cleric_active_2` をこの役割へ再定義する案 |
| `sp_cleric` | Lv10 active 3 | Recovery の範囲化・維持化。全体または複数対象の HoT / heal | 現行 `sp_cleric_active_2`（広域治療）は Lv10 枠へ **移動 / 改番** |
| `sp_cleric` | Lv20 active 4 | 上位 Recovery。大きな欠損を即座に立て直す smart heal。被ダメ反応 trigger は将来ゲート | **追加** |
| `sp_abjurer` | basic | 最低 HP 比率の味方へ小 heal + 小 barrier。崩壊前猶予の常時基礎 | 現行 `sp_abjurer_basic_attack` を **残す** |
| `sp_abjurer` | passive | 高 HP 味方軽減、Wave 開始 barrier、全体 barrier / damageReduction | **残す / 整理**。事前猶予と軽減に寄せる |
| `sp_abjurer` | Lv0 active 1 | 単体へ heal + 厚い barrier | 現行 `sp_abjurer_active_1`（盾添え）を **残す** |
| `sp_abjurer` | Lv0 active 2 | 複数対象 barrier。崩れる前の猶予を 2 人以上に作る | 現行 `sp_abjurer_active_2`（双璧の護り）を **残す** |
| `sp_abjurer` | Lv10 active 3 | 範囲 barrier または all ally barrier。Recovery ではなく Stability の範囲化 | **追加** |
| `sp_abjurer` | Lv20 active 4 | 全体 damageTaken 軽減 + barrier など、Wave 中の崩壊を遅らせる上位 Stability | **追加** |
| `sp_alchemist` | basic | 最低 HP 比率の味方へ HoT。即時復元ではなく持続維持 | 現行 `sp_alchemist_basic_attack` を **残す** |
| `sp_alchemist` | passive | party HoT aura、高 HP ally DEF、DoT 対策 | 現行 passive を **残す** |
| `sp_alchemist` | Lv0 active 1 | 範囲 HoT + 敵 ATK debuff。被害量・被害速度の抑制 | 現行 `sp_alchemist_active_1`（薬粉撒き）を **残す** |
| `sp_alchemist` | Lv0 active 2 | 前列 / 近接帯の味方を長く保たせる sustain。HoT + DEF または damageTaken 補助 | **追加** |
| `sp_alchemist` | Lv10 active 3 | 状態異常対策を active 側にも持たせるか要確認。active dispel が重い場合は HoT + debuff 延長に置換 | **追加 / 要判断** |
| `sp_alchemist` | Lv20 active 4 | 長期戦向けの上位 sustain。party HoT 強化 + 敵被害速度低下 | **追加** |

Supporter pass の実装方針:

- `sp_cleric_active_2` は **広域治療のまま Lv0 に置かない**。設計書の「広域治療は Lv10」を正とし、Lv0 2 枠目は低 HP smart heal として追加する。
- `sp_abjurer` は direct heal 量を主役にしない。heal は barrier を成立させる補助で、役割の本体は barrier / damageTaken / Wave 猶予。
- `sp_alchemist` は毒・罠による Field Flow へ寄せない。敵への干渉は Survival 範囲の ATK debuff / 被害速度低下に限定する。
- active dispel を採用する場合は、既存 passive の `periodicDispel` と別に active effect として表現できるかを実装チャットで確認する。重い場合は v1 では passive のみ残す。

## 優先実装順

1. **Supporter 3 種の Lv0=2 整合**
   - `sp_cleric` の広域治療は Lv10 正本に寄せ、Lv0 2 枠目は低 HP smart heal として追加する。
2. **Defender 3 種の 4 枠化**
   - 既存 effect でほぼ進められる。戦線維持・戦線安定・攻撃防御の差分を明確化する。
3. **物理 Kill / Flow 6 種の Lv10 / Lv20 追加**
   - 多くは既存 effect で進められる。Hunter と Ballista の新メカニクスだけゲート化する。
4. **Caster 3 種**
   - `at_sigilist` の `conditionalEffect` と `at_geomancer` の damage routing 方針が重いため、最後にまとめて判断する。

## 実装チャットへ渡す単位

| 実装単位 | 対象 | 目的 |
| --- | --- | --- |
| Supporter pass | `sp_cleric`, `sp_abjurer`, `sp_alchemist` | Lv0=2 整合、Lv10 / Lv20 の Survival 構造確定 |
| Defender pass | `df_guardian`, `df_paladin`, `df_duelist` | 既存 4 枠化、戦線維持系の重複整理 |
| Physical pass A | `at_warrior`, `at_assassin`, `at_ranger` | 既存 effect 中心で Kill クラスの 4 枠化 |
| Physical pass B | `at_lancer`, `at_ballista`, `at_hunter` | Flow / pierce / trap のゲート整理 |
| Caster pass | `at_sorcerer`, `at_sigilist`, `at_geomancer` | 新 effect 採用可否、条件分岐・構造操作の確定 |
| Tooling pass | editor / validate / `formatSkillText` / spec | 新 effect / targetShape / condition を採用した場合の同期 |

## 未決事項

- `sp_alchemist` の active dispel を v1 に入れるか。重い場合は passive の `periodicDispel` のみ残し、active は HoT + debuff 延長に置換する。
- `conditionalEffect` を v1 本採用するか。採用するなら印術師実装と tooling pass を同じ作業にする。
- 法陣師を v1 で「本当の damage routing / transfer」まで実装するか、既存 AoE / scatter で暫定確定するか。
- Hunter の DoT 残り時間圧縮、視界・命中干渉を v1 へ入れるか。
- Ballista のフィールド端貫通ラインを既存 `pierce` の範囲に留めるか、戦場座標仕様として拡張するか。
- Guardian / Paladin / Duelist の Threat 操作を active skill に持たせるか、passive へ寄せるか。

## 完了条件

- 15 クラスすべてに basic + passive 方針 + Lv0 2 active + Lv10 active + Lv20 active が存在する。
- `data/skills/actives/*.json` に placeholder 名、未実装メモ、習得段階と矛盾するスキルが残らない。
- `classes.json` の習得テーブルがこの表の段階と一致する。
- 新 effect / target / condition を追加した場合、editor / validate / `formatSkillText` / spec が同じ作業で更新されている。
- `docs/spec/classes-and-skills.md` の TBD が、この表または実装済み仕様に置き換わっている。
