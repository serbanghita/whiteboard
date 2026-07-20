import { Entity } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "./component/RectangleComponent";
import CircleComponent from "./component/CircleComponent";

// Padding between the shape boundary and the text box, in world units.
export const TEXT_PADDING = 8;
// Line height as a multiple of the font size.
export const LINE_HEIGHT_FACTOR = 1.25;
// Fixed text defaults for v1 (no styling UI); stored per-shape in TextComponent
// so future styling is additive.
export const DEFAULT_FONT_SIZE = 14;
export const DEFAULT_FONT_FAMILY = "sans-serif";
export const DEFAULT_TEXT_COLOR = "#000";

export interface TextBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaidOutLine {
  text: string;
  // Box-local position of the line's top-left corner, already centered.
  // Layout is the single owner of placement: the rasterizer (textBaseline
  // "top", textAlign "left") and any DOM-overlay centering consume these
  // verbatim and never re-center.
  x: number;
  y: number;
}

export interface TextLayout {
  lines: LaidOutLine[];
  lineHeight: number;
}

/**
 * Measures the width of a piece of text.
 *
 * Unit-space note: fontSize is in WORLD units and the returned width must be
 * in world units for that fontSize. Boxes, font size and measurements all
 * live in one world-space coordinate system; camera zoom is applied only at
 * rasterization time.
 */
export type TextMeasurer = (text: string, fontSize: number, fontFamily: string) => number;

// Rough fallback when no 2D canvas is available (e.g. jsdom): average glyph
// width approximation. Tests never rely on it - they inject their own.
const approximateMeasurer: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.6;

let measurerOverride: TextMeasurer | null = null;
let canvasMeasurer: TextMeasurer | null = null;

function defaultMeasurer(): TextMeasurer {
  if (!canvasMeasurer) {
    // Created lazily so importing this module never touches the DOM.
    const context = typeof document !== "undefined"
      ? document.createElement("canvas").getContext("2d")
      : null;
    canvasMeasurer = context
      ? (text, fontSize, fontFamily) => {
          context.font = `${fontSize}px ${fontFamily}`;
          return context.measureText(text).width;
        }
      : approximateMeasurer;
  }
  return canvasMeasurer;
}

/** Test seam: replace the module-level measurer (jsdom has no real measureText). */
export function setMeasurer(measurer: TextMeasurer): void {
  measurerOverride = measurer;
}

export function resetMeasurer(): void {
  measurerOverride = null;
}

export function getMeasurer(): TextMeasurer {
  return measurerOverride ?? defaultMeasurer();
}

/** Interior text box of a rectangle: the rect inset by TEXT_PADDING. */
export function interiorBoxForRectangle(x: number, y: number, width: number, height: number): TextBox | null {
  const boxWidth = width - 2 * TEXT_PADDING;
  const boxHeight = height - 2 * TEXT_PADDING;
  if (boxWidth <= 0 || boxHeight <= 0) {
    return null;
  }
  return { x: x + TEXT_PADDING, y: y + TEXT_PADDING, width: boxWidth, height: boxHeight };
}

/**
 * Interior text box of a circle: the largest inscribed axis-aligned square
 * (side = r * sqrt(2)) inset by TEXT_PADDING, centered on the circle center.
 */
export function interiorBoxForCircle(cx: number, cy: number, radius: number): TextBox | null {
  const side = radius * Math.SQRT2 - 2 * TEXT_PADDING;
  if (side <= 0) {
    return null;
  }
  return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
}

/** Shape-agnostic interior box; null for lines and too-small shapes. */
export function getInteriorBox(entity: Entity): TextBox | null {
  if (entity.hasComponent(RectangleComponent)) {
    const rect = entity.getComponent(RectangleComponent);
    return interiorBoxForRectangle(rect.x, rect.y, rect.width, rect.height);
  }
  if (entity.hasComponent(CircleComponent)) {
    const circle = entity.getComponent(CircleComponent);
    return interiorBoxForCircle(circle.x, circle.y, circle.radius);
  }
  return null;
}

// Splits a word that is wider than maxWidth into the longest prefix that
// fits (always at least one character, so the loop makes progress).
function breakLongWord(word: string, maxWidth: number, measure: (text: string) => number): { head: string; rest: string } {
  let head = word[0];
  for (let i = 2; i <= word.length; i++) {
    const candidate = word.slice(0, i);
    if (measure(candidate) > maxWidth) {
      break;
    }
    head = candidate;
  }
  return { head, rest: word.slice(head.length) };
}

/**
 * Greedy word-wraps `content` into `box`, clips lines that do not fit
 * vertically, and centers the block both ways. Explicit "\n" always breaks;
 * words wider than the box break by character. Returns box-local line
 * positions (top-left of each line; pair with textBaseline "top").
 */
export function layoutText(
  content: string,
  box: TextBox,
  fontSize: number,
  fontFamily: string = DEFAULT_FONT_FAMILY,
  measurer: TextMeasurer = getMeasurer(),
): TextLayout {
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  const maxLines = Math.floor(box.height / lineHeight);
  if (maxLines <= 0) {
    return { lines: [], lineHeight };
  }

  const measure = (text: string) => measurer(text, fontSize, fontFamily);

  const wrapped: string[] = [];
  for (const paragraph of content.split("\n")) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (let word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= box.width) {
        current = candidate;
        continue;
      }
      if (current) {
        wrapped.push(current);
        current = "";
      }
      // The word alone may still be too wide - emit fitting chunks.
      while (measure(word) > box.width && word.length > 1) {
        const { head, rest } = breakLongWord(word, box.width, measure);
        wrapped.push(head);
        word = rest;
      }
      current = word;
    }
    wrapped.push(current);
  }

  const visible = wrapped.slice(0, maxLines);
  const blockTop = (box.height - visible.length * lineHeight) / 2;

  return {
    lines: visible.map((text, index) => ({
      text,
      x: (box.width - measure(text)) / 2,
      y: blockTop + index * lineHeight,
    })),
    lineHeight,
  };
}
