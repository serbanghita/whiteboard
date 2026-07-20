# Text Support In Shapes
> Keywords: text, TextComponent, textarea overlay, WebGL texture, undo button, isActive, keydown gating, test validity
Iteration: 5

## Summary

- All five iteration-4 issues are merged and verified in plan.md; none are restated.
- This pass re-verified Chapter 6/8 assumptions against the current `bindEvents` (rewritten since the undo/redo landing): wheel handler shape, keydown structure, menu z-index 1000, and — via the component registry's constructor-name keying — that no `TextComponent` name collision exists anywhere in src/. All hold.
- Two minor findings remain, both about the undo path: the menu undo/redo buttons bypass the keyboard guard and are safe only through an implicit ordering (issue 1), and the planned Ctrl+Z-while-editing test can pass trivially unless it arranges `isActive = true` (issue 2).
- No blocking issues. With these two wording-level fixes merged, the plan is execution-ready; no split recommended (Execution order section already stages the work).

Issues:
1. Chapter 8 — menu undo/redo buttons bypass the keyboard guard; safety is implicit (minor)
2. Chapter 9 — the Ctrl+Z-while-editing test must arrange `isActive = true` or it passes trivially (minor)

---

## Chapter 8 — menu undo/redo buttons bypass the keyboard guard; safety is implicit

Description:
Undo/redo are reachable not only via Ctrl/Cmd+Z/Y but via the menu's `data-action` buttons
(Whiteboard.ts:257-263) — a path Chapter 8's keyboard guard does not cover. Clicking the undo
button while editing happens to be safe, but only through a chain the plan never states:
mousedown on the button blurs the textarea → blur-commit runs synchronously (clearing
`editingEntityId`) → the button's `click` fires → `this.undo()` applies against the committed
state. And if that chain is ever broken — e.g. someone later adds
`mousedown.preventDefault()` to menu buttons (the common toolbar trick to avoid stealing
focus) so no blur occurs — the only remaining protection is the extended `canApplyHistory()`
returning false while `editingEntityId` is set. That backstop is exactly why Chapter 8's
third bullet matters, but the plan presents it as protection against *snapshots applied
mid-edit*, not as the last line of defense for the menu path.

Suggested Solution:
Add one sentence to Chapter 8: the menu undo/redo path needs no dedicated guard because (a)
button mousedown blurs the textarea and commit-on-blur runs before `click`, and (b) if blur
is ever suppressed, the extended `canApplyHistory()` no-ops the call — and add a smoke test
clicking the menu undo button mid-edit (asserting the edit commits first and the undo then
reverts it as one step).

---

## Chapter 9 — the Ctrl+Z-while-editing test must arrange `isActive = true`

Description:
The whole keydown handler returns early unless the pointer is over the canvas
(`if (!this.isActive) return;`, Whiteboard.ts:286; toggled by canvas mouseenter/mouseleave at
223-224). While editing, the pointer often sits over the textarea — which fires canvas
`mouseleave`, making `isActive` false and the handler inert regardless of any guard. The
planned test "Ctrl/Cmd+Z simulated while editing leaves shapes untouched" (plan.md Chapter 9)
would therefore pass trivially in that arrangement even if the `editingEntityId` guard were
never implemented — a false safety net. The guard's real work happens precisely when the
pointer hovers the canvas *outside* the overlay while the textarea holds focus.

Suggested Solution:
State in the Chapter 9 test description: dispatch canvas `mouseenter` (or rely on the suite's
`beforeAll` mouseenter) so `isActive` is true before dispatching the Ctrl+Z keydown, and
assert the guard — not the `isActive` gate — is what blocks the whiteboard undo. Optionally
also assert the inverse: with `isActive` false the handler is inert anyway (documents the
double protection).
