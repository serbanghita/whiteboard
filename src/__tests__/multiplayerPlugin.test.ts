/**
 * MultiplayerPlugin reconnect-resilience suite.
 *
 * Centerpiece: the reported regression - two clients each go through a
 * disconnect->reconnect cycle (laptop sleep / server restart) and afterwards
 * NEITHER client's local edits reach the other, because setReadOnly leaked a
 * pause on the event emitter. The suite drives two real Whiteboard+plugin
 * pairs over a stubbed WebSocket and asserts bidirectional flow survives the
 * cycle, plus the Ch2/Ch3/Ch4 behaviors: paired watchdog, init timeout,
 * re-init lock/target cleanup, single-flight connect, wake triggers.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { setMeasurer } from "../textLayout";
import IsLockedComponent from "../component/IsLockedComponent";
import TargetTransformComponent from "../component/TargetTransformComponent";

class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWS[] = [];
  static last(): FakeWS {
    return FakeWS.instances[FakeWS.instances.length - 1];
  }

  url: string;
  readyState = FakeWS.CONNECTING;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWS.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    if (this.readyState === FakeWS.CLOSED) return;
    this.readyState = FakeWS.CLOSED;
    this.onclose?.();
  }

  // --- test drivers ---
  open() {
    this.readyState = FakeWS.OPEN;
    this.onopen?.();
  }

  receive(msg: any) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  /** Network-level drop (no client-initiated close). */
  drop() {
    if (this.readyState === FakeWS.CLOSED) return;
    this.readyState = FakeWS.CLOSED;
    this.onclose?.();
  }

  sentOfType(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }
}

let MultiplayerPlugin: any;
let PING_INTERVAL_MS: number;
let PING_RESPONSE_TIMEOUT_MS: number;
let INIT_TIMEOUT_MS: number;
let Whiteboard: any;

interface Client {
  wb: any;
  plugin: any;
}

const clients: Client[] = [];

function makeClient(): Client {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const wb = new Whiteboard(container);
  const plugin = new MultiplayerPlugin(wb, { wsUrl: "ws://test", jwtToken: "t" });
  const client = { wb, plugin };
  clients.push(client);
  return client;
}

const INIT = { type: "init", userName: "u", userColor: "#000", shapes: [], locks: {} };

/** connect + open + init: the client ends read-write on a live socket. */
function bringOnline(c: Client, init: any = INIT): FakeWS {
  c.plugin.connect();
  const ws = FakeWS.last();
  ws.open();
  ws.receive(init);
  return ws;
}

function rect(id: string): any {
  return { id, type: "rectangle", x: 1, y: 2, width: 30, height: 20, fillColor: "white", strokeColor: "black", strokeWidth: 1 };
}

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  setMeasurer((text, fontSize) => text.length * fontSize * 0.6);

  ({ Whiteboard } = await import("../Whiteboard"));
  ({ MultiplayerPlugin, PING_INTERVAL_MS, PING_RESPONSE_TIMEOUT_MS, INIT_TIMEOUT_MS } =
    await import("../multiplayer/MultiplayerPlugin"));
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeWS);
  FakeWS.instances = [];
});

afterEach(() => {
  for (const c of clients.splice(0)) c.plugin.disconnect();
  vi.useRealTimers();
});

describe("regression: both clients cycle, sync must survive (the reported bug)", () => {
  it("keeps bidirectional propagation after a disconnect->reconnect on both sides", () => {
    const A = makeClient();
    const B = makeClient();
    let wsA = bringOnline(A);
    let wsB = bringOnline(B);

    // -- the outage: both sockets die (sleep / server restart) --
    wsA.drop();
    wsB.drop();

    // backoff fires (attempt 0: <=500ms + jitter)
    vi.advanceTimersByTime(1000);
    wsA = A.plugin["ws"];
    wsB = B.plugin["ws"];
    expect(wsA).not.toBeNull();
    expect(wsB).not.toBeNull();
    wsA.open();
    wsA.receive(INIT);
    wsB.open();
    wsB.receive(INIT);

    // the leak's fingerprint: any residual pause silences the emitter
    expect(A.wb.events.pauseDepth).toBe(0);
    expect(B.wb.events.pauseDepth).toBe(0);

    // -- Alice draws: must reach the wire, then Bob --
    A.wb.events.emit({ type: "shapeCreated", entityId: "a1", data: rect("a1") });
    const aFrames = wsA.sentOfType("shapeCreated");
    expect(aFrames).toHaveLength(1);
    wsB.receive(aFrames[0]);
    expect(B.wb.world.getEntity("a1")).toBeDefined();

    // -- Bob draws: must reach Alice --
    B.wb.events.emit({ type: "shapeCreated", entityId: "b1", data: rect("b1") });
    const bFrames = wsB.sentOfType("shapeCreated");
    expect(bFrames).toHaveLength(1);
    wsA.receive(bFrames[0]);
    expect(A.wb.world.getEntity("b1")).toBeDefined();
  });

  it("survives a failed-reconnect storm (repeated onclose) without stacking pauses", () => {
    const A = makeClient();
    let ws = bringOnline(A);
    for (let i = 0; i < 4; i++) {
      ws.drop();
      vi.advanceTimersByTime(20_000); // let the backoff fire each round
      ws = A.plugin["ws"];
    }
    ws.open();
    ws.receive(INIT);
    expect(A.wb.events.pauseDepth).toBe(0);

    A.wb.events.emit({ type: "shapeDeleted", entityId: "x" });
    expect(ws.sentOfType("shapeDeleted")).toHaveLength(1);
  });
});

describe("re-init hygiene (Ch3)", () => {
  it("drops stale locks and interpolation targets not present in the init payload", () => {
    const A = makeClient();
    const shape = rect("s1");
    let ws = bringOnline(A, { ...INIT, shapes: [shape] });

    // peer locks the shape and streams a sync (creates a target)
    ws.receive({ type: "lock", entityId: "s1", userName: "peer", color: "#f00" });
    ws.receive({ type: "sync", entityId: "s1", x: 50, y: 60 });
    const entity = A.wb.world.getEntity("s1");
    expect(entity.hasComponent(IsLockedComponent)).toBe(true);
    expect(entity.hasComponent(TargetTransformComponent)).toBe(true);

    // outage; server restarted (lock table empty), re-init WITH the shape but NO locks
    ws.drop();
    vi.advanceTimersByTime(1000);
    ws = A.plugin["ws"];
    ws.open();
    ws.receive({ ...INIT, shapes: [shape] });

    const after = A.wb.world.getEntity("s1");
    expect(after).toBeDefined();
    expect(after.hasComponent(IsLockedComponent)).toBe(false);
    expect(after.hasComponent(TargetTransformComponent)).toBe(false);
  });

  it("re-applies locks that ARE in the init payload", () => {
    const A = makeClient();
    const shape = rect("s2");
    const ws = bringOnline(A, {
      ...INIT,
      shapes: [shape],
      locks: { s2: { userName: "peer", color: "#f00" } },
    });
    expect(ws).toBeDefined();
    expect(A.wb.world.getEntity("s2").hasComponent(IsLockedComponent)).toBe(true);
  });
});

describe("paired ping watchdog + init timeout (Ch2)", () => {
  it("pings on the interval and stays open while pings are answered", () => {
    const A = makeClient();
    const ws = bringOnline(A);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(ws.sentOfType("ping")).toHaveLength(1);
    ws.receive({ type: "pong" });

    vi.advanceTimersByTime(PING_RESPONSE_TIMEOUT_MS);
    expect(ws.readyState).toBe(FakeWS.OPEN); // answered ping never kills the socket
  });

  it("closes the socket when a ping goes unanswered", () => {
    const A = makeClient();
    const ws = bringOnline(A);

    vi.advanceTimersByTime(PING_INTERVAL_MS); // ping sent, verdict armed
    expect(ws.sentOfType("ping").length).toBeGreaterThan(0);
    vi.advanceTimersByTime(PING_RESPONSE_TIMEOUT_MS + 1); // no reply
    expect(ws.readyState).toBe(FakeWS.CLOSED);
    expect(A.plugin["reconnectTimer"]).not.toBeNull(); // routed into recovery
  });

  it("closes a socket whose init never arrives (TCP-connected, dead backend)", () => {
    const A = makeClient();
    A.plugin.connect();
    const ws = FakeWS.last();
    ws.open(); // handshake fine, but no init follows
    vi.advanceTimersByTime(INIT_TIMEOUT_MS + 1);
    expect(ws.readyState).toBe(FakeWS.CLOSED);
  });

  it("init arrival disarms the init timeout", () => {
    const A = makeClient();
    const ws = bringOnline(A);
    vi.advanceTimersByTime(INIT_TIMEOUT_MS + 1);
    expect(ws.readyState).toBe(FakeWS.OPEN);
  });
});

describe("reconnect lifecycle (Ch4)", () => {
  it("connect() is single-flight: no second socket while one is CONNECTING/OPEN", () => {
    const A = makeClient();
    A.plugin.connect();
    A.plugin.connect();
    A.plugin.connect();
    expect(FakeWS.instances).toHaveLength(1);
  });

  it("a wake event while disconnected reconnects immediately, exactly once", () => {
    const A = makeClient();
    const ws = bringOnline(A);
    ws.drop();
    const before = FakeWS.instances.length;

    window.dispatchEvent(new Event("focus"));
    expect(FakeWS.instances.length).toBe(before + 1);

    // the cancelled backoff timer must not fire a second attempt later
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.instances.length).toBe(before + 1);
  });

  it("wake listeners do not stack across reconnect cycles", () => {
    const A = makeClient();
    let ws = bringOnline(A);
    for (let i = 0; i < 3; i++) {
      ws.drop();
      vi.advanceTimersByTime(20_000);
      ws = A.plugin["ws"];
      ws.open();
      ws.receive(INIT);
    }
    ws.drop();
    const before = FakeWS.instances.length;
    window.dispatchEvent(new Event("focus"));
    expect(FakeWS.instances.length).toBe(before + 1); // one listener -> one attempt
  });

  it("disconnect() cancels a pending reconnect and wake triggers", () => {
    const A = makeClient();
    const ws = bringOnline(A);
    ws.drop(); // schedules a reconnect
    A.plugin.disconnect();

    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("focus"));
    expect(FakeWS.instances).toHaveLength(1); // never reconnected
  });

  it("force_disconnect permanently stops reconnection", () => {
    const A = makeClient();
    const ws = bringOnline(A);
    ws.receive({ type: "force_disconnect" });
    expect(ws.readyState).toBe(FakeWS.CLOSED);

    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event("focus"));
    expect(FakeWS.instances).toHaveLength(1);
  });
});
