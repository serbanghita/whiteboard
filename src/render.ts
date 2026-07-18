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
  $wrapper.style.position = 'fixed';
  $wrapper.style.inset = '0';

  document.body.appendChild($wrapper);

  return $wrapper;
}

export function createCanvas(id: string) {
  $canvas = document.createElement('canvas') as HTMLCanvasElement;
  $canvas.id = id;
  $canvas.style.display = "block";
  $canvas.style.width = "100%";
  $canvas.style.height = "100%";
  $canvas.style.background = "white";

  const glContext = $canvas.getContext("webgl");
  if (!glContext) {
    throw new Error('WebGL is not supported in this browser.');
  }
  gl = glContext;

  resizeCanvasToViewport();
  gl.clearColor(1.0, 1.0, 1.0, 1.0);

  if (!$wrapper) {
    throw new Error('Wrapper DOM element was not created.');
  }

  $wrapper.appendChild($canvas);

  return { $canvas, gl };
}

/**
 * Sizes the canvas backing store to the full viewport, scaled by
 * devicePixelRatio for crisp rendering on HiDPI screens. Returns the viewport
 * size in CSS pixels — the app's coordinate space (shape coordinates and mouse
 * offsetX/offsetY both live in CSS pixels; only the backing store is scaled).
 */
export function resizeCanvasToViewport() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  $canvas.width = width * getPixelRatio();
  $canvas.height = height * getPixelRatio();
  gl.viewport(0, 0, $canvas.width, $canvas.height);
  return { width, height };
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
  // Bound on window: a mouseup outside the wrapper must still end the press,
  // otherwise IsMousePressed stays stuck on and click edges never fire again.
  window.addEventListener("mouseup", fn, { capture: true });
}

export function wheel(fn: (e: WheelEvent) => void) {
  // passive: false is required - a passive listener ignores preventDefault(),
  // and ctrl+wheel would trigger the browser's page zoom.
  $canvas.addEventListener("wheel", fn, { passive: false });
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
 * Highlight the given tool's button in the floating menu.
 * Safe to call when the menu is absent (e.g. headless tests without it).
 */
export function setActiveToolButton(tool: ToolType) {
  const floatingMenu = document.querySelector('.floating-menu');
  if (!floatingMenu) return;

  floatingMenu.querySelectorAll('button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
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
    setActiveToolButton(tool);

    // Update ECS state
    const toolEntity = world.getEntity('tool');
    if (toolEntity) {
      const toolState = toolEntity.getComponent(ToolStateComponent);
      // Cancel any in-progress drawing before switching, like Escape does -
      // reset() alone would orphan the preview entity on the canvas.
      if (toolState.previewEntityId) {
        world.removeEntity(toolState.previewEntityId);
      }
      toolState.currentTool = tool;
      toolState.reset();
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
            world.removeEntity(toolState.previewEntityId);
          }
          toolState.reset();
          console.log('Drawing cancelled');
        }
      }
    }
  });
}
