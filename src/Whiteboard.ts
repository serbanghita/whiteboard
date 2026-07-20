import { Entity, Query, World } from "@serbanghita-gamedev/ecs";
import { WebGLRenderer } from "./renderer";
import { applyWheel, screenToWorld } from "./camera";
import { HistoryManager } from "./HistoryManager";

// Components
import RectangleComponent from "./component/RectangleComponent";
import CircleComponent from "./component/CircleComponent";
import LineComponent from "./component/LineComponent";
import IsRendered from "./component/IsRendered";
import IsSelected from "./component/IsSelected";
import MouseComponent from "./component/MouseComponent";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";
import IsMouseOver from "./component/IsMouseOver";
import IsMousePressed from "./component/IsMousePressed";
import ToolStateComponent, { ToolType } from "./component/ToolStateComponent";
import DrawnOnLayer from "./component/DrawnOnLayer";
import Layer from "./component/Layer";
import CameraComponent from "./component/CameraComponent";
import LineAttachmentComponent from "./component/LineAttachmentComponent";
import TextComponent from "./component/TextComponent";

// Systems
import RenderingSystem from "./system/RenderSystem";
import SelectionSystem from "./system/SelectionSystem";
import MousePressSystem from "./system/MousePressSystem";
import MouseOverSystem from "./system/MouseOverSystem";
import MouseOutSystem from "./system/MouseOutSystem";
import DragSystem from "./system/DragSystem";
import ResizeSystem from "./system/ResizeSystem";
import ConnectionSystem from "./system/ConnectionSystem";
import ToolStateSystem from "./system/ToolStateSystem";
import RectangleDrawSystem from "./system/RectangleDrawSystem";
import CircleDrawSystem from "./system/CircleDrawSystem";
import LineDrawSystem from "./system/LineDrawSystem";
import LineAttachmentSystem from "./system/LineAttachmentSystem";
import TextEditSystem from "./system/TextEditSystem";
import HistorySystem from "./system/HistorySystem";

export class Whiteboard {
  public world: World;
  private renderer: WebGLRenderer;
  private container: HTMLElement;
  private $wrapper: HTMLDivElement;
  private $canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private isActive: boolean = false;
  private resizeObserver: ResizeObserver;
  // Assigned in bindEvents(), which the constructor always calls.
  private boundKeydown!: (e: KeyboardEvent) => void;
  private boundMouseup!: (e: MouseEvent) => void;
  // Shapes on the board (excludes the selection entity's bounding box);
  // created once in setupECS - createQuery throws on duplicate ids.
  private shapesQuery!: Query;
  private history!: HistoryManager;
  private $undoBtn!: HTMLButtonElement;
  private $redoBtn!: HTMLButtonElement;
  private loadedShapeCounter = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.world = new World();

    // 1. Setup DOM
    this.$wrapper = document.createElement('div');
    this.$wrapper.style.position = 'relative';
    this.$wrapper.style.width = '100%';
    this.$wrapper.style.height = '100%';
    this.$wrapper.style.overflow = 'hidden';
    this.container.appendChild(this.$wrapper);

    // Floating Menu
    const menu = document.createElement('div');
    menu.className = 'floating-menu';
    menu.style.position = 'absolute';
    menu.style.left = '20px';
    menu.style.top = '50%';
    menu.style.transform = 'translateY(-50%)';
    menu.style.background = 'white';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '2px 4px 8px rgba(0, 0, 0, 0.15)';
    menu.style.padding = '8px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';
    menu.style.gap = '4px';
    menu.style.zIndex = '1000';
    menu.innerHTML = `
        <button data-tool="cursor" class="active" title="Select (V)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
        </button>
        <button data-tool="rectangle" title="Rectangle (R)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
        </button>
        <button data-tool="circle" title="Circle (C)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><circle cx="12" cy="12" r="10"/></svg>
        </button>
        <button data-tool="line" title="Line (L)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        </button>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="undo" title="Undo (Cmd+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
        </button>
        <button data-action="redo" title="Redo (Cmd+Shift+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
        </button>
    `;
    this.$undoBtn = menu.querySelector('[data-action="undo"]')!;
    this.$redoBtn = menu.querySelector('[data-action="redo"]')!;
    this.$wrapper.appendChild(menu);

    this.$canvas = document.createElement('canvas');
    this.$canvas.style.display = 'block';
    this.$canvas.style.width = '100%';
    this.$canvas.style.height = '100%';
    this.$canvas.style.background = 'white';
    this.$canvas.style.cursor = 'default';
    this.$canvas.style.imageRendering = 'pixelated';
    this.$wrapper.appendChild(this.$canvas);

    const glContext = this.$canvas.getContext('webgl');
    if (!glContext) throw new Error('WebGL is not supported in this browser.');
    this.gl = glContext;
    this.renderer = new WebGLRenderer(this.gl);
    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // 2. Setup ECS
    this.setupECS();

    // Baseline snapshot = the empty board, so the first action is undoable.
    this.history = new HistoryManager(this.saveShapes(), () => this.updateHistoryButtons());
    this.updateHistoryButtons();

    // 3. Bind events
    this.bindEvents(menu);

    // Initial resize
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.$wrapper);

    this.world.start();
  }

  private static componentsRegistered = false;

  private setupECS() {
    if (!Whiteboard.componentsRegistered) {
      this.world.registerComponents([
        IsRendered, IsMouseOver, IsMousePressed, MouseComponent,
        RectangleComponent, SelectionRectangleComponent, CircleComponent,
        LineComponent, IsSelected, ToolStateComponent, DrawnOnLayer,
        Layer, CameraComponent, LineAttachmentComponent, TextComponent
      ]);
      Whiteboard.componentsRegistered = true;
    }

    const cursor = this.world.createEntity('cursor');
    cursor.addComponent(MouseComponent, { x: 0, y: 0 });

    const selection = this.world.createEntity('selection');
    selection.addComponent(SelectionRectangleComponent);

    const tool = this.world.createEntity('tool');
    tool.addComponent(ToolStateComponent, { currentTool: "cursor", drawState: "IDLE" });

    const defaultLayer = this.world.createEntity('default-layer');
    defaultLayer.addComponent(Layer, { id: 'default-layer', zIndex: 0, visible: true });

    const camera = this.world.createEntity('camera');
    camera.addComponent(CameraComponent, { x: 0, y: 0, scale: 1 });

    const SHAPE_COMPONENTS = [RectangleComponent, CircleComponent, LineComponent];
    const allRenderableQuery = this.world.createQuery("renderables", { all: [IsRendered] });
    const selectableShapesQuery = this.world.createQuery("selectableShapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
    const shapesForMouseOverQuery = this.world.createQuery("shapesMouseOver", { any: SHAPE_COMPONENTS, none: [IsMouseOver, SelectionRectangleComponent] });
    const shapesForMouseOutQuery = this.world.createQuery("shapesMouseOut", { all: [IsMouseOver], any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
    const selectionQuery = this.world.createQuery("selection", { all: [SelectionRectangleComponent] });
    const toolQuery = this.world.createQuery("tool", { all: [ToolStateComponent] });
    this.shapesQuery = this.world.createQuery("shapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
    // Shapes a connection line can attach to (lines can't be snapped to).
    const connectableShapesQuery = this.world.createQuery("connectableShapes", { any: [RectangleComponent, CircleComponent], none: [SelectionRectangleComponent] });
    const attachedLinesQuery = this.world.createQuery("attachedLines", { all: [LineComponent, LineAttachmentComponent] });
    const historyQuery = this.world.createQuery("history", { all: [MouseComponent] });

    this.world.createSystem(ToolStateSystem, toolQuery);
    this.world.createSystem(RectangleDrawSystem, toolQuery);
    this.world.createSystem(CircleDrawSystem, toolQuery);
    this.world.createSystem(LineDrawSystem, toolQuery);
    this.world.createSystem(ResizeSystem, selectionQuery);
    this.world.createSystem(ConnectionSystem, selectionQuery, connectableShapesQuery);
    // Text editing targets the same rect+circle set a connection can snap to.
    this.world.createSystem(TextEditSystem, connectableShapesQuery, this.$wrapper);
    this.world.createSystem(MousePressSystem, selectableShapesQuery);
    this.world.createSystem(DragSystem, selectionQuery);
    // After every system that moves/resizes shapes, before Selection/Render:
    // re-pins attached line endpoints so they follow their shapes.
    this.world.createSystem(LineAttachmentSystem, attachedLinesQuery);
    this.world.createSystem(MouseOverSystem, shapesForMouseOverQuery);
    this.world.createSystem(MouseOutSystem, shapesForMouseOutQuery);
    this.world.createSystem(SelectionSystem, selectionQuery);
    this.world.createSystem(RenderingSystem, allRenderableQuery, this.renderer);
    // Last: snapshots the finished frame's state on each release edge.
    this.world.createSystem(HistorySystem, historyQuery, () => this.recordHistory());
  }

  // Commits an open text edit by blurring its textarea (the blur handler is
  // the commit); used before camera/viewport changes that would leave the
  // overlay's geometry stale.
  private commitTextEditIfAny() {
    const toolState = this.world.getEntity('tool')?.getComponent(ToolStateComponent);
    if (toolState?.editingEntityId && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  private resize() {
    this.commitTextEditIfAny();
    const width = this.$wrapper.clientWidth || window.innerWidth;
    const height = this.$wrapper.clientHeight || window.innerHeight;
    const pixelRatio = window.devicePixelRatio || 1;
    this.$canvas.width = width * pixelRatio;
    this.$canvas.height = height * pixelRatio;
    this.gl.viewport(0, 0, this.$canvas.width, this.$canvas.height);
    this.renderer.setResolution(width, height);
  }

  private get camera() {
    return this.world.getEntity('camera')!.getComponent(CameraComponent);
  }

  private get cursor() {
    return this.world.getEntity('cursor')!;
  }

  private bindEvents(menu: HTMLDivElement) {
    this.$canvas.addEventListener('mouseenter', () => { this.isActive = true; });
    this.$canvas.addEventListener('mouseleave', () => { this.isActive = false; });

    this.$canvas.addEventListener('mousemove', (e) => {
      const mouse = this.cursor.getComponent(MouseComponent);
      mouse.screenX = e.offsetX;
      mouse.screenY = e.offsetY;
      const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
      mouse.setXY(w.x, w.y);
    });

    this.$canvas.addEventListener('mousedown', (e) => {
      const mouse = this.cursor.getComponent(MouseComponent);
      mouse.screenX = e.offsetX;
      mouse.screenY = e.offsetY;
      const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
      mouse.setXY(w.x, w.y);
      mouse.press(w.x, w.y);
      if (!this.cursor.hasComponent(IsMousePressed)) {
        this.cursor.addComponent(IsMousePressed);
      }
    });

    this.boundMouseup = (e: MouseEvent) => {
      this.cursor.getComponent(MouseComponent).release();
      this.cursor.removeComponent(IsMousePressed);
    };
    window.addEventListener('mouseup', this.boundMouseup, { capture: true });

    // Double-click starts text editing (consumed by TextEditSystem via the
    // same event-time edge-counter idiom as press()).
    this.$canvas.addEventListener('dblclick', (e) => {
      const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
      this.cursor.getComponent(MouseComponent).doubleClick(w.x, w.y);
    });

    this.$canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // The overlay's geometry cannot follow the camera - commit first (the
      // blur handler is the commit), then zoom/pan.
      this.commitTextEditIfAny();
      applyWheel(this.camera, this.cursor.getComponent(MouseComponent), e);
    }, { passive: false });

    menu.addEventListener('click', (e) => {
      const actionButton = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (actionButton) {
        if (actionButton.dataset.action === 'undo') this.undo();
        else if (actionButton.dataset.action === 'redo') this.redo();
        return;
      }

      const button = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
      if (!button) return;

      const toolName = button.dataset.tool as ToolType;
      if (!toolName) return;

      menu.querySelectorAll('[data-tool]').forEach(btn => (btn as HTMLElement).style.background = 'transparent');
      button.style.background = '#e0e0e0';

      const toolEntity = this.world.getEntity('tool');
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);
        if (toolState.previewEntityId) {
          this.world.removeEntity(toolState.previewEntityId);
        }
        toolState.currentTool = toolName;
        toolState.reset();
      }
    });

    this.boundKeydown = (e: KeyboardEvent) => {
      if (!this.isActive) return;

      // While a text edit overlay is open, the textarea owns the keyboard:
      // its native undo must win over the whiteboard's, and Escape commits
      // the edit instead of cancelling a draw. (Belt: the textarea stops
      // propagation; this check is the braces.)
      const toolStateGuard = this.world.getEntity('tool')?.getComponent(ToolStateComponent);
      if (toolStateGuard?.editingEntityId) return;

      // Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Ctrl+Y = redo.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        if (e.key === 'y' || e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
        return;
      }

      if (e.key === 'Escape') {
        const toolEntity = this.world.getEntity('tool');
        if (toolEntity) {
          const toolState = toolEntity.getComponent(ToolStateComponent);
          if (toolState.drawState === 'FIRST_POINT_SET') {
            if (toolState.previewEntityId) {
              this.world.removeEntity(toolState.previewEntityId);
            }
            toolState.reset();
          }
        }
      }
    };
    document.addEventListener('keydown', this.boundKeydown);
  }

  public destroy() {
    this.resizeObserver.disconnect();
    window.removeEventListener('mouseup', this.boundMouseup, { capture: true });
    document.removeEventListener('keydown', this.boundKeydown);
    this.world.stop();
    this.container.removeChild(this.$wrapper);
  }

  /**
   * Serializes all shapes (no camera) to a deterministic JSON string:
   * entity ids and per-field colors are preserved so a load→save roundtrip
   * is byte-identical, and line attachments survive. The in-progress draw
   * preview (if any) is excluded. This string is the undo/redo snapshot unit.
   */
  public saveShapes(): string {
    const toolEntity = this.world.getEntity('tool');
    const previewId = toolEntity?.getComponent(ToolStateComponent).previewEntityId;

    const shapes = [...this.shapesQuery.execute().values()]
      .filter(entity => entity.id !== previewId)
      .map(entity => {
        const data: any = { id: entity.id, type: '' };
        if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          data.type = 'rectangle';
          data.x = comp.x; data.y = comp.y;
          data.width = comp.width; data.height = comp.height;
          data.fillColor = comp.fillColor;
          data.strokeColor = comp.strokeColor;
          data.strokeWidth = comp.strokeWidth;
        } else if (entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          data.type = 'circle';
          data.x = comp.x; data.y = comp.y;
          data.radius = comp.radius;
          data.fillColor = comp.fillColor;
          data.strokeColor = comp.strokeColor;
          data.strokeWidth = comp.strokeWidth;
        } else if (entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          data.type = 'line';
          data.x1 = comp.x1; data.y1 = comp.y1;
          data.x2 = comp.x2; data.y2 = comp.y2;
          data.strokeColor = comp.strokeColor;
          data.strokeWidth = comp.strokeWidth;
          if (entity.hasComponent(LineAttachmentComponent)) {
            const att = entity.getComponent(LineAttachmentComponent);
            data.attachment = { start: att.start, end: att.end };
          }
        }
        if ((data.type === 'rectangle' || data.type === 'circle') && entity.hasComponent(TextComponent)) {
          const text = entity.getComponent(TextComponent);
          // Full props (not just content), so a future styling UI needs no
          // snapshot migration. Optional field - legacy snapshots load fine.
          data.text = { content: text.content, fontSize: text.fontSize, fontFamily: text.fontFamily, color: text.color };
        }
        return data;
      });

    return JSON.stringify(shapes);
  }

  /**
   * Applies a saveShapes() snapshot as a differential update: existing
   * entities are patched in place (ids preserved, so attachment pins stay
   * valid), missing ones are recreated with their original id, and shapes
   * absent from the snapshot are removed. The selection is cleared first so
   * it never holds references to removed entities.
   */
  public loadShapes(json: string) {
    const shapes = JSON.parse(json) as any[];

    const selectionEntity = this.world.getEntity('selection');
    if (selectionEntity) {
      selectionEntity.getComponent(SelectionRectangleComponent).clear();
    }

    const stale = new Set([...this.shapesQuery.execute().keys()]);

    shapes.forEach((shape: any) => {
      // Legacy save files (v1.0) have no ids and use a single `color` field.
      const id: string = shape.id ?? `loaded-shape-${this.loadedShapeCounter++}`;
      const strokeColor = shape.strokeColor ?? shape.color;
      stale.delete(id);

      let entity = this.world.getEntity(id);
      if (!entity) {
        entity = this.world.createEntity(id);
        entity.addComponent(IsRendered);
        if (shape.type === 'rectangle') {
          entity.addComponent(RectangleComponent, {
            x: shape.x, y: shape.y,
            width: shape.width, height: shape.height,
            fillColor: shape.fillColor, strokeColor, strokeWidth: shape.strokeWidth
          });
        } else if (shape.type === 'circle') {
          entity.addComponent(CircleComponent, {
            x: shape.x, y: shape.y,
            radius: shape.radius,
            fillColor: shape.fillColor, strokeColor, strokeWidth: shape.strokeWidth
          });
        } else if (shape.type === 'line') {
          entity.addComponent(LineComponent, {
            x1: shape.x1, y1: shape.y1,
            x2: shape.x2, y2: shape.y2,
            strokeColor, strokeWidth: shape.strokeWidth
          });
        }
      } else {
        if (shape.type === 'rectangle' && entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          comp.x = shape.x; comp.y = shape.y;
          comp.width = shape.width; comp.height = shape.height;
          comp.fillColor = shape.fillColor; comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
        } else if (shape.type === 'circle' && entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          comp.x = shape.x; comp.y = shape.y;
          comp.radius = shape.radius;
          comp.fillColor = shape.fillColor; comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
        } else if (shape.type === 'line' && entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          comp.x1 = shape.x1; comp.y1 = shape.y1;
          comp.x2 = shape.x2; comp.y2 = shape.y2;
          comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
        }
      }

      // Reconcile the attachment component with the snapshot.
      if (shape.type === 'line') {
        const start = shape.attachment?.start ?? null;
        const end = shape.attachment?.end ?? null;
        if (start || end) {
          if (entity.hasComponent(LineAttachmentComponent)) {
            const att = entity.getComponent(LineAttachmentComponent);
            att.start = start;
            att.end = end;
          } else {
            entity.addComponent(LineAttachmentComponent, { start, end });
          }
        } else if (entity.hasComponent(LineAttachmentComponent)) {
          entity.removeComponent(LineAttachmentComponent);
        }
      }

      // Reconcile the text component with the snapshot (add-or-update /
      // remove) - without the remove branch, undoing "added text" would
      // leave the text behind on patched entities. Updates mutate fields in
      // place: a bare re-addComponent would hit the ecs Component.init
      // props-wipe quirk.
      if (shape.type === 'rectangle' || shape.type === 'circle') {
        if (shape.text) {
          if (entity.hasComponent(TextComponent)) {
            const text = entity.getComponent(TextComponent);
            text.content = shape.text.content;
            text.fontSize = shape.text.fontSize;
            text.fontFamily = shape.text.fontFamily;
            text.color = shape.text.color;
          } else {
            entity.addComponent(TextComponent, {
              content: shape.text.content,
              fontSize: shape.text.fontSize,
              fontFamily: shape.text.fontFamily,
              color: shape.text.color,
            });
          }
        } else if (entity.hasComponent(TextComponent)) {
          entity.removeComponent(TextComponent);
        }
      }
    });

    stale.forEach(id => this.world.removeEntity(id));
  }

  public recordHistory(): void {
    this.history.pushState(this.saveShapes());
  }

  public undo(): void {
    if (!this.canApplyHistory()) return;
    const state = this.history.undo();
    if (state !== null) this.loadShapes(state);
  }

  public redo(): void {
    if (!this.canApplyHistory()) return;
    const state = this.history.redo();
    if (state !== null) this.loadShapes(state);
  }

  // Applying a snapshot mid-drag/mid-draw would fight the active gesture.
  private canApplyHistory(): boolean {
    if (this.cursor.hasComponent(IsMousePressed)) return false;
    const toolEntity = this.world.getEntity('tool');
    return !toolEntity || toolEntity.getComponent(ToolStateComponent).drawState === 'IDLE';
  }

  private updateHistoryButtons(): void {
    this.$undoBtn.disabled = !this.history.canUndo();
    this.$undoBtn.style.opacity = this.history.canUndo() ? '1' : '0.3';
    this.$redoBtn.disabled = !this.history.canRedo();
    this.$redoBtn.style.opacity = this.history.canRedo() ? '1' : '0.3';
  }

  public save(): string {
    const cam = this.camera;
    return JSON.stringify({
      version: "1.1",
      camera: { x: cam.x, y: cam.y, scale: cam.scale },
      shapes: JSON.parse(this.saveShapes())
    });
  }

  public load(json: string) {
    const data = JSON.parse(json);

    if (data.camera) {
      const cam = this.camera;
      cam.x = data.camera.x;
      cam.y = data.camera.y;
      cam.scale = data.camera.scale;
    }

    this.loadShapes(JSON.stringify(data.shapes ?? []));
    // A loaded file becomes an undo checkpoint.
    this.recordHistory();
  }
}
