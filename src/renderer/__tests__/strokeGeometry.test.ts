/**
 * Pure unit tests for the dash/dot stroke geometry - no GL, no ECS.
 * Guards run lengths, phase continuity across corners, dot spacing, trims
 * (arrow bases) and degenerate paths.
 */
import { describe, it, expect } from "vitest";

import {
  strokeGeometry,
  rectanglePath,
  DASH_ON,
  DASH_OFF,
  DOT_SPACING_FACTOR,
  Segment,
} from "../strokeGeometry";

const PERIOD = DASH_ON + DASH_OFF;

function segLen(s: Segment): number {
  return Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
}

describe("dashed", () => {
  it("emits 8-on/6-off runs along a straight line, truncating the last", () => {
    const { segments, dots } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }], { style: 'dashed' });
    expect(dots).toHaveLength(0);
    // Runs start at k*14: k=0..7 (98 < 100); the last truncates to 2.
    expect(segments).toHaveLength(8);
    expect(segments[0]).toEqual({ x1: 0, y1: 0, x2: DASH_ON, y2: 0 });
    expect(segments[1].x1).toBeCloseTo(PERIOD);
    expect(segLen(segments[7])).toBeCloseTo(100 - 7 * PERIOD);
  });

  it("keeps the phase across a corner, splitting the spanning run at it", () => {
    // Corner at distance 5: the first 8-long run spans it.
    const { segments } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }], { style: 'dashed' });
    expect(segments[0]).toEqual({ x1: 0, y1: 0, x2: 5, y2: 0 });
    expect(segments[1]).toEqual({ x1: 5, y1: 0, x2: 5, y2: 3 });
    // Next run starts at 14 accumulated = 9 into the second edge - the
    // pattern never reset at the corner.
    expect(segments[2].x1).toBeCloseTo(5);
    expect(segments[2].y1).toBeCloseTo(9);
  });

  it("walks the full closed rectangle outline with one continuous phase", () => {
    const { segments } = strokeGeometry(rectanglePath(0, 0, 20, 10), { style: 'dashed' });
    // Perimeter 60: runs at 0,14,28,42,56 -> 5 runs, some split at corners.
    const totalOn = segments.reduce((sum, s) => sum + segLen(s), 0);
    expect(totalOn).toBeCloseTo(8 + 8 + 8 + 8 + 4); // last run truncated at 60
  });

  it("anchors the pattern at the trimmed start (arrow base)", () => {
    const { segments } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }], { style: 'dashed', trimStart: 12, trimEnd: 12 });
    expect(segments[0].x1).toBe(12); // first dash hugs the arrow base
    expect(segments[0].x2).toBe(12 + DASH_ON);
    const last = segments[segments.length - 1];
    expect(last.x2).toBeLessThanOrEqual(88);
  });
});

describe("dotted", () => {
  it("spaces dots at 2x width center-to-center", () => {
    const { segments, dots } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }], { style: 'dotted', width: 2 });
    expect(segments).toHaveLength(0);
    expect(dots.map((d) => d.x)).toEqual([0, 4, 8]);
    expect(DOT_SPACING_FACTOR * 2).toBe(4);
  });

  it("respects trims and follows corners", () => {
    const { dots } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 8 }], { style: 'dotted', width: 2, trimStart: 2 });
    // Total 12, from 2: dots at 2, 6, 10 -> (2,0), (4,2), (4,6).
    expect(dots).toEqual([{ x: 2, y: 0 }, { x: 4, y: 2 }, { x: 4, y: 6 }]);
  });
});

describe("solid and degenerate input", () => {
  it("returns unbroken clipped edges for solid style", () => {
    const { segments, dots } = strokeGeometry(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], { trimStart: 2 });
    expect(dots).toHaveLength(0);
    expect(segments).toEqual([
      { x1: 2, y1: 0, x2: 10, y2: 0 },
      { x1: 10, y1: 0, x2: 10, y2: 10 },
    ]);
  });

  it("handles empty, single-point and zero-length paths", () => {
    expect(strokeGeometry([], { style: 'dashed' })).toEqual({ segments: [], dots: [] });
    expect(strokeGeometry([{ x: 1, y: 1 }], { style: 'dotted' })).toEqual({ segments: [], dots: [] });
    expect(strokeGeometry([{ x: 1, y: 1 }, { x: 1, y: 1 }], { style: 'dashed' }))
      .toEqual({ segments: [], dots: [] });
  });

  it("returns nothing when the trims consume the whole path", () => {
    expect(strokeGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }], { style: 'dashed', trimStart: 6, trimEnd: 6 }))
      .toEqual({ segments: [], dots: [] });
  });
});
