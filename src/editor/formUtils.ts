/** DOM 再構築後もページスクロール位置を維持する */
export function preserveScrollDuring(fn: () => void): void {
  const scrollY = window.scrollY;
  fn();
  window.scrollTo(0, scrollY);
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
  options?: { id?: string; min?: number; step?: number; readonly?: boolean },
): HTMLInputElement {
  const input = createEl('input', 'editor-input') as HTMLInputElement;
  input.type = 'number';
  input.value = String(value);
  if (options?.id) input.id = options.id;
  if (options?.min !== undefined) input.min = String(options.min);
  if (options?.step !== undefined) input.step = String(options.step);
  if (options?.readonly) input.readOnly = true;
  input.addEventListener('input', () => {
    if (options?.readonly) return;
    const parsed = Number(input.value);
    onInput(Number.isNaN(parsed) ? 0 : parsed);
  });
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
