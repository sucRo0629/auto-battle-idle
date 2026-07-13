/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import {
  isPartyHudFloatingTooltipAnchorVisible,
  PartyHudFloatingTooltip,
} from './partyHudFloatingTooltip.ts';
import { isGameUiOverlayOpen } from './gameUiOverlay.ts';

describe('isPartyHudFloatingTooltipAnchorVisible', () => {
  it('returns false when anchor is detached or hidden', () => {
    const anchor = document.createElement('button');
    expect(isPartyHudFloatingTooltipAnchorVisible(anchor)).toBe(false);

    const host = document.createElement('div');
    document.body.appendChild(host);
    host.appendChild(anchor);
    expect(isPartyHudFloatingTooltipAnchorVisible(anchor)).toBe(true);

    host.hidden = true;
    expect(isPartyHudFloatingTooltipAnchorVisible(anchor)).toBe(false);

    host.remove();
  });
});

describe('PartyHudFloatingTooltip', () => {
  it('positions near the pointer when opened from bindHit', () => {
    const mount = document.createElement('div');
    mount.style.cssText =
      'position:relative;width:200px;height:120px;overflow:hidden;';
    document.body.appendChild(mount);

    const anchor = document.createElement('button');
    anchor.style.cssText =
      'position:absolute;left:160px;top:80px;width:24px;height:24px;';
    mount.appendChild(anchor);

    const tooltip = new PartyHudFloatingTooltip(mount);
    tooltip.bindHit(anchor, 'Block');

    anchor.dispatchEvent(
      new MouseEvent('mouseenter', {
        clientX: 170,
        clientY: 90,
        bubbles: true,
      }),
    );

    const root = mount.querySelector('.party-hud-floating-tooltip') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.classList.contains('party-hud-floating-tooltip--pointer')).toBe(
      true,
    );
    const initialLeft = Number.parseFloat(root.style.left);
    const initialTop = Number.parseFloat(root.style.top);
    expect(initialLeft).toBeGreaterThan(0);
    expect(initialTop).toBeGreaterThan(0);
    expect(initialTop + root.offsetHeight).toBeLessThan(90);

    anchor.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: 40,
        clientY: 30,
        bubbles: true,
      }),
    );
    expect(Number.parseFloat(root.style.left)).toBeLessThan(initialLeft);
    expect(Number.parseFloat(root.style.top)).toBeLessThan(initialTop);

    tooltip.destroy();
    mount.remove();
  });

  it('opens to the right of a left-edge pointer instead of slot-index alignEnd', () => {
    const mount = document.createElement('div');
    mount.style.cssText =
      'position:relative;width:1280px;height:720px;overflow:hidden;';
    document.body.appendChild(mount);

    const anchor = document.createElement('button');
    anchor.style.cssText =
      'position:absolute;left:40px;top:600px;width:24px;height:24px;';
    mount.appendChild(anchor);

    const tooltip = new PartyHudFloatingTooltip(mount);
    // Legacy callers still pass alignEnd for high visual indices (left cards under
    // row-reverse). Pointer placement must ignore that and open toward free space.
    tooltip.bindHit(anchor, 'Sorcerer', { alignEnd: true });

    anchor.dispatchEvent(
      new MouseEvent('mouseenter', {
        clientX: 52,
        clientY: 610,
        bubbles: true,
      }),
    );

    const root = mount.querySelector('.party-hud-floating-tooltip') as HTMLElement;
    expect(isGameUiOverlayOpen(root)).toBe(true);
    expect(root.hasAttribute('hidden')).toBe(false);
    expect(root.classList.contains('party-hud-floating-tooltip--align-end')).toBe(
      false,
    );
    expect(Number.parseFloat(root.style.left)).toBeGreaterThan(52);

    tooltip.destroy();
    mount.remove();
  });

  it('mounts on show and clamps within the canvas host layer', () => {
    const mount = document.createElement('div');
    mount.style.cssText =
      'position:relative;width:200px;height:120px;overflow:hidden;';
    document.body.appendChild(mount);

    const anchor = document.createElement('button');
    anchor.style.cssText =
      'position:absolute;left:0;top:0;width:24px;height:24px;';
    mount.appendChild(anchor);

    const tooltip = new PartyHudFloatingTooltip(mount);
    tooltip.show(anchor, 'Long tooltip label', { placement: 'below' });

    const root = mount.querySelector('.party-hud-floating-tooltip') as HTMLElement;
    expect(root).toBeTruthy();
    expect(isGameUiOverlayOpen(root)).toBe(true);
    expect(root.hasAttribute('hidden')).toBe(false);
    expect(root.classList.contains('party-hud-floating-tooltip--below-start')).toBe(
      true,
    );
    expect(Number.parseFloat(root.style.top)).toBeGreaterThanOrEqual(0);
    expect(root.parentElement).toBe(mount);
    expect(mount.lastElementChild).toBe(root);
    expect(Number.parseFloat(root.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(root.style.top)).toBeGreaterThanOrEqual(0);

    tooltip.destroy();
    mount.remove();
  });

  it('hides when the anchor is detached without mouseleave', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const anchor = document.createElement('button');
    mount.appendChild(anchor);

    const tooltip = new PartyHudFloatingTooltip(mount);
    tooltip.show(anchor, 'Enemy status');
    expect(tooltip.isVisible()).toBe(true);

    anchor.remove();
    tooltip.hideIfAnchorDetached();
    expect(tooltip.isVisible()).toBe(false);

    tooltip.destroy();
    mount.remove();
  });
});
