# Whiteboard Multiplayer Plan

This plan details the steps to introduce real-time multiplayer collaboration to the `@serbanghita-gamedev/demo-whiteboard`, while strictly maintaining a separation of concerns. The core whiteboard client will remain completely independent of any networking or multiplayer logic.

## 1. Package Architecture

To ensure the core whiteboard can be imported into websites without dragging in multiplayer functionality, we will organize the code into logical folders within the current repository (Phase 1-4), and optionally extract them to npm workspaces later:

*   **`src/core/`**: The standalone client whiteboard. Contains all ECS logic, rendering, and UI. It knows **nothing** about networks, servers, or multiplayer. It only exposes an API and emits events.
*   **`src/multiplayer-client/`**: A plugin/wrapper that consumes the core. It handles the WebSocket connection, listens to core events to send to the server, and uses the core API to apply remote updates and lock shapes.
*   **`src/multiplayer-server/`**: The Node.js WebSocket server that manages rooms, connected clients, and broadcasts state.

## 2. Core API for Multiplayer Support (in `core`)

To allow the multiplayer wrapper to function, the core whiteboard needs to expose specific hooks and APIs.

### A. Emitting Local Changes & Network Safety
We will implement an `EventEmitter` class within `Whiteboard` to notify the outside world of user actions. 

1. **Pause/Resume**: The `EventEmitter` MUST have `pause()` and `resume()` methods to prevent infinite network feedback loops.
2. **Sync Storm Filtering**: The `EventEmitter` MUST filter out coordinate updates for lines containing a `LineAttachmentComponent` to prevent duplicate position broadcasts.
3. **Local Singleton Blocklist**: The `EventEmitter` MUST strictly ignore mutations to local UI entities (`camera`, `cursor`, `tool`, `selection`, `default-layer`).
4. **Clear Board Optimization**: `Whiteboard.clear()` MUST pause the `EventEmitter` before destroying entities to prevent a massive flood of individual network messages. It will emit a single `boardCleared` event instead.
5. **Board Metadata Sync**: The `EventEmitter` must support a `boardMetadataUpdated` event to sync global board properties (like background color or title) that are not part of the standard shape ECS.

### B. Applying Remote Changes & Action-Based Undo
The core must expose methods to apply changes that completely bypass the local `HistoryManager`.

**Critical Refactor**: The current `saveShapes()` snapshot-based undo is fundamentally incompatible with multiplayer. Phase 1 MUST replace `HistoryManager` with a deep **Action-based Command pattern** (e.g., `MoveAction`, `DeleteAction` that records relational state like attached lines).
*   **Version-Aware Undo (Multiplayer Paradox Defense)**: The HistoryManager MUST be version-aware. When an action is recorded, it saves the entity's current `version`. When User A presses Undo, if the entity's current `version` on the board has changed (because User B modified it), the local Undo MUST be aborted to prevent destroying User B's work.
*   **Undo Execution**: Local undos apply the reverse action and broadcast it. Remote actions never enter the local undo stack.
*   **Lock-Aware Undo**: If an Undo targets an entity with `IsLockedComponent`, the client MUST block the Undo action.
*   **Save/Load Preservation**: The existing `saveShapes()` and `loadShapes()` methods MUST be preserved strictly for the static 📂 File export/import functionality.
*   **Metadata Integration**: Add `applyExternalMetadataUpdate(data)` to update global board settings.

### C. Locking API, Identification & Race Conditions
The core will support the *concept* of a locked shape.
*   Create an `IsLockedComponent` in the core. It will store the remote `userName` and an assigned `color`.
*   `Whiteboard` methods: `lockShape(entityId, { userName, color })` and `unlockShape(entityId)`.
*   Update interaction systems (`MousePressSystem`, `DragSystem`, `TextEditSystem`) to ignore locked entities.
*   **Selection Staleness**: `lockShape` MUST instantly forcefully remove the entity from the local `SelectionRectangleComponent`.
*   **Group Selection Filtering**: `SelectionRectangleSystem` MUST ignore `IsLockedComponent` entities during collision detection.
*   **Race Conditions & DOM Aborts**: If the server rejects a lock, the client calls `Whiteboard.abortInteraction()`. This method delegates an `abort()` call to systems (e.g., `TextEditSystem` must destroy its HTML `<textarea>` overlays to prevent ghost UI).
*   **ReadOnly Mode (Offline Safety)**: The core MUST implement a `setReadOnly(boolean)` method that completely disables all interaction systems. This prevents users from making optimistic edits while disconnected that would be inevitably wiped out upon reconnection.

### D. Buttery Smooth Dragging (Interpolation)
To prevent visual stuttering when remote updates arrive at 20fps on a 144Hz monitor:
*   Add a `TargetTransformComponent { x, y }` to the core.
*   When receiving throttled `sync` events, update the `TargetTransformComponent`, not the base `TransformComponent`.
*   **Refresh-Rate Independence**: Create an `InterpolationSystem` in the ECS to smoothly `lerp` the shape towards its target every frame. This system MUST use **Delta-Time (`dt`)** based exponential decay (e.g., `x = lerp(x, targetX, 1 - exp(-speed * dt))`) so that remote shapes move at the exact same physical speed regardless of whether the user is on a 60Hz or 144Hz monitor.

## 3. Rendering the Locked State & Z-Order

*   **Z-Order Sync**: Add an explicit `ZIndexComponent`. The Node.js server assigns a strictly incrementing sequence number to every `create` event. The `RenderSystem` MUST sort entities by this component before drawing.
*   **Z-Order Sequence Resets**: When the server initializes (or loads a saved board), it MUST calculate the maximum `ZIndexComponent` currently present in the state and set its internal sequence generator to `max_zIndex + 1` so new shapes aren't drawn underneath old ones.
*   **Hatch Pattern & User Identification**: Create an 8x8 repeating diagonal line pattern cached as a WebGL texture. When drawing locked shapes, the `RenderSystem` tints this texture using the `color` stored in the `IsLockedComponent`.
*   **Name Truncation**: The `RenderSystem` renders the `userName` label near the shape. This text MUST be strictly truncated (e.g., max 12 chars with `...`) to prevent visual clutter.

## 4. Conflict Resolution Flow (Driven by `multiplayer-client`)

Conflict resolution uses **Optimistic UI** combined with **Pessimistic Locking** via an **Authoritative Server**:

1.  **Late Joiner & Reconnection Initialization**:
    *   **Server Optimization**: The server maintains a pre-serialized cached Buffer of the master state to prevent event loop blocking.
    *   **Bandwidth Compression**: The server MUST compress the `init` payload using WebSocket `permessage-deflate` or `zlib`.
    *   **Horizontal Scaling Defense**: The deployment infrastructure MUST be configured to use **Sticky Sessions** (based on Room ID) to guarantee all users joining a room route to the exact same Node.js instance, preventing room fragmentation.
    *   **Thundering Herd Defense**: The wrapper client MUST implement **Exponential Backoff with Jitter** for WebSocket reconnections.
    *   **Reconnection Zombie Sockets**: The server MUST implement **Session Resumption & Socket Preemption**. If a user reconnects, the server must forcefully terminate their old zombie socket and transfer their active state, preventing lockouts before the OS TCP timeouts trigger.
    *   **Offline UI**: When the WebSocket drops, the wrapper MUST display an "Offline - Reconnecting..." banner and instantly call `core.setReadOnly(true)` to prevent local work loss.
    *   On connection, the wrapper calls `core.setReadOnly(false)`. The server sends `{ metadata, shapes: [...], locks: { [entityId]: { userName, color } } }`. The client flushes its local state and initializes.
2.  **Optimistic UI Dragging**:
    *   User A clicks and drags. The core ECS moves the shape *instantly* locally (zero input lag).
    *   The core emits `shapeInteractionStarted(entityId)`. The wrapper sends a `lock` request asynchronously in the background.
3.  **Real-time Dragging (Network Split & Binary Sync)**:
    *   As User A moves the mouse, the wrapper sends ephemeral `sync` messages using **absolute coordinates**.
    *   **TCP vs UDP Split**: To prevent massive stuttering caused by TCP Head-of-Line blocking when packets drop, the client and server MUST split their network traffic. Critical state (`lock`, `update`) runs over WebSockets (TCP). High-frequency ephemeral data (`sync`, mouse cursors) MUST run over **WebRTC Data Channels (UDP)** so dropped packets are simply ignored.
    *   **Firewall Defense (TCP Fallback)**: Because corporate NATs often block WebRTC UDP, the server MUST configure commercial **STUN/TURN servers**. Furthermore, if the UDP channel fails to connect within 5 seconds, the client MUST automatically fallback to tunneling `sync` data through the reliable TCP WebSocket.
    *   **Bandwidth & Precision Optimization**: These `sync` messages are packed into binary `ArrayBuffers`. The coordinates MUST use `Float64Array` (8 bytes) to prevent floating-point truncation vibration on infinite canvases. 
    *   **Payload Bloat Prevention**: Throttled `sync` events MUST ONLY broadcast the `EntityId` and `TransformComponent` (x, y). They must NEVER include heavy payloads (like `TextComponent` strings).
4.  **Server checks authority & broadcasts**:
    *   **JWT Authentication**: The WebSocket connection MUST be secured using a server-signed **JSON Web Token (JWT)**. The Node.js server extracts the `userId` and `userName` strictly from the token, completely ignoring client-reported names to prevent identity spoofing and vandalism.
    *   **Lock Ownership Validation**: The server STRICTLY validates the sender. If User C sends an `update` or `unlock` for a shape locked by User A, the server drops it.
    *   **Server OOM Prevention**: The server MUST physically `Map.delete(entityId)` upon deletion. It must NOT use tombstones (`deleted: true`), otherwise long sessions will OOM the Node process. Stray updates for deleted entities are simply dropped.
    *   **Data Validation & XSS**: The server sanitizes text components and clamps dimensions.
    *   **Ghost Locks (Event Loop Safe Leases)**: The server implements a **Lock Lease** (5s timeout). The server MUST NOT use a global polling loop to check expirations. It MUST use a $O(1)$ **Timing Wheel** or individual timeouts to prevent CPU spikes and event loop blocking when managing thousands of active locks.
    *   **Proxy Drops (Keep-Alive)**: The server MUST send explicit `ping` frames every 30 seconds. If a client doesn't `pong`, the server forcefully terminates the connection.
    *   **Tab-Switching Defense**: The client's lease heartbeats MUST NEVER use detached background timers (`setInterval`). They must be strictly bound to active physical mouse movement, so `Alt+Tab` gracefully releases locks.
5.  **User B receives the lock (or User A is rejected)**:
    *   If granted to B, User B's client calls `whiteboard.lockShape(entityId, { userName: 'Alice', color: '#ff0000' })`.
    *   If User A's initial lock request is rejected by the server (race condition), User A's wrapper calls `whiteboard.abortInteraction()`. The Optimistic UI snaps the shape out of User A's hand back to its original position.
6.  **User A finishes the edit (Delta Updates)**:
    *   The core emits `shapeUpdated(data)` and `shapeInteractionEnded(entityId)`.
    *   **JSON Delta Compression**: To save bandwidth on minor edits, the wrapper MUST calculate the structural diff of the shape and only transmit the explicit **JSON Patch (RFC 6902)** instead of broadcasting the full shape payload.

## 5. Live Multiplayer Cursors (Phase 3)
To ensure players "see each other's actions":
*   The wrapper listens to global `mousemove` events and broadcasts cursor positions **over the UDP WebRTC Data Channel**.
*   **Coordinate Math**: The wrapper MUST use the camera matrix to transform raw `mousemove` screen coordinates into absolute `worldX/worldY` coordinates *before* broadcasting. Receiving clients must apply the reverse transform so cursors align perfectly across different monitor resolutions and camera pans.
*   **Cursor Event Flooding**: To prevent 1000Hz gaming mice from DDoSing the server, `mousemove` broadcasts MUST be throttled (e.g., max 30fps).
*   Incoming remote cursors are rendered via a transparent HTML/React overlay strictly inside the wrapper, keeping the core ECS clean.
*   **HTML Jitter Prevention**: The HTML CSS MUST use a `transition: transform 33ms linear` so that the throttled 30fps cursors glide smoothly across the screen instead of teleporting.
*   **User Identification & Truncation**: Each remote cursor will display the remote `userName` text below the cursor icon, tinted in their assigned color. The HTML CSS must enforce `text-overflow: ellipsis` to prevent long names from cluttering the canvas.

## 6. Implementation Phases

1.  **Phase 1: Core Architecture Refactors**
    *   Implement deep Action-based Undo with **Version-Aware checks**.
    *   Migrate to `crypto.randomUUID()`.
    *   Implement the strict `EventEmitter` (pausing, filtering, blocklists, global metadata).
    *   Update `duplicateSelection()`, `deleteSelection()`, and `SelectionRectangleSystem` to filter locked entities. 
    *   Implement `abortInteraction()` and `setReadOnly(boolean)`.
2.  **Phase 2: Core Visuals & APIs**
    *   Create `IsLockedComponent` (with name/color), `ZIndexComponent` (with sequence reset defense), and `TargetTransformComponent`.
    *   Implement **Delta-Time (`dt`)** based `InterpolationSystem` for refresh-rate independent dragging.
    *   Update RenderSystem for sorting, tinted hatch textures, and truncated locking name labels.
3.  **Phase 3: Network Infrastructure & Plugin (Cursors)**
    *   Set up Node.js server with **Dual Protocols**: TCP WebSockets (for critical state) and UDP WebRTC Data Channels (for ephemeral syncs, backed by STUN/TURN).
    *   Implement **JWT Authentication**, lock tracking, ownership validation, Lock Leases (5s timeout via **Timing Wheels**), Proxy `Ping/Pong` Keep-Alives, binary sync parsing (with Float64), `zlib` compression, and explicit `Map.delete()` OOM prevention.
    *   Implement Exponential Backoff client reconnects, Offline Banners, Read-Only state binding, Sticky Sessions, UDP->TCP fallbacks, and **Socket Preemption**.
    *   Implement Live Cursors (UDP, throttled to 30fps with CSS smoothing and **world-coordinate camera transforms**) and truncated usernames via an HTML overlay.
4.  **Phase 4: State Sync & Locking (Optimistic UI & Delta Patches)**
    *   Implement emitting binary `sync` events (UDP, strictly tied to mouse movement, coordinates only, Float64) and **JSON Delta Patches (RFC 6902)** (TCP) for full updates.
    *   Implement Optimistic UI dragging with `lock_rejected` snap-back handling and Late Joiner state flushes.
