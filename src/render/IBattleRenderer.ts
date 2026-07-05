export type AnimState = 'idle' | 'attack' | 'move' | 'death';

import type { DotFlavor, Role, StatusEffect, SkillVfxDef } from '../battle/types.ts';
import type { SkillAnimPlaybackOptions } from './skillAnimPlayback.ts';
import type { VfxPlaybackKind } from './vfxAnimPlayback.ts';

export interface PlaySkillVfxOptions extends SkillAnimPlaybackOptions {
  skillId: string;
  effectIndex: number;
  kind?: VfxPlaybackKind;
}

export interface CombatantLayout {
  id: string;
  x: number;
  /** 足元アンカー（地面ライン）。battleX に対応 */
  y: number;
  /** 擬似奥行き: スプライトを上へずらす px（スケール変更なし） */
  depthOffsetY?: number;
  spriteKey: string;
  hp: number;
  maxHp: number;
  baseMaxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  res: number;
  role?: Role;
  rangePx?: number;
  isEnemy: boolean;
  isAlive: boolean;
  /** 戦闘向き: 味方 +1 / −1（背後攻撃時反転）。敵は描画側で −1 固定 */
  facingSign?: number;
  anim: AnimState;
  animFrame: number;
  attackSheetKey: string;
  skillAnimKey: string | null;
  skillAnimFrame: number;
  statusEffects: StatusEffect[];
}

export interface IBattleRenderer {
  mount(container: HTMLElement): void;
  setCombatants(layout: CombatantLayout[]): void;
  setWorldOffset(offsetX: number): void;
  playAnim(combatantId: string, state: AnimState, spriteKey?: string): void;
  playSkillAnim(
    combatantId: string,
    skillAnimKey: string,
    playback?: SkillAnimPlaybackOptions,
  ): void;
  playSkillVfx(
    instanceId: string,
    actorId: string,
    targetId: string,
    vfx: SkillVfxDef,
    options: PlaySkillVfxOptions,
  ): void;
  showDamagePopup(
    targetId: string,
    amount: number,
    variant?: 'damage' | 'dot',
    dotFlavor?: DotFlavor,
  ): void;
  showHealPopup(targetId: string, amount: number): void;
  showEvadePopup(targetId: string): void;
  showBlockPopup(targetId: string): void;
  showCounterPopup(targetId: string): void;
  showInvulnerablePopup(targetId: string): void;
  showLastStandRecoveryPopup(targetId: string): void;
  showBuffGlow(targetId: string): void;
  tick(deltaMs: number): void;
  destroy(): void;
}
