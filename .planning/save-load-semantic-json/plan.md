# Save/Load Semantic JSON (v2 Export Format)

## Goal Description
Implement a Save/Load feature that serializes the whiteboard state into an LLM-friendly, highly
readable JSON format. The user clicks a "Save" icon to get the JSON in a popup textarea, and a
"Load" icon to paste JSON and reconstruct the whiteboard state. The JSON distinguishes **nodes**
(rectangles, circles — with semantic system-design types like `"gw"`) from **edges** (lines, with
their attachments), so an LLM can natively interpret the diagram.

**Critical architectural constraint (from critique iteration 1):** the semantic format lives in
`save()`/`load()` — the persistence pair. `saveShapes()`/`loadShapes()` are the **undo/redo
snapshot unit** (string-equality dedup, byte-identical roundtrip contract) and receive only one
additive change (the `sysType` field). No rounding or renaming ever touches them.

## User Review Required
> [!IMPORTANT]
> The v2 JSON format below is the export contract. Key decisions to confirm:
> - Coordinates are rounded to integers **on export only** (undo/redo keeps full precision).
> - Defaults are omitted (`white` fill, `black` stroke, width 1); `"fill": "none"` marks the rare
>   transparent legacy shape.
> - Edge attachments serialize as `"entityId:handleId"` (e.g. `"rect-1:e"`) — the handle is
>   required by `LineAttachmentSystem` and must survive the roundtrip.
> - `SemanticComponent` from the original draft is **dropped**: a single optional
>   `sysType?: string` on `RectangleComponent` (the `arrowStart` precedent — absent key keeps
>   snapshots canonical) carries the only non-derivable datum, the original SYS tool id.

### v2 format example

```json
{
  "v": 2,
  "camera": { "x": 0, "y": 0, "scale": 1 },
  "nodes": [
    { "id": "rectangle-1", "type": "gw", "x": 100, "y": 80, "w": 160, "h": 80, "text": "Gateway" },
    { "id": "circle-1", "type": "circle", "x": 400, "y": 120, "r": 40 }
  ],
  "edges": [
    { "id": "connection-line-1", "x1": 260, "y1": 120, "x2": 360, "y2": 120,
      "from": "rectangle-1:e", "to": "circle-1:w", "arrowEnd": "arrow" }
  ]
}
```

Format rules:
- `type`: the shape's `sysType` if present (SYS shapes), else `"rect"` / `"circle"`. Import maps
  any `type` not in `{"rect", "circle"}` on a `w/h` node back to `sysType`. **Never inferred from
  label text.**
- Semantic types are **rect-only**: a circle node (`r` present) with a non-basic `type` loads as
  a plain circle — the semantic type is dropped (CircleComponent has no `sysType`). Stated here
  so the loss is a documented rule, not silent behavior.
- `id` is **required and must be unique**; edges' `from`/`to` must reference node ids present in
  the same document. A node without an id gets an auto-generated `loaded-shape-N` id (existing
  `loadShapes()` fallback), which edges cannot reference; a pin to an unknown id is dropped on
  import and dangling refs self-clean in LineAttachmentSystem.
- `camera` is optional; when absent, the current view is kept (LLM-authored documents will
  usually omit it).
- Forgiving input: nodes lacking finite numeric geometry (`x`/`y` plus `w`+`h` or `r`) and
  edges lacking finite `x1`..`y2` are **skipped** on import — counted and reported, never a
  whole-load failure. Pasted LLM output is exactly where such nodes come from.
- `text`: plain string when font props are the defaults (16 / sans-serif / black); the full
  `{content, fontSize, fontFamily, color}` object otherwise.
- Omissions: `fill` omitted when `white`, `stroke` when `black`, `strokeWidth` when `1`/unset;
  transparent (legacy) fill serializes as `"fill": "none"`. Import restores explicitly:
  `stroke ?? 'black'`, `fill === 'none' ? undefined : (fill ?? 'white')`.
- `from`/`to`: `"entityId:handleId"`, omitted for a dangling endpoint. `arrowStart`/`arrowEnd`
  present only when `'arrow'`.
- All coordinates/sizes `Math.round`ed at export time.

## Proposed Changes

The two phases are independently landable. **Execute Phase 1 first**; Phase 2 is a thin UI
consumer of the two public methods Phase 1 finalizes.

---

### Phase 1 — Semantic tagging + v2 export/import format

#### [MODIFY] `src/component/RectangleComponent.ts`

Optional `sysType` alongside the existing optional color props (only rectangles can be SYS
shapes — RectangleDrawSystem handles every system-design tool):

```diff
 export interface RectangleComponentProps {
   x: number;
   y: number;
   width: number;
   height: number;
   fillColor?: string;
   strokeColor?: string;
   strokeWidth?: number;
+  // Original system-design tool id (e.g. 'gw') for shapes drawn from the SYS
+  // panel; absent on plain rectangles. The label text is user-editable, so
+  // this is the only durable record of the semantic type.
+  sysType?: string;
 }
```

Plus the matching getter/setter pair over `properties` (TextComponent pattern).

#### [MODIFY] `src/system/RectangleDrawSystem.ts`

Stamp at **commit** (inside the existing `label` branch, `RectangleDrawSystem.ts:111-119` — at
commit `currentTool` still holds the SYS tool id, and the shape has survived the min-size check):

```diff
               const label = systemDesignLabel(toolState.currentTool);
               if (label) {
+                previewEntity.getComponent(RectangleComponent).sysType = toolState.currentTool;
                 previewEntity.addComponent(TextComponent, {
                   content: label,
```

No changes to CircleDrawSystem / LineDrawSystem / ConnectionSystem: BASIC shapes carry no tag
(their type is derivable from the shape component), and connection lines' semantics live in
their attachments.

#### [MODIFY] `src/Whiteboard.ts` — `duplicateSelection()`

Copy the field with the other rectangle props (`Whiteboard.ts:678-684`):

```diff
         copy.addComponent(RectangleComponent, {
           x: comp.x + offset, y: comp.y + offset,
           width: comp.width, height: comp.height,
-          fillColor: comp.fillColor, strokeColor: comp.strokeColor, strokeWidth: comp.strokeWidth
+          fillColor: comp.fillColor, strokeColor: comp.strokeColor, strokeWidth: comp.strokeWidth,
+          sysType: comp.sysType
         });
```

#### [MODIFY] `src/Whiteboard.ts` — `saveShapes()` / `loadShapes()` (additive only)

The **only** change to the snapshot pair. In `saveShapes()` (rectangle branch,
`Whiteboard.ts:465-472`): `data.sysType = comp.sysType;` — `undefined` drops out of
`JSON.stringify`, so every existing snapshot stays byte-identical. In `loadShapes()`:
pass `sysType: shape.sysType` in the create branch and `comp.sysType = shape.sysType;` in the
patch branch — the patch assignment doubles as the remove-reconcile (undo across a SYS-shape
creation restores `undefined`), so delete → undo → save can never downgrade a Gateway to a plain
rect.

#### [MODIFY] `src/Whiteboard.ts` — `save()` exports v2

Builds the v2 document from the canonical internal snapshot (reusing `saveShapes()` keeps the
preview-exclusion and field canonicalization in one place):

```typescript
public save(): string {
  const cam = this.camera;
  const shapes = JSON.parse(this.saveShapes()) as any[];
  const nodes: any[] = [];
  const edges: any[] = [];
  for (const s of shapes) {
    if (s.type === 'line') {
      const e: any = { id: s.id, x1: Math.round(s.x1), y1: Math.round(s.y1),
                       x2: Math.round(s.x2), y2: Math.round(s.y2) };
      if (s.strokeColor && s.strokeColor !== 'black') e.stroke = s.strokeColor;
      if (s.strokeWidth && s.strokeWidth !== 1) e.strokeWidth = s.strokeWidth;
      if (s.arrowStart) e.arrowStart = s.arrowStart;
      if (s.arrowEnd) e.arrowEnd = s.arrowEnd;
      if (s.attachment?.start) e.from = `${s.attachment.start.entityId}:${s.attachment.start.handleId}`;
      if (s.attachment?.end) e.to = `${s.attachment.end.entityId}:${s.attachment.end.handleId}`;
      edges.push(e);
    } else {
      const n: any = { id: s.id, type: s.sysType ?? (s.type === 'circle' ? 'circle' : 'rect') };
      n.x = Math.round(s.x); n.y = Math.round(s.y);
      if (s.type === 'circle') { n.r = Math.round(s.radius); }
      else { n.w = Math.round(s.width); n.h = Math.round(s.height); }
      if (s.fillColor === undefined) n.fill = 'none';
      else if (s.fillColor !== 'white') n.fill = s.fillColor;
      if (s.strokeColor && s.strokeColor !== 'black') n.stroke = s.strokeColor;
      if (s.strokeWidth && s.strokeWidth !== 1) n.strokeWidth = s.strokeWidth;
      if (s.text) {
        const isDefaultFont = s.text.fontSize === 16 && s.text.fontFamily === 'sans-serif' && s.text.color === 'black';
        n.text = isDefaultFont ? s.text.content : s.text;
      }
      nodes.push(n);
    }
  }
  return JSON.stringify({ v: 2, camera: { x: cam.x, y: cam.y, scale: cam.scale }, nodes, edges });
}
```

#### [MODIFY] `src/Whiteboard.ts` — `load()` with three-format detection

Detection order, each route translating to the internal snapshot array and delegating to the
untouched `loadShapes()`; camera restored where present; one `recordHistory()` at the end
(existing behavior, `Whiteboard.ts:776`). Invalid JSON throws — the caller (Phase 2 popup)
catches.

```typescript
public load(json: string) {
  const data = JSON.parse(json);            // throws on garbage - caller handles

  let shapes: any[];
  if (Array.isArray(data)) {
    shapes = data;                          // v1.0: bare array (single `color` field
  } else if (data.shapes) {                 //       handled inside loadShapes already)
    shapes = data.shapes;                   // v1.1: {version, camera, shapes}
  } else if (data.v === 2 || data.nodes || data.edges) {
    // "entityId:handleId" -> AttachmentPoint. Invalid handles (hand-edited or
    // LLM-authored files) drop the pin - the line loads dangling instead of
    // feeding a bogus handleId to LineAttachmentSystem every frame.
    const HANDLES = new Set(['n', 'e', 's', 'w']);
    const parsePin = (ref?: string) => {
      if (!ref) return null;
      const i = ref.lastIndexOf(':');
      const entityId = ref.slice(0, i), handleId = ref.slice(i + 1);
      if (!entityId || !HANDLES.has(handleId)) return null;
      return { entityId, handleId };
    };
    const nodes = (data.nodes ?? []).map((n: any) => ({
      id: n.id,
      type: n.r !== undefined ? 'circle' : 'rectangle',
      x: n.x, y: n.y, width: n.w, height: n.h, radius: n.r,
      sysType: (n.type === 'rect' || n.type === 'circle') ? undefined : n.type,
      fillColor: n.fill === 'none' ? undefined : (n.fill ?? 'white'),
      strokeColor: n.stroke ?? 'black',
      strokeWidth: n.strokeWidth,
      text: typeof n.text === 'string'
        ? { content: n.text, fontSize: 16, fontFamily: 'sans-serif', color: 'black' }
        : n.text,
    }));
    const edges = (data.edges ?? []).map((e: any) => {
      const start = parsePin(e.from), end = parsePin(e.to);
      return {
        id: e.id, type: 'line',
        x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
        strokeColor: e.stroke ?? 'black', strokeWidth: e.strokeWidth,
        arrowStart: e.arrowStart, arrowEnd: e.arrowEnd,
        attachment: (start || end) ? { start, end } : undefined,
      };
    });
    shapes = [...nodes, ...edges];
  } else {
    throw new Error('Unrecognized whiteboard file format');
  }

  if (data.camera) {
    const cam = this.camera;
    cam.x = data.camera.x; cam.y = data.camera.y; cam.scale = data.camera.scale;
  }

  this.loadShapes(JSON.stringify(shapes));
  this.recordHistory();                     // a loaded file is one undo checkpoint
}
```

Geometry sanity filter (v2 route only): before the node/edge mapping, drop entries without the
finite numeric geometry required by the format rules, counting the drops. `load()` returns
`{ loaded: number, skipped: number }` (the v1.x routes always report `skipped: 0`) so the popup
can surface partial success. A malformed entry must never fail the whole load — the
`JSON.parse` throw remains the only hard failure.

---

### Phase 2 — Save/Load popup UI

#### [MODIFY] `src/Whiteboard.ts` (menu buttons)

```diff
         <button data-action="redo" title="Redo (Cmd+Shift+Z)" ...>...</button>
+        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
+        <button data-action="save" title="Save JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px">&#128190;</button>
+        <button data-action="load" title="Load JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px">&#128194;</button>
```

Wired in the existing `data-action` delegation (`Whiteboard.ts:327-333`), alongside undo/redo.

#### [MODIFY] `src/Whiteboard.ts` (popup)

Built once in the constructor, elements held as **private fields** (`this.$popup`,
`this.$popupTextarea`, `this.$popupConfirm`, `this.$popupCancel` — the `$undoBtn` pattern; no
hard-coded DOM ids, which would collide across Whiteboard instances). Overlay div at
`position:absolute; inset:0; background:rgba(0,0,0,0.5); z-index:2000` in `this.$wrapper`;
shown/hidden by toggling `display` between `'flex'` and `'none'` (flex is required for the
centering styles to apply). Inner panel: textarea (monospace, `flex:1`) + Cancel / Load buttons.

Behavior:
- **Save click:** `commitTextEditIfAny()` first (an open textarea's text is only committed on
  blur — precedent: wheel/resize handlers, `Whiteboard.ts:255-260`), then
  `JSON.stringify(JSON.parse(this.save()), null, 2)` into the textarea, textarea `readOnly`,
  Load button disabled (not hidden — no layout jump), textarea focused and selected for easy
  copy.
- **Load click:** `commitTextEditIfAny()` first (mirrors Save — otherwise a hidden open editor
  makes the confirm's gate refuse with no visible cause), then empty editable textarea
  (focused), Load button enabled.
- **Load confirm:** no-op unless `canApplyHistory()` — with the edit committed on open, this now
  guards only the genuinely un-committable states (mouse held, draw mid-gesture);
  `try { this.load(text) } catch` — on error, red border + keep the popup open; on success,
  close — unless `skipped > 0`, in which case keep the popup open with a non-error notice
  ("Loaded N shapes, skipped M malformed entries") so partial success is never silent.
- **Escape closes the popup** via a keydown listener **on the popup itself** — `isActive` is
  false while the pointer is over the popup (it covers the canvas), so the document-level
  handler won't do it. The listener stops propagation, so popup typing never reaches the
  whiteboard shortcuts. Keydown only bubbles to the popup while focus is inside its subtree —
  hence the focus-on-open rule above; the panel div gets `tabindex="-1"` and backdrop clicks
  refocus it, so Escape has no dead corner.
- Cancel and backdrop click close without action.

#### Final step — documentation & build (repo convention)

- Update **CLAUDE.md**: `save()`/`load()` description (v2 semantic format, three-format load
  detection), `sysType` on RectangleComponent, the Save/Load popup in the Input Flow and Current
  Features sections; remove the stale TODO line describing `save()/load()` as v1.1.
- Add a **CHANGELOG.md** entry for the milestone.
- Run `npx tsc --noEmit` (the authority over the LSP for this repo's
  `strictFunctionTypes: false`) and `npm run build` so the checked-in `dist/demo.js` reflects
  the feature.

## Verification Plan

### Automated Tests

#### [NEW] `src/__tests__/serialization.test.ts` (vitest — the repo's runner)

Phase 1:
1. **v2 export:** board with a Gateway (SYS), a plain rect, a circle, and a connection line
   between two of them → `save()` output has `"v": 2`, integer coordinates, `type: "gw"` on the
   Gateway, `from`/`to` in `"entityId:handleId"` form, and no `fill`/`stroke` keys on
   default-colored shapes.
2. **v2 import:** `load()` of a hand-written v2 document → correct entities with preserved ids,
   `sysType` restored, `LineAttachmentComponent` populated with **both** `entityId` and
   `handleId`, and after one `world` frame the endpoints sit on the shapes' connection points
   (proves LineAttachmentSystem can re-pin).
3. **v1.1 fallback:** current-format `{version:"1.1", camera, shapes:[...]}` file loads with
   camera restored — the format `save()` emitted until this change must not load as an empty
   board.
4. **v1.0 fallback:** bare legacy array (single `color` field) loads.
5. **Roundtrip:** `save()` → clear board → `load()` → `save()` produces identical output
   (clear via `world.removeEntity(id)` directly — no `deleteSelection()` dependency in a
   serialization test).
6. **Undo byte-stability:** `saveShapes()` output is byte-identical before and after a `save()`
   export (proves the undo seam was untouched); undo after load restores the pre-load board.
7. **Duplication:** Cmd+D on a SYS shape → the copy's `RectangleComponent.sysType` matches;
   the next export keeps `type: "gw"`.
8. **Delete → undo:** a recreated SYS shape still exports with its semantic type (sysType
   survives the loadShapes recreation path).

Phase 2:
9. **Error path:** pasting invalid JSON and confirming leaves the board untouched and shows the
   error state.
10. **Gating:** opening Load while a text edit is open commits the edit (the loaded state
    replaces the committed board, one history step each); Load confirm during a held mouse
    press is refused.
11. **Malformed entries:** a v2 document with one geometry-less node among valid shapes loads
    the valid shapes, reports `{ skipped: 1 }`, and never throws.

Execute via `npm run test`.

### Manual Verification
1. Draw a Gateway (SYS panel) and a plain rectangle; connect them with a line dragged from a
   connection handle; type custom text into the plain rect.
2. Cmd+D the Gateway — the copy must keep its semantic type.
3. Click Save: popup shows pretty-printed v2 JSON — `"v": 2`, integer coordinates, `type: "gw"`
   on both gateways, edges with `"from"/"to": "id:handle"`, no `fill`/`stroke` noise on
   default-colored shapes.
4. Copy the JSON; delete all shapes; click Load, paste, confirm: the board reconstructs exactly —
   drag a shape and verify the connected line follows (attachments re-pinned with handles).
5. Undo: the board returns to its pre-load state; redo re-applies the load.
6. Zoom to 8×, nudge a shape by a fraction of a world unit, undo/redo — no integer snapping
   (rounding is export-only).
7. Paste garbage into Load and confirm: error state, board untouched.
8. Open a text edit, click Save without clicking away first: the exported JSON contains the
   in-flight text (commit-before-save).
