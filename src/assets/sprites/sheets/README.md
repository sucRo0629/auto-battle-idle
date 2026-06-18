# スプライト・アニメーションアセット

**レイアウト正本:** `data/entityAnimLayout.json`（全 entity 共通の格子定義）。  
**ルール・JSON フィールド:** [docs/spec/classes-and-skills.md](../../../../docs/spec/classes-and-skills.md#スプライト演出アセット)  
**フェーズ計画:** [docs/plans/phase-roadmap.md](../../../../docs/plans/phase-roadmap.md) Phase 5 / 6

**実装状況（PR1）:** `entityAnimLayout.json` + `src/render/entityAtlas.ts` で body atlas 描画済み。未配置時は旧 `sheets/{entityId}/` または静止画フォールバック。

**実装状況（PR2）:** スキル strip **64×48**（`SKILL_ANIM_CELL_WIDTH`）、`animStartFrame` 再生スキップ + **3 段再生**（`animLoopFrame` / `animLoopEndFrame` / `animIntroEndFrame` / `animOutroStartFrame` — `skillAnimPlayback.ts` + `SpriteAnimator`）。

**実装状況（VFX 型・レジストリ）:** VFX strip **64×64**（`VFX_ANIM_CELL_WIDTH` / `VFX_ANIM_CELL_HEIGHT`）、`vfxAnimRegistry.ts`（`sheets/vfx/*.png` 登録・キー解決・コマ数）。描画は Phase 6 で Canvas から PNG へ切替。

**実装状況（PR3）:** 演出ラボ MVP — `presentation-lab.html` + `PresentationPreviewRunner`（`resolveEffectPresentation` → `BattleCanvas`）。JSON 保存は `PUT /__editor/presentation-skill`。

---

## 配置概要

```
data/
  entityAnimLayout.json          # idle / move / death の行・コマ数（全員共通）

src/assets/sprites/
  sheets/
    bodies/
      df_guardian.png            # 味方 classId
      stage1_1.png               # 敵 enemyId（同形式）
    skills/
      df_guardian_basic_attack.png
      at_ranger_basic_attack.png
      at_assassin_active_1_0.png
      at_assassin_active_1_1.png
    vfx/
      df_guardian_basic_attack_vfx.png
      at_assassin_active_1_0_vfx.png
      at_assassin_active_1_0_vfx_hit.png
  sprites/
    {entityId}.png               # 静止画フォールバック（32×32、任意）
```

| 種別 | パス | 内容 |
|------|------|------|
| **entity 本体** | `sheets/bodies/{classId\|enemyId}.png` | **1 枚**。idle / move / death のみ（attack は含めない） |
| **スキル body** | `sheets/skills/{skillId}.png` または `{skillId}_{effectIndex}.png` | 通常攻撃・全 active 共通。**64×48** 横 strip |
| **スキル VFX** | `sheets/vfx/{skillId}_vfx.png` 等 | main / hit 用 PNG。**64×64** 横 strip。JSON `vfx` / `hitVfx` |

味方・敵とも **同じ `entityAnimLayout.json`**。`spriteKey` 未指定時は entity の `id` をキーとする。

---

## entity 本体（`sheets/bodies/{id}.png`）

### 共通レイアウト（`entityAnimLayout.json`）

| 行 | anim | コマ数 | 1 コマ | ループ |
|----|------|--------|--------|--------|
| 0 | idle | 4 | 48×48 | ○ |
| 1 | move | 4 | 48×48 | ○ |
| 2 | death | 3 | 48×48 | × |

- **fps:** 8（全 anim 共通）
- **足元アンコ:** 各コマの **下辺中央** = 地面（layout 32px 箱の中央下）
- **attack は entity に含めない** — 振り・弓引き等はすべて **スキル PNG**（`{id}_basic_attack` 含む）

PNG サイズ例: 幅 `max(4×48, 3×48) = 192px`、高さ `3×48 = 144px`（3 行）。

---

## スキル body（`sheets/skills/*.png`）

### 共通仕様（通常攻撃 + 全 active）

| 項目 | 値 |
|------|-----|
| 1 コマ | **64 × 48 px**（幅 64・高さ 48） |
| 並べ方 | 左から右へ横一列 |
| コマ数 | 幅 ÷ 64（JSON の `animStartFrame` を除いた再生分） |
| fps | 8 |

### ファイル名

| パターン | 用途 |
|----------|------|
| `{skillId}.png` | 単 effect / フォールバック |
| `{skillId}_{effectIndex}.png` | 多 effect（0 始まり）。解決順: index 付き → 無 index |
| `{classId\|enemyId}_basic_attack.png` | 通常攻撃 body（近接の振り・**遠隔の弓引き** 等） |

### 先頭 idle 参照コマ（任意）

制作時、strip の **0 コマ目** に entity idle 0 と同じ絵を入れて位置合わせしてよい。  
再生時は effect の **`animStartFrame`**（default `0`、idle 入りなら `1`）でスキップする。  
**3 段再生:** `animLoopFrame` 指定時 — intro（`animStartFrame`〜`animIntroEndFrame`）→ hold（`animLoopFrame`〜`animLoopEndFrame` を `useDurationSec` / presentationLock までループ）→ outro（`animOutroStartFrame`〜終端）。  
演出ラボのプレビューでも 0 コマは「参照」、再生は `animStartFrame` から。

### 通常攻撃（basic）

- 戦闘上は `{entityId}_basic_attack` スキル（`data/skills/actives/`）
- **PNG あり** → skill anim 再生 + VFX（`basicAttackVfx` / effect `vfx`）
- **PNG なし** → body なし・**VFX のみ**（明示 preset のみ）
- **遠隔**も近接と同様。弓引き PNG を置けば body 再生する（「遠隔だから body 無し」は廃止）

### 例（背刺）

```
sheets/skills/at_assassin_active_1_0.png   # move ステップ
sheets/skills/at_assassin_active_1_1.png   # damage ステップ
```

---

## スキル VFX（`sheets/vfx/*.png`）

### 共通仕様

| 項目 | 値 |
|------|-----|
| 1 コマ | **64 × 64 px**（`VFX_ANIM_CELL_WIDTH` / `VFX_ANIM_CELL_HEIGHT`） |
| 並べ方 | 左から右へ横一列 |
| コマ数 | 幅 ÷ 64 |
| fps | 8（body と同じ） |

### ファイル名

| パターン | 用途 |
|----------|------|
| `{skillId}_vfx.png` | 単 effect / フォールバック（main） |
| `{skillId}_{effectIndex}_vfx.png` | 多 effect（0 始まり）。解決順: index 付き → 無 index |
| `{skillId}_vfx_hit.png` / `{skillId}_{effectIndex}_vfx_hit.png` | 命中 VFX（`hitVfx`） |
| `{classId\|enemyId}_basic_attack_vfx.png` | 通常攻撃 main VFX |

実装: `resolveVfxAnimKey(skillId, effectIndex, 'main' | 'hit')`（`vfxAnimRegistry.ts`）。

### JSON（`SkillVfxDef`）

| フィールド | 説明 |
|-----------|------|
| `enabled` | 省略 = 有効。`false` で抑制 |
| `placement.anchor` | `actor` / `target` / `between` / `footActor` / `footTarget` |
| `placement.offsetX` / `offsetY` | アンカーからの px ずれ |
| `placement.layer` | `behind` / `front` |
| `animStartFrame` 〜 | body と同型（VFX strip 内の絶対コマ） |

effect **`hitVfx`** は main `vfx` とは別オブジェクト（別 PNG・別 placement 可）。

**演出調整ツール（Phase 5）** で body PNG・VFX・タイミングを **同一 Canvas プレビュー** で調整する。

---

## スキル VFX（PNG strip）

| 設定場所 | フィールド |
|----------|-----------|
| effect | `vfx` / `hitVfx` |
| skill | `vfx` |
| traits | `basicAttackVfx` |

解決: `basicAttackVfx` → `effect.vfx` → `skill.vfx` → なし（`effectVfxOnly` 既定時は effect のみ）。`enabled: false` で抑制。

---

## 静止画フォールバック

`sprites/{entityId}.png` — **32×32 px**。body atlas 未配置時の静止表示。

---

## 確定クラス / 敵から順次

4a マスタ全件の一括投入ではなく、**確定した classId / enemyId から**:

1. `bodies/{id}.png`
2. `skills/{id}_basic_attack.png`
3. 各 active の `skills/{skillId}_*.png`
4. `sheets/vfx/{skillId}_vfx*.png`（任意）
5. JSON の `animStartFrame` / `animLoopFrame` / `vfx` / `hitVfx` / タイミング（演出ラボ）

4b 説明文はスキル JSON 変更 PR と同梱（Phase 7 前の一括仕上げは不要）。

---

## 旧配置（移行予定・非推奨）

```
sheets/{entityId}/idle.png | move.png | attack.png | death.png
```

attack 64px を entity フォルダに置く方式は **廃止方向**。スキル strip に統一する。
