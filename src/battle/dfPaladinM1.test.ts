import { describe, expect, it, beforeEach } from 'vitest';
import levelCurvesJson from '../../data/levelCurves.json';
import { resolveDamage } from './combatMath.ts';
import { loadGameData } from './data/loadGameData.ts';
import { createAllyFromMember, resetEntityIdCounter } from './entities.ts';
import { loadLevelCurves } from '../progression/levelGrowth.ts';
import { initializeSkillCooldowns } from './skillTrigger.ts';
import type { CombatantState, SkillEffectDef } from './types.ts';
import {
  DF_PALADIN_M1_COMBAT_MODULE_ID,
  DF_PALADIN_M1_PROTECTION_OVERLAY,
  hasDfPaladinM1ProtectionFrom,
  isDfPaladinM1Selected,
  resolveDfPaladinM1RuntimeEffect,
  selectDfPaladinM1FrontlineTargets,
  syncDfPaladinM1FrontlineProtection,
} from './dfPaladinM1.ts';
import {
  DF_PALADIN_M2_COMBAT_MODULE_ID,
  clearDfPaladinM2RuntimeState,
  hasDfPaladinM2ProtectionFrom,
  resolveDfPaladinM2RuntimeParams,
  tryApplyDfPaladinM2Protection,
} from './dfPaladinM2.ts';
import { syncDfPaladinCombatModuleEffects } from './dfPaladinModules.ts';
import { mockCombatant } from './testFixtures.ts';

const gameData = loadGameData();
const levelCurves = loadLevelCurves(levelCurvesJson);
const m1Effect = resolveDfPaladinM1RuntimeEffect(gameData.combatModuleRegistry)!;
const m2Params = resolveDfPaladinM2RuntimeParams(gameData.combatModuleRegistry)!;

const damageEffect = {
  type: 'damage',
  target: { kind: 'distance', side: 'enemy', order: 'nearest' },
  damageType: 'physical',
  amount: { kind: 'flat', flatAmount: 100 },
} as SkillEffectDef;

function mockMember(classId: string) {
  return {
    classId,
    build: {
      learnedPassiveIds: [],
      learnedActiveIds: [],
      equippedActiveSlots: [],
    },
    progress: { level: 10, exp: 0 },
  };
}

function makePaladin(
  moduleId: string,
  partial: Partial<CombatantState> = {},
): CombatantState {
  const preset = gameData.classRegistry.df_paladin!;
  const paladin = createAllyFromMember(
    mockMember('df_paladin'),
    preset,
    levelCurves,
    gameData,
    moduleId,
  );
  const basicCd = paladin.cooldowns.find((cd) => cd.slotKind === 'basic');
  if (basicCd) basicCd.skillId = moduleId;
  initializeSkillCooldowns(paladin, gameData.skillRegistry.actives);
  return {
    ...paladin,
    id: partial.id ?? paladin.id,
    isEnemy: partial.isEnemy ?? false,
    battleX: partial.battleX ?? 100,
    formationRow: partial.formationRow ?? 'front',
    ...partial,
  };
}

describe('dfPaladinM1 CombatModule data/runtime (R12g-d2)', () => {
  beforeEach(() => {
    resetEntityIdCounter();
    clearDfPaladinM2RuntimeState();
  });

  it('parses M1 runtimeEffect from CombatModule data', () => {
    expect(m1Effect.kind).toBe('protectFrontlineAllies');
    expect(m1Effect.maxTargets).toBeGreaterThanOrEqual(1);
    expect(m1Effect.magicDamageTakenMultiplier).toBeGreaterThan(0);
    expect(m1Effect.magicDamageTakenMultiplier).toBeLessThanOrEqual(1);
  });

  it('selects M1 via module id', () => {
    expect(isDfPaladinM1Selected(makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID))).toBe(
      true,
    );
    expect(isDfPaladinM1Selected(makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID))).toBe(
      false,
    );
  });

  it('protects multiple frontline allies and excludes backline', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
      battleX: 120,
    });
    const frontA = mockCombatant({
      id: 'frontA',
      formationRow: 'front',
      battleX: 140,
    });
    const frontB = mockCombatant({
      id: 'frontB',
      formationRow: 'front',
      battleX: 130,
    });
    const back = mockCombatant({
      id: 'back',
      formationRow: 'back',
      battleX: 40,
    });
    const allies = [paladin, frontA, frontB, back];
    syncDfPaladinM1FrontlineProtection(
      allies,
      [],
      gameData.combatModuleRegistry,
    );

    expect(hasDfPaladinM1ProtectionFrom(paladin, 'paladin')).toBe(true);
    expect(hasDfPaladinM1ProtectionFrom(frontA, 'paladin')).toBe(true);
    expect(hasDfPaladinM1ProtectionFrom(frontB, 'paladin')).toBe(true);
    expect(hasDfPaladinM1ProtectionFrom(back, 'paladin')).toBe(false);
  });

  it('does not treat distance-only allies as frontline', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
      battleX: 100,
    });
    const nearBack = mockCombatant({
      id: 'nearBack',
      formationRow: 'back',
      battleX: 95,
    });
    const selected = selectDfPaladinM1FrontlineTargets(
      paladin,
      [paladin, nearBack],
      4,
    );
    expect(selected.map((u) => u.id)).toEqual(['paladin']);
  });

  it('reduces magic damage; physical follows optional all multiplier', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({
      id: 'ally',
      formationRow: 'front',
      battleX: 150,
      def: 0,
      res: 0,
    });
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    const attacker = mockCombatant({ id: 'atk', atk: 100 });
    const bare = mockCombatant({ id: 'bare', def: 0, res: 0 });
    const baselineMagic = resolveDamage(
      attacker,
      bare,
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    const protectedMagic = resolveDamage(
      attacker,
      ally,
      { ...damageEffect, damageType: 'magic' },
      {},
    );
    const expectedMagicMul =
      m1Effect.magicDamageTakenMultiplier *
      (m1Effect.allDamageTakenMultiplier ?? 1);
    expect(protectedMagic).toBe(
      Math.max(1, Math.floor(baselineMagic * expectedMagicMul)),
    );

    const baselinePhys = resolveDamage(
      attacker,
      bare,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    const protectedPhys = resolveDamage(
      attacker,
      ally,
      { ...damageEffect, damageType: 'physical' },
      {},
    );
    if (m1Effect.allDamageTakenMultiplier !== undefined) {
      expect(protectedPhys).toBe(
        Math.max(
          1,
          Math.floor(baselinePhys * m1Effect.allDamageTakenMultiplier),
        ),
      );
    } else {
      expect(protectedPhys).toBe(baselinePhys);
    }
  });

  it('does not heal or apply barrier', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
      hp: 50,
    });
    const ally = mockCombatant({
      id: 'ally',
      formationRow: 'front',
      hp: 40,
      maxHp: 100,
    });
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    expect(ally.hp).toBe(40);
    expect(ally.barrierHp).toBe(0);
    expect(ally.statusEffects.every((fx) => fx.overlay !== 'barrier')).toBe(
      true,
    );
  });

  it('does not stack duplicate M1 overlays from one source', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({ id: 'ally', formationRow: 'front' });
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    const overlays = ally.statusEffects.filter(
      (fx) =>
        fx.overlay === DF_PALADIN_M1_PROTECTION_OVERLAY &&
        fx.sourceId === 'paladin',
    );
    const magicCount = overlays.filter(
      (fx) => fx.damageTakenDamageTypes?.includes('magic'),
    ).length;
    expect(magicCount).toBe(1);
  });

  it('resynchronizes when frontline membership changes', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({
      id: 'ally',
      formationRow: 'front',
      battleX: 140,
    });
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(true);
    ally.formationRow = 'back';
    syncDfPaladinM1FrontlineProtection(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
    );
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(false);
  });

  it('applies symmetrically for enemy paladin M1', () => {
    const enemyPaladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'enemyPaladin',
      isEnemy: true,
      formationRow: 'front',
      battleX: 200,
    });
    const enemyFront = mockCombatant({
      id: 'enemyFront',
      isEnemy: true,
      formationRow: 'front',
      battleX: 180,
    });
    const enemyBack = mockCombatant({
      id: 'enemyBack',
      isEnemy: true,
      formationRow: 'back',
      battleX: 220,
    });
    syncDfPaladinM1FrontlineProtection(
      [],
      [enemyPaladin, enemyFront, enemyBack],
      gameData.combatModuleRegistry,
    );
    expect(hasDfPaladinM1ProtectionFrom(enemyFront, 'enemyPaladin')).toBe(true);
    expect(hasDfPaladinM1ProtectionFrom(enemyBack, 'enemyPaladin')).toBe(false);
  });

  it('does not apply M1 while M2 is selected', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({ id: 'ally', formationRow: 'front' });
    syncDfPaladinCombatModuleEffects(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
      undefined,
    );
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(false);
  });

  it('clears M1 immediately when switching to M2', () => {
    const paladin = makePaladin(DF_PALADIN_M1_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({ id: 'ally', formationRow: 'front' });
    syncDfPaladinCombatModuleEffects(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
      undefined,
    );
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(true);

    const basic = paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basic.skillId = DF_PALADIN_M2_COMBAT_MODULE_ID;
    syncDfPaladinCombatModuleEffects(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
      undefined,
    );
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(false);
  });

  it('clears M2 immediately when switching to M1', () => {
    const paladin = makePaladin(DF_PALADIN_M2_COMBAT_MODULE_ID, {
      id: 'paladin',
      formationRow: 'front',
    });
    const ally = mockCombatant({ id: 'ally', formationRow: 'back' });
    tryApplyDfPaladinM2Protection(paladin, ally, [paladin, ally], m2Params);
    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(true);

    const basic = paladin.cooldowns.find((cd) => cd.slotKind === 'basic')!;
    basic.skillId = DF_PALADIN_M1_COMBAT_MODULE_ID;
    syncDfPaladinCombatModuleEffects(
      [paladin, ally],
      [],
      gameData.combatModuleRegistry,
      undefined,
    );
    expect(hasDfPaladinM2ProtectionFrom(ally, 'paladin')).toBe(false);
    expect(hasDfPaladinM1ProtectionFrom(ally, 'paladin')).toBe(false);
    expect(hasDfPaladinM1ProtectionFrom(paladin, 'paladin')).toBe(true);
  });
});
