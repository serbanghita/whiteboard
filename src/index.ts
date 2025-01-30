import { Circle, Point, Rectangle } from "@serbanghita-gamedev/geometry";
import {
  clearCanvas,
  createCanvas,
  createContextSelectionForEntity,
  createWrapper, hasContextSelection,
  mouseDrag, mouseMove, mouseOver,
  mousePress,
  mouseRelease, removeContextSelectionForEntity, updateCanvasCursor,
  updateContextSelectionForEntity
} from "./render";
import { World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "./component/RectangleComponent";
import IsRendered from "./component/IsRendered";
import RenderingSystem from "./system/RenderSystem";
import MouseComponent from "./component/MouseComponent";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";

enum ResizeHandle {
  NONE = 0,
  TOP = 1,
  BOTTOM = 2,
  LEFT = 3,
  RIGHT = 4,
}

// How many pixels left/right from a border trigger the "drag" cursor detection.
const RESIZE_HANDLE_AREA_TOLERANCE = 20;
const RECTANGLE_CONTEXT_AREA_PADDING = 30;
const RECTANGLE_CONTEXT_CIRCLE_RADIUS = 6;

/**
 * Rendering
 */
const $wrapper = createWrapper('canvas-wrapper');
const { $canvas, ctx } = createCanvas("canvas");

/**
 * ECS
 */
const world = new World();
world.registerComponents([IsRendered, MouseComponent, RectangleComponent, SelectionRectangleComponent]);

/**
 * Entities
 */

/**
 * Fixed entities.
 * ---------------
 * These entities are persistent as they represent the core of the app.
 */
const cursor = world.createEntity('cursor');
cursor.addComponent(MouseComponent, {point: new Point(0, 0)});

const selection = world.createEntity('selection');
selection.addComponent(SelectionRectangleComponent);

/**
 * Dynamic entities
 * ---------------
 * These entities are created on the fly by the user.
 */
const shape1 = world.createEntity("shape1");
shape1.addComponent(RectangleComponent, { x: 120, y: 120, width: 100, height: 200 });
shape1.addComponent(IsRendered);

const shape2 = world.createEntity("shape2");
shape2.addComponent(RectangleComponent, { x: 300, y: 200, width: 100, height: 100 });
shape1.addComponent(IsRendered);

/**
 * Queries
 */
const allRectanglesQuery = world.createQuery("allRectanglesQuery", { all: [RectangleComponent] });
/**
 * Systems
 */
world.createSystem(RenderingSystem, allRectanglesQuery, ctx);


// let isMouseSelecting = false;
// let isMouseInTheResizingZone = false;
// let isMouseResizing = false;
// let resizeHandle = ResizeHandle.NONE;
// let selectedEntityId: string;
// let dragStartX: number;
// let dragStartY: number;

/**
 * Cursor movement.
 */
mouseMove((e) => {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.setXY(e.offsetX, e.offsetY);
});

/**
 * Open/Show the context for an Entity.
 */
mousePress((e) => {
  // const x = (dragStartX = e.offsetX);
  // const y = (dragStartY = e.offsetY);
  const mouse = cursor.getComponent(MouseComponent);
  mouse.click(true);
  console.log("mousePress", mouse.x, mouse.y, mouse.isClicking);
});

mouseRelease((e) => {
  const mouse = cursor.getComponent(MouseComponent)
  mouse.click(false);
  console.log("mouseRelease", mouse.x, mouse.y, mouse.isClicking);
});

// mousePress((e) => {
//   if (!isMouseInTheResizingZone || !isMouseSelecting) {
//     return;
//   }
//
//   isMouseResizing = true;
//   console.log('isMouseResizing', isMouseResizing);
//
// });

/**
 * Resize
 */
// mouseDrag((e) => {
//   if (!(isMouseSelecting && selectedEntityId && isMouseResizing)) {
//     return;
//   }
//
//   const entity = world.getEntity(selectedEntityId);
//   if (!entity) {
//     return;
//   }
//
//   console.log('resizing');
//
//   const dragEndX = e.offsetX;
//   const dragEndY = e.offsetY;
//
//   const isRect = entity.getComponent(RectangleComponent);
//   const deltaX = dragStartX - dragEndX;
//   const deltaY = dragStartY - dragEndY;
//
//   const rect = isRect.properties.rectangle;
//
//   const contextComp = entity.getComponent(HasRectangleContext);
//   const contextRect = contextComp.properties.rectangle;
//
//   if (resizeHandle === ResizeHandle.LEFT) {
//     rect.moveCenterBy(-deltaX / 2, 0);
//     rect.width += deltaX;
//     contextRect.width += deltaX;
//   } else if (resizeHandle === ResizeHandle.RIGHT) {
//     rect.moveCenterBy(-deltaX / 2, 0);
//     rect.width -= deltaX;
//     contextRect.width -= deltaX;
//   } else if (resizeHandle === ResizeHandle.TOP) {
//     rect.moveCenterBy(0, -deltaY / 2);
//     rect.height += deltaY;
//     contextRect.height += deltaY;
//   } else if (resizeHandle === ResizeHandle.BOTTOM) {
//     rect.moveCenterBy(0, -deltaY / 2);
//     rect.height -= deltaY;
//     contextRect.height -= deltaY;
//   }
//
//   contextComp.properties.leftConnCircle.center.x = contextRect.topLeftX;
//   contextComp.properties.leftConnCircle.center.y = contextRect.topLeftY + contextRect.height / 2;
//   contextComp.properties.rightConnCircle.center.x = contextRect.topRightX;
//   contextComp.properties.rightConnCircle.center.y = contextRect.topLeftY + contextRect.height / 2;
//   contextComp.properties.topConnCircle.center.x = contextRect.topLeftX + contextRect.width / 2;
//   contextComp.properties.topConnCircle.center.y = contextRect.topLeftY;
//   contextComp.properties.bottomConnCircle.center.x = contextRect.bottomLeftX + contextRect.width / 2;
//   contextComp.properties.bottomConnCircle.center.y = contextRect.bottomLeftY;
//
//   dragStartX = dragEndX;
//   dragStartY = dragEndY;
//
// });

/**
 * Detect resizing (for cursor).
 */


/**
 * Moving shapes around.
 */
// mouseDrag((e) => {
//   if (!isMouseSelecting || isMouseResizing) {
//     return;
//   }
//
//   const dragEndX = e.offsetX;
//   const dragEndY = e.offsetY;
//
//   console.log("dragging");
//
//   const entity = world.getEntity(selectedEntityId);
//   if (entity) {
//     const isRect = entity.getComponent(RectangleComponent);
//     const deltaX = dragStartX - dragEndX;
//     const deltaY = dragStartY - dragEndY;
//
//     const rect = isRect.properties.rectangle;
//     rect.moveCenterBy(-deltaX, -deltaY);
//
//     // Update the context as well.
//     if (entity.hasComponent(HasRectangleContext)) {
//       const contextComp = entity.getComponent(HasRectangleContext);
//       const contextCompRect = contextComp.properties.rectangle;
//
//       contextComp.properties.leftConnCircle.center.x = contextCompRect.topLeftX;
//       contextComp.properties.leftConnCircle.center.y = contextCompRect.topLeftY + contextCompRect.height / 2;
//       contextComp.properties.rightConnCircle.center.x = contextCompRect.topRightX;
//       contextComp.properties.rightConnCircle.center.y = contextCompRect.topLeftY + contextCompRect.height / 2;
//       contextComp.properties.topConnCircle.center.x = contextCompRect.topLeftX + contextCompRect.width / 2;
//       contextComp.properties.topConnCircle.center.y = contextCompRect.topLeftY;
//       contextComp.properties.bottomConnCircle.center.x = contextCompRect.bottomLeftX + contextCompRect.width / 2;
//       contextComp.properties.bottomConnCircle.center.y = contextCompRect.bottomLeftY;
//     }
//
//     // Reset drag.
//     dragStartX = dragEndX;
//     dragStartY = dragEndY;
//   }
// });

// mouseRelease((e) => {
//   console.log("mouseRelease");
//   isMouseSelecting = false;
//   if (isMouseResizing) {
//     updateCanvasCursor('auto');
//     resizeHandle = ResizeHandle.NONE;
//     isMouseResizing = false;
//   }
//
//   dragStartX = 0;
//   dragStartY = 0;
// });

world.start();

(window as any)['world'] = world;
