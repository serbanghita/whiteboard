# wipbin.com — Design Document

> **Living document.** This is the product/UX specification for wipbin: what the whiteboard
> should be, independent of what is built today. `CLAUDE.md` documents how the current code
> works; this file documents intent. Whenever a feature lands, changes, or is descoped,
> update the matching section and its status marker in the same change.
>
> Status legend: ✅ implemented · 🚧 partially implemented · ❌ not implemented (planned)

wipbin is a whiteboard app that works online, on-prem, or as a stand-alone app.
The services are totally free for individuals. Companies need a license to operate it
on-prem.

Real-time collaboration/multiplayer is intentionally **out of scope for this document**
(it is WIP in the client + a private server repo); it will get its own design doc. This
file covers the single-user whiteboard UX.

## Whiteboard philosophy

The whiteboard is very simple — KISS — with UX similar to Miro.com.
Top priority is an **excellent UX**.
The goal is to quickly prototype a flow, mindmap, or system design.

## Whiteboard entities

The whiteboard contains only primitive entities: `Rectangle`, `Circle`, `Line`, `Text`.
Rectangles and circles can contain text. All primitives have custom style properties.

### `Rectangle` ✅

| Property | Status |
|---|---|
| Stroke Color | ✅ (24-color palette) |
| Stroke Style (solid / dashed / dotted) | ✅ |
| Stroke Thickness (4 levels) | ✅ |
| Fill Color | ✅ (24-color palette incl. No color) |
| Text | ✅ (double-click to edit, wrapped + centered) |
| Width, Height | ✅ |
| Position | ✅ |

### `Circle` ✅

| Property | Status |
|---|---|
| Stroke Color | ✅ (24-color palette) |
| Stroke Style | ✅ |
| Stroke Thickness | ✅ |
| Fill Color | ✅ |
| Text | ✅ |
| Radius | ✅ |
| Position | ✅ |

### `Line` 🚧

| Property | Status |
|---|---|
| Stroke Color | ✅ (Stroke popover on the line's panel) |
| Stroke Style | ✅ |
| Stroke Thickness | ✅ |
| Start, End points | ✅ (individually draggable endpoints) |
| Start/End caps: None \| Arrow | ✅ |
| Type: Straight (default) | ✅ |
| Type: Square (right-angle elbow routing, 90° corners like flowchart connectors) | ❌ |
| Type: Bezier | ❌ |

A line's geometry is fully defined by its Start/End points (plus routing type); it has no
independent Position property.

### `Text` ❌ (standalone entity — not implemented)

Free-standing text placed directly on the board (distinct from text *inside* a shape).

| Property | Status |
|---|---|
| Text content | ❌ |
| Text Color (from the palette — no stroke/outline/fill; KISS) | ❌ |
| Font size | ❌ |
| Position | ❌ |

## Color palette ✅

The single palette used everywhere a color is picked (stroke, fill, text). 6 rows × 4.
Implemented in `src/palette.ts` (single source of truth; legacy stored values normalize
to their nearest palette color for highlighting/default-omission). "No color" applies to
**fills only**, for now — an absent stroke renders as the default stroke, so the stroke
picker offers 23 colors.

| Row | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | No color (transparent; shown as white swatch with a diagonal line) | Light Yellow `#FAEC9C` | Peach `#F6C198` | Light Pink `#FCB9BE` |
| 2 | Mint Green `#A5E6B7` | Sky Blue `#B4D3FD` | Lavender `#D7CCFE` | Golden Yellow `#FDCC3F` |
| 3 | Orange `#FE9D48` | Coral Red `#F95B60` | Bright Green `#3CD457` | Medium Blue `#5F99F9` |
| 4 | Purple `#8D76FB` | Ochre/Bronze `#B18F12` | Brown `#9F5117` | Crimson Red `#BB0B0B` |
| 5 | Forest Green `#107C2E` | Dark Blue `#2D59AD` | Deep Purple `#6725CC` | White `#FFFFFF` (gray border on the swatch) |
| 6 | Light Gray `#E1E1E1` | Medium Gray `#AFAFAF` | Dark Gray `#595959` | Black/Very Dark Gray `#202020` |

## Whiteboard entities — interactions

- `Rectangle`, `Circle` and `Text` can be connected via 4 points (n, e, s, w) with a
  `Line`. ✅ for Rectangle/Circle · ❌ for Text (blocked on the Text entity)
- A previously connected `Line` can be disconnected (drag an endpoint off, or drag the
  line body to detach both ends). ✅
- A `Line` nearing a connectable shape automatically snaps to the closest connecting
  point (topmost shape whose bounds, inflated by a screen-constant radius, contain the
  cursor). ✅

## Whiteboard entity — panel

Each entity, when selected, shows a panel **40px above** the entity by default; if the
viewport doesn't permit that, the panel is automatically placed **below** the entity. ✅

The panel exposes all the entity's style properties as items (icon or text). **Each icon
must depict the property's current value.** ✅ (icon bar + popovers; one popover open at
a time, Escape/outside-click closes, panel repositioning never closes an open popover)

- **Stroke** ✅ (all shapes, lines included)
  - Icon: an empty square whose border shows the current stroke color, width AND style.
  - Clicking opens a popover below the icon with sections:
    - **Stroke Color** — the pre-defined palette (without "No color")
    - **Stroke Thickness** — a slider with 4 thickness levels (world widths 1/2/4/6;
      level 1 is stored as the absent key)
    - **Stroke Style** — 3 icon options: Solid line, Dashed line, Dotted line
      (solid is stored as the absent key)
- **Fill** ✅ (rect/circle)
  - Icon: a square filled with the currently selected fill color (diagonal-line glyph
    when transparent).
  - Clicking opens a popover below the icon with:
    - **Fill Color** — the full palette; "No color" clears the fill (absent key)
- **Line Start / End** ✅
  - Icon: a square depicting the current value (arrow glyph or —).
  - Clicking opens a popover below the icon with options:
    - **None** — textual
    - **Arrow** — an arrow pointing left or right depending on whether it's Start or End
- **Line Type** ❌ — Straight | Square | Bezier picker (needed once the routing types
  exist; icons depicting each routing)

## Left panel

A floating panel with the following groups:

**Default group** ✅ (Text tool ❌)

- Cursor
- Square
- Circle
- Line
- Text ❌ (tool for placing the standalone Text entity)

**SYS group** ✅

- SYS button — when clicked, opens a sub-panel to the right of the left panel with the
  17 system-design primitives (importance order):

```
  { id: "client",   title: "Client",           label: "Client" },
  { id: "server",   title: "Server",           label: "Server" },
  { id: "db",       title: "Database",         label: "DB" },
  { id: "cache",    title: "Cache",            label: "Cache" },
  { id: "lb",       title: "Load Balancer",    label: "LB" },
  { id: "gw",       title: "Gateway",          label: "GW" },
  { id: "queue",    title: "Queue",            label: "Queue" },
  { id: "cdn",      title: "CDN",              label: "CDN" },
  { id: "objstore", title: "Object Storage",   label: "Object Store" },
  { id: "worker",   title: "Worker",           label: "Worker" },
  { id: "stream",   title: "Stream / Pub-Sub", label: "Stream" },
  { id: "extapi",   title: "External API",     label: "External API" },
  { id: "search",   title: "Search Index",     label: "Search" },
  { id: "dns",      title: "DNS",              label: "DNS" },
  { id: "monitor",  title: "Monitoring",       label: "Monitoring" },
  { id: "cron",     title: "Scheduler / Cron", label: "Cron" },
  { id: "auth",     title: "Auth / Identity",  label: "Auth" },
```

**Undo/Redo group** ✅

- Undo (left) button
- Redo (right) button

**Save/Load group** ✅

- Save button
- Load button

## Color picker

The color picker only ever offers the set of pre-defined colors from the
[Color palette](#color-palette) — no free-form color input. ✅

## Undo/Redo ✅

The whiteboard remembers the actions performed by the user and can go back and forth in
history. Every completed action is exactly one undo step; snapshots are differential so
line attachments and z-order survive.

## Save/Load ✅

The whiteboard saves to a JSON format describing the current board state, and an existing
whiteboard can be imported from the same format (current format: v2 semantic JSON with
`nodes`/`edges`; older v1.1/v1.0 files still load).

The **secondary goal** of the JSON format is to be a good format for tools and LLMs to
convert, analyze, and process the diagram: semantic node types (`server`, `db`, …),
human-readable pins (`"entityId:handleId"`), defaults omitted.

New style properties (stroke style/thickness, line type, palette colors, Text entities)
must be added to this format as they land, keeping the same defaults-omitted discipline.

## Implementation roadmap

Ordered by priority. Each phase should become a plan folder (project plan-execute flow)
when picked up; update the status markers above as items land.

### Phase 1 — Styling ✅ (done; plan `styling-palette-stroke-panel`)

1. ✅ Palette module `src/palette.ts` (ids/hex/labels, "no color" sentinel, legacy
   normalization, canonical draw defaults `#FFFFFF`/`#202020`).
2. ✅ `strokeStyle` + `strokeWidth` on all three shape components, absent-key canonical
   (a no-op toggle produces a JSON-identical shape record — no phantom actions in the
   history/action differ, nothing broadcast to peers).
3. ✅ Renderer: variable width was already quad-based; dashed/dotted added via the pure
   `src/renderer/strokeGeometry.ts` (continuous phase across corners, arrow-base trims)
   with all dash quads/dots batched into ONE draw call per stroke; thick strokes
   miter-by-overlap at corners; thick-line hit tolerance covers the visible edge.
4. ✅ Panel redesign (see "Whiteboard entity — panel"); thickness slider commits on
   `change` only.
5. ✅ Serialization: v2 export/import, defaults omitted (compare-only normalization so
   legacy boards are never recolored on export); old files load.

Known/accepted: the tight selection box ignores stroke width, so a thick stroke pokes
half its width outside the box (cosmetic; revisit only if it bothers users).

### Phase 2 — Text entity

1. `Text` as a standalone primitive: content, palette text color, font size, position;
   drawn via the existing text raster pipeline.
2. Text tool in the left panel Default group; click-to-place, immediate edit, empty
   commit removes the entity.
3. Selection/drag/delete/duplicate/undo parity with other shapes; connection points
   (n/e/s/w on the text bounds) so lines can attach.
4. Serialization as a v2 node type.

### Phase 3 — Line types

1. `Line.type`: `straight` (default, absent key) | `square` | `bezier`.
2. Square: right-angle elbow routing between endpoints (respecting attachment sides);
   Bezier: curved rendering with sensible default control points.
3. Hit-testing, arrowhead orientation, and snapping per routing type.
4. Type picker in the line's panel; serialization of the type.

### Later / separate docs

- Collaboration/multiplayer (WIP in client + private server repo) — own design doc.
- Licensing/on-prem distribution mechanics.
