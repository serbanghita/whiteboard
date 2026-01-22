import { describe, it, expect } from 'vitest';
import Circle from '../Circle';
import Point from '../Point';

describe('Circle', () => {
  describe('constructor', () => {
    it('creates circle with center and radius', () => {
      const center = new Point(50, 50);
      const circle = new Circle(25, center);

      expect(circle.radius).toBe(25);
      expect(circle.center).toBe(center);
    });
  });

  describe('intersectsWithPoint', () => {
    let circle: Circle;

    beforeEach(() => {
      // Circle centered at (50, 50) with radius 25
      circle = new Circle(25, new Point(50, 50));
    });

    it('returns true for point at center', () => {
      const point = new Point(50, 50);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point inside circle', () => {
      const point = new Point(60, 60);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point inside near edge', () => {
      // Point just inside the radius
      const point = new Point(50 + 20, 50);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('returns false for point outside circle', () => {
      const point = new Point(100, 100);
      expect(circle.intersectsWithPoint(point)).toBe(false);
    });

    it('returns false for point just outside radius', () => {
      // Point just outside the radius
      const point = new Point(50 + 26, 50);
      expect(circle.intersectsWithPoint(point)).toBe(false);
    });

    it('returns true for point exactly on radius (right)', () => {
      const point = new Point(75, 50);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point exactly on radius (top)', () => {
      const point = new Point(50, 25);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('returns true for point exactly on radius (diagonal)', () => {
      // Point at 45 degrees on the circle
      const distance = 25 / Math.sqrt(2);
      const point = new Point(50 + distance, 50 + distance);
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });

    it('handles circle at origin', () => {
      const originCircle = new Circle(10, new Point(0, 0));
      expect(originCircle.intersectsWithPoint(new Point(5, 5))).toBe(true);
      expect(originCircle.intersectsWithPoint(new Point(10, 0))).toBe(true);
      expect(originCircle.intersectsWithPoint(new Point(11, 0))).toBe(false);
    });

    it('handles negative coordinates', () => {
      const negCircle = new Circle(10, new Point(-20, -20));
      expect(negCircle.intersectsWithPoint(new Point(-20, -20))).toBe(true);
      expect(negCircle.intersectsWithPoint(new Point(-15, -15))).toBe(true);
      expect(negCircle.intersectsWithPoint(new Point(0, 0))).toBe(false);
    });
  });

  describe('mutability', () => {
    it('allows radius to be modified', () => {
      const circle = new Circle(25, new Point(50, 50));
      circle.radius = 50;
      expect(circle.radius).toBe(50);
    });

    it('radius change affects intersection tests', () => {
      const circle = new Circle(10, new Point(50, 50));
      const point = new Point(70, 50);

      // Point is 20 units away, outside radius 10
      expect(circle.intersectsWithPoint(point)).toBe(false);

      // Increase radius to include the point
      circle.radius = 25;
      expect(circle.intersectsWithPoint(point)).toBe(true);
    });
  });
});
