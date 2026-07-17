import {
  TARGET_SHAPE_OPTIONS,
} from '../battle/data/gameDataSchema.ts';
import {
  CONFIGURABLE_RANGE_PX_MAX,
  configurableRangeHintJa,
  parseConfigurableRangePxInput,
} from '../battle/rangeLimits.ts';
import { getEffectTarget } from '../battle/skills/targetSpec.ts';
import type { SkillEffectDef, TargetShape, TargetSpec } from '../battle/types.ts';
import { EFFECT_RANGE_FORM_LABELS } from './combatModuleEditor.ts';
import { createEl, createFieldRow, createNumberInput, createSelect } from './formUtils.ts';

type TargetingEffect = Pick<
  SkillEffectDef,
  | 'targetShape'
  | 'range'
  | 'aoeRadiusPx'
  | 'hitCount'
  | 'hitDurationSec'
  | 'piercePowerStepMultiplier'
  | 'piercePowerStepMode'
  | 'pierceDurationSec'
  | 'chainCount'
  | 'chainMaxDistancePx'
  | 'chainPowerStepMultiplier'
  | 'chainPowerStepMode'
  | 'chainDurationSec'
  | 'scatterRadiusPx'
  | 'scatterSpreadRadiusPx'
  | 'scatterHitCount'
  | 'scatterDurationSec'
  | 'scatterSpreadRate'
  | 'effectRange'
> & {
  target?: TargetSpec;
  targetRule?: import('../battle/types.ts').TargetRule;
};

export function appendSkillEffectTargetingFields(
  parent: HTMLElement,
  effect: TargetingEffect,
  patchEffect: (
    mutate: (prev: TargetingEffect) => TargetingEffect,
    options?: { rerender?: boolean },
  ) => void,
  options: { traitsRangePx: number },
): void {
  const effectTargetKind = getEffectTarget(effect).kind;
  const targetShape: TargetShape = effect.targetShape ?? 'single';

  const shapeSelect = createSelect(
    effectTargetKind === 'self' ? 'single' : targetShape,
    TARGET_SHAPE_OPTIONS.map((value) => ({
      value,
      label: EFFECT_RANGE_FORM_LABELS[value],
    })),
    (shape) => {
      patchEffect((prev) => {
        const next: TargetingEffect = { ...prev, targetShape: shape };
        delete next.aoeRadiusPx;
        delete next.hitCount;
        delete next.hitDurationSec;
        delete next.piercePowerStepMultiplier;
        delete next.piercePowerStepMode;
        delete next.pierceDurationSec;
        delete next.chainCount;
        delete next.chainMaxDistancePx;
        delete next.chainPowerStepMultiplier;
        delete next.chainPowerStepMode;
        delete next.chainDurationSec;
        delete next.scatterRadiusPx;
        delete next.scatterSpreadRadiusPx;
        delete next.scatterHitCount;
        delete next.scatterDurationSec;
        delete next.scatterSpreadRate;
        if (shape === 'aoe') {
          next.aoeRadiusPx = 70;
        } else if (shape === 'multiLock') {
          next.hitCount = 3;
          next.effectRange = {
            form: 'single',
            applyMode: 'instant',
            hitCount: 3,
            refillSameTargetOnShortfall: true,
          };
        } else if (shape === 'chain') {
          next.chainCount = 3;
          next.chainMaxDistancePx = 80;
        } else if (shape === 'scatter') {
          next.scatterRadiusPx = 70;
          next.scatterSpreadRadiusPx = 70;
          next.scatterHitCount = 3;
          next.scatterDurationSec = 1;
          next.scatterSpreadRate = 1;
        }
        return next;
      }, { rerender: true });
    },
  );
  if (effectTargetKind === 'self') {
    shapeSelect.disabled = true;
  }
  parent.appendChild(createFieldRow('効果範囲の形式', shapeSelect));

  if (targetShape === 'single' || targetShape === 'aoe') {
    parent.appendChild(
      createFieldRow(
        'Hit / 攻撃回数（2以上・省略=1）',
        createNumberInput(
          effect.hitCount ?? 0,
          (hitCount) => {
            const rounded = Math.round(hitCount);
            if (rounded < 2) {
              patchEffect((prev) => {
                const next = { ...prev, targetShape };
                delete next.hitCount;
                delete next.hitDurationSec;
                return next;
              }, { rerender: true });
              return;
            }
            patchEffect(
              (prev) => ({
                ...prev,
                targetShape,
                hitCount: rounded,
                hitDurationSec: prev.hitDurationSec ?? 1,
              }),
              { rerender: (effect.hitCount ?? 0) < 2 },
            );
          },
          { min: 2, step: 1, emptyWhen: 0, placeholder: '1（省略）' },
        ),
      ),
    );
    if ((effect.hitCount ?? 0) >= 2) {
      parent.appendChild(
        createFieldRow(
          '攻撃時間（秒）',
          createNumberInput(
            effect.hitDurationSec ?? 1,
            (hitDurationSec) =>
              patchEffect((prev) => ({ ...prev, targetShape, hitDurationSec })),
            { min: 0.1, step: 0.1 },
          ),
        ),
      );
    }
  }

  if (targetShape === 'aoe') {
    parent.appendChild(
      createFieldRow(
        '範囲 N px（ターゲット中心）',
        createNumberInput(
          effect.aoeRadiusPx ?? 70,
          (aoeRadiusPx) =>
            patchEffect((prev) => ({ ...prev, targetShape: 'aoe', aoeRadiusPx })),
          { min: 1, step: 10 },
        ),
      ),
    );
  }

  if (targetShape === 'multiLock') {
    parent.appendChild(
      createFieldRow(
        '対象数 / Hit',
        createNumberInput(
          effect.hitCount ?? 3,
          (hitCount) =>
            patchEffect((prev) => {
              const next: TargetingEffect = {
                ...prev,
                targetShape: 'multiLock',
                hitCount,
              };
              const prevRange = prev.effectRange;
              next.effectRange = {
                form: prevRange?.form ?? 'single',
                applyMode: prevRange?.applyMode ?? 'instant',
                ...(prevRange?.distancePx !== undefined
                  ? { distancePx: prevRange.distancePx }
                  : {}),
                ...(prevRange?.maxTargets !== undefined
                  ? { maxTargets: prevRange.maxTargets }
                  : {}),
                hitCount,
                refillSameTargetOnShortfall:
                  prevRange?.refillSameTargetOnShortfall ?? true,
              };
              return next;
            }),
          { min: 2, step: 1 },
        ),
      ),
    );
    const refillRow = createEl('div', 'editor-field editor-field-checkbox');
    const refillInput = createEl('input') as HTMLInputElement;
    refillInput.type = 'checkbox';
    refillInput.className = 'editor-input';
    refillInput.checked =
      effect.effectRange?.refillSameTargetOnShortfall !== false;
    refillInput.addEventListener('change', () => {
      const refill = refillInput.checked;
      patchEffect((prev) => {
        const hitCount = prev.hitCount ?? 3;
        const prevRange = prev.effectRange;
        return {
          ...prev,
          targetShape: 'multiLock',
          hitCount,
          effectRange: {
            form: prevRange?.form ?? 'single',
            applyMode: prevRange?.applyMode ?? 'instant',
            ...(prevRange?.distancePx !== undefined
              ? { distancePx: prevRange.distancePx }
              : {}),
            ...(prevRange?.maxTargets !== undefined
              ? { maxTargets: prevRange.maxTargets }
              : {}),
            hitCount,
            refillSameTargetOnShortfall: refill,
          },
        };
      }, { rerender: true });
    });
    const refillLabel = createEl('label');
    refillLabel.appendChild(refillInput);
    refillLabel.appendChild(
      document.createTextNode(' 不足対象数を同一対象へ再命中する'),
    );
    refillRow.appendChild(refillLabel);
    parent.appendChild(
      createFieldRow('不足時の再命中', refillRow),
    );
  }

  if (targetShape === 'chain') {
    parent.appendChild(
      createFieldRow(
        '連鎖回数',
        createNumberInput(
          effect.chainCount ?? 3,
          (chainCount) =>
            patchEffect((prev) => ({ ...prev, targetShape: 'chain', chainCount })),
          { min: 1, step: 1, field: 'effect-target-chain-count' },
        ),
      ),
    );
    parent.appendChild(
      createFieldRow(
        '連鎖最大距離 px',
        createNumberInput(
          effect.chainMaxDistancePx ?? 80,
          (chainMaxDistancePx) =>
            patchEffect((prev) => ({
              ...prev,
              targetShape: 'chain',
              chainMaxDistancePx,
            })),
          { min: 1, step: 10 },
        ),
      ),
    );
  }

  if (targetShape === 'scatter') {
    parent.appendChild(
      createFieldRow(
        '乱打・子範囲半径 px',
        createNumberInput(
          effect.scatterRadiusPx ?? 70,
          (scatterRadiusPx) =>
            patchEffect((prev) => ({
              ...prev,
              targetShape: 'scatter',
              scatterRadiusPx,
            })),
          { min: 1, step: 10 },
        ),
      ),
    );
    parent.appendChild(
      createFieldRow(
        '乱打・Hit 回数',
        createNumberInput(
          effect.scatterHitCount ?? 3,
          (scatterHitCount) =>
            patchEffect((prev) => ({
              ...prev,
              targetShape: 'scatter',
              scatterHitCount,
            })),
          { min: 2, step: 1 },
        ),
      ),
    );
    parent.appendChild(
      createFieldRow(
        '乱打・適用時間（秒）',
        createNumberInput(
          effect.scatterDurationSec ?? 1,
          (scatterDurationSec) =>
            patchEffect((prev) => ({
              ...prev,
              targetShape: 'scatter',
              scatterDurationSec,
            })),
          { min: 0.1, step: 0.1 },
        ),
      ),
    );
  }

  if (targetShape === 'pierce') {
    parent.appendChild(
      createFieldRow(
        '前方・進行時間（秒・0=即時）',
        createNumberInput(
          effect.pierceDurationSec ?? 0,
          (pierceDurationSec) =>
            patchEffect((prev) => ({
              ...prev,
              targetShape: 'pierce',
              pierceDurationSec: pierceDurationSec > 0 ? pierceDurationSec : undefined,
            })),
          { min: 0, step: 0.1 },
        ),
      ),
    );
  }

  parent.appendChild(
    createFieldRow(
      '射程 / 前方距離 px（省略時=traits.rangePx）',
      createNumberInput(
        effect.range ?? 0,
        (range) =>
          patchEffect((prev) => ({
            ...prev,
            range: range > 0 ? range : undefined,
          })),
        {
          min: 0,
          max: CONFIGURABLE_RANGE_PX_MAX,
          step: 10,
          parseInput: (raw) =>
            parseConfigurableRangePxInput(raw, options.traitsRangePx),
        },
      ),
    ),
  );
  parent.appendChild(createEl('p', 'editor-hint', configurableRangeHintJa()));
}
