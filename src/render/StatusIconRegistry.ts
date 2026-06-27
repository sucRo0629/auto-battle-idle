import atkIconUrl from "../assets/status-icons/atk.png";
import defIconUrl from "../assets/status-icons/def.png";
import regIconUrl from "../assets/status-icons/reg.png";
import attackSpeedIconUrl from "../assets/status-icons/attackSpeed.png";
import damageReductionIconUrl from "../assets/status-icons/damageReduction.png";
import damageIncreaseIconUrl from "../assets/status-icons/damageIncrease.png";
import hotIconUrl from "../assets/status-icons/hot.png";
import dotIconUrl from "../assets/status-icons/dot.png";
import bleedIconUrl from "../assets/status-icons/bleed.png";
import poisonIconUrl from "../assets/status-icons/poison.png";
import blockIconUrl from "../assets/status-icons/block.png";
import stunIconUrl from "../assets/status-icons/stun.png";
import moveLockIconUrl from "../assets/status-icons/moveLock.png";
import evasionIconUrl from "../assets/status-icons/evasion.png";
import counterIconUrl from "../assets/status-icons/counter.png";
import damageDelayIconUrl from "../assets/status-icons/damageDelay.png";
import herbalPotencyIconUrl from "../assets/status-icons/herbalPotency.png";
import basicAttackTransformIconUrl from "../assets/status-icons/basicAttackTransform.png";
import blockResonanceIconUrl from "../assets/status-icons/blockResonance.png";
import blockResonanceStanceIconUrl from "../assets/status-icons/blockResonanceStance.png";
import healReservationIconUrl from "../assets/status-icons/healReservation.png";
import wardBarrierIconUrl from "../assets/status-icons/wardBarrier.png";
import markIconUrl from "../assets/status-icons/mark.png";
import arenaMarkIconUrl from "../assets/status-icons/arenaMark.png";
import invulnerableIconUrl from "../assets/status-icons/invulnerable.png";
import lastStandGutsIconUrl from "../assets/status-icons/lastStandGuts.png";
import arenaDominanceIconUrl from "../assets/status-icons/arenaDominance.png";
import duelistPrideIconUrl from "../assets/status-icons/duelistPride.png";
import seedFlameIconUrl from "../assets/status-icons/seedFlame.png";
import blazingFlameIconUrl from "../assets/status-icons/blazingFlame.png";
import ballistaMarkIconUrl from "../assets/status-icons/ballistaMark.png";
import allyAttackFollowUpIconUrl from "../assets/status-icons/allyAttackFollowUp.png";
import nextOutgoingDamageIconUrl from "../assets/status-icons/nextOutgoingDamage.png";
import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";

export type { StatusDisplayCategory };

const ICON_URLS: Partial<Record<StatusDisplayCategory, string>> = {
  atk: atkIconUrl,
  def: defIconUrl,
  reg: regIconUrl,
  attackSpeed: attackSpeedIconUrl,
  damageReduction: damageReductionIconUrl,
  damageIncrease: damageIncreaseIconUrl,
  hot: hotIconUrl,
  healReservation: healReservationIconUrl,
  dot: dotIconUrl,
  bleed: bleedIconUrl,
  poison: poisonIconUrl,
  block: blockIconUrl,
  stun: stunIconUrl,
  moveLock: moveLockIconUrl,
  evasion: evasionIconUrl,
  counter: counterIconUrl,
  damageDelay: damageDelayIconUrl,
  herbalPotency: herbalPotencyIconUrl,
  blockResonance: blockResonanceIconUrl,
  blockResonanceStance: blockResonanceStanceIconUrl,
  basicAttackTransform: basicAttackTransformIconUrl,
  invulnerable: invulnerableIconUrl,
  lastStandGuts: lastStandGutsIconUrl,
  arenaDominance: arenaDominanceIconUrl,
  duelistPride: duelistPrideIconUrl,
  wardBarrier: wardBarrierIconUrl,
  mark: markIconUrl,
  arenaMark: arenaMarkIconUrl,
  seedFlame: seedFlameIconUrl,
  blazingFlame: blazingFlameIconUrl,
  ballistaMark: ballistaMarkIconUrl,
  allyAttackFollowUp: allyAttackFollowUpIconUrl,
  nextOutgoingDamage: nextOutgoingDamageIconUrl,
};

const iconImages = new Map<StatusDisplayCategory, HTMLImageElement>();
let preloadPromise: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load status icon: ${url}`));
    img.src = url;
  });
}

export function preloadStatusIcons(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = Promise.all(
      Object.entries(ICON_URLS).map(async ([key, url]) => {
        iconImages.set(key as StatusDisplayCategory, await loadImage(url));
      })
    ).then(() => {});
  }
  return preloadPromise;
}

export function getStatusIconImage(
  category: StatusDisplayCategory
): HTMLImageElement | undefined {
  return iconImages.get(category);
}

void preloadStatusIcons();
