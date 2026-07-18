import { describe, it, expect } from "vitest";
import { Entity } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../RectangleComponent";
import CircleComponent from "../CircleComponent";
import LineComponent from "../LineComponent";
import SelectionRectangleComponent from "../SelectionRectangleComponent";
import Layer from "../Layer";
import DrawnOnLayer from "../DrawnOnLayer";
import IsSelected from "../IsSelected";

describe("Components", () => {
  it("RectangleComponent coverage", () => {
    const comp = new RectangleComponent({ x: 0, y: 0, width: 10, height: 10 });
    comp.strokeColor = "red";
    comp.fillColor = "blue";
    comp.strokeWidth = 2;
    expect(comp.strokeColor).toBe("red");
    expect(comp.fillColor).toBe("blue");
    expect(comp.strokeWidth).toBe(2);
  });

  it("CircleComponent coverage", () => {
    const comp = new CircleComponent({ x: 0, y: 0, radius: 10 });
    comp.strokeColor = "red";
    comp.fillColor = "blue";
    comp.strokeWidth = 2;
    expect(comp.strokeColor).toBe("red");
    expect(comp.fillColor).toBe("blue");
    expect(comp.strokeWidth).toBe(2);
  });

  it("LineComponent coverage", () => {
    const comp = new LineComponent({ x1: 0, y1: 0, x2: 10, y2: 10 });
    comp.strokeColor = "red";
    comp.strokeWidth = 2;
    expect(comp.strokeColor).toBe("red");
    expect(comp.strokeWidth).toBe(2);
    // test length getter
    expect(comp.length).toBeCloseTo(14.14, 2);
  });

  it("SelectionRectangleComponent coverage", () => {
    const comp = new SelectionRectangleComponent({});
    const entity = new Entity("test");
    comp.addEntity(entity);
    expect(comp.hasEntity(entity)).toBe(true);
    comp.removeEntity(entity);
    expect(comp.hasEntity(entity)).toBe(false);
  });

  it("Layer component coverage", () => {
    const comp = new Layer({ id: "layer1", zIndex: 1, visible: true });
    comp.id = "layer2";
    comp.zIndex = 2;
    comp.visible = false;
    expect(comp.id).toBe("layer2");
    expect(comp.zIndex).toBe(2);
    expect(comp.visible).toBe(false);
  });

  it("DrawnOnLayer component coverage", () => {
    const comp = new DrawnOnLayer({ id: "layer1" });
    comp.id = "layer2";
    expect(comp.id).toBe("layer2");
  });

  it("IsSelected component coverage", () => {
    // Just instantiate to get coverage
    const comp = new IsSelected({});
    expect(comp).toBeDefined();
  });
});
