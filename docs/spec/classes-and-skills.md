# クラスとスキル

ゲームデータは `data/*.json`。型とローダー：`src/battle/types.ts`, `loadGameData.ts`

**スキルマスタ：** `data/classes.json`（15 クラス）と `data/skills/`（`passives.json` + `actives/<stem>.json`。共有パッシブ + クラス別 basic/active）が本番マスタ。数値バランスは調整対象だが、ID・形状・パッシブ種別はこの仕様に従う。

## 用語（スキル vs 装備）

将来のアイテム装備と紛らわしくならないよう、**スキル枠への割り当ては「セット」で統一**する。

| 日本語                          | 意味                                                                | コード上のフィールド（例）                          |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| **セット**                      | 習得済みアクティブを戦闘用スロットに割り当てること                  | `equippedActiveSlots`（セット済みスキル ID の配列） |
| **セット枠** / **アクティブ枠** | セット可能なアクティブ用スロット（Phase 1〜2: 1、Phase 3+: 最大 2） | 同上                                                |
| **習得**                        | LvUP 等で `learnedActiveIds` に追加されること（プールへの加入）     | `learnedActiveIds`                                  |
| **装備**                        | **将来**のアイテム・武器防具など（現フェーズのスコープ外）          | —                                                   |

- UI・仕様書・コメントでは「スキルを装備」ではなく「スキルをセット」「セット枠」と書く。
- JSON / TypeScript の `equippedActiveSlots` 等は歴史的な識別子として維持（中身は「セット済み」）。

### 戦闘用語

| 用語     | 定義                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| **攻撃** | `damage` または `dot` を含むスキル（通常攻撃 `slotKind: basic` 含む）             |
| **反撃** | 攻撃を受けたとき、設定量のダメージを攻撃者へ返す効果。バフ/デバフタグには含めない |

## ロール（3 種）

| ロール      | 役割                                                  |
| ----------- | ----------------------------------------------------- |
| `defender`  | 前列タンク + 軽い支援（buff/heal 可）                                      |
| `attacker`  | ダメージディーラー。近接帯（`rangePx < 100`）は前列、遠隔帯は後列が既定 |
| `supporter` | 回復・支援（後列が典型）                                                   |

`classId` 命名：`{rolePrefix}_{englishSlug}`

| プレフィックス | ロール      |
| -------------- | ----------- |
| `df_`          | `defender`  |
| `at_`          | `attacker`  |
| `sp_`          | `supporter` |

例：`df_guardian`, `at_ranger`, `sp_cleric`

## クラス区分

| 区分         | 現状                     | 備考 |
| ------------ | ------------------------ | ---- |
| **プレイ可能** | 15 種（下表）            | `data/classes.json` に定義 |
| **予約フィールド** | なし                  | `jobTier` / `promotion` / `promotesFrom` は廃止 |

クラス ID と表示名、ロール、射程、スキル習得は `classes.json` を正とする。将来の追加クラスは同じ形式で拡張する。

### クラスマスタ（15 種）

表示名の英語肩書きは `epithetEn`（UI 表示は Phase 3c 以降）。

#### defender（`df_`）

| classId       | 表示名 | epithetEn | 列    | 射程 | パッシブ            | アクティブ                            |
| ------------- | ------ | --------- | ----- | ---- | ------------------- | ------------------------------------- |
| `df_guardian` | 鉄衛士 | Guardian  | front | 近接 | 最高 ATK 狙い       | シールドバッシュ（ダメ+スタン）／威圧 |
| `df_paladin`  | 護法士 | Paladin   | front | 近接 | 被ダメ 12% 即時回復 | 手当／聖盾                            |
| `df_duelist`  | 闘技士 | Gladiator | front | 近接 | 低 HP 火力          | 砂かけ（debuff+スタン）／隙撃ち       |

#### attacker（`at_`）

| classId        | 表示名 | epithetEn | 列    | 射程     | パッシブ            | アクティブ                                           |
| -------------- | ------ | --------- | ----- | -------- | ------------------- | ---------------------------------------------------- |
| `at_warrior`   | 剣術士 | Swordsman | front | 近接     | —                   | 剣閃（4 通常後・atk×2.1）／薙ぎ払い                  |
| `at_assassin`  | 双刃士 | Assassin  | front | 近接     | 最低 HP 狙い + 回避 | 背刺（背後+連打）／仕留め                            |
| `at_lancer`    | 槍術士 | Lancer    | front | 近接     | 最高 HP 狙い        | 貫突／突き刺し                                       |
| `at_ranger`    | 弓術士 | Ranger    | back  | 遠隔物理 | 遠隔攻撃中敵優先    | 速射（4 通常後）／貫矢                               |
| `at_sniper`    | 狙撃士 | Sniper    | back  | 遠隔物理 | 最遠敵優先          | 精密射／貫通矢                                       |
| `at_hunter`    | 狩猟士 | Hunter    | back  | 遠隔物理 | 自 DoT 対象ボーナス | 毒罠（scatter+DoT）／拘束罠（scatter+スタン+debuff） |
| `at_sorcerer`  | 魔術士 | Sorcerer  | back  | 遠隔魔法 | 最低 REG 狙い       | 魔弾／集中砲                                         |
| `at_enchanter` | 符術士 | Enchanter | back  | 遠隔魔法 | 最低 DEF 狙い       | 連符（chain）／爆符                                  |
| `at_geomancer` | 法陣師 | Geomancer | back  | 遠隔魔法 | 密集時 AoE ボーナス | 大法陣／小法陣                                       |

※ `at_lancer_passive_1` は常時パッシブとして扱う。対象が自身以外で、後から範囲内に入るケースがあるため、戦闘中に定期的な再評価を前提にする。`at_lancer_passive_2` はアクター自身をアンカーにした範囲バフとして扱う。

#### supporter（`sp_`）

| classId        | 表示名 | epithetEn | 列   | 射程 | パッシブ                                                                                                   | アクティブ（Lv0）                                        |
| -------------- | ------ | --------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `sp_cleric`    | 療養師 | Cleric    | back | 遠隔 | `sp_cleric_passive_1`（低 HP 味方への回復量増）                                                            | `sp_cleric_active_1` のみ                                |
| `sp_abjurer`   | 結界師 | Abjurer   | back | 遠隔 | Lv0: `passive_1`（Wave 開始バリア）+ `passive_2`（余剰回復 → バリア）／Lv10: `passive_3`（前衛被ダメ軽減） | `sp_abjurer_active_1` のみ                               |
| `sp_alchemist` | 薬草師 | Herbalist | back | 遠隔 | Lv0: `passive_1`（常時 HoT aura）／`passive_2`・`passive_3` は stub・未本実装                              | `sp_alchemist_active_1` のみ（範囲 HoT + 敵 atk debuff） |

### デモ編成（`parties.json` demo）

| 枠  | classId       | 表示名 |
| --- | ------------- | ------ |
| 1   | `df_guardian` | 鉄衛士 |
| 2   | `at_warrior`  | 剣術士 |
| 3   | `sp_cleric`   | 療養師 |
| 4   | `at_ranger`   | 弓術士 |

未編成の残り 11 クラスは `DEFAULT_ROSTER_EXTRAS.demo` でアンロック（編成画面から選択可）。

詳細な設計方針・Lv 習得表・TBD は **§クラスサポ設計方針** を正とする。実装履歴の詳細は Cursor プラン（結界師バリアヒーラー化・薬草師データ固め）も参照可。

## クラスサポ設計方針

### 共通ルール

| 項目               | 内容                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| **Lv0 アクティブ** | **`active_1` のみ**（`active_2` は基本性能確定まで設計・習得しない）                            |
| **Lv0 パッシブ**   | 原則 `passive_1`。**結界師**は Lv0 で `passive_2`（余剰回復 → バリア）も習得                    |
| **`active_2`**     | 通常攻撃・パッシブ・`active_1` の基本性能確定まで **設計・習得しない**（Lv20 枝候補として保留） |
| **スキル表示名**   | 仮で `name` = `id`。正式名称は後日決定                                                          |
| **回復力順位**     | 療養師 ≈ 結界師（実効耐久 parity） **＞** 薬草師（instant/burst heal は意図的に劣る）           |

### Lv0 / Lv10 / Lv20 習得パターン

defender 系（[`data/classes.json`](../../data/classes.json)）を **参照実装**:

| 段階 | 典型内容                                     | データ例                                                            |
| ---- | -------------------------------------------- | ------------------------------------------------------------------- |
| Lv0  | 共有 passive + クラス passive_2 + active_1/2 | 鉄衛: `defender_passive_1` + `df_guardian_passive_2` + `active_1/2` |
| Lv10 | passive_3 または active 差し替え             | 鉄衛: `passive_3`／闘技: `passive_3` + `active_3`                   |
| Lv20 | passive_4 + active 差し替え                  | 鉄衛: `passive_4`／闘技: `passive_4` + `active_4`                   |

**attacker / defender:** Lv0 で **アクティブ 2 種**を習得。**supporter:** Lv0 で **`active_1` のみ**（`active_2` は Lv20 枝候補）。

サポーター（現行データ + 設計状態）:

| classId        | Lv0（`classes.json`）                         | Lv10                                   | Lv20     |
| -------------- | --------------------------------------------- | -------------------------------------- | -------- |
| `sp_cleric`    | `passive_1` + `active_1` + `passive_2`        | **未定**                               | **未定** |
| `sp_abjurer`   | `passive_1` + `passive_2` + `active_1`        | `passive_3`（前衛被ダメ軽減 aura）     | **未定** |
| `sp_alchemist` | `passive_1` + `passive_2`（stub）+ `active_1` | `passive_3`（stub・def/reg buff 候補） | **未定** |

### 火力系バフ／デバフ（Lv20 枝方針）

**Lv0 では味方火力 UP / 敵被ダメ UP debuff を載せない。** Lv20 以降のロールバリエーション（`passive_4` / `active_2` 相当）として扱う。

| 種別                               | Lv0                                                     | Lv10+ / Lv20                              |
| ---------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| 味方 `atk` / `attackSpeed` buff    | **禁止**                                                | ロール分岐候補（例: 薬草師 調合 buff 枝） |
| 敵 `def`↓ / 被ダメ ↑ debuff        | **禁止**                                                | 同上                                      |
| 敵 `atk` debuff                    | **薬草師 Lv0 のみ可**（sustain 遅延。DPS 強化ではない） | 強化版は Lv10+ 検討                       |
| 味方耐久 UP（`damageTaken`↓ aura） | —                                                       | 結界師 Lv10 `passive_3`                   |
| 味方 `def` / `reg` stat buff       | Lv0 **禁止**（火力 buff ルールと非競合）                | 薬草師 Lv10+ 第一候補（Mulberry 系）      |
| 自己火力（scatter damage 等）      | **Lv0 なし**                                            | Lv20 枝のみ検討                           |

**根拠:** Lv0 で回復 + sustain + 味方火力 / 敵被ダメ debuff を持つとサポ 1 枠が強すぎる → defender 型 Lv0 / Lv10 / Lv20 に揃え **火力寄与は Lv20 枝**。

### 三サポの役割分担（Lv0 確定分）

| classId        | 個性              | Lv0 の柱                                                                  | 耐久の出し方                                             |
| -------------- | ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `sp_cleric`    | 純ヒーラー        | 直接 heal + 低 HP 味方 heal 特化（`passive_1`）                           | **HP 回復**                                              |
| `sp_abjurer`   | バリアヒーラー    | barrier + 少量 direct heal + 余剰回復 → バリア                            | **barrier** + **`damageTaken` 軽減**（Lv10 `passive_3`） |
| `sp_alchemist` | HoT + debuff サポ | **HoT 二段**（`passive_1` aura + `active_1` 範囲 HoT）+ **敵 atk debuff** | Lv0: debuff + HoT／Lv10+: 味方 `def` / `reg` buff 候補   |

**薬草師（Herbalist）参照:** Perfumer（常時 HoT + active 範囲 HoT）+ Mulberry（Lv10+ 味方 `def` / `reg` buff）。Lv0 では毒 DoT・scatter 与ダメ・通常攻撃 dmg+heal 同時は載せない。狩猟士（罠 + DoT 毒）との差: 薬草師 = HoT sustain + 与ダメ debuff（毒 DoT なし）。`active_1` の敵 debuff effect は後列から届くよう `effect.range` を `CONFIGURABLE_RANGE_PX_MAX`（460 px）に設定する。

**バランス目標:** 鉄衛 + 薬草師 90 秒 sim で実効 HP は cleric 比 **上限 75%**。

### 未決・TBD

- 薬草師: 第 3 sustain 要素、`passive_2` 本設計
- 全サポ: `active_2` / Lv20 `passive_4` の具体設計
- 療養師: `sp_cleric_active_2` は skills.json に下書きがあっても **未配線**（Lv20 候補メモのみ）
- 結界師: `sp_abjurer_active_2` は **廃止済み**

## 配置

`formationRow` で列を決定：`front` → `back`（左＝敵側）。正本は `classes.json` の各クラス `formationRow`。

**列の既定：**

| ロール      | `formationRow`                                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `defender`  | `front`                                                                        |
| `attacker`  | 近接帯（`rangePx < 100`）→ `front`、遠隔帯（`rangePx >= 100`）→ `back`         |
| `supporter` | `back`                                                                         |

敵のデフォルトターゲットは射程内でヘイト最大（[combat.md](combat.md) の Threat 節）。近接アタッカーが前列にいても、ディフェンダーがヘイトを引きつける想定。

同一 `formationRow` 内の X 深度（左＝後方、右＝前方）は [battle-field.md](battle-field.md) §2.6（`partyFormation.ts` の近接帯深度）を正とする。

味方の heal / move 向け `closestAlly` は **battleX 距離**が最小の味方。敵の `closestAlly` は **ヘイト加重抽選**（[combat.md](combat.md) の Threat 節）。

### EntityTraits（PC・敵共通）

`classes.json` / `enemies.json` の `traits`（省略可。ロード時に正規化）:

| フィールド       | 省略時                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `rangePx`        | `0`（分類用: 0〜99 は近接帯、100 以上は遠隔帯）                                                  |
| `damageType`     | `physical`                                                                                      |
| `basicAttackVfx` | なし。PNG VFX 用 `enabled` / `placement` があるとき battle VFX に使う |

`basicAttackSkillId` は省略可（`{entityId}_basic_attack`）。通常攻撃スキルはロード時に合成。`data/skills/actives/` に同名 ID があれば `name` / `atkScale` / `interval` 等のみ上書き可（`range` / `damageType` / `vfx` は traits 正）。

## スプライト・演出アセット

アセットパス・寸法の詳細は [sheets/README.md](../../src/assets/sprites/sheets/README.md)。フェーズ計画は [phase-roadmap.md](../plans/phase-roadmap.md) Phase 5 / 6。

### entity 本体（idle / move / death）

- **1 枚 PNG / entity:** `sheets/bodies/{classId|enemyId}.png`
- **レイアウト正本:** `data/entityAnimLayout.json` — 味方・敵 **共通**（idle 4 / move 4 / death 3 コマ、各 48×48、fps 8）
- **attack は entity に含めない** — 振り・弓引き等はすべてスキル strip
- **実装:** `src/render/entityAtlas.ts`（layout 読込・矩形計算・body preload）、`drawSpriteFrameAtFootAnchor`（bodies atlas 優先）。未配置時は旧 `sheets/{id}/{anim}.png` または静止画フォールバック

### スキル body（通常攻撃 + 全 active）

- **配置:** `sheets/skills/{skillId}.png` または `{skillId}_{effectIndex}.png`
- **1 コマ:** 64×48 px（横 strip）。通常攻撃 `{entityId}_basic_attack` も同規格
- **解決:** `resolveSkillAnimKey` → あれば **skill anim**。entity `attack` フォールバックは使わない（本番）
- **先頭 idle 参照コマ:** strip 0 コマ目に entity idle 0 と同絵を入れてよい。再生は effect **`animStartFrame`**（default `0`、idle 入りなら `1`）から（**実装済み:** `skillAnimPlayback.ts` / `SpriteAnimator`）
- **3 段再生（intro / hold / outro）:** effect に **`animLoopFrame`** を指定すると有効。`animIntroEndFrame`（省略時 = loop 開始）、`animLoopEndFrame`（省略時 = loop 開始）、`animOutroStartFrame`（省略時 = loop 終了 + 1）。hold 中は loop 開始〜終了コマをループ。hold 時間は `resolveSkillBodyPlaybackSec` が正本で、現時点では `useDurationSec > 0` のときのみ hold を積む（`skillAnimPlayback.ts`）

### スキル VFX（PNG strip）

- **配置:** `sheets/vfx/{skillId}_vfx.png` または `{skillId}_{effectIndex}_vfx.png`（命中用は `_vfx_hit` サフィックス）
- **1 コマ:** **64 × 64 px**（`VFX_ANIM_CELL_WIDTH` / `VFX_ANIM_CELL_HEIGHT`）。body strip（64×48）より高い
- **解決:** `resolveVfxAnimKey(skillId, effectIndex, kind)` — index 付き → 無 index。通常攻撃は `{entityId}_basic_attack_vfx`（= `{entityId}_basic_attack` スキル ID の `_vfx`）
- **再生:** `vfxAnimPlayback.ts`（`resolveVfxPlaybackSec` / `resolveVfxPlacement`）→ `VfxPlaybackManager`（`spawn` / `tick` / `draw`）。フェーズ計算は `skillAnimPlayback.ts` と共有
- **配置:** `vfxPlacement.ts` の `resolveVfxWorldPosition` — `footActor` / `footTarget` は entity 足元中央を 64×64 VFX の下辺中央に合わせる
- **描画:** `spriteFrameDraw.drawVfxFrameAtAnchor` — `BattleCanvas.playSkillVfx`（`layer` behind → entities → front）
- **再生フェーズ:** body と同型の **`AnimPhaseFields`**（`animStartFrame` 〜 `animOutroStartFrame`）。`applyFrame` は body strip の絶対コマ基準のまま（VFX 側の `animStartFrame` は VFX strip 内）
- **配置 JSON:** `vfx.placement` — `anchor`（`actor` / `target` / `between` / `footActor` / `footTarget`）、`offsetX` / `offsetY`、`layer`（`behind` / `front`）
- **命中 VFX:** effect **`hitVfx`**（main `vfx` とは別 PNG・別 `placement` 可）。未指定時は解決層の既定（`_vfx_hit` PNG があれば再生）

### 通常攻撃の見た目

| 条件 | body | VFX |
|------|------|-----|
| `sheets/skills/{id}_basic_attack.png` **あり** | skill anim 再生 | `basicAttackVfx` / effect `vfx` |
| PNG **なし** | なし | VFX PNG 未配置のため演出なし |

**遠隔**（`rangePx >= RANGED_ATTACK_MIN_PX`）も同じ。弓引き PNG を置けば body 再生する。VFX strip も `sheets/vfx/` に配置する。

### 演出解決（コード）

Battle イベント → `resolveSkillPresentation` / `resolveEffectPresentation` → skill anim 優先 → VFX。`resolveEffectPresentation` は戦闘 / ラボで共通し、`effectVfxOnly` を既定で有効にして `effect.vfx` 未指定時に `skill.vfx` へはフォールバックしない（`basicAttackVfx` は通常攻撃のみ）。body 再生秒数は `resolveSkillBodyPlaybackSec` を戦闘 / ラボで共通使用し、残りの表示ロックは [combat.md](combat.md) の `presentationLock` / `animLock`。調整 UI は **演出ラボ**（`presentation-lab.html` / `PresentationPreviewRunner` — Canvas プレビュー + VFX 統合。BattleEngine 非依存）。

### 射程

| スキル種別                 | `effect.range`                              |
| -------------------------- | ------------------------------------------- |
| **通常攻撃**（合成 basic） | effect に書かない（`actor.traits.rangePx`） |
| アクティブ等               | 任意。省略時 = `actor.traits.rangePx`       |

**設定上限:** `traits.rangePx` および `effect.range` は `0〜CONFIGURABLE_RANGE_PX_MAX` px（`rangeLimits.ts`: `CANVAS_W - PARTY_FORMATION_LEFT_ANCHOR`）。

分類用途では `RANGED_ATTACK_MIN_PX`（100）を使う。`traits.rangePx >= RANGED_ATTACK_MIN_PX` で遠隔攻撃（`rangedAttackingEnemy`）とし、`traits.damageType === 'magic'` で `magicAttackingEnemy`。

距離用途では [battle-field.md §2.5](./battle-field.md#25-攻撃位置move新軸) の `effectiveRangePx` 共通式を使う。`0〜MELEE_RANGE_MAX_PX` は近接帯（slash VFX）で、停止位置や移動量の計算に 100px 境界は使わない。

**クラス `rangePx`（参考）：** 双刃士/闘技 0、鉄衛/護法 5、剣術 8、槍術 24、魔法 30、物理レンジ 40。

## クラスステータスと成長（Phase 4）

`classes.json` の `ClassPreset` に加え、各クラスは次を定義する。

```typescript
type GrowthTier = 1 | 2 | 3; // UI: 低 / 中 / 高

interface GrowthTierSet {
  maxHp: GrowthTier;
  atk: GrowthTier;
  def: GrowthTier;
}

// ClassPreset（抜粋）
maxHp: number;   // Lv1
atk: number;
def: number;
reg: number;     // 固定（成長なし）。許容値: 0, 5, 10, 15, 20
growthTier: GrowthTierSet;
growthPresetKey?: "attacker" | "caster"; // 魔術系（at_sorcerer 等）の成長合成
attackSpeedTier?: AttackSpeedTier;       // 未指定 = normal
epithetEn?: string;   // 英語肩書き（UI 未接続）
passiveIds?: string[]; // クラス固有パッシブ（skills.json passives への参照）
```

- 成長の実数解決・`growthPresets` 表・術師合成ルール → [stats.md](stats.md)
- 開発 GUI（`ClassEditorStep`）で Lv1 / 成長段階 / SPD を編集可能

## スキル枠

| 枠          | 数      | 出所                                                      | UI                 |
| ----------- | ------- | --------------------------------------------------------- | ------------------ |
| **basic**   | 1       | `ClassPreset.basicAttackSkillId`                          | 非表示             |
| **passive** | 0〜複数 | `ClassPreset.passiveIds` → `learnedPassiveIds` に自動反映 | 将来               |
| **active**  | 最大 4  | `build.learnedActiveIds`（習得即戦闘参加）                | HUD 2×2 リキャスト |

- 基本攻撃も `data/skills/actives/` に `{entityId}_basic_attack` として定義し、`slotKind: 'basic'` で実行。
- 基本攻撃 ID をセット枠（`equippedActiveSlots`）に入れない。
- **defender / attacker:** Lv0 でアクティブ 2 種を習得（`skills[].level: 0` に 2 active ID）。**supporter:** Lv0 で **`active_1` のみ**（`active_2` は Lv20 枝候補。詳細は §クラスサポ設計方針）。
- 戦闘エンジンは **習得済みアクティブを最大 4 枠まで**自動参加（段階解放: Lv0=2 / Lv15=3 / Lv30=4）。
- **`equippedActiveSlots`** — スキルメニュー（テスト・バランス用）のみ。本番戦闘の参加判定には使わない。

### LvUP 習得データ

- `classes.json` の `skills[]` にレベル別 `skillIds` を定義（**passive ID は `passiveIds` のみ**。`skills[]` に入れない）。
- `passiveIds` は Lv に関係なく常時有効（`resolveLearnedSkills` が `learnedPassiveIds` へ展開）。

## ビルドルール

```typescript
interface CharacterBuild {
  learnedPassiveIds: string[]; // すべて同時発動
  learnedActiveIds: string[]; // 習得プール（最大 4。LvUP で増加）
  equippedActiveSlots: string[]; // テスト用セット枠（SkillMenuPanel）。戦闘参加には未使用
}
```

- **パッシブ：** `learnedPassiveIds` の全 ID が同時に有効（枠上限なし）
- **アクティブ：** `learnedActiveIds` のうち解放枠数までが戦闘に自動参加し、発動条件を満たしたときに自動発動

### アクティブの発動条件（`trigger`）

| フィールド       | 説明                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger.kind`   | `time`（秒）／`basicAttackCount`（通常攻撃回数）／`hitsTaken`（被攻撃回数）                                                                                                                                        |
| `trigger.value`  | 条件の閾値 N。ステージ開始時 `remaining = N`（ゲージ未充填）。カウントトリガーは N 回のイベントで `remaining === 0`（ゲージ Max）となり、N+1 回目で発動・`remaining = N` にリセット。時間トリガーは 0 到達で即発動 |
| `useDurationSec` | optional。発動後ロック時間（秒）。省略 / `0` = 即時。**詠唱など、発動後に明示ロックが必要な場合のみ使う**。発動後はそのユニットの他スキル発動を止めるが、CD 進行は止めない（詳細は [combat.md](combat.md)）                                                         |
| `firePolicy`     | optional。`immediate`（既定）／`smart`（条件成立まで発動保留）                                                                                                                                                     |
| `fireConditions` | `firePolicy: smart` 時の AND 条件（[combat.md](combat.md)）                                                                                                                                                        |
| `fireTimeoutSec` | smart 保留の最大秒。経過後は条件無視で発動                                                                                                                                                                         |
| `maxCharges`     | optional。保持ストック上限（0〜3）。省略 = **0**（保持なし）                                                                                                                                                       |

### パッシブ `skillPropertyOverride`（多段チャージ）

| フィールド                      | 説明                                                       |
| ------------------------------- | ---------------------------------------------------------- |
| `effect: skillPropertyOverride` | 対象アクティブの属性を上書き                               |
| `maxChargesBonus`               | 対象スキルの `maxCharges` 加算（上限 3 でクリップ）        |
| `skillPropertyTargetSkillIds`   | optional。対象アクティブ ID（未指定 = 習得アクティブ全体） |

- `basicAttackCount` — ステージ開始時 `remaining = value`（未充填）。**通常攻撃のダメージが発生するたび**、装備中の全 `basicAttackCount` アクティブがそれぞれ `remaining--`（`remaining > 0` のとき。多段通常攻撃はダメージごとにカウントし、攻撃枠単位ではまとめない。回避時は進まない）。2 段通常攻撃なら 1 回の攻撃枠で各スキルとも 2 カウント（例: 8 必要なら 1,2 → 3,4 → …）。N 回目でゲージ Max（発動せず）、**N+1 回目の通常攻撃枠でアクティブ発動**（通常攻撃の代わり）
- `hitsTaken` — 被ダメ（`hurt`）のたび `remaining--`（`remaining > 0` のとき）。N 回目でゲージ Max（発動せず）、**N+1 回目の被弾でアクティブ発動**（ダメージは通常通り）
- **通常攻撃** は従来どおり JSON の `interval`（時間のみ）+ `attackSpeedTier` / SPD
- レガシー JSON の `interval` はアクティブでも `trigger: { kind: "time", value: interval }` として読み込む

```json
{
  "id": "at_warrior_active_1",
  "trigger": { "kind": "basicAttackCount", "value": 4 },
  "effect": [ ... ]
}
```

### スキルアイコン（`iconKey`）

`passives[]` / `actives[]` の各エントリに optional で指定。PNG は `src/assets/skill-icons/{iconKey}.png`。

| 優先                                                                                 | 未指定時の表示                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1. `iconKey`                                                                         | カスタム PNG（glob 自動登録）                    |
| 2. `allowedClassIds[0]`                                                              | 該当クラスの role / `attackRange` プレースホルダ |
| 3. UI コンテキストの所属クラス                                                       | 同上                                             |
| 4. `id` の role プレフィックス（`df_*` / `at_*` / `sp_*`、レガシー `defender_*` 等） | 同上                                             |
| 5. 上記いずれも不可                                                                  | `supporter_placeholder`                          |

### パッシブ効果（`PassiveEffectKind`）

共有パッシブは `data/skills/passives.json` に定義し、クラスは `passiveIds` で参照する。

| effect               | 主なフィールド                                                                                                                                              | 挙動                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targetRuleOverride` | `targetRuleOverride`, `targetRuleOverrideApplyTo?` (`enemy` / `ally`)                                                                                       | effect のターゲット陣営とスコープが一致するときだけ `targetRuleOverride` で上書き（`enemy` = 敵向け effect・通常攻撃・接近、`ally` = 味方向け effect。`kind: self` は常に除外。複数時は配列の後ろ優先）                                     |
| `specialEffect`      | `specialEffectApplyTo`, `specialEffect`                                                                                                                     | 条件付き特効倍率。`damage` = 与ダメ、`heal` = 被回復（直接 heal のみ、HoT 非対象）。`conditions: []` は無条件で `scale` 適用                                                                                                                |
| `buff`               | `buffSubKind`, `buffTargetRule`, `buffTargetShape?`, `buffRange?`, 形状別フィールド, `chance?`, `buffStat?`, `periodicTrigger?` 等                          | **常時**（未指定時。barrier は除く）または **Stage/Wave 開始時**（`stageStart` / `waveStart`）。ターゲット形状・射程はアクティブ `buff` / `barrier` effect と同型（接頭辞 `buff`）。`buffSubKind`: `stat` / `barrier` / `block` / `evasion` |
| `debuff`             | `debuffSubKind`, `debuffTargetRule`, `debuffTargetShape?`, `debuffRange?`, 形状別フィールド（`debuffAoeRadiusPx` 等）, `debuffStat?`, `periodicTrigger?` 等 | **常時**（未指定時）または **Stage/Wave 開始時**（`stageStart` / `waveStart`）。ターゲット形状・射程はアクティブ `debuff` effect と同型（接頭辞 `debuff`）。`debuffSubKind`: `stat` / `dot` / `stun`                                        |

**スタン（`stun` / `debuffSubKind: stun` / counter `kind: stun`）:** `durationSec` **上限 5 秒**。付与成功時に対象の通常攻撃 CD を満タンにリセット。スタン中は time トリガーアクティブ CD 停止（基本攻撃 CD は進行）。詳細は [combat.md](combat.md) のスタン行。
| `counter` | `chance`, `counterResponses[]`, `counterRange?` | 常時受付。被 `damage` / `dot` で HP に入ったダメージがあるたび、射程内なら `chance` を判定し、成功時に `counterResponses` を攻撃者へ直接適用（反撃 StatusEffect は付与しない） |
| `damageReduction` | `damageReductionPercent`, `damageReductionTargetRule`, `damageReductionTargetShape?`, `damageReductionRange?`, 形状別フィールド | 対象に常時被ダメ軽減を付与（戦闘開始時同期）。ターゲット形状・射程はアクティブ effect と同型（接頭辞 `damageReduction`） |
| `defenseIgnore` | `defenseIgnore` | 与ダメ時の DEF / REG 無視（`damage` / `dot` でも effect 単位で指定可） |
| `periodicDispel` | `periodicTrigger`, `dispelTriggerLimit?`, `dispelTargetRule`, `dispelTargetShape?`, `dispelRange?`, 形状別フィールド, `dispelCount`, `dispelTags?` | Stage/Wave 開始時、または **対象がデバフを受けた時**（`onDebuffReceived`）にデバフ解除。`dispelTriggerLimit` = 1 Wave 内の発動上限（未指定 = 無制限）。ターゲット形状・射程はアクティブ `dispel` effect と同型（接頭辞 `dispel`） |
| `aoeCrowdBonus` | `perExtraTargetScale`, `maxExtraTargets` | `aoe` / `scatter` の追加ヒット数ボーナス |
| `damageTakenToHeal` | `ratio` | HP に入った最終ダメージの `ratio` 割合を即時回復（バリア吸収後。ATK 基準ではない） |
| `heal` | `healSubKind`, `hotAmount`, `hotTargetRule`, `hotTargetShape?`, `hotRange?`, 形状別フィールド, `periodicTrigger?`, `hotDurationSec?` | `healSubKind: hot` — 未指定時は常時 HoT aura。`periodicTrigger: stageStart` / `waveStart` で開幕付与。`hotDurationSec` は付与 HoT の持続（0=無限）。ターゲット形状・射程はアクティブ heal(hot) effect と同型（接頭辞 `hot`） |
| `excessHealToBarrier` | `barrierScale`, `excessHealSources?` | 回復が maxHp を超過した分をバリアに変換（**上書き**）。`outgoing`（与回復）/ `incoming`（被回復）を複数選択可。未指定 = `outgoing` のみ。直接 `heal` のみ |
| `selfHpRatioBuff` | `buffStat`, `buffMultiplierMax?` / `buffFlatBonusMax?`, `maxBuffAtHpRatio` | 自身 HP 割合（`hp/maxHp`。バリア非含有）に応じた常時バフ（対象・形状は自身単体固定）。満タン時は中立、指定 HP 割合以下で最大 |
| `skillAmountOverride` | `targetSkillId`, `amount`, `effectIndex?`, `passiveAmountField?` | 指定スキル（アクティブ / 取得済みパッシブ）の `ResourceAmountSpec` を完全上書き。アクティブは `effectIndex` 省略で amount 持ち effect すべて。パッシブは `hotAmount` / `barrierAmount`。複数時は `learnedPassiveIds` の後方優先。反撃 `counterResponses` は対象外 |

**ブロック / 回避（`buff` + `buffSubKind`）:** `block` / `evasion` は `chance`（0〜1）を `StatusEffect`（`overlay: block` / `evasion`）として同期。複数ソースは加算（上限 1）。ブロックは DEF 適用後の物理直接ダメージのみ判定。回避は直接 `damage` のみ（DoT 非対象）。`counter` の `chance` は被攻撃時の反撃確率。上記以外の Stage/Wave 開始パッシブは同じ `chance` フィールドで **発動確率**（未指定=1）。

**パッシブ発動タイミング（`periodicTrigger`）:** エディタでは「発動タイミング」。`buff` / `debuff` / `heal`（HoT）/ barrier で **常時**（未指定）または **`stageStart` / `waveStart`**。`periodicDispel` は **`stageStart` / `waveStart` / `onDebuffReceived`（対象がデバフを受けた時）**。Stage/Wave 開始時および `onDebuffReceived` では `chance` で発動確率をロール（`block` / `evasion` / `counter` は除外）。`periodicDispel` の **`dispelTriggerLimit`** は **1 Wave 内の発動回数上限**（未指定 = 無制限）。`onDebuffReceived` では効果対象にデバフ付与のたび 1 回判定し、**確率成功時のみ発動回数を消費**（失敗時は消費せず、同一イベントで再判定もしない）。

**読み込み互換（正規化）:** `evasionChance` → `buff`+`evasion`、`block`+`blockChance` → `buff`+`block`、`counterChance` → `counter`、`damageIncrease` / `healReceivedIncrease` → `specialEffect`、`extendSelfAppliedDebuff` は削除（データから除去済み）

**移行（削除済み）:** `selfLowHpDamageScale` → `selfHpRatioBuff`、`damageVsDotTarget` → `specialEffect`（`debuff` + `dot`）、`healAppliesBarrier` → `excessHealToBarrier`、`damageIncrease` の `selfHp` 条件 → `selfHpRatioBuff`

### 特効効果（`specialEffect` / `DamageIncreaseSpec`）

パッシブ `specialEffect` とアクティブ effect の `damageIncrease`（回復時は heal 特効）で共用。

| フィールド               | 説明                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `scale`                  | 条件成立時（または `conditions: []` で無条件）の倍率               |
| `conditions[]`           | 全条件 **AND**。種別: `debuff` / `targetHp`。空配列 = 常時 `scale` |
| `debuff.tags`            | デバフタグ（OR）。`DEBUFF_FILTER_TAGS` 参照                        |
| `debuff.selfAppliedOnly` | DoT 等で自分付与のみ                                               |
| `targetHp.maxHpRatio`    | 対象 `hp/maxHp ≤ ratio`（バリア非含有）                            |

### 防御無視（`DefenseIgnoreSpec`）

| フィールド    | 説明                               |
| ------------- | ---------------------------------- |
| `chance`      | 発動確率（0〜1）。未指定 = 1       |
| `def.mode`    | `flat` / `percent`                 |
| `def.amount`  | 固定値 or 0〜1 割合                |
| `reg.percent` | REG 無視割合（0〜1、魔法ダメージ） |

### デバフ解除（`dispel` effect / `periodicDispel` passive）

| フィールド       | 説明                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `dispelCount`    | `0` = 対象タグすべて、`N>0` = 優先度に従い N 件                                                 |
| `dispelTags`     | 未指定 = 全デバフタグ（`atk` / `def` / `reg` / `damageTaken` / `attackSpeed` / `dot` / `stun`） |
| `dispelPriority` | 未指定 = `longest`（最長）。`strongest` = 効果量最大を優先                                      |
| `dispelTriggerLimit` | パッシブ `periodicDispel` のみ。1 Wave 内の発動回数上限（未指定 = 無制限）              |

### ブロック / 回避（`buff` effect、`buffSubKind`）

| フィールド        | 説明                             |
| ----------------- | -------------------------------- |
| `buffSubKind`     | `block` または `evasion`         |
| `chance`          | 0〜1。複数ソースは加算（上限 1） |
| `buffDurationSec` | 付与 buff の持続（秒）           |

アクティブは `type: buff` + `buffSubKind` で `StatusEffect`（`overlay: block` / `evasion`）を付与。パッシブは `syncBuffAuras` で常時同期。旧 `type: block` / パッシブ `block` は読み込み時に正規化。

### 通常攻撃変形（`basicAttackTransform` effect）

アクティブ effect の `type: "basicAttackTransform"`。付与対象は **自身固定**（`target: self`）。

| フィールド              | 説明                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| `buffDurationSec`       | 変形持続（秒）                                                       |
| `hitCountMultiplier`    | optional。既存 primary の `hitCount` に乗算                          |
| `primaryEffectOverride` | optional。primary effect を丸ごと差し替え（`damage` / `heal` 等）    |
| `primaryPatch`          | optional。`damageType` / `amount.atkScale` / `target` 等の部分上書き |
| `appendEffects`         | optional。primary の後に追加する effect 配列                         |

旧形式 `type: "buff"` + `buffSubKind: "basicAttackTransform"` は読み込み時に正規化される。

バフ持続中のみ通常攻撃を実行時マージ。スキル発動アニメ中は従来どおり通常攻撃停止。`animLock` / `presentationLock` / `useDurationSec` の役割分担は [combat.md](combat.md) を参照。

### 反撃（`counter` effect）

| フィールド              | 説明                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `target`                | **常に `{ kind: "self" }`**（パーサーで正規化。付与は自身のみ）                                                         |
| `responses[]`           | 反撃時に攻撃者へ適用する内容（**1 種別以上必須**）。各要素の `kind`: `damage` / `debuff` / `dot` / `stun` / `knockback` |
| `responses[].amount` 等 | 種別ごとに通常 effect と同型のフィールド（`damage` は `amount` + `damageType?`、`debuff` は `debuffStat` 等）           |
| `durationSec`           | 反撃状態の持続（秒）                                                                                                    |
| `range`                 | optional。反撃発動の射程（px）。未指定・`0` = 持有者 `traits.rangePx`（エディタ `+0`）。正の値は絶対 px                 |
| `targetShape`           | **`multiLock` 禁止**（その他の形状も付与は自身のみのため実質未使用）                                                    |

アクティブ `counter` は `StatusEffect`（`overlay: counter`, `responses`, `counterRangePx?`）を付与。バフ/デバフフィルタタグには含めない。詳細は [combat.md](combat.md) の反撃節。

### 確率反撃（`counter` passive）

| フィールド           | 説明                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `chance`             | 被攻撃時の反撃発動確率（0〜1）                                                                          |
| `counterResponses[]` | 反撃内容（アクティブ `counter` の `responses[]` と同型）                                                |
| `counterRange`       | optional。反撃発動の射程（px）。未指定・`0` = 持有者 `traits.rangePx`（エディタ `+0`）。正の値は絶対 px |

常時受付。被 `damage` / `dot` で HP に入ったダメージがあるたび、射程内なら `chance` を判定し、成功時に `counterResponses` を攻撃者へ直接適用。反撃 `StatusEffect` は付与しない。アクティブ `counter` とは独立に併用可。旧 `counterChance` は読み込み時に `counter` + `chance` へ正規化。

**旧 JSON 互換:** トップレベル `amount` のみの場合は `responses: [{ kind: "damage", amount, damageType? }]` に昇格。

レガシー合成（未使用の旧クラスデータに残る場合）:

| 効果                    | 合成ルール            |
| ----------------------- | --------------------- |
| `damageMultiplier`      | 乗算                  |
| `damageTakenMultiplier` | 乗算                  |
| `healBonus`             | 加算                  |
| `activeCooldownRate`    | 乗算（active 枠のみ） |

## ターゲット指定（`target: TargetSpec`）

effect・パッシブのターゲットは構造化オブジェクト `target` で指定する。読み込み時に旧 `targetRule` 文字列は正規化される（書き込みは `target` のみ）。

### 種別一覧

| `kind`       | 説明                                                                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `distance`   | `side`（ally/enemy）+ `order`（nearest/farthest/**selfOrigin**）。`selfOrigin` = 使用者位置・向きを効果範囲の起点とする（aoe / pierce / single）。`includeSelf`（任意）= 味方 side 時、最終対象に使用者を含める（既定 false） |
| `stat`       | `side` + `stat`（hp/atk/def/reg）+ `order`（highest/lowest/ratio）。`ratio` は HP のみ（`hp/maxHp` 最小 = 最もダメージを受けた味方）。`multiLock` 時は満タン（`hp >= maxHp`）の味方をプールから除外                                                                                          |
| `attackType` | `physical` / `magic` / `melee` / `ranged` チェックボックス（OR）。両グループにチェック時は AND。フィルタ後 anchor は最前線                                                                                                    |
| `status`     | `side`（既定 enemy）+ `debuffTags` / `buffTags`（OR）。フィルタ後 anchor は最前線                                                                                                                                             |
| `self`       | 自身                                                                                                                                                                                                                          |
| `all`        | `side` で味方全員 / 敵全員（射程無視）                                                                                                                                                                                        |

### アンカーの意味

- `nearest` / `farthest` は「どの対象を選ぶか」の距離順で、`selfOrigin` は「どこを起点に形状を解くか」のアンカー指定。
- `selfOrigin` は `aoe` / `pierce` / `chain` の幾何解決に使う。`single` では単一対象選択の起点に留まり、`self` と同義ではない。
- `includeSelf` は `distance.side: ally` の最終対象に自分を含めるかだけを制御し、アンカーの意味は変えない。

### パッシブのターゲット解決

- パッシブは `TargetSpec` を active と同じルールで解決するが、`periodicTrigger` の有無で再評価タイミングが変わる。
- `periodicTrigger` 省略の常時パッシブは、対象を一度固定せず、戦闘中に定期的に再評価する前提とする。対象が後から範囲内に入るなら、その都度有効化される。
- `target: self` は常に自身単体、`distance.order: selfOrigin` は自身をアンカーにした範囲解決であり、役割が異なる。

### 旧 `targetRule` との対応（読み込み互換）

| 旧 `targetRule`                        | 新 `target`                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `frontEnemy`                           | `{ "kind": "distance", "side": "enemy", "order": "nearest" }`          |
| `closestAlly`                          | `{ "kind": "distance", "side": "ally", "order": "nearest" }`           |
| `farthestEnemy`                        | `{ "kind": "distance", "side": "enemy", "order": "farthest" }`         |
| `lowestHpEnemy`                        | `{ "kind": "stat", "side": "enemy", "stat": "hp", "order": "lowest" }` |
| `mostDamagedAlly`                      | `{ "kind": "stat", "side": "ally", "stat": "hp", "order": "ratio" }`   |
| `rangedAttackingEnemy`                 | `{ "kind": "attackType", "ranged": true }`                             |
| `debuffedEnemy` + `targetDebuffFilter` | `{ "kind": "status", "side": "enemy", "debuffTags": [...] }`           |
| `allAllies` / `allEnemies`             | `{ "kind": "all", "side": "ally" \| "enemy" }`                         |

## effect 共通フィールド（`data/skills/`）

| フィールド                                                   | 説明                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `target`                                                     | anchor 選定（`TargetSpec`）。**射程内**のユニットのみ対象（`self` / `all` を除く）                                                   |
| `damageIncrease`                                             | 任意。`damage` / `heal` / `dot` 用条件付き倍率（`heal` は直接回復のみ）                                                              |
| `defenseIgnore`                                              | 任意。`damage` / `dot` 用 DEF / REG 無視                                                                                             |
| `targetShape`                                                | `single`（既定）／`aoe`／`multiLock`／`pierce`／`chain`／`scatter`                                                                   |
| `aoeRadiusPx`                                                | `aoe` 必須。anchor の X から ±px                                                                                                     |
| `hitCount`                                                   | `multiLock` 必須（整数 ≥ 2）。`single` / `aoe` 任意（整数 ≥ 2、省略=1）                                                              |
| `hitDurationSec`                                             | `single` / `aoe` で `hitCount >= 2` 時必須。全ヒットを均等分散                                                                       |
| `chainCount` / `chainMaxDistancePx`                          | `chain` 必須                                                                                                                         |
| `chainPowerStepMultiplier` / `chainPowerStepMode`            | `chain` 任意。跳ごとの威力減衰（`multiply` / `divide`）                                                                              |
| `chainDurationSec`                                           | `chain` 任意。複数命中の適用時間分散（秒）。未指定 = `0.15 × chainCount` 秒（2 体以上命中時）                                        |
| `scatterSpreadRadiusPx`                                      | `scatter` 任意。着弾位置の分散半径（±px）。未指定 = `scatterRadiusPx`                                                                |
| `scatterRadiusPx` / `scatterHitCount` / `scatterDurationSec` | `scatter` 必須（`scatterRadiusPx` = 乱打半径・命中判定）                                                                             |
| `scatterSpreadRate`                                          | `scatter` 任意（0〜1。0 = anchor 中心固定。着弾 offset = `scatterSpreadRadiusPx × rate`）                                            |
| `piercePowerStepMultiplier` / `piercePowerStepMode`          | `pierce` 任意。命中ごとの威力減衰（`multiply` / `divide`）                                                                           |
| `pierceDurationSec`                                          | `pierce` 任意。複数命中の適用時間分散（秒）                                                                                          |
| `range`                                                      | 命中判定・VFX 共用（px）。省略時 = `actor.traits.rangePx`。`pierce` + `selfOrigin` では向き前方の効果距離                            |
| `anim`                                                       | 任意。スキル PNG 未配置時の entity anim フォールバック（本番では **skill strip 優先**）。`none` で body 抑制 |
| `animStartFrame`                                             | 任意。スキル strip 内の再生開始コマ。先頭 idle 参照コマを skip するとき `1`（**実装済み**） |
| `animLoopFrame`                                              | 任意。ループ開始コマ。指定時は intro → hold（開始〜終了をループ）→ outro の 3 段再生（**実装済み**） |
| `animLoopEndFrame`                                           | 任意。ループ終了コマ（inclusive）。省略時は `animLoopFrame` |
| `animIntroEndFrame`                                          | 任意。イントロ最終コマ（inclusive）。省略時は `animLoopFrame` |
| `animOutroStartFrame`                                        | 任意。アウトロ開始コマ。省略時は `(animLoopEndFrame ?? animLoopFrame) + 1` |
| `applyFrame`                                                 | 任意。strip 内の**効果適用コマ**（絶対 index）。省略 = 即時。遅延秒 = `max(0, applyFrame - animStartFrame) / 8`。body は発動直後、VFX・ダメージは apply コマ（`skillWindup` → pending） |
| `vfx`                                                        | 任意。effect 単位の main VFX（PNG strip + `placement` / `enabled`）。未指定 = skill `vfx`、それも未設定なら VFX なし |
| `hitVfx`                                                     | 任意。命中時 VFX（`_vfx_hit` PNG）。main `vfx` とは独立 |

**パッシブ `debuff`:** 上記 `target` / `targetShape` / `range` / 形状別フィールドと同型の項目を **`debuff` 接頭辞**で保持（例: `target` → `debuffTargetRule`、`targetShape` → `debuffTargetShape`、`range` → `debuffRange`、`aoeRadiusPx` → `debuffAoeRadiusPx`）。変換は `passiveDebuffBridge.ts`。発動タイミングは **常時**（未指定）または **`periodicTrigger: stageStart` / `waveStart`**。Stage/Wave 開始時は `chance`（0〜1、未指定=1）で発動確率を判定。アクティブの `trigger`（`basicAttackCount` 等）や `fireConditions` は使わない。

**パッシブ `buff`:** 同様に **`buff` 接頭辞**（`buffTargetRule` / `buffTargetShape` / `buffRange` 等）。変換は `passiveBuffBridge.ts`。barrier サブ種は常時 ではなく **Stage/Wave 開始時**（未指定 = `stageStart`）。それ以外のサブ種は debuff と同様に未指定 = 常時。`block` / `evasion` の `chance` はブロック/回避率（発動確率ではない）。

**パッシブ `heal`（HoT）:** **`hot` 接頭辞**（`hotTargetRule` / `hotTargetShape` / `hotRange` 等）。変換は `passiveHotBridge.ts`。発動タイミングは debuff / buff と同様（未指定 = 常時、`periodicTrigger` = Stage/Wave 開始時、`chance` = 発動確率）。

**時間間隔（`intervalSec` / `periodicTrigger: interval`）:** 廃止。読み込み時に除去される。

**パッシブ `damageReduction`:** **`damageReduction` 接頭辞**（`damageReductionTargetRule` / `damageReductionTargetShape` / `damageReductionRange` 等）。変換は `passiveDamageReductionBridge.ts`。常時 のみ（時間周期なし）。

**パッシブ `periodicDispel`:** **`dispel` 接頭辞**（`dispelTargetRule` / `dispelTargetShape` / `dispelRange` 等）。変換は `passiveDispelBridge.ts`。発動タイミングは **`stageStart` / `waveStart` / `onDebuffReceived`**（未指定 = `waveStart`）。`chance` で発動確率を指定可。`dispelTriggerLimit` で Wave 内の発動回数を制限。

**move を含むスキル:** 各 step 発火時にスキル strip（64×48、`sheets/skills/{skillId}_{index}.png`）→ VFX。entity `move` / `attack` シートは使わない（[§スプライト・演出アセット](#スプライト演出アセット)）。

### ResourceAmountSpec（`damage` / `heal` / `hot` / `barrier`）

| フィールド                      | 説明                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `amount.kind`                   | `atkBased`（既定）／`defBased`／`flat`／`percentMaxHp`                                           |
| `amount.atkOffset` / `atkScale` | `atkBased` 用（加減 net / 倍率 net。未指定: offset=0, scale=1）                                  |
| `amount.defOffset` / `defScale` | `defBased` 用（加減 net / 倍率 net。未指定: offset=0, scale=1）。参照は **使用者 effective DEF** |
| `amount.flatAmount`             | `flat` 必須                                                                                      |
| `amount.percentOfMaxHp`         | `percentMaxHp` 必須（0〜1）                                                                      |
| `amount.maxHpRef`               | `percentMaxHp` 任意 — `self`（自身 maxHp）／未指定・`target`（対象 maxHp。既定）                 |
| `powerMultiplier`               | **旧 JSON 互換** — `amount` 未指定時は `atkBased` + `atkScale` として読む                        |

### barrier 専用

| フィールド     | 説明                                                           |
| -------------- | -------------------------------------------------------------- |
| `barrierStack` | 未指定 = 既存 `barrierHp` に加算（既定）。`false` = 新量で置換 |

### move 専用

| フィールド        | 説明                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `type: move`      | 使用者（actor）の `battleX` を anchor 基準位置へ移動             |
| `moveDurationSec` | 補間秒（必須・正数）                                             |
| `moveMode`        | `engage`（接敵・射程内）／`toAnchor`（anchor 座標 + オフセット） |
| `anchorOffsetPx`  | `toAnchor` 時、anchor からの px（−=味方側、+=敵背後）。未指定=0  |
| `range`           | `toAnchor` で敵対 anchor へ向かう移動の 1 回上限 px（未指定=`traits.rangePx`）。味方 anchor への帰還等は上限なし |

- `targetShape` は **single のみ**（Phase 1）
- `toAnchor` は任意 side の `target` + `anchorOffsetPx` で位置決定（offset 0 = anchor 座標そのもの）
- `engage` は敵向け `target` が一般的（射程内へ自動計算）
- move の `target` で `order: nearest` / `farthest` を指定した場合、anchor は **使用者との battleX 距離**で選ぶ（自動接近 chase の「編成奥 = max battleX」とは別）
- move を含むスキルは effect 列を **順序実行**（移動完了後に次 effect）。CD はシーケンス全 step 完了後にリセット
- シーケンス `move` step 適用時、build 時の `targetId` が死亡済みなら **effect の `target` spec を再解決**して anchor を取り直す（影の刃の帰還 `engage` 等）

### targetShape の JSON 例（スキーマ参考・具体 ID は未固定）

**範囲（aoe）** — `frontEnemy` anchor + 半径:

```json
{
  "target": { "kind": "distance", "side": "enemy", "order": "nearest" },
  "targetShape": "aoe",
  "aoeRadiusPx": 70,
  "type": "damage",
  "damageType": "magic",
  "amount": { "kind": "atkBased", "atkScale": 1.2 },
  "range": 120
}
```

**連鎖（chain）** — anchor から近傍の同陣営へ。次 hop は **直前 hop と別ユニット** のみ。範囲内に **未命中** がいれば最も近い未命中を優先（A→B→C→A は可、A→A→… は不可。一直線 3 体なら A→B→C になりやすい）:

```json
{
  "target": {
    "kind": "stat",
    "side": "enemy",
    "stat": "hp",
    "order": "lowest"
  },
  "targetShape": "chain",
  "chainCount": 3,
  "chainMaxDistancePx": 80,
  "type": "damage",
  "damageType": "magic",
  "amount": { "kind": "atkBased", "atkScale": 0.9 },
  "range": 120
}
```

## コンテンツ追加手順

1. `classes.json` にクラスを追加
2. 必要なら `skills.json` にスキルを追加
3. `parties.json` または将来のセーブ形式で ID を参照
4. 起動時 `validateGameData` が ID 参照の整合性をチェック
