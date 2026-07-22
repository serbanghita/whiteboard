# Multiplayer Reconnect Resilience Fixes
> Keywords: multiplayer, reconnect, websocket, heartbeat, watchdog, background throttling, timer lifecycle, sqlite, vitest
Iteration: 2

## Summary

- All eight iteration-1 issues were merged cleanly; the plan's structure, ordering, and root-cause chapters are now execution-ready and verified against both repos.
- No split recommended (unchanged): Chapters 1–4 share one reconnect lifecycle; Chapter 5 remains the only independently executable piece.
- This pass found 8 new issues (1 high, 3 medium, 4 low). The high one matters: the Chapter 2 watchdog, as specified, false-positives in exactly the backgrounded-tab scenario the plan is trying to fix, causing per-minute connection churn in hidden tabs.
- Nothing found blocks starting execution on Chapters 1, 3, or 5 as written; Chapters 2, 4, 6 need the amendments below first.

---

## Chapter 2 — Heartbeat - watchdog false-positives in throttled background tabs (HIGH)

Description:
Plan lines 57–66: the client pings every ~10s and closes the socket when `lastServerActivity` is >30s old. But hidden tabs throttle `setInterval` to ~1/min — the client then pings only once a minute, so `lastServerActivity` (updated mostly by our own pings' pongs on an idle board) legitimately ages past 30s between throttled ticks. When the staleness check finally runs it sees a >30s gap on a healthy connection → deliberate close → reconnect → init flush — repeating every minute for as long as the tab is hidden. That is connection churn in precisely the backgrounded-tab scenario Chapter 4 exists to protect, and each churn re-runs the full init flush.

Suggested Solution:
Don't measure wall-clock staleness; pair each sent ping with its response. On sending `{type:'ping'}`, arm a single ~15s response timer cancelled by ANY incoming message; only its expiry closes the socket. Send and timeout are then throttled identically, so a hidden tab cannot false-positive — a late ping just gets a late (paired) verdict. Drop `lastServerActivity` entirely; it adds nothing once ping/response are paired.

---

## Chapter 2 — Heartbeat - client timer lifecycle unowned (MEDIUM)

Description:
Chapter 2 introduces three client-side timers (ping interval, response/staleness timer, init timeout) but never says who owns them or when they are cleared. `connect()` is called repeatedly across reconnects; timers created per-connect and not cleared on socket replacement accumulate — several ping intervals firing on one socket, an old init timeout killing a NEW healthy socket. This is the same leak class Chapter 4 fixes for the reconnect timer, so leaving it unspecified here invites re-introducing the disease one chapter earlier.

Suggested Solution:
Add a lifecycle rule to Chapter 2: all three handles are plugin fields; a single `clearTimers()` runs at the top of `connect()`, in `onclose`, and in `disconnect()`; the init timeout is additionally cleared when `init` arrives; the ping interval starts in `onopen`. One owner, cleared at every socket boundary — state it in the plan so execute can't improvise.

---

## Chapter 2 — Heartbeat - server ping branch must not touch lock leases (LOW)

Description:
Plan lines 60–61 add a `ping` branch to the server message handler but don't say it must NOT call `refreshLease`. Invariant A5 ties leases to real shape traffic precisely so a detached keepalive can't hold locks forever; a well-meaning implementer wiring ping through the same "activity" path would silently break lease expiry (a client sitting idle with a grabbed shape would hold its lock indefinitely).

Suggested Solution:
One sentence in the plan: "the `ping` branch replies `pong` and does nothing else — in particular it never refreshes lock leases (A5)". Add a server test asserting a lock expires while pings continue.

---

## Chapter 4 — Wake triggers - listeners must be registered once, not per-connect (LOW)

Description:
Plan lines 118–121 add `visibilitychange`/`online`/`focus` listeners and remove them in `disconnect()`, but don't say where they're ADDED. `connect()` re-runs on every reconnect; registering there stacks duplicates (N listeners after N reconnects, each calling the — thankfully single-flight — connect). The existing code has the exact pattern to copy: the `unsubscribe` guard at `MultiplayerPlugin.ts:64`.

Suggested Solution:
State: register the three listeners once, guarded like `unsubscribe` (or in the constructor), remove in `disconnect()`. Keep handler references as fields so removal works.

---

## Chapter 5 — Ready gate - `ready` must also settle on setup failure (MEDIUM)

Description:
Plan lines 138–145: the early-attached message handler begins with `await ready`, and `ready` resolves after verification + `ensureBoard` + `addClient` + init send. If setup FAILS (bad token → `ws.close(4001)`, db error → catch), `ready` never settles, and any frames that arrived early leave handler continuations suspended forever — a small leak per rejected connection, and a trap if anyone later adds cleanup after the await.

Suggested Solution:
Make `ready` resolve to a boolean: `true` after successful setup, `false` on any setup failure or close-during-setup (resolve, never reject — an unhandled rejection per early frame is the alternative). The gated handler does `if (!(await ready)) return;`. Wrap the setup sequence in try/catch whose catch resolves `false` and closes the socket.

---

## Chapter 6 — Tests - server tests would write to the real dev database (MEDIUM)

Description:
Plan lines 158–163 spec a server suite over a live server, but `db.ts:8` hardcodes `filename: './database.sqlite'` — the working dev db in the repo root (already carrying board state). Tests would mutate and pollute it, and parallel test files would contend on one file.

Suggested Solution:
Add to Chapter 6 (or a one-line prerequisite in Chapter 5's server work): make the db path env-configurable — `process.env.WB_DB_PATH ?? './database.sqlite'` — and have tests use `:memory:` (or a per-run temp file). Matches the existing `WB_PORT`/`WB_JWT_SECRET`/`WB_DEBUG` env convention.

---

## Chapter 6 — Tests - heartbeat timings must be injectable or the suite crawls (LOW)

Description:
The liveness sweep (~15s), watchdog (~10s ping + ~15s response timer), and init timeout (~10s) are wall-clock constants in the plan. In-process client tests can fake timers, but the server suite runs a real server on a real port — a missed-pong termination test as spec'd takes 30s+ of real time.

Suggested Solution:
Define the intervals as env-overridable constants (`WB_SWEEP_MS`, etc.) or exported module constants the test can shrink to tens of milliseconds, same pattern as `LOCK_LEASE_MS` in `SessionManager.ts:8` (which tests should also be able to shrink for the lease-expiry-under-ping test).

---

## Chapter 1 — Idempotency guard skips housekeeping on no-op calls (LOW, informational)

Description:
The new early-return changes one observable behavior: `setReadOnly(false)` when already read-write no longer runs housekeeping (tool reset, selection clear, text-edit commit). Verified the only callers are the plugin's `onclose` (`MultiplayerPlugin.ts:60`) and init handler (`:136`) — the affected case is the FIRST init after page load (readOnly starts false), where today's code resets the tool/selection and after the fix won't. Almost certainly harmless (fresh board, and `loadShapes` clears selection itself), but it is a behavior delta the execute phase should knowingly accept, not discover.

Suggested Solution:
Note it in Chapter 1. If first-init housekeeping turns out to be wanted, call it explicitly from the init handler rather than weakening the guard.
