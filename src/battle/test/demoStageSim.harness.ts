import { BattleEngine } from '../BattleEngine.ts';
import { loadGameData } from '../data/loadGameData.ts';
import { loadLevelCurves } from '../../progression/levelGrowth.ts';
import levelCurvesJson from '../../../data/levelCurves.json';
import { createDefaultSave } from '../../progression/victoryRewards.ts';
import { createMemberFromClass } from '../../progression/partyCompose.ts';
import stagesDemoJson from '../../../data/stages-demo.json';
import type { BattlePhase, GameData, SaveGameState, StageDef } from '../types.ts';
import { TICK_DT } from './battleFieldSpec.harness.ts';

export const DEMO_STAGE_IDS = [
  'demo_ch1_01',
  'demo_ch1_02',
  'demo_ch1_03',
  'demo_ch1_04',
  'demo_ch1_05',
  'demo_ch1_06',
  'demo_ch1_07',
] as const;

export type DemoStageId = (typeof DEMO_STAGE_IDS)[number];

export type DemoStageBattleOutcome = 'victory' | 'defeat' | 'timeout';

export interface DemoStageBattleResult {
  stageId: string;
  outcome: DemoStageBattleOutcome;
  phase: BattlePhase;
  tickCount: number;
  durationSec: number;
  survivingAllies: number;
  totalRemainingHp: number;
  totalMaxHp: number;
}

const levelCurves = loadLevelCurves(levelCurvesJson);

export function createDemoStageGameData(): GameData {
  const gameData = structuredClone(loadGameData());
  gameData.stages = stagesDemoJson as StageDef[];
  return gameData;
}

export function createStandardDemoSave(
  gameData: GameData,
  stageId: string,
): SaveGameState {
  const save = createDefaultSave(gameData, 'demo');
  save.stageProgress.currentStageId = stageId;
  return save;
}

export function runDemoStageBattle(
  stageId: string,
  options?: {
    gameData?: GameData;
    configureSave?: (save: SaveGameState, gameData: GameData) => void;
    maxTicks?: number;
  },
): DemoStageBattleResult {
  const gameData = options?.gameData ?? createDemoStageGameData();
  const save = createStandardDemoSave(gameData, stageId);
  options?.configureSave?.(save, gameData);

  const engine = new BattleEngine(
    gameData,
    levelCurves,
    () => save.party,
    () => save.stageProgress.currentStageId,
  );
  engine.startBattle();

  const maxTicks = options?.maxTicks ?? 120_000;
  let tickCount = 0;
  let phase: BattlePhase = 'running';

  for (; tickCount < maxTicks; tickCount++) {
    engine.tick(TICK_DT);
    phase = engine.getSnapshot().phase;
    if (phase === 'victory' || phase === 'defeat') break;
  }

  const snap = engine.getSnapshot();
  const allies = snap.allies.filter((a) => a.hp > 0);
  const totalRemainingHp = allies.reduce((sum, a) => sum + a.hp, 0);
  const totalMaxHp = snap.allies.reduce((sum, a) => sum + a.maxHp, 0);

  return {
    stageId,
    outcome:
      phase === 'victory'
        ? 'victory'
        : phase === 'defeat'
          ? 'defeat'
          : 'timeout',
    phase,
    tickCount: tickCount + 1,
    durationSec: (tickCount + 1) * TICK_DT,
    survivingAllies: allies.length,
    totalRemainingHp,
    totalMaxHp,
  };
}

/** Standard demo party with cleric replaced by assassin (no healer). */
export function configureNoHealerParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[2] = createMemberFromClass('at_assassin', gameData);
}

/** Ranged-counter party: ranger slot uses sorcerer for AoE/ranged pressure. */
export function configureRangedCounterParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_sorcerer', gameData);
}

/** Universal party: guardian / swordsman / cleric / sorcerer (default ranger → sorcerer). */
export function configureUniversalParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_sorcerer', gameData);
}

/** Front row without a defender — fragile against pressure stages. */
export function configureNoGuardianParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[0] = createMemberFromClass('at_assassin', gameData);
}

/** Paladin replaces guardian for heavier sustain / mixed stages. */
export function configurePaladinTankParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[0] = createMemberFromClass('df_paladin', gameData);
}

/** Double melee — no back-line reach for ranged-heavy stages. */
export function configureDoubleMeleeParty(
  save: SaveGameState,
  gameData: GameData,
): void {
  save.party[3] = createMemberFromClass('at_swordsman', gameData);
}

export const MIN_DEMO_BATTLE_TICKS = 60;
export const MAX_DEMO_BATTLE_TICKS = 120_000;

/** Higher = better battle outcome for composition comparisons. */
export function demoStageOutcomeScore(result: DemoStageBattleResult): number {
  if (result.outcome === 'timeout') return -1;
  if (result.outcome === 'victory') return 1_000 + result.totalRemainingHp;
  return result.totalRemainingHp;
}
