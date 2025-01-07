let $canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

export function createCanvas(id: string) {
  $canvas = document.createElement(id) as HTMLCanvasElement;
  $canvas.width = 640;
  $canvas.height = 480;
  $canvas.style.border = "1px solid black";
  $canvas.style.background = "white";

  ctx = $canvas.getContext("2d") as CanvasRenderingContext2D;

  document.body.appendChild($canvas);

  return { $canvas, ctx };
}

export function clearCanvas() {
  ctx.clearRect(0, 0, 640, 480);
}

let mouseDragController: AbortController;

export function mousePress(fn: (e: MouseEvent) => void) {
  $canvas.addEventListener("mousedown", fn, { capture: true });
}

export function mouseRelease() {
  $canvas.addEventListener(
    "mouseup",
    (e) => {
      if (mouseDragController) {
        mouseDragController.abort();
      }
    },
    { capture: true },
  );
}

export function mouseDrag(fn: (e: MouseEvent) => void) {
  mouseDragController = new AbortController();
  $canvas.addEventListener("mousemove", fn, { capture: true, signal: mouseDragController.signal });
}
