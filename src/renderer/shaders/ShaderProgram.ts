/**
 * Utility class for creating and managing WebGL shader programs
 */
export default class ShaderProgram {
  public program: WebGLProgram;
  private attributeLocations: Map<string, number> = new Map();
  private uniformLocations: Map<string, WebGLUniformLocation> = new Map();

  constructor(
    private gl: WebGLRenderingContext,
    vertexSource: string,
    fragmentSource: string
  ) {
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    this.program = this.createProgram(vertexShader, fragmentShader);
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Failed to compile shader: ${info}`);
    }

    return shader;
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create program');
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`Failed to link program: ${info}`);
    }

    return program;
  }

  public use(): void {
    this.gl.useProgram(this.program);
  }

  public getAttributeLocation(name: string): number {
    if (!this.attributeLocations.has(name)) {
      const location = this.gl.getAttribLocation(this.program, name);
      this.attributeLocations.set(name, location);
    }
    return this.attributeLocations.get(name)!;
  }

  public getUniformLocation(name: string): WebGLUniformLocation {
    if (!this.uniformLocations.has(name)) {
      const location = this.gl.getUniformLocation(this.program, name);
      if (!location) {
        throw new Error(`Uniform '${name}' not found`);
      }
      this.uniformLocations.set(name, location);
    }
    return this.uniformLocations.get(name)!;
  }

  public setUniform2f(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.getUniformLocation(name), x, y);
  }

  public setUniform4f(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.getUniformLocation(name), x, y, z, w);
  }
}
