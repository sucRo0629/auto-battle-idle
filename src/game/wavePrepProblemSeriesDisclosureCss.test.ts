import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Returns only the `{ ... }` body of the first CSS rule whose selector token
 * matches exactly. Never returns empty fallback; missing selector/braces fail.
 */
function extractCssRuleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Exact selector token, then optional whitespace, then opening brace.
  // Rejects longer tokens (e.g. `.foo-bar` when looking for `.foo`).
  const openRe = new RegExp(`(?<![\\w-])${escaped}(?![\\w.-])\\s*\\{`);
  const openMatch = openRe.exec(css);
  if (openMatch === null || openMatch.index === undefined) {
    expect.fail(`CSS rule selector not found: ${selector}`);
  }

  const openBraceIndex = openMatch.index + openMatch[0].lastIndexOf('{');
  if (css[openBraceIndex] !== '{') {
    expect.fail(`CSS rule opening brace not found for: ${selector}`);
  }

  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openBraceIndex + 1, i);
      }
    }
  }

  expect.fail(`CSS rule closing brace not found for: ${selector}`);
}

function extractCssAtRuleBody(css: string, atRuleHead: string): string {
  const escaped = atRuleHead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(`${escaped}\\s*\\{`);
  const openMatch = openRe.exec(css);
  if (openMatch === null || openMatch.index === undefined) {
    expect.fail(`CSS at-rule not found: ${atRuleHead}`);
  }

  const openBraceIndex = openMatch.index + openMatch[0].lastIndexOf('{');
  if (css[openBraceIndex] !== '{') {
    expect.fail(`CSS at-rule opening brace not found for: ${atRuleHead}`);
  }

  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(openBraceIndex + 1, i);
      }
    }
  }

  expect.fail(`CSS at-rule closing brace not found for: ${atRuleHead}`);
}

describe('extractCssRuleBody fail-closed helper (wave-prep disclosure)', () => {
  it('does not detect a declaration that only exists in a subsequent rule', () => {
    const sampleCss = `
.prior-selector {
  color: red;
}
.later-selector {
  display: flex;
}
`;

    const priorBody = extractCssRuleBody(sampleCss, '.prior-selector');
    const laterBody = extractCssRuleBody(sampleCss, '.later-selector');

    expect(priorBody).not.toMatch(/display:\s*flex/);
    expect(laterBody).toMatch(/display:\s*flex/);

    // Previous whole-file pattern would falsely succeed across rules:
    expect(sampleCss).toMatch(/\.prior-selector[\s\S]*display:\s*flex/);
  });
});

describe('wave-prep problem-series disclosure CSS production layout contract', () => {
  const hostSource = readFileSync(
    resolve(import.meta.dirname, './WavePrepScreenHost.ts'),
    'utf8',
  );
  const css = readFileSync(
    resolve(import.meta.dirname, '../styles/wave-prep-screen.css'),
    'utf8',
  );

  const requiredSelectors = [
    '.wave-prep-screen__problem-series-disclosure',
    '.wave-prep-screen__problem-series-disclosure:empty',
    '.problem-series-wave-prep-disclosure',
    '.problem-series-wave-prep-disclosure > section',
    '.problem-series-wave-prep-disclosure__wave',
    '.problem-series-wave-prep-disclosure__enemy-group',
    '.problem-series-wave-prep-disclosure__changes > div',
  ] as const;

  it('imports production wave-prep-screen.css from WavePrepScreenHost.ts', () => {
    expect(hostSource).toMatch(
      /import\s+['"]\.\.\/styles\/wave-prep-screen\.css['"]/,
    );
  });

  it('defines required selectors with non-empty rule bodies', () => {
    expect(requiredSelectors.length).toBeGreaterThan(0);

    for (const selector of requiredSelectors) {
      expect(css).toContain(selector);
      const body = extractCssRuleBody(css, selector);
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });

  it('hides empty disclosure host so fixed Stage consumes no space', () => {
    const emptyBody = extractCssRuleBody(
      css,
      '.wave-prep-screen__problem-series-disclosure:empty',
    );
    expect(emptyBody).toMatch(/display:\s*none/);
  });

  it('keeps non-empty disclosure host shrinkable with finite height and own scroll', () => {
    const hostBody = extractCssRuleBody(
      css,
      '.wave-prep-screen__problem-series-disclosure',
    );

    expect(hostBody).toMatch(/min-height:\s*0/);
    expect(hostBody).toMatch(
      /max-height:\s*(?!none\b|auto\b|unset\b|inherit\b|initial\b)[^;]+/,
    );
    expect(hostBody).toMatch(/overflow-y:\s*auto/);
    expect(hostBody).toMatch(/min-width:\s*0/);
    expect(hostBody).toMatch(/overflow-x:\s*hidden/);
  });

  it('keeps slot list as an independent vertical scroll owner', () => {
    const slotsBody = extractCssRuleBody(css, '.wave-prep-screen__slots');

    expect(slotsBody).toMatch(/min-height:\s*0/);
    expect(slotsBody).toMatch(/overflow-y:\s*auto/);
  });

  it('lays out disclosure panel as a two-column grid on desktop', () => {
    const panelBody = extractCssRuleBody(
      css,
      '.problem-series-wave-prep-disclosure',
    );

    expect(panelBody).toMatch(/display:\s*grid/);
    expect(panelBody).toMatch(
      /grid-template-columns:\s*repeat\(\s*2\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/,
    );
  });

  it('collapses disclosure panel to one column in narrow media query', () => {
    const mediaBody = extractCssAtRuleBody(css, '@media (max-width: 959px)');
    const narrowPanelBody = extractCssRuleBody(
      mediaBody,
      '.problem-series-wave-prep-disclosure',
    );

    expect(narrowPanelBody).toMatch(
      /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/,
    );
  });

  it('gives sections min-width 0 and wrap rules for long labels', () => {
    const sectionBody = extractCssRuleBody(
      css,
      '.problem-series-wave-prep-disclosure > section',
    );

    expect(sectionBody).toMatch(/min-width:\s*0/);
    expect(sectionBody).toMatch(/overflow-wrap:\s*anywhere/);

    const wrapSelectors = [
      '.problem-series-wave-prep-disclosure__wave',
      '.problem-series-wave-prep-disclosure__enemy-group',
      '.problem-series-wave-prep-disclosure__scale',
      '.problem-series-wave-prep-disclosure__changes > div',
    ] as const;

    expect(wrapSelectors.length).toBeGreaterThan(0);
    for (const selector of wrapSelectors) {
      const body = extractCssRuleBody(css, selector);
      expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    }
  });

  it('does not use fixed or absolute positioning', () => {
    expect(css).not.toMatch(/position:\s*fixed/);
    expect(css).not.toMatch(/position:\s*absolute/);
  });
});
