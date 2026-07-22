/**
 * Pure unit tests for the palette module - no DOM, no ECS. Guards the grid
 * shape, the uppercase hex convention, and the legacy-value normalization
 * that active-swatch highlighting and export default-omission depend on.
 */
import { describe, it, expect } from "vitest";

import { PALETTE, paletteColor, normalizeColor, DEFAULT_FILL, DEFAULT_STROKE } from "../palette";

describe("PALETTE", () => {
  it("has 24 entries in a 6x4 grid, the first being the 'none' sentinel", () => {
    expect(PALETTE).toHaveLength(24);
    expect(PALETTE[0]).toEqual({ id: 'none', label: 'No color', hex: null });
    expect(PALETTE.filter((e) => e.hex === null)).toHaveLength(1);
  });

  it("stores every hex uppercase and unique", () => {
    const hexes = PALETTE.filter((e) => e.hex !== null).map((e) => e.hex!);
    expect(hexes).toHaveLength(23);
    for (const hex of hexes) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("contains the canonical defaults", () => {
    expect(PALETTE.some((e) => e.hex === DEFAULT_FILL)).toBe(true);
    expect(PALETTE.some((e) => e.hex === DEFAULT_STROKE)).toBe(true);
  });
});

describe("paletteColor", () => {
  it("looks up hex by id", () => {
    expect(paletteColor('coral-red')).toBe('#F95B60');
    expect(paletteColor('black')).toBe('#202020');
  });

  it("returns null for the sentinel and unknown ids", () => {
    expect(paletteColor('none')).toBeNull();
    expect(paletteColor('does-not-exist')).toBeNull();
  });
});

describe("normalizeColor", () => {
  it("maps the legacy named draw defaults to the canonical hexes", () => {
    expect(normalizeColor('black')).toBe(DEFAULT_STROKE);
    expect(normalizeColor('Black')).toBe(DEFAULT_STROKE);
    expect(normalizeColor('white')).toBe(DEFAULT_FILL);
  });

  it("maps pure black/white hexes to the canonical defaults", () => {
    expect(normalizeColor('#000000')).toBe(DEFAULT_STROKE);
    expect(normalizeColor('#ffffff')).toBe(DEFAULT_FILL);
  });

  it("maps each retired 8-swatch hex to its nearest palette color, case-insensitively", () => {
    expect(normalizeColor('#e53935')).toBe('#F95B60');
    expect(normalizeColor('#FB8C00')).toBe('#FE9D48');
    expect(normalizeColor('#fdd835')).toBe('#FDCC3F');
    expect(normalizeColor('#43a047')).toBe('#3CD457');
    expect(normalizeColor('#1e88e5')).toBe('#5F99F9');
    expect(normalizeColor('#8e24aa')).toBe('#6725CC');
  });

  it("passes unknown values through, uppercased", () => {
    expect(normalizeColor('#abcdef')).toBe('#ABCDEF');
    expect(normalizeColor('#F95B60')).toBe('#F95B60');
  });

  it("keeps undefined (transparent / absent key) undefined", () => {
    expect(normalizeColor(undefined)).toBeUndefined();
  });
});
