import { System, Query, World, Entity } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import TextComponent from "../component/TextComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { IRenderer } from "../renderer";
import { getConnectionPoints, getSelectionHandles, HANDLE_RADIUS } from "../handles";
import CameraComponent from "../component/CameraComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { getInteriorBox } from "../textLayout";
import TextTextureCache from "../textRaster";
import ZIndexComponent from "../component/ZIndexComponent";
import IsLockedComponent from "../component/IsLockedComponent";
import { TextureHandle } from "../renderer/IRenderer";
import { DEFAULT_STROKE } from "../palette";

// Selection visuals: a tight blue bounding box around the selected shapes,
// with gray ring resize handles at its corners. A single selected line gets
// handles at its endpoints instead of a box. Handle positions come from
// handles.ts, the same geometry ResizeSystem hit-tests against.
const SELECTION_STROKE_COLOR = "rgb(66 133 244)";
const HANDLE_FILL_COLOR = "white";
const HANDLE_STROKE_COLOR = "rgb(170 170 170)";
const HANDLE_STROKE_WIDTH = 3;

// Arrowhead dimensions in world units (they zoom with the line, like strokes).
// Clamped so a head never covers more than half of its line - the draw
// minimum is a 5-unit line, far shorter than a full 12-unit head.
const ARROW_LENGTH = 12;
const ARROW_HALF_WIDTH = 5;

export default class RenderingSystem extends System {
  // Per-entity text textures; retained state lives here, the renderer stays
  // immediate-mode.
  private textCache: TextTextureCache;
  private hatchTextures: Map<string, TextureHandle> = new Map();

  public constructor(
    public world: World,
    public query: Query,
    public renderer: IRenderer,
  ) {
    super(world, query);
    this.textCache = new TextTextureCache(renderer);
  }

  public update(now: number): void {
    // Push the camera to the renderer before drawing. Selection UI sizes are
    // divided by the scale so handles and strokes stay constant on screen
    // (shape geometry and strokes scale with the world).
    let scale = 1;
    const cameraEntity = this.world.getEntity('camera');
    if (cameraEntity && cameraEntity.hasComponent(CameraComponent)) {
      const cam = cameraEntity.getComponent(CameraComponent);
      scale = cam.scale;
      this.renderer.setCamera(cam.scale, cam.x, cam.y);
    }

    this.renderer.clear();

    const toolEntity = this.world.getEntity('tool');
    const editingEntityId = toolEntity && toolEntity.hasComponent(ToolStateComponent)
      ? toolEntity.getComponent(ToolStateComponent).editingEntityId
      : null;
    const selectionEntity = this.world.getEntity('selection');
    const selectionComp = selectionEntity ? selectionEntity.getComponent(SelectionRectangleComponent) : null;
    // Entities whose text texture is in use this frame; everything else in
    // the cache is swept below.
    const liveTextIds = new Set<string>();

    // Shapes. Hovering has no visual effect - feedback only exists for the
    // selected shapes, via the overlay below. Painter's order: each shape's
    // text draws right after the shape, so later shapes still cover it.
    
    const entities = [...this.query.execute().values()];
    entities.sort((a, b) => {
      const zA = a.hasComponent(ZIndexComponent) ? a.getComponent(ZIndexComponent).zIndex : 0;
      const zB = b.hasComponent(ZIndexComponent) ? b.getComponent(ZIndexComponent).zIndex : 0;
      return zA - zB;
    });

    entities.forEach((entity) => {
      if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
          strokeColor: comp.strokeColor || DEFAULT_STROKE,
          fillColor: comp.fillColor,
          strokeWidth: comp.strokeWidth,
          strokeStyle: comp.strokeStyle
        });
        this.drawEntityText(entity, scale, editingEntityId, selectionComp, liveTextIds);
      } else if (entity.hasComponent(CircleComponent)) {
        const comp = entity.getComponent(CircleComponent);
        this.renderer.circle(comp.x, comp.y, comp.radius, {
          strokeColor: comp.strokeColor || DEFAULT_STROKE,
          fillColor: comp.fillColor,
          strokeWidth: comp.strokeWidth,
          strokeStyle: comp.strokeStyle
        });
        this.drawEntityText(entity, scale, editingEntityId, selectionComp, liveTextIds);
      } else if (entity.hasComponent(LineComponent)) {
        const comp = entity.getComponent(LineComponent);
        const stroke = comp.strokeColor || DEFAULT_STROKE;
        // Styled lines trim the dash walk at each arrow base (same effective
        // length as drawArrowhead), so a gap never separates head from line.
        const arrowBase = Math.min(ARROW_LENGTH, comp.length / 2);
        this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
          strokeColor: stroke,
          strokeWidth: comp.strokeWidth,
          strokeStyle: comp.strokeStyle,
          trimStart: comp.arrowStart === 'arrow' ? arrowBase : 0,
          trimEnd: comp.arrowEnd === 'arrow' ? arrowBase : 0
        });
        // Arrowheads cap the line, so they draw after it.
        if (comp.arrowEnd === 'arrow') {
          this.drawArrowhead(comp.x2, comp.y2, comp.x1, comp.y1, stroke);
        }
        if (comp.arrowStart === 'arrow') {
          this.drawArrowhead(comp.x1, comp.y1, comp.x2, comp.y2, stroke);
        }
      }

      this.drawLockOverlay(entity, scale, liveTextIds);
    });

    this.textCache.sweep(liveTextIds);

    // Selection overlay - always on top of the shapes.
    this.renderSelectionOverlay(scale);

    // Snap targets while a connection line is being dragged - on top of all.
    this.renderConnectionTargets(scale);
  }

  private getHatchTexture(color: string): TextureHandle {
    if (this.hatchTextures.has(color)) return this.hatchTextures.get(color)!;
    
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(-1, 9); ctx.lineTo(9, -1);
    ctx.moveTo(-1, 1); ctx.lineTo(1, -1);
    ctx.moveTo(7, 9); ctx.lineTo(9, 7);
    ctx.stroke();
    
    const handle = this.renderer.createTextureFromCanvas(canvas);
    this.hatchTextures.set(color, handle);
    return handle;
  }

  private drawLockOverlay(entity: Entity, scale: number, liveTextIds: Set<string>): void {
    if (!entity.hasComponent(IsLockedComponent)) return;
    const lockInfo = entity.getComponent(IsLockedComponent);
    
    let bounds;
    if (entity.hasComponent(RectangleComponent)) {
      const c = entity.getComponent(RectangleComponent);
      bounds = { x: c.x, y: c.y, width: c.width, height: c.height };
    } else if (entity.hasComponent(CircleComponent)) {
      const c = entity.getComponent(CircleComponent);
      bounds = { x: c.x - c.radius, y: c.y - c.radius, width: c.radius * 2, height: c.radius * 2 };
    } else if (entity.hasComponent(LineComponent)) {
      const c = entity.getComponent(LineComponent);
      const minX = Math.min(c.x1, c.x2);
      const minY = Math.min(c.y1, c.y2);
      bounds = { x: minX, y: minY, width: Math.abs(c.x2 - c.x1), height: Math.abs(c.y2 - c.y1) };
    }
    
    if (!bounds) return;
    
    // Draw hatch overlay
    const hatch = this.getHatchTexture(lockInfo.color);
    this.renderer.texturedQuad(hatch, bounds.x, bounds.y, bounds.width, bounds.height);
    
    // Draw truncated name
    let name = lockInfo.userName;
    if (name.length > 12) name = name.substring(0, 10) + '...';
    
    const style = { content: name, fontSize: 12, fontFamily: 'sans-serif', color: lockInfo.color };
    const nameBox = { x: bounds.x, y: bounds.y - 16, width: 100, height: 16 };
    const textId = `lock_${entity.id}`;
    liveTextIds.add(textId);
    
    const texture = this.textCache.get(textId, style, nameBox, scale, false);
    if (texture) {
      this.renderer.texturedQuad(texture, nameBox.x, nameBox.y, nameBox.width, nameBox.height);
    }
  }

  /**
   * Draws an entity's text block as a textured quad over its interior box.
   * Skipped while the entity is being edited (the DOM overlay replaces it)
   * and for empty/absent text. While the entity is being handle-resized the
   * cached texture is stretched to the live box instead of re-rasterizing
   * every frame; it re-wraps crisply when the handle is released.
   */
  private drawEntityText(
    entity: Entity,
    scale: number,
    editingEntityId: string | null,
    selectionComp: SelectionRectangleComponent | null,
    liveTextIds: Set<string>,
  ): void {
    if (entity.id === editingEntityId || !entity.hasComponent(TextComponent)) {
      return;
    }
    const text = entity.getComponent(TextComponent);
    if (!text.content) {
      return;
    }
    const box = getInteriorBox(entity);
    if (!box) {
      return;
    }

    liveTextIds.add(entity.id);
    const freezeSize = !!selectionComp?.resizeHandleId && selectionComp.hasEntity(entity);
    const texture = this.textCache.get(entity.id, text.properties, box, scale, freezeSize);
    if (texture) {
      this.renderer.texturedQuad(texture, box.x, box.y, box.width, box.height);
    }
  }

  /**
   * While a line endpoint is being dragged - a connection drag out of a
   * shape's dot, or a ResizeSystem drag of a line's start/end handle - show
   * the connection points of the shape the endpoint is currently snapped to,
   * ring-highlighting the glue point. No snap target -> no dots.
   */
  private renderConnectionTargets(scale: number): void {
    const selectionEntity = this.world.getEntity('selection');
    if (!selectionEntity) {
      return;
    }
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    // Corner resizes claim 'nw'/'ne'/'sw'/'se'; only line endpoint drags
    // claim 'start'/'end'.
    const endpointResize =
      selectionComp.resizeHandleId === 'start' || selectionComp.resizeHandleId === 'end';
    if (!selectionComp.connectionHandleId && !endpointResize) {
      return;
    }

    const snap = selectionComp.connectionSnap;
    if (!snap) {
      return;
    }
    const target = this.world.getEntity(snap.entityId);
    if (!target) {
      return;
    }
    getConnectionPoints(target).forEach((handle) => {
      this.renderer.circle(handle.x, handle.y, HANDLE_RADIUS / scale, {
        fillColor: SELECTION_STROKE_COLOR,
      });
      if (snap.handleId === handle.id) {
        this.renderer.circle(handle.x, handle.y, (HANDLE_RADIUS + 3) / scale, {
          strokeColor: SELECTION_STROKE_COLOR,
          strokeWidth: 2 / scale,
        });
      }
    });
  }

  private renderSelectionOverlay(scale: number): void {
    const handles = getSelectionHandles(this.world);
    if (handles.length === 0) {
      return;
    }

    // Corner handles come with the bounding box; endpoint handles (single
    // selected line) are drawn without one (a line's box would be degenerate
    // for horizontal/vertical lines).
    const isBoxSelection = handles.some((handle) => handle.id === 'nw');
    if (isBoxSelection) {
      const selectionEntity = this.world.getEntity('selection');
      if (selectionEntity && selectionEntity.hasComponent(RectangleComponent)) {
        const bounds = selectionEntity.getComponent(RectangleComponent);
        this.renderer.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, {
          strokeColor: SELECTION_STROKE_COLOR,
          strokeWidth: 1 / scale
        });
      }
    }

    handles.forEach((handle) => {
      const isConnectionHandle = handle.id === 'n' || handle.id === 'e' || handle.id === 's' || handle.id === 'w';

      if (isConnectionHandle) {
        this.renderer.circle(handle.x, handle.y, HANDLE_RADIUS / scale, {
          fillColor: SELECTION_STROKE_COLOR,
        });
      } else {
        this.drawHandle(handle.x, handle.y, scale);
      }
    });
  }

  /**
   * Filled triangular arrowhead with its tip at (tipX, tipY), pointing away
   * from (fromX, fromY) along the line direction.
   */
  private drawArrowhead(tipX: number, tipY: number, fromX: number, fromY: number, color: string): void {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      return;
    }
    const effLen = Math.min(ARROW_LENGTH, len / 2);
    const effHalfWidth = effLen * ARROW_HALF_WIDTH / ARROW_LENGTH;
    const ux = dx / len;
    const uy = dy / len;
    const baseX = tipX - ux * effLen;
    const baseY = tipY - uy * effLen;
    this.renderer.triangle(
      tipX, tipY,
      baseX - uy * effHalfWidth, baseY + ux * effHalfWidth,
      baseX + uy * effHalfWidth, baseY - ux * effHalfWidth,
      { fillColor: color },
    );
  }

  private drawHandle(x: number, y: number, scale: number): void {
    this.renderer.circle(x, y, HANDLE_RADIUS / scale, {
      fillColor: HANDLE_FILL_COLOR,
      strokeColor: HANDLE_STROKE_COLOR,
      strokeWidth: HANDLE_STROKE_WIDTH / scale
    });
  }
}
