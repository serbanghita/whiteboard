/**
 * Color parsing utility for WebGL renderer
 * Converts CSS color strings to normalized RGBA arrays [0-1]
 */

const namedColors: Record<string, number[]> = {
  black: [0, 0, 0, 1],
  white: [1, 1, 1, 1],
  red: [1, 0, 0, 1],
  green: [0, 1, 0, 1],
  blue: [0, 0, 1, 1],
  gray: [0.5, 0.5, 0.5, 1],
  grey: [0.5, 0.5, 0.5, 1],
};

/**
 * Parse a CSS color string into normalized RGBA values [0-1]
 * Supports: named colors, hex (#fff, #ffffff), rgb(), rgba(), space-separated rgb
 */
export function parseColor(color: string): number[] {
  // Handle named colors
  if (namedColors[color.toLowerCase()]) {
    return namedColors[color.toLowerCase()];
  }

  // Handle hex colors
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16) / 255,
        parseInt(hex[1] + hex[1], 16) / 255,
        parseInt(hex[2] + hex[2], 16) / 255,
        1,
      ];
    } else if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        1,
      ];
    }
  }

  // Handle rgb() and rgba()
  const rgbMatch = color.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)(?:,?\s*([\d.]+))?\)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]) / 255,
      parseInt(rgbMatch[2]) / 255,
      parseInt(rgbMatch[3]) / 255,
      rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1,
    ];
  }

  // Handle "rgb(204 204 204)" format (space-separated)
  const rgbSpaceMatch = color.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
  if (rgbSpaceMatch) {
    return [
      parseInt(rgbSpaceMatch[1]) / 255,
      parseInt(rgbSpaceMatch[2]) / 255,
      parseInt(rgbSpaceMatch[3]) / 255,
      1,
    ];
  }

  // Default to black with warning
  console.warn(`Unknown color format: ${color}, defaulting to black`);
  return [0, 0, 0, 1];
}
