import { normalizeEntityTraits } from '../battle/data/entityTraits.ts';
import type {
  ActiveSkillDef,
  AnimPhaseFields,
  EnemyTemplate,
  SkillEffectDef,
  SkillVfxDef,
  VfxAnchor,
  VfxLayer,
  VfxParticleDef,
  VfxPlacement,
} from '../battle/types.ts';
import { PARTICLE_PRESET_IDS } from '../battle/data/gameDataSchema.ts';
import {
  fetchClasses,
  fetchEnemies,
  fetchSkills,
  isBasicAttackSkillId,
  savePresentationSkill,
  type SkillsJson,
} from '../editor/editorApi.ts';
import {
  createActionButton,
  createButton,
  createEl,
  createFieldRow,
  createNumberInput,
  createSelect,
} from '../editor/formUtils.ts';
import type { ClassPresetBeforeEnrich } from '../progression/skillUnlocks.ts';
import { resolveSkillAnimKey, hasSkillAnimKey } from '../render/skillAnimRegistry.ts';
import { supportsSkillEffectVfx } from '../render/skillVfx/resolveEffectPresentation.ts';
import { resolveVfxAnimKey, hasVfxAnimKey } from '../render/vfxAnimRegistry.ts';
import {
  PresentationPreviewRunner,
  type PreviewPlayMode,
} from './PresentationPreviewRunner.ts';
import {
  resolvePreviewBattleLayout,
  resolvePreviewBattleLayoutFallback,
} from './previewLayout.ts';
import type { PreviewEntity } from './presentationTimeline.ts';
import type { PresentationTimeline } from './presentationTimeline.ts';
import {
  validateBasicAttackVfxSave,
  validatePresentationSkillSave,
} from './presentationSaveValidation.ts';

type EntityKind = 'class' | 'enemy';

interface LabSelection {
  entityKind: EntityKind;
  entityId: string;
  skillId: string;
  effectIndex: number;
}

interface LabQuery {
  entityKind?: EntityKind;
  entityId?: string;
  skillId?: string;
  effectIndex?: number;
}

function readLabQuery(): LabQuery {
  const params = new URLSearchParams(window.location.search);
  const entityKind = params.get('entityKind');
  const effectIndexRaw = params.get('effectIndex');
  return {
    entityKind:
      entityKind === 'class' || entityKind === 'enemy' ? entityKind : undefined,
    entityId: params.get('entityId') ?? undefined,
    skillId: params.get('skillId') ?? undefined,
    effectIndex:
      effectIndexRaw !== null && effectIndexRaw.length > 0
        ? Number.parseInt(effectIndexRaw, 10)
        : undefined,
  };
}

function skillsForEntity(
  entityId: string,
  actives: ActiveSkillDef[],
): ActiveSkillDef[] {
  const prefix = `${entityId}_`;
  return actives
    .filter((skill) => skill.id.startsWith(prefix))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function cloneSkill(skill: ActiveSkillDef): ActiveSkillDef {
  return structuredClone(skill);
}

function formatSec(sec: number | null): string {
  if (sec === null) return '—';
  return `${sec.toFixed(2)}s`;
}

function appendHintLines(
  parent: HTMLElement,
  lines: Array<[string, string]>,
): void {
  for (const [label, text] of lines) {
    const hint = createEl('p', 'presentation-lab-hint');
    hint.textContent = `${label}: ${text}`;
    parent.appendChild(hint);
  }
}

export class PresentationLabApp {
  private classes: ClassPresetBeforeEnrich[] = [];
  private enemies: EnemyTemplate[] = [];
  private skills: SkillsJson = { passives: [], actives: [] };

  private entityKind: EntityKind = 'class';
  private entityId = '';
  private skillId = '';
  private effectIndex = 0;
  private skillDraft: ActiveSkillDef | null = null;
  private basicAttackVfxDraft: SkillVfxDef | undefined = undefined;
  private skillDirty = false;
  private entityTraitsDirty = false;
  private previewTarget: PreviewEntity | null = null;

  private readonly runner: PresentationPreviewRunner;
  private readonly canvasHost: HTMLElement;
  private readonly timelineHost: HTMLElement;
  private readonly formHost: HTMLElement;
  private readonly statusEl: HTMLElement;

  constructor(private readonly root: HTMLElement) {
    this.root.className = 'presentation-lab';

    const header = createEl('header', 'presentation-lab-header');
    const title = createEl('h1', 'presentation-lab-title');
    title.textContent = '演出ラボ';
    const subtitle = createEl('p', 'presentation-lab-subtitle');
    subtitle.textContent =
      'BattleEngine を回さず 1 effect の Canvas プレビューと VFX / タイミング JSON 編集';
    header.append(title, subtitle);

    const toolbar = createEl('div', 'presentation-lab-toolbar');
    this.canvasHost = createEl('div', 'presentation-lab-canvas-host');
    this.timelineHost = createEl('div', 'presentation-lab-timeline');
    this.formHost = createEl('div', 'presentation-lab-form');
    this.statusEl = createEl('p', 'presentation-lab-status');

    this.runner = new PresentationPreviewRunner(this.canvasHost);
    this.runner.start();

    this.root.append(header, toolbar, this.canvasHost, this.timelineHost, this.formHost, this.statusEl);
    void this.bootstrap(toolbar);
  }

  private async bootstrap(toolbar: HTMLElement): Promise<void> {
    try {
      const [classes, enemies, skills] = await Promise.all([
        fetchClasses(),
        fetchEnemies(),
        fetchSkills(),
      ]);
      this.classes = classes;
      this.enemies = enemies;
      this.skills = skills;
      this.applyInitialSelection(readLabQuery());
      this.renderToolbar(toolbar);
      this.renderForm();
      this.syncPreviewEntities();
      this.refreshTimeline();
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  private captureSelection(): LabSelection {
    return {
      entityKind: this.entityKind,
      entityId: this.entityId,
      skillId: this.skillId,
      effectIndex: this.effectIndex,
    };
  }

  private restoreSelection(selection: LabSelection): void {
    this.entityKind = selection.entityKind;
    this.entityId = selection.entityId;
    this.skillId = selection.skillId;
    this.effectIndex = selection.effectIndex;
    this.reconcileSelection();
  }

  /** 再取得後も entity / skill / effect の選択を維持（無効な値だけ補正） */
  private reconcileSelection(): void {
    const entities = this.entityKind === 'class' ? this.classes : this.enemies;
    if (!this.entityId || !entities.some((entry) => entry.id === this.entityId)) {
      this.entityId = entities[0]?.id ?? '';
    }

    const skillOptions = this.currentSkillOptions();
    if (!this.skillId || !skillOptions.some((skill) => skill.id === this.skillId)) {
      this.skillId = skillOptions[0]?.id ?? '';
    }

    const skill = this.skills.actives.find((entry) => entry.id === this.skillId);
    const effectCount = skill?.effect.length ?? 0;
    if (effectCount <= 0) {
      this.effectIndex = 0;
      return;
    }
    if (this.effectIndex < 0 || this.effectIndex >= effectCount) {
      this.effectIndex = Math.min(Math.max(this.effectIndex, 0), effectCount - 1);
    }
  }

  private syncLabQueryToUrl(): void {
    if (!this.entityId) return;
    const params = new URLSearchParams({
      entityKind: this.entityKind,
      entityId: this.entityId,
      skillId: this.skillId,
      effectIndex: String(this.effectIndex),
    });
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', next);
  }

  private getToolbar(): HTMLElement {
    const toolbar = this.root.querySelector('.presentation-lab-toolbar');
    if (!toolbar) {
      throw new Error('.presentation-lab-toolbar not found');
    }
    return toolbar as HTMLElement;
  }

  private refreshAfterDataReload(): void {
    this.reconcileSelection();
    this.loadSkillDraft();
    this.loadEntityTraitsDraft();
    this.renderToolbar(this.getToolbar());
    this.renderForm();
    this.syncPreviewEntities();
    this.refreshTimeline();
    this.syncLabQueryToUrl();
  }

  private onSelectionChanged(): void {
    this.syncLabQueryToUrl();
  }

  private applyInitialSelection(query: LabQuery): void {
    if (query.entityKind && query.entityId) {
      this.entityKind = query.entityKind;
      this.entityId = query.entityId;
    } else if (this.classes[0]) {
      this.entityKind = 'class';
      this.entityId = this.classes[0].id;
    } else if (this.enemies[0]) {
      this.entityKind = 'enemy';
      this.entityId = this.enemies[0].id;
    }

    const skillOptions = this.currentSkillOptions();
    if (query.skillId && skillOptions.some((s) => s.id === query.skillId)) {
      this.skillId = query.skillId;
    } else {
      this.skillId = skillOptions[0]?.id ?? '';
    }

    this.loadSkillDraft();
    this.loadEntityTraitsDraft();
    if (
      query.effectIndex !== undefined &&
      Number.isFinite(query.effectIndex) &&
      this.skillDraft &&
      query.effectIndex >= 0 &&
      query.effectIndex < this.skillDraft.effect.length
    ) {
      this.effectIndex = query.effectIndex;
    } else {
      this.effectIndex = 0;
    }
    this.reconcileSelection();
    this.syncLabQueryToUrl();
  }

  private currentSkillOptions(): ActiveSkillDef[] {
    if (!this.entityId) return [];
    return skillsForEntity(this.entityId, this.skills.actives);
  }

  private loadSkillDraft(): void {
    const skill = this.skills.actives.find((entry) => entry.id === this.skillId);
    this.skillDraft = skill ? cloneSkill(skill) : null;
    this.skillDirty = false;
  }

  private loadEntityTraitsDraft(): void {
    if (this.entityKind === 'class') {
      const cls = this.classes.find((entry) => entry.id === this.entityId);
      const traits = normalizeEntityTraits(cls?.traits);
      this.basicAttackVfxDraft = traits.basicAttackVfx
        ? structuredClone(traits.basicAttackVfx)
        : undefined;
    } else {
      const enemy = this.enemies.find((entry) => entry.id === this.entityId);
      const traits = normalizeEntityTraits(enemy?.traits);
      this.basicAttackVfxDraft = traits.basicAttackVfx
        ? structuredClone(traits.basicAttackVfx)
        : undefined;
    }
    this.entityTraitsDirty = false;
  }

  private currentEntityTraits(): PreviewEntity {
    if (this.entityKind === 'class') {
      const cls = this.classes.find((entry) => entry.id === this.entityId);
      const traits = normalizeEntityTraits(cls?.traits);
      return {
        entityId: this.entityId,
        role: cls?.role,
        rangePx: traits.rangePx,
        damageType: traits.damageType,
        basicAttackVfx: this.basicAttackVfxDraft ?? traits.basicAttackVfx,
        isEnemy: false,
      };
    }
    const enemy = this.enemies.find((entry) => entry.id === this.entityId);
    const traits = normalizeEntityTraits(enemy?.traits);
    return {
      entityId: this.entityId,
      rangePx: traits.rangePx,
      damageType: traits.damageType,
      basicAttackVfx: this.basicAttackVfxDraft ?? traits.basicAttackVfx,
      isEnemy: true,
    };
  }

  private syncPreviewEntities(): void {
    const actor = this.currentEntityTraits();
    const target = this.buildPreviewTarget(actor);
    const effect = this.currentEffect();
    const layout =
      effect !== null
        ? resolvePreviewBattleLayout(actor, effect)
        : resolvePreviewBattleLayoutFallback(actor);
    this.previewTarget = target;
    this.runner.setEntities(actor, target, layout);
  }

  private buildPreviewTarget(actor: PreviewEntity): PreviewEntity {
    if (actor.isEnemy) {
      const cls = this.classes[0];
      if (cls) {
        const traits = normalizeEntityTraits(cls.traits);
        return {
          entityId: cls.id,
          role: cls.role,
          rangePx: traits.rangePx,
          damageType: traits.damageType,
          basicAttackVfx: traits.basicAttackVfx,
          isEnemy: false,
        };
      }
      return {
        entityId: 'df_guardian',
        role: 'defender',
        rangePx: 0,
        damageType: 'physical',
        isEnemy: false,
      };
    }

    const target: PreviewEntity = {
      entityId: 'stage1_1',
      rangePx: 0,
      damageType: 'physical',
      isEnemy: true,
    };
    const fallbackEnemy = this.enemies[0];
    if (fallbackEnemy) {
      const traits = normalizeEntityTraits(fallbackEnemy.traits);
      target.entityId = fallbackEnemy.id;
      target.rangePx = traits.rangePx;
      target.damageType = traits.damageType;
      target.basicAttackVfx = traits.basicAttackVfx;
    }
    return target;
  }

  private currentSlotKind(): 'basic' | 'active' {
    return isBasicAttackSkillId(this.skillId, this.entityId) ? 'basic' : 'active';
  }

  private currentEffect(): SkillEffectDef | null {
    return this.skillDraft?.effect[this.effectIndex] ?? null;
  }

  private hasUnsavedChanges(): boolean {
    return this.skillDirty || this.entityTraitsDirty;
  }

  private markDirty(): void {
    this.skillDirty = true;
    this.refreshTimeline();
    this.setStatus('未保存の変更があります');
  }

  private markEntityTraitsDirty(): void {
    this.entityTraitsDirty = true;
    this.syncPreviewEntities();
    this.refreshTimeline();
    this.setStatus('未保存の変更があります');
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('presentation-lab-status-error', isError);
  }

  private renderToolbar(toolbar: HTMLElement): void {
    toolbar.replaceChildren();

    const selectsRow = createEl('div', 'presentation-lab-toolbar-selects');
    const actionsRow = createEl('div', 'presentation-lab-toolbar-actions');

    const entityKindSelect = createSelect(
      this.entityKind,
      [
        { value: 'class', label: 'クラス' },
        { value: 'enemy', label: '敵' },
      ],
      (value) => {
        this.entityKind = value as EntityKind;
        const options =
          this.entityKind === 'class' ? this.classes : this.enemies;
        this.entityId = options[0]?.id ?? '';
        const skills = this.currentSkillOptions();
        this.skillId = skills[0]?.id ?? '';
        this.effectIndex = 0;
        this.loadSkillDraft();
        this.loadEntityTraitsDraft();
        this.onSelectionChanged();
        this.renderToolbar(toolbar);
        this.renderForm();
        this.syncPreviewEntities();
        this.refreshTimeline();
      },
    );

    const entityOptions =
      this.entityKind === 'class'
        ? this.classes.map((cls) => ({
            value: cls.id,
            label: `${cls.displayName} (${cls.id})`,
          }))
        : this.enemies.map((enemy) => ({
            value: enemy.id,
            label: `${enemy.displayName} (${enemy.id})`,
          }));

    const entitySelect = createSelect(this.entityId, entityOptions, (value) => {
      this.entityId = value;
      const skills = this.currentSkillOptions();
      this.skillId = skills[0]?.id ?? '';
      this.effectIndex = 0;
      this.loadSkillDraft();
      this.loadEntityTraitsDraft();
      this.onSelectionChanged();
      this.renderToolbar(toolbar);
      this.renderForm();
      this.syncPreviewEntities();
      this.refreshTimeline();
    });

    const skillOptions = this.currentSkillOptions().map((skill) => ({
      value: skill.id,
      label: skill.name ? `${skill.name} (${skill.id})` : skill.id,
    }));
    const skillSelect = createSelect(this.skillId, skillOptions, (value) => {
      this.skillId = value;
      this.effectIndex = 0;
      this.loadSkillDraft();
      this.onSelectionChanged();
      this.renderToolbar(toolbar);
      this.renderForm();
      this.syncPreviewEntities();
      this.refreshTimeline();
    });

    const effectOptions = (this.skillDraft?.effect ?? []).map((effect, index) => ({
      value: String(index),
      label: `${index}: ${effect.type}`,
    }));
    const effectSelect = createSelect(String(this.effectIndex), effectOptions, (value) => {
      this.effectIndex = Number.parseInt(value, 10);
      this.onSelectionChanged();
      this.renderForm();
      this.syncPreviewEntities();
      this.refreshTimeline();
    });

    selectsRow.append(
      createFieldRow('種別', entityKindSelect),
      createFieldRow('entity', entitySelect),
      createFieldRow('skill', skillSelect),
      createFieldRow('effect', effectSelect),
    );

    const play = (mode: PreviewPlayMode): void => {
      if (!this.skillDraft || !this.previewTarget) return;
      this.runner.play({
        skill: this.skillDraft,
        effectIndex: this.effectIndex,
        actor: this.currentEntityTraits(),
        target: this.previewTarget,
        slotKind: this.currentSlotKind(),
        mode,
      });
    };

    const playAllBtn = createActionButton('▶ 全体', 'editor-btn', () => play('full'));
    playAllBtn.classList.add('presentation-lab-play-btn');
    const playBodyBtn = createActionButton('▶ bodyのみ', 'editor-btn', () => play('body'));
    playBodyBtn.classList.add('presentation-lab-play-btn');
    const playVfxBtn = createActionButton('▶ VFXのみ', 'editor-btn', () => play('vfx'));
    playVfxBtn.classList.add('presentation-lab-play-btn');

    const resetBtn = createButton('↺ リセット', 'editor-btn', () => {
      this.runner.reset();
    });

    const reloadBtn = createButton('再読込', 'editor-btn', () => {
      void this.reloadFromServer();
    });

    const saveBtn = createActionButton('JSON 保存', 'editor-btn', () => {
      void this.saveDraft();
    });
    saveBtn.disabled = !this.hasUnsavedChanges();

    actionsRow.append(playAllBtn, playBodyBtn, playVfxBtn, resetBtn, reloadBtn, saveBtn);
    toolbar.append(selectsRow, actionsRow);
  }

  private renderForm(): void {
    this.formHost.replaceChildren();
    const skill = this.skillDraft;
    const effect = this.currentEffect();
    if (!skill || !effect) {
      const empty = createEl('p', 'presentation-lab-empty');
      empty.textContent = 'スキルまたは effect が選択されていません';
      this.formHost.appendChild(empty);
      return;
    }

    const columns = createEl('div', 'presentation-lab-form-columns');
    const isBasic = this.currentSlotKind() === 'basic';
    const bodyAnimKey = resolveSkillAnimKey(skill.id, this.effectIndex);

    columns.append(
      this.buildBodySection(effect, bodyAnimKey),
      this.buildVfxSection(skill, effect, isBasic),
      this.buildCommonSection(skill, effect),
    );

    const labLink = createEl('p', 'presentation-lab-hint');
    labLink.textContent =
      '保存先: data/skills/actives/（該当 stem ファイルへ upsert）。通常攻撃 VFX は classes.json / enemies.json の traits.basicAttackVfx';

    this.formHost.append(columns, labLink);
  }

  private buildBodySection(
    effect: SkillEffectDef,
    bodyAnimKey: string | null,
  ): HTMLElement {
    const section = createEl('section', 'presentation-lab-section');
    const heading = createEl('h2', 'presentation-lab-section-title');
    heading.textContent = 'Body アニメ';
    section.appendChild(heading);

    appendAssetState(
      section,
      'body animKey',
      bodyAnimKey,
      bodyAnimKey !== null && hasSkillAnimKey(bodyAnimKey),
    );

    const grid = createEl('div', 'editor-grid');
    section.appendChild(grid);
    appendAnimPhaseFields(grid, effect, (mutator) => {
      this.patchEffect((draft) => mutator(draft));
    });

    const phaseHint = createEl('p', 'presentation-lab-hint');
    phaseHint.textContent =
      'animLoopFrame を指定すると intro → hold → outro の 3 段再生。hold 時間は resolveSkillBodyPlaybackSec が決める。';
    grid.appendChild(phaseHint);

    return section;
  }

  private buildVfxSection(
    skill: ActiveSkillDef,
    effect: SkillEffectDef,
    isBasic: boolean,
  ): HTMLElement {
    const section = createEl('section', 'presentation-lab-section');
    const heading = createEl('h2', 'presentation-lab-section-title');
    heading.textContent = isBasic ? 'VFX（traits.basicAttackVfx）' : 'VFX';
    section.appendChild(heading);

    const mainVfxKey = resolveVfxAnimKey(skill.id, this.effectIndex, 'main');
    appendAssetState(
      section,
      'main vfxKey',
      mainVfxKey,
      mainVfxKey !== null && hasVfxAnimKey(mainVfxKey),
    );

    const mainGrid = createEl('div', 'editor-grid');
    section.appendChild(mainGrid);

    if (isBasic) {
      const vfx = this.basicAttackVfxDraft ?? {};
      appendVfxEnabledRow(mainGrid, 'PNG VFX 有効', vfx.enabled !== false, (enabled) => {
        this.patchBasicAttackVfx((draft) => {
          draft.enabled = enabled;
        });
      });
      if (vfx.enabled !== false) {
        appendAnimPhaseFields(mainGrid, vfx, (mutator) => {
          this.patchBasicAttackVfx(mutator);
        });
        appendVfxPlacementFields(
          mainGrid,
          vfx.placement,
          (mutator) => {
            this.patchBasicAttackVfx((draft) => {
              const placement = { anchor: 'target' as VfxAnchor, ...draft.placement };
              mutator(placement);
              draft.placement = placement;
            });
          },
          () => {
            this.patchBasicAttackVfx((draft) => {
              delete draft.placement;
            });
          },
        );
        appendParticleFields(mainGrid, vfx.particles, (mutator) => {
          this.patchBasicAttackVfx((draft) => {
            const current = { preset: PARTICLE_PRESET_IDS[0], ...draft.particles };
            mutator(current);
            draft.particles = current;
          });
        }, () => {
          this.patchBasicAttackVfx((draft) => {
            delete draft.particles;
          });
        });
      }
    } else {
      const vfx = effect.vfx ?? {};
      appendVfxEnabledRow(mainGrid, 'vfx.enabled', vfx.enabled !== false, (enabled) => {
        this.patchEffectVfx('vfx', (draft) => {
          draft.enabled = enabled;
        });
      });
      if (vfx.enabled !== false) {
        appendAnimPhaseFields(mainGrid, vfx, (mutator) => {
          this.patchEffectVfx('vfx', mutator);
        });
        appendVfxPlacementFields(
          mainGrid,
          vfx.placement,
          (mutator) => {
            this.patchEffectVfx('vfx', (draft) => {
              const placement = { anchor: 'target' as VfxAnchor, ...draft.placement };
              mutator(placement);
              draft.placement = placement;
            });
          },
          () => {
            this.patchEffectVfx('vfx', (draft) => {
              delete draft.placement;
            });
          },
        );
        appendParticleFields(mainGrid, vfx.particles, (mutator) => {
          this.patchEffectVfx('vfx', (draft) => {
            const current = { preset: PARTICLE_PRESET_IDS[0], ...draft.particles };
            mutator(current);
            draft.particles = current;
          });
        }, () => {
          this.patchEffectVfx('vfx', (draft) => {
            delete draft.particles;
          });
        });
      }
    }

    if (supportsSkillEffectVfx(effect)) {
      const hitHeading = createEl('h3', 'presentation-lab-section-title');
      hitHeading.textContent = 'hitVfx';
      section.appendChild(hitHeading);

      const hitVfxKey = resolveVfxAnimKey(skill.id, this.effectIndex, 'hit');
      appendAssetState(
        section,
        'hit vfxKey',
        hitVfxKey,
        hitVfxKey !== null && hasVfxAnimKey(hitVfxKey),
      );

      const hitGrid = createEl('div', 'editor-grid');
      section.appendChild(hitGrid);
      const hitVfx = effect.hitVfx ?? {};
      appendVfxEnabledRow(hitGrid, 'hitVfx.enabled', hitVfx.enabled !== false, (enabled) => {
        this.patchEffectVfx('hitVfx', (draft) => {
          draft.enabled = enabled;
        });
      });
      if (hitVfx.enabled !== false) {
        appendAnimPhaseFields(hitGrid, hitVfx, (mutator) => {
          this.patchEffectVfx('hitVfx', mutator);
        });
        appendVfxPlacementFields(
          hitGrid,
          hitVfx.placement,
          (mutator) => {
            this.patchEffectVfx('hitVfx', (draft) => {
              const placement = { anchor: 'footTarget' as VfxAnchor, ...draft.placement };
              mutator(placement);
              draft.placement = placement;
            });
          },
          () => {
            this.patchEffectVfx('hitVfx', (draft) => {
              delete draft.placement;
            });
          },
        );
        appendParticleFields(hitGrid, hitVfx.particles, (mutator) => {
          this.patchEffectVfx('hitVfx', (draft) => {
            const current = { preset: PARTICLE_PRESET_IDS[0], ...draft.particles };
            mutator(current);
            draft.particles = current;
          });
        }, () => {
          this.patchEffectVfx('hitVfx', (draft) => {
            delete draft.particles;
          });
        });
      }
    }

    return section;
  }

  private buildCommonSection(
    skill: ActiveSkillDef,
    effect: SkillEffectDef,
  ): HTMLElement {
    const section = createEl('section', 'presentation-lab-section presentation-lab-form-span-all');
    const heading = createEl('h2', 'presentation-lab-section-title');
    heading.textContent = '共通';
    section.appendChild(heading);

    const grid = createEl('div', 'editor-grid');
    section.appendChild(grid);

    grid.appendChild(
      createFieldRow(
        'applyFrame',
        createNumberInput(effect.applyFrame ?? -1, (value) => {
          this.patchEffect((draft) => {
            if (value < 0) {
              delete draft.applyFrame;
            } else {
              draft.applyFrame = Math.floor(value);
            }
          });
        }, { emptyWhen: -1, step: 1, min: 0, placeholder: '省略=即時' }),
      ),
    );

    if (effect.type === 'move') {
      grid.appendChild(
        createFieldRow(
          'moveDurationSec',
          createNumberInput(effect.moveDurationSec, (value) => {
            this.patchEffect((draft) => {
              if (draft.type === 'move') {
                draft.moveDurationSec = Math.max(0, value);
              }
            });
          }, { step: 0.05, min: 0 }),
        ),
      );
    }

    grid.appendChild(
      createFieldRow(
        'useDurationSec',
        createNumberInput(skill.useDurationSec ?? 0, (value) => {
          this.patchSkill((draft) => {
            if (value <= 0) {
              delete draft.useDurationSec;
            } else {
              draft.useDurationSec = value;
            }
          });
        }, { emptyWhen: 0, step: 0.05, min: 0, placeholder: '0 = 即時' }),
      ),
    );

    appendHintLines(grid, [
      [
        'applyFrame',
        'body を先に見せて、効果の発生だけ遅らせたいときのコマ位置。VFX・ダメージは apply コマ（8 FPS）。',
      ],
      [
        'useDurationSec',
        '詠唱など body hold 延長。CD は止めない。',
      ],
    ]);

    return section;
  }

  private patchBasicAttackVfx(mutator: (draft: SkillVfxDef) => void): void {
    const draft = { ...(this.basicAttackVfxDraft ?? {}) };
    mutator(draft);
    this.basicAttackVfxDraft = draft;
    this.markEntityTraitsDirty();
    this.renderToolbar(this.getToolbar());
    this.renderForm();
  }

  private patchEffectVfx(
    which: 'vfx' | 'hitVfx',
    mutator: (draft: SkillVfxDef) => void,
  ): void {
    this.patchEffect((effect) => {
      const current = which === 'vfx' ? effect.vfx : effect.hitVfx;
      const draft = { ...(current ?? {}) };
      mutator(draft);
      if (which === 'vfx') {
        effect.vfx = draft;
      } else {
        effect.hitVfx = draft;
      }
    });
  }

  private patchSkill(mutator: (draft: ActiveSkillDef) => void): void {
    if (!this.skillDraft) return;
    mutator(this.skillDraft);
    this.markDirty();
    this.renderToolbar(this.getToolbar());
    this.renderForm();
    this.refreshTimeline();
  }

  private patchEffect(mutator: (draft: SkillEffectDef) => void): void {
    if (!this.skillDraft) return;
    const effect = this.skillDraft.effect[this.effectIndex];
    if (!effect) return;
    mutator(effect);
    this.markDirty();
    this.renderToolbar(this.getToolbar());
    this.renderForm();
    this.refreshTimeline();
  }

  private refreshTimeline(): void {
    this.timelineHost.replaceChildren();
    const skill = this.skillDraft;
    if (!skill) return;

    const timeline = this.runner.getTimeline(
      skill,
      this.effectIndex,
      this.currentSlotKind(),
    );

    const title = createEl('h2', 'presentation-lab-section-title');
    title.textContent = 'タイムライン（簡易）';
    this.timelineHost.appendChild(title);

    const list = createEl('ul', 'presentation-lab-timeline-list');
    list.append(
      this.timelineItem(
        'body playback',
        timeline.bodyPlaybackFrames !== null
          ? timeline.bodyIntroSec !== null
            ? `intro ${formatSec(timeline.bodyIntroSec)} + hold ${formatSec(timeline.bodyHoldSec)} + outro ${formatSec(timeline.bodyOutroSec)} (${timeline.bodyPlaybackFrames} frames linear)`
            : `${timeline.bodyPlaybackFrames} frames (${formatSec(timeline.bodyPlaybackSec)})`
          : '—',
        timeline.bodyPlaybackSec,
      ),
      this.timelineItem(
        'VFX',
        timeline.vfxKey
          ? `${timeline.vfxKey} (${formatSec(timeline.vfxSec)})`
          : '—',
        timeline.vfxSec,
      ),
      this.timelineItem(
        'particle',
        formatSec(timeline.particleSec),
        timeline.particleSec,
      ),
      this.timelineItem(
        'hitParticle',
        formatSec(timeline.hitParticleSec),
        timeline.hitParticleSec,
      ),
      this.timelineItem(
        'moveDurationSec',
        formatSec(timeline.moveDurationSec),
        timeline.moveDurationSec,
      ),
      this.timelineItem(
        'applyFrame',
        timeline.applyDelaySec > 0
          ? `delay ${formatSec(timeline.applyDelaySec)}`
          : '—',
        timeline.applyDelaySec > 0 ? timeline.applyDelaySec : null,
      ),
      this.timelineItem(
        'presentationLock',
        formatSec(timeline.presentationLockSec),
        timeline.presentationLockSec,
      ),
    );
    this.timelineHost.appendChild(list);
    appendHintLines(this.timelineHost, [
      [
        'body playback',
        'body strip の見た目上の再生時間。intro / hold / outro を含む。`resolveSkillBodyPlaybackSec` が決める。',
      ],
      [
        'presentationLock',
        'VFX が終わるまで通常攻撃だけ止める見た目用のロック。CD チャージは止めない。',
      ],
    ]);

    const track = createEl('div', 'presentation-lab-timeline-track');
    const maxSec = Math.max(
      timeline.bodyPlaybackSec ?? 0,
      timeline.vfxSec ?? 0,
        timeline.particleSec ?? 0,
        timeline.hitParticleSec ?? 0,
      timeline.moveDurationSec ?? 0,
      timeline.applyDelaySec,
      timeline.presentationLockSec,
      0.5,
    );
    for (const segment of buildTimelineSegments(timeline)) {
      if (segment.sec <= 0) continue;
      const bar = createEl('div', 'presentation-lab-timeline-bar');
      bar.style.width = `${(segment.sec / maxSec) * 100}%`;
      bar.style.background = segment.color;
      bar.title = `${segment.label}: ${formatSec(segment.sec)}`;
      const label = createEl('span', 'presentation-lab-timeline-bar-label');
      label.textContent = segment.label;
      bar.appendChild(label);
      track.appendChild(bar);
    }
    this.timelineHost.appendChild(track);
  }

  private timelineItem(
    label: string,
    text: string,
    sec: number | null,
  ): HTMLLIElement {
    const li = createEl('li', 'presentation-lab-timeline-item');
    const name = createEl('span', 'presentation-lab-timeline-label');
    name.textContent = label;
    const value = createEl('span', 'presentation-lab-timeline-value');
    value.textContent = text;
    li.append(name, value);
    li.dataset.sec = sec !== null ? String(sec) : '';
    return li;
  }

  private async reloadFromServer(): Promise<void> {
    try {
      const selection = this.captureSelection();
      const [classes, enemies, skills] = await Promise.all([
        fetchClasses(),
        fetchEnemies(),
        fetchSkills(),
      ]);
      this.classes = classes;
      this.enemies = enemies;
      this.skills = skills;
      this.restoreSelection(selection);
      this.refreshAfterDataReload();
      this.setStatus('サーバーから再読込しました');
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  private async saveDraft(): Promise<void> {
    if (!this.skillDraft) return;
    const validationError = validatePresentationSkillSave(this.skillDraft);
    if (validationError) {
      this.setStatus(validationError, true);
      return;
    }
    const isBasic = this.currentSlotKind() === 'basic';
    if (this.entityTraitsDirty && isBasic) {
      const traitsError = validateBasicAttackVfxSave(this.basicAttackVfxDraft ?? {});
      if (traitsError) {
        this.setStatus(traitsError, true);
        return;
      }
    }
    try {
      await savePresentationSkill(
        this.skillDraft,
        this.entityTraitsDirty && isBasic
          ? {
              entityKind: this.entityKind,
              entityId: this.entityId,
              basicAttackVfx: this.basicAttackVfxDraft ?? {},
            }
          : undefined,
      );
      const selection = this.captureSelection();
      const [classes, enemies, skills] = await Promise.all([
        fetchClasses(),
        fetchEnemies(),
        fetchSkills(),
      ]);
      this.classes = classes;
      this.enemies = enemies;
      this.skills = skills;
      this.restoreSelection(selection);
      this.refreshAfterDataReload();
      this.setStatus('保存しました');
    } catch (error) {
      this.setStatus(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  destroy(): void {
    this.runner.destroy();
  }
}

const VFX_ANCHOR_OPTIONS: { value: VfxAnchor; label: string }[] = [
  { value: 'actor', label: 'actor' },
  { value: 'target', label: 'target' },
  { value: 'between', label: 'between' },
  { value: 'footActor', label: 'footActor' },
  { value: 'footTarget', label: 'footTarget' },
];

const VFX_LAYER_OPTIONS: { value: VfxLayer; label: string }[] = [
  { value: 'behind', label: 'behind' },
  { value: 'front', label: 'front' },
];

function appendAssetState(
  parent: HTMLElement,
  label: string,
  key: string | null,
  hasAsset: boolean,
): void {
  const row = createEl('p', 'presentation-lab-asset-state');
  const status = hasAsset ? 'PNG あり' : 'PNG なし';
  row.textContent = `${label}: ${key ?? '—'} (${status})`;
  parent.appendChild(row);
}

function appendAnimPhaseFields(
  grid: HTMLElement,
  fields: AnimPhaseFields,
  patch: (mutator: (draft: AnimPhaseFields) => void) => void,
): void {
  grid.appendChild(
    createFieldRow(
      'animStartFrame',
      createNumberInput(fields.animStartFrame ?? 0, (value) => {
        patch((draft) => {
          if (value <= 0) delete draft.animStartFrame;
          else draft.animStartFrame = Math.floor(value);
        });
      }, { emptyWhen: 0, step: 1, min: 0 }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'animIntroEndFrame',
      createNumberInput(fields.animIntroEndFrame ?? -1, (value) => {
        patch((draft) => {
          if (value < 0) delete draft.animIntroEndFrame;
          else draft.animIntroEndFrame = Math.floor(value);
        });
      }, { emptyWhen: -1, step: 1, min: 0, placeholder: '省略=loop開始' }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'animLoopFrame',
      createNumberInput(fields.animLoopFrame ?? -1, (value) => {
        patch((draft) => {
          if (value < 0) {
            delete draft.animLoopFrame;
            delete draft.animLoopEndFrame;
            delete draft.animIntroEndFrame;
            delete draft.animOutroStartFrame;
          } else {
            draft.animLoopFrame = Math.floor(value);
          }
        });
      }, { emptyWhen: -1, step: 1, min: 0, placeholder: 'ループ開始' }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'animLoopEndFrame',
      createNumberInput(fields.animLoopEndFrame ?? -1, (value) => {
        patch((draft) => {
          if (value < 0) delete draft.animLoopEndFrame;
          else draft.animLoopEndFrame = Math.floor(value);
        });
      }, { emptyWhen: -1, step: 1, min: 0, placeholder: 'ループ終了（省略=開始）' }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'animOutroStartFrame',
      createNumberInput(fields.animOutroStartFrame ?? -1, (value) => {
        patch((draft) => {
          if (value < 0) delete draft.animOutroStartFrame;
          else draft.animOutroStartFrame = Math.floor(value);
        });
      }, { emptyWhen: -1, step: 1, min: 0, placeholder: '省略=loop終了+1' }),
    ),
  );
}

function appendVfxPlacementFields(
  grid: HTMLElement,
  placement: VfxPlacement | undefined,
  patchPlacement: (mutator: (placement: VfxPlacement) => void) => void,
  clearPlacement?: () => void,
): void {
  grid.appendChild(
    createFieldRow(
      'placement.anchor',
      createSelect(placement?.anchor ?? '', [
        { value: '', label: '— 既定 —' },
        ...VFX_ANCHOR_OPTIONS,
      ], (value) => {
        if (!value) {
          clearPlacement?.();
          return;
        }
        patchPlacement((p) => {
          p.anchor = value as VfxAnchor;
        });
      }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'placement.offsetX',
      createNumberInput(placement?.offsetX ?? 0, (value) => {
        patchPlacement((p) => {
          if (value === 0) delete p.offsetX;
          else p.offsetX = Math.floor(value);
        });
      }, { emptyWhen: 0, step: 1 }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'placement.offsetY',
      createNumberInput(placement?.offsetY ?? 0, (value) => {
        patchPlacement((p) => {
          if (value === 0) delete p.offsetY;
          else p.offsetY = Math.floor(value);
        });
      }, { emptyWhen: 0, step: 1 }),
    ),
  );
  grid.appendChild(
    createFieldRow(
      'placement.layer',
      createSelect(placement?.layer ?? '', [
        { value: '', label: '— 既定 —' },
        ...VFX_LAYER_OPTIONS,
      ], (value) => {
        if (!value) {
          patchPlacement((p) => {
            delete p.layer;
          });
          return;
        }
        patchPlacement((p) => {
          p.layer = value as VfxLayer;
        });
      }),
    ),
  );
}

function appendParticleFields(
  grid: HTMLElement,
  particles: VfxParticleDef | undefined,
  patchParticles: (mutator: (draft: VfxParticleDef) => void) => void,
  clearParticles: () => void,
): void {
  const particleHeading = createEl('h3', 'presentation-lab-section-title');
  particleHeading.textContent = 'particles';
  grid.appendChild(particleHeading);

  const enabled = particles !== undefined && particles.enabled !== false;
  appendVfxEnabledRow(grid, 'particles.enabled', enabled, (nextEnabled) => {
    if (nextEnabled) {
      patchParticles((draft) => {
        draft.enabled = true;
        if (!draft.preset) {
          draft.preset = PARTICLE_PRESET_IDS[0];
        }
      });
    } else if (particles) {
      patchParticles((draft) => {
        draft.enabled = false;
      });
    }
  });

  if (!particles || particles.enabled === false) return;

  grid.appendChild(
    createFieldRow(
      'particles.preset',
      createSelect(particles.preset ?? PARTICLE_PRESET_IDS[0], [
        { value: '', label: '—' },
        ...PARTICLE_PRESET_IDS.map((id) => ({ value: id, label: id })),
      ], (value) => {
        if (!value) {
          clearParticles();
          return;
        }
        patchParticles((draft) => {
          draft.preset = value;
        });
      }),
    ),
  );

  grid.appendChild(
    createFieldRow(
      'particles.count',
      createNumberInput(particles.count ?? 0, (value) => {
        patchParticles((draft) => {
          if (value <= 0) {
            delete draft.count;
          } else {
            draft.count = Math.floor(value);
          }
        });
      }, { emptyWhen: 0, step: 1, min: 1, placeholder: 'preset 既定' }),
    ),
  );

  grid.appendChild(
    createFieldRow(
      'particles.durationSec',
      createNumberInput(particles.durationSec ?? 0, (value) => {
        patchParticles((draft) => {
          if (value <= 0) {
            delete draft.durationSec;
          } else {
            draft.durationSec = value;
          }
        });
      }, { emptyWhen: 0, step: 0.05, min: 0, placeholder: 'preset 既定' }),
    ),
  );

  grid.appendChild(
    createFieldRow(
      'particles.tint',
      (() => {
        const input = createEl('input') as HTMLInputElement;
        input.type = 'text';
        input.placeholder = '#rrggbb（preset 既定）';
        input.value = particles.tint ?? '';
        input.addEventListener('change', () => {
          const value = input.value.trim();
          patchParticles((draft) => {
            if (!value) {
              delete draft.tint;
            } else {
              draft.tint = value;
            }
          });
        });
        return input;
      })(),
    ),
  );

  grid.appendChild(
    createFieldRow(
      'particles.delaySec',
      createNumberInput(particles.delaySec ?? 0, (value) => {
        patchParticles((draft) => {
          if (value <= 0) {
            delete draft.delaySec;
          } else {
            draft.delaySec = value;
          }
        });
      }, { emptyWhen: 0, step: 0.05, min: 0, placeholder: '0 = 即時' }),
    ),
  );

  appendVfxPlacementFields(
    grid,
    particles.placement,
    (mutator) => {
      patchParticles((draft) => {
        const placement = { anchor: 'target' as VfxAnchor, ...draft.placement };
        mutator(placement);
        draft.placement = placement;
      });
    },
    () => {
      patchParticles((draft) => {
        delete draft.placement;
      });
    },
  );

  appendHintLines(grid, [
    ['placement', '未指定時は親 vfx.placement を継承。独自値を入れると particles 側だけ上書きされます。'],
    ['delaySec', 'VFX 開始からの遅延秒数。presentationLock とタイムラインにも反映されます。'],
  ]);
}

function appendVfxEnabledRow(
  grid: HTMLElement,
  label: string,
  enabled: boolean,
  onChange: (enabled: boolean) => void,
): void {
  grid.appendChild(
    createFieldRow(
      label,
      (() => {
        const row = createEl('div', 'presentation-lab-field presentation-lab-field-checkbox');
        const input = createEl('input') as HTMLInputElement;
        input.type = 'checkbox';
        input.checked = enabled;
        input.addEventListener('change', () => {
          onChange(input.checked);
        });
        row.appendChild(createEl('label', undefined, label));
        row.appendChild(input);
        return row;
      })(),
    ),
  );
}

function buildTimelineSegments(
  timeline: PresentationTimeline,
): { label: string; sec: number; color: string }[] {
  const segments: { label: string; sec: number; color: string }[] = [];
  if (timeline.bodyIntroSec !== null && timeline.bodyIntroSec > 0) {
    segments.push({
      label: 'intro',
      sec: timeline.bodyIntroSec,
      color: '#4a90d9',
    });
  }
  if (timeline.bodyHoldSec !== null && timeline.bodyHoldSec > 0) {
    segments.push({
      label: 'hold',
      sec: timeline.bodyHoldSec,
      color: '#3a7bc8',
    });
  }
  if (timeline.bodyOutroSec !== null && timeline.bodyOutroSec > 0) {
    segments.push({
      label: 'outro',
      sec: timeline.bodyOutroSec,
      color: '#2d6bb3',
    });
  }
  if (
    segments.length === 0 &&
    timeline.bodyPlaybackSec !== null &&
    timeline.bodyPlaybackSec > 0
  ) {
    segments.push({
      label: 'body',
      sec: timeline.bodyPlaybackSec,
      color: '#4a90d9',
    });
  }
  return [
    ...segments,
    {
      label: 'apply',
      sec: timeline.applyDelaySec,
      color: '#e74c3c',
    },
    { label: 'VFX', sec: timeline.vfxSec ?? 0, color: '#e6a23c' },
    { label: 'particle', sec: timeline.particleSec ?? 0, color: '#f5b041' },
    {
      label: 'hitParticle',
      sec: timeline.hitParticleSec ?? 0,
      color: '#f0c674',
    },
    {
      label: 'move',
      sec: timeline.moveDurationSec ?? 0,
      color: '#67c23a',
    },
    {
      label: 'presLock',
      sec: timeline.presentationLockSec,
      color: '#909399',
    },
  ];
}
