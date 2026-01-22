import { describe, it, expect } from 'vitest';
import Rectangle from '../Rectangle';
import Point from '../Point';

describe('Rectangle', () => {
  describe('constructor', () => {
    it('creates rectangle with center point', () => {
      const center = new Point(50, 50);
      const rect = new Rectangle(100, 60, center);

      expect(rect.width).toBe(100);
      expect(rect.height).toBe(60);
      expect(rect.center).toBe(center);
    });
  });

  describe('computed corners', () => {
    // Rectangle: width=100, height=60, center=(50, 50)
    // Top-left: (0, 20), Top-right: (100, 20)
    // Bottom-left: (0, 80), Bottom-right: (100, 80)
    let rect: Rectangle;

    beforeEach(() => {
      rect = new Rectangle(100, 60, new Point(50, 50));
    });

    it('computes topLeftX correctly', () => {
      expect(rect.topLeftX).toBe(0);
    });

    it('computes topLeftY correctly', () => {
      expect(rect.topLeftY).toBe(20);
    });

    it('computes topRightX correctly', () => {
      expect(rect.topRightX).toBe(100);
    });

    it('computes topRightY correctly', () => {
      expect(rect.topRightY).toBe(20);
    });

    it('computes bottomLeftX correctly', () => {
      expect(rect.bottomLeftX).toBe(0);
    });

    it('computes bottomLeftY correctly', () => {
      expect(rect.bottomLeftY).toBe(80);
    });

    it('computes bottomRightX correctly', () => {
      expect(rect.bottomRightX).toBe(100);
    });

    it('computes bottomRightY correctly', () => {
      expect(rect.bottomRightY).toBe(80);
    });
  });

  describe('mutability', () => {
    it('allows width to be modified', () => {
      const rect = new Rectangle(100, 60, new Point(50, 50));
      rect.width = 200;
      expect(rect.width).toBe(200);
      // Corners should update accordingly
      expect(rect.topLeftX).toBe(-50);
      expect(rect.topRightX).toBe(150);
    });

    it('allows height to be modified', () => {
      const rect = new Rectangle(100, 60, new Point(50, 50));
      rect.height = 100;
      expect(rect.height).toBe(100);
      // Corners should update accordingly
      expect(rect.topLeftY).toBe(0);
      expect(rect.bottomLeftY).toBe(100);
    });
  });

  describe('intersectsWithPoint', () => {
    let rect: Rectangle;

    beforeEach(() => {
      // Rectangle centered at (50, 50), width=100, height=60
      // Bounds: x from 0 to 100, y from 20 to 80
      rect = new Rectangle(100, 60, new Point(50, 50));
    });

    it('returns true for point inside rectangle', () => {
      const point = new Point(50, 50);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point in top-left corner', () => {
      const point = new Point(10, 30);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point in bottom-right corner', () => {
      const point = new Point(90, 70);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns false for point outside (left)', () => {
      const point = new Point(-10, 50);
      expect(rect.intersectsWithPoint(point)).toBe(false);
    });

    it('returns false for point outside (right)', () => {
      const point = new Point(110, 50);
      expect(rect.intersectsWithPoint(point)).toBe(false);
    });

    it('returns false for point outside (top)', () => {
      const point = new Point(50, 10);
      expect(rect.intersectsWithPoint(point)).toBe(false);
    });

    it('returns false for point outside (bottom)', () => {
      const point = new Point(50, 90);
      expect(rect.intersectsWithPoint(point)).toBe(false);
    });

    it('returns true for point exactly on top-left boundary', () => {
      const point = new Point(0, 20);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point exactly on bottom-right boundary', () => {
      const point = new Point(100, 80);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point exactly on left edge', () => {
      const point = new Point(0, 50);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point exactly on right edge', () => {
      const point = new Point(100, 50);
      expect(rect.intersectsWithPoint(point)).toBe(true);
    });
  });

  describe('moveCenterBy', () => {
    it('updates center coordinates by delta', () => {
      const rect = new Rectangle(100, 60, new Point(50, 50));
      rect.moveCenterBy(10, 20);

      expect(rect.center.x).toBe(60);
      expect(rect.center.y).toBe(70);
    });

    it('handles negative delta', () => {
      const rect = new Rectangle(100, 60, new Point(50, 50));
      rect.moveCenterBy(-25, -30);

      expect(rect.center.x).toBe(25);
      expect(rect.center.y).toBe(20);
    });

    it('updates computed corners after move', () => {
      const rect = new Rectangle(100, 60, new Point(50, 50));
      rect.moveCenterBy(10, 10);

      // New center: (60, 60)
      expect(rect.topLeftX).toBe(10);
      expect(rect.topLeftY).toBe(30);
      expect(rect.bottomRightX).toBe(110);
      expect(rect.bottomRightY).toBe(90);
    });
  });
});
