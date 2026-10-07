---
status: accepted
---

# Assets belong to a room, with a smaller account library

Today the image library lives in each browser's IndexedDB, and the server stores assets by hash for a room without any idea of a library. The reference keeps one library per user, split by hand into collections. We decided that every asset belongs to exactly one library, and that there are three kinds: a room library, an account library, and a read-only server set. An image uploaded in a room goes into that room's library. The GM moves the few images they reuse everywhere into their account library, which is visible in every room they run. A room is one campaign at this table, so the room library is where a campaign's maps and monsters naturally sit, and it can be deleted with the room without touching anything else.

Players are anonymous, so they have no library. With the room's upload toggle on, a player's upload is a room asset that the GM can see and delete. A player's dock shows the server set and their own uploads, never the room library or the GM's account library.

## Considered options

- **One library per account, as in the reference.** Rejected because every campaign's images would pile into one list, and deleting a room would leave its images behind.
- **Collections that the GM creates and switches between.** Rejected because the room already is the grouping. A collection would be a second thing to create, name and remember to switch.
- **A campaign above the room, holding the library.** Rejected because nothing at this table needs two rooms sharing one library.
- **Copying an image into the account library.** Rejected in favour of moving it, so one image has one home and no copies drift apart.

## Consequences

- Storage keeps a library per room and per account, plus the server set, and records which library each asset is in.
- Deleting an asset removes it from its library only. Placed items keep working, and the stored file is dropped once no library and no scene uses it, so the server has to know what is still in use.
- Deleting a room deletes its library. Account assets placed in that room are untouched.
- The maintainer's existing browser library is imported into their account library. The built-in maps and tokens become the server set.

Full detail: [Screen asset manager and image features (sections F and G)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/17).
