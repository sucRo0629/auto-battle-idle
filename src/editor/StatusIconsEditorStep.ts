import {
  resolveStatusDisplayCategoryLabel,
  STATUS_BADGE_SLOT_ORDER,
  type StatusDisplayCategory,
} from '../battle/statusEffectDisplay.ts';
import {
  readBattleHudTheme,
  resolveStatusIconFallbackColor,
  type BattleHudTheme,
} from '../render/battleHudTheme.ts';
import {
  getStatusBadgePentagonImageBySlot,
  getStatusIconImage,
  onStatusIconsReady,
  preloadStatusIcons,
  STATUS_BADGE_PENTAGON_FILES,
  type StatusBadgePentagonSlot,
} from '../render/StatusIconRegistry.ts';
import {
  drawStatusBadgeBlock,
  measureStatusBadgeBlock,
  STATUS_BADGE_EFFECT_ICON_PX,
  STATUS_BADGE_PENTAGON_PX,
  statusBadgeOutlinePad,
  type StatusBadgeDrawItem,
  type StatusBadgeTheme,
} from '../render/statusBadgeRenderer.ts';
import { createEl } from './formUtils.ts';

type PreviewVariant = {
  label: string;
  badge: StatusBadgeDrawItem;
};

const PENTAGON_PREVIEW_SLOTS: Array<{
  slot: StatusBadgePentagonSlot;
  label: string;
}> = [
  { slot: 'buff', label: 'buff' },
  { slot: 'debuff', label: 'debuff' },
  { slot: 'passiveBuff', label: 'passive buff' },
  { slot: 'passiveDebuff', label: 'passive debuff' },
];

const PREVIEW_VARIANTS: PreviewVariant[] = [
  {
    label: 'buff',
    badge: {
      category: 'hot',
      kind: 'buff',
      remainingRatio: 1,
      isPassive: false,
    },
  },
  {
    label: 'debuff',
    badge: {
      category: 'hot',
      kind: 'debuff',
      remainingRatio: 1,
      isPassive: false,
    },
  },
  {
    label: 'passive buff',
    badge: {
      category: 'hot',
      kind: 'buff',
      remainingRatio: 1,
      isPassive: true,
    },
  },
  {
    label: 'passive debuff',
    badge: {
      category: 'hot',
      kind: 'debuff',
      remainingRatio: 1,
      isPassive: true,
    },
  },
  {
    label: 'stack ×3',
    badge: {
      category: 'hot',
      kind: 'buff',
      remainingRatio: 1,
      isPassive: false,
      stackCount: 3,
    },
  },
  {
    label: '残 50%',
    badge: {
      category: 'hot',
      kind: 'buff',
      remainingRatio: 0.5,
      isPassive: false,
    },
  },
];

function badgeThemeFromHud(theme: BattleHudTheme): StatusBadgeTheme {
  return {
    iconSize: theme.statusBadgeIconSize,
    rowOverlap: theme.statusBadgeOverlap,
    overlayColor: theme.statusBadgeOverlay,
    iconOutlineColor: theme.statusIconOutlineColor,
    iconOutlineWidth: theme.statusIconOutlineWidth,
    iconFallbackAlpha: theme.statusIconFallbackAlpha,
    resolveIconFallbackColor: (category) =>
      resolveStatusIconFallbackColor(category, theme),
  };
}

function renderBadgeCanvas(
  canvas: HTMLCanvasElement,
  badge: StatusBadgeDrawItem,
  scale: number,
  theme: StatusBadgeTheme,
): void {
  const layout = measureStatusBadgeBlock(
    [badge],
    scale,
    theme.iconSize,
    theme.iconOutlineWidth,
    theme.rowOverlap,
  );
  const outlinePad = statusBadgeOutlinePad(theme.iconOutlineWidth, scale);
  const canvasW = layout.totalWidth + outlinePad * 2;
  const canvasH = layout.totalHeight + outlinePad * 2;

  canvas.width = canvasW;
  canvas.height = canvasH;
  canvas.style.width = `${canvasW}px`;
  canvas.style.height = `${canvasH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasW, canvasH);
  drawStatusBadgeBlock(
    ctx,
    outlinePad + layout.totalWidth / 2,
    outlinePad,
    [badge],
    scale,
    theme,
  );
}

export class StatusIconsEditorStep {
  private scale = 1;
  private themeHost!: HTMLElement;
  private pentagonGrid!: HTMLElement;
  private gridBody!: HTMLElement;
  private scaleLabel!: HTMLElement;
  private readonly unsubscribeIconsReady: () => void;

  constructor(private readonly host: HTMLElement) {
    this.unsubscribeIconsReady = onStatusIconsReady(() => {
      this.renderPentagonGrid();
      this.renderGrid();
    });
    this.mount();
    void preloadStatusIcons().then(() => {
      this.renderPentagonGrid();
      this.renderGrid();
    });
  }

  destroy(): void {
    this.unsubscribeIconsReady();
    this.host.replaceChildren();
  }

  private mount(): void {
    this.host.replaceChildren();

    const intro = createEl(
      'p',
      'editor-subtitle status-icons-preview-intro',
      'src/assets/status-icons/*.png の生 PNG と、戦闘 HUD（×1）と同じ statusBadgeRenderer 描画を並べます。バッジは 20×20px スロット（行高 24px、五角形 20×20 + 効果アイコン 12×12 中央）。buff 五角形は上 2px、debuff は下 2px。pentagon-*.png / {category}.png を差し替えてください。',
    );
    this.host.appendChild(intro);

    const controls = createEl('div', 'status-icons-preview-controls');
    const scaleDown = createEl('button', 'editor-btn', '−');
    scaleDown.type = 'button';
    this.scaleLabel = createEl('span', 'status-icons-preview-scale-label', '');
    const scaleUp = createEl('button', 'editor-btn', '＋');
    scaleUp.type = 'button';

    scaleDown.addEventListener('click', () => {
      this.scale = Math.max(1, this.scale - 1);
      this.updateScaleLabel();
      this.renderPentagonGrid();
      this.renderGrid();
    });
    scaleUp.addEventListener('click', () => {
      this.scale = Math.min(8, this.scale + 1);
      this.updateScaleLabel();
      this.renderPentagonGrid();
      this.renderGrid();
    });

    controls.append(scaleDown, this.scaleLabel, scaleUp);
    this.host.appendChild(controls);

    this.themeHost = createEl('div', 'battle-canvas-host status-icons-preview-theme');
    this.themeHost.hidden = true;
    this.host.appendChild(this.themeHost);

    const pentagonSection = createEl('section', 'status-icons-pentagon-section');
    pentagonSection.appendChild(
      createEl('h3', 'status-icons-pentagon-heading', '五角形背景 PNG'),
    );
    this.pentagonGrid = createEl('div', 'status-icons-pentagon-grid');
    pentagonSection.appendChild(this.pentagonGrid);
    this.host.appendChild(pentagonSection);

    const table = createEl('table', 'status-icons-preview-table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(
      createEl('th', '', 'category'),
      createEl('th', '', '生 PNG'),
      ...PREVIEW_VARIANTS.map((variant) => createEl('th', '', variant.label)),
    );
    thead.appendChild(headRow);
    table.appendChild(thead);

    this.gridBody = document.createElement('tbody');
    table.appendChild(this.gridBody);
    this.host.appendChild(table);

    this.updateScaleLabel();
    this.renderPentagonGrid();
    this.renderGrid();
  }

  private updateScaleLabel(): void {
    const hudTheme = readBattleHudTheme(this.themeHost);
    const iconPx = hudTheme.statusBadgeIconSize * this.scale;
    this.scaleLabel.textContent =
      this.scale === 1
        ? `HUD 同等 ×1（${iconPx}px）`
        : `表示倍率 ×${this.scale}（${iconPx}px）`;
  }

  private renderPentagonGrid(): void {
    if (!this.pentagonGrid) return;
    const hudTheme = readBattleHudTheme(this.themeHost);
    const size = STATUS_BADGE_PENTAGON_PX * this.scale;
    this.pentagonGrid.replaceChildren();

    for (const entry of PENTAGON_PREVIEW_SLOTS) {
      const card = createEl('div', 'status-icons-pentagon-card');
      card.appendChild(
        createEl('div', 'status-icons-pentagon-label', entry.label),
      );
      card.appendChild(
        createEl(
          'div',
          'status-icons-pentagon-filename',
          STATUS_BADGE_PENTAGON_FILES[entry.slot],
        ),
      );

      const img = document.createElement('img');
      img.className = 'status-icons-preview-raw-img';
      img.alt = entry.label;
      img.width = size;
      img.height = size;
      const image = getStatusBadgePentagonImageBySlot(entry.slot);
      if (image) {
        img.src = image.src;
      } else {
        card.appendChild(
          createEl('span', 'status-icons-preview-missing', '未ロード'),
        );
      }
      card.appendChild(img);
      this.pentagonGrid.appendChild(card);
    }
  }

  private renderGrid(): void {
    if (!this.gridBody) return;
    const hudTheme = readBattleHudTheme(this.themeHost);
    const badgeTheme = badgeThemeFromHud(hudTheme);
    this.gridBody.replaceChildren();

    for (const category of STATUS_BADGE_SLOT_ORDER) {
      const row = document.createElement('tr');

      const nameCell = createEl('td', 'status-icons-preview-category');
      nameCell.append(
        createEl('span', 'status-icons-preview-category-id', category),
        createEl(
          'span',
          'status-icons-preview-category-label',
          resolveStatusDisplayCategoryLabel(category),
        ),
      );
      row.appendChild(nameCell);

      const rawCell = createEl('td', 'status-icons-preview-raw');
      const rawImg = document.createElement('img');
      rawImg.className = 'status-icons-preview-raw-img';
      rawImg.alt = category;
      rawImg.width = STATUS_BADGE_EFFECT_ICON_PX * this.scale;
      rawImg.height = STATUS_BADGE_EFFECT_ICON_PX * this.scale;
      const image = getStatusIconImage(category);
      if (image) {
        rawImg.src = image.src;
      } else {
        rawImg.hidden = true;
        rawCell.appendChild(
          createEl('span', 'status-icons-preview-missing', '未ロード'),
        );
      }
      rawCell.appendChild(rawImg);
      row.appendChild(rawCell);

      for (const variant of PREVIEW_VARIANTS) {
        const cell = createEl('td', 'status-icons-preview-badge');
        const canvas = document.createElement('canvas');
        canvas.className = 'status-icons-preview-canvas status-badge-canvas';
        renderBadgeCanvas(
          canvas,
          { ...variant.badge, category },
          this.scale,
          badgeTheme,
        );
        cell.appendChild(canvas);
        row.appendChild(cell);
      }

      this.gridBody.appendChild(row);
    }
  }
}

export function listStatusIconPreviewCategories(): StatusDisplayCategory[] {
  return STATUS_BADGE_SLOT_ORDER.slice();
}
