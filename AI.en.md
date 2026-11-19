# Editing maps with AI — Suzerain: Free Fantasy Map Editor

The editor does not call an AI itself. The user presses **AI**, writes a request and copies it together with all the context.
They then give the text to any AI: Claude, ChatGPT, Gemini, a local model or an agent.
The user pastes the AI reply back. The editor shows the changes “before / after” with highlighted spots, and the user **saves** or **discards** them.

This file describes what the AI receives and what it must return. Agents can read it from here or from the repository (Ukrainian version: [AI.md](AI.md)).

## What the AI receives

- The user request.
- The map size `W × H` in pixels. Coordinates: `x` to the right, `y` down, `(0, 0)` is the top-left corner.
- Which part of the map is on screen and what is selected (id).
- The map: either in full (JSON) or as a summary (id, type, bounds of each shape) plus the selected shapes in full.

## Map format (short)

```js
{
  W, H, seed, name,
  settings: { scatter, scatterTrees },
  shapes: [ { id: 's7', kind, shape: 'poly' | 'ellipse' | 'line', pts: [[x, y], ...] | cx, cy, rx, ry, rot, ...parameters } ],
  stamps: [ { id: 'd12', type, x, y, size, rot, label, labelSize } ],
  texts:  [ { id: 'd30', x, y, w, h, text, size, font, align, bg, italic, bold } ]
}
```

| kind | what it is | parameters |
|---|---|---|
| `land` | land (the coast is smoothed; pin corners outside the map with two points ~100 px from the corner) | — |
| `lake` | lake | — |
| `mountain` | mountains | `min` 12–80, `max` 20–160, `density` 0.2–2 |
| `forest` | forest | `trees`: conifer, broadleaf, mixed, palm, jungle, dead; `tree` 6–24 (size), `density` 0.1–2 |
| `terrain` | landscape | `terrain`: snow, tundra, steppe, meadow, hills, marsh, desert; `density` 0.1–3; for hills `size` 12–70 |
| `vill` / `town` / `fort` | village / town / fortress | `density`, `scale` 0.4–3; village `fields` 0–3; town/fortress `wall`, `wallMode`: land, always, never |
| `stain` | ink or paint stain | `color` `#rrggbb`, `opacity` 0.05–1, `blur` 0–40 |
| `region` | generation area (not drawn) | `streams`, `ponds`, `marsh`, `pull` |
| `river` | river (`shape: 'line'`) | `width` 1–30 (up to 4.5 — a single line), `taper` |
| `road` / `rail` / `path` | road / railway / dashed trail (`shape: 'line'`) | `width` 0.4–3 |

Polygons close themselves; do not repeat the first point. Shape order matters only for overlaps.

## What the AI must return

A short explanation and **exactly one** ` ```map-patch ` block with an array of operations. Do not return the whole map: it is long and expensive, and easy to lose something. Shapes, stamps and labels are addressed by `id`. Write labels and names in the user’s language.

```map-patch
[
  {"op": "transform", "id": "s7", "scale": 1.15},
  {"op": "transform", "id": "s29", "dx": 120, "dy": -40, "rotate": 10},
  {"op": "set", "id": "s29", "fields": {"trees": "broadleaf", "density": 1.4}},
  {"op": "add", "shape": {"kind": "terrain", "terrain": "snow", "shape": "poly", "pts": [[400, 80], [1200, 60], [1150, 380], [380, 420]], "density": 1}},
  {"op": "add", "stamp": {"type": "tower", "x": 1500, "y": 700, "size": 54, "label": "Watchtower"}},
  {"op": "delete", "id": "s1941"},
  {"op": "map", "fields": {"settings": {"scatter": 1.5}}}
]
```

| op | what it does |
|---|---|
| `transform` | `scale`, or separately `scaleX` / `scaleY`, plus `dx`, `dy`, `rotate` (degrees) around the shape center or the point `origin: [x, y]`. The best way to make a shape bigger, smaller, move or rotate it. |
| `set` | replace fields of a shape, stamp or label, including `pts`. The `id` field cannot change. |
| `add` | `shape`, `stamp` or `text`. No `id` needed: the editor assigns one. Missing parameters get default values. |
| `delete` | delete by `id`. |
| `map` | `name`, `seed`, `settings` (merged with the existing ones). |

The editor checks every operation. It skips invalid ones and lists the problems, and lets the user preview the rest “before / after”.
If the AI still returns a whole map (`{"shapes": [...]}`), the editor accepts it too and highlights the difference.
