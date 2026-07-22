/**
 * Regression: setReadOnly must be idempotent and symmetric on the emitter's
 * pause refcount. The original implementation paused unconditionally but
 * resumed only when leaving read-only, so every disconnect (and every failed
 * reconnect attempt's onclose) leaked +1 pauseDepth - after one cycle the
 * emitter was silenced forever and no local edit reached the wire.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { setMeasurer } from "../textLayout";

let whiteboard: any;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  setMeasurer((text, fontSize) => text.length * fontSize * 0.6);

  const { Whiteboard } = await import("../Whiteboard");
  whiteboard = new Whiteboard(document.body);
});

describe("setReadOnly pause accounting", () => {
  it("starts with an unpaused emitter", () => {
    expect(whiteboard.events.pauseDepth).toBe(0);
  });

  it("read-only on/off returns pauseDepth to 0", () => {
    whiteboard.setReadOnly(true);
    expect(whiteboard.events.pauseDepth).toBe(1);
    whiteboard.setReadOnly(false);
    expect(whiteboard.events.pauseDepth).toBe(0);
  });

  it("repeated setReadOnly(true) does not stack pauses (failed-reconnect storm)", () => {
    for (let i = 0; i < 5; i++) whiteboard.setReadOnly(true);
    expect(whiteboard.events.pauseDepth).toBe(1);
    whiteboard.setReadOnly(false);
    expect(whiteboard.events.pauseDepth).toBe(0);
  });

  it("no-op setReadOnly(false) while read-write stays at 0", () => {
    whiteboard.setReadOnly(false);
    whiteboard.setReadOnly(false);
    expect(whiteboard.events.pauseDepth).toBe(0);
  });

  it("emits again after a full read-only cycle", () => {
    const seen: any[] = [];
    const off = whiteboard.events.on((e: any) => seen.push(e));

    whiteboard.setReadOnly(true);
    whiteboard.events.emit({ type: "shapeDeleted", entityId: "e-paused" });
    expect(seen).toHaveLength(0); // swallowed while read-only

    whiteboard.setReadOnly(false);
    whiteboard.events.emit({ type: "shapeDeleted", entityId: "e-live" });
    expect(seen).toHaveLength(1);
    expect(seen[0].entityId).toBe("e-live");
    off();
  });

  it("emitter pause stays balanced under nested pause/resume during read-only", () => {
    whiteboard.setReadOnly(true);
    // a remote apply inside the read-only period (the A10 nesting case)
    whiteboard.events.pause();
    whiteboard.events.resume();
    whiteboard.setReadOnly(false);
    expect(whiteboard.events.pauseDepth).toBe(0);
  });
});
