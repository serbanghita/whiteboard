import { World, Entity } from "@serbanghita-gamedev/ecs";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";
import ToolStateComponent from "./component/ToolStateComponent";
import IsMousePressed from "./component/IsMousePressed";
import RectangleComponent from "./component/RectangleComponent";
import CircleComponent from "./component/CircleComponent";
import LineComponent, { ArrowStyle } from "./component/LineComponent";
import CameraComponent from "./component/CameraComponent";
import { worldToScreen } from "./camera";
import { getEntityBounds } from "./shape";
import { PALETTE, normalizeColor } from "./palette";

const PANEL_Z_INDEX = '900'; // above the text overlay (500), under the menu (1000)
const PANEL_GAP = 40;
const PANEL_HEIGHT = 48; // fixed: 32px content row + 2*8px padding
// jsdom has no layout, so offsetWidth reads 0 there - fall back to rough
// real-browser widths so positioning math stays sane in tests. The compact
// icon bar is far narrower than the old swatch rows.
const FALLBACK_WIDTH_COLORS = 110;
const FALLBACK_WIDTH_LINE = 170;
const FALLBACK_POPOVER_WIDTH = 140;
const FALLBACK_POPOVER_HEIGHT = 240;

const ACTIVE_SWATCH_BORDER = '2px solid #1a73e8';
const RESTING_SWATCH_BORDER = '1px solid #d0d0d0';
const ACTIVE_SEGMENT_BG = '#e0e0e0';

// The 'none' sentinel swatch: white with a diagonal line.
const NONE_SWATCH_BG = 'linear-gradient(135deg, #ffffff 44%, #f95b60 44%, #f95b60 56%, #ffffff 56%)';

// Thickness slider levels -> world-unit widths. strokeWidth stays a raw
// width in the data (level 1 = absent key, canonical); the level scale
// exists only here in the panel.
const LEVEL_WIDTHS = [1, 2, 4, 6];

type ShapeKind = 'rectangle' | 'circle' | 'line';
type PopoverId = 'stroke' | 'fill' | 'start' | 'end';

function widthToLevel(width: number | undefined): number {
  const w = width ?? 1;
  let best = 1;
  for (let i = 0; i < LEVEL_WIDTHS.length; i++) {
    if (Math.abs(LEVEL_WIDTHS[i] - w) <= Math.abs(LEVEL_WIDTHS[best - 1] - w)) best = i + 1;
  }
  return best;
}

/**
 * Contextual properties bar for the single selected shape: compact icon
 * items whose looks depict the current value (DESIGN.md "Whiteboard entity -
 * panel"), each opening a popover - Stroke (color grid + thickness slider)
 * for all shapes, Fill (color grid incl. 'none') for rect/circle, Start/End
 * cap pickers for lines.
 *
 * Plain DOM sibling of the canvas inside the wrapper (canvas mouse handlers
 * never see panel clicks, so selection survives them). update() runs every
 * frame after the systems (callbackFnAfterSystemsUpdate): it shows/positions
 * the panel next to the selected shape and hides it during any gesture.
 * Per-frame refresh only PATCHES state (borders, slider value, highlights) -
 * the popover DOM is never rebuilt while open, so slider drags don't fight
 * the refresh.
 */
export default class PropertiesPanel {
  private $panel: HTMLDivElement;
  private $popover: HTMLDivElement;
  // Rebuild guard: selection has no change event (SelectionSystem clears
  // isDirty before this runs), so diff the shown entity instead.
  private shownEntityId: string | null = null;
  private shownKind: ShapeKind | null = null;
  private openPopover: PopoverId | null = null;
  // Set by position(): the bar sits below the shape, so the popover flips above.
  private panelBelowShape = false;
  private readonly onDocumentMouseDown: (e: MouseEvent) => void;
  private readonly onDocumentKeyDown: (e: KeyboardEvent) => void;

  constructor(
    private world: World,
    wrapper: HTMLElement,
    private canCommit: () => boolean,
    private onCommit: () => void,
  ) {
    this.$panel = document.createElement('div');
    this.$panel.className = 'properties-panel';
    this.$panel.style.position = 'absolute';
    this.$panel.style.display = 'none';
    this.$panel.style.alignItems = 'center';
    this.$panel.style.gap = '8px';
    this.$panel.style.background = 'white';
    this.$panel.style.borderRadius = '8px';
    this.$panel.style.boxShadow = '2px 4px 8px rgba(0, 0, 0, 0.15)';
    this.$panel.style.padding = '8px';
    this.$panel.style.boxSizing = 'border-box';
    this.$panel.style.height = `${PANEL_HEIGHT}px`;
    this.$panel.style.whiteSpace = 'nowrap';
    this.$panel.style.userSelect = 'none';
    this.$panel.style.zIndex = PANEL_Z_INDEX;
    wrapper.appendChild(this.$panel);

    // Single popover element, child of the panel: absolute positioning keeps
    // it glued to the bar through per-frame repositioning, and clicks stay
    // inside the panel subtree (never reaching the canvas).
    this.$popover = document.createElement('div');
    this.$popover.className = 'properties-popover';
    this.$popover.style.position = 'absolute';
    this.$popover.style.display = 'none';
    this.$popover.style.background = 'white';
    this.$popover.style.borderRadius = '8px';
    this.$popover.style.boxShadow = '2px 4px 8px rgba(0, 0, 0, 0.15)';
    this.$popover.style.padding = '10px';
    this.$popover.style.boxSizing = 'border-box';
    this.$popover.style.zIndex = PANEL_Z_INDEX;
    this.$panel.appendChild(this.$popover);

    this.$panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('[data-item]') as HTMLElement | null;
      if (item) {
        this.togglePopover(item.dataset.item as PopoverId);
        return;
      }
      const swatch = target.closest('[data-color]') as HTMLElement | null;
      if (swatch) {
        this.applyColor(swatch.dataset.prop as 'fill' | 'stroke', swatch.dataset.color!);
        return;
      }
      const segment = target.closest('[data-arrow]') as HTMLElement | null;
      if (segment) {
        this.applyArrow(segment.dataset.lineend as 'start' | 'end', segment.dataset.arrow as ArrowStyle);
      }
    });

    // Commit on 'change' ONLY (fires once on release): 'input' fires per
    // pixel of drag, which would push one undo action and one peer broadcast
    // per pixel through the action differ.
    this.$panel.addEventListener('change', (e) => {
      const slider = e.target as HTMLElement;
      if (slider.matches('input[data-slider="stroke-width"]')) {
        this.applyStrokeWidth(Number((slider as HTMLInputElement).value));
      }
    });

    this.onDocumentMouseDown = (e) => {
      if (this.openPopover && !this.$panel.contains(e.target as Node)) {
        this.closePopover();
      }
    };
    this.onDocumentKeyDown = (e) => {
      if (e.key === 'Escape' && this.openPopover) {
        this.closePopover();
        // The popover owned this Escape - don't let it also cancel a draw
        // or reach other document handlers.
        e.stopPropagation();
      }
    };
    document.addEventListener('mousedown', this.onDocumentMouseDown, true);
    document.addEventListener('keydown', this.onDocumentKeyDown, true);
  }

  /** Called every frame after all systems ran. */
  public update(): void {
    const entity = this.visibleEntity();
    if (!entity) {
      this.hide();
      return;
    }
    const kind = shapeKind(entity);
    const camera = this.world.getEntity('camera')?.getComponent(CameraComponent);
    if (!kind || !camera) {
      this.hide();
      return;
    }

    if (entity.id !== this.shownEntityId || kind !== this.shownKind) {
      this.rebuildContent(kind);
      this.shownEntityId = entity.id;
      this.shownKind = kind;
    }
    this.$panel.style.display = 'flex';
    this.refreshActiveStates(entity);
    this.position(entity, camera);
    if (this.openPopover) this.positionPopover();
  }

  public destroy(): void {
    document.removeEventListener('mousedown', this.onDocumentMouseDown, true);
    document.removeEventListener('keydown', this.onDocumentKeyDown, true);
    this.$panel.remove();
  }

  /** The single selected shape, or null while the panel must stay hidden. */
  private visibleEntity(): Entity | null {
    const toolState = this.world.getEntity('tool')?.getComponent(ToolStateComponent);
    if (!toolState || toolState.currentTool !== 'cursor') return null;
    // drawState covers click-click line drawing, where no button is held.
    if (toolState.drawState !== 'IDLE' || toolState.editingEntityId) return null;
    const cursor = this.world.getEntity('cursor');
    if (!cursor || cursor.hasComponent(IsMousePressed)) return null;
    const selection = this.world.getEntity('selection')?.getComponent(SelectionRectangleComponent);
    if (!selection || selection.entities.size !== 1) return null;
    return selection.entities.values().next().value ?? null;
  }

  // ------------------------------------------------------------------ bar

  private rebuildContent(kind: ShapeKind): void {
    // innerHTML swap destroys any open popover element, so re-create the
    // popover child and reset its state with it.
    this.openPopover = null;
    if (kind === 'line') {
      this.$panel.innerHTML =
        `${this.iconItem('stroke', 'Stroke')}${this.separator()}` +
        `${this.iconItem('start', 'Line start')}${this.iconItem('end', 'Line end')}`;
    } else {
      this.$panel.innerHTML = `${this.iconItem('fill', 'Fill')}${this.separator()}${this.iconItem('stroke', 'Stroke')}`;
    }
    this.$popover.style.display = 'none';
    this.$popover.innerHTML = '';
    this.$panel.appendChild(this.$popover);
  }

  private iconItem(id: PopoverId, title: string): string {
    return `<button data-item="${id}" title="${title}" style="width:26px;height:26px;padding:0;border:none;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;">
        <span data-icon="${id}" style="display:inline-block;width:18px;height:18px;box-sizing:border-box;border-radius:3px;font:12px/18px sans-serif;text-align:center;color:#333;"></span></button>`;
  }

  private separator(): string {
    return `<div style="width:1px;height:24px;background:#e0e0e0;"></div>`;
  }

  // ------------------------------------------------------------------ popover

  private togglePopover(id: PopoverId): void {
    if (this.openPopover === id) {
      this.closePopover();
      return;
    }
    this.openPopover = id;
    this.$popover.innerHTML = this.popoverContent(id);
    this.$popover.style.display = 'block';
    this.positionPopover();
    // Show current state immediately - the per-frame refresh would leave the
    // fresh popover unstyled for one frame.
    const entity = this.visibleEntity();
    if (entity) this.refreshActiveStates(entity);
  }

  private closePopover(): void {
    this.openPopover = null;
    this.$popover.style.display = 'none';
    this.$popover.innerHTML = '';
  }

  private popoverContent(id: PopoverId): string {
    if (id === 'fill') {
      return `${this.sectionLabel('Fill Color')}${this.swatchGrid('fill', true)}`;
    }
    if (id === 'stroke') {
      // "No stroke" isn't representable (undefined renders as the default
      // stroke), so the stroke grid excludes the 'none' sentinel.
      // The Stroke Style section lands with the dashed/dotted milestone.
      return `${this.sectionLabel('Stroke Color')}${this.swatchGrid('stroke', false)}` +
        `${this.sectionLabel('Stroke Thickness')}
        <input type="range" data-slider="stroke-width" min="1" max="4" step="1" style="width:100%;margin:2px 0 0;">`;
    }
    const arrowGlyph = id === 'start' ? '&#8592;' : '&#8594;';
    return `${this.sectionLabel(id === 'start' ? 'Start' : 'End')}
      <button data-lineend="${id}" data-arrow="none" style="height:24px;padding:0 8px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:11px;font-family:sans-serif;color:#333;">None</button>
      <button data-lineend="${id}" data-arrow="arrow" style="height:24px;padding:0 8px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:13px;font-family:sans-serif;color:#333;">${arrowGlyph}</button>`;
  }

  private sectionLabel(text: string): string {
    return `<div style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;margin:6px 0 4px;">${text}</div>`;
  }

  private swatchGrid(prop: 'fill' | 'stroke', includeNone: boolean): string {
    const entries = PALETTE.filter((e) => includeNone || e.hex !== null);
    const swatches = entries.map((e) => {
      const bg = e.hex === null ? `background:${NONE_SWATCH_BG};` : `background:${e.hex};`;
      const color = e.hex === null ? 'none' : e.hex;
      return `<button data-prop="${prop}" data-color="${color}" title="${e.label}" style="width:20px;height:20px;padding:0;border:${RESTING_SWATCH_BORDER};border-radius:4px;${bg}cursor:pointer;"></button>`;
    }).join('');
    return `<div style="display:grid;grid-template-columns:repeat(4, 20px);gap:4px;">${swatches}</div>`;
  }

  private positionPopover(): void {
    // Anchor below the bar (above when the bar itself sits below the shape,
    // so the popover never covers the selected shape).
    if (this.panelBelowShape) {
      this.$popover.style.top = 'auto';
      this.$popover.style.bottom = `calc(100% + 4px)`;
    } else {
      this.$popover.style.bottom = 'auto';
      this.$popover.style.top = `${PANEL_HEIGHT + 4}px`;
    }

    const icon = this.openPopover
      ? this.$panel.querySelector<HTMLElement>(`[data-item="${this.openPopover}"]`)
      : null;
    const popWidth = this.$popover.offsetWidth || FALLBACK_POPOVER_WIDTH;
    let left = icon ? icon.offsetLeft : 0;

    // Clamp within the wrapper (panel-relative coordinates).
    const wrapper = this.$panel.parentElement!;
    const wrapperWidth = wrapper.clientWidth;
    const panelLeft = parseFloat(this.$panel.style.left) || 0;
    if (wrapperWidth > 0) {
      left = Math.min(left, wrapperWidth - panelLeft - popWidth);
      left = Math.max(left, -panelLeft);
    }
    this.$popover.style.left = `${left}px`;
  }

  // ------------------------------------------------------------------ state

  private shapeComp(entity: Entity): RectangleComponent | CircleComponent | LineComponent | null {
    if (entity.hasComponent(RectangleComponent)) return entity.getComponent(RectangleComponent);
    if (entity.hasComponent(CircleComponent)) return entity.getComponent(CircleComponent);
    if (entity.hasComponent(LineComponent)) return entity.getComponent(LineComponent);
    return null;
  }

  /** Per-frame PATCH of icons + open-popover state; never rebuilds DOM. */
  private refreshActiveStates(entity: Entity): void {
    const comp = this.shapeComp(entity);
    if (!comp) return;
    const isLine = comp instanceof LineComponent;
    const stroke = normalizeColor(comp.strokeColor);
    const fill = isLine ? undefined : normalizeColor((comp as RectangleComponent | CircleComponent).fillColor);
    const level = widthToLevel(comp.strokeWidth);

    // Icons depict the current value.
    const strokeIcon = this.$panel.querySelector<HTMLElement>('[data-icon="stroke"]');
    if (strokeIcon) {
      strokeIcon.style.border = `${level}px solid ${stroke ?? '#202020'}`;
      strokeIcon.style.background = 'transparent';
    }
    const fillIcon = this.$panel.querySelector<HTMLElement>('[data-icon="fill"]');
    if (fillIcon) {
      fillIcon.style.border = RESTING_SWATCH_BORDER;
      fillIcon.style.background = fill === undefined ? NONE_SWATCH_BG : fill;
    }
    if (isLine) {
      const line = comp as LineComponent;
      const startIcon = this.$panel.querySelector<HTMLElement>('[data-icon="start"]');
      if (startIcon) startIcon.innerHTML = line.arrowStart === 'arrow' ? '&#8592;' : '&#8212;';
      const endIcon = this.$panel.querySelector<HTMLElement>('[data-icon="end"]');
      if (endIcon) endIcon.innerHTML = line.arrowEnd === 'arrow' ? '&#8594;' : '&#8212;';
    }

    if (!this.openPopover) return;

    if (this.openPopover === 'fill' || this.openPopover === 'stroke') {
      const current = this.openPopover === 'fill' ? (fill ?? 'none') : (stroke ?? 'none');
      this.$popover.querySelectorAll<HTMLElement>('[data-color]').forEach((swatch) => {
        swatch.style.border = swatch.dataset.color === current ? ACTIVE_SWATCH_BORDER : RESTING_SWATCH_BORDER;
      });
      const slider = this.$popover.querySelector<HTMLInputElement>('input[data-slider="stroke-width"]');
      if (slider && document.activeElement !== slider) {
        slider.value = String(level);
      }
    } else {
      const line = comp as LineComponent;
      const current = (this.openPopover === 'start' ? line.arrowStart : line.arrowEnd) ?? 'none';
      this.$popover.querySelectorAll<HTMLElement>('[data-arrow]').forEach((segment) => {
        segment.style.background = segment.dataset.arrow === current ? ACTIVE_SEGMENT_BG : 'transparent';
      });
    }
  }

  // ------------------------------------------------------------------ commits

  private applyColor(prop: 'fill' | 'stroke', color: string): void {
    const entity = this.visibleEntity();
    if (!entity) return;
    const comp = this.shapeComp(entity);
    if (!comp) return;
    const isLine = comp instanceof LineComponent;
    if (prop === 'fill' && isLine) return;

    // 'none' (fills only) stores undefined - the absent key is canonical, so
    // a cleared fill is JSON-identical to a never-filled shape.
    const target = color === 'none' ? undefined : color;
    const current = prop === 'fill'
      ? (comp as RectangleComponent | CircleComponent).fillColor
      : comp.strokeColor;
    if (normalizeColor(current) === target) return;
    if (!this.canCommit()) return;
    if (prop === 'fill') {
      (comp as RectangleComponent | CircleComponent).fillColor = target;
    } else {
      comp.strokeColor = target;
    }
    this.refreshActiveStates(entity);
    this.onCommit();
  }

  private applyStrokeWidth(level: number): void {
    const entity = this.visibleEntity();
    if (!entity) return;
    const comp = this.shapeComp(entity);
    if (!comp) return;
    // Level 1 stores undefined (absent = width 1, canonical).
    const width = level <= 1 ? undefined : LEVEL_WIDTHS[level - 1];
    if ((comp.strokeWidth ?? 1) === (width ?? 1)) return;
    if (!this.canCommit()) return;
    comp.strokeWidth = width;
    this.refreshActiveStates(entity);
    this.onCommit();
  }

  private applyArrow(end: 'start' | 'end', value: ArrowStyle): void {
    const entity = this.visibleEntity();
    if (!entity || !entity.hasComponent(LineComponent)) return;
    const comp = entity.getComponent(LineComponent);
    const current = (end === 'start' ? comp.arrowStart : comp.arrowEnd) ?? 'none';
    if (current === value) return;
    if (!this.canCommit()) return;
    // 'none' is stored as undefined so snapshots stay canonical: a line
    // toggled arrow->none re-serializes byte-identically to a fresh line.
    const stored = value === 'none' ? undefined : value;
    if (end === 'start') {
      comp.arrowStart = stored;
    } else {
      comp.arrowEnd = stored;
    }
    this.refreshActiveStates(entity);
    this.onCommit();
  }

  // ------------------------------------------------------------------ layout

  private position(entity: Entity, camera: CameraComponent): void {
    const bounds = getEntityBounds(entity);
    if (!bounds) {
      this.hide();
      return;
    }
    const topLeft = worldToScreen(camera, bounds.x, bounds.y);
    const screenWidth = bounds.width * camera.scale;
    const screenHeight = bounds.height * camera.scale;

    const wrapper = this.$panel.parentElement!;
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    const panelWidth = this.$panel.offsetWidth
      || (this.shownKind === 'line' ? FALLBACK_WIDTH_LINE : FALLBACK_WIDTH_COLORS);

    let left = topLeft.x + screenWidth / 2 - panelWidth / 2;
    let top = topLeft.y - PANEL_GAP - PANEL_HEIGHT;
    this.panelBelowShape = top < 0;
    if (this.panelBelowShape) {
      top = topLeft.y + screenHeight + PANEL_GAP;
    }
    // Clamp into the viewport - but only when the wrapper has real layout
    // (jsdom reports 0x0, and clamping against that squashes everything to 0).
    if (wrapperWidth > 0) {
      left = Math.max(0, Math.min(left, wrapperWidth - panelWidth));
    }
    if (wrapperHeight > 0) {
      top = Math.max(0, Math.min(top, wrapperHeight - PANEL_HEIGHT));
      // A downward popover that would clip at the wrapper bottom flips above.
      const popHeight = this.$popover.offsetHeight || FALLBACK_POPOVER_HEIGHT;
      if (!this.panelBelowShape && this.openPopover
        && top + PANEL_HEIGHT + 4 + popHeight > wrapperHeight && top - popHeight > 0) {
        this.panelBelowShape = true;
      }
    }
    this.$panel.style.left = `${left}px`;
    this.$panel.style.top = `${top}px`;
  }

  private hide(): void {
    this.$panel.style.display = 'none';
    this.shownEntityId = null;
    this.shownKind = null;
    this.closePopover();
  }
}

function shapeKind(entity: Entity): ShapeKind | null {
  if (entity.hasComponent(RectangleComponent)) return 'rectangle';
  if (entity.hasComponent(CircleComponent)) return 'circle';
  if (entity.hasComponent(LineComponent)) return 'line';
  return null;
}
