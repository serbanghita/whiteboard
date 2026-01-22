import { IRenderer, DrawOptions, TextOptions } from "./IRenderer";
import { ShaderProgram, vertexShaderSource, fragmentShaderSource } from "./shaders";
import { parseColor } from "./colorUtils";

/**
 * WebGL implementation of IRenderer
 */
export default class WebGLRenderer implements IRenderer {
  private shaderProgram: ShaderProgram;
  private positionBuffer: WebGLBuffer;
  private positionAttributeLocation: number;
  private resolutionUniformLocation: WebGLUniformLocation;
  private colorUniformLocation: WebGLUniformLocation;

  constructor(private gl: WebGLRenderingContext) {
    // Initialize shader program
    this.shaderProgram = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
    this.shaderProgram.use();

    // Get attribute and uniform locations
    this.positionAttributeLocation = this.shaderProgram.getAttributeLocation("a_position");
    this.resolutionUniformLocation = this.shaderProgram.getUniformLocation("u_resolution");
    this.colorUniformLocation = this.shaderProgram.getUniformLocation("u_color");

    // Create position buffer
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("Failed to create WebGL buffer");
    }
    this.positionBuffer = buffer;

    // Set resolution uniform
    gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
  }

  public clear(): void {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  public rectangle(x: number, y: number, width: number, height: number, options?: DrawOptions): void {
    // x, y are top-left coordinates
    const x1 = x;
    const y1 = y;
    const x2 = x + width;
    const y2 = y + height;

    // Draw fill if fillColor is set
    if (options?.fillColor) {
      const color = parseColor(options.fillColor);
      this.setColor(color);

      // Two triangles for a filled rectangle
      const positions = new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2,
      ]);

      this.drawTriangles(positions);
    }

    // Draw stroke if strokeColor is set
    if (options?.strokeColor) {
      const color = parseColor(options.strokeColor);
      this.setColor(color);
      const lineWidth = options?.strokeWidth || 1;

      // Draw four lines for the rectangle outline
      this.drawLineInternal(x1, y1, x2, y1, lineWidth);
      this.drawLineInternal(x2, y1, x2, y2, lineWidth);
      this.drawLineInternal(x2, y2, x1, y2, lineWidth);
      this.drawLineInternal(x1, y2, x1, y1, lineWidth);
    }

    // Default: draw black stroke if no options
    if (!options?.fillColor && !options?.strokeColor) {
      this.setColor([0, 0, 0, 1]);

      this.drawLineInternal(x1, y1, x2, y1, 1);
      this.drawLineInternal(x2, y1, x2, y2, 1);
      this.drawLineInternal(x2, y2, x1, y2, 1);
      this.drawLineInternal(x1, y2, x1, y1, 1);
    }
  }

  public circle(cx: number, cy: number, radius: number, options?: DrawOptions): void {
    const segments = Math.max(16, Math.floor(radius * 2));

    if (options?.fillColor) {
      const color = parseColor(options.fillColor);
      this.setColor(color);

      // Triangle fan for filled circle
      const positions: number[] = [];
      positions.push(cx, cy); // Center point

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        positions.push(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius
        );
      }

      this.drawTriangleFan(new Float32Array(positions));
    }

    if (options?.strokeColor) {
      const color = parseColor(options.strokeColor);
      this.setColor(color);
      const lineWidth = options?.strokeWidth || 1;

      // Line loop for circle outline
      for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        this.drawLineInternal(
          cx + Math.cos(angle1) * radius,
          cy + Math.sin(angle1) * radius,
          cx + Math.cos(angle2) * radius,
          cy + Math.sin(angle2) * radius,
          lineWidth
        );
      }
    }

    // Default: draw black stroke
    if (!options?.fillColor && !options?.strokeColor) {
      this.setColor([0, 0, 0, 1]);
      for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        this.drawLineInternal(
          cx + Math.cos(angle1) * radius,
          cy + Math.sin(angle1) * radius,
          cx + Math.cos(angle2) * radius,
          cy + Math.sin(angle2) * radius,
          1
        );
      }
    }
  }

  public line(x1: number, y1: number, x2: number, y2: number, options?: DrawOptions): void {
    const color = options?.strokeColor ? parseColor(options.strokeColor) : [0, 0, 0, 1];
    this.setColor(color);
    const lineWidth = options?.strokeWidth || 1;
    this.drawLineInternal(x1, y1, x2, y2, lineWidth);
  }

  public text(str: string, x: number, y: number, options?: TextOptions): void {
    // Text rendering requires MSDF or canvas texture approach
    // For now, this is a placeholder - text will be implemented in a future iteration
    console.warn("WebGL text rendering not yet implemented. Text:", str);
  }

  public dot(x: number, y: number, options?: DrawOptions): void {
    const radius = options?.strokeWidth || 2;
    const color = options?.fillColor || options?.strokeColor || "black";
    this.circle(x, y, radius, { fillColor: color });
  }

  private drawTriangles(positions: Float32Array): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.positionAttributeLocation);
    gl.vertexAttribPointer(this.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
  }

  private drawTriangleFan(positions: Float32Array): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(this.positionAttributeLocation);
    gl.vertexAttribPointer(this.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, positions.length / 2);
  }

  private drawLineInternal(x1: number, y1: number, x2: number, y2: number, width: number): void {
    const gl = this.gl;

    // Calculate perpendicular vector for line width
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const nx = (-dy / len) * (width / 2);
    const ny = (dx / len) * (width / 2);

    // Create quad vertices for thick line
    const positions = new Float32Array([
      x1 - nx, y1 - ny,
      x1 + nx, y1 + ny,
      x2 - nx, y2 - ny,
      x2 - nx, y2 - ny,
      x1 + nx, y1 + ny,
      x2 + nx, y2 + ny,
    ]);

    this.drawTriangles(positions);
  }

  private setColor(color: number[]): void {
    this.gl.uniform4f(this.colorUniformLocation, color[0], color[1], color[2], color[3]);
  }
}
