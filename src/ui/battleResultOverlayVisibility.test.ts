/**
 * @vitest-environment happy-dom
 *
 * 作戦結果 / 敗北 retry overlay の「見た目上の表示」を検証する。
 * hidden 属性だけでは不十分 — production CSS の [hidden] 上書きが無いと
 * display:flex が残り R8-smoke-fix 不具合が再発する。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createOverlayProbe,
  DEFEAT_OVERLAY_CLASS,
  expectOverlayVisuallyHidden,
  expectOverlayVisuallyVisible,
  VICTORY_OVERLAY_CLASS,
} from './battleResultOverlayTestUtils.ts';

const BATTLE_VIEW_CSS_PATH = resolve(
  import.meta.dirname,
  '../styles/battle-view.css',
);

describe('battle result overlay visual visibility', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.getElementById('buggy-overlay-css-probe')?.remove();
    document.body.replaceChildren();
  });

  it('production battle-view.css keeps [hidden] override for victory overlay', () => {
    const css = readFileSync(BATTLE_VIEW_CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.battle-victory-result-overlay\[hidden\][\s\S]*?display:\s*none\s*!important/,
    );
  });

  it('production battle-view.css keeps [hidden] override for defeat retry overlay', () => {
    const css = readFileSync(BATTLE_VIEW_CSS_PATH, 'utf8');
    expect(css).toMatch(
      /\.battle-defeat-retry-overlay\[hidden\][\s\S]*?display:\s*none\s*!important/,
    );
  });

  it('victory overlay: hidden=true yields computed display none', () => {
    const overlay = createOverlayProbe(VICTORY_OVERLAY_CLASS);
    overlay.hidden = true;
    expectOverlayVisuallyHidden(`.${VICTORY_OVERLAY_CLASS}`);
  });

  it('victory overlay: hidden=false is visually shown', () => {
    const overlay = createOverlayProbe(VICTORY_OVERLAY_CLASS);
    overlay.hidden = false;
    expectOverlayVisuallyVisible(`.${VICTORY_OVERLAY_CLASS}`);
    expect(getComputedStyle(overlay).display).toBe('flex');
  });

  it('defeat retry overlay: hidden=true yields computed display none', () => {
    const overlay = createOverlayProbe(DEFEAT_OVERLAY_CLASS);
    overlay.hidden = true;
    expectOverlayVisuallyHidden(`.${DEFEAT_OVERLAY_CLASS}`);
  });

  it('simulates stale DOM: toggling hidden true after visible hides overlay visually', () => {
    const overlay = createOverlayProbe(VICTORY_OVERLAY_CLASS);
    overlay.hidden = false;
    expectOverlayVisuallyVisible(`.${VICTORY_OVERLAY_CLASS}`);

    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    expectOverlayVisuallyHidden(`.${VICTORY_OVERLAY_CLASS}`);
  });

  it('regression baseline: display:flex without [hidden] override ignores hidden attribute visually', () => {
    const style = document.createElement('style');
    style.id = 'buggy-overlay-css-probe';
    style.textContent = `
      .overlay-probe-buggy {
        display: flex;
      }
    `;
    document.head.appendChild(style);

    const overlay = createOverlayProbe('overlay-probe-buggy');
    overlay.hidden = true;

    expect(overlay.hidden).toBe(true);
    expect(getComputedStyle(overlay).display).toBe('flex');
  });
});
