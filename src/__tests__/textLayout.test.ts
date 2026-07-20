/**
 * Pure unit tests for the text layout engine - no DOM, no WebGL, no ECS
 * world. All measurements go through an injected fake monospace measurer
 * (0.6 * fontSize per character), so wrap points are exact and deterministic.
 */
import { describe, it, expect } from "vitest";

import {
  TEXT_PADDING,
  LINE_HEIGHT_FACTOR,
  interiorBoxForRectangle,
  interiorBoxForCircle,
  layoutText,
  TextMeasurer,
  TextBox,
} from "../textLayout";

const CHAR_FACTOR = 0.6;
const fakeMeasurer: TextMeasurer = (text, fontSize) => text.length * fontSize * CHAR_FACTOR;

// fontSize 10 with the fake measurer: every character is 6 units wide,
// lineHeight is 12.5.
const FONT_SIZE = 10;
const CHAR_W = FONT_SIZE * CHAR_FACTOR;
const LINE_H = FONT_SIZE * LINE_HEIGHT_FACTOR;

function box(width: number, height: number): TextBox {
  return { x: 0, y: 0, width, height };
}

function texts(layout: { lines: { text: string }[] }): string[] {
  return layout.lines.map((line) => line.text);
}

describe("interior boxes", () => {
  it("insets a rectangle by TEXT_PADDING on all sides", () => {
    const interior = interiorBoxForRectangle(100, 200, 50, 40);
    expect(interior).toEqual({
      x: 100 + TEXT_PADDING,
      y: 200 + TEXT_PADDING,
      width: 50 - 2 * TEXT_PADDING,
      height: 40 - 2 * TEXT_PADDING,
    });
  });

  it("returns null for a rectangle too small to hold text", () => {
    expect(interiorBoxForRectangle(0, 0, 2 * TEXT_PADDING, 100)).toBeNull();
    expect(interiorBoxForRectangle(0, 0, 100, 10)).toBeNull();
  });

  it("uses the inscribed square (side r*sqrt2 - 2*PAD) centered on the circle", () => {
    const r = 50;
    const interior = interiorBoxForCircle(300, 400, r)!;
    const side = r * Math.SQRT2 - 2 * TEXT_PADDING;
    expect(interior.width).toBeCloseTo(side);
    expect(interior.height).toBeCloseTo(side);
    expect(interior.x).toBeCloseTo(300 - side / 2);
    expect(interior.y).toBeCloseTo(400 - side / 2);
    // The square's corners stay inside the circle (pre-padding square is
    // exactly inscribed; padding only shrinks it).
    const cornerDist = Math.hypot(interior.width / 2, interior.height / 2);
    expect(cornerDist).toBeLessThanOrEqual(r);
  });

  it("returns null for a circle too small to hold text", () => {
    expect(interiorBoxForCircle(0, 0, TEXT_PADDING)).toBeNull();
  });
});

describe("wrapping", () => {
  it("wraps greedily on word boundaries", () => {
    // 10 chars fit per line (60 / 6).
    const layout = layoutText("hello world", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    expect(texts(layout)).toEqual(["hello", "world"]);
  });

  it("keeps words on one line while they fit", () => {
    const layout = layoutText("hi to you", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    // "hi to you" is 9 chars = 54 <= 60.
    expect(texts(layout)).toEqual(["hi to you"]);
  });

  it("breaks words longer than the box by character", () => {
    const layout = layoutText("abcdefghijklmnop", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    expect(texts(layout)).toEqual(["abcdefghij", "klmnop"]);
  });

  it("always breaks on explicit newlines and preserves blank lines", () => {
    const layout = layoutText("a\n\nb", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    expect(texts(layout)).toEqual(["a", "", "b"]);
  });

  it("collapses runs of whitespace between words", () => {
    const layout = layoutText("a   b", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    expect(texts(layout)).toEqual(["a b"]);
  });
});

describe("vertical clipping", () => {
  it("keeps only the lines that fully fit", () => {
    // height 25 -> floor(25 / 12.5) = 2 lines.
    const layout = layoutText("one two three", box(36, 25), FONT_SIZE, "mono", fakeMeasurer);
    // 6 chars per line (36 / 6): "one" + "two" fit their lines, "three" is clipped.
    expect(texts(layout)).toEqual(["one", "two"]);
  });

  it("renders nothing when not even one line fits", () => {
    const layout = layoutText("hi", box(60, LINE_H - 0.001), FONT_SIZE, "mono", fakeMeasurer);
    expect(layout.lines).toEqual([]);
  });
});

describe("centering", () => {
  it("centers each line horizontally", () => {
    const layout = layoutText("ab\nabcd", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    expect(layout.lines[0].x).toBeCloseTo((60 - 2 * CHAR_W) / 2);
    expect(layout.lines[1].x).toBeCloseTo((60 - 4 * CHAR_W) / 2);
  });

  it("centers the block vertically and stacks lines by lineHeight", () => {
    const layout = layoutText("a\nb", box(60, 100), FONT_SIZE, "mono", fakeMeasurer);
    const blockTop = (100 - 2 * LINE_H) / 2;
    expect(layout.lines[0].y).toBeCloseTo(blockTop);
    expect(layout.lines[1].y).toBeCloseTo(blockTop + LINE_H);
    expect(layout.lineHeight).toBeCloseTo(LINE_H);
  });

  it("a single line sits exactly in the middle", () => {
    const layout = layoutText("hi", box(60, 25), FONT_SIZE, "mono", fakeMeasurer);
    expect(layout.lines[0].y).toBeCloseTo((25 - LINE_H) / 2);
  });
});
