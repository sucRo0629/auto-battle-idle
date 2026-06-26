import type {
  CombatantState,
  PassiveSkillDef,
  ResourceAmountSpec,
} from './types.ts';
import { getPassiveDefs } from './combatMath.ts';

export interface AllyBasicAttackDotProcConfig {
  passiveId: string;
  chance: number;
  durationSec: number;
  amount: ResourceAmountSpec;
  damageType: 'physical' | 'magic';
  dotFlavor?: 'poison' | 'bleed';
}

export function collectAllyBasicAttackDotProcs(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): AllyBasicAttackDotProcConfig[] {
  const configs: AllyBasicAttackDotProcConfig[] = [];
  for (const ally of allies) {
    if (!ally.isAlive) continue;
    for (const passive of getPassiveDefs(ally, passives)) {
      if (passive.effect !== 'allyBasicAttackDotProc') continue;
      const amount = passive.debuffDotAmount;
      if (!amount) continue;
      configs.push({
        passiveId: passive.id,
        chance: passive.chance ?? 0,
        durationSec: passive.debuffDotDurationSec ?? 5,
        amount,
        damageType: passive.debuffDotDamageType ?? 'magic',
        dotFlavor: passive.debuffDotFlavor ?? 'poison',
      });
    }
  }
  return configs;
}

export function rollAllyBasicAttackDotProc(
  configs: AllyBasicAttackDotProcConfig[],
  rand: () => number = Math.random,
): AllyBasicAttackDotProcConfig | null {
  for (const config of configs) {
    if (config.chance <= 0) continue;
    if (rand() < config.chance) return config;
  }
  return null;
}
