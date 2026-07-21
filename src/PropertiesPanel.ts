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

export const PALETTE = ['#ffffff', '#000000', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];

const PANEL_Z_INDEX = '900'; // above the text overlay (500), under the menu (1000)
const PANEL_GAP = 40;
const PANEL_HEIGHT = 48; // fixed: 32px content row + 2*8px padding
// jsdom has no layout, so offsetWidth reads 0 there - fall back to rough
// real-browser widths so positioning math stays sane in tests.
const FALLBACK_WIDTH_COLORS = 420;
const FALLBACK_WIDTH_LINE = 280;

const ACTIVE_SWATCH_BORDER = '2px solid #1a73e8';
const RESTING_SWATCH_BORDER = '1px solid #d0d0d0';
const ACTIVE_SEGMENT_BG = '#e0e0e0';

type ShapeKind = 'rectangle' | 'circle' | 'line';

// The draw systems stamp the named colors 'black'/'white'; the palette is
// hex. Normalize so the default swatches light up as active.
const NAMED_TO_HEX: Record<string, string> = { black: '#000000', white: '#ffffff' };

function normalizeColor(color: string | undefined): string | undefined {
  if (color === undefined) return undefined;
  const lower = color.toLowerCase();
  return NAMED_TO_HEX[lower] ?? lower;
}

/**
 * Contextual properties bar for the single selected shape: fill/stroke color
 * swatches for rectangles and circles, start/end arrow toggles for lines.
 *
 * Plain DOM sibling of the canvas inside the wrapper (canvas mouse handlers
 * never see panel clicks, so selection survives them). update() runs every
 * frame after the systems (callbackFnAfterSystemsUpdate): it shows/positions
 * the panel next to the selected shape and hides it during any gesture.
 */
export default class PropertiesPanel {
  private $panel: HTMLDivElement;
  // Rebuild guard: selection has no change event (SelectionSystem clears
  // isDirty before this runs), so diff the shown entity instead.
  private shownEntityId: string | null = null;
  private shownKind: ShapeKind | null = null;

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

    this.$panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
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
  }

  public destroy(): void {
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

  private rebuildContent(kind: ShapeKind): void {
    if (kind === 'line') {
      this.$panel.innerHTML = `${this.segmentGroup('Start', 'start')}${this.separator()}${this.segmentGroup('End', 'end')}`;
    } else {
      this.$panel.innerHTML = `${this.swatchGroup('Fill', 'fill')}${this.separator()}${this.swatchGroup('Stroke', 'stroke')}`;
    }
  }

  private swatchGroup(label: string, prop: 'fill' | 'stroke'): string {
    const swatches = PALETTE.map(color => `
        <button data-prop="${prop}" data-color="${color}" title="${label} ${color}" style="width:20px;height:20px;padding:0;border:${RESTING_SWATCH_BORDER};border-radius:4px;background:${color};cursor:pointer;"></button>`).join('');
    return `<span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${label}</span>${swatches}`;
  }

  private segmentGroup(label: string, end: 'start' | 'end'): string {
    const segment = (value: ArrowStyle, text: string) => `
        <button data-lineend="${end}" data-arrow="${value}" style="height:24px;padding:0 8px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:11px;font-family:sans-serif;color:#333;">${text}</button>`;
    return `<span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${label}</span>${segment('none', 'None')}${segment('arrow', 'Arrow')}`;
  }

  private separator(): string {
    return `<div style="width:1px;height:24px;background:#e0e0e0;"></div>`;
  }

  private refreshActiveStates(entity: Entity): void {
    if (entity.hasComponent(LineComponent)) {
      const comp = entity.getComponent(LineComponent);
      this.$panel.querySelectorAll<HTMLElement>('[data-arrow]').forEach((segment) => {
        const current = (segment.dataset.lineend === 'start' ? comp.arrowStart : comp.arrowEnd) ?? 'none';
        segment.style.background = segment.dataset.arrow === current ? ACTIVE_SEGMENT_BG : 'transparent';
      });
      return;
    }
    const comp = entity.hasComponent(RectangleComponent)
      ? entity.getComponent(RectangleComponent)
      : entity.getComponent(CircleComponent);
    this.$panel.querySelectorAll<HTMLElement>('[data-color]').forEach((swatch) => {
      const current = normalizeColor(swatch.dataset.prop === 'fill' ? comp.fillColor : comp.strokeColor);
      swatch.style.border = swatch.dataset.color === current ? ACTIVE_SWATCH_BORDER : RESTING_SWATCH_BORDER;
    });
  }

  private applyColor(prop: 'fill' | 'stroke', color: string): void {
    const entity = this.visibleEntity();
    if (!entity || (!entity.hasComponent(RectangleComponent) && !entity.hasComponent(CircleComponent))) return;
    const comp = entity.hasComponent(RectangleComponent)
      ? entity.getComponent(RectangleComponent)
      : entity.getComponent(CircleComponent);
    const current = prop === 'fill' ? comp.fillColor : comp.strokeColor;
    if (normalizeColor(current) === color) return;
    if (!this.canCommit()) return;
    if (prop === 'fill') {
      comp.fillColor = color;
    } else {
      comp.strokeColor = color;
    }
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
    if (top < 0) {
      top = topLeft.y + screenHeight + PANEL_GAP;
    }
    // Clamp into the viewport - but only when the wrapper has real layout
    // (jsdom reports 0x0, and clamping against that squashes everything to 0).
    if (wrapperWidth > 0) {
      left = Math.max(0, Math.min(left, wrapperWidth - panelWidth));
    }
    if (wrapperHeight > 0) {
      top = Math.max(0, Math.min(top, wrapperHeight - PANEL_HEIGHT));
    }
    this.$panel.style.left = `${left}px`;
    this.$panel.style.top = `${top}px`;
  }

  private hide(): void {
    this.$panel.style.display = 'none';
    this.shownEntityId = null;
    this.shownKind = null;
  }
}

function shapeKind(entity: Entity): ShapeKind | null {
  if (entity.hasComponent(RectangleComponent)) return 'rectangle';
  if (entity.hasComponent(CircleComponent)) return 'circle';
  if (entity.hasComponent(LineComponent)) return 'line';
  return null;
}
