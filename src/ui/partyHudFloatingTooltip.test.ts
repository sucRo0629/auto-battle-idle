/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import {
  isPartyHudFloatingTooltipAnchorVisible,
  PartyHudFloatingTooltip,
} from './partyHudFloatingTooltip.ts';

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
    expect(root.hidden).toBe(false);
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
