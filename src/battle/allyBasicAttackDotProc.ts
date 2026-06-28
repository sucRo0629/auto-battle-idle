import type {
  CombatantState,
  PassiveSkillDef,
  ResourceAmountSpec,
} from './types.ts';
import { getPassiveDefs } from './combatMath.ts';

export const POISON_WEAPON_OVERLAY = 'poisonWeapon' as const;

const POISON_WEAPON_AURA_ID_PREFIX = 'passive_poison_weapon_aura_';
const POISON_WEAPON_AURA_DURATION_SEC = 99999;

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

function stripPoisonWeaponAuras(allies: CombatantState[]): void {
  for (const unit of allies) {
    unit.statusEffects = unit.statusEffects.filter(
      (effect) => !effect.id.startsWith(POISON_WEAPON_AURA_ID_PREFIX),
    );
  }
}

/** 生存中の狩猟士 P2 持有者が味方全体へ poisonWeapon overlay を同期（HUD バッジ用） */
export function syncPoisonWeaponAuras(
  allies: CombatantState[],
  passives: Record<string, PassiveSkillDef>,
): void {
  stripPoisonWeaponAuras(allies);

  for (const source of allies) {
    if (!source.isAlive) continue;
    for (const passive of getPassiveDefs(source, passives)) {
      if (passive.effect !== 'allyBasicAttackDotProc') continue;
      if ((passive.chance ?? 0) <= 0) continue;

      for (const target of allies) {
        if (!target.isAlive) continue;
        target.statusEffects.push({
          id: `${POISON_WEAPON_AURA_ID_PREFIX}${source.id}_${passive.id}_${target.id}`,
          kind: 'buff',
          overlay: POISON_WEAPON_OVERLAY,
          sourceId: source.id,
          skillId: passive.id,
          multiplier: 1,
          durationSec: POISON_WEAPON_AURA_DURATION_SEC,
          remainingSec: POISON_WEAPON_AURA_DURATION_SEC,
          displayName: passive.name ?? '毒の武器',
        });
      }
    }
  }
}
