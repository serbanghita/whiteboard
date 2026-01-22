import { describe, it, expect } from 'vitest';
import Point from '../Point';

describe('Point', () => {
  describe('constructor', () => {
    it('sets x and y correctly', () => {
      const point = new Point(10, 20);
      expect(point.x).toBe(10);
      expect(point.y).toBe(20);
    });

    it('handles negative coordinates', () => {
      const point = new Point(-5, -10);
      expect(point.x).toBe(-5);
      expect(point.y).toBe(-10);
    });

    it('handles zero coordinates', () => {
      const point = new Point(0, 0);
      expect(point.x).toBe(0);
      expect(point.y).toBe(0);
    });

    it('handles decimal coordinates', () => {
      const point = new Point(1.5, 2.5);
      expect(point.x).toBe(1.5);
      expect(point.y).toBe(2.5);
    });
  });

  describe('mutability', () => {
    it('allows x to be modified', () => {
      const point = new Point(10, 20);
      point.x = 30;
      expect(point.x).toBe(30);
    });

    it('allows y to be modified', () => {
      const point = new Point(10, 20);
      point.y = 40;
      expect(point.y).toBe(40);
    });
  });
});
