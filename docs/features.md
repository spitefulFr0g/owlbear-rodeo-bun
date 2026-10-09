# Features and roadmap

What this fork will build, what it will not, and in what order.

Every feature in the features reference was screened and given a verdict. The reference is a comparison of this codebase against the current Owlbear Rodeo app and its extension SDK, written on 2026-10-03. It is kept outside the repo, so this file repeats each of its rows.

The screening was done as a set of decisions on the issue tracker, indexed by [Map: screen the features reference and set the roadmap](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/9). Each section below links to the decision that holds the reasoning. Words such as room, scene, item and cast display are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## How features were screened

- **Goal:** a Bun and TypeScript server that anyone can host themselves, shipped as a single executable.
- **Audience:** the maintainer's own table first, built so that someone else could host it.
- **Rule:** server-first. Features that make the server a complete, durable and safe host are favoured. Canvas features were judged one by one on "would my table use this".
- **Renderer:** the canvas stays on Konva. Features that need a Skia or WebGL renderer are out of scope.

### Verdicts

| Verdict | Meaning |
| --- | --- |
| **In** | Will be built. The Step column says where it sits on the roadmap. |
| **Have** | In, and already works. It is kept as it is. |
| **Later** | Wanted, not scheduled. |
| **Out** | Not being built. |

A row with a split verdict names which part is which.

## Roadmap

Ten steps in build order, grouped into releases. Steps 1 to 5 run on today's canvas. Step 6 is the one large rewrite. Steps 7 to 10 build on it.

v0.1.0 and v0.2.0 are firm. The grouping after v0.2.0 is a forecast, and the order of steps 8 to 10 is decided again once v0.3.0 is done.

### v0.1.0: the shared screen

| Step | What is built |
| --- | --- |
| 1. Remove peer-to-peer | Audio sharing and every peer-to-peer connection are removed, with the server's signal relay. The server becomes the only path between clients ([ADR 0008](adr/0008-the-server-is-the-only-path-between-clients.md)). |
| 2. Cast display | A display link opens a room as a cast display: a view-only connection with no interface that is not listed as a player ([ADR 0007](adr/0007-cast-display-is-its-own-connection.md)). It follows the GM's view, and the GM can freeze it. A button opens the link in a popout window. |

Decided for this release:

- **Display link:** it carries an unguessable token that the server makes for the room, so a cast display opens with no password prompt. Anyone holding the link sees what a player sees and can change nothing. Until rooms are saved in step 3, a server restart makes a new link.
- **Whose view:** there is no GM role yet, so the cast display follows whoever owns the current map, and only that person sees the popout button. The GM role replaces this rule in step 5.
- **Screen shape:** the cast display zooms so that everything the GM can see is on it, and shows more of the map at the sides when its shape differs.
- **Hidden tokens:** the server still sends them to every browser until step 6. A cast display does not draw them, as a player's browser does not today.
- **No stopgap for access:** until accounts exist, anyone who can reach the port can create a room and upload. v0.1.0 is for a home network only, and its release notes say so.
- **Version numbers:** the fork restarts at 0.x. The frontend and backend packages are both set to 0.1.0.
- **Released means:** a git tag, and a GitHub release with Linux and Windows executables attached, built by hand with the existing build script. Automated release builds are Later.
- **Also in this release:** the tooling cleanup left from the single-executable work (lint, typecheck on a fresh clone, dead deploy config, the inherited workflow that closes every pull request).

### v0.2.0: a durable and safe host

| Step | What is built |
| --- | --- |
| 3. Permanent rooms | A room is saved to the data directory as an opaque, versioned document a few seconds after each change, and is kept until its GM deletes it. A copy of the data directory is the supported backup, and this is documented. |
| 4. Accounts and the room list | First-run setup of the administrator, sign-in, invite and reset links. Creating a room needs an account ([ADR 0001](adr/0001-accounts-gate-creation.md)). The room list creates, renames, opens and deletes rooms and shows each room's size. Rooms get a random id in their link and a name the GM can change. Invite Players copies the link. An administrator sees every room and the server total, can delete any room, and takes over the rooms of an account they remove. |
| 5. Roles, first build, and sessions | GM, trusted player and player. Player colour. The room switches, checked on the server, which refuses room and scene settings changes from anyone but the GM. The session, started and ended by the GM, and the default welcome screen that players and cast displays see outside one. |

Steps 3 and 4 always ship in the same release. Saved rooms without accounts would make every room created by visiting a link permanent, with nobody able to list or delete them.

### v0.3.0: the item model

| Step | What is built |
| --- | --- |
| 6. Item model, scene core and per-item sync | Built as one step, because all three replace the same state. One `Item` type with five kinds and an explicit layer ([ADR 0002](adr/0002-item-model-without-state-migration.md)). The scene as an unbounded canvas with one grid and positions in world units; a room has exactly one scene until step 8 ([ADR 0003](adr/0003-scenes-arrive-with-the-item-model.md)). Server-ordered changes per item ([ADR 0004](adr/0004-server-ordered-item-changes.md)). Per-item permission checks, hidden items withheld by the server ([ADR 0006](adr/0006-hidden-items-are-seen-by-creator-and-gm.md)), Owner Only and locked items. One selection and transform system, one context menu, the Layer menu and shared undo. Fog and drawings become selectable, with cut and uncut per fog shape. |
| 7. Live play | Drags and rulers seen live by everyone. Movement mode. Presence carries name, colour, role and the scene being viewed, and dice rolls and the timer move onto it. |

Placed 1.0 state (tokens, drawings, fog and notes on a map) is not migrated in step 6 and can be lost.

### v0.4.0: scenes, libraries and tools

| Step | What is built |
| --- | --- |
| 8. Scene library | Create, name, open, edit, delete and switch scenes. The one-step importer with map alignment and the fog fill setting. The Scene Controls menu for the grid, with grid opacity, line width and colour. Show to players, and a one-off "bring players here". Fog Fill. Assigning a scene as the welcome screen. The view-only scene. |
| 9. Libraries and dock | The room library, the account library and the server set ([ADR 0005](adr/0005-assets-belong-to-a-room-or-an-account.md)). A dock along the bottom and one Asset Manager, replacing the token bar and the two pickers. Dropping an image file on the canvas with a type picker. The one-off import of a browser library into the account library. Today's Import / Export dialog and the `.owlbear` file are removed. |
| 10. Small tools | The text tool, with colour and size. Notes and text that start hidden. Adjustable stroke width. Duplicate numbering. Double-click to select a locked item. A check that Space pans mid-shape. |

The asset library stays in the browser until step 9. The reference suggested moving it to the server during the storage work, before the item model. It waits so that the server library is built once, against image types that are layers, and not first against today's separate map and token tables.

The browser library import ships in the release that contains step 9 and is removed in the release after it, with the rest of the browser library code. See [Decide how the existing browser library is imported into the account library](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/27).

### Not scheduled

Everything marked Later, including the extension platform. Nothing marked Out or out of scope is planned.

## Habits for everything built

From [Decide whether to build an extension platform (section N)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/19). They keep an extension platform an addition and not a rewrite:

1. New features store their data in items and item metadata, not in new one-off fields.
2. The server checks every permission. The client is never trusted.
3. When the toolbar is rebuilt for the item model, tools are entries in a list and not hard-coded.

## Open design questions

Decisions that are known to be needed and are not made yet, with the step that needs them.

| Question | Needed by |
| --- | --- |
| Where rooms, accounts and library records live in the data directory: plain files or an embedded database. See [Decide how the server stores rooms, accounts and library records](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/26). | Step 3 |
| How sign-in sessions work, how they relate to the join token, and what limits apply to sign-in attempts. | Step 4 |
| What one world unit is (pixels at a fixed cell size, or grid cells) and where a scene's origin sits. | Step 6 |
| Whether the transport stays on socket.io. | Step 6 |
| Whether extensions written for `@owlbear-rodeo/sdk` should load unchanged. | The extension platform |

## Verdicts by section

| Section | Verdict |
| --- | --- |
| A. Unified item model | In |
| B. Scenes | In |
| C. Storage, accounts and rooms | In |
| D. Roles and permissions | In, except the per-layer permission matrix |
| E. Real-time sync | In |
| F. Asset manager and dock | In |
| G. Images on the canvas | In |
| H. Grid, alignment and measuring | In |
| I. Fog | In |
| J. Dynamic fog (lights and walls) | Out of scope |
| K. Drawing | In |
| L. Text and notes | In |
| M. Presentation | In |
| N. Extension platform | Later |
| P. In the reference but not worth copying | Out of scope |
| Q. In this project but not in the reference | In, except audio sharing |

Section O of the reference listed three decisions to make first. They are settled: the renderer stays on Konva; SDK compatibility is left undecided until the extension platform is picked up; the item model and per-item sync are built together in step 6.

### A. Unified item model

Decision: [Decide whether to adopt the unified item model (section A)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/11).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Single `Item` base type | In | 6 | Replaces the separate token, drawing, fog and note types. |
| Item kinds | In: Image, Shape, Curve, Line, Text. Later: Path, Label, Ruler, Pointer | 6 | The five In kinds cover everything on the canvas today. Fog becomes shapes on the Fog layer. The pointer stays a live-only signal. |
| Fixed layer stack | In: Map through Fog. Later: Post-process, Control, Popover | 6 | An explicit layer on every item replaces the order implied by token category. The three Later layers exist only for extensions. |
| One selection and transform system for every item | In | 6 | Drawings and fog become selectable and movable. |
| One context menu for every item | In | 6 | Replaces the separate token, note and selection menus. |
| Generic attachments, any item to any item | Later | | Attaching by overlap stays as it is. |
| Per-item metadata bag | In | 6 | |
| Accessibility name and description on items | Later | | |
| Shared undo and redo over items | In | 6 | Each person has their own history over all items. |
| Migration from the 1.0 shapes | Out for placed state | | Images are carried over in step 9. |

### B. Scenes

Decision: [Decide whether to adopt scenes (section B)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/15).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Scene as an unbounded canvas, independent of any image | In | 6 | Positions move to world units. |
| Zero, one or many maps in a scene | In. Later: guided alignment for a second map | 6 | A scene can be created empty. Extra maps are dropped on the Map layer and scaled by hand. |
| Scene library: create, name, open, edit, delete, switch | In | 8 | The room holds its scenes. |
| Grid as a scene property | In | 6 | Exactly one grid per scene. A scene with no map still has a grid. |
| Create a scene with a map in one step, with alignment in the importer | In | 8 | Today's map editing flow, pointed at a scene. |
| Importer remembers its last settings | Later | | |
| Scene metadata bag | Later | | Only extensions would use it. |
| Scene Controls menu on the open scene | In for the grid | 8 | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| The GM views and edits a scene other than the open scene | In | 8 | Doing so never moves the players. |
| Show to players | In | 8 | Makes the scene the GM is viewing the open scene. Players start where the GM's view was. |
| Copying a scene to another room | Later | | |

### C. Storage, accounts and rooms

Decisions: [Decide the access model: server password, local accounts, or both](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/10) and [Screen storage and rooms (section C)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/13).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Asset bytes stored on the server and fetched over HTTP | Have | | |
| Accounts with sign-in | In | 4 | Local to the server. No self-registration, no Google or Apple sign-in, no email. |
| Anonymous players who join and use tools but own no library | In | 4 | Players join by link and never need to sign in. |
| Server-side library that follows its owner across devices and rooms | In as the account library. Out: tags | 9 | Scenes are held by the room, not the account. |
| Permanent rooms | In | 3 | No expiry for inactivity. |
| Room list: create, rename, open, delete | In | 4 | Deleting is immediate and permanent after a confirmation. |
| Room name | In | 4 | A chosen address for the link is Out. |
| Room background image | Later | | |
| Enabled-extension list | Later | | With extensions. |
| Request to join with GM approval | Later | | The room password stays the only gate on joining. |
| Invite Players button that copies the link | In | 4 | |
| Storage manager: usage | In | 4 | Per room on the room list; the server total for the administrator. |
| Storage manager: quotas | Later | | Today's per-file size cap stays. |
| Storage manager: backup export and import | In as a copy of the data directory. Later: in-app export and import of one room | 3 | |
| Converter from 1.0 data | Out for placed state. In: the browser library import | 9 | Read from the browser's own database by any signed-in account; there is no file route. |
| Room metadata bag | Later | | With extensions. |

Added by the decisions:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| First-run setup of the administrator | In | 4 | The server is locked until an administrator exists. There is no open mode. |
| Invite and reset links issued by an administrator | In | 4 | |
| A server password | Out | | |
| Administrator sees every room and can delete any | In | 4 | Without opening it as its GM. |
| Removing an account passes its rooms and account library to the administrator | In | 4 | |
| A GM handing a room to another account | Later | | |
| Session, started and ended by the GM | In | 5 | Ends by itself after the GM has been disconnected for about five minutes. |
| Default welcome screen | In | 5 | Shown to players outside a session. |
| Assigning a scene as the welcome screen | In | 8 | |
| View-only scene | In | 8 | |

### D. Roles and permissions

Decision: [Screen roles and permissions (section D)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/14).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Explicit GM and player roles | In | 5 | GM, trusted player and player. One GM per room. |
| Per-layer create, update and delete permissions | Out | | Replaced by the room switches. |
| Owner Only, with an Owner menu item for the GM | In | 6 | A room switch, off in a new room. |
| Server-side enforcement of permissions | In | 5 and 6 | Room and scene settings and the room switches in step 5. Checks on each item change in step 6. |
| Hidden items withheld from players | In. Later: withholding items under fog | 6 | Withheld by owner and role. |
| Player colour | In | 5 | Picked by each person and remembered in their browser. |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Room switches: tokens, drawing, notes and text, fog, Owner Only, uploads | In | 5 | Set per room and applied to all of its scenes. |
| Trusted player | In | 5 | Marked per room by the GM. |
| Locked items refuse changes from every player | In | 6 | Only the GM locks and unlocks. |
| Kicking or banning a player | Later | | Changing the room password covers it for now. |
| More than one GM in a room | Out | | |

### E. Real-time sync

Decision: [Screen real-time sync (section E)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/16).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Item-level sync with conflict handling | In | 6 | The server orders changes and the last write to a field wins. No CRDT. |
| Other people's in-progress actions seen live | In: drags, rulers. Later: drawing strokes, selections | 7 | Sent like the pointer: throttled, never stored, never in undo. |
| Offline edits queued and replayed on reconnect | Later | | The canvas is read-only while reconnecting. |
| Connection status | Have | | |
| Party list with name, colour, role, selection, metadata | In: name, colour, role, scene being viewed. Later: selection, metadata | 7 | |
| Room-wide and local-only message broadcast | Later | | Only extensions need it. |

### F. Asset manager and dock

Decision: [Screen asset manager and image features (sections F and G)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/17).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Six image types | In: Map, Prop, Mount, Character, Attachment. Later: Note | 9 | A type is the image's default layer. Notes stay text items. |
| Dock along the bottom, a tab per type plus Scenes | In | 9 | Replaces the token bar. |
| Dock search with fuzzy name match and a tag preview | In: search. Out: tag preview | 9 | |
| Asset Manager dialog | In | 9 | One dialog replaces the map picker and the token picker. |
| Sort by created or by name | In | 9 | |
| Folders | In as today's one-level groups. Later: nesting, colours, "Move to" | 9 | One list of folders per library, holding images of any type. |
| Collections per campaign | In as the room library and the account library | 9 | There is no collection to create or switch. |
| Tags | Out | | |
| Drop an image file onto the canvas with a type picker | In | 9 | Placed at the drop point. |
| Drop an image from another web page | Later | | What works today stays. |
| Importer defaults | In: type, size mode, label, and a saved grid on a map. Later: visible, locked, rotation, text colour, font | 9 | Aligning a map while creating a scene saves the alignment to the asset. The scene still owns its grid. |
| Image editor with a grid preview | In | 9 | Today's two edit dialogs, merged. |
| Starter sets | In as the server set. Out: third-party creator sets, tutorial scene | 9 | |
| Video as image content | Out | | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| "Add to my library" moves an asset from a room library to the account library | In | 9 | A move, not a copy. |
| A player's dock shows the server set and their own uploads | In | 9 | Never the room library or the GM's account library. |

### G. Images on the canvas

Decision: [Screen asset manager and image features (sections F and G)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/17).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Move with grid snapping, a key to suspend it, snap sensitivity | Have | | |
| Hide and show, lock and unlock, duplicate, delete, copy | Have | | |
| Locked items need a double-click to select | In | 10 | |
| Resize and rotate handles | In | 6 | Comes with the one transform system. |
| Label under the image, or rich text over it | Have: plain label. Later: rich text | | |
| Duplicate increments a trailing number in the label | In | 10 | |
| Layer menu item | In | 6 | |
| Replace Image | Later | | |
| Align Image on a placed map | Later | | |
| Characters attach to mounts, attachments to characters, by drop | Have | | By overlap, as today. |
| Status rings | Have | | Kept built in. |

### H. Grid, alignment and measuring

Decision: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Square, hex vertical and hex horizontal grids | Have | | |
| Isometric and dimetric grids | Out | | |
| Grid style | In: opacity, line width, colour. Later: dashed and dotted lines | 8 | |
| Grid colour chosen from map brightness | Later | | |
| Measurement types | Have | | |
| Measurement scale with unit and precision | Have | | |
| Grid size read from the file name | Have | | With the grid-size detector. |
| Manual alignment by columns and rows | Have | | |
| Alignment rulers and precision rails | Later | | |
| Shift to adjust one axis | Later | | |
| Prompt to update maps already placed | Out | | The grid belongs to the scene, so there is nothing to update on a map. |
| Ruler seen by everyone while dragging | In | 7 | |
| Permanent rulers | Later | | |
| Movement mode | In | 7 | Dragging a token shows the distance moved, to everyone. |

### I. Fog

Decision: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Polygon, rectangle and brush modes | Have | | |
| Circle, triangle and hexagon modes | Later | | |
| Grab mode | In | 6 | |
| Alt-drag to duplicate, Shift-click to multi-select | In | 6 | |
| Cut and uncut per shape | In | 6 | In the shape's context menu. |
| Fog Fill | In | 8 | A scene switch for fog over everything, which cut shapes punch through. |
| Single-layer mode | Have | | The existing multilayer toggle. |
| Join and Trim | Later | | |
| Fog style | Later | | |
| Default-cut toggle | Have | | |
| Fog preview | Have | | |
| Hold Space to pan while drawing | Have | 10 | Checked mid-shape in step 10. |
| Fog fill setting in the scene importer | In | 8 | |

### J. Dynamic fog (lights and walls)

Out of scope. Walls, lights, light types, elevation and walls that stop tokens all need a Skia or WebGL renderer, and the renderer stays on Konva.

### K. Drawing

Decision: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Brush, line, rectangle, circle, triangle | Have | | |
| Marker | Have | | This project's tool names stay. |
| Polygon and hexagon modes | Later | | |
| Grab mode | In | 6 | |
| Separate fill and stroke colours with opacity | Later | | |
| Stroke width and dash style | In: adjustable width. Later: dash style | 10 | |
| Custom colour palette | Later | | |
| Point editing | Later | | |
| Move a drawing to another layer | In | 6 | Through the Layer menu. |
| Join and Trim | Later | | |

### L. Text and notes

Decision: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Text tool: click and type on the canvas | In | 10 | Plain text. |
| Rich text | Later | | |
| Text colour, outline, font family, size | In: colour and size. Later: outline and font family | 10 | |
| Emoji picker | Out | | |
| Markdown-style shortcuts | Later | | |
| Note image type | Later | | Notes stay plain text on a coloured square. |
| Labels | Have: token labels. Later: the standalone Label item | | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| New notes and text start hidden | In | 10 | Seen by their owner and the GM. |
| The GM and trusted players can show their notes and text to everyone | In | 10 | A player who is not trusted cannot. |

### M. Presentation

Decisions: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18) and [Check whether the Presentation API can cast from a server on a home network](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/23).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Cast through the Presentation API | Later | | The API needs HTTPS or localhost, which a server on a home network does not have. |
| Hide the interface on the cast display | In | 2 | Always on for a cast display. |
| Sync View | In: "bring players here" (step 8), continuous follow for cast displays (step 2). Later: continuous follow for players | 2 and 8 | |
| Fullscreen | Have | | |
| Light and dark theme | Later | | Dark only. |
| Extras menu | In as the settings dialog | 4 | Storage usage is added in step 4. No extensions or cast entries. |
| Laser pointer | Have | | |
| Toast notifications | Have | | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Cast display, opened from a display link | In | 2 | |
| Button that opens the display link in a popout window | In | 2 | |
| Freezing the cast display | In | 2 | |

### N. Extension platform

Decision: [Decide whether to build an extension platform (section N)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/19).

| Feature | Verdict | Note |
| --- | --- | --- |
| Every platform row: manifest loader, extension manager, sandboxed host, SDK compatibility, action button, background page, context menu items, custom tools, popovers, and all the APIs and builders | Later | Picked up together or not at all. |
| Billboard items | Later | |
| Effect items (SkSL shaders) | Out of scope | Needs the Skia renderer. |
| Initiative tracker | Later | As a built-in feature, keeping its data in item metadata. |
| Dice, status rings and the timer as extensions | Out | They stay built in. See section Q. |

### P. In the reference but not worth copying

Out of scope: subscriptions, plans, billing and storage tiers; Google and Apple sign-in; an extension store and verification programme; random room names.

### Q. In this project but not in the reference

Decision: [Decide which built-in features stay (section Q)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/12).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Built-in 3D dice with shared rolls | Have | 7 | Rolls move onto presence in step 7. They are never saved. |
| Countdown timer | Have | 7 | Moves onto presence in step 7. |
| Audio sharing | Out | 1 | Removed in step 1, with all peer-to-peer code. |
| Room passwords | Have | | Optional, set by the GM. |
| Grid-size detection on map import | Have | | |
| Single executable | Have | | The project goal. |
| Status rings | Have | | Carried over as data on the token item in step 6. |
