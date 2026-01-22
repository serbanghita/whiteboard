import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShaderProgram from '../shaders/ShaderProgram';
import { vertexShaderSource, fragmentShaderSource } from '../shaders/basic';
import { createMockWebGLContext, MockWebGLRenderingContext } from '../../__mocks__/webgl';

describe('ShaderProgram', () => {
  let gl: MockWebGLRenderingContext;

  beforeEach(() => {
    gl = createMockWebGLContext();
  });

  describe('constructor', () => {
    it('compiles vertex shader successfully', () => {
      new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      const createShaderCalls = gl._calls.filter(c => c.method === 'createShader');
      expect(createShaderCalls.length).toBe(2);
      expect(createShaderCalls[0].args[0]).toBe(gl.VERTEX_SHADER);
    });

    it('compiles fragment shader successfully', () => {
      new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      const createShaderCalls = gl._calls.filter(c => c.method === 'createShader');
      expect(createShaderCalls.length).toBe(2);
      expect(createShaderCalls[1].args[0]).toBe(gl.FRAGMENT_SHADER);
    });

    it('links program successfully', () => {
      new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      const linkCalls = gl._calls.filter(c => c.method === 'linkProgram');
      expect(linkCalls.length).toBe(1);
    });

    it('calls shaderSource for both shaders', () => {
      new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      const shaderSourceCalls = gl._calls.filter(c => c.method === 'shaderSource');
      expect(shaderSourceCalls.length).toBe(2);
      expect(shaderSourceCalls[0].args[1]).toBe(vertexShaderSource);
      expect(shaderSourceCalls[1].args[1]).toBe(fragmentShaderSource);
    });

    it('attaches both shaders to program', () => {
      new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      const attachCalls = gl._calls.filter(c => c.method === 'attachShader');
      expect(attachCalls.length).toBe(2);
    });
  });

  describe('error handling', () => {
    it('throws error when vertex shader compilation fails', () => {
      (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => false);

      expect(() => {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      }).toThrow('Failed to compile shader');
    });

    it('throws error when fragment shader compilation fails', () => {
      // First call (vertex) succeeds, second call (fragment) fails
      (gl.getShaderParameter as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => true)
        .mockImplementationOnce(() => false);

      expect(() => {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      }).toThrow('Failed to compile shader');
    });

    it('throws error when program linking fails', () => {
      (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => false);

      expect(() => {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      }).toThrow('Failed to link program');
    });

    it('deletes shader when compilation fails', () => {
      (gl.getShaderParameter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => false);

      try {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      } catch (e) {
        // Expected
      }

      const deleteCalls = gl._calls.filter(c => c.method === 'deleteShader');
      expect(deleteCalls.length).toBe(1);
    });

    it('deletes program when linking fails', () => {
      (gl.getProgramParameter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => false);

      try {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      } catch (e) {
        // Expected
      }

      const deleteCalls = gl._calls.filter(c => c.method === 'deleteProgram');
      expect(deleteCalls.length).toBe(1);
    });

    it('throws error when createShader returns null', () => {
      (gl.createShader as ReturnType<typeof vi.fn>).mockImplementationOnce(() => null);

      expect(() => {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      }).toThrow('Failed to create shader');
    });

    it('throws error when createProgram returns null', () => {
      (gl.createProgram as ReturnType<typeof vi.fn>).mockImplementationOnce(() => null);

      expect(() => {
        new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      }).toThrow('Failed to create program');
    });
  });

  describe('use', () => {
    it('calls gl.useProgram with the program', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl._calls.length = 0; // Clear previous calls

      program.use();

      const useCalls = gl._calls.filter(c => c.method === 'useProgram');
      expect(useCalls.length).toBe(1);
      expect(useCalls[0].args[0]).toBe(program.program);
    });
  });

  describe('getAttributeLocation', () => {
    it('returns valid location', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      const location = program.getAttributeLocation('a_position');
      expect(location).toBe(0);
    });

    it('caches attribute location', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl._calls.length = 0;

      program.getAttributeLocation('a_position');
      program.getAttributeLocation('a_position');

      const getAttrCalls = gl._calls.filter(c => c.method === 'getAttribLocation');
      expect(getAttrCalls.length).toBe(1); // Only called once due to caching
    });
  });

  describe('getUniformLocation', () => {
    it('returns valid location', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      const location = program.getUniformLocation('u_color');
      expect(location).toBeDefined();
    });

    it('caches uniform location', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl._calls.length = 0;

      program.getUniformLocation('u_color');
      program.getUniformLocation('u_color');

      const getUniformCalls = gl._calls.filter(c => c.method === 'getUniformLocation');
      expect(getUniformCalls.length).toBe(1); // Only called once due to caching
    });

    it('throws error when uniform not found', () => {
      (gl.getUniformLocation as ReturnType<typeof vi.fn>).mockImplementationOnce(() => null);
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

      expect(() => {
        program.getUniformLocation('nonexistent');
      }).toThrow("Uniform 'nonexistent' not found");
    });
  });

  describe('setUniform2f', () => {
    it('calls gl.uniform2f correctly', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl._calls.length = 0;

      program.setUniform2f('u_resolution', 800, 600);

      const uniformCalls = gl._calls.filter(c => c.method === 'uniform2f');
      expect(uniformCalls.length).toBe(1);
      expect(uniformCalls[0].args[1]).toBe(800);
      expect(uniformCalls[0].args[2]).toBe(600);
    });
  });

  describe('setUniform4f', () => {
    it('calls gl.uniform4f correctly', () => {
      const program = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      gl._calls.length = 0;

      program.setUniform4f('u_color', 1, 0, 0, 1);

      const uniformCalls = gl._calls.filter(c => c.method === 'uniform4f');
      expect(uniformCalls.length).toBe(1);
      expect(uniformCalls[0].args[1]).toBe(1);
      expect(uniformCalls[0].args[2]).toBe(0);
      expect(uniformCalls[0].args[3]).toBe(0);
      expect(uniformCalls[0].args[4]).toBe(1);
    });
  });
});
