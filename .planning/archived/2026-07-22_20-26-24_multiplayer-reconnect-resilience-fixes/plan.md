# Multiplayer Reconnect Resilience Fixes

Fix the post-sleep / post-server-restart sync breakage diagnosed on 2026-07-22: after any
disconnect→reconnect cycle a client keeps receiving remote updates but silently stops
sending its own, so two cycled clients each see a frozen peer ("Alice doesn't see Bob and
viceversa") until a hard refresh. Root cause plus the compounding issues below.

Repos touched: `~/work/whiteboard` (client) and `~/work/whiteboard-server` (server).
Invariants in play: A4 (socket preemption), A5 (lock leases), A10 (refcounted pause
gating, core/network isolation), A11 (reconnect discipline) from the
multiplayer-concurrent-control skill.

## Chapter 1 — Core fix: `setReadOnly` pause leak (client)

`Whiteboard.setReadOnly` (`src/Whiteboard.ts:292`) calls `events.pause()` unconditionally
but `events.resume()` only when turning read-only OFF. Every `setReadOnly(true)` therefore
leaks +1 on `EventEmitter.pauseDepth`, and `setReadOnly(false)` is net-zero — after one
disconnect the emitter is paused forever and no local event reaches the wire. Repeated
failed reconnects (each `onclose` → `setReadOnly(true)`) push the depth up by 1 per
attempt, so a single extra `resume()` cannot recover it.

Fix — the exact call sequence (this function has been wrong once already; do not
re-derive it):

```ts
public setReadOnly(readOnly: boolean) {
  if (this.readOnly === readOnly) return;  // idempotent: kills +1-per-failed-reconnect
  this.readOnly = readOnly;
  if (readOnly) this.events.pause();       // the transition's own +1: stays while offline
  this.events.pause();                     // cover housekeeping below (never emits)
  ...housekeeping: tool reset, selection clear, commitTextEditIfAny...
  this.events.resume();
  if (!readOnly) this.events.resume();     // undo the pause taken when read-only began
}
```

Nesting is safe — that is what the refcount is for. Also expose `pauseDepth` read-only
(a getter on `EventEmitter`) so tests can assert it; today it is private and unassertable.

**Known, accepted behavior delta**: the early-return means no-op calls skip housekeeping.
The only affected case is the FIRST init after page load (`setReadOnly(false)` while
already read-write — sole callers are the plugin's `onclose` and init handler): today it
resets tool/selection there, after the fix it won't. Harmless (fresh board; `loadShapes`
clears selection itself). If first-init housekeeping is ever wanted, call it explicitly
from the init handler — do NOT weaken the guard.

Acceptance: `pauseDepth` returns to 0 after any sequence of
`setReadOnly(true) × N → setReadOnly(false)`; a post-reconnect local drag emits
`sync`/`shapeUpdated` events again.

## Chapter 2 — Heartbeat / zombie-socket detection (server + client)

Neither side pings. After OS sleep a socket can be half-dead for minutes with no `onclose`:
the client sends into the void, the server broadcasts to a corpse, and nothing triggers
the reconnect path at all (the one-way-broken flavor of the bug). Two INDEPENDENT
mechanisms, each protecting one direction:

- **Server → detect dead clients** (`whiteboard-server/src/index.ts`): standard `ws`
  liveness sweep — on `connection` set `isAlive = true`; `ws.on('pong', → isAlive = true)`;
  a single `setInterval` (~15s) over `wss.clients` that `terminate()`s any socket with
  `isAlive === false` and otherwise flags `isAlive = false` + `ws.ping()`. `terminate()`
  fires the existing `close` handler, so lock release + `removeClient` cleanup come free.
  Clear the interval on `wss.close`. (A single sweep interval is fine at this scale; this
  is liveness, not lock leasing — B7 does not apply.)
- **Client → detect dead server** (`src/multiplayer/MultiplayerPlugin.ts`): browsers
  cannot see WS-level ping/pong, so this is app-level, and it is **paired, not
  wall-clock** — hidden tabs throttle timers to ~1/min, so any "no activity for 30s"
  staleness rule false-positives on a healthy throttled tab and churns the connection
  every minute. Instead:
  1. While the socket is OPEN, the client sends `{type: 'ping'}` every ~10s.
  2. On each send, arm a single ~15s response timer; ANY incoming message cancels it.
     Only that timer's expiry closes the socket. Send and timeout throttle identically in
     hidden tabs, so a late ping just gets a late (paired) verdict — no false positives.
     There is no `lastServerActivity` clock; pairing replaces it.
  3. The server's message handler replies `{type: 'pong'}` to the sender only — new
     branch before the shape branches; `ping`/`pong` are never persisted or broadcast,
     and the branch does NOTHING else — **in particular it never refreshes lock leases**
     (A5: leases are tied to real shape traffic; a keepalive that refreshed them would
     let an idle client hold a lock forever). Server test: a lock expires while pings
     continue.
  4. The deliberate close routes into the existing `onclose` → read-only → reconnect
     path (single recovery path, no new one). Wire-log both frame types.
- **Init timeout** (client): a reconnect can "succeed" at TCP while the backend is dead —
  a SIGSTOP'd or wedged server still completes handshakes in the kernel's listen backlog,
  and a proxy can accept while the backend is down. If `init` has not arrived within ~10s
  of `onopen`, close the socket and let backoff retry. Bounds time-to-init; without it the
  client sits in read-only limbo for a full watchdog period per attempt.
- **Timer lifecycle (client)**: Chapter 2 adds three timers — ping interval, response
  timer, init timeout. All three are plugin fields with ONE owner: a `clearTimers()`
  helper runs at the top of `connect()`, in `onclose`, and in `disconnect()`; the init
  timeout is additionally cleared when `init` arrives; the ping interval starts in
  `onopen`. Cleared at every socket boundary — an uncleared old init timeout must never
  be able to kill a NEW healthy socket, and reconnects must never stack ping intervals.

Acceptance: `kill -STOP` the server with both clients live; after `kill -CONT` (or a
sleep/wake) both sides recover automatically within watchdog + init-timeout bounds — no
refresh. A hidden tab on a healthy connection holds ONE socket for 10+ minutes (no churn).

## Chapter 3 — Re-init hygiene: clear stale remote-driven state (client)

The `init` handler only ADDS locks from `msg.locks`; `IsLockedComponent`s left over from
the previous connection survive re-init. After a server restart (lock table gone, `unlock`
broadcasts lost with the dead socket) shapes stay locked-by-a-ghost until refresh, and A2's
"skip remote-driven entities" history guard keeps treating them as remote.

- Add a `Whiteboard.clearRemoteArtifacts()` method next to `lockShape`/`unlockShape` that
  iterates `world.entities` (public `Map<string, Entity>`) and strips `IsLockedComponent`
  and `TargetTransformComponent` from every entity carrying one. Keeping the iteration in
  the core (not the plugin) respects A10's boundary: the network layer consumes a core
  API, it does not grope ECS components. (A stale interpolation target frozen by a
  mid-sync disconnect otherwise keeps its entity permanently "remote-driven" for history
  and can glide visibly on the next unrelated update.)
- The init flush calls it once, after `loadShapes` and before applying `msg.locks` — the
  init payload is the sole authority per A11's "full re-init".
- While in the init handler: it currently calls `loadShapes(...)` AND then
  `applyShape(shape)` per shape (`MultiplayerPlugin.ts:127–130`). Confirm what the
  per-shape pass adds over `loadShapes` (likely server metadata stamping —
  version/zIndex). If both passes are required, comment why; if not, delete the loop —
  it is duplicate work on the exact path this plan makes more frequent. Assert the chosen
  behavior in the new plugin test.

Acceptance: restart the server mid-lock and mid-drag; after reconnect no entity is locked
or interpolating unless the init payload says so.

## Chapter 4 — Reconnect lifecycle: single-flight connects + background-tab responsiveness (client)

Chrome throttles chained timers in hidden tabs (~1/min), so the backoff loop can leave a
backgrounded tab disconnected for minutes after the server is back, and a laptop wake sits
out the remainder of a long backoff. Adding immediate-reconnect triggers is only safe once
the connect path is single-flight — two latent double-connection bugs exist today and the
new triggers make them MORE likely to fire:

1. `connect()` (`MultiplayerPlugin.ts:39`) never detaches handlers from, or closes, the
   previous socket: each call replaces `this.ws`, but the old socket's `onclose` still
   fires later → `scheduleReconnect()` → a second parallel reconnect chain.
2. An immediate reconnect racing a mid-`CONNECTING` throttled attempt creates two live
   sockets for the same userId → server preemption (A4) force-disconnects one → the
   client's `force_disconnect` handler sets `closedByUser = true` → reconnection is
   permanently disabled: exactly the refresh-to-fix state this plan exists to eliminate.

Changes, in order:

- **Single-flight guard**: `connect()` early-returns if `this.ws` is `CONNECTING` or
  `OPEN`. Before creating a new socket, null out `onopen`/`onmessage`/`onclose` on the old
  object and `close()` it. After this, `force_disconnect` again only means "a genuinely
  newer session took over" — the only case where `closedByUser = true` is correct.
- **One timer handle**: store the pending reconnect as `reconnectTimer` so (a) a second
  schedule never stacks, (b) `disconnect()` cancels it — today a pending timer fires
  `connect()` even after a deliberate `disconnect()` (`closedByUser` guards
  `scheduleReconnect`, not an already-scheduled timer), (c) the wake triggers below can
  cancel-and-fire-now.
- **Wake triggers**: listen for `visibilitychange` (→ visible), `online`, and (belt)
  window `focus`. Register the three listeners ONCE, guarded exactly like the existing
  `unsubscribe` field (`MultiplayerPlugin.ts:64`) — NOT per-`connect()`, which would
  stack N duplicates over N reconnects. Keep handler references as fields; remove them
  in `disconnect()`. On fire, if disconnected: cancel `reconnectTimer`, reset
  `reconnectAttempt`, attempt immediately (the single-flight guard makes this safe).

Acceptance: with the tab backgrounded through a server restart, sync resumes within ~1s of
foregrounding; a deliberate `disconnect()` never reconnects; no sequence of
sleep/wake/restart produces two sockets for one userId.

## Chapter 5 — Server message handling: attach early, gate on ready (server)

`wss.on('connection')` awaits `ensureBoard` + the shapes query before attaching
`ws.on('message')`; frames arriving in that window are silently dropped. Real clients wait
for `init`, but raw test clients hit it (observed while smoke-testing the wire logger).

Attaching early is NOT enough on its own: the handler would then race the connection
SETUP awaits — a `shapeCreated` arriving during `ensureBoard()` inserts a shapes row
whose `board_id` has no boards row yet, and since sqlite3 never enables
`PRAGMA foreign_keys`, the FK in `db.ts:24` does not fail it — it silently creates an
orphan. Gate, don't buffer:

- Create a per-connection `ready` promise **that resolves to a boolean and ALWAYS
  settles** (resolve, never reject — a rejection would surface as one unhandled rejection
  per queued frame). Attach `ws.on('message')` and `ws.on('close')` synchronously, first
  thing; the message handler's body starts with `if (!(await ready)) return;` (ws emits
  per-socket messages in order, so queued handlers drain in arrival order once it
  resolves).
- Wrap the setup sequence — token verification, `ensureBoard`,
  `sessionManager.addClient`, init send — in try/catch. Success resolves `ready(true)`;
  any failure or close-during-setup resolves `ready(false)` and closes the socket, so
  early-frame continuations complete and drop their frames instead of hanging forever.
  Preemption (A4) therefore still fires only for fully valid new connections.
- Make the `close` handler tolerate `client` being undefined (close during setup).

Acceptance: a client that sends immediately on `open` (before `init`) gets its frames
processed after init, visible in the wire log; no orphan shapes rows appear; a client
rejected during setup leaves no suspended handlers.

## Chapter 6 — Tests and verification

Client suite is **vitest** (`npm test` / `npx vitest run` — NOT jest). The two-client
harness at `dist/multiplayer.html` is a manual page, and `whiteboard-server` has no test
infra at all (`"test"` is the npm placeholder) — the automated coverage below is NEW, not
an extension.

**Prerequisites for testability** (do these as part of Chapters 2/5 server work):
- Db path must be env-configurable: `db.ts:8` hardcodes `./database.sqlite` — the live
  dev database in the repo root. `process.env.WB_DB_PATH ?? './database.sqlite'`; tests
  use `:memory:` (or a per-run temp file). Matches the existing
  `WB_PORT`/`WB_JWT_SECRET`/`WB_DEBUG` env convention.
- All heartbeat timings must be shrinkable or the suite crawls: sweep interval, ping
  interval, response timer, init timeout as env-overridable/exported constants, same
  pattern as `LOCK_LEASE_MS` (`SessionManager.ts:8`) — which tests must also be able to
  shrink for the lock-expires-under-pings test. Target: no single server test needs more
  than ~1s of real time.

- **Unit (client)**: `EventEmitter`/`setReadOnly` pause-depth regression using the new
  `pauseDepth` getter — `setReadOnly(true) × N → setReadOnly(false)` → depth 0, events
  emit again.
- **Plugin (client)**: new `src/__tests__/multiplayerPlugin.test.ts` — stub the WebSocket
  global (`vi.stubGlobal('WebSocket', FakeWS)`), drive two Whiteboard+plugin instances
  through a scripted disconnect→reconnect cycle (server restart simulation: close both,
  reconnect both, re-init both), assert bidirectional event propagation — the reported
  symptom as a regression test. Cover: init clears stale locks/targets (Ch3), init
  timeout fires (Ch2), paired watchdog closes on missed response but never on a slow-but-
  answered ping (Ch2), single-flight connect + `disconnect()` cancels pending timer and
  stacks no duplicate wake listeners (Ch4), `force_disconnect` still permanently stops
  reconnection.
- **Server**: add vitest to `whiteboard-server` with a small suite over a live server on
  an ephemeral port and `WB_DB_PATH=:memory:`: liveness sweep terminates a socket that
  misses pongs; `ping` → `pong`; a lock EXPIRES while pings continue (A5); pre-init
  frames are gated then processed (Ch5, assert via db + wire log); no orphan shapes rows;
  setup-failure connections leave no suspended handlers. If this proves heavier than it
  is worth, scope the sweep/gating checks to the manual checklist below — but say so in
  the results file.
- **Manual checklist** (record results in this folder): laptop sleep/wake with both
  clients; backend restart with both tabs backgrounded; backend down >1 min then up;
  mid-drag disconnect; `kill -STOP`/`kill -CONT` zombie drill; hidden healthy tab holds
  one socket for 10+ minutes. Each must recover (or hold steady) without refresh.
- Run `npx vitest run` and `npx tsc --noEmit` in the client repo; `npx tsc --noEmit` and
  the new suite in the server repo.
