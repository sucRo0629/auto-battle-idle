const EDITOR_ROOT_SELECTOR = '#editor-app';

interface ScrollContainerSnapshot {
  path: string;
  scrollTop: number;
  scrollLeft: number;
}

interface EditorScrollSnapshot {
  scrollX: number;
  scrollY: number;
  containers: ScrollContainerSnapshot[];
}

interface FocusRestoreState {
  inputIndex: number;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function getEditorInputs(): Array<HTMLInputElement | HTMLTextAreaElement> {
  const root = document.querySelector(EDITOR_ROOT_SELECTOR);
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input.editor-input, textarea.editor-input',
    ),
  );
}

function elementPathFromEditorRoot(el: Element): string | null {
  const root = document.querySelector(EDITOR_ROOT_SELECTOR);
  if (!root || !root.contains(el)) return null;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) return null;
    const index = Array.from(parent.children).indexOf(node);
    if (index < 0) return null;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index + 1})`);
    node = parent;
  }
  return parts.join(' > ');
}

function isScrollableElement(el: HTMLElement): boolean {
  const { overflow, overflowX, overflowY } = getComputedStyle(el);
  return [overflow, overflowX, overflowY].some(
    (value) => value === 'auto' || value === 'scroll',
  );
}

function captureScrollContainers(from: Element | null): ScrollContainerSnapshot[] {
  const snapshots: ScrollContainerSnapshot[] = [];
  const seen = new Set<string>();
  let el: Element | null = from;
  while (el) {
    if (el instanceof HTMLElement && isScrollableElement(el)) {
      const path = elementPathFromEditorRoot(el);
      if (path && !seen.has(path)) {
        seen.add(path);
        snapshots.push({
          path,
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
        });
      }
    }
    el = el.parentElement;
  }
  return snapshots;
}

function captureEditorScroll(from: Element | null): EditorScrollSnapshot {
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    containers: captureScrollContainers(from),
  };
}

function restoreEditorScroll(snapshot: EditorScrollSnapshot): void {
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);
  const root = document.querySelector(EDITOR_ROOT_SELECTOR);
  if (!root) return;
  for (const container of snapshot.containers) {
    const el = root.querySelector<HTMLElement>(container.path);
    if (!el) continue;
    el.scrollTop = container.scrollTop;
    el.scrollLeft = container.scrollLeft;
  }
}

function buildFocusRestoreState(): FocusRestoreState | null {
  const active = document.activeElement;
  if (
    !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) ||
    !active.classList.contains('editor-input')
  ) {
    return null;
  }
  const inputIndex = getEditorInputs().indexOf(active);
  if (inputIndex < 0) return null;
  return {
    inputIndex,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
  };
}

function restoreFocusState(
  state: FocusRestoreState | null,
  scrollSnapshot: EditorScrollSnapshot,
): void {
  if (!state) return;
  const input = getEditorInputs()[state.inputIndex];
  if (!input) return;
  input.focus({ preventScroll: true });
  if (
    state.selectionStart !== null &&
    state.selectionEnd !== null &&
    typeof input.setSelectionRange === 'function'
  ) {
    input.setSelectionRange(state.selectionStart, state.selectionEnd);
  }
  restoreEditorScroll(scrollSnapshot);
}

/** blur 待ちの数値入力・スキル ID などを保存前に確定する */
export function flushPendingEditorInputs(): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement
  ) {
    active.blur();
  }
}

/** DOM 再構築後もスクロール位置とフォーカス入力を維持する */
export function preserveScrollDuring(fn: () => void): void {
  const focusState = buildFocusRestoreState();
  const scrollSnapshot = captureEditorScroll(document.activeElement);
  fn();
  const restore = () => {
    restoreEditorScroll(scrollSnapshot);
    restoreFocusState(focusState, scrollSnapshot);
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function createLabel(text: string, forId?: string): HTMLLabelElement {
  const label = createEl('label', 'editor-field-label', text);
  if (forId) label.htmlFor = forId;
  return label;
}

export function createTextInput(
  value: string,
  onInput: (value: string) => void,
  options?: {
    id?: string;
    field?: string;
    placeholder?: string;
    readonly?: boolean;
  },
): HTMLInputElement {
  const input = createEl('input', 'editor-input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  if (options?.id) input.id = options.id;
  if (options?.field) input.dataset.field = options.field;
  if (options?.placeholder) input.placeholder = options.placeholder;
  if (options?.readonly) input.readOnly = true;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

export function createNumberInput(
  value: number,
  onInput: (value: number) => void,
  options?: {
    id?: string;
    field?: string;
    readonly?: boolean;
    /** この値のとき input を空表示（省略値用） */
    emptyWhen?: number;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
  },
): HTMLInputElement {
  const input = createEl('input', 'editor-input editor-decimal-input') as HTMLInputElement;
  input.type = 'text';
  input.inputMode =
    options?.step !== undefined && options.step < 1 ? 'decimal' : 'numeric';
  input.autocomplete = 'off';
  const showEmpty =
    options?.emptyWhen !== undefined && value === options.emptyWhen;
  input.value = showEmpty ? '' : String(value);
  if (options?.id) input.id = options.id;
  if (options?.field) input.dataset.field = options.field;
  if (options?.placeholder) input.placeholder = options.placeholder;
  if (options?.readonly) input.readOnly = true;
  const displayValue = () =>
    options?.emptyWhen !== undefined && value === options.emptyWhen
      ? ''
      : String(value);

  const commit = () => {
    if (options?.readonly) return;
    const raw = input.value.trim();
    if (raw === '') {
      onInput(options?.emptyWhen ?? 0);
      input.value = displayValue();
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      input.value = displayValue();
      return;
    }
    let next = parsed;
    if (options?.min !== undefined && next < options.min) next = options.min;
    if (options?.max !== undefined && next > options.max) next = options.max;
    onInput(next);
    input.value =
      options?.emptyWhen !== undefined && next === options.emptyWhen
        ? ''
        : String(next);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  return input;
}

export function createRadioGroup<T extends string>(
  value: T,
  options: { value: T; label: string }[],
  onChange: (value: T) => void,
  groupName: string,
): HTMLElement {
  const wrap = createEl('div', 'editor-radio-group');
  for (const option of options) {
    const row = createEl('label', 'editor-radio-option');
    const input = createEl('input') as HTMLInputElement;
    input.type = 'radio';
    input.name = groupName;
    input.value = option.value;
    input.checked = option.value === value;
    input.addEventListener('change', () => {
      if (input.checked) onChange(option.value);
    });
    row.appendChild(input);
    row.appendChild(document.createTextNode(option.label));
    wrap.appendChild(row);
  }
  return wrap;
}

export function createSelect<T extends string | number>(
  value: T,
  options: { value: T; label: string }[],
  onChange: (value: T) => void,
): HTMLSelectElement {
  const select = createEl('select', 'editor-select') as HTMLSelectElement;
  for (const option of options) {
    const opt = createEl('option') as HTMLOptionElement;
    opt.value = String(option.value);
    opt.textContent = option.label;
    if (option.value === value) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const raw = select.value;
    const matched = options.find((option) => String(option.value) === raw);
    if (matched) onChange(matched.value);
  });
  return select;
}

export function createFieldRow(
  label: string,
  control: HTMLElement,
  options?: { id?: string },
): HTMLElement {
  const row = createEl('div', 'editor-field');
  row.appendChild(createLabel(label, options?.id));
  row.appendChild(control);
  return row;
}

export function createSection(title: string): HTMLElement {
  const section = createEl('section', 'editor-section');
  section.appendChild(createEl('h3', 'editor-section-title', title));
  return section;
}

export interface CollapsibleSectionOptions {
  id: string;
  title: string;
  summaryExtra?: HTMLElement | string;
  summaryActions?: HTMLElement;
  expandedState: Map<string, boolean>;
  className?: string;
  dataAttrs?: Record<string, string>;
  onToggle?: (open: boolean) => void;
}

/** 折りたたみセクション（展開状態は expandedState Map で永続化） */
export function createCollapsibleSection(
  options: CollapsibleSectionOptions,
): { details: HTMLDetailsElement; body: HTMLElement } {
  const {
    id,
    title,
    summaryExtra,
    summaryActions,
    expandedState,
    className,
    dataAttrs,
    onToggle,
  } = options;

  const details = createEl('details', 'editor-collapsible-details');
  if (className) details.classList.add(className);
  if (dataAttrs) {
    for (const [key, value] of Object.entries(dataAttrs)) {
      details.dataset[key] = value;
    }
  }

  const isOpen = expandedState.get(id) ?? false;
  details.open = isOpen;

  const summary = createEl('summary', 'editor-collapsible-summary');
  summary.appendChild(createEl('span', 'editor-collapsible-summary-label', title));

  if (summaryExtra !== undefined) {
    const extraEl =
      typeof summaryExtra === 'string'
        ? createEl('span', 'editor-collapsible-summary-desc', summaryExtra)
        : summaryExtra;
    if (typeof summaryExtra !== 'string') {
      extraEl.classList.add('editor-collapsible-summary-desc');
    }
    summary.appendChild(extraEl);
  }

  if (summaryActions) {
    const actionsWrap = createEl('span', 'editor-collapsible-summary-actions');
    actionsWrap.appendChild(summaryActions);
    summary.appendChild(actionsWrap);
    for (const button of Array.from(actionsWrap.querySelectorAll('button'))) {
      button.addEventListener('click', (event: MouseEvent) => {
        event.stopPropagation();
      });
      button.addEventListener('mousedown', (event: MouseEvent) => {
        event.preventDefault();
      });
    }
  }

  details.appendChild(summary);

  const body = createEl('div', 'editor-collapsible-body');
  details.appendChild(body);

  details.addEventListener('toggle', () => {
    expandedState.set(id, details.open);
    onToggle?.(details.open);
  });

  return { details, body };
}

export function appendGrid(parent: HTMLElement): HTMLElement {
  const grid = createEl('div', 'editor-grid');
  parent.appendChild(grid);
  return grid;
}

export function createButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createEl('button', className, label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

/** フォーカス中 input の blur 再描画で click が消えるのを防ぐ */
export function createActionButton(
  label: string,
  className: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = createButton(label, className, () => {
    flushPendingEditorInputs();
    onClick();
  });
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  return button;
}
