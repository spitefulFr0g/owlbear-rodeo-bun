---
status: accepted
---

# One item model, adopted after storage, with no migration of placed state

Tokens, drawings, fog and notes are four unrelated types inside one room state object, so drawings and fog cannot be selected or moved, and scenes, per-item sync and extensions have nothing common to build on. We decided to replace them with a single item type, to do it after server storage, accounts and roles rather than before, and to not migrate what is already placed on a map when the change lands. Storage goes first because a durable, safe host matters more to the table than canvas changes, and the largest rewrite in the plan should not sit in front of it.

To make that order safe, the server persists room state as an opaque, versioned document. It stores and returns the document without depending on what is inside it. When the item model arrives it writes a new version, and rooms holding the old version start empty.

Images are treated differently from placed state. The built-in maps and tokens, and the library already uploaded in the browser, are carried over and offered as defaults.

## Considered options

- **Item model first, so the stored shape is designed once.** Rejected once placed state was judged disposable: with nothing to migrate, storing the old shape for a while costs nothing.
- **Migrating placed state through the existing upgrade path.** Rejected as a medium-sized piece of work protecting data that is cheap to redo by hand.
- **Keeping the four types for good.** Rejected because it rules out scenes, per-item sync and extensions, and leaves drawings and fog as draw-then-erase.

## Consequences

- The server cannot check permissions or validate changes by reading inside the room state until the item model exists, or it must do so through a narrow, versioned seam that is rewritten with it.
- Anything a table has placed in a room is lost at the changeover, so the release that brings the item model must say so plainly.
- Existing `.owlbear` exports will not open in the new shape.

Full detail: [Decide whether to adopt the unified item model (section A)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/11#issuecomment-5977413362).
