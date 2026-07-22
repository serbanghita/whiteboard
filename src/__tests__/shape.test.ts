/**
 * Pure hit-test tests for shape.ts - no DOM, no renderer. Guards the
 * thick-line tolerance rule: the hit band must cover the stroke's visible
 * edge (strokeWidth/2 off the centerline) plus a small screen-constant
 * grace, while thin lines keep the classic screen-constant band.
 */
import { describe, it, expect } from "vitest";
import { World, Entity } from "@serbanghita-gamedev/ecs";

import LineComponent from "../component/LineComponent";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import { hitTestEntity, LINE_HIT_TOLERANCE } from "../shape";

const world = new World();
world.registerComponents([LineComponent, RectangleComponent, CircleComponent]);

function line(id: string, strokeWidth?: number): Entity {
  const e = world.createEntity(id);
  e.addComponent(LineComponent, { x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth });
  return e;
}

describe("hitTestEntity for lines", () => {
  it("keeps the screen-constant band for thin lines", () => {
    const thin = line("thin");
    // scale 2: band = max(5/2, 0.5 + 2/2) = 2.5 world units.
    expect(hitTestEntity(thin, 50, 2.4, 2)).toBe(true);
    expect(hitTestEntity(thin, 50, 3, 2)).toBe(false);
  });

  it("makes a thick line clickable at its visible edge", () => {
    const thick = line("thick", 6);
    // scale 2: visual edge is 3 world units off center; band =
    // max(5/2, 3 + 2/2) = 4 - the edge hits, the old flat 2.5 band missed.
    expect(hitTestEntity(thick, 50, 3, 2)).toBe(true);
    expect(hitTestEntity(thick, 50, 3.9, 2)).toBe(true);
    expect(hitTestEntity(thick, 50, 4.1, 2)).toBe(false);
  });

  it("never shrinks below the classic tolerance at low zoom", () => {
    const thick = line("thick-lowzoom", 6);
    // scale 0.5: classic band 5/0.5 = 10 world units beats 3 + 2/0.5 = 7.
    expect(hitTestEntity(thick, 50, LINE_HIT_TOLERANCE / 0.5 - 0.1, 0.5)).toBe(true);
  });
});
