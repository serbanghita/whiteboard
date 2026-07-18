import {
  createCanvas,
  createWrapper,
  mouseMove,
  mousePress,
  mouseRelease,
  initFloatingMenu,
  initKeyboardEvents,
  resizeCanvasToViewport,
  wheel
} from "./render";
import { applyWheel, screenToWorld } from "./camera";
import { WebGLRenderer } from "./renderer";
import { World } from "@serbanghita-gamedev/ecs";

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
import ToolStateComponent from "./component/ToolStateComponent";
import DrawnOnLayer from "./component/DrawnOnLayer";
import Layer from "./component/Layer";
import CameraComponent from "./component/CameraComponent";

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

/**
 * Rendering
 */
const $wrapper = createWrapper('canvas-wrapper');
const { $canvas, gl } = createCanvas("canvas");
const renderer = new WebGLRenderer(gl);
// Drawing coordinates are CSS pixels (matching mouse offsetX/offsetY); the
// backing store is devicePixelRatio-scaled, so the renderer needs the logical size.
renderer.setResolution(window.innerWidth, window.innerHeight);

window.addEventListener('resize', () => {
  const { width, height } = resizeCanvasToViewport();
  renderer.setResolution(width, height);
});

/**
 * ECS World
 */
const world = new World();

// Register all components
world.registerComponents([
  // Existing
  IsRendered,
  IsMouseOver,
  IsMousePressed,
  MouseComponent,
  RectangleComponent,
  SelectionRectangleComponent,
  // New
  CircleComponent,
  LineComponent,
  IsSelected,
  ToolStateComponent,
  DrawnOnLayer,
  Layer,
  CameraComponent
]);

/**
 * Fixed Entities
 * ---------------
 * These entities are persistent as they represent the core of the app.
 */

// Cursor entity - tracks mouse position
const cursor = world.createEntity('cursor');
cursor.addComponent(MouseComponent, { x: 0, y: 0 });

// Selection entity - manages selected entities
const selection = world.createEntity('selection');
selection.addComponent(SelectionRectangleComponent);

// Tool entity - manages current tool state
const tool = world.createEntity('tool');
tool.addComponent(ToolStateComponent, { currentTool: "cursor", drawState: "IDLE" });

// Default layer entity
const defaultLayer = world.createEntity('default-layer');
defaultLayer.addComponent(Layer, { id: 'default-layer', zIndex: 0, visible: true });

// Camera entity - the view transform (zoom + pan). Shapes keep world
// coordinates; mouse input is converted to world space at the handlers below.
const camera = world.createEntity('camera');
camera.addComponent(CameraComponent, { x: 0, y: 0, scale: 1 });

/**
 * Queries
 */
const SHAPE_COMPONENTS = [RectangleComponent, CircleComponent, LineComponent];

const allRenderableQuery = world.createQuery("renderables", { all: [IsRendered] });
// The selection entity itself carries a RectangleComponent (its bounding box),
// so shape queries must exclude it.
const selectableShapesQuery = world.createQuery("selectableShapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
const shapesForMouseOverQuery = world.createQuery("shapesMouseOver", { any: SHAPE_COMPONENTS, none: [IsMouseOver, SelectionRectangleComponent] });
const shapesForMouseOutQuery = world.createQuery("shapesMouseOut", { all: [IsMouseOver], any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
const selectionQuery = world.createQuery("selection", { all: [SelectionRectangleComponent] });
const toolQuery = world.createQuery("tool", { all: [ToolStateComponent] });

/**
 * Systems
 * Order matters - drawing systems should run before render
 */

// Tool state management
world.createSystem(ToolStateSystem, toolQuery);

// Drawing systems - create new entities
world.createSystem(RectangleDrawSystem, toolQuery);
world.createSystem(CircleDrawSystem, toolQuery);
world.createSystem(LineDrawSystem, toolQuery);

// ResizeSystem and ConnectionSystem must run before MousePressSystem/DragSystem:
// a press landing on a handle claims the interaction and the others skip it.
world.createSystem(ResizeSystem, selectionQuery);
world.createSystem(ConnectionSystem, selectionQuery);
world.createSystem(MousePressSystem, selectableShapesQuery);
world.createSystem(DragSystem, selectionQuery);
world.createSystem(MouseOverSystem, shapesForMouseOverQuery);
world.createSystem(MouseOutSystem, shapesForMouseOutQuery);
world.createSystem(SelectionSystem, selectionQuery);

// Rendering - must be last
world.createSystem(RenderingSystem, allRenderableQuery, renderer);

/**
 * Input Handlers
 */
// Mouse events arrive in screen space (CSS px) and are converted to world
// space here, at the boundary - every system downstream works purely in
// world coordinates.
mouseMove((e) => {
  const cam = camera.getComponent(CameraComponent);
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = e.offsetX;
  mouse.screenY = e.offsetY;
  const w = screenToWorld(cam, e.offsetX, e.offsetY);
  mouse.setXY(w.x, w.y);
});

mousePress((e) => {
  const cam = camera.getComponent(CameraComponent);
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = e.offsetX;
  mouse.screenY = e.offsetY;
  const w = screenToWorld(cam, e.offsetX, e.offsetY);
  mouse.setXY(w.x, w.y);
  mouse.press(w.x, w.y);
  if (!cursor.hasComponent(IsMousePressed)) {
    cursor.addComponent(IsMousePressed);
  }
});

mouseRelease(() => {
  cursor.getComponent(MouseComponent).release();
  cursor.removeComponent(IsMousePressed);
});

// Ctrl/cmd+wheel (trackpad pinch) zooms at the cursor, plain wheel pans.
wheel((e) => {
  e.preventDefault();
  applyWheel(camera.getComponent(CameraComponent), cursor.getComponent(MouseComponent), e);
});

/**
 * Initialize UI
 */
initFloatingMenu(world);
initKeyboardEvents(world);

/**
 * Start the ECS world
 */
world.start();

// Expose world for debugging
(window as any)['world'] = world;
