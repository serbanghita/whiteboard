import { Point } from "@serbanghita-gamedev/geometry";
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

enum ResizeHandle {
  NONE = 0,
  TOP = 1,
  BOTTOM = 2,
  LEFT = 3,
  RIGHT = 4,
}

// How many pixels left/right from a border trigger the "drag" cursor detection.
const RESIZE_HANDLE_AREA_TOLERANCE = 20;

/**
 * Rendering
 */
const $wrapper = createWrapper('canvas-wrapper');
const { $canvas, ctx } = createCanvas("canvas");

/**
 * ECS
 */
const world = new World();
world.registerComponents([IsRendered, IsPoint, IsRectangle]);

/**
 * Entities
 */
const shape1 = world.createEntity("shape1");
shape1.addComponent(IsRectangle, { x: 10, y: 10, width: 100, height: 200 });
shape1.addComponent(IsRendered);
const shape2 = world.createEntity("shape2");
shape2.addComponent(IsRectangle, { x: 300, y: 20, width: 100, height: 200 });
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
        removeContextSelectionForEntity(entity);
        selectedEntityId = '';
      }
    }
  }

  for (const [entityId, entity] of allRectanglesQuery.execute()) {
    const isRect = entity.getComponent(IsRectangle);
    if (isRect.properties.rectangle.intersectsWithPoint(point)) {
      console.log(point, "intersects with", entityId);
      selectedEntityId = entityId;
      if (!hasContextSelection(entity)) {
        createContextSelectionForEntity(entity);
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

  // console.log('resizeHandle', resizeHandle);
  // console.log('deltaX', deltaX, 'deltaY', deltaY);

  const rect = isRect.properties.rectangle;

  if (resizeHandle === ResizeHandle.LEFT) {
    rect.moveCenterBy(-deltaX / 2, 0);
    rect.width += deltaX;
  } else if (resizeHandle === ResizeHandle.RIGHT) {
    rect.moveCenterBy(-deltaX / 2, 0);
    rect.width -= deltaX;
  } else if (resizeHandle === ResizeHandle.TOP) {
    rect.moveCenterBy(0, -deltaY / 2);
    rect.height += deltaY;
  } else if (resizeHandle === ResizeHandle.BOTTOM) {
    rect.moveCenterBy(0, -deltaY / 2);
    rect.height -= deltaY;
  }

  // isRect.properties.x = isRect.properties.rectangle.topLeftX;
  // isRect.properties.y = isRect.properties.rectangle.topLeftY;

  dragStartX = dragEndX;
  dragStartY = dragEndY;

  //
  //
  // rect.width -= deltaX;
  // rect.height -= deltaY;
  //
  // isRect.properties.width = rect.width;
  // isRect.properties.height = rect.height;
  //
  // isRect.properties.rectangle.moveCenterBy(-deltaX, -deltaY);
  // isRect.properties.x = isRect.properties.rectangle.topLeftX;
  // isRect.properties.y = isRect.properties.rectangle.topLeftY;

  updateContextSelectionForEntity(entity);

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

  console.log("dragging", dragEndX, dragEndY);

  const entity = world.getEntity(selectedEntityId);
  if (entity) {
    const isRect = entity.getComponent(IsRectangle);
    const deltaX = dragStartX - dragEndX;
    const deltaY = dragStartY - dragEndY;

    isRect.properties.rectangle.moveCenterBy(-deltaX, -deltaY);

    // isRect.properties.x = isRect.properties.rectangle.topLeftX;
    // isRect.properties.y = isRect.properties.rectangle.topLeftY;

    dragStartX = dragEndX;
    dragStartY = dragEndY;

    updateContextSelectionForEntity(entity);
  }
});

mouseRelease((e) => {
  console.log("mouseRelease");
  isMouseSelecting = false;
  isMouseResizing = false;
  resizeHandle = ResizeHandle.NONE;
  dragStartX = 0;
  dragStartY = 0;
});

world.start();
