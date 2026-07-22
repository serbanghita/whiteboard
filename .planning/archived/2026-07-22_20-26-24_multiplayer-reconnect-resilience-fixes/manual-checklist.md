# Manual verification checklist

Run with the real two-client harness (`dist/multiplayer.html`) against `npm run dev` in
`whiteboard-server`. Record PASS/FAIL + date per drill. Each drill must recover (or hold
steady) **without a page refresh**.

| # | Drill | Expected | Result |
|---|-------|----------|--------|
| 1 | Laptop sleep/wake with both clients connected | Both tabs reconnect on wake; edits flow BOTH ways afterwards | |
| 2 | Backend restart while both tabs are backgrounded, then foreground them | Sync resumes within ~1s of foregrounding each tab | |
| 3 | Backend down for >1 min, then up (tabs foreground) | Backoff keeps retrying; recovery within one backoff period (≤10s) | |
| 4 | Kill the backend mid-drag (one client dragging a locked shape) | Dragger goes read-only; on reconnect no ghost lock remains on either side | |
| 5 | `kill -STOP <server-pid>`, wait ~30s, `kill -CONT` | Clients detect the zombie via missed ping response, cycle, and re-init | |
| 6 | Healthy hidden tab, 10+ minutes | ONE socket the whole time - no reconnect churn in the server wire log | |
| 7 | Two tabs, same login token (paste URL) | Older tab gets force_disconnect and STAYS offline (no reconnect loop) | |

Notes:
- Watch the server console (`WB_DEBUG=1`) - `++`/`--` lines make churn obvious.
- Drill 6 is the regression check for the paired watchdog (a wall-clock watchdog
  churns once per minute in hidden tabs).
