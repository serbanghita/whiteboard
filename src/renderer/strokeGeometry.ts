/**
 * Pure dash/dot geometry for styled strokes - no GL, fully unit-testable.
 * Takes a polyline path (line = 1 edge, rectangle = 4, circle = N chords)
 * and yields the on-run segments (dashed) or dot centers (dotted) that the
 * renderer batches into a single draw call per stroke. The pattern walks
 * CONTINUOUSLY over accumulated distance, so the phase never resets at a
 * corner or chord boundary. All units are world units - the pattern zooms
 * with the shape.
 */
import { StrokeStyle } from "../strokeStyle";

export interface Point { x: number; y: number; }
export interface Segment { x1: number; y1: number; x2: number; y2: number; }

export const DASH_ON = 8;
export const DASH_OFF = 6;
// Dot spacing (center to center) as a multiple of the stroke width; the dot
// diameter equals the stroke width.
export const DOT_SPACING_FACTOR = 2;

export interface StrokeGeometryOptions {
  /** Stroke width in world units (dot diameter derives from it). Default 1. */
  width?: number;
  /** undefined = solid: the path's edges come back clipped but unbroken. */
  style?: StrokeStyle;
  /** Distance to skip at the path start (arrow base - keeps the head attached). */
  trimStart?: number;
  /** Distance to skip at the path end (arrow base). */
  trimEnd?: number;
}

export interface StrokeGeometry {
  /** Draw each as a width-thick quad. */
  segments: Segment[];
  /** Draw each as a width-diameter dot. */
  dots: Point[];
}

interface Edge { a: Point; b: Point; start: number; len: number; }

export function strokeGeometry(path: Point[], opts: StrokeGeometryOptions = {}): StrokeGeometry {
  const width = opts.width ?? 1;
  const trimStart = opts.trimStart ?? 0;
  const trimEnd = opts.trimEnd ?? 0;

  const edges: Edge[] = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue; // degenerate edge contributes nothing
    edges.push({ a, b, start: total, len });
    total += len;
  }
  const from = Math.min(trimStart, total);
  const to = Math.max(from, total - trimEnd);
  if (edges.length === 0 || to <= from) return { segments: [], dots: [] };

  if (opts.style === 'dashed') {
    const segments: Segment[] = [];
    const period = DASH_ON + DASH_OFF;
    // The phase anchors at `from`, so the first dash hugs the arrow base.
    for (let s = from; s < to; s += period) {
      segments.push(...emitRun(edges, s, Math.min(s + DASH_ON, to)));
    }
    return { segments, dots: [] };
  }

  if (opts.style === 'dotted') {
    const dots: Point[] = [];
    const spacing = DOT_SPACING_FACTOR * width;
    for (let d = from; d <= to + 1e-9; d += spacing) {
      dots.push(pointAt(edges, Math.min(d, to)));
    }
    return { segments: [], dots };
  }

  // Solid: unbroken edges, still honoring the trims.
  return { segments: emitRun(edges, from, to), dots: [] };
}

/** Closed rectangle outline path (5 points, last = first). */
export function rectanglePath(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
    { x, y },
  ];
}

/** Closed circle outline path as `segments` chords (last point = first). */
export function circlePath(cx: number, cy: number, radius: number, segments: number): Point[] {
  const path: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    path.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return path;
}

/**
 * The sub-segments of the path covering distances [from, to] - one per edge
 * touched, so a run spanning a corner splits at it (the quads stay straight).
 */
function emitRun(edges: Edge[], from: number, to: number): Segment[] {
  const out: Segment[] = [];
  for (const e of edges) {
    const s = Math.max(from, e.start);
    const t = Math.min(to, e.start + e.len);
    if (t <= s) continue;
    const p1 = alongEdge(e, s - e.start);
    const p2 = alongEdge(e, t - e.start);
    out.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
  }
  return out;
}

function pointAt(edges: Edge[], dist: number): Point {
  for (const e of edges) {
    if (dist <= e.start + e.len) return alongEdge(e, Math.max(0, dist - e.start));
  }
  const last = edges[edges.length - 1];
  return alongEdge(last, last.len);
}

function alongEdge(e: Edge, dist: number): Point {
  const t = dist / e.len;
  return { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
}
