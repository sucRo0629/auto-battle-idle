export interface PartyHudFloatingTooltipOptions {
  wide?: boolean;
  alignEnd?: boolean;
  placement?: 'above' | 'below';
}

export class PartyHudFloatingTooltip {
  private readonly mount: HTMLElement;
  private readonly root: HTMLElement;
  private anchor: HTMLElement | null = null;
  private options: PartyHudFloatingTooltipOptions = {};

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.root = document.createElement('div');
    this.root.className = 'party-hud-floating-tooltip';
    this.root.hidden = true;
    mount.appendChild(this.root);
  }

  show(
    anchor: HTMLElement,
    text: string,
    options: PartyHudFloatingTooltipOptions = {},
  ): void {
    this.anchor = anchor;
    this.options = options;
    this.root.textContent = text;
    this.root.classList.toggle('party-hud-floating-tooltip--wide', options.wide ?? false);
    this.root.classList.toggle(
      'party-hud-floating-tooltip--align-end',
      options.alignEnd ?? false,
    );
    this.root.classList.toggle(
      'party-hud-floating-tooltip--below',
      options.placement === 'below',
    );
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

    const frame = this.mount.getBoundingClientRect();
    const rect = this.anchor.getBoundingClientRect();
    const placement = this.options.placement ?? 'above';
    const alignEnd = this.options.alignEnd ?? false;
    const wide = this.options.wide ?? false;

    if (wide && alignEnd) {
      this.root.style.left = `${rect.right - frame.left}px`;
    } else if (alignEnd) {
      this.root.style.left = `${rect.right - frame.left}px`;
    } else {
      this.root.style.left = `${rect.left - frame.left + rect.width / 2}px`;
    }

    if (placement === 'below') {
      this.root.style.top = `${rect.bottom - frame.top + 2}px`;
    } else {
      this.root.style.top = `${rect.top - frame.top - 2}px`;
    }
  }

  bindHit(
    hit: HTMLElement,
    text: string,
    options: PartyHudFloatingTooltipOptions = {},
  ): void {
    hit.addEventListener('mouseenter', () => {
      this.show(hit, text, options);
    });
    hit.addEventListener('mouseleave', () => {
      this.hide();
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
