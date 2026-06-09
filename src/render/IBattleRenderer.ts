export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death' | 'dash';

import type { Role, StatusEffect, SkillVfxDef } from '../battle/types.ts';

export interface CombatantLayout {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  hp: number;
  maxHp: number;
  barrierHp: number;
  atk: number;
  def: number;
  reg: number;
  role?: Role;
  isEnemy: boolean;
  isAlive: boolean;
  anim: AnimState;
  animFrame: number;
  statusEffects: StatusEffect[];
}

export interface IBattleRenderer {
  mount(container: HTMLElement): void;
  setCombatants(layout: CombatantLayout[]): void;
  setWorldOffset(offsetX: number): void;
  playAnim(combatantId: string, state: AnimState): void;
  playAttackEffect(
    actorId: string,
    targetId: string,
    vfx: SkillVfxDef,
  ): void;
  showDamagePopup(targetId: string, amount: number): void;
  showHealPopup(targetId: string, amount: number): void;
  showEvadePopup(targetId: string): void;
  showBlockPopup(targetId: string): void;
  showBuffGlow(targetId: string): void;
  tick(deltaMs: number): void;
  destroy(): void;
}
