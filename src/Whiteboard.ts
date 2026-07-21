import { Entity, Query, World } from "@serbanghita-gamedev/ecs";
import { WebGLRenderer } from "./renderer";
import { applyWheel, screenToWorld } from "./camera";
import { HistoryManager, Action } from "./HistoryManager";
import PropertiesPanel from "./PropertiesPanel";
import { EventEmitter, WhiteboardEvent } from "./EventEmitter";

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
import TargetTransformComponent from "./component/TargetTransformComponent";
import ZIndexComponent from "./component/ZIndexComponent";
import IsLockedComponent from "./component/IsLockedComponent";
import VersionComponent from "./component/VersionComponent";
import { SYSTEM_DESIGN_TOOLS } from "./systemDesign";

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
import InterpolationSystem from "./system/InterpolationSystem";

// Screen-pixel offset applied to duplicated shapes (converted to world units
// at the current zoom), so the copy never hides the original exactly.
const DUPLICATE_OFFSET = 16;

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
  private propertiesPanel!: PropertiesPanel;
  private $undoBtn!: HTMLButtonElement;
  private $redoBtn!: HTMLButtonElement;
  private $sysBtn!: HTMLButtonElement;
  private $sysPanel!: HTMLDivElement;
  // Save/Load popup elements (class-queried refs, never DOM ids - ids would
  // collide across Whiteboard instances).
  private $popup!: HTMLDivElement;
  private $popupPanel!: HTMLDivElement;
  private $popupTextarea!: HTMLTextAreaElement;
  private $popupConfirm!: HTMLButtonElement;
  private $popupNotice!: HTMLSpanElement;
  private loadedShapeCounter = 0;
  private duplicateCounter = 0;
  
  public events = new EventEmitter();
  private readOnly = false;
  private preInteractionState: Map<string, any> = new Map();

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
    // The SYS panel buttons come from the registry, in importance order.
    const sysButtons = SYSTEM_DESIGN_TOOLS.map(t => `
            <button data-tool="${t.id}" title="${t.title}" style="width:100%;box-sizing:border-box;height:32px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:flex-start;padding:0 8px;white-space:nowrap;">
                <span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${t.title}</span>
            </button>`).join('');
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
        <button data-action="toggle-sys" title="System Design shapes" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:12px;font-family:sans-serif;font-weight:bold;color:#1a73e8;">SYS</span>
        </button>
        <div class="sys-design-panel">${sysButtons}
        </div>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="undo" title="Undo (Cmd+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
        </button>
        <button data-action="redo" title="Redo (Cmd+Shift+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
        </button>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="save" title="Save JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128190;</button>
        <button data-action="load" title="Load JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128194;</button>
    `;
    this.$undoBtn = menu.querySelector('[data-action="undo"]')!;
    this.$redoBtn = menu.querySelector('[data-action="redo"]')!;
    this.$sysBtn = menu.querySelector('[data-action="toggle-sys"]')!;
    // Styled via properties, not a style attribute: jsdom's CSS parser drops
    // the whole attribute when grid-template-columns follows a shorthand.
    this.$sysPanel = menu.querySelector('.sys-design-panel')!;
    this.$sysPanel.style.display = 'none';
    this.$sysPanel.style.position = 'absolute';
    this.$sysPanel.style.left = 'calc(100% + 8px)';
    this.$sysPanel.style.top = '0';
    this.$sysPanel.style.background = 'white';
    this.$sysPanel.style.borderRadius = '8px';
    this.$sysPanel.style.boxShadow = '2px 4px 8px rgba(0, 0, 0, 0.15)';
    this.$sysPanel.style.padding = '8px';
    this.$sysPanel.style.gridTemplateColumns = 'repeat(2, 132px)';
    this.$sysPanel.style.gap = '4px';
    this.$sysPanel.style.zIndex = '1000';
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
    this.history = new HistoryManager(
      () => this.updateHistoryButtons(),
      (action) => this.applyUndoAction(action),
      (action) => this.applyRedoAction(action),
      (entityId, expectedVersion) => this.checkVersion(entityId, expectedVersion)
    );
    this.updateHistoryButtons();

    // 3. Bind events
    this.bindEvents(menu);

    // Initial resize
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.$wrapper);

    this.propertiesPanel = new PropertiesPanel(
      this.world,
      this.$wrapper,
      () => this.canApplyHistory(),
      () => this.recordHistory(),
    );

    // The panel repositions after the systems have finalized the frame.
    this.world.start({ callbackFnAfterSystemsUpdate: () => this.propertiesPanel.update() });
  }

  private static componentsRegistered = false;

  private setupECS() {
    if (!Whiteboard.componentsRegistered) {
      this.world.registerComponents([
        IsRendered, IsMouseOver, IsMousePressed, MouseComponent,
        RectangleComponent, SelectionRectangleComponent, CircleComponent,
        LineComponent, IsSelected, ToolStateComponent, DrawnOnLayer,
        Layer, CameraComponent, LineAttachmentComponent, TextComponent,
        VersionComponent, IsLockedComponent, TargetTransformComponent,
        ZIndexComponent
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
    const selectableShapesQuery = this.world.createQuery("selectableShapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent, IsLockedComponent] });
    const shapesForMouseOverQuery = this.world.createQuery("shapesMouseOver", { any: SHAPE_COMPONENTS, none: [IsMouseOver, SelectionRectangleComponent, IsLockedComponent] });
    const shapesForMouseOutQuery = this.world.createQuery("shapesMouseOut", { all: [IsMouseOver], any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
    const selectionQuery = this.world.createQuery("selection", { all: [SelectionRectangleComponent] });
    const toolQuery = this.world.createQuery("tool", { all: [ToolStateComponent] });
    this.shapesQuery = this.world.createQuery("shapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
    // Shapes a connection line can attach to (lines can't be snapped to).
    const connectableShapesQuery = this.world.createQuery("connectableShapes", { any: [RectangleComponent, CircleComponent], none: [SelectionRectangleComponent] });
    const attachedLinesQuery = this.world.createQuery("attachedLines", { all: [LineComponent, LineAttachmentComponent] });
    const historyQuery = this.world.createQuery("history", { all: [MouseComponent] });
    const interpolationQuery = this.world.createQuery("interpolation", { all: [TargetTransformComponent] });

    this.world.createSystem(ToolStateSystem, toolQuery);
    this.world.createSystem(RectangleDrawSystem, toolQuery);
    this.world.createSystem(CircleDrawSystem, toolQuery);
    this.world.createSystem(LineDrawSystem, toolQuery);
    this.world.createSystem(ResizeSystem, selectionQuery, connectableShapesQuery);
    this.world.createSystem(ConnectionSystem, selectionQuery, connectableShapesQuery);
    // Text editing targets the same rect+circle set a connection can snap to.
    this.world.createSystem(TextEditSystem, connectableShapesQuery, this.$wrapper, () => this.recordHistory());
    this.world.createSystem(MousePressSystem, selectableShapesQuery);
    this.world.createSystem(DragSystem, selectionQuery, (entityId: string, data: any) => this.events.emit(data));
    // After every system that moves/resizes shapes, before Selection/Render:
    // re-pins attached line endpoints so they follow their shapes.
    this.world.createSystem(LineAttachmentSystem, attachedLinesQuery);
    this.world.createSystem(MouseOverSystem, shapesForMouseOverQuery);
    this.world.createSystem(MouseOutSystem, shapesForMouseOutQuery);
    this.world.createSystem(SelectionSystem, selectionQuery);
    this.world.createSystem(InterpolationSystem, interpolationQuery);
    this.world.createSystem(RenderingSystem, allRenderableQuery, this.renderer);
    // Last: snapshots the finished frame's state on each release edge.
    this.world.createSystem(HistorySystem, historyQuery, () => this.recordHistory());
  }

  public setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly;
    this.events.pause();
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity) {
      toolEntity.getComponent(ToolStateComponent).reset();
    }
    const selection = this.world.getEntity('selection')?.getComponent(SelectionRectangleComponent);
    if (selection) selection.clear();
    this.commitTextEditIfAny();
    if (!readOnly) this.events.resume();
  }

  public abortInteraction() {
    this.commitTextEditIfAny();
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity) {
      const toolState = toolEntity.getComponent(ToolStateComponent);
      if (toolState.previewEntityId) {
        this.world.removeEntity(toolState.previewEntityId);
      }
      toolState.reset();
    }
  }

  public lockShape(entityId: string, info: { userName: string, color: string }) {
    const entity = this.world.getEntity(entityId);
    if (!entity) return;
    if (!entity.hasComponent(IsLockedComponent)) {
      entity.addComponent(IsLockedComponent, info);
    } else {
      const comp = entity.getComponent(IsLockedComponent);
      comp.userName = info.userName;
      comp.color = info.color;
    }
    const selection = this.world.getEntity('selection')?.getComponent(SelectionRectangleComponent);
    if (selection && selection.entities.has(entityId)) {
      selection.removeEntity(entityId);
    }
  }

  public unlockShape(entityId: string) {
    const entity = this.world.getEntity(entityId);
    if (entity && entity.hasComponent(IsLockedComponent)) {
      entity.removeComponent(IsLockedComponent);
    }
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
      if (this.readOnly) return;
      const mouse = this.cursor.getComponent(MouseComponent);
      mouse.screenX = e.offsetX;
      mouse.screenY = e.offsetY;
      const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
      mouse.setXY(w.x, w.y);
    });

    this.$canvas.addEventListener('mousedown', (e) => {
      if (this.readOnly) return;
      
      // Capture pre-interaction state
      this.preInteractionState.clear();
      const shapes = JSON.parse(this.saveShapes());
      for (const shape of shapes) {
        this.preInteractionState.set(shape.id, shape);
      }
      
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
        else if (actionButton.dataset.action === 'toggle-sys') this.toggleSysPanel();
        else if (actionButton.dataset.action === 'save') this.openSavePopup();
        else if (actionButton.dataset.action === 'load') this.openLoadPopup();
        return;
      }

      const button = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
      if (!button) return;

      const toolName = button.dataset.tool as ToolType;
      if (!toolName) return;

      menu.querySelectorAll('[data-tool]').forEach(btn => {
        (btn as HTMLElement).style.background = 'transparent';
        // The explicit set above supersedes any in-flight hover tint.
        delete (btn as HTMLElement).dataset.hoverTint;
      });
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

    // Hover feedback for every menu (and SYS panel) button: buttons at rest
    // (inline background 'transparent') get a light grey tint, tracked with a
    // hoverTint flag so only the tint is ever reset - the active-tool
    // (#e0e0e0) and open-SYS (#e8f0fe) highlights are never touched.
    menu.addEventListener('mouseover', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button || button.disabled) return;
      if (button.style.background !== 'transparent') return;
      button.style.background = '#f0f0f0';
      button.dataset.hoverTint = '1';
    });
    menu.addEventListener('mouseout', (e) => {
      const button = (e.target as HTMLElement).closest('button');
      if (!button || !button.dataset.hoverTint) return;
      // Moving onto the button's own span/svg fires mouseout too - not a leave.
      if (e.relatedTarget instanceof Node && button.contains(e.relatedTarget)) return;
      delete button.dataset.hoverTint;
      button.style.background = 'transparent';
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

      // Cmd/Ctrl+D duplicates the selected shapes (preventDefault blocks the
      // browser's bookmark dialog).
      if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        this.duplicateSelection();
        return;
      }

      // Delete/Backspace removes the selected shapes (Backspace would
      // otherwise navigate back in some browsers).
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.deleteSelection();
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

  // Shows/hides the system-design shape panel (the grid to the right of the
  // menu). The SYS button stays tinted while the panel is open.
  private toggleSysPanel(): void {
    const open = this.$sysPanel.style.display === 'none';
    this.$sysPanel.style.display = open ? 'grid' : 'none';
    this.$sysBtn.style.background = open ? '#e8f0fe' : 'transparent';
    // The explicit set above supersedes any in-flight hover tint.
    delete this.$sysBtn.dataset.hoverTint;
  }

  // Builds the Save/Load popup overlay on first open (lazy: while closed
  // there must be NO popup textarea in the DOM - the text-edit overlay is
  // found by element type). Shown via display:'flex' - the centering styles
  // need flex to apply.
  private buildSaveLoadPopup(): void {
    if (this.$popup) return;
    this.$popup = document.createElement('div');
    this.$popup.style.display = 'none';
    this.$popup.style.position = 'absolute';
    this.$popup.style.inset = '0';
    this.$popup.style.background = 'rgba(0, 0, 0, 0.5)';
    this.$popup.style.zIndex = '2000';
    this.$popup.style.alignItems = 'center';
    this.$popup.style.justifyContent = 'center';
    this.$popup.innerHTML = `
      <div class="save-load-panel" tabindex="-1" style="background:white;padding:20px;border-radius:8px;width:60%;height:60%;display:flex;flex-direction:column;gap:10px;box-shadow:2px 4px 8px rgba(0,0,0,0.15);">
        <textarea class="save-load-textarea" spellcheck="false" style="flex:1;font-family:monospace;font-size:12px;resize:none;border:1px solid #ccc;border-radius:4px;padding:8px;"></textarea>
        <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">
          <span class="save-load-notice" style="margin-right:auto;font:12px sans-serif;color:#666;"></span>
          <button class="save-load-cancel" style="padding:6px 16px;border:1px solid #ccc;background:white;border-radius:4px;cursor:pointer;">Cancel</button>
          <button class="save-load-confirm" style="padding:6px 16px;border:none;background:#1a73e8;color:white;border-radius:4px;cursor:pointer;">Load</button>
        </div>
      </div>
    `;
    this.$popupPanel = this.$popup.querySelector('.save-load-panel')!;
    this.$popupTextarea = this.$popup.querySelector('.save-load-textarea')!;
    this.$popupConfirm = this.$popup.querySelector('.save-load-confirm')!;
    this.$popupNotice = this.$popup.querySelector('.save-load-notice')!;
    this.$wrapper.appendChild(this.$popup);

    // The popup owns the keyboard while open: keydown only bubbles here
    // while focus is inside the popup subtree (hence focus-on-open below and
    // tabindex=-1 on the panel), and stopping propagation keeps popup typing
    // away from the whiteboard shortcuts.
    this.$popup.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.closeSaveLoadPopup();
    });
    // Backdrop click closes without action; clicks on the panel's padding
    // refocus it so Escape has no dead corner.
    this.$popup.addEventListener('click', (e) => {
      if (e.target === this.$popup) this.closeSaveLoadPopup();
      else if (e.target === this.$popupPanel) this.$popupPanel.focus();
    });
    this.$popup.querySelector('.save-load-cancel')!.addEventListener('click', () => this.closeSaveLoadPopup());
    this.$popupConfirm.addEventListener('click', () => this.confirmLoad());
  }

  // Shows the exported v2 document, read-only, ready to copy.
  private openSavePopup(): void {
    // An open text edit only commits on blur - commit first so the export
    // contains the in-flight text (precedent: wheel/resize handlers).
    this.commitTextEditIfAny();
    this.buildSaveLoadPopup();
    this.resetPopupState();
    this.$popupTextarea.value = JSON.stringify(JSON.parse(this.save()), null, 2);
    this.$popupTextarea.readOnly = true;
    // Disabled, not hidden - no layout jump between the two modes.
    this.$popupConfirm.disabled = true;
    this.$popupConfirm.style.opacity = '0.3';
    this.$popup.style.display = 'flex';
    this.$popupTextarea.focus();
    this.$popupTextarea.select();
  }

  // Shows an empty editable textarea to paste a document into.
  private openLoadPopup(): void {
    // Mirrors Save - otherwise a hidden open editor makes confirmLoad's gate
    // refuse with no visible cause.
    this.commitTextEditIfAny();
    this.buildSaveLoadPopup();
    this.resetPopupState();
    this.$popupTextarea.value = '';
    this.$popupTextarea.readOnly = false;
    this.$popupConfirm.disabled = false;
    this.$popupConfirm.style.opacity = '1';
    this.$popup.style.display = 'flex';
    this.$popupTextarea.focus();
  }

  private confirmLoad(): void {
    // The edit was committed on open, so this only guards the genuinely
    // un-committable states (mouse held, draw mid-gesture).
    if (!this.canApplyHistory()) return;
    try {
      const result = this.load(this.$popupTextarea.value);
      if (result.skipped > 0) {
        // Partial success is never silent - keep the popup open with a
        // non-error notice.
        this.resetPopupState();
        this.$popupNotice.textContent = `Loaded ${result.loaded} shapes, skipped ${result.skipped} malformed entries`;
      } else {
        this.closeSaveLoadPopup();
      }
    } catch (err) {
      this.$popupTextarea.style.borderColor = 'red';
      this.$popupNotice.textContent = err instanceof Error ? err.message : 'Invalid JSON';
      this.$popupNotice.style.color = 'red';
    }
  }

  private resetPopupState(): void {
    this.$popupTextarea.style.borderColor = '#ccc';
    this.$popupNotice.textContent = '';
    this.$popupNotice.style.color = '#666';
  }

  private closeSaveLoadPopup(): void {
    this.resetPopupState();
    this.$popup.style.display = 'none';
  }

  public destroy() {
    this.resizeObserver.disconnect();
    window.removeEventListener('mouseup', this.boundMouseup, { capture: true });
    document.removeEventListener('keydown', this.boundKeydown);
    this.world.stop();
    this.propertiesPanel.destroy();
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
          // undefined (= plain rectangle) drops out of JSON.stringify,
          // keeping pre-sysType snapshots byte-identical.
          data.sysType = comp.sysType;
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
          // undefined (= no arrow) drops out of JSON.stringify, keeping
          // legacy snapshots byte-identical.
          data.arrowStart = comp.arrowStart;
          data.arrowEnd = comp.arrowEnd;
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
      const id: string = shape.id ?? `loaded-shape-${crypto.randomUUID()}`;
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
            fillColor: shape.fillColor, strokeColor, strokeWidth: shape.strokeWidth,
            sysType: shape.sysType
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
            strokeColor, strokeWidth: shape.strokeWidth,
            arrowStart: shape.arrowStart, arrowEnd: shape.arrowEnd
          });
        }
      } else {
        if (shape.type === 'rectangle' && entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          comp.x = shape.x; comp.y = shape.y;
          comp.width = shape.width; comp.height = shape.height;
          comp.fillColor = shape.fillColor; comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
          // Doubles as the remove-reconcile: undoing across a SYS-shape
          // creation restores undefined.
          comp.sysType = shape.sysType;
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
          comp.arrowStart = shape.arrowStart;
          comp.arrowEnd = shape.arrowEnd;
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

  /**
   * Deletes every selected shape. Lines attached to a deleted shape stay on
   * the board - their dangling pins self-clean in LineAttachmentSystem next
   * frame. Records exactly one undo step (a key press has no release edge
   * for HistorySystem to see). No-op mid-gesture: deleting the shape under
   * an active drag/draw/resize would fight the gesture.
   */
  public deleteSelection(): void {
    if (!this.canApplyHistory()) return;
    const selection = this.world.getEntity('selection')?.getComponent(SelectionRectangleComponent);
    if (!selection || selection.entities.size === 0) return;
    const ids = new Set(selection.entities.keys());
    selection.clear();
    ids.forEach(id => this.world.removeEntity(id));

    // Detach surviving lines from the deleted shapes NOW, not next frame in
    // LineAttachmentSystem: the history snapshot below must not contain the
    // dangling refs, or it differs from the next release-edge snapshot by
    // exactly that cleanup (a dead undo step).
    for (const entity of [...this.shapesQuery.execute().values()]) {
      if (!entity.hasComponent(LineAttachmentComponent)) continue;
      const att = entity.getComponent(LineAttachmentComponent);
      if (att.start && ids.has(att.start.entityId)) att.start = null;
      if (att.end && ids.has(att.end.entityId)) att.end = null;
      if (att.start === null && att.end === null) {
        entity.removeComponent(LineAttachmentComponent);
      }
    }

    this.recordHistory();
  }

  /**
   * Duplicates every selected shape with a fresh id, offset by a constant
   * screen distance (world offset divided by zoom, so it's visible at any
   * scale). Line attachments are NOT copied: LineAttachmentSystem would
   * re-pin the copy onto the same connection points next frame, undoing the
   * offset. The selection moves to the duplicates, so repeated Cmd+D chains.
   * One undo step (a key press has no release edge for HistorySystem).
   */
  public duplicateSelection(): void {
    if (!this.canApplyHistory()) return;
    const selection = this.world.getEntity('selection')?.getComponent(SelectionRectangleComponent);
    if (!selection || selection.entities.size === 0) return;

    const offset = DUPLICATE_OFFSET / this.camera.scale;
    const duplicates: Entity[] = [];

    for (const source of selection.entities.values()) {
      const copy = this.world.createEntity(`duplicate-${crypto.randomUUID()}`);
      copy.addComponent(IsRendered);
      if (source.hasComponent(RectangleComponent)) {
        const comp = source.getComponent(RectangleComponent);
        copy.addComponent(RectangleComponent, {
          x: comp.x + offset, y: comp.y + offset,
          width: comp.width, height: comp.height,
          fillColor: comp.fillColor, strokeColor: comp.strokeColor, strokeWidth: comp.strokeWidth,
          sysType: comp.sysType
        });
      } else if (source.hasComponent(CircleComponent)) {
        const comp = source.getComponent(CircleComponent);
        copy.addComponent(CircleComponent, {
          x: comp.x + offset, y: comp.y + offset,
          radius: comp.radius,
          fillColor: comp.fillColor, strokeColor: comp.strokeColor, strokeWidth: comp.strokeWidth
        });
      } else if (source.hasComponent(LineComponent)) {
        const comp = source.getComponent(LineComponent);
        copy.addComponent(LineComponent, {
          x1: comp.x1 + offset, y1: comp.y1 + offset,
          x2: comp.x2 + offset, y2: comp.y2 + offset,
          strokeColor: comp.strokeColor, strokeWidth: comp.strokeWidth,
          arrowStart: comp.arrowStart, arrowEnd: comp.arrowEnd
        });
      } else {
        this.world.removeEntity(copy.id);
        continue;
      }
      if (source.hasComponent(TextComponent)) {
        const text = source.getComponent(TextComponent);
        copy.addComponent(TextComponent, {
          content: text.content, fontSize: text.fontSize,
          fontFamily: text.fontFamily, color: text.color
        });
      }
      duplicates.push(copy);
    }

    if (duplicates.length === 0) return;

    selection.clear();
    duplicates.forEach(copy => selection.addEntity(copy));

    this.recordHistory();
  }

  public recordHistory(): void {
    if (this.readOnly) return;
    
    const postState = new Map<string, any>();
    const shapes = JSON.parse(this.saveShapes());
    for (const shape of shapes) {
      postState.set(shape.id, shape);
    }
    
    const actions: Action[] = [];
    
    // Check for creates and updates
    for (const [id, postShape] of postState) {
      const preShape = this.preInteractionState.get(id);
      if (!preShape) {
        actions.push({ type: 'CREATE', entityId: id, componentData: postShape, version: 1 });
      } else if (JSON.stringify(preShape) !== JSON.stringify(postShape)) {
        // Increment version on update
        const entity = this.world.getEntity(id);
        let version = 1;
        if (entity && entity.hasComponent(VersionComponent)) {
          const vComp = entity.getComponent(VersionComponent);
          vComp.version++;
          version = vComp.version;
        }
        actions.push({ type: 'UPDATE', entityId: id, before: preShape, after: postShape, version });
      }
    }
    
    // Check for deletes
    for (const [id, preShape] of this.preInteractionState) {
      if (!postState.has(id)) {
        actions.push({ type: 'DELETE', entityId: id, componentData: preShape, version: preShape.version ?? 1 });
      }
    }
    
    if (actions.length > 0) {
      this.history.pushActions(actions);
      for (const action of actions) {
        if (action.type === 'CREATE') {
          this.events.emit({ type: 'shapeCreated', entityId: action.entityId, data: action.componentData });
        } else if (action.type === 'UPDATE') {
          this.events.emit({ type: 'shapeUpdated', entityId: action.entityId, data: action.after });
        } else if (action.type === 'DELETE') {
          this.events.emit({ type: 'shapeDeleted', entityId: action.entityId });
        }
      }
    }
    
    // Update preInteraction state to the new state
    this.preInteractionState = postState;
  }

  private checkVersion(entityId: string, expectedVersion: number): boolean {
    const entity = this.world.getEntity(entityId);
    if (!entity) return expectedVersion === 0; // If it expects not to exist, that's fine
    if (entity.hasComponent(IsLockedComponent)) return false; // Locked shapes can't be undone
    if (!entity.hasComponent(VersionComponent)) return expectedVersion === 1;
    return entity.getComponent(VersionComponent).version === expectedVersion;
  }

  private applyUndoAction(action: Action): void {
    if (action.type === 'CREATE') {
      this.world.removeEntity(action.entityId);
      this.events.emit({ type: 'shapeDeleted', entityId: action.entityId });
    } else if (action.type === 'UPDATE') {
      this.loadShapes(JSON.stringify([action.before]));
      const entity = this.world.getEntity(action.entityId);
      if (entity && entity.hasComponent(VersionComponent)) {
        entity.getComponent(VersionComponent).version = action.before.version ?? 1;
      }
      this.events.emit({ type: 'shapeUpdated', entityId: action.entityId, data: action.before });
    } else if (action.type === 'DELETE') {
      this.loadShapes(JSON.stringify([action.componentData]));
      const entity = this.world.getEntity(action.entityId);
      if (entity && entity.hasComponent(VersionComponent)) {
        entity.getComponent(VersionComponent).version = action.version;
      }
      this.events.emit({ type: 'shapeCreated', entityId: action.entityId, data: action.componentData });
    }
  }

  private applyRedoAction(action: Action): void {
    if (action.type === 'CREATE') {
      this.loadShapes(JSON.stringify([action.componentData]));
      const entity = this.world.getEntity(action.entityId);
      if (entity && !entity.hasComponent(VersionComponent)) {
        entity.addComponent(VersionComponent, { version: 1 });
      }
      this.events.emit({ type: 'shapeCreated', entityId: action.entityId, data: action.componentData });
    } else if (action.type === 'UPDATE') {
      this.loadShapes(JSON.stringify([action.after]));
      const entity = this.world.getEntity(action.entityId);
      if (entity && entity.hasComponent(VersionComponent)) {
        entity.getComponent(VersionComponent).version = action.version;
      }
      this.events.emit({ type: 'shapeUpdated', entityId: action.entityId, data: action.after });
    } else if (action.type === 'DELETE') {
      this.world.removeEntity(action.entityId);
      this.events.emit({ type: 'shapeDeleted', entityId: action.entityId });
    }
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

  // Applying a snapshot mid-drag/mid-draw/mid-text-edit would fight the
  // active gesture (or delete the entity under the open textarea).
  private canApplyHistory(): boolean {
    if (this.cursor.hasComponent(IsMousePressed)) return false;
    const toolEntity = this.world.getEntity('tool');
    if (!toolEntity) return true;
    const toolState = toolEntity.getComponent(ToolStateComponent);
    return toolState.drawState === 'IDLE' && !toolState.editingEntityId;
  }

  private updateHistoryButtons(): void {
    this.$undoBtn.disabled = !this.history.canUndo();
    this.$undoBtn.style.opacity = this.history.canUndo() ? '1' : '0.3';
    this.$redoBtn.disabled = !this.history.canRedo();
    this.$redoBtn.style.opacity = this.history.canRedo() ? '1' : '0.3';
  }

  /**
   * Exports the board as the LLM-friendly v2 document: `{v, camera, nodes,
   * edges}`. Nodes are rectangles/circles (`type` = sysType for SYS shapes,
   * else 'rect'/'circle'), edges are lines with attachments encoded as
   * `"entityId:handleId"`. Coordinates are rounded to integers and default
   * styles (white fill, black stroke, width 1) are omitted - export-time
   * concerns only; the undo snapshots (saveShapes) keep full precision.
   * Built from the canonical internal snapshot so the preview exclusion and
   * field canonicalization live in one place.
   */
  public save(): string {
    const cam = this.camera;
    const shapes = JSON.parse(this.saveShapes()) as any[];
    const nodes: any[] = [];
    const edges: any[] = [];
    for (const s of shapes) {
      if (s.type === 'line') {
        const e: any = { id: s.id, x1: Math.round(s.x1), y1: Math.round(s.y1),
                         x2: Math.round(s.x2), y2: Math.round(s.y2) };
        if (s.strokeColor && s.strokeColor !== 'black') e.stroke = s.strokeColor;
        if (s.strokeWidth && s.strokeWidth !== 1) e.strokeWidth = s.strokeWidth;
        if (s.arrowStart) e.arrowStart = s.arrowStart;
        if (s.arrowEnd) e.arrowEnd = s.arrowEnd;
        if (s.attachment?.start) e.from = `${s.attachment.start.entityId}:${s.attachment.start.handleId}`;
        if (s.attachment?.end) e.to = `${s.attachment.end.entityId}:${s.attachment.end.handleId}`;
        edges.push(e);
      } else {
        const n: any = { id: s.id, type: s.sysType ?? (s.type === 'circle' ? 'circle' : 'rect') };
        n.x = Math.round(s.x); n.y = Math.round(s.y);
        if (s.type === 'circle') { n.r = Math.round(s.radius); }
        else { n.w = Math.round(s.width); n.h = Math.round(s.height); }
        // 'none' marks the rare transparent legacy shape; the default white
        // fill and black stroke are omitted entirely.
        if (s.fillColor === undefined) n.fill = 'none';
        else if (s.fillColor !== 'white') n.fill = s.fillColor;
        if (s.strokeColor && s.strokeColor !== 'black') n.stroke = s.strokeColor;
        if (s.strokeWidth && s.strokeWidth !== 1) n.strokeWidth = s.strokeWidth;
        if (s.text) {
          const isDefaultFont = s.text.fontSize === 16 && s.text.fontFamily === 'sans-serif' && s.text.color === 'black';
          n.text = isDefaultFont ? s.text.content : s.text;
        }
        nodes.push(n);
      }
    }
    return JSON.stringify({ v: 2, camera: { x: cam.x, y: cam.y, scale: cam.scale }, nodes, edges });
  }

  /**
   * Loads a whiteboard document in any of the three formats: v2 semantic
   * (`{v, nodes, edges}`), v1.1 (`{version, camera, shapes}`) or v1.0 (bare
   * legacy array). Throws on unparseable/unrecognized input - the only hard
   * failure. v2 entries without the required finite geometry are skipped and
   * counted, never failing the whole load (forgiving input for LLM-authored
   * documents). `camera` is optional; when absent the current view is kept.
   */
  public load(json: string): { loaded: number; skipped: number } {
    const data = JSON.parse(json);

    let shapes: any[];
    let skipped = 0;
    if (Array.isArray(data)) {
      // v1.0: bare array (single `color` field handled inside loadShapes).
      shapes = data;
    } else if (data.shapes) {
      // v1.1: {version, camera, shapes}.
      shapes = data.shapes;
    } else if (data.v === 2 || data.nodes || data.edges) {
      const finite = (...values: any[]) => values.every(v => Number.isFinite(v));
      // "entityId:handleId" -> AttachmentPoint. Invalid handles (hand-edited
      // or LLM-authored files) drop the pin - the line loads dangling instead
      // of feeding a bogus handleId to LineAttachmentSystem every frame.
      const HANDLES = new Set(['n', 'e', 's', 'w']);
      const parsePin = (ref?: string) => {
        if (typeof ref !== 'string') return null;
        const i = ref.lastIndexOf(':');
        const entityId = ref.slice(0, i), handleId = ref.slice(i + 1);
        if (!entityId || !HANDLES.has(handleId)) return null;
        return { entityId, handleId };
      };
      const nodes = (data.nodes ?? []).filter((n: any) => {
        const ok = finite(n.x, n.y) && (finite(n.r) || finite(n.w, n.h));
        if (!ok) skipped++;
        return ok;
      }).map((n: any) => ({
        id: n.id,
        type: Number.isFinite(n.r) ? 'circle' : 'rectangle',
        x: n.x, y: n.y, width: n.w, height: n.h, radius: n.r,
        // Semantic types are rect-only; a circle node's non-basic type is
        // dropped by loadShapes (CircleComponent has no sysType).
        sysType: (n.type === 'rect' || n.type === 'circle') ? undefined : n.type,
        fillColor: n.fill === 'none' ? undefined : (n.fill ?? 'white'),
        strokeColor: n.stroke ?? 'black',
        strokeWidth: n.strokeWidth,
        text: typeof n.text === 'string'
          ? { content: n.text, fontSize: 16, fontFamily: 'sans-serif', color: 'black' }
          : n.text,
      }));
      const edges = (data.edges ?? []).filter((e: any) => {
        const ok = finite(e.x1, e.y1, e.x2, e.y2);
        if (!ok) skipped++;
        return ok;
      }).map((e: any) => {
        const start = parsePin(e.from), end = parsePin(e.to);
        return {
          id: e.id, type: 'line',
          x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
          strokeColor: e.stroke ?? 'black', strokeWidth: e.strokeWidth,
          arrowStart: e.arrowStart, arrowEnd: e.arrowEnd,
          attachment: (start || end) ? { start, end } : undefined,
        };
      });
      shapes = [...nodes, ...edges];
    } else {
      throw new Error('Unrecognized whiteboard file format');
    }

    if (data.camera) {
      const cam = this.camera;
      cam.x = data.camera.x;
      cam.y = data.camera.y;
      cam.scale = data.camera.scale;
    }

    this.loadShapes(JSON.stringify(shapes));
    // A loaded file becomes an undo checkpoint.
    this.recordHistory();
    return { loaded: shapes.length, skipped };
  }
}
