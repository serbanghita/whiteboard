/**
 * Save/Load semantic JSON (v2) serialization tests.
 *
 * Boots the real app in jsdom with the WebGL mock (vite.config.ts setupFiles)
 * and exercises the public save()/load() persistence pair plus the sysType
 * plumbing. The undo snapshot pair (saveShapes/loadShapes) is asserted
 * byte-stable across exports - it must never be affected by the v2 format.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

import type { Entity, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import LineAttachmentComponent from "../component/LineAttachmentComponent";
import { DEFAULT_FILL, DEFAULT_STROKE } from "../palette";
import CameraComponent from "../component/CameraComponent";
import TextComponent from "../component/TextComponent";
import IsRendered from "../component/IsRendered";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { screenToWorld } from "../camera";
import { setMeasurer } from "../textLayout";

let world: World;
let cursor: Entity;
let whiteboard: any;
let rafCallbacks: FrameRequestCallback[] = [];
let now = 0;

function frame() {
  now += 16;
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(now));
}

function cameraComp(): CameraComponent {
  return world.getEntity("camera")!.getComponent(CameraComponent);
}

function press(screenX: number, screenY: number) {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  const w = screenToWorld(cameraComp(), screenX, screenY);
  mouse.setXY(w.x, w.y);
  mouse.press(w.x, w.y);
  if (!cursor.hasComponent(IsMousePressed)) {
    cursor.addComponent(IsMousePressed);
  }
}

function release() {
  cursor.getComponent(MouseComponent).release();
  cursor.removeComponent(IsMousePressed);
}

function moveTo(screenX: number, screenY: number) {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  const w = screenToWorld(cameraComp(), screenX, screenY);
  mouse.setXY(w.x, w.y);
}

function setTool(tool: string) {
  world.getEntity("tool")!.getComponent(ToolStateComponent).currentTool = tool as any;
}

function selectionComp(): SelectionRectangleComponent {
  return world.getEntity("selection")!.getComponent(SelectionRectangleComponent);
}

function entityIdsByPrefix(prefix: string): string[] {
  return [...(world as any).entities.keys()].filter((id: string) => id.startsWith(prefix));
}

const FIXED_IDS = new Set(["cursor", "selection", "tool", "default-layer", "camera"]);

// Removes all shapes directly (no deleteSelection dependency - see plan
// critique) and resets the camera. History is intentionally not touched.
function clearBoard() {
  selectionComp().clear();
  for (const id of [...(world as any).entities.keys()]) {
    if (!FIXED_IDS.has(id)) world.removeEntity(id);
  }
  const cam = cameraComp();
  cam.x = 0; cam.y = 0; cam.scale = 1;
}

// Draws a rectangle through the real tool flow (works for 'rectangle' and
// every system-design tool). Auto-selects the shape and reverts to cursor.
function drawRect(tool: string, x1: number, y1: number, x2: number, y2: number): Entity {
  setTool(tool);
  press(x1, y1);
  frame();
  moveTo(x2, y2);
  frame();
  release();
  frame();
  const ids = entityIdsByPrefix("rectangle-");
  return world.getEntity(ids[ids.length - 1])!;
}

function addCircle(id: string, x: number, y: number, radius: number): Entity {
  const e = (world as any).createEntity(id);
  e.addComponent(CircleComponent, { x, y, radius, fillColor: "white", strokeColor: "black" });
  e.addComponent(IsRendered);
  return e;
}

function addAttachedLine(id: string, x1: number, y1: number, x2: number, y2: number,
  start: { entityId: string; handleId: string } | null,
  end: { entityId: string; handleId: string } | null): Entity {
  const e = (world as any).createEntity(id);
  e.addComponent(LineComponent, { x1, y1, x2, y2, strokeColor: "black", arrowEnd: "arrow" });
  if (start || end) e.addComponent(LineAttachmentComponent, { start, end });
  e.addComponent(IsRendered);
  return e;
}

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  setMeasurer((text, fontSize) => text.length * fontSize * 0.6);

  const { Whiteboard } = await import("../Whiteboard");
  whiteboard = new Whiteboard(document.body);
  world = whiteboard.world;
  cursor = world.getEntity("cursor")!;
});

beforeEach(() => {
  clearBoard();
  frame();
});

describe("v2 export (save)", () => {
  it("emits the v2 semantic document with rounded coords and omitted defaults", () => {
    const gw = drawRect("gw", 100.4, 80.6, 260.4, 160.6);
    addCircle("circle-t1", 400, 120, 40);
    addAttachedLine("conn-t1", 260, 120, 360, 120,
      { entityId: gw.id, handleId: "e" }, { entityId: "circle-t1", handleId: "w" });

    const doc = JSON.parse(whiteboard.save());
    expect(doc.v).toBe(2);
    expect(doc.camera).toEqual({ x: 0, y: 0, scale: 1 });
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(1);

    const gwNode = doc.nodes.find((n: any) => n.type === "gw");
    expect(gwNode.id).toBe(gw.id);
    expect(gwNode.text).toBe("GW");
    expect(Number.isInteger(gwNode.x)).toBe(true);
    expect(Number.isInteger(gwNode.y)).toBe(true);
    expect(gwNode.w).toBe(160);
    expect(gwNode.h).toBe(80);
    // White fill / black stroke are defaults - omitted.
    expect(gwNode).not.toHaveProperty("fill");
    expect(gwNode).not.toHaveProperty("stroke");

    const circleNode = doc.nodes.find((n: any) => n.type === "circle");
    expect(circleNode.r).toBe(40);

    const edge = doc.edges[0];
    expect(edge.from).toBe(`${gw.id}:e`);
    expect(edge.to).toBe("circle-t1:w");
    expect(edge.arrowEnd).toBe("arrow");
    expect(edge).not.toHaveProperty("stroke");
  });
});

describe("v2 import (load)", () => {
  it("reconstructs entities, sysType and attachments; LineAttachmentSystem re-pins", () => {
    const result = whiteboard.load(JSON.stringify({
      v: 2,
      nodes: [
        { id: "n1", type: "gw", x: 10, y: 20, w: 100, h: 60, text: "GW" },
        { id: "n2", type: "circle", x: 300, y: 50, r: 40 },
      ],
      edges: [
        { id: "e1", x1: 0, y1: 0, x2: 1, y2: 1, from: "n1:e", to: "n2:w", arrowEnd: "arrow" },
      ],
    }));
    expect(result).toEqual({ loaded: 3, skipped: 0 });

    const n1 = world.getEntity("n1")!;
    const rect = n1.getComponent(RectangleComponent);
    expect(rect.sysType).toBe("gw");
    expect(rect.width).toBe(100);
    expect(n1.getComponent(TextComponent).content).toBe("GW");
    expect(world.getEntity("n2")!.getComponent(CircleComponent).radius).toBe(40);

    const e1 = world.getEntity("e1")!;
    const att = e1.getComponent(LineAttachmentComponent);
    expect(att.start).toEqual({ entityId: "n1", handleId: "e" });
    expect(att.end).toEqual({ entityId: "n2", handleId: "w" });
    expect(e1.getComponent(LineComponent).arrowEnd).toBe("arrow");

    // One frame: LineAttachmentSystem re-pins the endpoints onto the shapes'
    // connection points (n1 east = (110, 50); n2 west = (260, 50)).
    frame();
    const line = e1.getComponent(LineComponent);
    expect(line.x1).toBe(110);
    expect(line.y1).toBe(50);
    expect(line.x2).toBe(260);
    expect(line.y2).toBe(50);
  });

  it("drops pins with invalid handles but keeps the line", () => {
    whiteboard.load(JSON.stringify({
      v: 2,
      nodes: [{ id: "n1", type: "rect", x: 0, y: 0, w: 50, h: 50 }],
      edges: [{ id: "e1", x1: 60, y1: 25, x2: 100, y2: 25, from: "n1:x" }],
    }));
    const e1 = world.getEntity("e1")!;
    expect(e1.hasComponent(LineComponent)).toBe(true);
    expect(e1.hasComponent(LineAttachmentComponent)).toBe(false);
  });
});

describe("legacy fallbacks", () => {
  it("loads the v1.1 object format with camera", () => {
    const result = whiteboard.load(JSON.stringify({
      version: "1.1",
      camera: { x: 5, y: 7, scale: 2 },
      shapes: [{ id: "r1", type: "rectangle", x: 1, y: 2, width: 30, height: 40, fillColor: "white", strokeColor: "black" }],
    }));
    expect(result).toEqual({ loaded: 1, skipped: 0 });
    expect(world.getEntity("r1")!.getComponent(RectangleComponent).height).toBe(40);
    expect(cameraComp().x).toBe(5);
    expect(cameraComp().y).toBe(7);
    expect(cameraComp().scale).toBe(2);
  });

  it("loads the v1.0 bare array format (single color field)", () => {
    const result = whiteboard.load(JSON.stringify(
      [{ type: "rectangle", x: 0, y: 0, width: 20, height: 20, color: "red" }],
    ));
    expect(result).toEqual({ loaded: 1, skipped: 0 });
    const ids = entityIdsByPrefix("loaded-shape-");
    expect(ids).toHaveLength(1);
    expect(world.getEntity(ids[0])!.getComponent(RectangleComponent).strokeColor).toBe("red");
  });

  it("throws on an unrecognized document", () => {
    expect(() => whiteboard.load(JSON.stringify({ foo: 1 }))).toThrow(/Unrecognized/);
    expect(() => whiteboard.load("not json")).toThrow();
  });
});

describe("roundtrip and undo stability", () => {
  it("save -> clear -> load -> save produces identical output", () => {
    const gw = drawRect("gw", 100, 80, 260, 160);
    addCircle("circle-rt", 400, 120, 40);
    addAttachedLine("conn-rt", 260, 120, 360, 120,
      { entityId: gw.id, handleId: "e" }, { entityId: "circle-rt", handleId: "w" });

    const first = whiteboard.save();
    clearBoard();
    whiteboard.load(first);
    expect(whiteboard.save()).toBe(first);
  });

  it("legacy 'white'/'black' stamped shapes export lean and roundtrip byte-identically", () => {
    // addCircle/addAttachedLine stamp the legacy NAMED defaults; the exporter
    // must still omit them (normalizeColor compare) and the reloaded board -
    // whose omitted keys now default to the canonical hexes - must re-export
    // byte-identically.
    addCircle("circle-legacy", 200, 200, 30);
    addAttachedLine("line-legacy", 10, 10, 90, 90, null, null);

    const first = JSON.parse(whiteboard.save());
    expect(first.nodes[0]).not.toHaveProperty("fill");
    expect(first.nodes[0]).not.toHaveProperty("stroke");
    expect(first.edges[0]).not.toHaveProperty("stroke");

    const exported = whiteboard.save();
    clearBoard();
    whiteboard.load(exported);
    expect(whiteboard.save()).toBe(exported);
  });

  it("v2 import defaults missing fill/stroke to the canonical hexes", () => {
    whiteboard.load(JSON.stringify({
      v: 2,
      nodes: [{ id: "r1", type: "rect", x: 0, y: 0, w: 50, h: 40 }],
      edges: [{ id: "l1", x1: 0, y1: 0, x2: 10, y2: 10 }],
    }));
    const rect = world.getEntity("r1")!.getComponent(RectangleComponent);
    expect(rect.fillColor).toBe(DEFAULT_FILL);
    expect(rect.strokeColor).toBe(DEFAULT_STROKE);
    expect(world.getEntity("l1")!.getComponent(LineComponent).strokeColor).toBe(DEFAULT_STROKE);
  });

  it("strokeStyle roundtrips through v2 and the absent key is canonical", () => {
    const e = addCircle("circle-style", 500, 500, 25);
    const comp = e.getComponent(CircleComponent);
    const before = whiteboard.saveShapes();
    expect(before).not.toContain("strokeStyle");

    comp.strokeStyle = "dashed";
    expect(whiteboard.saveShapes()).toContain('"strokeStyle":"dashed"');

    const doc = whiteboard.save();
    expect(doc).toContain('"strokeStyle":"dashed"');
    clearBoard();
    whiteboard.load(doc);
    const reloaded = world.getEntity("circle-style")!.getComponent(CircleComponent);
    expect(reloaded.strokeStyle).toBe("dashed");
    expect(whiteboard.save()).toBe(doc);

    // Toggling back to solid restores the absent key - byte-identical to a
    // never-styled shape as far as the action differ is concerned.
    reloaded.strokeStyle = undefined;
    expect(whiteboard.saveShapes()).not.toContain("strokeStyle");
  });

  it("saveShapes() is byte-identical before and after an export", () => {
    drawRect("gw", 10, 10, 100, 100);
    const snapshot = whiteboard.saveShapes();
    whiteboard.save();
    expect(whiteboard.saveShapes()).toBe(snapshot);
  });

  it("undo after a load restores the pre-load board", () => {
    const rect = drawRect("rectangle", 10, 10, 100, 100);
    whiteboard.load(JSON.stringify({
      v: 2,
      nodes: [{ id: "imported-1", type: "rect", x: 0, y: 0, w: 50, h: 50 }],
      edges: [],
    }));
    expect(world.getEntity("imported-1")).toBeDefined();
    expect(world.getEntity(rect.id)).toBeUndefined();

    whiteboard.undo();
    expect(world.getEntity(rect.id)).toBeDefined();
    expect(world.getEntity("imported-1")).toBeUndefined();
  });
});

function clickAction(action: string) {
  (document.querySelector(`[data-action="${action}"]`) as HTMLButtonElement)
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

function popupTextarea(): HTMLTextAreaElement {
  return document.querySelector(".save-load-textarea") as HTMLTextAreaElement;
}

function popupConfirm(): HTMLButtonElement {
  return document.querySelector(".save-load-confirm") as HTMLButtonElement;
}

function popupOverlay(): HTMLDivElement | null {
  return document.querySelector(".save-load-panel")?.parentElement as HTMLDivElement | null;
}

function closePopupIfOpen() {
  const cancel = document.querySelector(".save-load-cancel") as HTMLButtonElement | null;
  if (cancel && popupOverlay()?.style.display !== "none") {
    cancel.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  }
}

// The text-edit overlay textarea (the popup's own textarea is class-marked).
function editTextarea(): HTMLTextAreaElement | null {
  return document.querySelector("textarea:not(.save-load-textarea)");
}

function dblclick(screenX: number, screenY: number) {
  const w = screenToWorld(cameraComp(), screenX, screenY);
  cursor.getComponent(MouseComponent).doubleClick(w.x, w.y);
}

describe("save/load popup", () => {
  beforeEach(() => closePopupIfOpen());

  it("save shows the pretty-printed v2 document read-only with Load disabled", () => {
    drawRect("gw", 10, 10, 170, 90);
    clickAction("save");
    expect(popupOverlay()!.style.display).toBe("flex");
    expect(popupTextarea().readOnly).toBe(true);
    expect(popupConfirm().disabled).toBe(true);
    const doc = JSON.parse(popupTextarea().value);
    expect(doc.v).toBe(2);
    expect(doc.nodes[0].type).toBe("gw");
    // Pretty-printed for reading/copying, not the compact export.
    expect(popupTextarea().value).toContain("\n");
  });

  it("invalid JSON on confirm keeps the popup open, marks the error, board untouched", () => {
    const rect = drawRect("rectangle", 10, 10, 100, 100);
    clickAction("load");
    popupTextarea().value = "not json {";
    popupConfirm().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(popupOverlay()!.style.display).toBe("flex");
    expect(popupTextarea().style.borderColor).toBe("red");
    expect(world.getEntity(rect.id)).toBeDefined();
    expect(entityIdsByPrefix("loaded-shape-")).toHaveLength(0);
  });

  it("confirm is refused while the mouse is held, then works after release", () => {
    drawRect("rectangle", 10, 10, 100, 100);
    clickAction("load");
    popupTextarea().value = JSON.stringify({
      v: 2, nodes: [{ id: "held-1", type: "rect", x: 0, y: 0, w: 50, h: 50 }], edges: [],
    });

    press(500, 500);
    popupConfirm().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(world.getEntity("held-1")).toBeUndefined();

    release();
    frame();
    popupConfirm().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(world.getEntity("held-1")).toBeDefined();
    expect(popupOverlay()!.style.display).toBe("none");
  });

  it("opening Load commits an open text edit first", () => {
    const rect = drawRect("rectangle", 200, 200, 360, 280); // cursor mode, selected
    dblclick(280, 240);
    frame();
    const toolState = world.getEntity("tool")!.getComponent(ToolStateComponent);
    expect(toolState.editingEntityId).toBe(rect.id);
    editTextarea()!.value = "hello";

    clickAction("load");
    expect(toolState.editingEntityId).toBeNull();
    expect(rect.getComponent(TextComponent).content).toBe("hello");
    expect(popupOverlay()!.style.display).toBe("flex");
  });

  it("skipped malformed entries keep the popup open with a notice", () => {
    clickAction("load");
    popupTextarea().value = JSON.stringify({
      v: 2,
      nodes: [
        { id: "good-1", type: "rect", x: 0, y: 0, w: 50, h: 50 },
        { id: "bad-1", type: "rect" },
      ],
      edges: [],
    });
    popupConfirm().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(world.getEntity("good-1")).toBeDefined();
    expect(world.getEntity("bad-1")).toBeUndefined();
    expect(popupOverlay()!.style.display).toBe("flex");
    expect(document.querySelector(".save-load-notice")!.textContent)
      .toBe("Loaded 1 shapes, skipped 1 malformed entries");
  });
});

describe("sysType survival", () => {
  it("is copied by duplicateSelection and kept in the export", () => {
    drawRect("gw", 10, 10, 170, 90); // auto-selected after draw
    whiteboard.duplicateSelection();
    const dupIds = entityIdsByPrefix("duplicate-");
    expect(dupIds).toHaveLength(1);
    expect(world.getEntity(dupIds[0])!.getComponent(RectangleComponent).sysType).toBe("gw");

    const doc = JSON.parse(whiteboard.save());
    expect(doc.nodes.filter((n: any) => n.type === "gw")).toHaveLength(2);
  });

  it("survives delete -> undo (loadShapes recreation path)", () => {
    const gw = drawRect("gw", 10, 10, 170, 90); // auto-selected after draw
    whiteboard.deleteSelection();
    expect(world.getEntity(gw.id)).toBeUndefined();

    whiteboard.undo();
    const restored = world.getEntity(gw.id)!;
    expect(restored.getComponent(RectangleComponent).sysType).toBe("gw");
    const doc = JSON.parse(whiteboard.save());
    expect(doc.nodes[0].type).toBe("gw");
  });
});
