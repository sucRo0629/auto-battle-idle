import atkIconUrl from "../assets/status-icons/atk.png";
import hpIconUrl from "../assets/status-icons/hp.png";
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
import pentagonBuffUrl from "../assets/status-icons/pentagon-buff.png";
import pentagonDebuffUrl from "../assets/status-icons/pentagon-debuff.png";
import pentagonPassiveBuffUrl from "../assets/status-icons/pentagon-passive-buff.png";
import pentagonPassiveDebuffUrl from "../assets/status-icons/pentagon-passive-debuff.png";
import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";

export type { StatusDisplayCategory };

const ICON_URLS: Partial<Record<StatusDisplayCategory, string>> = {
  hp: hpIconUrl,
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

export type StatusBadgePentagonSlot =
  | "buff"
  | "debuff"
  | "passiveBuff"
  | "passiveDebuff";

export const STATUS_BADGE_PENTAGON_FILES: Record<StatusBadgePentagonSlot, string> = {
  buff: "pentagon-buff.png",
  debuff: "pentagon-debuff.png",
  passiveBuff: "pentagon-passive-buff.png",
  passiveDebuff: "pentagon-passive-debuff.png",
};

const PENTAGON_URLS: Record<StatusBadgePentagonSlot, string> = {
  buff: pentagonBuffUrl,
  debuff: pentagonDebuffUrl,
  passiveBuff: pentagonPassiveBuffUrl,
  passiveDebuff: pentagonPassiveDebuffUrl,
};

const iconImages = new Map<StatusDisplayCategory, HTMLImageElement>();
const pentagonImages = new Map<StatusBadgePentagonSlot, HTMLImageElement>();
let preloadPromise: Promise<void> | null = null;
const readyListeners = new Set<() => void>();

function notifyStatusIconsReady(): void {
  for (const listener of readyListeners) {
    listener();
  }
}

export function onStatusIconsReady(listener: () => void): () => void {
  readyListeners.add(listener);
  if (preloadPromise) {
    void preloadPromise.then(() => listener());
  }
  return () => readyListeners.delete(listener);
}

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
    preloadPromise = Promise.all([
      ...Object.entries(ICON_URLS).map(async ([key, url]) => {
        iconImages.set(key as StatusDisplayCategory, await loadImage(url));
      }),
      ...Object.entries(PENTAGON_URLS).map(async ([key, url]) => {
        pentagonImages.set(key as StatusBadgePentagonSlot, await loadImage(url));
      }),
    ]).then(() => {
      notifyStatusIconsReady();
    });
  }
  return preloadPromise;
}

export function getStatusIconUrl(
  category: StatusDisplayCategory,
): string | undefined {
  return ICON_URLS[category];
}

export function getStatusIconImage(
  category: StatusDisplayCategory
): HTMLImageElement | undefined {
  return iconImages.get(category);
}

export function getStatusBadgePentagonImage(
  kind: "buff" | "debuff",
  isPassive: boolean,
): HTMLImageElement | undefined {
  const slot: StatusBadgePentagonSlot = isPassive
    ? kind === "buff"
      ? "passiveBuff"
      : "passiveDebuff"
    : kind === "buff"
      ? "buff"
      : "debuff";
  return pentagonImages.get(slot);
}

export function getStatusBadgePentagonImageBySlot(
  slot: StatusBadgePentagonSlot,
): HTMLImageElement | undefined {
  return pentagonImages.get(slot);
}

void preloadStatusIcons();
