import { describe, it, expect, beforeEach, vi } from 'vitest';
import WebGLRenderer from '../WebGLRenderer';
import { createMockWebGLContext, MockWebGLRenderingContext } from '../../__mocks__/webgl';

describe('WebGLRenderer', () => {
  let gl: MockWebGLRenderingContext;
  let renderer: WebGLRenderer;

  beforeEach(() => {
    gl = createMockWebGLContext();
    renderer = new WebGLRenderer(gl);
    gl._calls.length = 0; // Clear initialization calls for cleaner test assertions
  });

  describe('constructor', () => {
    it('initializes the basic and textured shader programs', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const programCalls = newGl._calls.filter(c => c.method === 'createProgram');
      expect(programCalls.length).toBe(2);
      // The basic program must end up resident (all shape draws assume it).
      const useCalls = newGl._calls.filter(c => c.method === 'useProgram');
      expect(useCalls.length).toBeGreaterThan(0);
    });

    it('creates position and texcoord buffers', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const bufferCalls = newGl._calls.filter(c => c.method === 'createBuffer');
      expect(bufferCalls.length).toBe(2);
    });

    it('enables premultiplied-alpha blending', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const enableCalls = newGl._calls.filter(c => c.method === 'enable');
      expect(enableCalls.some(c => c.args[0] === newGl.BLEND)).toBe(true);
      const blendCalls = newGl._calls.filter(c => c.method === 'blendFunc');
      expect(blendCalls.at(-1)!.args).toEqual([newGl.ONE, newGl.ONE_MINUS_SRC_ALPHA]);
    });

    it('sets resolution uniform', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      // Resolution first, then the identity-camera u_translate default.
      const uniform2fCalls = newGl._calls.filter(c => c.method === 'uniform2f');
      expect(uniform2fCalls.length).toBe(2);
      expect(uniform2fCalls[0].args[1]).toBe(800); // canvas width
      expect(uniform2fCalls[0].args[2]).toBe(600); // canvas height
    });

    it('initializes an identity camera', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const uniform2fCalls = newGl._calls.filter(c => c.method === 'uniform2f');
      expect(uniform2fCalls[1].args.slice(1)).toEqual([0, 0]); // u_translate
      const uniform1fCalls = newGl._calls.filter(c => c.method === 'uniform1f');
      expect(uniform1fCalls.at(-1)!.args[1]).toBe(1); // u_scale
    });

    it('throws error when buffer creation fails', () => {
      const failGl = createMockWebGLContext();
      (failGl.createBuffer as jest.Mock).mockImplementationOnce(() => null);

      expect(() => {
        new WebGLRenderer(failGl);
      }).toThrow('Failed to create WebGL buffer');
    });
  });

  describe('setCamera', () => {
    it('sets the translate and scale uniforms', () => {
      renderer.setCamera(2, 100, 50);

      const uniform2fCalls = gl._calls.filter(c => c.method === 'uniform2f');
      expect(uniform2fCalls.at(-1)!.args.slice(1)).toEqual([100, 50]); // u_translate
      const uniform1fCalls = gl._calls.filter(c => c.method === 'uniform1f');
      expect(uniform1fCalls.at(-1)!.args[1]).toBe(2); // u_scale
    });
  });

  describe('clear', () => {
    it('calls gl.clear with COLOR_BUFFER_BIT', () => {
      renderer.clear();

      const clearCalls = gl._calls.filter(c => c.method === 'clear');
      expect(clearCalls.length).toBe(1);
      expect(clearCalls[0].args[0]).toBe(gl.COLOR_BUFFER_BIT);
    });
  });

  describe('rectangle', () => {
    it('generates correct triangle vertices for filled rectangle', () => {
      renderer.rectangle(10, 20, 100, 50, { fillColor: 'red' });

      const bufferDataCalls = gl._calls.filter(c => c.method === 'bufferData');
      expect(bufferDataCalls.length).toBeGreaterThanOrEqual(1);

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBeGreaterThanOrEqual(1);
      expect(drawCalls[0].args[0]).toBe(gl.TRIANGLES);
    });

    it('sets correct color uniform for fill', () => {
      renderer.rectangle(10, 20, 100, 50, { fillColor: 'red' });

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBeGreaterThanOrEqual(1);
      // Red color: [1, 0, 0, 1]
      expect(uniform4fCalls[0].args[1]).toBe(1);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(0);
      expect(uniform4fCalls[0].args[4]).toBe(1);
    });

    it('draws stroke when strokeColor is set', () => {
      renderer.rectangle(10, 20, 100, 50, { strokeColor: 'blue' });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      // Stroke draws 4 lines (each line is 2 triangles = 1 drawArrays call)
      expect(drawCalls.length).toBe(4);
    });

    it('draws black stroke by default when no options', () => {
      renderer.rectangle(10, 20, 100, 50);

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBeGreaterThanOrEqual(1);
      // Black color: [0, 0, 0, 1]
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(0);
      expect(uniform4fCalls[0].args[4]).toBe(1);
    });

    it('uses custom stroke width when provided', () => {
      renderer.rectangle(10, 20, 100, 50, { strokeColor: 'black', strokeWidth: 3 });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBe(4); // 4 lines for rectangle outline
    });
  });

  describe('circle', () => {
    it('generates triangle fan vertices for filled circle', () => {
      renderer.circle(50, 50, 25, { fillColor: 'green' });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.some(c => c.args[0] === gl.TRIANGLE_FAN)).toBe(true);
    });

    it('sets correct color uniform for circle', () => {
      renderer.circle(50, 50, 25, { fillColor: 'green' });

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBeGreaterThanOrEqual(1);
      // Green color: [0, 1, 0, 1]
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(1);
      expect(uniform4fCalls[0].args[3]).toBe(0);
      expect(uniform4fCalls[0].args[4]).toBe(1);
    });

    it('draws stroke when strokeColor is set', () => {
      renderer.circle(50, 50, 25, { strokeColor: 'red' });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBeGreaterThan(0);
    });

    it('draws black stroke by default', () => {
      renderer.circle(50, 50, 25);

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBeGreaterThanOrEqual(1);
      // Black color
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(0);
    });
  });

  describe('line', () => {
    it('generates quad vertices for thick line', () => {
      renderer.line(10, 10, 100, 100, { strokeWidth: 2 });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBe(1);
      expect(drawCalls[0].args[0]).toBe(gl.TRIANGLES);
      expect(drawCalls[0].args[2]).toBe(6); // 2 triangles = 6 vertices
    });

    it('uses strokeColor when provided', () => {
      renderer.line(10, 10, 100, 100, { strokeColor: 'blue' });

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBe(1);
      // Blue color: [0, 0, 1, 1]
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(1);
    });

    it('defaults to black color', () => {
      renderer.line(10, 10, 100, 100);

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBe(1);
      // Black color
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(0);
    });

    it('defaults to width 1', () => {
      renderer.line(10, 10, 100, 100);

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBe(1);
    });
  });

  describe('dot', () => {
    it('delegates to circle with small radius', () => {
      renderer.dot(50, 50, { fillColor: 'red' });

      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.some(c => c.args[0] === gl.TRIANGLE_FAN)).toBe(true);
    });

    it('uses strokeWidth as radius when provided', () => {
      renderer.dot(50, 50, { strokeWidth: 5, fillColor: 'blue' });

      // Dot should draw a filled circle
      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls.length).toBeGreaterThan(0);
    });

    it('defaults to black color when no options', () => {
      renderer.dot(50, 50);

      const uniform4fCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniform4fCalls.length).toBeGreaterThan(0);
      // Black color
      expect(uniform4fCalls[0].args[1]).toBe(0);
      expect(uniform4fCalls[0].args[2]).toBe(0);
      expect(uniform4fCalls[0].args[3]).toBe(0);
    });
  });

  describe('textures', () => {
    it('uploads a canvas as an NPOT-safe texture (clamp, linear, no mipmaps)', () => {
      const canvas = { width: 32, height: 16 } as HTMLCanvasElement;
      const handle = renderer.createTextureFromCanvas(canvas);

      expect(handle).toBeTruthy();
      expect(gl._calls.filter(c => c.method === 'createTexture').length).toBe(1);
      const texImageCalls = gl._calls.filter(c => c.method === 'texImage2D');
      expect(texImageCalls.length).toBe(1);
      expect(texImageCalls[0].args.at(-1)).toBe(canvas);

      const paramCalls = gl._calls.filter(c => c.method === 'texParameteri');
      const params = new Map(paramCalls.map(c => [c.args[1], c.args[2]]));
      expect(params.get(gl.TEXTURE_WRAP_S)).toBe(gl.CLAMP_TO_EDGE);
      expect(params.get(gl.TEXTURE_WRAP_T)).toBe(gl.CLAMP_TO_EDGE);
      expect(params.get(gl.TEXTURE_MIN_FILTER)).toBe(gl.LINEAR);
      expect(params.get(gl.TEXTURE_MAG_FILTER)).toBe(gl.LINEAR);

      // Premultiplied alpha upload to match the blend function.
      const pixelCalls = gl._calls.filter(c => c.method === 'pixelStorei');
      expect(pixelCalls.some(c => c.args[0] === gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL && c.args[1] === true)).toBe(true);
    });

    it('deletes textures through the handle', () => {
      const handle = renderer.createTextureFromCanvas({ width: 8, height: 8 } as HTMLCanvasElement);
      renderer.deleteTexture(handle);

      const deleteCalls = gl._calls.filter(c => c.method === 'deleteTexture');
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].args[0]).toBe(handle);
    });

    it('draws a textured quad with the camera pushed to the textured program', () => {
      renderer.setCamera(2, 100, 50);
      const handle = renderer.createTextureFromCanvas({ width: 8, height: 8 } as HTMLCanvasElement);
      gl._calls.length = 0;

      renderer.texturedQuad(handle, 10, 20, 30, 40);

      // Program switched for the draw and back to the basic one afterwards.
      const useCalls = gl._calls.filter(c => c.method === 'useProgram');
      expect(useCalls.length).toBe(2);
      // Camera/resolution uniforms pushed per draw (per-program state).
      const uniform2fCalls = gl._calls.filter(c => c.method === 'uniform2f');
      expect(uniform2fCalls.some(c => c.args[1] === 100 && c.args[2] === 50)).toBe(true);
      const uniform1fCalls = gl._calls.filter(c => c.method === 'uniform1f');
      expect(uniform1fCalls.at(-1)!.args[1]).toBe(2);
      // One 6-vertex triangle draw, texture bound on unit 0.
      const drawCalls = gl._calls.filter(c => c.method === 'drawArrays');
      expect(drawCalls).toEqual([{ method: 'drawArrays', args: [gl.TRIANGLES, 0, 6] }]);
      expect(gl._calls.some(c => c.method === 'activeTexture' && c.args[0] === gl.TEXTURE0)).toBe(true);
      expect(gl._calls.some(c => c.method === 'bindTexture' && c.args[1] === handle)).toBe(true);
    });
  });
});
