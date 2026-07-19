/**
 * @vitest-environment happy-dom
 *
 * R12l 作業単位2 — Player 表示成立確認。
 *
 * - catalog API / 単独 DOM 生成は「補助」扱い（Player production 経路の代替にしない）
 * - GameSession → WavePrep 到達 → 対象兵科スロットの候補 DOM までを production 経路とする
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tryLoadGameData } from '../battle/data/loadGameData.ts';
import { reachAwaitingNextWave } from '../battle/test/battleFieldSpec.harness.ts';
import type { BattleEngine } from '../battle/BattleEngine.ts';
import { collectHudStatusEffectBadgeDisplays } from '../battle/statusEffectDisplay.ts';
import { quantizeBadgeOverlayStep } from '../render/statusBadgeRenderer.ts';
import { hasStatusIcon } from '../render/StatusIconRegistry.ts';
import { setDebugLoopStageId, setDebugLoopWaveIndex } from '../dev/debugLoopStage.ts';
import { setVerifyModeEnabled } from '../dev/verifyMode.ts';
import { createMemberFromClass } from '../progression/partyCompose.ts';
import {
  resolveStatusBadgeGameTermId,
  resolveGameTermIdForStatusCategory,
  getGameTermEntry,
  GAME_TERM_ENTRIES,
} from '../ui/gameTermGlossary.ts';
import { segmentTextByGameTerms } from '../ui/annotateGameTerms.ts';
import {
  buildOperationPassivePrepViews,
  createOperationPassivePrepSection,
} from '../ui/operationPassivePrepDisplay.ts';
import { resolveOperationPassiveAcquireCost } from './operationPassiveAcquireCost.ts';
import { getOperationPassiveCandidatesForClass } from './operationPassiveCatalogCore.ts';
import { GameSession } from './GameSession.ts';
import type { ClassId, GameData } from '../battle/types.ts';

const R12L_CLASSES = [
  'df_guardian',
  'at_swordsman',
  'at_sorcerer',
  'sp_cleric',
] as const satisfies readonly ClassId[];

const EXPECTED_NAMES: Record<(typeof R12L_CLASSES)[number], readonly string[]> = {
  df_guardian: [
    'ブロック率増加',
    '戦線維持',
    '防御力増加',
    '城塞の構え',
    '不撓の誓い',
  ],
  at_swordsman: [
    '攻撃間隔短縮',
    '物理ダメージ増加',
    '防御力無視率増加',
    '穿甲の一撃',
    '剛剣の冴え',
  ],
  at_sorcerer: [
    '攻撃間隔短縮',
    '魔法ダメージ増加',
    '魔法耐性無視率増加',
    '爆炎',
    '火勢',
  ],
  sp_cleric: [
    '回復量増加',
    '回復間隔短縮',
    '生気の循環',
    '巡る生命',
    '生命調律',
  ],
};

const LEGACY_OP_IDS = [
  'df_guardian_op_brace',
  'df_guardian_op_wall_aura',
  'df_guardian_op_last_stand',
  'at_swordsman_op_armor_break',
  'at_swordsman_op_high_def_focus',
  'at_swordsman_op_finish_cut',
  'at_sorcerer_op_arc_bolt',
  'at_sorcerer_op_ember_dot',
  'at_sorcerer_op_resonant_hit',
  'sp_cleric_op_triage',
  'sp_cleric_op_excess_ward',
  'sp_cleric_op_heal_reserve',
] as const;

function mockCanvas2d(): void {
  const ctx = {
    imageSmoothingEnabled: true,
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
    })),
    putImageData: vi.fn(),
    canvas: { width: 800, height: 600 },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
}

function createSession(): GameSession {
  const loaded = tryLoadGameData();
  if (!loaded.ok) throw new Error(loaded.error);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return new GameSession(loaded.data, container);
}

function getEngine(session: GameSession): BattleEngine {
  return (session as unknown as { engine: BattleEngine }).engine;
}

function refreshWavePrepHost(session: GameSession): void {
  (
    session as unknown as {
      wavePrepScreenHost: { show: () => void };
    }
  ).wavePrepScreenHost.show();
}

function unlockR12lClasses(session: GameSession): void {
  const save = (
    session as unknown as { save: { unlockedClassIds: ClassId[] } }
  ).save;
  const unlocked = new Set(save.unlockedClassIds);
  for (const classId of R12L_CLASSES) {
    unlocked.add(classId);
  }
  save.unlockedClassIds = [...unlocked];
}

/** 補助: catalog / 単独 DOM（Player production 経路の代替ではない） */
describe('R12l Player display (catalog / DOM helpers — not production proof)', () => {
  let gameData: GameData;

  beforeEach(() => {
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    gameData = loaded.data;
  });

  it('catalog: 4兵科それぞれ候補5件・cost1×3 / cost10×2・確定日本語名・旧op非表示', () => {
    const catalog = gameData.operationPassiveCatalog;
    expect(catalog.sameClassStackStep).toBe(0);

    for (const classId of R12L_CLASSES) {
      const candidateIds = getOperationPassiveCandidatesForClass(
        catalog,
        classId,
      );
      expect(candidateIds).toHaveLength(5);

      const costs = candidateIds.map((id) =>
        resolveOperationPassiveAcquireCost(catalog, id, 0),
      );
      expect(costs.filter((c) => c === 1)).toHaveLength(3);
      expect(costs.filter((c) => c === 10)).toHaveLength(2);

      const costAfterTwo = resolveOperationPassiveAcquireCost(
        catalog,
        candidateIds[0]!,
        2,
      );
      expect(costAfterTwo).toBe(costs[0]);

      const views = buildOperationPassivePrepViews({
        candidateIds,
        acquiredIds: [],
        getAcquireCost: (id) =>
          resolveOperationPassiveAcquireCost(catalog, id, 0),
        currentResource: 99,
        getPassiveDef: (id) => gameData.skillRegistry.passives[id],
      });

      expect(views.candidates.map((c) => c.displayName)).toEqual(
        EXPECTED_NAMES[classId],
      );

      for (const legacyId of LEGACY_OP_IDS) {
        expect(candidateIds).not.toContain(legacyId);
      }

      const host = document.createElement('div');
      document.body.appendChild(host);
      host.appendChild(
        createOperationPassivePrepSection({
          views,
          onAcquire: () => {},
        }),
      );
      const rows = Array.from(
        host.querySelectorAll(
          '.operation-passive-prep__candidates .operation-passive-prep__candidate',
        ),
      );
      expect(rows).toHaveLength(5);
      expect(rows.map((el) => (el as HTMLElement).dataset.passiveId)).toEqual(
        candidateIds,
      );
      host.remove();
    }
  });

  it('catalog: 取得済みは再取得不可として表示される', () => {
    const catalog = gameData.operationPassiveCatalog;
    const candidateIds = getOperationPassiveCandidatesForClass(
      catalog,
      'at_sorcerer',
    );
    const acquiredId = candidateIds[0]!;
    const views = buildOperationPassivePrepViews({
      candidateIds,
      acquiredIds: [acquiredId],
      getAcquireCost: (id) =>
        resolveOperationPassiveAcquireCost(catalog, id, 1),
      currentResource: 99,
      getPassiveDef: (id) => gameData.skillRegistry.passives[id],
    });
    expect(views.acquired).toHaveLength(1);
    expect(views.candidates).toHaveLength(4);
    expect(views.candidates.every((c) => c.passiveId !== acquiredId)).toBe(
      true,
    );
  });
});

describe('R12l Player display (emberIgnition HUD badge helper)', () => {
  it('種火 stack badge は emberIgnition 用語へ紐づき、無期限でも NaN / 減衰ゲージにならない', () => {
    expect(hasStatusIcon('emberIgnition')).toBe(true);
    expect(resolveGameTermIdForStatusCategory('emberIgnition')).toBe(
      'emberIgnition',
    );

    const badges = collectHudStatusEffectBadgeDisplays(
      [
        {
          id: 'ember_ignition_target',
          kind: 'debuff',
          overlay: 'emberIgnition',
          multiplier: 1,
          durationSec: Number.POSITIVE_INFINITY,
          remainingSec: Number.POSITIVE_INFINITY,
          stacks: 3,
          displayName: '種火',
        },
      ],
      { baseMaxHp: 100, atk: 10, def: 10, res: 0 },
    );

    expect(badges).toHaveLength(1);
    expect(badges[0]?.category).toBe('emberIgnition');
    expect(badges[0]?.stackCount).toBe(3);
    expect(badges[0]?.remainingRatio).toBe(1);
    expect(Number.isNaN(badges[0]!.remainingRatio)).toBe(false);
    expect(quantizeBadgeOverlayStep(badges[0]!.remainingRatio)).toBe(0);
    expect(resolveStatusBadgeGameTermId(badges[0]!)).toBe('emberIgnition');
  });
});

describe('R12l Player production path (GameSession WavePrep)', () => {
  let session: GameSession | null = null;
  let gameData: GameData;

  beforeEach(() => {
    localStorage.clear();
    mockCanvas2d();
    const loaded = tryLoadGameData();
    if (!loaded.ok) throw new Error(loaded.error);
    gameData = loaded.data;
    setVerifyModeEnabled(true);
    setDebugLoopStageId('1');
    setDebugLoopWaveIndex(null);
    session = createSession();
    session.start();
  });

  afterEach(() => {
    session?.destroy();
    session = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    setVerifyModeEnabled(false);
    setDebugLoopStageId(null);
    setDebugLoopWaveIndex(null);
  });

  it('WavePrep 到達後、R12l 4兵科スロットの候補 DOM が catalog どおり表示される', () => {
    expect(session).not.toBeNull();
    const s = session!;

    // production: 中間 Wave クリア → WavePrep 画面
    reachAwaitingNextWave(getEngine(s));
    expect(s.isAwaitingNextWave()).toBe(true);
    expect(s.getCurrentScreen()).toBe('wavePrep');
    expect(s.isWavePrepOpen()).toBe(true);
    expect(s.getOperationState()?.isWavePrepEditable).toBe(true);

    unlockR12lClasses(s);

    // 同一作戦で 4兵科を編成（default party の at_ranger を at_sorcerer へ）
    const assignments: Array<{ slot: number; classId: (typeof R12L_CLASSES)[number] }> = [
      { slot: 0, classId: 'df_guardian' },
      { slot: 1, classId: 'at_swordsman' },
      { slot: 2, classId: 'at_sorcerer' },
      { slot: 3, classId: 'sp_cleric' },
    ];
    for (const { slot, classId } of assignments) {
      const result = s.tryUpdateOperationPartySlot(
        slot,
        createMemberFromClass(classId, gameData),
      );
      expect(result.ok).toBe(true);
      expect(s.getOperationParty()?.[slot]?.classId).toBe(classId);
    }

    // WavePrep UI を再描画（slot 変更後の production 表示経路）
    refreshWavePrepHost(s);

    const slotRows = Array.from(
      document.querySelectorAll('.wave-prep-screen__slot'),
    );
    expect(slotRows.length).toBeGreaterThanOrEqual(4);

    let inspectedR12lSlots = 0;
    for (const { slot, classId } of assignments) {
      const row = slotRows[slot];
      expect(row).toBeTruthy();

      const expectedIds = getOperationPassiveCandidatesForClass(
        gameData.operationPassiveCatalog,
        classId,
      );
      expect(expectedIds).toHaveLength(5);

      // Session API（WavePrepHost が読むのと同じ経路）
      expect(s.getOperationPassiveCandidates(slot)).toEqual(expectedIds);

      const cards = Array.from(
        row!.querySelectorAll(
          '.operation-passive-prep__candidates .operation-passive-prep__candidate',
        ),
      );
      expect(cards.length).toBe(5);
      expect(cards.map((el) => (el as HTMLElement).dataset.passiveId)).toEqual(
        expectedIds,
      );
      expect(
        cards.map(
          (el) =>
            el.querySelector('.operation-passive-prep__name')?.textContent ?? '',
        ),
      ).toEqual(EXPECTED_NAMES[classId]);

      for (const legacyId of LEGACY_OP_IDS) {
        expect(expectedIds).not.toContain(legacyId);
        expect(
          row!.querySelector(
            `.operation-passive-prep__candidate[data-passive-id="${legacyId}"]`,
          ),
        ).toBeNull();
      }

      inspectedR12lSlots += 1;
    }

    // 空振り禁止: 検査件数 0 で成功させない
    expect(inspectedR12lSlots).toBe(4);
  });
});

describe('R12l glossary: emberIgnition owns 種火', () => {
  it('registers emberIgnition with Japanese alias 種火 and new-spec description', () => {
    const ember = getGameTermEntry('emberIgnition');
    expect(ember).toBeDefined();
    expect(GAME_TERM_ENTRIES.some((entry) => entry.id === ('seedFlame' as never))).toBe(
      false,
    );
    expect(ember!.aliases?.ja).toContain('種火');
    expect(ember!.statusCategory).toBe('emberIgnition');
    expect(ember!.description?.ja).toContain('時間では消えない');
    expect(ember!.description?.ja).not.toContain('毎秒');
  });

  it('HUD badge category opens emberIgnition', () => {
    expect(resolveGameTermIdForStatusCategory('emberIgnition')).toBe(
      'emberIgnition',
    );
    const badge = {
      category: 'emberIgnition' as const,
      kind: 'debuff' as const,
      remainingRatio: 1,
      isPassive: false,
      stackCount: 2,
    };
    expect(resolveStatusBadgeGameTermId(badge)).toBe('emberIgnition');
  });

  it('plain-text alias「種火」resolves to emberIgnition (unique owner)', () => {
    const segments = segmentTextByGameTerms(
      '敵に攻撃スキルが1回命中するごとに「種火」を1スタックする',
      'ja',
    );
    expect(segments).toEqual([
      { kind: 'text', text: '敵に攻撃スキルが1回命中するごとに「' },
      { kind: 'term', termId: 'emberIgnition', matchedText: '種火' },
      { kind: 'text', text: '」を1スタックする' },
    ]);

    const jaAliasOwners = new Map<string, string[]>();
    for (const entry of GAME_TERM_ENTRIES) {
      for (const alias of entry.aliases?.ja ?? []) {
        const owners = jaAliasOwners.get(alias) ?? [];
        owners.push(entry.id);
        jaAliasOwners.set(alias, owners);
      }
    }
    expect(jaAliasOwners.get('種火')).toEqual(['emberIgnition']);
  });
});
