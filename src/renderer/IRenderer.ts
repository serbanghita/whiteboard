import { StrokeStyle } from "../strokeStyle";

export interface DrawOptions {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** undefined = solid. Dash/dot patterns are world-space (zoom with the shape). */
  strokeStyle?: StrokeStyle;
  /**
   * Distance (world units) to skip at a styled LINE's start/end - the arrow
   * base, so a dash gap never separates an arrowhead from its line. Ignored
   * for solid strokes and closed outlines.
   */
  trimStart?: number;
  trimEnd?: number;
}

/**
 * Opaque handle to a GPU texture. Only the renderer that created it knows
 * what is inside, so IRenderer stays WebGL-agnostic.
 */
export type TextureHandle = object;

export interface IRenderer {
  /**
   * Set the logical resolution used to map drawing coordinates to the canvas.
   * Pass CSS-pixel dimensions when the backing store is scaled by devicePixelRatio.
   * @param width Logical width in CSS pixels
   * @param height Logical height in CSS pixels
   */
  setResolution(width: number, height: number): void;

  /**
   * Set the camera transform applied to all drawing coordinates.
   * @param scale Zoom factor: screen pixels per world unit
   * @param x World X of the viewport's top-left corner
   * @param y World Y of the viewport's top-left corner
   */
  setCamera(scale: number, x: number, y: number): void;

  /**
   * Clear the entire canvas
   */
  clear(): void;

  /**
   * Draw a rectangle
   * @param x Top-left X coordinate
   * @param y Top-left Y coordinate
   * @param width Width of the rectangle
   * @param height Height of the rectangle
   * @param options Drawing options (fill, stroke, etc.)
   */
  rectangle(x: number, y: number, width: number, height: number, options?: DrawOptions): void;

  /**
   * Draw a circle
   * @param cx Center X coordinate
   * @param cy Center Y coordinate
   * @param radius Radius of the circle
   * @param options Drawing options (fill, stroke, etc.)
   */
  circle(cx: number, cy: number, radius: number, options?: DrawOptions): void;

  /**
   * Draw a line
   * @param x1 Start X coordinate
   * @param y1 Start Y coordinate
   * @param x2 End X coordinate
   * @param y2 End Y coordinate
   * @param options Drawing options (color, width)
   */
  line(x1: number, y1: number, x2: number, y2: number, options?: DrawOptions): void;

  /**
   * Draw a filled triangle (world coordinates).
   * Color: fillColor, falling back to strokeColor, then black.
   */
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, options?: DrawOptions): void;

  /**
   * Largest texture dimension the backend supports, in pixels.
   */
  maxTextureSize(): number;

  /**
   * Upload a rasterized canvas as a GPU texture.
   * @param source Offscreen canvas holding the rasterized pixels
   */
  createTextureFromCanvas(source: HTMLCanvasElement): TextureHandle;

  /**
   * Free a texture previously created with createTextureFromCanvas.
   */
  deleteTexture(handle: TextureHandle): void;

  /**
   * Draw a texture stretched over a world-space quad (full 0..1 texcoords).
   * @param handle Texture to draw
   * @param x Top-left X coordinate (world)
   * @param y Top-left Y coordinate (world)
   * @param width Quad width (world)
   * @param height Quad height (world)
   */
  texturedQuad(handle: TextureHandle, x: number, y: number, width: number, height: number): void;

  /**
   * Draw a small dot/point
   * @param x X coordinate
   * @param y Y coordinate
   * @param options Drawing options (color, size via strokeWidth)
   */
  dot(x: number, y: number, options?: DrawOptions): void;
}
