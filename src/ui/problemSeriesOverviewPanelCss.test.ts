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

describe('extractCssRuleBody fail-closed helper', () => {
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

describe('problem-series-overview-panel.css production layout contract', () => {
  const panelSource = readFileSync(
    resolve(import.meta.dirname, './ProblemSeriesOverviewPanel.ts'),
    'utf8',
  );
  const css = readFileSync(
    resolve(import.meta.dirname, '../styles/problem-series-overview-panel.css'),
    'utf8',
  );

  it('imports dedicated CSS from ProblemSeriesOverviewPanel.ts', () => {
    expect(panelSource).toMatch(
      /import\s+['"]\.\.\/styles\/problem-series-overview-panel\.css['"]/,
    );
  });

  it('defines required selectors in production CSS', () => {
    const requiredSelectors = [
      '.problem-series-overview-panel',
      '.problem-series-overview-waves',
      '.problem-series-overview-wave',
      '.problem-series-overview-enemy-group',
      '.problem-series-overview-actions',
    ] as const;

    for (const selector of requiredSelectors) {
      expect(css).toContain(selector);
      // Fail closed: each required selector must resolve to a real rule body.
      expect(extractCssRuleBody(css, selector).length).toBeGreaterThan(0);
    }
  });

  it('limits root to column layout within the viewport', () => {
    const rootBody = extractCssRuleBody(css, '.problem-series-overview-panel');

    expect(rootBody).toMatch(/display:\s*flex/);
    expect(rootBody).toMatch(/flex-direction:\s*column/);
    expect(rootBody).toMatch(/max-height:[\s\S]*calc\(100vh/);
    expect(rootBody).toMatch(/overflow:\s*hidden/);
  });

  it('makes the wave list the vertical scroll owner', () => {
    const wavesBody = extractCssRuleBody(css, '.problem-series-overview-waves');

    expect(wavesBody).toMatch(/min-height:\s*0/);
    expect(wavesBody).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps action buttons outside the scroll region', () => {
    const actionsBody = extractCssRuleBody(css, '.problem-series-overview-actions');

    expect(actionsBody).toMatch(/flex-shrink:\s*0/);
  });

  it('lays out three wave columns on desktop and one column in narrow media query', () => {
    const wavesBody = extractCssRuleBody(css, '.problem-series-overview-waves');
    expect(wavesBody).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );

    const mediaBody = extractCssAtRuleBody(css, '@media (max-width: 959px)');
    const narrowWavesBody = extractCssRuleBody(
      mediaBody,
      '.problem-series-overview-waves',
    );
    expect(narrowWavesBody).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it('does not use fixed or absolute positioning', () => {
    expect(css).not.toMatch(/position:\s*fixed/);
    expect(css).not.toMatch(/position:\s*absolute/);
  });
});
