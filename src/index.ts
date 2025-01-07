import { Point } from "@serbanghita-gamedev/geometry";
import { clearCanvas, createCanvas, mouseDrag, mousePress, mouseRelease } from "./render";
import { World } from "@serbanghita-gamedev/ecs";
import IsRectangle from "./IsRectangle";
import IsRendered from "./IsRendered";
import IsPoint from "./IsPoint";
import RenderingSystem from "./RenderSystem";

/**
 * Rendering
 */
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
let selectedEntityId: string;
let dragStartX: number;
let dragStartY: number;

mousePress((e) => {
  const x = (dragStartX = e.offsetX);
  const y = (dragStartY = e.offsetY);

  const point = new Point(x, y);
  console.log("mousePress", x, y);

  for (const [entityId, entity] of allRectanglesQuery.execute()) {
    const isRect = entity.getComponent(IsRectangle);
    if (isRect.properties.rectangle.intersectsWithPoint(point)) {
      console.log(point, "intersects with", entityId);

      selectedEntityId = entityId;
    }
  }

  isMouseSelecting = true;

  mouseDrag((e) => {
    const dragEndX = e.offsetX;
    const dragEndY = e.offsetY;

    console.log("mouseDrag", dragEndX, dragEndY);

    const entity = world.getEntity(selectedEntityId);
    if (entity) {
      const comp = entity.getComponent(IsRectangle);
      const deltaX = dragStartX - dragEndX;
      const deltaY = dragStartY - dragEndY;

      comp.properties.rectangle.moveCenterBy(-deltaX, -deltaY);

      comp.properties.x = comp.properties.rectangle.topLeftX;
      comp.properties.y = comp.properties.rectangle.topLeftY;

      dragStartX = dragEndX;
      dragStartY = dragEndY;
    }
  });
});

mouseRelease();

world.start();
