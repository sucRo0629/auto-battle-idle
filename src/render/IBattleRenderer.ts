export type AnimState = 'idle' | 'attack' | 'heal' | 'hurt' | 'death';

import type { Role } from '../battle/types.ts';
import type { AttackEffectKind } from './AttackEffect.ts';

export interface CombatantLayout {
  id: string;
  x: number;
  y: number;
  spriteKey: string;
  hp: number;
  maxHp: number;
  role?: Role;
  isEnemy: boolean;
  isAlive: boolean;
  anim: AnimState;
  animFrame: number;
}

export interface IBattleRenderer {
  mount(container: HTMLElement): void;
  setCombatants(layout: CombatantLayout[]): void;
  setWorldOffset(offsetX: number): void;
  playAnim(combatantId: string, state: AnimState): void;
  playAttackEffect(
    actorId: string,
    targetId: string,
    kind: AttackEffectKind,
    isHeal?: boolean
  ): void;
  showDamagePopup(targetId: string, amount: number): void;
  showHealPopup(targetId: string, amount: number): void;
  tick(deltaMs: number): void;
  destroy(): void;
}
