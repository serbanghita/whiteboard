# Connection snapping: inflated-bbox snap + endpoint-drag re-attach
> Keywords: connection snapping, reconnect, inflated bbox, endpoint drag, re-attach, ResizeSystem, ConnectionSystem, RenderSystem, connectionSnap, vitest, dist rebuild, docs(plan) convention
Iteration: 3

## Table of Contents

1. Execution protocol — Planning artifacts themselves are never committed
2. Step 2 — Source-shape coordinates unspecified for the new test block
3. Repo hygiene (informational): stale `currentPlan` in critique config; untracked `.DS_Store`

## Summary

- All 8 findings from iteration 2 are merged into plan.md and verified: step order is now 1 → (tests) → reveal → ResizeSystem, the helper swap and its call site share one commit (tsc-safe), the runner is vitest, the `dist/` rebuild and per-step `plan-execute` commit protocol via github-commit-policy are in, the margin-snap test has concrete tie-free coordinates, the history-dedup assertion has a mechanism, and the live check leads with the confirmed reconnect repro.
- Since iteration 2 the plan also gained a full-file leftover audit (Step 1): the smoke suite shares one world via `beforeAll`, and every existing drag was verified clear of leftover inflated bboxes — the only breaking test anywhere is line ~940, redirected in Step 4's commit. Spot-checked and confirmed (tests 461, 691, 732; the camera-suite rect is drawn post-461 and reaches neither point).
- Repo re-verified at HEAD 698c8c4, clean tree except the untracked `.planning/connection-snapping/` and `.DS_Store`.
- Split assessment unchanged: one plan, A-then-B sequencing already encoded in the step order.
- Remaining items are minor: the plan doesn't commit its own planning artifacts (repo convention), and Step 2's tests name the target shape's coordinates but not the source shape's. Neither blocks approval; both are one-line fixes.

---

## Execution protocol - Planning artifacts themselves are never committed

Description:
The Execution protocol (plan.md lines 11-15) covers per-step commits but not the planning documents. Repo convention brackets every executed plan with docs commits: `da77279 docs(plan): save-load-semantic-json plan and critique (4 iterations)` before step 1, `f65f063 docs(plan): execution log` and `698c8c4 docs(plan): archive save-load-semantic-json` (move into `.planning/archived/`) at the end. `.planning/connection-snapping/` is currently untracked and the plan never commits it.

Suggested Solution:
Add to the Execution protocol: before Step 1, commit `.planning/connection-snapping/` as `docs(plan): connection-snapping plan and critique (3 iterations)`; after Step 6, write the execution log and archive the plan folder per convention (`docs(plan): execution log for connection-snapping`, then `docs(plan): archive connection-snapping`). All via the github-commit-policy skill.

---

## Step 2 - Source-shape coordinates unspecified for the new test block

Description:
Plan.md lines 41-47 pin the margin-snap target B = (3200,100)-(3300,200) and cursor (3310,130), but never place the source shape the connection drag starts from; the body-snap and topmost-wins tests name no coordinates at all. An executor could place the source so that its own inflated bbox or a sibling test's shape interferes.

Suggested Solution:
Pin the source: A = (3000,100)-(3100,200), drag from A.e (3100,150) — the cursor (3310,130) is ~200px from A's inflated bbox (x ≤ 3112), no interference. Reuse A as the source for the body-snap test (separate target, e.g. B2 = (3200,300)-(3300,400), interior point (3280,390) → nearest dot `s`(3250,400)… any interior point with a unique nearest dot works — state one). For topmost-wins, place the overlapping pair in a fresh row (e.g. y ≥ 600) and note the draw order.

---

## Repo hygiene (informational)

Description:
(a) `.claude/plan-critique-config.json` still has `"currentPlan": "text-support-in-shapes"` — stale; the session file already points at connection-snapping, but if any plan-plugin command falls back to `currentPlan`, it would pick the wrong plan. (b) `.DS_Store` is untracked in the repo root (macOS Finder noise) and is not in `.gitignore`.

Suggested Solution:
(a) Update `currentPlan` to `connection-snapping` when execution starts (or let /plan:execute do it). (b) Never commit `.DS_Store`; optionally add it to `.gitignore` in a separate hygiene commit — out of scope for this plan.
