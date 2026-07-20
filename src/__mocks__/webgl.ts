/**
 * WebGL Mock for headless testing
 * Provides a mock WebGLRenderingContext that tracks method calls
 */
import { vi } from 'vitest';

export interface MockWebGLRenderingContext extends WebGLRenderingContext {
  _calls: {
    method: string;
    args: unknown[];
  }[];
  _uniforms: Map<WebGLUniformLocation, unknown[]>;
  _buffers: Map<WebGLBuffer, ArrayBufferView | null>;
}

let mockShaderId = 0;
let mockProgramId = 0;
let mockBufferId = 0;
let mockUniformLocationId = 0;
let mockTextureId = 0;

export function createMockWebGLContext(): MockWebGLRenderingContext {
  const calls: { method: string; args: unknown[] }[] = [];
  const uniforms = new Map<WebGLUniformLocation, unknown[]>();
  const buffers = new Map<WebGLBuffer, ArrayBufferView | null>();

  const trackCall = (method: string, args: unknown[]) => {
    calls.push({ method, args: [...args] });
  };

  const mockCanvas = {
    width: 800,
    height: 600,
  } as HTMLCanvasElement;

  const context: Partial<MockWebGLRenderingContext> = {
    canvas: mockCanvas,
    _calls: calls,
    _uniforms: uniforms,
    _buffers: buffers,

    // Constants
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88E4,
    DYNAMIC_DRAW: 0x88E8,
    TRIANGLES: 0x0004,
    TRIANGLE_FAN: 0x0006,
    FLOAT: 0x1406,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    // Texture / blending constants (textured-quad text path)
    TEXTURE_2D: 0x0DE1,
    TEXTURE0: 0x84C0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812F,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    BLEND: 0x0BE2,
    ONE: 1,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    MAX_TEXTURE_SIZE: 0x0D33,

    // Shader methods
    createShader: vi.fn((type: number) => {
      trackCall('createShader', [type]);
      return { _id: ++mockShaderId, _type: type } as unknown as WebGLShader;
    }),

    shaderSource: vi.fn((shader: WebGLShader, source: string) => {
      trackCall('shaderSource', [shader, source]);
    }),

    compileShader: vi.fn((shader: WebGLShader) => {
      trackCall('compileShader', [shader]);
    }),

    getShaderParameter: vi.fn((shader: WebGLShader, pname: number) => {
      trackCall('getShaderParameter', [shader, pname]);
      if (pname === 0x8B81) return true; // COMPILE_STATUS
      return null;
    }),

    getShaderInfoLog: vi.fn((shader: WebGLShader) => {
      trackCall('getShaderInfoLog', [shader]);
      return '';
    }),

    deleteShader: vi.fn((shader: WebGLShader) => {
      trackCall('deleteShader', [shader]);
    }),

    // Program methods
    createProgram: vi.fn(() => {
      trackCall('createProgram', []);
      return { _id: ++mockProgramId } as unknown as WebGLProgram;
    }),

    attachShader: vi.fn((program: WebGLProgram, shader: WebGLShader) => {
      trackCall('attachShader', [program, shader]);
    }),

    linkProgram: vi.fn((program: WebGLProgram) => {
      trackCall('linkProgram', [program]);
    }),

    getProgramParameter: vi.fn((program: WebGLProgram, pname: number) => {
      trackCall('getProgramParameter', [program, pname]);
      if (pname === 0x8B82) return true; // LINK_STATUS
      return null;
    }),

    getProgramInfoLog: vi.fn((program: WebGLProgram) => {
      trackCall('getProgramInfoLog', [program]);
      return '';
    }),

    useProgram: vi.fn((program: WebGLProgram | null) => {
      trackCall('useProgram', [program]);
    }),

    deleteProgram: vi.fn((program: WebGLProgram) => {
      trackCall('deleteProgram', [program]);
    }),

    // Attribute methods
    getAttribLocation: vi.fn((program: WebGLProgram, name: string) => {
      trackCall('getAttribLocation', [program, name]);
      return 0; // Return valid location
    }),

    enableVertexAttribArray: vi.fn((index: number) => {
      trackCall('enableVertexAttribArray', [index]);
    }),

    disableVertexAttribArray: vi.fn((index: number) => {
      trackCall('disableVertexAttribArray', [index]);
    }),

    vertexAttribPointer: vi.fn((index: number, size: number, type: number, normalized: boolean, stride: number, offset: number) => {
      trackCall('vertexAttribPointer', [index, size, type, normalized, stride, offset]);
    }),

    // Uniform methods
    getUniformLocation: vi.fn((program: WebGLProgram, name: string) => {
      trackCall('getUniformLocation', [program, name]);
      const location = { _id: ++mockUniformLocationId, _name: name } as unknown as WebGLUniformLocation;
      return location;
    }),

    uniform1f: vi.fn((location: WebGLUniformLocation, x: number) => {
      trackCall('uniform1f', [location, x]);
      uniforms.set(location, [x]);
    }),

    uniform2f: vi.fn((location: WebGLUniformLocation, x: number, y: number) => {
      trackCall('uniform2f', [location, x, y]);
      uniforms.set(location, [x, y]);
    }),

    uniform3f: vi.fn((location: WebGLUniformLocation, x: number, y: number, z: number) => {
      trackCall('uniform3f', [location, x, y, z]);
      uniforms.set(location, [x, y, z]);
    }),

    uniform4f: vi.fn((location: WebGLUniformLocation, x: number, y: number, z: number, w: number) => {
      trackCall('uniform4f', [location, x, y, z, w]);
      uniforms.set(location, [x, y, z, w]);
    }),

    uniform1i: vi.fn((location: WebGLUniformLocation, x: number) => {
      trackCall('uniform1i', [location, x]);
      uniforms.set(location, [x]);
    }),

    // Buffer methods
    createBuffer: vi.fn(() => {
      trackCall('createBuffer', []);
      const buffer = { _id: ++mockBufferId } as unknown as WebGLBuffer;
      buffers.set(buffer, null);
      return buffer;
    }),

    bindBuffer: vi.fn((target: number, buffer: WebGLBuffer | null) => {
      trackCall('bindBuffer', [target, buffer]);
    }),

    bufferData: vi.fn((target: number, data: ArrayBufferView | number, usage: number) => {
      trackCall('bufferData', [target, data, usage]);
    }),

    deleteBuffer: vi.fn((buffer: WebGLBuffer) => {
      trackCall('deleteBuffer', [buffer]);
      buffers.delete(buffer);
    }),

    // Drawing methods
    clear: vi.fn((mask: number) => {
      trackCall('clear', [mask]);
    }),

    clearColor: vi.fn((r: number, g: number, b: number, a: number) => {
      trackCall('clearColor', [r, g, b, a]);
    }),

    viewport: vi.fn((x: number, y: number, width: number, height: number) => {
      trackCall('viewport', [x, y, width, height]);
    }),

    drawArrays: vi.fn((mode: number, first: number, count: number) => {
      trackCall('drawArrays', [mode, first, count]);
    }),

    drawElements: vi.fn((mode: number, count: number, type: number, offset: number) => {
      trackCall('drawElements', [mode, count, type, offset]);
    }),

    // State methods
    enable: vi.fn((cap: number) => {
      trackCall('enable', [cap]);
    }),

    disable: vi.fn((cap: number) => {
      trackCall('disable', [cap]);
    }),

    blendFunc: vi.fn((sfactor: number, dfactor: number) => {
      trackCall('blendFunc', [sfactor, dfactor]);
    }),

    // Texture methods (textured-quad text path)
    createTexture: vi.fn(() => {
      trackCall('createTexture', []);
      return { _id: ++mockTextureId } as unknown as WebGLTexture;
    }),

    deleteTexture: vi.fn((texture: WebGLTexture) => {
      trackCall('deleteTexture', [texture]);
    }),

    bindTexture: vi.fn((target: number, texture: WebGLTexture | null) => {
      trackCall('bindTexture', [target, texture]);
    }),

    texImage2D: vi.fn((...args: unknown[]) => {
      trackCall('texImage2D', args);
    }),

    texParameteri: vi.fn((target: number, pname: number, param: number) => {
      trackCall('texParameteri', [target, pname, param]);
    }),

    activeTexture: vi.fn((texture: number) => {
      trackCall('activeTexture', [texture]);
    }),

    pixelStorei: vi.fn((pname: number, param: number | boolean) => {
      trackCall('pixelStorei', [pname, param]);
    }),

    getParameter: vi.fn((pname: number) => {
      trackCall('getParameter', [pname]);
      if (pname === 0x0D33) return 4096; // MAX_TEXTURE_SIZE
      return null;
    }),
  };

  return context as MockWebGLRenderingContext;
}

// Global setup for tests
const mockContext = createMockWebGLContext();

// Minimal 2D context stub: jsdom has no canvas implementation, but the text
// rasterizer (textRaster.ts) asks for a '2d' context on an offscreen canvas.
// The stub keeps the virtual console clean and lets the raster path run;
// pixel output is never asserted (layout tests inject a fake measurer).
export function createMock2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context: Partial<CanvasRenderingContext2D> = {
    canvas,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    fillText: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: 0 } as TextMetrics)),
  };
  return context as CanvasRenderingContext2D;
}

// Override HTMLCanvasElement.getContext to return mock WebGL context
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: unknown) {
  if (contextId === 'webgl' || contextId === 'experimental-webgl') {
    return createMockWebGLContext() as unknown as RenderingContext;
  }
  if (contextId === '2d') {
    return createMock2DContext(this) as unknown as RenderingContext;
  }
  return originalGetContext.call(this, contextId, options as CanvasRenderingContext2DSettings);
} as typeof HTMLCanvasElement.prototype.getContext;

export { mockContext };
