import type { BattleEventListener } from '../events.ts';
import {
  getPassiveDefs,
  resolveDamage,
  resolveHeal,
} from '../combatMath.ts';
import type {
  ActiveSkillDef,
  CombatantState,
  GameData,
  SkillCooldown,
  StatusEffect,
} from '../types.ts';
import { pickTarget, resolveTargetRule } from './targeting.ts';

export class SkillExecutor {
  constructor(
    private readonly gameData: GameData,
    private readonly emit: BattleEventListener,
  ) {}

  tryExecute(
    actor: CombatantState,
    cd: SkillCooldown,
    allies: CombatantState[],
    enemies: CombatantState[],
  ): void {
    if (!actor.isAlive || cd.remaining > 0) return;

    const skill = this.gameData.skillRegistry.actives[cd.skillId];
    if (!skill) return;

    const passives = getPassiveDefs(
      actor,
      this.gameData.skillRegistry.passives,
    );
    const targetRule = resolveTargetRule(passives, skill.targetRule);
    const target = pickTarget(targetRule, actor, allies, enemies);
    if (!target) return;

    this.applySkill(actor, target, skill, cd);
  }

  private applySkill(
    actor: CombatantState,
    target: CombatantState,
    skill: ActiveSkillDef,
    cd: SkillCooldown,
  ): void {
    cd.remaining = skill.interval;

    if (skill.effect === 'damage') {
      const amount = resolveDamage(
        actor,
        target,
        skill,
        this.gameData.skillRegistry.passives,
      );
      target.hp = Math.max(0, target.hp - amount);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'damage',
        amount,
        range: skill.range,
      });
      this.emit({ type: 'hurt', targetId: target.id });
      if (target.hp <= 0) {
        target.isAlive = false;
        this.emit({ type: 'death', targetId: target.id });
      }
      return;
    }

    if (skill.effect === 'heal') {
      const amount = resolveHeal(
        actor,
        skill,
        this.gameData.skillRegistry.passives,
      );
      target.hp = Math.min(target.maxHp, target.hp + amount);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: 'heal',
        amount,
        range: skill.range,
      });
      return;
    }

    if (skill.effect === 'buff' || skill.effect === 'debuff') {
      const isBuff = skill.effect === 'buff';
      const stat = isBuff ? skill.buffStat : skill.debuffStat;
      const multiplier = isBuff ? skill.buffMultiplier : skill.debuffMultiplier;
      const duration = isBuff
        ? skill.buffDurationSec
        : skill.debuffDurationSec;
      if (!stat || multiplier === undefined || duration === undefined) return;

      const effect: StatusEffect = {
        id: `${skill.id}_${Date.now()}`,
        kind: isBuff ? 'buff' : 'debuff',
        stat,
        multiplier,
        remainingSec: duration,
      };
      target.statusEffects.push(effect);
      this.emit({
        type: 'skill',
        actorId: actor.id,
        targetId: target.id,
        skillId: skill.id,
        skillName: skill.name,
        slotKind: cd.slotKind,
        effect: skill.effect,
        statusLabel: `${stat} x${multiplier}`,
        range: skill.range,
      });
    }
  }
}
