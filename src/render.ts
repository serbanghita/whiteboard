import { Entity, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "./component/RectangleComponent";
import ToolStateComponent, { ToolType } from "./component/ToolStateComponent";

let $wrapper: HTMLDivElement;
let $canvas: HTMLCanvasElement;
let gl: WebGLRenderingContext;

export function getPixelRatio() {
  return window.devicePixelRatio || 1;
}

export function createWrapper(id: string) {
  $wrapper = document.createElement('div');
  $wrapper.id = id;
  $wrapper.style.width = `${640 * getPixelRatio()}px`;
  $wrapper.style.height = `${480 * getPixelRatio()}px`;
  $wrapper.style.position = 'relative';
  $wrapper.style.border = "1px solid dotted";

  document.body.appendChild($wrapper);

  return $wrapper;
}

export function createCanvas(id: string) {
  $canvas = document.createElement('canvas') as HTMLCanvasElement;
  $canvas.id = id;
  $canvas.width = 640 * getPixelRatio();
  $canvas.height = 480 * getPixelRatio();
  $canvas.style.border = "1px solid black";
  $canvas.style.background = "white";

  const glContext = $canvas.getContext("webgl");
  if (!glContext) {
    throw new Error('WebGL is not supported in this browser.');
  }
  gl = glContext;

  // Set up WebGL viewport and clear color (white background)
  gl.viewport(0, 0, $canvas.width, $canvas.height);
  gl.clearColor(1.0, 1.0, 1.0, 1.0);

  if (!$wrapper) {
    throw new Error('Wrapper DOM element was not created.');
  }

  $wrapper.appendChild($canvas);

  return { $canvas, gl };
}

export function clearCanvas() {
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function getGL(): WebGLRenderingContext {
  return gl;
}

let mouseDragController: AbortController;

export function mousePress(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousedown", fn, { capture: true });
}

export function mouseRelease(fn: (e: MouseEvent) => void) {
  $wrapper.addEventListener("mouseup", fn, { capture: true });
}

export function mouseOver(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mouseover", fn, { capture: true });
}

export function mouseMove(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousemove", fn, { capture: true });
}

export function mouseDrag(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousemove", fn, { capture: true });
}

export function hasContextSelection(entity: Entity) {
  return !!document.getElementById(`contextSelection-entity-${entity.id}`);
}

export function createContextSelectionForEntity(entity: Entity) {
  const rectComp = entity.getComponent(RectangleComponent);

  const $div = document.createElement('div');
  $div.id = `contextSelection-entity-${entity.id}`;
  $div.style.width = `${rectComp.width}px`;
  $div.style.height = `${rectComp.height}px`;
  $div.style.border = '2px solid blue';
  $div.style.position = 'absolute';
  $div.style.left = `${rectComp.x - 1}px`;
  $div.style.top = `${rectComp.y - 1}px`;
  $div.style.pointerEvents = 'none';

  $wrapper.appendChild($div);
}

export function updateContextSelectionForEntity(entity: Entity) {
  const rectComp = entity.getComponent(RectangleComponent);

  const $div = document.getElementById(`contextSelection-entity-${entity.id}`) as HTMLDivElement;
  $div.style.left = `${rectComp.x - 1}px`;
  $div.style.top = `${rectComp.y - 1}px`;
  $div.style.width = `${rectComp.width}px`;
  $div.style.height = `${rectComp.height}px`;
}

export function updateCanvasCursor(cursor: string) {
  $canvas.style.cursor = cursor;
}

export function removeContextSelectionForEntity(entity: Entity) {
  const $div = document.getElementById(`contextSelection-entity-${entity.id}`) as HTMLDivElement;
  $div.remove();
}

/**
 * Initialize floating menu event binding.
 * Updates ToolStateComponent when menu buttons are clicked.
 */
export function initFloatingMenu(world: World) {
  const floatingMenu = document.querySelector('.floating-menu');
  if (!floatingMenu) {
    console.warn('Floating menu not found in DOM');
    return;
  }

  floatingMenu.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
    if (!button) return;

    const tool = button.dataset.tool as ToolType;
    if (!tool) return;

    // Update visual state
    floatingMenu.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    // Update ECS state
    const toolEntity = world.getEntity('tool');
    if (toolEntity) {
      const toolState = toolEntity.getComponent(ToolStateComponent);
      toolState.currentTool = tool;
      toolState.reset(); // Reset any in-progress drawing
      console.log(`Tool changed to: ${tool}`);
    }
  });
}

/**
 * Initialize keyboard event handling.
 * Handles Escape key to cancel drawing.
 */
export function initKeyboardEvents(world: World) {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const toolEntity = world.getEntity('tool');
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);

        // Cancel any in-progress drawing
        if (toolState.drawState === 'FIRST_POINT_SET') {
          // If there's a preview entity, destroy it
          if (toolState.previewEntityId) {
            const previewEntity = world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              world.removeEntity(previewEntity);
            }
          }
          toolState.reset();
          console.log('Drawing cancelled');
        }
      }
    }
  });
}
