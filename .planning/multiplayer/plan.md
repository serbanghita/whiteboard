# Whiteboard Multiplayer Plan (rev. 25 — local-first)

Real-time collaboration for the whiteboard, restructured after 10 adversarial review passes
(see critique.md, Iteration 25). Governing constraint: **every phase must be fully testable
on one machine** — two clients + one server, no external infrastructure. WebRTC/TURN/binary
protocol/scale work is explicitly deferred to the final optional phase.

## 1. Architecture (two repos — the actual layout)

- **Client** `~/work/whiteboard` (github.com/serbanghita/whiteboard): the core stays where
  it is (`src/`), networking lives in `src/multiplayer/MultiplayerPlugin.ts`. The core
  knows nothing about networks: it exposes an API + `EventEmitter`; the plugin bridges
  events ⇄ WebSocket. All new code follows the ECS conventions in CLAUDE.md
  (`Component<Props>`, required ctor props, `registerComponents`, system order).
- **Server** `~/work/whiteboard-server` (github.com/serbanghita/whiteboard-server, private):
  Express + `ws` + sqlite persistence (boards/shapes with `z_index`, `version`), JWT auth
  with a dev `/login` endpoint. `JWT_SECRET` from env (`WB_JWT_SECRET`), dev default OK.

## 2. Core API (client)

### A. EventEmitter (emitting local changes)
- Events: `shapeCreated/Updated/Deleted`, `shapeInteractionStarted/Ended`, `sync`,
  `boardCleared`, `boardMetadataUpdated`.
- **Gating is dual-flag, not a single boolean**: `emit` is suppressed while EITHER
  `readOnly` OR `applyingRemote` is set (refcounted `pauseRemote()`/`resumeRemote()`), so a
  remote apply can never un-pause a read-only board.
- Blocklist: mutations of `camera/cursor/tool/selection/default-layer` never emit.
- `sync` (ephemeral drag stream, throttled ≤30/s in the plugin): only entity id + geometry
  (x,y or x1..y2). Entities with `LineAttachmentComponent` emit NO `sync` — attached lines
  re-derive on every client; the release-edge `shapeUpdated` (which serializes attachments)
  is the durable truth.
- `clear()`: suppress emission, remove all shapes, emit one `boardCleared`.

### B. Applying remote changes (partial-apply API — NOT loadShapes)
- `loadShapes` keeps its full-board reconcile semantics STRICTLY for file-Load and the
  `init` flush. Remote applies and undo/redo use new methods:
  - `applyShape(shapeData)` — upsert one shape by id (create with `IsRendered`, or patch in
    place), never touching other entities;
  - `removeShape(id)` — remove one entity (attached lines self-clean next frame).
- Both run under `applyingRemote` gating and bypass HistoryManager entirely.

### C. Action-based undo (HistoryManager)
- `Action = CREATE {entityId, data} | UPDATE {entityId, before, after} | DELETE {entityId, data}`,
  pushed as one transaction per user gesture.
- **Rolling baseline**: `recordHistory()` diffs `saveShapes()` against the last recorded
  state and adopts the new state as baseline. No DOM-event capture (keyboard actions and
  tests hit the same path). Baseline resets inside `loadShapes`/`load()`/`clear()`.
- Versions are **server-authoritative only**: local boards carry no `VersionComponent`;
  `checkVersion` treats "absent component" as undoable. UPDATE stores
  `beforeVersion`/`afterVersion` when versions exist; undo requires current == afterVersion,
  redo requires current == beforeVersion; CREATE-redo/DELETE-undo require non-existence.
  Version drift or `IsLockedComponent` aborts the whole transaction (and clears redo).
- Undo/redo apply via `applyShape`/`removeShape` and re-emit events so peers converge.
  Remote actions never enter the local stack.

### D. Locking + read-only
- `IsLockedComponent {userName, color}` (proper `Component<Props>`).
- `lockShape(id, {userName,color})` (also force-removes the entity from the current
  selection — pass the Entity, not the id), `unlockShape(id)`.
- Guards: MousePress/MouseOver queries exclude locked (done); **TextEdit's editable query
  must exclude locked too**; Drag/Resize act on the selection, which lockShape scrubs.
- `setReadOnly(bool)`: gates all input handlers + emitter; commits any open text edit.
- `abortInteraction()`: cancels previews, commits/destroys text overlays, resets tool state.
  Called by the plugin on `lock_denied`, followed by reverting the optimistic move from the
  pending action's `before` state.

### E. Smooth remote motion
- `TargetTransformComponent {x?,y?,x1?,y1?,x2?,y2?}` (covers rect/circle xy AND line
  endpoints — there is no TransformComponent in this codebase).
- `InterpolationSystem` (before Render): dt-based exponential decay
  `t = 1 − exp(−speed·dt)`; snap + remove component within 0.1 world units. Only remote
  sync ever adds the component, so local drags are never fought.

### F. Z-order
- `ZIndexComponent {zIndex}`; server stamps strictly increasing per-board sequence on
  create (resuming from `MAX(z_index)+1` after restart — the sqlite column already does
  this). RenderSystem sorts by it (stable sort keeps legacy order for zIndex-0 shapes).
- Lock visuals: 8×8 hatch texture tinted per user color + truncated (12 char + …) name
  label near the shape.

## 3. Server MVP (WS-only JSON protocol)

- Messages: `init` (single payload: `{metadata, shapes[], locks{}}` — one message, not N),
  `shapeCreated/Updated/Deleted`, `sync`, `lock`/`lock_granted`/`lock_denied`/`unlock`,
  `force_disconnect`.
- **Board-scoped SQL everywhere**: `… WHERE id = ? AND board_id = ?` on UPDATE/DELETE
  (ids are client-supplied; unscoped queries let any client mutate any board).
- **Lock table**: per-board `Map<entityId, {userId, timer}>`. `lock` → grant or
  `lock_denied`; updates/unlocks from non-holders dropped; released on unlock, disconnect,
  and a 5s `setTimeout` lease refreshed by the holder's `sync`/`update` traffic. Per-lock
  timeouts ARE the O(1) structure at this scale — timing wheels are Phase 6 material.
- Socket preemption on reconnect (same userId → terminate old socket, transfer state) — done.
- Limits: `maxPayload` (1 MB) on the WSS, text content length clamp, JSON parse guarded.
- Persistence: sqlite (`database.sqlite`, gitignored) — boards survive server restarts;
  version counter increments per accepted update.

## 4. Local test harness (first-class deliverable)

- Server: `npm run dev` (ts-node) on :3000; `POST /login {userName, boardId, color}` → JWT.
- Client demo: `dist/index.html` already hosts TWO whiteboards (`#board1`, `#board2`) —
  wire both to the same room as different users via `MultiplayerPlugin` (config block in
  `dist/demo-multiplayer.js` or inline; `enableWebRTC: false` default — the existing RTC
  scaffold stays behind that flag, its 5s TCP fallback already covers the wire).
- Unit tests (vitest, jsdom): EventEmitter gating/blocklist, HistoryManager action
  semantics (incl. the settled version rules), lock guards, partial-apply isolation
  (applyShape never removes other entities).
- E2e: headless-browser script drives board1 (draw/drag/lock) and asserts board2 converges;
  run against the real dev server.

## 5. Phases (each gated: LSP-clean diagnostics on touched files, `npx tsc --noEmit`,
full vitest suite green, committed via github-commit-policy as `plan-execute: multiplayer step N`)

1. **Repair & conventions** (client): four components → `Component<Props>`; fix
   MultiplayerPlugin (named import, no `require`, real ECS API), DragSystem imports,
   RenderSystem import + lock-label rendering; add `applyShape`/`removeShape`; rolling
   baseline; settle HistoryManager version fields; fix `lockShape` Entity/id bug;
   wire TextEdit lock exclusion. Gate: 247 legacy tests green + new unit tests.
2. **Interaction events + read-only hardening** (client): emit
   `shapeInteractionStarted/Ended` on gesture edges; dual-flag emitter gating; `clear()`;
   sync suppression for attached lines. Gate: unit + smoke coverage.
3. **Server MVP** (server): single-payload init with locks, lock table + leases +
   ownership validation, board-scoped SQL, env secret, payload clamps. Gate: server test
   suite (vitest + ws client) green.
4. **Local e2e**: plugin polish (reconnect backoff + offline banner + readOnly binding),
   demo wiring, scripted two-board e2e with screenshots. Gate: e2e green.
5. **Presence polish**: live cursors (WS, ≤30/s, HTML overlay with escaped names,
   CSS-transition smoothing), interpolation tuning. Gate: e2e extended.
6. **Scale hardening (non-local, optional, deferred)**: WebRTC flag on + TURN, binary
   Float64 frames, JSON Patch deltas, permessage-deflate, timing wheels, sticky sessions.
   Not exercisable locally; excluded from local acceptance.
