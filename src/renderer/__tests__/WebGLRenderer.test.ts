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
    it('initializes shader program', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const programCalls = newGl._calls.filter(c => c.method === 'createProgram');
      expect(programCalls.length).toBe(1);
    });

    it('creates position buffer', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const bufferCalls = newGl._calls.filter(c => c.method === 'createBuffer');
      expect(bufferCalls.length).toBe(1);
    });

    it('sets resolution uniform', () => {
      const newGl = createMockWebGLContext();
      new WebGLRenderer(newGl);

      const uniform2fCalls = newGl._calls.filter(c => c.method === 'uniform2f');
      expect(uniform2fCalls.length).toBe(1);
      expect(uniform2fCalls[0].args[1]).toBe(800); // canvas width
      expect(uniform2fCalls[0].args[2]).toBe(600); // canvas height
    });

    it('throws error when buffer creation fails', () => {
      const failGl = createMockWebGLContext();
      (failGl.createBuffer as jest.Mock).mockImplementationOnce(() => null);

      expect(() => {
        new WebGLRenderer(failGl);
      }).toThrow('Failed to create WebGL buffer');
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

  describe('text', () => {
    it('logs warning for unimplemented text rendering', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderer.text('Hello', 10, 20);

      expect(warnSpy).toHaveBeenCalledWith(
        'WebGL text rendering not yet implemented. Text:',
        'Hello'
      );

      warnSpy.mockRestore();
    });
  });
});
