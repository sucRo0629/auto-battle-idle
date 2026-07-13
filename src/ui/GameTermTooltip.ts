import "../styles/game-term-tooltip.css";
import { annotateGameTerms } from "./annotateGameTerms.ts";
import {
  bindGameUiOverlayClosed,
  isGameUiOverlayOpen,
  setGameUiOverlayOpen,
} from "./gameUiOverlay.ts";
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

export interface GameTermTooltipPointer {
  clientX: number;
  clientY: number;
}

const TOOLTIP_POINTER_GAP_PX = 12;
const TOOLTIP_MOUNT_MARGIN_PX = 8;

export class GameTermTooltip {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private anchor: HTMLElement | null = null;
  private currentTermId: GameTermId | null = null;
  private locale: GameTermLocale = "ja";
  private history: GameTermId[] = [];
  private pointerAnchor: GameTermTooltipPointer | null = null;
  private listenersAttached = false;

  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    if (!isGameUiOverlayOpen(this.root)) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (target instanceof HTMLElement && target.closest(".game-term-link")) {
      return;
    }
    this.hide();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent) => {
    if (!isGameUiOverlayOpen(this.root) || event.key !== "Escape") return;
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
    bindGameUiOverlayClosed(this.root);
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
    pointer?: GameTermTooltipPointer,
  ): void {
    if (
      isGameUiOverlayOpen(this.root) &&
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
    this.pointerAnchor = pointer ?? null;
    this.renderTermContent();
    setGameUiOverlayOpen(this.root, true);
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

  show(
    anchor: HTMLElement,
    content: GameTermTooltipContent,
    pointer?: GameTermTooltipPointer,
  ): void {
    this.anchor = anchor;
    this.currentTermId = null;
    this.history = [];
    this.pointerAnchor = pointer ?? null;
    this.titleEl.textContent = content.title;
    this.bodyEl.textContent = content.body;
    setGameUiOverlayOpen(this.root, true);
    this.reposition();
  }

  hide(): void {
    this.anchor = null;
    this.currentTermId = null;
    this.history = [];
    this.pointerAnchor = null;
    setGameUiOverlayOpen(this.root, false);
    this.bodyEl.replaceChildren();
  }

  isVisible(): boolean {
    return isGameUiOverlayOpen(this.root);
  }

  reposition(): void {
    if (!this.anchor || !isGameUiOverlayOpen(this.root)) return;

    const mountRect = this.mount.getBoundingClientRect();
    const anchorRect = this.anchor.getBoundingClientRect();
    const tooltipRect = this.root.getBoundingClientRect();
    const localWidth = this.mount.clientWidth || this.mount.offsetWidth;
    const scale = localWidth > 0 ? mountRect.width / localWidth : 1;
    const safeScale = scale > 0 ? scale : 1;
    const mountWidth = localWidth || mountRect.width;
    const mountHeight =
      this.mount.clientHeight || this.mount.offsetHeight || mountRect.height;
    const tooltipWidth = tooltipRect.width / safeScale;
    const tooltipHeight = tooltipRect.height / safeScale;

    let left: number;
    let top: number;
    if (this.pointerAnchor) {
      const pointerX =
        (this.pointerAnchor.clientX - mountRect.left) / safeScale;
      const pointerY =
        (this.pointerAnchor.clientY - mountRect.top) / safeScale;
      left = pointerX + TOOLTIP_POINTER_GAP_PX;
      top = pointerY - tooltipHeight - TOOLTIP_POINTER_GAP_PX;
      if (top < TOOLTIP_MOUNT_MARGIN_PX) {
        top = pointerY + TOOLTIP_POINTER_GAP_PX;
      }
    } else {
      left =
        (anchorRect.left - mountRect.left + anchorRect.width / 2) / safeScale -
        tooltipWidth / 2;
      top =
        (anchorRect.top - mountRect.top) / safeScale - tooltipHeight - 6;
      if (top < TOOLTIP_MOUNT_MARGIN_PX) {
        top = (anchorRect.bottom - mountRect.top) / safeScale + 6;
      }
    }

    const maxLeft =
      mountWidth - tooltipWidth - TOOLTIP_MOUNT_MARGIN_PX;
    left = Math.max(
      TOOLTIP_MOUNT_MARGIN_PX,
      Math.min(left, maxLeft),
    );
    top = Math.max(TOOLTIP_MOUNT_MARGIN_PX, top);

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  /** Hover tooltip for static content (e.g. State Chip). */
  bind(
    hit: HTMLElement,
    resolveContent: () => GameTermTooltipContent | null,
  ): void {
    const show = (pointer?: GameTermTooltipPointer) => {
      const content = resolveContent();
      if (!content || content.body.length === 0) return;
      this.show(hit, content, pointer);
    };
    const hide = () => {
      if (this.anchor === hit) this.hide();
    };

    hit.addEventListener("mouseenter", (event) => {
      show({ clientX: event.clientX, clientY: event.clientY });
    });
    hit.addEventListener("mousemove", (event) => {
      if (this.anchor !== hit || !isGameUiOverlayOpen(this.root)) return;
      this.pointerAnchor = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      this.reposition();
    });
    hit.addEventListener("mouseleave", hide);
    hit.addEventListener("focus", () => show());
    hit.addEventListener("blur", hide);
  }

  destroy(): void {
    this.detachGlobalListeners();
    this.hide();
    this.root.remove();
  }
}
