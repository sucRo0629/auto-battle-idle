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
import {
  resolvePreviewBattleLayout,
  resolvePreviewBattleLayoutFallback,
} from './previewLayout.ts';
import type { PreviewEntity } from './presentationTimeline.ts';
import type { PresentationTimeline } from './presentationTimeline.ts';
import { validatePresentationSkillSave } from './presentationSaveValidation.ts';

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
      this.renderForm();
      this.syncPreviewEntities();
      this.refreshTimeline();
    });

    const playBtn = createActionButton('▶ 再生', 'editor-btn', () => {
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

    const resetBtn = createButton('↺ リセット', 'editor-btn', () => {
      this.runner.reset();
    });

    const reloadBtn = createButton('再読込', 'editor-btn', () => {
      void this.reloadFromServer();
    });

    const saveBtn = createActionButton('JSON 保存', 'editor-btn', () => {
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

    grid.appendChild(
      createFieldRow(
        'animIntroEndFrame',
        createNumberInput(effect.animIntroEndFrame ?? -1, (value) => {
          this.patchEffect((draft) => {
            if (value < 0) delete draft.animIntroEndFrame;
            else draft.animIntroEndFrame = Math.floor(value);
          });
        }, { emptyWhen: -1, step: 1, min: 0, placeholder: '省略=loop開始' }),
      ),
    );

    grid.appendChild(
      createFieldRow(
        'animLoopFrame',
        createNumberInput(effect.animLoopFrame ?? -1, (value) => {
          this.patchEffect((draft) => {
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
        createNumberInput(effect.animLoopEndFrame ?? -1, (value) => {
          this.patchEffect((draft) => {
            if (value < 0) delete draft.animLoopEndFrame;
            else draft.animLoopEndFrame = Math.floor(value);
          });
        }, { emptyWhen: -1, step: 1, min: 0, placeholder: 'ループ終了（省略=開始）' }),
      ),
    );

    grid.appendChild(
      createFieldRow(
        'animOutroStartFrame',
        createNumberInput(effect.animOutroStartFrame ?? -1, (value) => {
          this.patchEffect((draft) => {
            if (value < 0) {
              delete draft.animOutroStartFrame;
            } else {
              draft.animOutroStartFrame = Math.floor(value);
            }
          });
        }, { emptyWhen: -1, step: 1, min: 0, placeholder: '省略=loop終了+1' }),
      ),
    );

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

    const applyHint = createEl('p', 'presentation-lab-hint');
    applyHint.textContent =
      'applyFrame = strip 内の効果適用コマ（絶対）。animStartFrame 以降。8 FPS（1 コマ = 0.125 秒）。body は即再生、VFX・ダメージは apply コマ。';
    grid.appendChild(applyHint);

    const phaseHint = createEl('p', 'presentation-lab-hint');
    phaseHint.textContent =
      'animLoopFrame を指定すると intro（start〜introEnd）→ hold（loop開始〜loop終了をループ）→ outro（outroStart〜終端）の 3 段再生。hold 時間は resolveSkillBodyPlaybackSec が決める。introEnd 省略時は loop開始、outroStart 省略時は loop終了+1。';
    grid.appendChild(phaseHint);
    appendHintLines(grid, [
      [
        'applyFrame',
        'body を先に見せて、効果の発生だけ遅らせたいときのコマ位置。ダメージ / 回復 / VFX の適用タイミングをずらす。',
      ],
      [
        'moveDurationSec',
        'move ステップの移動補間秒。battleX の位置移動を何秒で終えるかを決める。',
      ],
      [
        'vfx.durationMs',
        'VFX 1 本の表示時間。body の再生や presentationLock の長さを決める基準にもなる。',
      ],
    ]);

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
            { value: '', label: '— なし —' },
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

    const vfxPreset = effect.vfx?.preset;
    grid.appendChild(
      createFieldRow(
        'vfx.durationMs',
        createNumberInput(effect.vfx?.durationMs ?? 0, (value) => {
          this.patchEffect((draft) => {
            if (!draft.vfx?.preset) return;
            if (value <= 0) {
              const next = { ...draft.vfx };
              delete next.durationMs;
              draft.vfx = next;
              return;
            }
            draft.vfx = {
              ...draft.vfx,
              durationMs: Math.floor(value),
            };
          });
        }, {
          emptyWhen: 0,
          step: 10,
          min: 0,
          readonly: !vfxPreset,
          placeholder: vfxPreset ? undefined : 'なし',
        }),
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
    this.renderToolbar(this.root.querySelector('.presentation-lab-toolbar')!);
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
    const validationError = validatePresentationSkillSave(this.skillDraft);
    if (validationError) {
      this.setStatus(validationError, true);
      return;
    }
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
