# Critique: Whiteboard Multiplayer Plan (Iteration 24)

**Observation Summary**
1. **[New Performance Risk]** Lock Sweeper CPU Spikes: Naively polling thousands of locks every second to enforce the 5-second leases will severely block the Node.js event loop.
2. **[New UX Risk]** Reconnection Zombie Sockets: If a user's WiFi drops and reconnects quickly before the OS TCP times out, the server might reject them unless strict Socket Preemption is implemented.

---

## 4. Conflict Resolution Flow 

**Lines 91-92**: *Ghost Locks (TCP Timeouts): The server implements a Lock Lease (5s timeout)...*

**Critique 1 (Lock Sweeper CPU Spikes)**:
The plan states the server uses a 5-second "Lock Lease" to prevent ghost locks. The standard naive implementation of this is a global `setInterval` that loops through a massive Map of all active locks across all rooms every second, checking `Date.now() - lock.lastHeartbeat`. In a viral deployment with 10,000+ simultaneous active locks, iterating this massive data structure every single second will cause severe CPU spikes and Node.js event loop blocking, delaying real-time `sync` packets.

**Suggestion**:
Explicitly specify that Lock Leases MUST NOT use a global polling loop. The Node.js server must implement a highly optimized **Timing Wheel** data structure, or bind individual cancellable `setTimeout` closures to each lock that reset when a heartbeat arrives. This ensures $O(1)$ performance for lock expiries and keeps the single-threaded event loop entirely free for packet routing.

---

**Lines 60-64**: *Late Joiner & Reconnection Initialization... Exponential Backoff...*

**Critique 2 (Reconnection Zombie Sockets)**:
If a user's WiFi drops, their client wrapper will attempt to establish a new WebSocket connection (Exponential Backoff). However, depending on the network topology, the server's OS might not have recognized the original TCP connection drop yet (which can take 60-120 seconds to time out). If the server is naively programmed to reject the new connection because "User A is already actively connected in this room", the user will be completely locked out of the whiteboard until the OS finally kills the old zombie TCP socket minutes later.

**Suggestion**:
The Node.js server MUST implement explicit **Session Resumption & Socket Preemption**. When a client connects with a valid JWT, the server must check if that `userId` already has an active socket registered in memory. If so, the server MUST forcefully call `socket.terminate()` on the old zombie connection, instantly transfer the user's active Lock Leases to the new socket, and accept the connection. This guarantees instant, seamless reconnections after micro-drops.
