export interface DrawOptions {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface TextOptions {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
}

export interface IRenderer {
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
   * Draw text
   * @param str Text string to draw
   * @param x X coordinate
   * @param y Y coordinate
   * @param options Text options (font, size, color)
   */
  text(str: string, x: number, y: number, options?: TextOptions): void;

  /**
   * Draw a small dot/point
   * @param x X coordinate
   * @param y Y coordinate
   * @param options Drawing options (color, size via strokeWidth)
   */
  dot(x: number, y: number, options?: DrawOptions): void;
}
