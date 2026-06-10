interface FocusRestoreState {
  selector: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function buildFocusRestoreState(): FocusRestoreState | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    return null;
  }
  const parts: string[] = [`input.editor-input`];
  if (active.id) {
    parts.push(`#${CSS.escape(active.id)}`);
  }
  if (active.dataset.field) {
    parts.push(`[data-field="${CSS.escape(active.dataset.field)}"]`);
  }
  return {
    selector: parts.join(''),
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
  };
}

function restoreFocusState(state: FocusRestoreState | null): void {
  if (!state) return;
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    state.selector,
  );
  if (!input) return;
  input.focus({ preventScroll: true });
  if (
    state.selectionStart !== null &&
    state.selectionEnd !== null &&
    typeof input.setSelectionRange === 'function'
  ) {
    input.setSelectionRange(state.selectionStart, state.selectionEnd);
  }
}

/** DOM 再構築後もフォーカス入力を維持する */
export function preserveScrollDuring(fn: () => void): void {
  const focusState = buildFocusRestoreState();
  fn();
  requestAnimationFrame(() => {
    restoreFocusState(focusState);
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
  options?: { id?: string; placeholder?: string; readonly?: boolean },
): HTMLInputElement {
  const input = createEl('input', 'editor-input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  if (options?.id) input.id = options.id;
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
    readonly?: boolean;
    /** この値のとき input を空表示（省略値用） */
    emptyWhen?: number;
    placeholder?: string;
    /** 互換用。DOM には反映せず、保存時バリデーションで検証する */
    min?: number;
    max?: number;
    step?: number;
  },
): HTMLInputElement {
  const input = createEl('input', 'editor-input') as HTMLInputElement;
  input.type = 'text';
  input.inputMode = 'decimal';
  const showEmpty =
    options?.emptyWhen !== undefined && value === options.emptyWhen;
  input.value = showEmpty ? '' : String(value);
  if (options?.id) input.id = options.id;
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
    onInput(parsed);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('change', commit);
  return input;
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
  const button = createButton(label, className, onClick);
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  return button;
}
