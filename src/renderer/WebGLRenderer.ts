import { IRenderer, DrawOptions, TextureHandle } from "./IRenderer";
import {
  ShaderProgram,
  vertexShaderSource,
  fragmentShaderSource,
  texturedVertexShaderSource,
  texturedFragmentShaderSource,
} from "./shaders";
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
  private translateUniformLocation: WebGLUniformLocation;
  private scaleUniformLocation: WebGLUniformLocation;

  // Textured-quad path (rasterized text). Uniforms are per-program state, so
  // the textured program keeps its own camera/resolution locations; the
  // cached values below are pushed to it on every textured draw.
  private texturedProgram: ShaderProgram;
  private texcoordBuffer: WebGLBuffer;
  private texturedPositionLocation: number;
  private texturedTexcoordLocation: number;
  private texturedResolutionLocation: WebGLUniformLocation;
  private texturedTranslateLocation: WebGLUniformLocation;
  private texturedScaleLocation: WebGLUniformLocation;
  private cachedResolution: { width: number; height: number };
  private cachedCamera = { scale: 1, x: 0, y: 0 };

  constructor(private gl: WebGLRenderingContext) {
    // Initialize shader program
    this.shaderProgram = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

    // Textured program (set its sampler to texture unit 0 once).
    this.texturedProgram = new ShaderProgram(gl, texturedVertexShaderSource, texturedFragmentShaderSource);
    this.texturedPositionLocation = this.texturedProgram.getAttributeLocation("a_position");
    this.texturedTexcoordLocation = this.texturedProgram.getAttributeLocation("a_texcoord");
    this.texturedResolutionLocation = this.texturedProgram.getUniformLocation("u_resolution");
    this.texturedTranslateLocation = this.texturedProgram.getUniformLocation("u_translate");
    this.texturedScaleLocation = this.texturedProgram.getUniformLocation("u_scale");
    this.texturedProgram.use();
    gl.uniform1i(this.texturedProgram.getUniformLocation("u_texture"), 0);

    // The basic program is the resident one; every non-textured draw assumes
    // it is active.
    this.shaderProgram.use();

    // Get attribute and uniform locations
    this.positionAttributeLocation = this.shaderProgram.getAttributeLocation("a_position");
    this.resolutionUniformLocation = this.shaderProgram.getUniformLocation("u_resolution");
    this.colorUniformLocation = this.shaderProgram.getUniformLocation("u_color");
    this.translateUniformLocation = this.shaderProgram.getUniformLocation("u_translate");
    this.scaleUniformLocation = this.shaderProgram.getUniformLocation("u_scale");

    // Create position buffer
    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error("Failed to create WebGL buffer");
    }
    this.positionBuffer = buffer;

    const texcoordBuffer = gl.createBuffer();
    if (!texcoordBuffer) {
      throw new Error("Failed to create WebGL buffer");
    }
    this.texcoordBuffer = texcoordBuffer;

    // Alpha blending for anti-aliased text edges (premultiplied alpha, see
    // createTextureFromCanvas). Solid shapes write alpha=1, so this is a
    // no-op for them.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Set resolution uniform
    this.cachedResolution = { width: gl.canvas.width, height: gl.canvas.height };
    gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

    // Identity camera, so camera-less usage keeps the old pixel mapping
    gl.uniform2f(this.translateUniformLocation, 0, 0);
    gl.uniform1f(this.scaleUniformLocation, 1);
  }

  public setResolution(width: number, height: number): void {
    this.cachedResolution = { width, height };
    this.gl.uniform2f(this.resolutionUniformLocation, width, height);
  }

  public setCamera(scale: number, x: number, y: number): void {
    this.cachedCamera = { scale, x, y };
    this.gl.uniform2f(this.translateUniformLocation, x, y);
    this.gl.uniform1f(this.scaleUniformLocation, scale);
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

  public createTextureFromCanvas(source: HTMLCanvasElement): TextureHandle {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Failed to create WebGL texture");
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Premultiplied alpha to match blendFunc(ONE, ONE_MINUS_SRC_ALPHA).
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // Row 0 of the canvas (its top) stays row 0 of the texture; texcoords in
    // texturedQuad put v=0 at the quad's world-space top, so no flip needed.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // WebGL1 NPOT textures: clamp, linear filtering, no mipmaps.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  public deleteTexture(handle: TextureHandle): void {
    this.gl.deleteTexture(handle as WebGLTexture);
  }

  public texturedQuad(handle: TextureHandle, x: number, y: number, width: number, height: number): void {
    const gl = this.gl;

    this.texturedProgram.use();
    // Uniforms are per-program: push the cached camera/resolution so the
    // textured quad lands in the same world as the shapes.
    gl.uniform2f(this.texturedResolutionLocation, this.cachedResolution.width, this.cachedResolution.height);
    gl.uniform2f(this.texturedTranslateLocation, this.cachedCamera.x, this.cachedCamera.y);
    gl.uniform1f(this.texturedScaleLocation, this.cachedCamera.scale);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle as WebGLTexture);

    const x2 = x + width;
    const y2 = y + height;
    const positions = new Float32Array([
      x, y,
      x2, y,
      x, y2,
      x, y2,
      x2, y,
      x2, y2,
    ]);
    const texcoords = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.texturedPositionLocation);
    gl.vertexAttribPointer(this.texturedPositionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.texturedTexcoordLocation);
    gl.vertexAttribPointer(this.texturedTexcoordLocation, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Leave the basic program resident; its own uniform state is retained by
    // WebGL, and every basic draw re-binds its attributes.
    gl.disableVertexAttribArray(this.texturedTexcoordLocation);
    this.shaderProgram.use();
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
