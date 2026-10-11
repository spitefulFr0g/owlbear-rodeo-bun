---
status: accepted
---

# A world unit is a pixel, and a grid cell is a fixed number of them

Positions on today's canvas are fractions of the map image, so nothing can sit off the map and a room with no map has no coordinates at all. A scene is unbounded and may hold no map, so positions need a unit of their own. We decided that a world unit is a pixel, and that the scene's grid says how many units one cell is, 150 by default. An image item keeps its natural size in units. A map is scaled so that its drawn cells match the scene's cells. The origin has no meaning: it is where the first map's top-left corner happened to be placed.

The other choice was one unit per grid cell. Pixels won because every image and every stroke already has a size in pixels, while a cell has no single length on a hex grid. It is also the unit `@owlbear-rodeo/sdk` uses, which costs nothing now and keeps the undecided question of loading its extensions open.

## Considered options

- **One unit per grid cell.** Rejected because every image, stroke width and font size would need a scale of its own, and a hex cell is not one length.
- **Positions as fractions of the scene's map, as today.** Rejected by ADR 0003: a scene can have no map, or several.
- **An origin fixed at the centre of the first map.** Rejected because nothing reads the origin, so giving it a meaning only adds a rule to keep.

## Consequences

- Swapping a scene's map never moves or resizes anything else in the scene, because the map is fitted to the grid and not the grid to the map.
- Two maps drawn at different cell sizes cannot both be at their natural size in one scene. One is scaled.
- Changing the number of units in a cell after items are placed would move the grid under them. The interface changes a map's scale to fit the grid, and leaves the cell size alone.
- Every saved position depends on this choice, so changing it later means rewriting every saved scene.

Decided in [Plan v0.3.0: the item model](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/76).
