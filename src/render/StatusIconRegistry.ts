import atkIconUrl from "../assets/status-icons/atk.png";
import defIconUrl from "../assets/status-icons/def.png";
import regIconUrl from "../assets/status-icons/reg.png";
import damageReductionIconUrl from "../assets/status-icons/damageReduction.png";
import damageIncreaseIconUrl from "../assets/status-icons/damageIncrease.png";
import hotIconUrl from "../assets/status-icons/hot.png";
import dotIconUrl from "../assets/status-icons/dot.png";
import blockIconUrl from "../assets/status-icons/block.png";
import stunIconUrl from "../assets/status-icons/stun.png";
import arrowUpUrl from "../assets/status-icons/arrow_up.png";
import arrowDownUrl from "../assets/status-icons/arrow_down.png";
import type { StatusDisplayCategory } from "../battle/statusEffectDisplay.ts";

export type { StatusDisplayCategory };
export type StatusArrowKind = "up" | "down";

const ICON_URLS: Partial<Record<StatusDisplayCategory, string>> = {
  atk: atkIconUrl,
  def: defIconUrl,
  reg: regIconUrl,
  damageReduction: damageReductionIconUrl,
  damageIncrease: damageIncreaseIconUrl,
  hot: hotIconUrl,
  dot: dotIconUrl,
  block: blockIconUrl,
  stun: stunIconUrl,
};

const ARROW_URLS: Record<StatusArrowKind, string> = {
  up: arrowUpUrl,
  down: arrowDownUrl,
};

const iconImages = new Map<StatusDisplayCategory, HTMLImageElement>();
const arrowImages = new Map<StatusArrowKind, HTMLImageElement>();
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
    preloadPromise = Promise.all([
      ...Object.entries(ICON_URLS).map(async ([key, url]) => {
        iconImages.set(key as StatusDisplayCategory, await loadImage(url));
      }),
      ...Object.entries(ARROW_URLS).map(async ([key, url]) => {
        arrowImages.set(key as StatusArrowKind, await loadImage(url));
      }),
    ]).then(() => {});
  }
  return preloadPromise;
}

export function getStatusIconImage(
  category: StatusDisplayCategory
): HTMLImageElement | undefined {
  return iconImages.get(category);
}

export function getStatusArrowImage(
  kind: StatusArrowKind
): HTMLImageElement | undefined {
  return arrowImages.get(kind);
}

void preloadStatusIcons();
