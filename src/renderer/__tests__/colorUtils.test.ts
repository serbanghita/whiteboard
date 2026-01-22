import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseColor } from '../colorUtils';

describe('parseColor', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('named colors', () => {
    it('parses black', () => {
      expect(parseColor('black')).toEqual([0, 0, 0, 1]);
    });

    it('parses white', () => {
      expect(parseColor('white')).toEqual([1, 1, 1, 1]);
    });

    it('parses red', () => {
      expect(parseColor('red')).toEqual([1, 0, 0, 1]);
    });

    it('parses green', () => {
      expect(parseColor('green')).toEqual([0, 1, 0, 1]);
    });

    it('parses blue', () => {
      expect(parseColor('blue')).toEqual([0, 0, 1, 1]);
    });

    it('parses gray', () => {
      expect(parseColor('gray')).toEqual([0.5, 0.5, 0.5, 1]);
    });

    it('parses grey (alternate spelling)', () => {
      expect(parseColor('grey')).toEqual([0.5, 0.5, 0.5, 1]);
    });

    it('is case-insensitive', () => {
      expect(parseColor('BLACK')).toEqual([0, 0, 0, 1]);
      expect(parseColor('White')).toEqual([1, 1, 1, 1]);
      expect(parseColor('RED')).toEqual([1, 0, 0, 1]);
    });
  });

  describe('3-digit hex colors', () => {
    it('parses #fff', () => {
      expect(parseColor('#fff')).toEqual([1, 1, 1, 1]);
    });

    it('parses #000', () => {
      expect(parseColor('#000')).toEqual([0, 0, 0, 1]);
    });

    it('parses #abc', () => {
      const result = parseColor('#abc');
      expect(result[0]).toBeCloseTo(0xaa / 255);
      expect(result[1]).toBeCloseTo(0xbb / 255);
      expect(result[2]).toBeCloseTo(0xcc / 255);
      expect(result[3]).toBe(1);
    });

    it('parses #f00 (red)', () => {
      expect(parseColor('#f00')).toEqual([1, 0, 0, 1]);
    });
  });

  describe('6-digit hex colors', () => {
    it('parses #ffffff', () => {
      expect(parseColor('#ffffff')).toEqual([1, 1, 1, 1]);
    });

    it('parses #000000', () => {
      expect(parseColor('#000000')).toEqual([0, 0, 0, 1]);
    });

    it('parses #aabbcc', () => {
      const result = parseColor('#aabbcc');
      expect(result[0]).toBeCloseTo(0xaa / 255);
      expect(result[1]).toBeCloseTo(0xbb / 255);
      expect(result[2]).toBeCloseTo(0xcc / 255);
      expect(result[3]).toBe(1);
    });

    it('parses #ff0000 (red)', () => {
      expect(parseColor('#ff0000')).toEqual([1, 0, 0, 1]);
    });

    it('parses #808080 (gray)', () => {
      const result = parseColor('#808080');
      expect(result[0]).toBeCloseTo(128 / 255);
      expect(result[1]).toBeCloseTo(128 / 255);
      expect(result[2]).toBeCloseTo(128 / 255);
      expect(result[3]).toBe(1);
    });
  });

  describe('rgb() format', () => {
    it('parses rgb(255, 0, 0)', () => {
      expect(parseColor('rgb(255, 0, 0)')).toEqual([1, 0, 0, 1]);
    });

    it('parses rgb(255,255,255) without spaces', () => {
      expect(parseColor('rgb(255,255,255)')).toEqual([1, 1, 1, 1]);
    });

    it('parses rgb(0, 0, 0)', () => {
      expect(parseColor('rgb(0, 0, 0)')).toEqual([0, 0, 0, 1]);
    });

    it('parses rgb(128, 64, 32)', () => {
      const result = parseColor('rgb(128, 64, 32)');
      expect(result[0]).toBeCloseTo(128 / 255);
      expect(result[1]).toBeCloseTo(64 / 255);
      expect(result[2]).toBeCloseTo(32 / 255);
      expect(result[3]).toBe(1);
    });
  });

  describe('rgba() format', () => {
    it('parses rgba(255, 0, 0, 0.5)', () => {
      const result = parseColor('rgba(255, 0, 0, 0.5)');
      expect(result).toEqual([1, 0, 0, 0.5]);
    });

    it('parses rgba(0, 0, 0, 1)', () => {
      expect(parseColor('rgba(0, 0, 0, 1)')).toEqual([0, 0, 0, 1]);
    });

    it('parses rgba(255, 255, 255, 0)', () => {
      expect(parseColor('rgba(255, 255, 255, 0)')).toEqual([1, 1, 1, 0]);
    });

    it('parses rgba with decimal alpha', () => {
      const result = parseColor('rgba(128, 64, 32, 0.75)');
      expect(result[0]).toBeCloseTo(128 / 255);
      expect(result[1]).toBeCloseTo(64 / 255);
      expect(result[2]).toBeCloseTo(32 / 255);
      expect(result[3]).toBe(0.75);
    });
  });

  describe('space-separated rgb format', () => {
    it('parses rgb(204 204 204)', () => {
      const result = parseColor('rgb(204 204 204)');
      expect(result[0]).toBeCloseTo(204 / 255);
      expect(result[1]).toBeCloseTo(204 / 255);
      expect(result[2]).toBeCloseTo(204 / 255);
      expect(result[3]).toBe(1);
    });

    it('parses rgb(0 128 255)', () => {
      const result = parseColor('rgb(0 128 255)');
      expect(result[0]).toBe(0);
      expect(result[1]).toBeCloseTo(128 / 255);
      expect(result[2]).toBe(1);
      expect(result[3]).toBe(1);
    });
  });

  describe('unknown color format', () => {
    it('defaults to black for unknown color', () => {
      const result = parseColor('unknowncolor');
      expect(result).toEqual([0, 0, 0, 1]);
    });

    it('logs warning for unknown color', () => {
      parseColor('unknowncolor');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Unknown color format: unknowncolor, defaulting to black'
      );
    });

    it('defaults to black for invalid hex', () => {
      const result = parseColor('#gg');
      expect(result).toEqual([0, 0, 0, 1]);
    });

    it('defaults to black for empty string', () => {
      const result = parseColor('');
      expect(result).toEqual([0, 0, 0, 1]);
    });
  });
});
