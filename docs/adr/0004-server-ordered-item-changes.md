---
status: accepted
---

# Items sync as server-ordered changes, not a CRDT

Today the client sends a debounced deep-diff of one whole room state object, and the server applies and relays it without looking inside. Two people editing at once can overwrite each other, and the server cannot tell which item a change touches. The reference's own roadmap answers this with "CRDT sync". We decided instead that every change is an add, update or delete of one item by id, that the server puts changes in order, and that the last write to a field wins. Every change already passes through one server, which must check permissions on it and persist the result. A CRDT solves merging without a server in the loop, which this project never needs, and its merged binary document would make the permission check and the stored shape harder to work with.

Per-item changes are the wire format the item model arrives with, routed per scene. They are not a later step: the item model removes the state object the current diffs are computed over, so keeping the old sync would mean re-pointing it at items and scenes and then discarding it.

## Considered options

- **A CRDT (Yjs).** Rejected because the server is always present to order changes, and it needs to read each change to check permissions.
- **Keeping whole-state diffs over the new item list.** Rejected because conflicts stay invisible and the work is thrown away when per-item changes land.
- **Locking an item while someone holds it.** Rejected because the lock is state that must be cleared when a connection drops mid-drag.
- **Queueing edits made while disconnected and replaying them.** Deferred. It needs rules for edits to items that changed or vanished in the meantime.

## Consequences

- A delete wins over a concurrent edit. The server drops a change to an item that no longer exists.
- Nothing is locked. When two people drag one item, the last release to reach the server sets its position.
- Undo is per person and is sent as an ordinary new change. A step whose item has been deleted by someone else is skipped.
- Joining, reconnecting and switching scene all receive a full snapshot of the scene being viewed. There is no log of missed changes.
- The canvas is read-only while reconnecting, so nothing is edited that could then be lost.
- A client applies its own change at once and sends it when the action finishes. The server can refuse a change, and then sends back the item's real state.
- In-progress drags and rulers are sent as previews that are never stored and never enter undo.

Full detail: [Screen real-time sync (section E)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/16).
