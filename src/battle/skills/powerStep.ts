export type PowerStepMode = 'multiply' | 'divide';

export interface PowerStepFields {
  stepMultiplier?: number;
  stepMode?: PowerStepMode;
}

/** hitIndex=0 は base そのまま。以降 step を累乗/累除 */
export function applyPowerStep(
  base: number,
  hitIndex: number,
  config?: PowerStepFields,
): number {
  if (hitIndex <= 0 || !config) return base;
  const step = config.stepMultiplier ?? 1;
  if (step === 1) return base;
  const mode = config.stepMode ?? 'multiply';
  if (mode === 'multiply') {
    return base * step ** hitIndex;
  }
  return base / step ** hitIndex;
}

export function pierceStepFields(
  effect: PowerStepFields & { piercePowerStepMultiplier?: number; piercePowerStepMode?: PowerStepMode },
): PowerStepFields | undefined {
  if (effect.piercePowerStepMultiplier === undefined && effect.piercePowerStepMode === undefined) {
    return undefined;
  }
  return {
    stepMultiplier: effect.piercePowerStepMultiplier,
    stepMode: effect.piercePowerStepMode,
  };
}

export function chainStepFields(
  effect: PowerStepFields & { chainPowerStepMultiplier?: number; chainPowerStepMode?: PowerStepMode },
): PowerStepFields | undefined {
  if (effect.chainPowerStepMultiplier === undefined && effect.chainPowerStepMode === undefined) {
    return undefined;
  }
  return {
    stepMultiplier: effect.chainPowerStepMultiplier,
    stepMode: effect.chainPowerStepMode,
  };
}
