import { Entity } from "@serbanghita-gamedev/ecs";
import IsRectangle from "./IsRectangle";

let $wrapper: HTMLDivElement;
let $canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

export function createWrapper(id: string) {
  $wrapper = document.createElement('div');
  $wrapper.id = id;
  $wrapper.style.width = `640px`;
  $wrapper.style.height = `480px`;
  $wrapper.style.position = 'relative';
  $wrapper.style.border = "1px solid dotted";

  document.body.appendChild($wrapper);

  return $wrapper;
}

export function createCanvas(id: string) {
  $canvas = document.createElement('canvas') as HTMLCanvasElement;
  $canvas.id = id;
  $canvas.width = 640;
  $canvas.height = 480;
  $canvas.style.border = "1px solid black";
  $canvas.style.background = "white";

  ctx = $canvas.getContext("2d") as CanvasRenderingContext2D;

  if (!$wrapper) {
    throw new Error('Wrapper DOM element was not created.');
  }

  $wrapper.appendChild($canvas);

  return { $canvas, ctx };
}

export function clearCanvas() {
  ctx.clearRect(0, 0, 640, 480);
}

let mouseDragController: AbortController;

export function mousePress(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousedown", fn, { capture: true });
}

export function mouseRelease(fn: (e: MouseEvent) => void) {
  $wrapper.addEventListener("mouseup", fn, { capture: true });
  // $canvas.addEventListener(
  //   "mouseup",
  //   (e) => {
  //     fn(e);
  //     if (mouseDragController) {
  //       mouseDragController.abort();
  //     }
  //   },
  //   { capture: true },
  // );
}

export function mouseOver(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mouseover", fn, { capture: true });
}

export function mouseMove(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousemove", fn, { capture: true });
}

export function mouseDrag(fn: (e: MouseEvent) => void) {
  // mouseDragController = new AbortController();
  // $canvas.addEventListener("mousemove", fn, { capture: true, signal: mouseDragController.signal });
  $canvas.addEventListener("mousemove", fn, { capture: true });
}

export function hasContextSelection(entity: Entity) {
  return !!document.getElementById(`contextSelection-entity-${entity.id}`);
}

export function createContextSelectionForEntity(entity: Entity) {

  const isRect = entity.getComponent(IsRectangle);
  const $div = document.createElement('div');
  $div.id = `contextSelection-entity-${entity.id}`;
  $div.style.width = `${isRect.properties.width}px`;
  $div.style.height = `${isRect.properties.height}px`;
  $div.style.border = '2px solid blue';
  $div.style.position = 'absolute';
  $div.style.left = `${isRect.properties.rectangle.topLeftX-1}px`;
  $div.style.top = `${isRect.properties.rectangle.topLeftY-1}px`;
  $div.style.pointerEvents = 'none';

  $wrapper.appendChild($div);
}

export function updateContextSelectionForEntity(entity: Entity) {
  const isRect = entity.getComponent(IsRectangle);
  const rect = isRect.properties.rectangle;

  const $div = document.getElementById(`contextSelection-entity-${entity.id}`) as HTMLDivElement;
  $div.style.left = `${rect.topLeftX-1}px`;
  $div.style.top = `${rect.topLeftY-1}px`;
  $div.style.width = `${rect.width}px`;
  $div.style.height = `${rect.height}px`;
}

export function updateCanvasCursor(cursor: string) {
  $canvas.style.cursor = cursor;
}

export function removeContextSelectionForEntity(entity: Entity) {
  const $div = document.getElementById(`contextSelection-entity-${entity.id}`) as HTMLDivElement;
  $div.remove();
}
