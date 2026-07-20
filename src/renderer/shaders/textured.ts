/**
 * Shader pair for textured quads (rasterized text blocks).
 * Vertex transform is identical to the basic shader; the fragment samples a
 * texture instead of a flat color (text color is baked into the raster).
 */
export const texturedVertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texcoord;
  uniform vec2 u_resolution;
  uniform vec2 u_translate;
  uniform float u_scale;
  varying vec2 v_texcoord;

  void main() {
    // Camera transform: world coordinates -> CSS-pixel screen space.
    vec2 screen = (a_position - u_translate) * u_scale;
    vec2 zeroToOne = screen / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texcoord = a_texcoord;
  }
`;

export const texturedFragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texcoord;
  uniform sampler2D u_texture;

  void main() {
    gl_FragColor = texture2D(u_texture, v_texcoord);
  }
`;
