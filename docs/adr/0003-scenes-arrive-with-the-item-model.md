---
status: accepted
---

# Scenes hold items in world units, and arrive with the item model

Today the canvas is one map image: its size sets the bounds, positions are relative to it, and the grid is a property of it. Nothing can be placed off the map, and a room with no map has no canvas. We decided that items live in a scene, an unbounded canvas with its own grid, with positions in world units, and that a map is an ordinary locked image item on the Map layer. We also decided to build that core in the same step as the item model, not after it. The item model already discards placed state, so choosing the coordinate system at that moment needs no conversion. Choosing it later would mean rewriting every stored position and grid, with placed state that people care about.

A room holds its scenes. One of them is the open scene, which is what the players see. The GM can view and edit any other scene without moving the players, and moves them with an explicit "show to players" action. There is no lock to set and clear.

The scene library, the one-step importer and the Scene Controls menu come after the item model. Until the library exists, a room has exactly one scene.

## Considered options

- **Item model first with map-relative positions, scenes later.** Rejected because it turns a free choice into a migration.
- **Scenes owned by an account and opened in a room, as in the reference.** Rejected because a room is one campaign at this table. Copying a scene between rooms can be added later.
- **One scene for everyone, GM included.** Rejected because the GM wants to adjust the next scene while the players stay on the current one.
- **A lock on the player view.** Rejected in favour of the explicit action, which has no state to forget to undo.

## Consequences

- The server keeps more than one scene live per room, and sends each person only the changes for the scene they are viewing.
- A scene has one grid. Two maps drawn at different grid sizes cannot both be at native size in one scene.
- "Map" narrows to mean a picture. Interface text that says map and means the whole canvas changes to scene.

Full detail: [Decide whether to adopt scenes (section B)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/15).
