import { clampElementToMountBounds } from './clampElementToMountBounds.ts';

/** Gap between anchor and tooltip so the label clears the cursor on small HUD hits. */
const TOOLTIP_ANCHOR_GAP_PX = 12;

export interface PartyHudFloatingTooltipOptions {
  wide?: boolean;
  alignEnd?: boolean;
  placement?: 'above' | 'below';
}

export function isPartyHudFloatingTooltipAnchorVisible(
  anchor: HTMLElement,
): boolean {
  if (!anchor.isConnected) return false;
  let node: HTMLElement | null = anchor;
  while (node) {
    if (node.hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    node = node.parentElement;
  }
  return true;
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
    const placement = options.placement ?? 'above';
    const alignEnd = options.alignEnd ?? false;
    this.root.classList.toggle('party-hud-floating-tooltip--below', placement === 'below');
    this.root.classList.toggle(
      'party-hud-floating-tooltip--below-start',
      placement === 'below' && !alignEnd,
    );
    this.root.hidden = false;
    this.root.style.zIndex = '10';
    this.mount.appendChild(this.root);
    this.reposition();
  }

  hide(): void {
    this.anchor = null;
    this.root.hidden = true;
  }

  getAnchor(): HTMLElement | null {
    return this.anchor;
  }

  hideIfAnchorDetached(): void {
    if (!this.anchor || this.root.hidden) return;
    if (!isPartyHudFloatingTooltipAnchorVisible(this.anchor)) {
      this.hide();
    }
  }

  isVisible(): boolean {
    return !this.root.hidden;
  }

  reposition(): void {
    if (!this.anchor || this.root.hidden) return;
    this.hideIfAnchorDetached();
    if (!this.anchor || this.root.hidden) return;

    const frame = this.mount.getBoundingClientRect();
    const rect = this.anchor.getBoundingClientRect();
    const placement = this.options.placement ?? 'above';
    const alignEnd = this.options.alignEnd ?? false;
    const wide = this.options.wide ?? false;

    if (placement === 'below') {
      this.root.style.top = `${rect.bottom - frame.top + TOOLTIP_ANCHOR_GAP_PX}px`;
      this.root.style.left = alignEnd
        ? `${rect.right - frame.left}px`
        : `${rect.left - frame.left}px`;
    } else {
      this.root.style.top = `${rect.top - frame.top - TOOLTIP_ANCHOR_GAP_PX}px`;
      if (wide && alignEnd) {
        this.root.style.left = `${rect.right - frame.left}px`;
      } else if (alignEnd) {
        this.root.style.left = `${rect.right - frame.left}px`;
      } else {
        this.root.style.left = `${rect.left - frame.left + rect.width / 2}px`;
      }
    }

    clampElementToMountBounds(this.root, this.mount);
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
