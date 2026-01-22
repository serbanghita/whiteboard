/**
 * Basic vertex shader for 2D primitives
 * Transforms vertex positions from pixel coordinates to clip space
 */
export const vertexShaderSource = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;

  void main() {
    // Convert from pixels to 0.0 to 1.0
    vec2 zeroToOne = a_position / u_resolution;

    // Convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;

    // Convert from 0->2 to -1->+1 (clip space)
    vec2 clipSpace = zeroToTwo - 1.0;

    // Flip Y axis (WebGL Y is up, Canvas Y is down)
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  }
`;

/**
 * Basic fragment shader for solid color rendering
 */
export const fragmentShaderSource = `
  precision mediump float;
  uniform vec4 u_color;

  void main() {
    gl_FragColor = u_color;
  }
`;
