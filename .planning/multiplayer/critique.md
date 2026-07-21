# Critique: Whiteboard Multiplayer Plan (Iteration 25 — 10 adversarial passes)
> Keywords: multiplayer, action undo, loadShapes reconcile, locking, WebRTC, local testability, EventEmitter, versioning
Iteration: 25

Ten independent adversarial rubber-duck passes over `plan.md`, each attacking a different
axis, verified against the ACTUAL state of both repos at client `e02ec93` / server `80ef7e3`
(88 tsc errors, 91/247 tests failing on the client; server typechecks and installs clean).
The governing constraint for this iteration: **everything must be testable on local**
(two clients + one server on one machine, no external infrastructure).

## Verdict summary

- The plan's core direction (event-emitting core, lock-based conflict avoidance, authoritative
  server, action-based undo) is sound. Its failure mode is scope: roughly half the mandated
  machinery (WebRTC+STUN/TURN, binary Float64 frames, JSON Patch RFC 6902, zlib, sticky
  sessions, timing wheels) cannot be exercised locally and none of it is needed to prove the
  feature works. The plan has NO testing/verification story at all — the word "test" never
  appears in it.
- One catastrophic implementation-meets-plan bug (Pass 3) invalidates the currently landed
  Phase 1: every single-shape undo or remote apply routes through `loadShapes`, whose
  differential reconcile REMOVES every entity not present in the payload — one remote update
  wipes the local board. This is why 91 tests fail.
- Recommended restructure: WS-only MVP with a partial-apply core API, local dev harness as a
  first-class deliverable, phase gates (tsc + full vitest suite green per phase), WebRTC and
  scale hardening deferred to a final optional phase.

---

## Pass 1 — Local testability (the stated goal)

The plan mandates STUN/TURN servers (§4.3), sticky sessions (§4.1), permessage-deflate,
JWT infrastructure, and a UDP data channel path — and never says how any phase is verified.
There is no `npm run dev` flow, no dev-token story (the server's `/login` endpoint exists in
code but not in the plan), no unit-test requirements, no two-client scenario. The repo's own
conventions (vitest suite, per-step commits, dist rebuild — see CLAUDE.md and git history)
are ignored.

**Demand**: add a "Local test harness" section: (a) server `npm run dev` on :3000 with
`/login` issuing dev JWTs (secret from env, dev default); (b) the existing two-board demo
page (`dist/index.html` hosts `#board1`/`#board2`) becomes the two-client simulator — both
boards join the same room over `ws://localhost:3000` with different user names; (c) every
phase ends with tsc clean + full vitest suite green + new unit tests for the phase's core
logic (EventEmitter, HistoryManager actions, lock guards are all pure enough for jsdom);
(d) an end-to-end script drives both boards and asserts cross-board sync.

## Pass 2 — Plan/repo architecture drift

§1 prescribes `src/core/`, `src/multiplayer-client/`, `src/multiplayer-server/` in one
repository. Reality (user-confirmed): the client repo keeps its existing layout with
`src/multiplayer/MultiplayerPlugin.ts`, and the server is a SEPARATE repo
(`~/work/whiteboard-server`, github.com/serbanghita/whiteboard-server). The plan also
references a `TransformComponent` (§2.D) that does not exist — geometry lives directly in
`RectangleComponent`/`CircleComponent` (x,y) and `LineComponent` (x1,y1,x2,y2); the shipped
`TargetTransformComponent` correctly carries both shapes' xy and line endpoints, so the
plan's `{ x, y }` spec is wrong for lines.

**Demand**: rewrite §1 to the two-repo reality and fix §2.D to name the real components.

## Pass 3 — The action-undo refactor landed on a landmine (CATASTROPHIC)

`applyUndoAction`/`applyRedoAction` and the plugin's remote apply all call
`loadShapes(JSON.stringify([singleShape]))`. `loadShapes` (Whiteboard.ts:643) is a FULL-BOARD
differential reconcile: it deletes every shape whose id is not in the payload
(`stale.forEach` at :755) and clears the selection. Consequences: undoing one UPDATE deletes
the rest of the board; every remote `shapeCreated`/`shapeUpdated` wipes all local shapes.
This is the primary cause of the 91 failing tests and would make multiplayer strictly
destructive. Secondary defects in the same area: (a) `preInteractionState` is captured in the
DOM `mousedown` handler, so keyboard-driven actions and the entire test suite (which drives
`MouseComponent` directly) bypass it — and it re-serializes the whole board on every click,
the very cost the plan says snapshots make unacceptable; (b) `recordHistory` increments
`VersionComponent` locally while the server also assigns versions — two authorities;
(c) locally drawn shapes never receive `VersionComponent` or `ZIndexComponent` at all;
(d) `HistoryManager.redo()` ships with a comment that literally reads "Wait, … ?" — the
version-expectation logic was never settled.

**Demand**: (1) add a partial-apply API — `applyShapes(shapes)` / `applyShape(shape)` and
`removeShape(id)` — that upserts without reconciling-away absent entities; `loadShapes` keeps
its reconcile semantics strictly for file Load and full-state init. (2) Replace the
mousedown capture with a rolling baseline: `recordHistory` diffs against the last recorded
state and then adopts the new state as baseline; reset the baseline inside `loadShapes`/
`load()`/`clear()`. (3) Versions are SERVER-authoritative only; local single-player boards
carry no `VersionComponent` and `checkVersion` treats "absent" as always-undoable. Settle
redo expectations: UPDATE stores `beforeVersion`/`afterVersion`; undo requires current ==
afterVersion, redo requires current == beforeVersion; CREATE-redo requires non-existence;
DELETE-undo requires non-existence.

## Pass 4 — EventEmitter contract holes

Plan §2.A.2 (sync-storm filtering for attached lines) is unimplemented: `DragSystem` emits
`sync` for every dragged entity, and dragging a shape with attached lines emits nothing for
the lines locally (LineAttachmentSystem re-pins them after DragSystem) — remote clients that
apply only the shape's sync will re-pin their own lines IF attachments are synced; the plan
never says attachments serialize into sync at all. §2.A.4 `Whiteboard.clear()` does not
exist in the code. Worse, `pause()`/`resume()` is a single boolean: `setReadOnly(true)`
pauses, but any remote apply's `pause()`/`resume()` pair (MultiplayerPlugin does this) will
silently UN-pause a read-only board — feedback loops return exactly when disconnected.
`shapeInteractionStarted/Ended` (§4.2/§4.6) are emitted nowhere in the core, so the lock
protocol has no local trigger.

**Demand**: refcount or dual-flag the pause state (`readOnly` AND `applyingRemote` both
gate `emit`). Specify sync for attached lines: skip `sync` for entities with
`LineAttachmentComponent` (they re-derive), and rely on the release-edge `shapeUpdated`
(which serializes attachments) for the durable state. Emit `shapeInteractionStarted/Ended`
from the press/release edges of Drag/Resize/TextEdit — or accept lock-on-select as the MVP
and write that down. Define `clear()` (pause, remove all shapes, single `boardCleared`).

## Pass 5 — The locking half is vapor

Plan §4 promises: server lock table, ownership validation on update/unlock, `lock_rejected`,
5s leases, locks included in the `init` payload, `abortInteraction()` on rejection. The
server (index.ts) implements NONE of it — `lock`/`unlock` messages are broadcast verbatim
with no state, no denial, no lease, no init inclusion; updates are never checked against a
lock holder. On the client, `lockShape`'s "selection staleness" fix passes a string id to
`SelectionRectangleComponent.removeEntity(Entity)` (tsc error — even the one implemented
defense doesn't compile), `TextEditSystem`'s query does NOT exclude `IsLockedComponent`
(locked shapes are still double-click editable), and `abortInteraction()` has no caller.

**Demand**: implement a minimal, locally testable protocol: server keeps
`locks: Map<entityId, {userId, timeout}>` per board; `lock` → grant (`lock_granted` to
sender, `lock` broadcast to others) or `lock_denied`; updates/unlocks from non-holders are
dropped; locks release on unlock, disconnect, and a plain 5s `setTimeout` lease refreshed by
`sync` traffic (a per-lock timeout IS the O(1) structure at local scale — drop the "timing
wheel" mandate, it's a scale optimization with no local test); `init` includes current
locks. Client: `lock_denied` → `abortInteraction()` + revert via the pending action's
`before` state; exclude `IsLockedComponent` from TextEdit's editable set.

## Pass 6 — Protocol over-engineering vs. the goal

WebRTC-to-server via `node-datachannel` is an SFU with a native binary dependency — for a
whiteboard sending ≤30 msg/s of 6 floats, TCP WebSocket head-of-line blocking is a
non-issue on localhost and marginal on real networks at this rate. STUN/TURN configuration
(§4.3) is external infrastructure that cannot be validated locally. Binary
`Float64Array` frames (§4.3) save bandwidth JSON already handles fine at this volume (and
the "floating-point truncation vibration" claim is wrong — JSON serializes full f64).
JSON Patch RFC 6902 (§4.6) adds a diff/patch library and a whole class of apply-order bugs
to save bytes on payloads that are ~200 bytes. permessage-deflate has per-socket zlib
memory costs and matters at scale, not on localhost.

**Demand**: WS-only JSON protocol for the MVP; keep the existing WebRTC scaffold behind a
config flag (`enableWebRTC: false` default) since the 5s TCP fallback already makes it
optional; move binary frames, JSON Patch, compression, and TURN to a final "scale
hardening (non-local)" phase. Delete the sticky-sessions mandate from the repo plan — it's
a deployment doc item.

## Pass 7 — Server correctness and safety holes

(a) `UPDATE shapes SET … WHERE id = ?` and `DELETE FROM shapes WHERE id = ?` are not scoped
by `board_id` — any client can overwrite/delete a shape in ANY board by reusing its id
(client-supplied ids!). Add `AND board_id = ?`. (b) No payload limits: `new WebSocketServer`
without `maxPayload` + `JSON.parse` of unbounded strings; clamp (e.g. 1 MB) and
length-clamp text content server-side (the XSS surface is small — text renders to canvas,
not DOM — but the future cursor-name HTML overlay must escape names). (c) `JWT_SECRET` is
hardcoded; read from env with a dev default. (d) The init replay sends one message per
shape; fine locally, but fold into a single `init` payload (plan already wants this) so
locks can ride along. (e) `sqlite` persistence is plan-invisible: the plan never mentions a
database at all, yet the server has one — write it into the plan (it's actually a good
local-restart story). (f) Late joiner never receives z-order-correct state? It does
(ORDER BY z_index) — keep. (g) On disconnect, held locks must be released (currently locks
aren't tracked at all — see Pass 5).

## Pass 8 — ECS convention violations (why 88 errors)

CLAUDE.md: components extend `Component<Props>` with REQUIRED constructor props and are
registered via `registerComponents`. All four new components instead use bare `Component`
with class fields + `init()` — the local ecs package is generic-only, hence ~60 of the 88
errors. `MultiplayerPlugin` invents APIs that don't exist: `getComponent(predicate)`,
`addComponentInstance`, CommonJS `require()` inside an ESM browser bundle, and default-
imports `Whiteboard` (named export only). `RenderSystem` imports `getEntityBounds` from
`textLayout` (it lives in `shape.ts`). None of this is plan-mandated — but the plan's
Phase 1/2 must state "follow the ECS conventions in CLAUDE.md" and the phase gate (tsc)
would have caught it.

## Pass 9 — Undo × multiplayer semantics still leak

Good: remote applies pause the emitter and never touch the undo stack; undo/redo re-emit
so peers converge; locked entities block undo. Leaks: (a) `DELETE` undo restores the shape
but not its relational context atomically — the plan itself demands "DeleteAction records
relational state like attached lines", yet deleteSelection detaches surviving lines BEFORE
recordHistory diffs, so the detach IS captured as UPDATE actions — verify with a test that
undo of delete-with-attached-line restores the attachment in one step. (b) The rolling
baseline must be reset on `load()`/file-Load or the next release-edge diff manufactures a
board-sized action transaction. (c) `pushActions` caps at 100 TRANSACTIONS not shapes —
fine, but dedup died with the rewrite: a no-op release produces zero actions only if the
diff is truly empty — JSON key order is stable here (single serializer), acceptable; write
the regression test (grab-and-release-in-place produces no undo step — it exists in the
smoke suite already, currently failing). (d) Undo across a shape locked mid-session aborts
the WHOLE transaction and clears redo — plan-compliant but user-hostile; acceptable for
MVP, note it.

## Pass 10 — Phasing has no gates and the order is backwards

Phases 1–4 ship no verification, and "Live Cursors" (P3) precedes state sync (P4) — you'd
demo ghost cursors over diverged boards. The riskiest refactor (P1) landed broken precisely
because nothing forced the 247-test suite green before moving on. Rephase around locally
verifiable increments, each ending tsc-clean + suite-green + committed (repo convention:
`plan-execute: multiplayer step N`, github-commit-policy):

1. **Repair & conventions**: fix the four components to `Component<Props>`, fix
   MultiplayerPlugin/DragSystem/RenderSystem API misuse, partial-apply API, rolling
   baseline, settle HistoryManager versions. Gate: 247+ tests green (plus new
   HistoryManager/EventEmitter unit tests).
2. **Lock & read-only core**: lock guards in ALL interaction paths (TextEdit included),
   selection-staleness fix, `abortInteraction`/`setReadOnly` with refcounted pause,
   `clear()`. Gate: unit + smoke tests for every guard.
3. **WS server MVP**: board-scoped SQL, real lock table + leases + init-with-locks +
   ownership checks, env JWT secret, payload clamps. Gate: server unit tests (ws client
   harness) + client-server integration script.
4. **Local e2e**: demo page joins both boards to one room; drive with the browser driver;
   assert create/drag/lock/undo convergence. Gate: scripted e2e passes; screenshots.
5. **Polish**: interpolation tuning, cursors (WS, throttled, HTML overlay with escaped
   names). Gate: e2e extended.
6. **Scale hardening (non-local, optional)**: WebRTC flag, binary frames, compression,
   TURN, sticky sessions, timing wheels — explicitly out of local-test scope.
