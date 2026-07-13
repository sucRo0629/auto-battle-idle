import { clampElementToMountBounds } from './clampElementToMountBounds.ts';
import {
  bindGameUiOverlayClosed,
  isGameUiOverlayOpen,
  setGameUiOverlayOpen,
} from './gameUiOverlay.ts';
import { resolveHudPointerTooltipAlignEnd } from './resolveHudPointerTooltipAlignEnd.ts';

/** Gap between anchor and tooltip so the label clears the cursor on small HUD hits. */
const TOOLTIP_ANCHOR_GAP_PX = 12;

export interface PartyHudFloatingTooltipPointer {
  clientX: number;
  clientY: number;
}

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
  private pointerAnchor: PartyHudFloatingTooltipPointer | null = null;
  private options: PartyHudFloatingTooltipOptions = {};

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.root = document.createElement('div');
    this.root.className = 'party-hud-floating-tooltip';
    bindGameUiOverlayClosed(this.root);
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
    setGameUiOverlayOpen(this.root, true);
    this.root.style.zIndex = '10';
    this.mount.appendChild(this.root);
    this.reposition();
  }

  hide(): void {
    this.anchor = null;
    this.pointerAnchor = null;
    setGameUiOverlayOpen(this.root, false);
  }

  getAnchor(): HTMLElement | null {
    return this.anchor;
  }

  hideIfAnchorDetached(): void {
    if (!this.anchor || !isGameUiOverlayOpen(this.root)) return;
    if (!isPartyHudFloatingTooltipAnchorVisible(this.anchor)) {
      this.hide();
    }
  }

  isVisible(): boolean {
    return isGameUiOverlayOpen(this.root);
  }

  reposition(): void {
    if (!this.anchor || !isGameUiOverlayOpen(this.root)) return;
    this.hideIfAnchorDetached();
    if (!this.anchor || !isGameUiOverlayOpen(this.root)) return;

    if (this.pointerAnchor) {
      this.repositionNearPointer();
      return;
    }

    this.root.classList.remove('party-hud-floating-tooltip--pointer');

    const frame = this.mount.getBoundingClientRect();
    const rect = this.anchor.getBoundingClientRect();
    const scale = this.readMountCoordinateScale();
    const placement = this.options.placement ?? 'above';
    const alignEnd = this.options.alignEnd ?? false;
    const wide = this.options.wide ?? false;

    if (placement === 'below') {
      this.root.style.top = `${(rect.bottom - frame.top) / scale + TOOLTIP_ANCHOR_GAP_PX}px`;
      this.root.style.left = alignEnd
        ? `${(rect.right - frame.left) / scale}px`
        : `${(rect.left - frame.left) / scale}px`;
    } else {
      this.root.style.top = `${(rect.top - frame.top) / scale - TOOLTIP_ANCHOR_GAP_PX}px`;
      if (wide && alignEnd) {
        this.root.style.left = `${(rect.right - frame.left) / scale}px`;
      } else if (alignEnd) {
        this.root.style.left = `${(rect.right - frame.left) / scale}px`;
      } else {
        this.root.style.left = `${(rect.left - frame.left + rect.width / 2) / scale}px`;
      }
    }

    clampElementToMountBounds(this.root, this.mount);
  }

  bindHit(
    hit: HTMLElement,
    text: string,
    options: PartyHudFloatingTooltipOptions = {},
  ): void {
    hit.addEventListener('mouseenter', (event) => {
      if (!(event instanceof MouseEvent)) return;
      this.pointerAnchor = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      this.show(hit, text, options);
    });
    hit.addEventListener('mousemove', (event) => {
      if (!(event instanceof MouseEvent)) return;
      if (!this.isVisible() || this.anchor !== hit) return;
      this.pointerAnchor = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      this.reposition();
    });
    hit.addEventListener('mouseleave', () => {
      this.hide();
    });
  }

  private readMountCoordinateScale(): number {
    const frame = this.mount.getBoundingClientRect();
    const localWidth = this.mount.clientWidth || this.mount.offsetWidth;
    if (localWidth <= 0) return 1;
    return frame.width / localWidth;
  }

  private repositionNearPointer(): void {
    if (!this.pointerAnchor) return;

    const frame = this.mount.getBoundingClientRect();
    const scale = this.readMountCoordinateScale();
    const mountWidth = this.mount.clientWidth || this.mount.offsetWidth;
    const localX = (this.pointerAnchor.clientX - frame.left) / scale;
    const localY = (this.pointerAnchor.clientY - frame.top) / scale;

    this.root.classList.add('party-hud-floating-tooltip--pointer');

    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const alignEnd = resolveHudPointerTooltipAlignEnd(
      localX,
      mountWidth,
      width,
      TOOLTIP_ANCHOR_GAP_PX,
    );
    this.root.classList.toggle(
      'party-hud-floating-tooltip--align-end',
      alignEnd,
    );

    const left = alignEnd
      ? localX - width - TOOLTIP_ANCHOR_GAP_PX
      : localX + TOOLTIP_ANCHOR_GAP_PX;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${localY - height - TOOLTIP_ANCHOR_GAP_PX}px`;

    clampElementToMountBounds(this.root, this.mount);
  }

  destroy(): void {
    this.root.remove();
  }
}
