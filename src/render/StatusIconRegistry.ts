import atkIconUrl from "../assets/status-icons/atk.png";
import defIconUrl from "../assets/status-icons/def.png";
import regIconUrl from "../assets/status-icons/reg.png";
import attackSpeedIconUrl from "../assets/status-icons/attackSpeed.png";
import damageReductionIconUrl from "../assets/status-icons/damageReduction.png";
import damageIncreaseIconUrl from "../assets/status-icons/damageIncrease.png";
import hotIconUrl from "../assets/status-icons/hot.png";
import dotIconUrl from "../assets/status-icons/dot.png";
import blockIconUrl from "../assets/status-icons/block.png";
import stunIconUrl from "../assets/status-icons/stun.png";
import evasionIconUrl from "../assets/status-icons/evasion.png";
import counterIconUrl from "../assets/status-icons/counter.png";
import damageDelayIconUrl from "../assets/status-icons/damageDelay.png";
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
  dot: dotIconUrl,
  block: blockIconUrl,
  stun: stunIconUrl,
  moveLock: stunIconUrl,
  evasion: evasionIconUrl,
  counter: counterIconUrl,
  damageDelay: damageDelayIconUrl,
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
