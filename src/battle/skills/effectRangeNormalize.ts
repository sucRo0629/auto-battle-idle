import type {
  EffectApplyMode,
  EffectRangeForm,
  EffectRangeSpec,
  SkillSharedTargetingFields,
  TargetShape,
} from '../types.ts';

export const EFFECT_RANGE_FORMS = [
  'single',
  'point',
  'area',
  'around',
  'forward',
] as const satisfies readonly EffectRangeForm[];

export const EFFECT_APPLY_MODES = [
  'instant',
  'progress',
  'persist',
  'barrage',
] as const satisfies readonly EffectApplyMode[];

export const EFFECT_RANGE_FORM_LABELS: Record<EffectRangeForm, string> = {
  single: '単体',
  point: '地点',
  area: '範囲',
  around: '周囲',
  forward: '前方',
};

export const EFFECT_APPLY_MODE_LABELS: Record<EffectApplyMode, string> = {
  instant: '即時',
  progress: '進行',
  persist: '持続',
  barrage: '乱打',
};

export type LegacyTargetingBridgeFields = SkillSharedTargetingFields & {
  targetShape?: TargetShape;
};

/** legacy targetShape → §5.7 effectRange。chain / scatter / poolEach は対応なし（undefined）。 */
export function effectRangeFromLegacyTargetShape(
  shape: TargetShape,
  fields: LegacyTargetingBridgeFields = {},
): EffectRangeSpec | undefined {
  const hitCount =
    typeof fields.hitCount === 'number' ? fields.hitCount : undefined;
  switch (shape) {
    case 'single':
      return {
        form: 'single',
        applyMode: 'instant',
        ...(hitCount !== undefined ? { hitCount } : {}),
      };
    case 'aoe':
      return {
        form: 'area',
        applyMode: 'instant',
        ...(typeof fields.aoeRadiusPx === 'number'
          ? { distancePx: fields.aoeRadiusPx }
          : {}),
        ...(hitCount !== undefined ? { hitCount } : {}),
      };
    case 'pierce':
      return {
        form: 'forward',
        applyMode: 'progress',
        maxTargets: 'all',
        ...(typeof fields.range === 'number'
          ? { distancePx: fields.range }
          : {}),
      };
    case 'multiLock':
      return {
        form: 'single',
        applyMode: 'instant',
        ...(hitCount !== undefined ? { hitCount } : {}),
        refillSameTargetOnShortfall: true,
      };
    case 'chain':
    case 'scatter':
    case 'poolEach':
      return undefined;
    default: {
      const _exhaustive: never = shape;
      return _exhaustive;
    }
  }
}

/**
 * §5.7 effectRange → legacy targetShape（+ 関連フィールド）。
 * runtime が既存 targeting 経路で動くためのブリッジ。
 */
export function legacyTargetShapeFromEffectRange(
  spec: EffectRangeSpec,
): LegacyTargetingBridgeFields {
  const { form, applyMode, distancePx, hitCount } = spec;

  if (form === 'forward' && applyMode === 'progress') {
    return {
      targetShape: 'pierce',
      ...(typeof distancePx === 'number' ? { range: distancePx } : {}),
    };
  }

  if (form === 'area' && applyMode === 'instant') {
    return {
      targetShape: 'aoe',
      ...(typeof distancePx === 'number' ? { aoeRadiusPx: distancePx } : {}),
      ...(typeof hitCount === 'number' ? { hitCount } : {}),
    };
  }

  if (form === 'around') {
    return {
      targetShape: 'aoe',
      ...(typeof distancePx === 'number' ? { aoeRadiusPx: distancePx } : {}),
      ...(typeof hitCount === 'number' ? { hitCount } : {}),
    };
  }

  if (form === 'point') {
    if (typeof distancePx === 'number') {
      return {
        targetShape: 'aoe',
        aoeRadiusPx: distancePx,
        ...(typeof hitCount === 'number' ? { hitCount } : {}),
      };
    }
    return {
      targetShape: 'single',
      ...(typeof hitCount === 'number' ? { hitCount } : {}),
    };
  }

  if (
    form === 'single' &&
    applyMode === 'instant' &&
    typeof hitCount === 'number' &&
    hitCount >= 2
  ) {
    return { targetShape: 'multiLock', hitCount };
  }

  if (form === 'single') {
    return {
      targetShape: 'single',
      ...(typeof hitCount === 'number' ? { hitCount } : {}),
    };
  }

  if (applyMode === 'barrage') {
    return {
      targetShape: 'scatter',
      ...(typeof distancePx === 'number'
        ? { scatterRadiusPx: distancePx }
        : {}),
      ...(typeof hitCount === 'number' ? { scatterHitCount: hitCount } : {}),
    };
  }

  return { targetShape: 'single' };
}

function assignMissingLegacyFields(
  target: LegacyTargetingBridgeFields,
  legacy: LegacyTargetingBridgeFields,
): void {
  for (const key of Object.keys(legacy) as (keyof LegacyTargetingBridgeFields)[]) {
    if (key === 'targetShape' || key === 'effectRange') continue;
    if (target[key] === undefined && legacy[key] !== undefined) {
      (target as Record<string, unknown>)[key] = legacy[key];
    }
  }
}

/**
 * effectRange があればそれを正として targetShape を同期。
 * なければ targetShape から effectRange を埋める。どちらも無ければコピーのみ。
 */
export function normalizeSharedTargetingFields(
  fields: LegacyTargetingBridgeFields,
): LegacyTargetingBridgeFields {
  const copy: LegacyTargetingBridgeFields = { ...fields };

  if (copy.effectRange !== undefined) {
    const legacy = legacyTargetShapeFromEffectRange(copy.effectRange);
    if (legacy.targetShape !== undefined) {
      copy.targetShape = legacy.targetShape;
    }
    // hitCount / aoeRadiusPx / range は effectRange 由来を優先して埋める
    if (legacy.hitCount !== undefined) {
      copy.hitCount = legacy.hitCount;
    }
    if (legacy.aoeRadiusPx !== undefined) {
      copy.aoeRadiusPx = legacy.aoeRadiusPx;
    }
    if (legacy.range !== undefined && copy.range === undefined) {
      copy.range = legacy.range;
    }
    if (legacy.scatterRadiusPx !== undefined && copy.scatterRadiusPx === undefined) {
      copy.scatterRadiusPx = legacy.scatterRadiusPx;
    }
    if (
      legacy.scatterHitCount !== undefined &&
      copy.scatterHitCount === undefined
    ) {
      copy.scatterHitCount = legacy.scatterHitCount;
    }
    assignMissingLegacyFields(copy, legacy);
    return copy;
  }

  if (copy.targetShape !== undefined) {
    const effectRange = effectRangeFromLegacyTargetShape(copy.targetShape, copy);
    if (effectRange !== undefined) {
      copy.effectRange = effectRange;
    }
  }

  return copy;
}

/** 表示用短い要約（形式 · 適用方式 · 付随情報） */
export function summarizeEffectRangeSpec(spec: EffectRangeSpec): string {
  const bits = [
    EFFECT_RANGE_FORM_LABELS[spec.form],
    EFFECT_APPLY_MODE_LABELS[spec.applyMode],
  ];
  if (typeof spec.distancePx === 'number') {
    bits.push(`N=${spec.distancePx}`);
  }
  if (typeof spec.hitCount === 'number' && spec.hitCount > 1) {
    bits.push(`Hit=${spec.hitCount}`);
  }
  if (spec.maxTargets === 'all') {
    bits.push('全対象');
  } else if (typeof spec.maxTargets === 'number') {
    bits.push(`最大${spec.maxTargets}体`);
  }
  if (spec.refillSameTargetOnShortfall === true) {
    bits.push('不足時同一再命中');
  }
  return bits.join(' · ');
}
