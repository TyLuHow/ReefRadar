# Phase 6: Instrument Shell & Atlas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 6-Instrument Shell & Atlas
**Areas discussed:** Workspace layout, Map vs sound-space

---

## Workspace layout

### Desktop arrangement

| Option | Description | Selected |
|--------|-------------|----------|
| Map-led, Inspector docked | Filter rail on the left, map in the centre, Inspector docked on the right, Bench strip at the bottom | ✓ |
| Equal split, map and table | Map and table side by side, Inspector below | |
| Inspector-led (Restor-style) | Wide swapping panel on the left, map on the right, Bench inside the panel | |

### Map and table

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle in the same slot | Map and Table share the centre slot, one at a time, with the same data and selection | ✓ |
| Table under the map | Resizable table drawer below the map | |
| Table replaces the filter rail | Compact table on the left doubles as filters | |

### Tablet and phone Inspector

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom sheet | Half height, drags to full; filters behind a button | ✓ |
| Right overlay panel | Slides over the map | |
| You decide | Claude picks per breakpoint | |

### Structural alternatives for the design gate (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Sound-space First | The projection is the home view | ✓ |
| Specimen Drawer | A contact sheet of 54 spectrogram tiles | ✓ |
| The Score | Recordings as staves with a shared playhead | ✓ |
| Investigation Docket | A notebook of frozen instrument states | ✓ |

**User's choice:** all four. Research had suggested holding The Score for Phase 7 and the Docket for Phase 15; the owner wants all four at this gate.

---

## Map vs sound-space

### Opening lens

| Option | Description | Selected |
|--------|-------------|----------|
| Geographic first | Opens on the map with a "By place / By sound" toggle | ✓ |
| Sound-space first | Opens on the PCA projection | |
| Decide after the design gate | Build both, choose later | |

### Location-only sites in sound-space

| Option | Description | Selected |
|--------|-------------|----------|
| Labelled tray | Hollow marks in a "No acoustic position" strip, still selectable | ✓ |
| Fade out | Hidden in sound-space, with a note | |
| Stay at map position, greyed | Mixes two coordinate systems | |

### Caveat prominence

| Option | Description | Selected |
|--------|-------------|----------|
| Method line always on | Permanent one-line method legend; full-dimension nearest list is the authority | ✓ |
| Method line + first-time explainer | Adds a dismissible inline explainer | |
| Compact chip with details on demand | "33% ⓘ" chip, full method in the Why panel | |

### Morph animation

| Option | Description | Selected |
|--------|-------------|----------|
| Marks glide, basemap fades | ~600–800 ms glide, selected ring kept, instant under reduced motion | ✓ |
| Cross-fade only | No travelling marks | |
| Staggered glide by status | Waves by label | |

### Hover behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Label chip only | Site id, status shape + word, dataset | ✓ |
| Chip + hover-to-hear | Plays a short excerpt on hover | |
| Chip + mini spectrogram | Silent thumbnail | |

---

## Claude's Discretion

- What the Bench area shows before Phase 7.
- Route naming (`/explore`) and when the legacy routes redirect, subject to `CAPABILITY-MATRIX.md`.
- URL format (nuqs; readable params; history push on selection).
- Semantic zoom details, filter-card anatomy, panel widths, how the sound-space overlay renders, and the Inspector's empty state.

## Deferred Ideas

- Hover-to-hear and thumbnail previews: possible with the Specimen Drawer direction or in Phase 7.
- A first-time sound-space explainer: not chosen.
