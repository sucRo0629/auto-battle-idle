import "../styles/game-term-panel.css";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import { clampElementToMountBounds } from "./clampElementToMountBounds.ts";
import {
  bindGameUiOverlayClosed,
  isGameUiOverlayOpen,
  setGameUiFragmentHidden,
  setGameUiOverlayOpen,
} from "./gameUiOverlay.ts";
import {
  getGameTermEntry,
  type GameTermId,
  type GameTermLocale,
} from "./gameTermGlossary.ts";
import { resolveGameTermStatusIconUrl } from "./gameTermGlossary.ts";

export interface GameTermPanelOptions {
  locale: GameTermLocale;
  /** Scroll on this element closes the panel and clears history (e.g. skill-menu-body). */
  detailScrollRoot?: HTMLElement | null;
  /** When set, panel uses absolute coords inside this layer (battle HUD tooltip layer). */
  frameMount?: HTMLElement | null;
}

export interface GameTermPanelPointer {
  clientX: number;
  clientY: number;
}

const HUD_LAYER_ANCHOR_GAP_PX = 12;

let panelCounter = 0;

export class GameTermPanel {
  private readonly panelId: string;
  private readonly root: HTMLElement;
  private readonly backButton: HTMLButtonElement;
  private readonly titleEl: HTMLElement;
  private readonly iconEl: HTMLImageElement;
  private readonly bodyEl: HTMLElement;
  private readonly locale: GameTermLocale;
  private readonly detailScrollRoot: HTMLElement | null;
  private readonly frameMount: HTMLElement | null;

  private mounted = false;
  private isOpen = false;
  private currentTermId: GameTermId | null = null;
  private anchor: HTMLElement | null = null;
  private pointerAnchor: GameTermPanelPointer | null = null;
  private history: GameTermId[] = [];

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (!this.isOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (target instanceof HTMLElement && target.closest(".game-term-link")) {
      return;
    }
    if (
      target instanceof HTMLElement &&
      target.closest(".party-hud-status-badge-hit--interactive")
    ) {
      return;
    }
    this.close();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => {
    if (!this.isOpen || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.handleEscape();
  };

  private readonly onDetailScroll = () => {
    if (this.isOpen) {
      this.close();
    }
  };

  constructor(
    private readonly host: HTMLElement,
    options: GameTermPanelOptions,
  ) {
    this.locale = options.locale;
    this.detailScrollRoot = options.detailScrollRoot ?? null;
    this.frameMount = options.frameMount ?? null;
    this.panelId = `game-term-panel-${++panelCounter}`;

    this.root = document.createElement("div");
    this.root.className = "game-term-panel";
    this.root.id = this.panelId;
    bindGameUiOverlayClosed(this.root);
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "false");

    this.backButton = document.createElement("button");
    this.backButton.type = "button";
    this.backButton.className = "game-term-panel-back";
    setGameUiFragmentHidden(this.backButton, true);
    this.backButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.popHistory();
    });

    const header = document.createElement("div");
    header.className = "game-term-panel-header";

    this.iconEl = document.createElement("img");
    this.iconEl.className = "game-term-panel-icon";
    this.iconEl.width = 24;
    this.iconEl.height = 24;
    this.iconEl.alt = "";
    setGameUiFragmentHidden(this.iconEl, true);

    this.titleEl = document.createElement("h3");
    this.titleEl.className = "game-term-panel-title";

    header.append(this.backButton, this.iconEl, this.titleEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "game-term-panel-body";

    this.root.append(header, this.bodyEl);
  }

  mount(): void {
    if (this.mounted) return;
    const mountParent = this.frameMount ?? this.host;
    mountParent.appendChild(this.root);
    if (this.frameMount) {
      this.root.classList.add("game-term-panel--hud-layer");
    }
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    document.addEventListener("keydown", this.onDocumentKeyDown, true);
    this.detailScrollRoot?.addEventListener("scroll", this.onDetailScroll, {
      passive: true,
    });
    this.mounted = true;
  }

  destroy(): void {
    if (!this.mounted) return;
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    document.removeEventListener("keydown", this.onDocumentKeyDown, true);
    this.detailScrollRoot?.removeEventListener("scroll", this.onDetailScroll);
    this.root.remove();
    this.mounted = false;
    this.close();
  }

  getPanelId(): string {
    return this.panelId;
  }

  openFromTerm(
    termId: GameTermId,
    anchor: HTMLElement,
    pointer?: GameTermPanelPointer,
  ): void {
    if (this.isOpen && this.currentTermId === termId) {
      this.close();
      return;
    }

    if (this.isOpen && this.anchor && this.anchor !== anchor) {
      this.setAnchorExpanded(this.anchor, false);
    }

    this.history = [];
    this.currentTermId = termId;
    this.anchor = anchor;
    this.pointerAnchor = pointer ?? null;
    this.renderCurrentTerm();
    if (this.frameMount) {
      this.frameMount.appendChild(this.root);
    }
    setGameUiOverlayOpen(this.root, true);
    this.isOpen = true;
    this.positionNearAnchor(anchor, pointer);
    this.setAnchorExpanded(anchor, true);
  }

  private navigateToTerm(termId: GameTermId): void {
    if (!this.currentTermId || termId === this.currentTermId) return;
    this.history.push(this.currentTermId);
    this.currentTermId = termId;
    this.renderCurrentTerm();
  }

  private popHistory(): void {
    if (this.history.length === 0) return;
    this.currentTermId = this.history.pop() ?? null;
    if (!this.currentTermId) {
      this.close();
      return;
    }
    this.renderCurrentTerm();
  }

  private handleEscape(): void {
    if (this.history.length > 0) {
      this.popHistory();
      return;
    }
    this.close();
  }

  close(): void {
    if (!this.isOpen && !isGameUiOverlayOpen(this.root)) {
      this.history = [];
      this.currentTermId = null;
      return;
    }
    this.setAnchorExpanded(this.anchor, false);
    this.anchor = null;
    this.pointerAnchor = null;
    this.history = [];
    this.currentTermId = null;
    setGameUiOverlayOpen(this.root, false);
    this.isOpen = false;
    setGameUiFragmentHidden(this.backButton, true);
    this.bodyEl.replaceChildren();
  }

  private renderCurrentTerm(): void {
    if (!this.currentTermId) return;
    const entry = getGameTermEntry(this.currentTermId);
    if (!entry) {
      this.close();
      return;
    }

    const title = entry.title[this.locale];
    const description = entry.description?.[this.locale];
    this.titleEl.textContent = title;
    this.titleEl.id = `${this.panelId}-title`;
    this.root.setAttribute("aria-labelledby", this.titleEl.id);

    const iconUrl = resolveGameTermStatusIconUrl(entry);
    if (iconUrl) {
      this.iconEl.src = iconUrl;
      setGameUiFragmentHidden(this.iconEl, false);
    } else {
      this.iconEl.removeAttribute("src");
      setGameUiFragmentHidden(this.iconEl, true);
    }

    if (this.history.length > 0) {
      const previousId = this.history[this.history.length - 1];
      const previousTitle =
        previousId !== undefined
          ? getGameTermEntry(previousId)?.title[this.locale]
          : undefined;
      setGameUiFragmentHidden(this.backButton, false);
      this.backButton.textContent = previousTitle
        ? `← ${previousTitle}`
        : "← 戻る";
    } else {
      setGameUiFragmentHidden(this.backButton, true);
    }

    this.bodyEl.replaceChildren();
    if (description) {
      this.bodyEl.appendChild(
        annotateGameTerms(description, this.locale, (termId) => {
          this.navigateToTerm(termId);
        }, {
          panelId: this.panelId,
          excludeTermIds: new Set([this.currentTermId]),
        }),
      );
    }
  }

  private measurePanelRect(): DOMRect {
    return this.root.getBoundingClientRect();
  }

  private positionNearAnchor(
    anchor: HTMLElement,
    pointer?: GameTermPanelPointer,
  ): void {
    const resolvedPointer = pointer ?? this.pointerAnchor ?? undefined;
    if (this.frameMount) {
      this.positionNearAnchorInFrame(anchor, resolvedPointer);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelRect = this.measurePanelRect();

    let top = rect.bottom + margin;
    let left = rect.left;

    if (left + panelRect.width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - panelRect.width - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (top + panelRect.height > viewportHeight - margin) {
      const above = rect.top - panelRect.height - margin;
      if (above >= margin) {
        top = above;
      }
    }

    this.root.style.top = `${top}px`;
    this.root.style.left = `${left}px`;
  }

  private positionNearAnchorInFrame(
    anchor: HTMLElement,
    pointer?: GameTermPanelPointer,
  ): void {
    const mount = this.frameMount;
    if (!mount) return;

    const margin = 8;
    const gap = HUD_LAYER_ANCHOR_GAP_PX;
    const frame = mount.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const localWidth = mount.clientWidth || mount.offsetWidth;
    const scale = localWidth > 0 ? frame.width / localWidth : 1;
    const safeScale = scale > 0 ? scale : 1;
    const panelRect = this.measurePanelRect();
    const panelWidth = panelRect.width / safeScale;
    const panelHeight = panelRect.height / safeScale;
    const pointerLeft = pointer
      ? (pointer.clientX - frame.left) / safeScale
      : null;
    const pointerTop = pointer
      ? (pointer.clientY - frame.top) / safeScale
      : null;
    const anchorLeft = (rect.left - frame.left) / safeScale;
    const anchorTop = (rect.top - frame.top) / safeScale;
    const anchorBottom = (rect.bottom - frame.top) / safeScale;

    let top = (pointerTop ?? anchorTop) - panelHeight - gap;
    let left = (pointerLeft ?? anchorLeft) + (pointer ? gap : 0);

    const mountH = mount.clientHeight || frame.height;
    const mountW = mount.clientWidth || frame.width;

    if (left + panelWidth > mountW - margin) {
      left = Math.max(margin, mountW - panelWidth - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (top < margin) {
      const below = (pointerTop ?? anchorBottom) + gap;
      if (below + panelHeight <= mountH - margin) {
        top = below;
      }
    }

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    clampElementToMountBounds(this.root, mount, { margin });
  }

  private setAnchorExpanded(
    anchor: HTMLElement | null,
    expanded: boolean,
  ): void {
    if (!anchor) return;
    anchor.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}
