import "../styles/game-term-tooltip.css";

export interface GameTermTooltipContent {
  title: string;
  body: string;
}

export class GameTermTooltip {
  private readonly root: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "game-term-tooltip";
    this.root.hidden = true;
    this.root.setAttribute("role", "tooltip");

    this.titleEl = document.createElement("div");
    this.titleEl.className = "game-term-tooltip-title";

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "game-term-tooltip-body";

    this.root.append(this.titleEl, this.bodyEl);
    mount.appendChild(this.root);
  }

  show(anchor: HTMLElement, content: GameTermTooltipContent): void {
    this.anchor = anchor;
    this.titleEl.textContent = content.title;
    this.bodyEl.textContent = content.body;
    this.root.hidden = false;
    this.reposition();
  }

  hide(): void {
    this.anchor = null;
    this.root.hidden = true;
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
    this.root.remove();
  }
}
