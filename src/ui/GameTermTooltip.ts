import "../styles/game-term-tooltip.css";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import {
  resolveGameTermTitle,
  resolveGameTermTooltip,
  type GameTermId,
  type GameTermLocale,
} from "./gameTermGlossary.ts";

export interface GameTermTooltipContent {
  title: string;
  body: string;
}

export class GameTermTooltip {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private anchor: HTMLElement | null = null;
  private currentTermId: GameTermId | null = null;
  private locale: GameTermLocale = "ja";
  private history: GameTermId[] = [];
  private listenersAttached = false;

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (this.root.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (target instanceof HTMLElement && target.closest(".game-term-link")) {
      return;
    }
    this.hide();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => {
    if (this.root.hidden || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (this.history.length > 0) {
      this.currentTermId = this.history.pop() ?? null;
      if (this.currentTermId) {
        this.renderTermContent();
        this.reposition();
        return;
      }
    }
    this.hide();
  };

  constructor(private readonly mount: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "game-term-tooltip";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "false");

    this.titleEl = document.createElement("div");
    this.titleEl.className = "game-term-tooltip-title";

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "game-term-tooltip-body";

    this.root.append(this.titleEl, this.bodyEl);
    mount.appendChild(this.root);
    this.attachGlobalListeners();
  }

  private attachGlobalListeners(): void {
    if (this.listenersAttached) return;
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    document.addEventListener("keydown", this.onDocumentKeyDown, true);
    this.listenersAttached = true;
  }

  private detachGlobalListeners(): void {
    if (!this.listenersAttached) return;
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    document.removeEventListener("keydown", this.onDocumentKeyDown, true);
    this.listenersAttached = false;
  }

  openFromTerm(
    termId: GameTermId,
    anchor: HTMLElement,
    locale: GameTermLocale,
  ): void {
    if (
      !this.root.hidden &&
      this.anchor === anchor &&
      this.currentTermId === termId &&
      this.history.length === 0
    ) {
      this.hide();
      return;
    }

    this.currentTermId = termId;
    this.anchor = anchor;
    this.locale = locale;
    this.history = [];
    this.renderTermContent();
    this.root.hidden = false;
    this.reposition();
  }

  private navigateToTerm(termId: GameTermId): void {
    if (!this.currentTermId || termId === this.currentTermId) return;
    this.history.push(this.currentTermId);
    this.currentTermId = termId;
    this.renderTermContent();
    this.reposition();
  }

  private renderTermContent(): void {
    if (!this.currentTermId) return;
    const termId = this.currentTermId;
    const title = resolveGameTermTitle(termId, this.locale);
    const body = resolveGameTermTooltip(termId, this.locale);
    this.titleEl.textContent = title;
    this.bodyEl.replaceChildren();
    if (body.length > 0) {
      this.bodyEl.appendChild(
        annotateGameTerms(
          body,
          this.locale,
          (linkedTermId) => {
            this.navigateToTerm(linkedTermId);
          },
          { excludeTermIds: new Set([termId]) },
        ),
      );
    }
  }

  show(anchor: HTMLElement, content: GameTermTooltipContent): void {
    this.anchor = anchor;
    this.currentTermId = null;
    this.history = [];
    this.titleEl.textContent = content.title;
    this.bodyEl.textContent = content.body;
    this.root.hidden = false;
    this.reposition();
  }

  hide(): void {
    this.anchor = null;
    this.currentTermId = null;
    this.history = [];
    this.root.hidden = true;
    this.bodyEl.replaceChildren();
  }

  isVisible(): boolean {
    return !this.root.hidden;
  }

  reposition(): void {
    if (!this.anchor || this.root.hidden) return;

    const mountRect = this.mount.getBoundingClientRect();
    const anchorRect = this.anchor.getBoundingClientRect();
    const tooltipRect = this.root.getBoundingClientRect();

    let left =
      anchorRect.left - mountRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    let top = anchorRect.top - mountRect.top - tooltipRect.height - 6;

    const maxLeft = mountRect.width - tooltipRect.width - 8;
    left = Math.max(8, Math.min(left, maxLeft));

    if (top < 8) {
      top = anchorRect.bottom - mountRect.top + 6;
    }

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  /** Hover tooltip for static content (e.g. State Chip). */
  bind(
    hit: HTMLElement,
    resolveContent: () => GameTermTooltipContent | null,
  ): void {
    const show = () => {
      const content = resolveContent();
      if (!content || content.body.length === 0) return;
      this.show(hit, content);
    };
    const hide = () => {
      if (this.anchor === hit) this.hide();
    };

    hit.addEventListener("mouseenter", show);
    hit.addEventListener("mouseleave", hide);
    hit.addEventListener("focus", show);
    hit.addEventListener("blur", hide);
  }

  destroy(): void {
    this.detachGlobalListeners();
    this.hide();
    this.root.remove();
  }
}
