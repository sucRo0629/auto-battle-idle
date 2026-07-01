import "../styles/game-term-panel.css";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import { clampElementToMountBounds } from "./clampElementToMountBounds.ts";
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
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "false");

    this.backButton = document.createElement("button");
    this.backButton.type = "button";
    this.backButton.className = "game-term-panel-back";
    this.backButton.hidden = true;
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
    this.iconEl.hidden = true;

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

  openFromTerm(termId: GameTermId, anchor: HTMLElement): void {
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
    this.renderCurrentTerm();
    this.positionNearAnchor(anchor);
    if (this.frameMount) {
      this.frameMount.appendChild(this.root);
    }
    this.root.hidden = false;
    this.isOpen = true;
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
    if (!this.isOpen && this.root.hidden) {
      this.history = [];
      this.currentTermId = null;
      return;
    }
    this.setAnchorExpanded(this.anchor, false);
    this.anchor = null;
    this.history = [];
    this.currentTermId = null;
    this.root.hidden = true;
    this.isOpen = false;
    this.backButton.hidden = true;
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
      this.iconEl.hidden = false;
    } else {
      this.iconEl.removeAttribute("src");
      this.iconEl.hidden = true;
    }

    if (this.history.length > 0) {
      const previousId = this.history[this.history.length - 1];
      const previousTitle =
        previousId !== undefined
          ? getGameTermEntry(previousId)?.title[this.locale]
          : undefined;
      this.backButton.hidden = false;
      this.backButton.textContent = previousTitle
        ? `← ${previousTitle}`
        : "← 戻る";
    } else {
      this.backButton.hidden = true;
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

  private positionNearAnchor(anchor: HTMLElement): void {
    if (this.frameMount) {
      this.positionNearAnchorInFrame(anchor);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    this.root.style.visibility = "hidden";
    this.root.hidden = false;
    const panelRect = this.root.getBoundingClientRect();
    this.root.hidden = true;
    this.root.style.visibility = "";

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

  private positionNearAnchorInFrame(anchor: HTMLElement): void {
    const mount = this.frameMount;
    if (!mount) return;

    const margin = 8;
    const gap = HUD_LAYER_ANCHOR_GAP_PX;
    const frame = mount.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();

    this.root.style.visibility = "hidden";
    this.root.hidden = false;
    const panelRect = this.root.getBoundingClientRect();
    this.root.hidden = true;
    this.root.style.visibility = "";

    let top = rect.bottom - frame.top + gap;
    let left = rect.left - frame.left;

    const mountH = mount.clientHeight || frame.height;
    const mountW = mount.clientWidth || frame.width;

    if (left + panelRect.width > mountW - margin) {
      left = Math.max(margin, mountW - panelRect.width - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (top + panelRect.height > mountH - margin) {
      const above = rect.top - frame.top - gap - panelRect.height;
      if (above >= margin) {
        top = above;
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
