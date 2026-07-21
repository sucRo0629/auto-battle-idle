/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as seedResolveModule from '../battle/problemSeries/seedResolve.ts';
import { ProblemSeriesEntryPanel } from './ProblemSeriesEntryPanel.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProblemSeriesEntryPanel', () => {
  it('starts empty/disabled and rejects blank seed without calling onPrepare', () => {
    const host = document.createElement('div');
    const onPrepare = vi.fn();
    const normalizeSpy = vi.spyOn(seedResolveModule, 'normalizeProblemSeriesSeed');

    new ProblemSeriesEntryPanel(host, { onPrepare });

    const roots = host.querySelectorAll('.problem-series-entry-panel');
    expect(roots).toHaveLength(1);
    const root = roots[0]!;

    const inputs = root.querySelectorAll('.problem-series-entry-seed-input');
    expect(inputs).toHaveLength(1);
    const input = inputs[0];
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.type).toBe('text');
    expect(input.autocomplete).toBe('off');
    expect(input.hasAttribute('maxlength')).toBe(false);
    expect(input.value).toBe('');

    const buttons = root.querySelectorAll('.problem-series-entry-prepare');
    expect(buttons).toHaveLength(1);
    const button = buttons[0];
    expect(button).toBeInstanceOf(HTMLButtonElement);
    expect(button.type).toBe('button');
    expect(button.disabled).toBe(true);

    const errorEl = root.querySelector('.problem-series-entry-seed-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl!.textContent).toBe('seedを入力してください');

    expect(root.querySelector('h1')?.textContent).toBe('メイン攻略');
    const label = root.querySelector('.problem-series-entry-seed-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('seed');
    expect(label).toBeInstanceOf(HTMLLabelElement);
    expect((label as HTMLLabelElement).htmlFor).toBe(input.id);

    const normalizeCallsBeforeBlank = normalizeSpy.mock.calls.length;
    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(normalizeSpy.mock.calls.length).toBeGreaterThan(normalizeCallsBeforeBlank);
    expect(normalizeSpy).toHaveBeenCalledWith('   ');
    expect(button.disabled).toBe(true);
    expect(errorEl!.textContent).toBe('seedを入力してください');

    const prepareCallsBeforeClick = onPrepare.mock.calls.length;
    button.click();
    expect(onPrepare).toHaveBeenCalledTimes(prepareCallsBeforeClick);
    expect(onPrepare).toHaveBeenCalledTimes(0);
  });

  it('trims seed via production normalize and passes only normalized value to onPrepare', () => {
    const host = document.createElement('div');
    const onPrepare = vi.fn();
    const normalizeSpy = vi.spyOn(seedResolveModule, 'normalizeProblemSeriesSeed');

    new ProblemSeriesEntryPanel(host, { onPrepare });

    const input = host.querySelector('.problem-series-entry-seed-input');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const button = host.querySelector('.problem-series-entry-prepare');
    expect(button).toBeInstanceOf(HTMLButtonElement);
    const errorEl = host.querySelector('.problem-series-entry-seed-error');
    expect(errorEl).not.toBeNull();

    input.value = '  fixture-a  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(normalizeSpy).toHaveBeenCalledWith('  fixture-a  ');
    expect(button.disabled).toBe(false);
    expect(errorEl!.textContent).toBe('');

    const normalizeCallsBeforeClick = normalizeSpy.mock.calls.length;
    button.click();

    expect(normalizeSpy.mock.calls.length).toBe(normalizeCallsBeforeClick + 1);
    expect(normalizeSpy).toHaveBeenLastCalledWith('  fixture-a  ');
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledWith('fixture-a');
    expect(onPrepare.mock.calls[0]?.[0]).toBe('fixture-a');
    expect(onPrepare.mock.calls[0]?.[0]).not.toBe('  fixture-a  ');

    const omittedHost = document.createElement('div');
    expect(() => {
      const omittedPanel = new ProblemSeriesEntryPanel(omittedHost);
      const omittedInput = omittedHost.querySelector(
        '.problem-series-entry-seed-input',
      ) as HTMLInputElement;
      const omittedButton = omittedHost.querySelector(
        '.problem-series-entry-prepare',
      ) as HTMLButtonElement;
      omittedInput.value = '  fixture-a  ';
      omittedInput.dispatchEvent(new Event('input', { bubbles: true }));
      omittedButton.click();
      omittedPanel.destroy();
    }).not.toThrow();
  });

  it('calls onBack without validation and leaves input, error, and prepare state unchanged', () => {
    const host = document.createElement('div');
    const onPrepare = vi.fn();
    const onBack = vi.fn();
    const normalizeSpy = vi.spyOn(seedResolveModule, 'normalizeProblemSeriesSeed');

    new ProblemSeriesEntryPanel(host, { onPrepare, onBack });

    const root = host.querySelector('.problem-series-entry-panel')!;
    const backButtons = root.querySelectorAll('.problem-series-entry-back');
    expect(backButtons).toHaveLength(1);
    const backButton = backButtons[0];
    expect(backButton).toBeInstanceOf(HTMLButtonElement);
    expect(backButton.type).toBe('button');
    expect(backButton.textContent).toBe('戻る');
    expect(backButton.disabled).toBe(false);

    const input = root.querySelector('.problem-series-entry-seed-input') as HTMLInputElement;
    const prepareButton = root.querySelector('.problem-series-entry-prepare') as HTMLButtonElement;
    const errorEl = root.querySelector('.problem-series-entry-seed-error');

    expect(onBack).toHaveBeenCalledTimes(0);
    expect(onPrepare).toHaveBeenCalledTimes(0);

    const normalizeCallsBeforeBack = normalizeSpy.mock.calls.length;
    backButton.click();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledTimes(0);
    expect(normalizeSpy.mock.calls.length).toBe(normalizeCallsBeforeBack);
    expect(input.value).toBe('');
    expect(errorEl!.textContent).toBe('seedを入力してください');
    expect(prepareButton.disabled).toBe(true);

    input.value = '  fixture-a  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    prepareButton.click();

    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledWith('fixture-a');
    expect(onBack).toHaveBeenCalledTimes(1);

    const omittedHost = document.createElement('div');
    expect(() => {
      const omittedPanel = new ProblemSeriesEntryPanel(omittedHost);
      const omittedBackButton = omittedHost.querySelector(
        '.problem-series-entry-back',
      ) as HTMLButtonElement;
      omittedBackButton.click();
      omittedPanel.destroy();
    }).not.toThrow();
  });

  it('destroy removes only the panel root and does not call onPrepare', () => {
    const host = document.createElement('div');
    const existing = document.createElement('p');
    existing.textContent = 'existing-host-child';
    host.appendChild(existing);

    const onPrepare = vi.fn();
    const panel = new ProblemSeriesEntryPanel(host, { onPrepare });

    expect(host.querySelector('.problem-series-entry-panel')).not.toBeNull();
    expect(host.contains(existing)).toBe(true);

    panel.destroy();

    expect(host.querySelector('.problem-series-entry-panel')).toBeNull();
    expect(host.contains(existing)).toBe(true);
    expect(existing.textContent).toBe('existing-host-child');
    expect(onPrepare).toHaveBeenCalledTimes(0);
  });
});
