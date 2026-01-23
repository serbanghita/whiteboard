import {
  createCanvas,
  createWrapper,
  mouseMove,
  mousePress,
  mouseRelease,
  initFloatingMenu,
  initKeyboardEvents
} from "./render";
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

// Systems
import RenderingSystem from "./system/RenderSystem";
import SelectionSystem from "./system/SelectionSystem";
import MousePressSystem from "./system/MousePressSystem";
import MouseOverSystem from "./system/MouseOverSystem";
import MouseOutSystem from "./system/MouseOutSystem";
import DragSystem from "./system/DragSystem";
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
  Layer
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
tool.addComponent(ToolStateComponent);

// Default layer entity
const defaultLayer = world.createEntity('default-layer');
defaultLayer.addComponent(Layer, { id: 'default-layer', zIndex: 0, visible: true });

/**
 * Demo Entities
 * ---------------
 * These are sample shapes for testing. Remove in production.
 */
const shape1 = world.createEntity("shape1");
shape1.addComponent(RectangleComponent, { x: 120, y: 120, width: 100, height: 200, strokeColor: 'black' });
shape1.addComponent(IsRendered);

const shape2 = world.createEntity("shape2");
shape2.addComponent(RectangleComponent, { x: 300, y: 200, width: 100, height: 100, strokeColor: 'black' });
shape2.addComponent(IsRendered);

/**
 * Queries
 */
const allRenderableQuery = world.createQuery("renderables", { all: [IsRendered] });
const allRectanglesWithoutSelectionQuery = world.createQuery("rectNoSel", { all: [RectangleComponent], none: [SelectionRectangleComponent] });
const allRectanglesForMouseOverQuery = world.createQuery("rectMouseOver", { all: [RectangleComponent], none: [IsMouseOver] });
const allRectanglesForMouseOutQuery = world.createQuery("rectMouseOut", { all: [RectangleComponent, IsMouseOver] });
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

// Mouse interaction systems
world.createSystem(MousePressSystem, allRectanglesWithoutSelectionQuery);
world.createSystem(DragSystem, selectionQuery);
world.createSystem(MouseOverSystem, allRectanglesForMouseOverQuery);
world.createSystem(MouseOutSystem, allRectanglesForMouseOutQuery);
world.createSystem(SelectionSystem, selectionQuery);

// Rendering - must be last
world.createSystem(RenderingSystem, allRenderableQuery, renderer);

/**
 * Input Handlers
 */
mouseMove((e) => {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.setXY(e.offsetX, e.offsetY);
});

mousePress((e) => {
  if (!cursor.hasComponent(IsMousePressed)) {
    cursor.addComponent(IsMousePressed);
  }
});

mouseRelease((e) => {
  cursor.removeComponent(IsMousePressed);
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
