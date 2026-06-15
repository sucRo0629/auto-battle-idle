import { normalizeEntityTraits } from '../battle/data/entityTraits.ts';
import {
  VFX_PRESET_LABELS,
  VFX_PRESET_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import type {
  ActiveSkillDef,
  EnemyTemplate,
  SkillEffectDef,
  SkillVfxPresetId,
} from '../battle/types.ts';
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
import { PresentationPreviewRunner } from './PresentationPreviewRunner.ts';
import type { PreviewEntity } from './presentationTimeline.ts';
import type { PresentationTimeline } from './presentationTimeline.ts';

type EntityKind = 'class' | 'enemy';

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

export class PresentationLabApp {
  private classes: ClassPresetBeforeEnrich[] = [];
  private enemies: EnemyTemplate[] = [];
  private skills: SkillsJson = { passives: [], actives: [] };

  private entityKind: EntityKind = 'class';
  private entityId = '';
  private skillId = '';
  private effectIndex = 0;
  private skillDraft: ActiveSkillDef | null = null;
  private dirty = false;
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
  }

  private currentSkillOptions(): ActiveSkillDef[] {
    if (!this.entityId) return [];
    return skillsForEntity(this.entityId, this.skills.actives);
  }

  private loadSkillDraft(): void {
    const skill = this.skills.actives.find((entry) => entry.id === this.skillId);
    this.skillDraft = skill ? cloneSkill(skill) : null;
    this.dirty = false;
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
        basicAttackVfx: traits.basicAttackVfx,
        isEnemy: false,
      };
    }
    const enemy = this.enemies.find((entry) => entry.id === this.entityId);
    const traits = normalizeEntityTraits(enemy?.traits);
    return {
      entityId: this.entityId,
      rangePx: traits.rangePx,
      damageType: traits.damageType,
      basicAttackVfx: traits.basicAttackVfx,
      isEnemy: true,
    };
  }

  private syncPreviewEntities(): void {
    const actor = this.currentEntityTraits();
    const target: PreviewEntity = {
      entityId: 'stage1_1',
      rangePx: 0,
      damageType: 'physical',
      basicAttackVfx: { preset: 'slash' },
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
    this.previewTarget = target;
    this.runner.setEntities(actor, target);
  }

  private currentSlotKind(): 'basic' | 'active' {
    return isBasicAttackSkillId(this.skillId, this.entityId) ? 'basic' : 'active';
  }

  private currentEffect(): SkillEffectDef | null {
    return this.skillDraft?.effect[this.effectIndex] ?? null;
  }

  private markDirty(): void {
    this.dirty = true;
    this.refreshTimeline();
    this.setStatus('未保存の変更があります');
  }

  private setStatus(message: string, isError = false): void {
    this.statusEl.textContent = message;
    this.statusEl.classList.toggle('presentation-lab-status-error', isError);
  }

  private renderToolbar(toolbar: HTMLElement): void {
    toolbar.replaceChildren();

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
      this.renderForm();
      this.refreshTimeline();
    });

    const effectOptions = (this.skillDraft?.effect ?? []).map((effect, index) => ({
      value: String(index),
      label: `${index}: ${effect.type}`,
    }));
    const effectSelect = createSelect(String(this.effectIndex), effectOptions, (value) => {
      this.effectIndex = Number.parseInt(value, 10);
      this.renderForm();
      this.refreshTimeline();
    });

    const playBtn = createActionButton('▶ 再生', () => {
      if (!this.skillDraft || !this.previewTarget) return;
      this.runner.play({
        skill: this.skillDraft,
        effectIndex: this.effectIndex,
        actor: this.currentEntityTraits(),
        target: this.previewTarget,
        slotKind: this.currentSlotKind(),
      });
    });
    playBtn.classList.add('presentation-lab-play-btn');

    const resetBtn = createButton('↺ リセット', () => {
      this.runner.reset();
    });

    const reloadBtn = createButton('再読込', () => {
      void this.reloadFromServer();
    });

    const saveBtn = createActionButton('JSON 保存', () => {
      void this.saveDraft();
    });
    saveBtn.disabled = !this.dirty;

    toolbar.append(
      createFieldRow('種別', entityKindSelect),
      createFieldRow('entity', entitySelect),
      createFieldRow('skill', skillSelect),
      createFieldRow('effect', effectSelect),
      playBtn,
      resetBtn,
      reloadBtn,
      saveBtn,
    );
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

    const section = createEl('section', 'presentation-lab-section');
    const heading = createEl('h2', 'presentation-lab-section-title');
    heading.textContent = '演出パラメータ';
    section.appendChild(heading);

    const grid = createEl('div', 'editor-grid');
    section.appendChild(grid);

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
        }, { emptyWhen: 0, step: 0.05, min: 0 }),
      ),
    );

    grid.appendChild(
      createFieldRow(
        'animStartFrame',
        createNumberInput(effect.animStartFrame ?? 0, (value) => {
          this.patchEffect((draft) => {
            if (value <= 0) {
              delete draft.animStartFrame;
            } else {
              draft.animStartFrame = Math.floor(value);
            }
          });
        }, { emptyWhen: 0, step: 1, min: 0 }),
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

    const preset = effect.vfx?.preset ?? '';
    grid.appendChild(
      createFieldRow(
        'vfx.preset',
        createSelect(
          preset,
          [
            { value: '', label: '— スキル既定 —' },
            ...VFX_PRESET_OPTIONS.map((value) => ({
              value,
              label: VFX_PRESET_LABELS[value],
            })),
          ],
          (value) => {
            this.patchEffect((draft) => {
              if (value.length === 0) {
                delete draft.vfx;
                return;
              }
              draft.vfx = {
                ...(draft.vfx ?? {}),
                preset: value as SkillVfxPresetId,
              };
            });
          },
        ),
      ),
    );

    grid.appendChild(
      createFieldRow(
        'vfx.durationMs',
        createNumberInput(effect.vfx?.durationMs ?? 0, (value) => {
          this.patchEffect((draft) => {
            if (!draft.vfx && value <= 0) return;
            const next = { ...(draft.vfx ?? {}) };
            if (value <= 0) {
              delete next.durationMs;
            } else {
              next.durationMs = Math.floor(value);
            }
            if (Object.keys(next).length === 0) {
              delete draft.vfx;
            } else if ('preset' in next || value > 0) {
              draft.vfx = next as NonNullable<typeof draft.vfx>;
            }
          });
        }, { emptyWhen: 0, step: 10, min: 0 }),
      ),
    );

    const labLink = createEl('p', 'presentation-lab-hint');
    labLink.textContent =
      '保存先: data/skills/actives/（該当 stem ファイルへ upsert）';

    this.formHost.append(section, labLink);
  }

  private patchSkill(mutator: (draft: ActiveSkillDef) => void): void {
    if (!this.skillDraft) return;
    mutator(this.skillDraft);
    this.markDirty();
    this.renderToolbar(this.root.querySelector('.presentation-lab-toolbar')!);
    this.renderForm();
  }

  private patchEffect(mutator: (draft: SkillEffectDef) => void): void {
    if (!this.skillDraft) return;
    const effect = this.skillDraft.effect[this.effectIndex];
    if (!effect) return;
    mutator(effect);
    this.markDirty();
    this.renderForm();
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
          ? `${timeline.bodyPlaybackFrames} frames (${formatSec(timeline.bodyPlaybackSec)})`
          : '—',
        timeline.bodyPlaybackSec,
      ),
      this.timelineItem(
        'VFX',
        timeline.vfxPreset
          ? `${timeline.vfxPreset} (${formatSec(timeline.vfxSec)})`
          : '—',
        timeline.vfxSec,
      ),
      this.timelineItem(
        'moveDurationSec',
        formatSec(timeline.moveDurationSec),
        timeline.moveDurationSec,
      ),
      this.timelineItem(
        'presentationLock',
        formatSec(timeline.presentationLockSec),
        timeline.presentationLockSec,
      ),
      this.timelineItem(
        'useDurationSec',
        formatSec(timeline.useDurationSec),
        timeline.useDurationSec > 0 ? timeline.useDurationSec : null,
      ),
    );
    this.timelineHost.appendChild(list);

    const track = createEl('div', 'presentation-lab-timeline-track');
    const maxSec = Math.max(
      timeline.bodyPlaybackSec ?? 0,
      timeline.vfxSec ?? 0,
      timeline.moveDurationSec ?? 0,
      timeline.presentationLockSec,
      timeline.useDurationSec,
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
      this.skills = await fetchSkills();
      this.loadSkillDraft();
      this.dirty = false;
      this.renderToolbar(this.root.querySelector('.presentation-lab-toolbar')!);
      this.renderForm();
      this.refreshTimeline();
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
    try {
      await savePresentationSkill(this.skillDraft);
      this.skills = await fetchSkills();
      this.loadSkillDraft();
      this.dirty = false;
      this.renderToolbar(this.root.querySelector('.presentation-lab-toolbar')!);
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

function buildTimelineSegments(
  timeline: PresentationTimeline,
): { label: string; sec: number; color: string }[] {
  return [
    {
      label: 'body',
      sec: timeline.bodyPlaybackSec ?? 0,
      color: '#4a90d9',
    },
    { label: 'VFX', sec: timeline.vfxSec ?? 0, color: '#e6a23c' },
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
    {
      label: 'useDur',
      sec: timeline.useDurationSec,
      color: '#f56c6c',
    },
  ];
}
