---
status: accepted
---

# Records live in one SQLite database, asset bytes stay as files

Rooms are held in memory today and lost on a restart, and each asset has a small JSON record in its own file. The server is about to keep rooms, accounts and library records for good, and it has to answer questions that cut across them: which library an asset is in, whether a stored file is still used, and how much space a room takes. We decided to keep all of these records in one SQLite database file in the data directory, `owlbear.db`, and to leave asset bytes as files named by their hash under `assets/`.

SQLite is built into Bun, so it adds no dependency and works inside the single executable. The cross-record questions become one query each, and a change that touches several records, such as deleting a room with its images or passing a removed account's rooms to the administrator, happens completely or not at all.

Each room's saved document is one value on that room's row, still opaque to the server as [ADR 0002](0002-item-model-without-state-migration.md) describes. The asset records move into the database when permanent rooms are built, and the existing record files are read in once on the first start.

## Considered options

- **Plain files, one JSON file per room, account and asset.** Rejected because "is this file still used" means reading every room and library or keeping index files that can drift, and a crash partway through a change to several files leaves a state the server would have to detect and repair itself. Being able to read and fix the data in a text editor was the reason to want it.
- **A file per room, with the database holding only the list.** Rejected because a room's row and its file can get out of step, which is the problem the database was chosen to remove.
- **Deciding for rooms now and for accounts and libraries when they are built.** Rejected because it risks two storage mechanisms and two backup procedures.

## Consequences

- The data directory holds `owlbear.db` and `assets/`, and must be on a local disk. SQLite is not safe on a network share.
- The records cannot be read or repaired with a text editor. A SQLite tool is needed.
- The supported backup is to stop the server and then copy the data directory. A copy taken while the server runs is not promised to be usable. A snapshot the server writes itself is left for later.
- A new version upgrades the database by itself at startup, after saving a copy of the old file beside it. One copy is kept, from before the latest upgrade. There is no downgrade: going back means restoring that copy. The server refuses to start on a database written by a newer version.
- The server refuses to start when the database is damaged, and never starts empty over existing data. It also refuses when another server is already using the same data directory.
- Until the libraries are built, the database records which rooms have used each asset, noted when someone in the room uploads or loads it. Room sizes and the clean-up on deleting a room are worked out from that record, and library membership ([ADR 0005](0005-assets-belong-to-a-room-or-an-account.md)) replaces it.
- Moving to another store later means writing a converter for every host's data, so this is a choice to keep.

Full detail: [Decide how the server stores rooms, accounts and library records](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/26).
