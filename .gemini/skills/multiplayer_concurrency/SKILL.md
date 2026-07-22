---
name: multiplayer-concurrent-control
description: Real-time multiplayer concurrency architecture - always-on invariants (version-aware undo, locking leases, socket preemption, optimistic UI, core/network isolation) plus scale-hardening topics deferred from MVPs (UDP channels, TURN, binary frames, delta patches, compression, sticky sessions, timing wheels) with the explicit triggers that graduate each one. Load when designing or extending multiplayer sync, or when deciding whether an MVP has outgrown WS-only JSON on one server instance.
---

# Multiplayer Concurrent Control

Two-part contract for real-time multiplayer systems, distilled from the whiteboard
multiplayer plan and its 10-pass adversarial review (`~/work/whiteboard/.planning/multiplayer/`;
reference implementation: `~/work/whiteboard` client + `~/work/whiteboard-server`).

**Part A invariants apply from day one — the MVP implements all of them.**
**Part B topics are deliberately OUT of any locally-tested MVP**: each enters only when its
trigger fires, behind a config flag, with the simple path kept as fallback (the pattern:
`enableWebRTC: false` + automatic WS fallback). A scale feature that your test environment
cannot exercise is a liability, not an asset — if you add one, add the infrastructure that
tests it (staging TURN, multi-instance compose, packet-loss simulation) in the same change.

---

## Part A — Always-on invariants (MVP and beyond)

### A1. Multiplayer Paradox Defense (version-aware undo)
Undo MUST be version-aware: an undo transaction aborts entirely if any target entity's
current version drifted from the recorded one (a peer changed it) or the entity is locked.
Expectations are per action type: undoing a DELETE expects the entity ABSENT; CREATE/UPDATE
undos expect it present at the recorded version. Version-less (single-player) entities pass
every present-check so local boards are never blocked.

### A2. Remote/local history isolation
Remote-driven changes MUST NEVER enter the local undo stack or be re-broadcast as local
edits. Two enforcement points, both required: (1) remote applies go through a partial-apply
API that bypasses history and maintains its diff baseline; (2) history recording SKIPS
entities currently remote-driven (locked, or carrying an interpolation target) — global
input events (window-level mouseup) fire in every co-hosted client and will otherwise
misattribute a peer's synced motion as a local change, echo it back, and version-stamp the
peer's entity so THEIR undo aborts. (Found only by e2e; static review missed it.)

### A3. Partial apply, never full-state reconcile
Applying one remote shape MUST NOT run a full-board load/reconcile path — differential
loaders that remove absent entities will wipe the board on the first remote update. Full
reconcile is reserved for file-load and the init flush (followed by a baseline reset).

### A4. Socket Preemption (zombie socket fix)
On reconnect before the OS TCP timeout, the server MUST terminate the old socket registered
to the same userId and accept the new one immediately — never reject as "already connected".

### A5. Lock leases tied to real traffic
Locks expire on a short lease (~5s) refreshed by the holder's actual traffic (sync/update
messages) — NEVER by a detached client-side `setInterval`, so Alt+Tab/sleep/crash releases
locks organically. Locks also release on unlock and disconnect; grants/denials are explicit
replies; non-holders' updates/unlocks are dropped server-side; current locks ride in the
init payload.

### A6. Optimistic UI with authoritative snap-back
Local interactions apply instantly (zero input lag) while the lock request races in the
background. On rejection the client MUST `abortInteraction()` — destroy ghost overlays/DOM,
cancel the gesture — and revert to the authoritative state (e.g. via the pending action's
`before` snapshot).

### A7. Refresh-rate independent interpolation
Never write remote sync coordinates directly to render state. Stage them in a target
component and lerp with delta-time exponential decay (`t = 1 − exp(−speed·dt)`) so remote
motion is physically identical at 30Hz and 144Hz. Only remote sync ever sets targets, so
local gestures are never fought.

### A8. Server-authoritative ordering and versions
The server stamps strictly incrementing per-room z-order sequence numbers on create
(resuming from `MAX+1` after restart) and owns the version counter (bumped per accepted
update). Clients never invent versions.

### A9. Server memory + payload hygiene
Hard-delete state (`Map.delete` / `DELETE FROM`) — no tombstones; stray updates for deleted
ids are dropped. Cap frame size (`maxPayload`), clamp text lengths, scope every mutation
query by room/board id (ids are client-supplied — an unscoped `WHERE id = ?` lets one room
mutate another).

### A10. Clean core isolation
The application core (ECS) knows nothing about networking. It exposes an API + event
emitter; the emitter blocklists local-only singletons (camera, cursor, tool, selection) and
its pause gating is REFCOUNTED so nested pause/resume pairs (a remote apply inside a
read-only period) cannot accidentally re-enable emission.

### A11. Reconnect discipline
Exponential backoff with jitter; on disconnect flip the client read-only (no doomed
optimistic edits); every reconnect is a full re-init from a single init payload
(state + locks in one message).

---

## Part B — Scale graduation topics (OUT of MVP; add on trigger only)

### B1. TCP/UDP protocol split (WebRTC data channels)
- **Problem**: TCP head-of-line blocking — one dropped packet stalls all queued sync frames.
- **Shape**: unordered/no-retransmit data channel for ephemeral idempotent state only (drag
  sync, cursors); critical state stays on the WS. Server side is SFU-style.
- **Trigger**: field reports of stuttery remote drags with measured packet loss (>~1%).
  Localhost shows zero loss — it can never justify this.
- **Traps**: native bindings (`node-datachannel`) fail to load on some platform/Node combos —
  lazy-require and degrade to WS-only with a warning. Always keep the N-second open-timeout
  fallback to WS: corporate NATs block UDP so often that the fallback IS the common path.

### B2. STUN/TURN
Only meaningful with B1 in a real deployment. STUN is free; TURN relays cost bandwidth and
need credential rotation. Cannot be validated locally AT ALL — needs staging plus a genuinely
NATed client. "Works on localhost" is zero evidence.

### B3. Binary sync frames
- **Shape**: `[type u8][entity ref][Float64 coords…]` ArrayBuffers. Use Float64 — JS numbers
  are f64 and far-from-origin coordinates on infinite canvases visibly quantize in f32.
- **Honesty note**: plain JSON already carries full f64 precision — bandwidth is the ONLY
  justification for binary, not precision.
- **Trigger**: measured bandwidth pressure (hundreds of concurrent viewers, mobile-data
  complaints). ~30 msg/s of geometry saves only ~5 KB/s per viewer.
- **Trap**: unreadable wire traffic; version every frame; keep a JSON debug path.

### B4. Delta updates (JSON Patch, RFC 6902)
- **Trigger**: individual payloads >~10 KB (rich text, embedded data). For ~200-byte shapes
  the patch library + apply-order bug surface costs more than it saves.
- **Prerequisite**: end-to-end per-entity versions with full-payload resync on base
  mismatch — patches silently corrupt without it.

### B5. Init-payload compression + cached serialization
- **Bandwidth**: compress the init message explicitly (zlib) at ~5-10x for JSON. Prefer that
  over `permessage-deflate`, which allocates a zlib context PER SOCKET (real memory at
  thousands of connections).
- **CPU**: keep a pre-serialized Buffer of master state (invalidated on write) so join
  storms don't re-serialize the board per joiner and block the event loop.
- **Trigger**: boards >~1000 shapes, or many users joining one room simultaneously.

### B6. Sticky sessions / backplane (horizontal scaling)
- **Problem**: one room split across instances = room fragmentation.
- **Shape**: route by room id at the LB (cheap first step) OR go instance-agnostic with a
  pub/sub backplane (Redis) — pick one deliberately.
- **Trigger**: the moment a second server instance exists. Until then it is a deployment-doc
  note, not code.
- **Trap**: stickiness breaks on restart/scale-down — A11's full re-init on reconnect is
  what makes that survivable; never lose it.

### B7. Timing wheels for lock expiry
One cancellable `setTimeout` per lock (reset on refresh) is already O(1) per event and
survives to large scale — it is the correct MVP implementation, not a naive one. Never use a
global polling sweep. Graduate to a hashed timing wheel (e.g. 512 slots, ~10ms tick) only
when profiling shows timer churn dominating (millions of acquire/release cycles per minute).

### B8. Presence fan-out batching (cursors)
- **Problem**: N users × 30 msg/s cursor broadcasts is N² fan-out (50 users ≈ 75k msg/s).
- **Shape**: server aggregates all cursor positions per room into ONE 10-20Hz frame; clients
  interpolate between frames (CSS transition or lerp). Escape remote-controlled names before
  they touch the DOM — the HTML presence overlay is the XSS surface canvas rendering avoids.
- **Trigger**: rooms >~10 concurrently active users.

---

## Graduation checklist (copy into plans that defer Part B)

| Topic | Trigger | Test infra required |
|---|---|---|
| B1 UDP channel | field packet-loss stutter | packet-loss sim / staging |
| B2 TURN | B1 + NATed users | staging + NATed client |
| B3 Binary frames | measured bandwidth pressure | frame-version tests |
| B4 JSON Patch | payloads >10 KB | version-gated apply tests |
| B5 Compression/caching | >1k shapes or join storms | load test |
| B6 Sticky sessions | >1 server instance | multi-instance compose |
| B7 Timing wheel | timer churn in profiles | lock-churn benchmark |
| B8 Cursor batching | >10 active users/room | fan-out load test |
