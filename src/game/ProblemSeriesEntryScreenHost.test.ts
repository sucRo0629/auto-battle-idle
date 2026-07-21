/**
 * @vitest-environment happy-dom
 *
 * R12m Player 作業単位2J2: ProblemSeriesEntryScreenHost
 * ProblemSeriesEntryPanel を mount し正規化済み seed を callback へ転送する host 境界。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemSeriesEntryScreenHost } from './ProblemSeriesEntryScreenHost.ts';

const RAW_FIXTURE_SEED = '  fixture-a  ';
const NORMALIZED_FIXTURE_SEED = 'fixture-a';

describe('ProblemSeriesEntryScreenHost (R12m Player unit2J2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('show → 入力 → callback → hide/show で panel 件数と入力値を維持する', () => {
    const host = document.createElement('div');
    host.hidden = true;
    document.body.appendChild(host);

    const onPrepare = vi.fn();
    const screenHost = new ProblemSeriesEntryScreenHost(host, { onPrepare });

    expect(host.hidden).toBe(true);

    screenHost.show();

    expect(host.hidden).toBe(false);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(onPrepare).toHaveBeenCalledTimes(0);

    const input = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const button = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(button).toBeInstanceOf(HTMLButtonElement);

    input.value = RAW_FIXTURE_SEED;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(button.disabled).toBe(false);

    button.click();

    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledWith(NORMALIZED_FIXTURE_SEED);
    expect(onPrepare.mock.calls[0]?.[0]).toBe(NORMALIZED_FIXTURE_SEED);
    expect(onPrepare.mock.calls[0]?.[0]).not.toBe(RAW_FIXTURE_SEED);

    screenHost.hide();

    expect(host.hidden).toBe(true);
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(input.value).toBe(RAW_FIXTURE_SEED);

    screenHost.show();

    expect(host.hidden).toBe(false);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(input.value).toBe(RAW_FIXTURE_SEED);
    expect(onPrepare).toHaveBeenCalledTimes(1);

    host.remove();
  });

  it('空白 seed を拒否し destroy で panel のみ除去する', () => {
    const host = document.createElement('div');
    host.hidden = true;
    const existing = document.createElement('p');
    existing.textContent = 'existing-host-child';
    host.appendChild(existing);
    document.body.appendChild(host);

    const onPrepare = vi.fn();
    const screenHost = new ProblemSeriesEntryScreenHost(host, { onPrepare });

    screenHost.show();

    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);

    const input = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const button = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;

    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(button.disabled).toBe(true);

    button.click();

    expect(onPrepare).toHaveBeenCalledTimes(0);

    screenHost.destroy();

    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(0);
    expect(host.contains(existing)).toBe(true);
    expect(existing.textContent).toBe('existing-host-child');
    expect(onPrepare).toHaveBeenCalledTimes(0);

    expect(() => screenHost.destroy()).not.toThrow();

    host.remove();
  });

  it('back click で onBack を転送し host 状態と panel 件数を維持する', () => {
    const host = document.createElement('div');
    host.hidden = true;
    document.body.appendChild(host);

    const onPrepare = vi.fn();
    const onBack = vi.fn();
    const screenHost = new ProblemSeriesEntryScreenHost(host, { onPrepare, onBack });

    screenHost.show();

    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(host.querySelectorAll('.problem-series-entry-back')).toHaveLength(1);
    expect(onBack).toHaveBeenCalledTimes(0);
    expect(onPrepare).toHaveBeenCalledTimes(0);

    const backButton = host.querySelector(
      '.problem-series-entry-back',
    ) as HTMLButtonElement;
    backButton.click();

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledTimes(0);
    expect(host.hidden).toBe(false);
    expect(host.querySelectorAll('.problem-series-entry-panel')).toHaveLength(1);
    expect(document.querySelectorAll('.problem-series-overview-panel')).toHaveLength(0);
    expect(document.querySelectorAll('.stage-selection-panel')).toHaveLength(0);
    expect(document.querySelectorAll('.battle-view')).toHaveLength(0);

    const input = host.querySelector(
      '.problem-series-entry-seed-input',
    ) as HTMLInputElement;
    const prepareButton = host.querySelector(
      '.problem-series-entry-prepare',
    ) as HTMLButtonElement;

    input.value = RAW_FIXTURE_SEED;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    prepareButton.click();

    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onPrepare).toHaveBeenCalledWith(NORMALIZED_FIXTURE_SEED);
    expect(onBack).toHaveBeenCalledTimes(1);

    const hostWithoutOnBack = document.createElement('div');
    hostWithoutOnBack.hidden = true;
    document.body.appendChild(hostWithoutOnBack);

    const screenHostWithoutOnBack = new ProblemSeriesEntryScreenHost(hostWithoutOnBack, {
      onPrepare: vi.fn(),
    });
    screenHostWithoutOnBack.show();

    const backButtonWithoutCallback = hostWithoutOnBack.querySelector(
      '.problem-series-entry-back',
    ) as HTMLButtonElement;

    expect(() => backButtonWithoutCallback.click()).not.toThrow();

    host.remove();
    hostWithoutOnBack.remove();
  });
});
