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
import IsRectangle from "./IsRectangle";
import IsRendered from "./IsRendered";
import IsPoint from "./IsPoint";
import RenderingSystem from "./RenderSystem";
import HasRectangleContext from "./HasRectangleContext";

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
world.registerComponents([IsRendered, IsPoint, IsRectangle, HasRectangleContext]);

/**
 * Entities
 */
const shape1 = world.createEntity("shape1");
shape1.addComponent(IsRectangle, { x: 10, y: 10, width: 100, height: 200 });
shape1.addComponent(IsRendered);
const shape2 = world.createEntity("shape2");
shape2.addComponent(IsRectangle, { x: 300, y: 200, width: 100, height: 200 });
shape1.addComponent(IsRendered);

/**
 * Queries
 */
const allRectanglesQuery = world.createQuery("allRectangles", { all: [IsRectangle] });
/**
 * Systems
 */
world.createSystem(RenderingSystem, allRectanglesQuery, ctx);

let isMouseSelecting = false;
let isMouseInTheResizingZone = false;
let isMouseResizing = false;
let resizeHandle = ResizeHandle.NONE;
let selectedEntityId: string;
let dragStartX: number;
let dragStartY: number;

/**
 * Open/Show the context for an Entity.
 */
mousePress((e) => {
  const x = (dragStartX = e.offsetX);
  const y = (dragStartY = e.offsetY);

  const point = new Point(x, y);
  console.log("mousePress", x, y);

  // Check if we need to deselect the current selected Entity (click is away from our Entity).
  if (selectedEntityId) {
    const entity = world.getEntity(selectedEntityId);
    if (entity) {
      const isRect = entity.getComponent(IsRectangle);
      if (!isRect.properties.rectangle.intersectsWithPoint(point)) {
        // removeContextSelectionForEntity(entity);
        entity.removeComponent(HasRectangleContext);
        selectedEntityId = '';
      }
    }
  }

  for (const [entityId, entity] of allRectanglesQuery.execute()) {
    const isRect = entity.getComponent(IsRectangle);
    if (isRect.properties.rectangle.intersectsWithPoint(point)) {
      console.log(point, "intersects with", entityId);
      selectedEntityId = entityId;
      const rect = isRect.properties.rectangle;
      if (!entity.hasComponent(HasRectangleContext)) {
        // createContextSelectionForEntity(entity);
        const newRect = new Rectangle(rect.width + RECTANGLE_CONTEXT_AREA_PADDING, rect.height + RECTANGLE_CONTEXT_AREA_PADDING, rect.center);
        entity.addComponent(HasRectangleContext, {
          rectangle: newRect,
          leftConnCircle: new Circle(new Point(newRect.topLeftX, newRect.topLeftY + newRect.height / 2), RECTANGLE_CONTEXT_CIRCLE_RADIUS),
          rightConnCircle: new Circle(new Point(newRect.topRightX, newRect.topLeftY + newRect.height / 2), RECTANGLE_CONTEXT_CIRCLE_RADIUS),
          topConnCircle: new Circle(new Point(newRect.topLeftX + newRect.width / 2, newRect.topLeftY), RECTANGLE_CONTEXT_CIRCLE_RADIUS),
          bottomConnCircle: new Circle(new Point(newRect.bottomLeftX + newRect.width / 2, newRect.bottomLeftY), RECTANGLE_CONTEXT_CIRCLE_RADIUS),
        });
      }
      break;
    }
  }

  isMouseSelecting = true;
});

mousePress((e) => {
  if (!isMouseInTheResizingZone || !isMouseSelecting) {
    return;
  }

  console.log('isMouseResizing', isMouseResizing);

  isMouseResizing = true;

});

/**
 * Resize
 */
mouseDrag((e) => {
  if (!(isMouseSelecting && selectedEntityId && isMouseResizing)) {
    return;
  }

  const entity = world.getEntity(selectedEntityId);
  if (!entity) {
    return;
  }

  console.log('resizing');

  const dragEndX = e.offsetX;
  const dragEndY = e.offsetY;

  const isRect = entity.getComponent(IsRectangle);
  const deltaX = dragStartX - dragEndX;
  const deltaY = dragStartY - dragEndY;

  const rect = isRect.properties.rectangle;

  const contextComp = entity.getComponent(HasRectangleContext);
  const contextRect = contextComp.properties.rectangle;

  if (resizeHandle === ResizeHandle.LEFT) {
    rect.moveCenterBy(-deltaX / 2, 0);
    rect.width += deltaX;
    contextRect.width += deltaX;
  } else if (resizeHandle === ResizeHandle.RIGHT) {
    rect.moveCenterBy(-deltaX / 2, 0);
    rect.width -= deltaX;
    contextRect.width -= deltaX;
  } else if (resizeHandle === ResizeHandle.TOP) {
    rect.moveCenterBy(0, -deltaY / 2);
    rect.height += deltaY;
    contextRect.height += deltaY;
  } else if (resizeHandle === ResizeHandle.BOTTOM) {
    rect.moveCenterBy(0, -deltaY / 2);
    rect.height -= deltaY;
    contextRect.height -= deltaY;
  }

  contextComp.properties.leftConnCircle.center.x = contextRect.topLeftX;
  contextComp.properties.leftConnCircle.center.y = contextRect.topLeftY + contextRect.height / 2;
  contextComp.properties.rightConnCircle.center.x = contextRect.topRightX;
  contextComp.properties.rightConnCircle.center.y = contextRect.topLeftY + contextRect.height / 2;
  contextComp.properties.topConnCircle.center.x = contextRect.topLeftX + contextRect.width / 2;
  contextComp.properties.topConnCircle.center.y = contextRect.topLeftY;
  contextComp.properties.bottomConnCircle.center.x = contextRect.bottomLeftX + contextRect.width / 2;
  contextComp.properties.bottomConnCircle.center.y = contextRect.bottomLeftY;

  dragStartX = dragEndX;
  dragStartY = dragEndY;

});

/**
 * Detect resizing (for cursor).
 */
mouseMove((e) => {
  if (!selectedEntityId) {
    return;
  }

  const x = e.offsetX;
  const y = e.offsetY;

  const entity = world.getEntity(selectedEntityId);
  if (!entity) {
    return;
  }

  const isRect = entity.getComponent(IsRectangle);
  const point = new Point(x, y);
  const rect = isRect.properties.rectangle;

  // If not in the padded area of the rect, don't bother to check
  if (!rect.intersectsWithPoint(point, RESIZE_HANDLE_AREA_TOLERANCE)) {
    updateCanvasCursor('auto');
    return;
  }

  if (entity.hasComponent(HasRectangleContext)) {
    const contextComp = entity.getComponent(HasRectangleContext);
    if (contextComp.properties.rightConnCircle.intersectsWithPoint(point)) {
      console.log('rightConnPoint');
      updateCanvasCursor('cell');
      return;
    }
  }


  if (point.x >= rect.topLeftX - RESIZE_HANDLE_AREA_TOLERANCE && point.x <= rect.topLeftX + RESIZE_HANDLE_AREA_TOLERANCE) {
    resizeHandle = ResizeHandle.LEFT;
    updateCanvasCursor('ew-resize');
    isMouseInTheResizingZone = true;
  } else if (point.x >= rect.topRightX - RESIZE_HANDLE_AREA_TOLERANCE && point.x <= rect.topRightX + RESIZE_HANDLE_AREA_TOLERANCE) {
    resizeHandle = ResizeHandle.RIGHT;
    updateCanvasCursor('ew-resize');
    isMouseInTheResizingZone = true;
  } else if (point.y >= rect.topLeftY - RESIZE_HANDLE_AREA_TOLERANCE && point.y <= rect.topLeftY + RESIZE_HANDLE_AREA_TOLERANCE) {
    resizeHandle = ResizeHandle.TOP;
    updateCanvasCursor('ns-resize');
    isMouseInTheResizingZone = true;
  } else if (point.y >= rect.bottomLeftY - RESIZE_HANDLE_AREA_TOLERANCE && point.y <= rect.bottomLeftY + RESIZE_HANDLE_AREA_TOLERANCE) {
    resizeHandle = ResizeHandle.BOTTOM;
    updateCanvasCursor('ns-resize');
    isMouseInTheResizingZone = true;
  } else {
    updateCanvasCursor('auto');
    isMouseInTheResizingZone = false;
  }

});

/**
 * Moving shapes around.
 */
mouseDrag((e) => {
  if (!isMouseSelecting || isMouseResizing) {
    return;
  }

  const dragEndX = e.offsetX;
  const dragEndY = e.offsetY;

  console.log("dragging");

  const entity = world.getEntity(selectedEntityId);
  if (entity) {
    const isRect = entity.getComponent(IsRectangle);
    const deltaX = dragStartX - dragEndX;
    const deltaY = dragStartY - dragEndY;

    const rect = isRect.properties.rectangle;
    rect.moveCenterBy(-deltaX, -deltaY);

    // Update the context as well.
    if (entity.hasComponent(HasRectangleContext)) {
      const contextComp = entity.getComponent(HasRectangleContext);
      const contextCompRect = contextComp.properties.rectangle;

      contextComp.properties.leftConnCircle.center.x = contextCompRect.topLeftX;
      contextComp.properties.leftConnCircle.center.y = contextCompRect.topLeftY + contextCompRect.height / 2;
      contextComp.properties.rightConnCircle.center.x = contextCompRect.topRightX;
      contextComp.properties.rightConnCircle.center.y = contextCompRect.topLeftY + contextCompRect.height / 2;
      contextComp.properties.topConnCircle.center.x = contextCompRect.topLeftX + contextCompRect.width / 2;
      contextComp.properties.topConnCircle.center.y = contextCompRect.topLeftY;
      contextComp.properties.bottomConnCircle.center.x = contextCompRect.bottomLeftX + contextCompRect.width / 2;
      contextComp.properties.bottomConnCircle.center.y = contextCompRect.bottomLeftY;
    }

    // Reset drag.
    dragStartX = dragEndX;
    dragStartY = dragEndY;
  }
});

mouseRelease((e) => {
  console.log("mouseRelease");
  isMouseSelecting = false;
  if (isMouseResizing) {
    updateCanvasCursor('auto');
    resizeHandle = ResizeHandle.NONE;
    isMouseResizing = false;
  }

  dragStartX = 0;
  dragStartY = 0;
});

world.start();

(window as any)['world'] = world;
