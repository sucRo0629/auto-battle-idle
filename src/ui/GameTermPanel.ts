import "../styles/game-term-panel.css";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import {
  getGameTermEntry,
  type GameTermId,
  type GameTermLocale,
} from "./gameTermGlossary.ts";
import { getStatusIconImage } from "../render/StatusIconRegistry.ts";

export interface GameTermPanelOptions {
  locale: GameTermLocale;
  /** Scroll on this element closes the panel and clears history (e.g. skill-menu-body). */
  detailScrollRoot?: HTMLElement | null;
}

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

  private mounted = false;
  private isOpen = false;
  private currentTermId: GameTermId | null = null;
  private anchorButton: HTMLButtonElement | null = null;
  private history: GameTermId[] = [];

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (!this.isOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (target instanceof HTMLElement && target.closest(".game-term-link")) {
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
    this.host.appendChild(this.root);
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

  openFromTerm(termId: GameTermId, anchor: HTMLButtonElement): void {
    if (this.isOpen && this.currentTermId === termId) {
      this.close();
      return;
    }

    if (
      this.isOpen &&
      this.anchorButton &&
      this.anchorButton !== anchor
    ) {
      this.setAnchorExpanded(this.anchorButton, false);
    }

    this.history = [];
    this.currentTermId = termId;
    this.anchorButton = anchor;
    this.renderCurrentTerm();
    this.positionNearAnchor(anchor);
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
    this.setAnchorExpanded(this.anchorButton, false);
    this.anchorButton = null;
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
    const description = entry.description[this.locale];
    this.titleEl.textContent = title;
    this.titleEl.id = `${this.panelId}-title`;
    this.root.setAttribute("aria-labelledby", this.titleEl.id);

    if (entry.statusCategory) {
      const icon = getStatusIconImage(entry.statusCategory);
      if (icon) {
        this.iconEl.src = icon.src;
        this.iconEl.hidden = false;
      } else {
        this.iconEl.hidden = true;
      }
    } else {
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
    this.bodyEl.appendChild(
      annotateGameTerms(description, this.locale, (termId) => {
        this.navigateToTerm(termId);
      }, { panelId: this.panelId }),
    );
  }

  private positionNearAnchor(anchor: HTMLElement): void {
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

  private setAnchorExpanded(
    anchor: HTMLButtonElement | null,
    expanded: boolean,
  ): void {
    if (!anchor) return;
    anchor.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}
