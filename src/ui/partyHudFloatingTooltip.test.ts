/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { PartyHudFloatingTooltip } from './partyHudFloatingTooltip.ts';

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
    tooltip.show(anchor, 'Long tooltip label', { alignEnd: false });

    const root = mount.querySelector('.party-hud-floating-tooltip') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.hidden).toBe(false);
    expect(root.parentElement).toBe(mount);
    expect(mount.lastElementChild).toBe(root);
    expect(Number.parseFloat(root.style.left)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(root.style.top)).toBeGreaterThanOrEqual(0);

    tooltip.destroy();
    mount.remove();
  });
});
