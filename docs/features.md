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

Ten steps, grouped into releases. They are built in number order, except that step 8 is built before step 7. Steps 1 to 5 run on today's canvas. Step 6 is the one large rewrite. Steps 7 to 10 build on it. The move from Create React App to Vite is done between steps 7 and 9 and is not a numbered step.

The scope through v0.4.0 is implemented. See the [v0.4.0 release notes](releases/v0.4.0.md) for scenes, live play and upgrade instructions, and the [v0.4.1 release notes](releases/v0.4.1.md) for the fixes that followed. v0.5.0 is planned and not built. v0.6.0 is a forecast.

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
| 3. Permanent rooms | A room is saved to the data directory as an opaque, versioned document a few seconds after each change, and is kept until its GM deletes it. Rooms, and later accounts and library records, are kept in one SQLite database in the data directory, and asset bytes stay as files ([ADR 0009](adr/0009-records-in-one-sqlite-database.md)). The asset records move into the database, which also records which rooms have used each image. The supported backup is to stop the server and copy the data directory, and this is documented. |
| 4. Accounts and the room list | First-run setup of the administrator, sign-in, invite and reset links. Creating a room needs an account ([ADR 0001](adr/0001-accounts-gate-creation.md)). The room list creates, renames, opens and deletes rooms and shows each room's size: its saved document plus every image the room has used. Deleting a room removes the images no other room uses. Rooms get a random id in their link and a name the GM can change. Invite Players copies the link. An administrator sees every room and the server total, can delete any room, and takes over the rooms of an account they remove. |
| 5. Roles, first build, and sessions | GM, trusted player and player. Player colour. The room switches except Owner Only, checked on the server, which refuses room and scene settings changes from anyone but the GM. The session, started and ended by the GM, and the default welcome screen that players and cast displays see outside one. |

Steps 3 and 4 always ship in the same release. Saved rooms without accounts would make every room created by visiting a link permanent, with nobody able to list or delete them.

Decided for this release:

- **Sign-in:** a browser stays signed in through a cookie holding a random token, and the record is saved in the database, so a restart signs nobody out. A sign-in lasts 30 days from its last use and ends on sign-out or a password reset. The cookie is `HttpOnly` and `SameSite=Lax`, and `Secure` only when the request came over HTTPS, so a plain-HTTP home network keeps working. A server reachable from the internet needs HTTPS in front of it, and the documentation says so.
- **Sign-in and the join token:** they stay separate. The sign-in says who a person is. The join token is issued per connection and says which room that connection is in and as what: GM, player or cast display. The account that owns a room is its GM on every connection it opens. Everyone else is a player, signed in or not.
- **Limits on attempts:** five wrong passwords for one account, or from one address, within 15 minutes refuse further attempts for 5 minutes the first time and for 15 minutes each time after that. The count starts over after a successful sign-in to that account, or after 24 hours without a wrong attempt. Counts are kept in memory, so a restart clears them. The same limit applies to room passwords. Nothing locks an account for good.
- **Accounts:** a username and a password of at least 8 characters, and nothing else. Usernames are 3 to 32 characters and unique whatever their capitals. An invite link is single-use and expires after 7 days, and the invited person picks their own username and password. A reset link works the same way for an existing account. An account changes its own password by giving the current one, which signs out its other browsers. Changing a username is Later.
- **Administrators:** there can be several. An administrator can make another account an administrator or take that away, and the last one cannot be removed or demoted. Removing an account signs it out everywhere at once and passes its rooms to the administrator who removed it.
- **Reopening setup:** a command-line flag lets the next visitor create one new administrator, alongside everything that exists. It works once per start, and the server prints a warning while setup is open.
- **Home page:** before setup, every page shows the setup form. Signed out, the home page is the sign-in form, and players arrive only by a room link. Signed in, it is the room list. A room link that does not exist shows "room not found" and creates nothing.
- **Room links:** a random id of 16 letters and digits. Room links from v0.1.0 stop working, because those rooms were never saved.
- **Room password:** optional, set by the GM when creating the room or later in its settings, and saved with the room. The signed-in GM is never asked for it. Changing it does not disconnect anyone already in the room.
- **What a saved room holds:** the current map, its state (tokens, drawings, fog and notes), the list of images in use, the name, the password, the display link's token, the trusted players and the room switches. Not saved: who is connected, dice, timers, and the cast display's view and freeze. The GM's other maps stay in their browser until step 9, so a GM who signs in on a second device finds the room and its current map, and not their map library.
- **Saving:** a room is written about three seconds after its last change, and once more on a clean shutdown.
- **Deleting a room:** the people in it are disconnected and told that the room was deleted.
- **Display link:** it no longer changes on a restart. A "new display link" action in the room's settings replaces the token and disconnects the cast displays using the old one.
- **Trusted players:** remembered against the random id a player's browser keeps, and saved with the room. The GM marks and unmarks players from the party list. A trusted player who clears their browser or changes device is an ordinary player until marked again.
- **Room switches:** five in this release, checked by the kind of change: tokens, drawing, notes and text, fog, and uploads. A new room has tokens, drawing, and notes and text on, and fog and uploads off. Owner Only needs a check on each item, so it arrives with step 6 and is not shown before then. Only the GM can change the map. With uploads off, a player can place only the built-in tokens and the images already in the room.
- **Sessions:** outside a session, the server withholds the map and its state from players and cast displays. When a session ends, they return to the welcome screen at once and their changes are refused. A GM connected from two devices is the GM on both, and the five-minute timeout starts when the last of those connections drops. A running session is kept across a server restart, and the five-minute timeout starts again when the server does.

### v0.3.0: the item model

| Step | What is built |
| --- | --- |
| 6. Item model, scene core and per-item sync | Built as one step, because all three replace the same state. One `Item` type with five kinds and an explicit layer ([ADR 0002](adr/0002-item-model-without-state-migration.md)). The scene as an unbounded canvas with one grid and positions in world units; a room has exactly one scene until step 8 ([ADR 0003](adr/0003-scenes-arrive-with-the-item-model.md)). Server-ordered changes per item ([ADR 0004](adr/0004-server-ordered-item-changes.md)). Per-item permission checks, hidden items withheld by the server ([ADR 0006](adr/0006-hidden-items-are-seen-by-creator-and-gm.md)), Owner Only and locked items. One selection and transform system, one context menu, the Layer menu and shared undo. Fog and drawings become selectable, with cut and uncut per fog shape. |

Placed 1.0 state (tokens, drawings, fog and notes on a map) is not migrated in step 6 and can be lost.

Decided for this release, in [Plan v0.3.0: the item model](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/76):

- **One step:** v0.3.0 is step 6 alone. Step 7 was planned for this release and moved to the next one when step 6 was released on its own. It is specified against the messages step 6 produces.
- **No prototype:** the first piece of step 6 draws and moves one kind of item end to end, and the rest follows it.
- **World units:** a world unit is a pixel, and the scene's grid says how many units one cell is, 150 by default. A map is scaled so that its cells match the scene's. The origin has no meaning ([ADR 0010](adr/0010-world-units-are-pixels-at-a-fixed-cell-size.md)).
- **Transport:** it stays on socket.io.
- **Maps until step 8:** the map picker stays. Picking a map replaces the image on the Map layer and sets the scene's grid from the map's saved grid, and everything else in the scene stays where it is. The interface places at most one map in a scene, though the model allows more. A map no longer keeps its own tokens, drawings, fog and notes, so until the scene library two prepared tables are two rooms.
- **Editing the grid until step 8:** the map's edit dialog keeps working. Editing the grid of the map that is placed changes the scene's grid for everyone.
- **Rooms at the changeover:** a room saved by v0.2 starts with one empty scene. The release notes are the only warning. There is no notice in the app and no export of the old state.
- **Owner:** the GM or one player. A player is known by the random id their browser keeps, signed in or not, as with trusted marks. An item the GM owns belongs to the GM on every device and passes on with the room.
- **Tokens switch:** with it on, a player adds tokens, moves, resizes, rotates and relabels any token and sets its status rings, and deletes only the tokens they own.
- **Owner Only:** with it on, a player makes those changes only to tokens they own, whether they added them or the GM gave them. A player can still add a token.
- **Fog switch:** with it on, a player adds, cuts, moves and deletes any fog shape, not only their own.
- **Lock and owner:** only the GM locks, unlocks and changes an item's owner.
- **Hide and show:** the GM, for any item. A trusted player, for their own items. A player cannot.
- **Layer menu:** the GM moves any item to any layer. A trusted player moves their own items, never onto the Map layer. A player cannot.
- **Selecting:** a player can select only the items they may change at that moment. The GM selects anything.
- **Changes to several items:** one action is sent as one batch. The server checks each item on its own, applies the changes that are allowed and sends back the real state of the items it refused.
- **Undo:** one action is one step, however many items it touched. Undo puts back the values those fields had before the action, even if someone changed them since. A step on a deleted item is skipped. The history holds 50 steps and is forgotten when the page reloads.
- **Limits:** the server checks the shape of every change and refuses one that is malformed or over a fixed cap on items in a scene, points in a stroke or the length of a text. The caps are far above real play and are not settings.
- **Uploads off:** a player can add an image item only from the built-in maps and tokens or from an image already in the room.
- **Shared rules:** the item, scene and change types, and the pure rules over them, are defined once in a folder both the server and the interface import, and are tested there. The move from Create React App to Vite is not part of this release.
- **Toolbar:** it becomes a list of tool entries in step 6 and looks the same.
- **Until step 7:** presence, dice rolls and the timer stay as they are.

### v0.4.0: scenes and live play

| Step | What is built |
| --- | --- |
| 8. Scene library | Create, name, open, edit, duplicate, delete and switch scenes, from a Scenes dialog. The one-step importer with map alignment and the fog fill setting. The Scene Controls menu for the grid, with grid opacity, line width and colour. Show to players, and a one-off "bring players here". Fog Fill. Assigning a scene as the welcome screen. The view-only scene. |
| 7. Live play | Drags and rulers seen live by everyone viewing the same scene. Movement mode. The pointer joins drags and rulers as checked live messages. Presence carries name, colour, role and the scene being viewed, plus shared dice rolls and the timer. |

Two specs, one release. Both ship as v0.4.0.

Decided for this release, in [Plan v0.4.0: scenes and live play](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/103):

- **Step 8 first:** it gives back prepared tables, which v0.3.0 took away. Step 7 is built after it, because a live drag or ruler is sent only to the people viewing the same scene, and presence carries the scene being viewed. Its spec is written against the messages step 8 produces.
- **Scenes dialog:** the button that opened the map picker opens a Scenes dialog. It lists the room's scenes by name, with create, rename, duplicate, delete, open and Show to players. "New scene" offers an empty scene or one made from a map in the browser library, which opens the importer for alignment and the fog fill setting. Editing a scene reopens the importer, where its map can be replaced or removed. The map picker has no other entry. The dialog's contents move into the dock's Scenes tab in step 9.
- **Who views another scene:** only the GM. Players and trusted players are always on the open scene. The server sends the scene list to the GM alone, so nobody else learns the names of the other scenes.
- **Cast display:** while the GM views a scene other than the open scene, the cast display stays on the open scene and holds its last view, as if frozen. It follows again when the GM comes back. A cast display never shows a scene the players are not on.
- **View-only scene:** a player can pan, zoom, point and measure, and every item change is refused. A trusted player is refused as well, as with a locked item. Only the GM changes it. A scene serving as the welcome screen follows the same rule.
- **Grid cell size:** fixed at 150 world units, with no control for it in Scene Controls.
- **Scene document upgrade:** the database layout version rises to 2 without changing a table, to save the pre-upgrade copy and make v0.3.0 refuse upgraded data.
- **Welcome-screen scene:** shown alone, with nothing laid over it, in place of the default welcome screen.
- **Duplicating a scene:** an entry on a scene in the Scenes dialog makes a copy in the same room.
- **No prototype:** step 8 is server routing and dialogs over a canvas that exists.
- **Toolchain:** the move from Create React App to Vite is not part of this release. It is done before step 9.
- **Live play decisions:** [Live play (#122)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/122) records the step 7 answers.
- **Live messages:** pointer, ruler and drag share one scene routing rule. The server checks their shape and size, sets the sender's connection id and applies a fixed rate limit. Updates are throttled to about twenty a second per kind; ends are never dropped by the transport. They are never stored, included in a snapshot or put in undo, and get no answer. Disconnecting or leaving a scene ends that connection's live marks.
- **Live drags:** cover moving, resizing and rotating existing items, including attached items. The server keeps only items the sender may change and sends each receiver only items they may see. Hidden drags are withheld by the same owner and role rule as hidden items. A received drag selects, locks and blocks nothing; a person's own drag takes precedence on their screen. The saved change is sent before the drag ends, so the preview lands on the committed state.
- **Movement mode:** a scene setting, set only by the GM in Scene Controls, on for new and existing scenes and copied by a duplicate. Moving a token shows a straight line and distance using the scene's ruler rules, to the person dragging and everyone sent the drag. A group shows one distance. Resizing, rotating and moving a non-token show none. Turning it off leaves drags live. It joins scene document version 3 without another database layout change.
- **Presence and the party list:** the server checks name, colour, shared dice rolls and timer, and sets connection id, browser id, role and viewed scene itself. Players see only a mark that a GM is viewing another scene, never its id or name; the GM's other devices see the scene name. Outside a session players see no mark. Dice rolls and timers still cross scenes and are never saved; rolls with sharing off are not sent. The dice tray, timer and trusted marks work as before.
- **Scene privacy and cast display:** live messages stay on the scene being viewed. A GM preparing another scene sends nothing live to players or cast displays and receives nothing live from the open scene. A cast display receives the live marks of the scene the players see, including movement distances, even while frozen, and sends none. On the welcome-screen scene pointers and rulers work for everyone waiting and the GM's drags are seen; the default welcome screen sends and receives nothing live.
- **Live play limits:** strokes, fog shapes and items not yet added are seen only when finished. Arriving mid-drag shows it from the next update. Concurrent drags do not lock an item; the last release to reach the server wins. Movement mode has no waypoints or distance left after the drop. Fog Fill still covers items sent to players, so their drags are sent too. Reconnecting sends nothing live and queues no edits.
- **Upgrade and rollback:** the first start upgrades the database and keeps a pre-upgrade copy beside it. Going back to v0.3.0 requires stopping the server and restoring that copy; v0.3.0 refuses upgraded data. The release notes carry this warning.
- **Rough edges in v0.3.0:** the ones found in the hand check are fixed as v0.3.1 and are not part of either spec. See [Interface rough edges found in the v0.3.0 hand check](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/106).

### v0.5.0: libraries and dock

| Step | What is built |
| --- | --- |
| 9. Libraries and dock | The room library, the account library and the server set ([ADR 0005](adr/0005-assets-belong-to-a-room-or-an-account.md)). A dock along the bottom and one Asset Manager, replacing the token bar, the two pickers and the Scenes dialog. Dropping image files on the canvas with a type picker. A quota on each room library and account library, and a player quota in each room. The one-off import of a browser library into the account library. Today's Import / Export dialog and the `.owlbear` file are removed. |

The asset library stays in the browser until step 9. The reference suggested moving it to the server during the storage work, before the item model. It waits so that the server library is built once, against asset types that are layers, and not first against today's separate map and token tables.

Decided for this release, in [Plan v0.5.0: libraries and dock](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/136):

- **One step:** v0.5.0 is step 9 alone. Step 10 was forecast for this release and moved to v0.6.0, with the removal of the browser library code.
- **Before step 9:** the rough edges in [Interface rough edges found in the v0.3.0 hand check](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/106) are fixed as v0.4.1, except the grid size read from a file name, which is fixed in step 9 with the merged image editor. Then the interface moves to Vite, and one throwaway prototype of the dock and the Asset Manager is built on fixed data before the spec is written.
- **Toolchain:** the move to Vite is its own piece of work with nothing else in it. Vitest replaces Jest, the interface builds on the current Node, and the Docker build for Node 16 is removed. Yarn, React 17 and the present TypeScript stay unless Vite forces a change.
- **Asset:** a library entry with one name, one asset type and one home library, pointing at its original image and the copies made from it. The uploading browser makes the thumbnail, the downscaled copies and the outline, and the server never parses an image.
- **Server set:** it stays bundled in the interface and referenced by key. An administrator cannot change it.
- **Rooms at the changeover:** the upgrade creates no library entries. Placed items keep working, every room library starts empty, and names and folders come back through the browser library import into the account library.
- **Uploads:** every upload in a room lands in the room library, whatever filter is showing. The only ways into the account library are "Add to my library" and the browser library import. The same image uploaded twice into one library shows the existing asset.
- **Moving:** the GM can move any room asset, including a player's upload, which then leaves that player's dock. A moved asset lands at the top level of the other library and loses its folder.
- **Account library:** it is seen only in the rooms its account runs. An account holder in someone else's room is an ordinary player. A removed account's folders pass to the administrator with its library and merge by name.
- **Trusted players:** their dock is a player's dock. They may upload with the uploads switch off.
- **What a player may place:** an image in the server set, their own upload, or an image already placed in a scene of that room, with uploads on or off. A room asset the GM has not placed cannot be placed by a player.
- **Dock:** a tab per asset type and a Scenes tab. The Map and Scenes tabs are the GM's alone. It collapses to its tab strip, is hidden in fullscreen, and carries the same filter and search as the Asset Manager, with folders as expandable groups.
- **Asset Manager:** it exists only inside a room. The GM sees this room, then my library, then the server set, under a heading each, and a filter narrows to one. A player has it over their own uploads only, and the GM sees those ungrouped under a "from players" heading.
- **Order:** folders first by name, then assets by name or newest first, remembered per browser. Arranging tiles by hand is dropped. Dragging a tile onto a folder still files it.
- **Editing an asset:** it changes only items placed afterwards.
- **Maps from the dock:** dragging a Map asset places it on the Map layer at the drop point, locked and unaligned. "New scene" in the Scenes tab is the only route through the importer, and offers a Map asset from the libraries or a fresh upload.
- **Dropping files:** one type picker for the whole drop, defaulting to Character, with Map offered to the GM only. Each file becomes a room asset and one placed item.
- **Live:** library changes reach every connection entitled to see them at once. The GM's connections get everything and a player's get that browser's own uploads.
- **Player quota:** the most one player's uploads may take in a room, 100 MB by default. One value for every player in the room, trusted or not, set by the GM in the room's settings up to the room's quota.
- **Room and account quotas:** 2 GB by default for each room library and each account library, set by an administrator alone. The room quota is the limit that holds when a player returns under a new browser id. There is no quota for the whole server and no setting for the defaults.
- **What a quota counts:** an asset's original, thumbnail and downscaled copies. An image in two libraries counts in full in each. Deleting an asset frees quota at once. Lowering a quota below what is held deletes nothing and refuses new uploads and moves in.
- **Caps:** the number of assets and folders in a library and the length of a name have fixed caps far above real play, checked by the server, and are not settings.
- **Unused files:** they are cleared when the server starts and when a room is deleted, so undo within a sitting always finds its image.
- **Sizes shown:** a room's size is its saved document, its room library and any other image its scenes place. The account library's size is one more line on the room list.

### v0.6.0: small tools

| Step | What is built |
| --- | --- |
| 10. Small tools | The text tool, with colour and size. Notes and text that start hidden. Adjustable stroke width. Duplicate numbering. Double-click to select a locked item. A check that Space pans mid-shape. |

The browser library import ships in v0.5.0 and is removed in v0.6.0, with the rest of the browser library code. See [Decide how the existing browser library is imported into the account library](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/27). The id a browser keeps for its player, the nickname and the settings are stored beside the browser library and stay where they are.

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
| Scene library: create, name, open, edit, delete, switch | In | 8 | The room holds its scenes. They are listed in a Scenes dialog until the dock. |
| Grid as a scene property | In | 6 | Exactly one grid per scene. A scene with no map still has a grid. |
| Create a scene with a map in one step, with alignment in the importer | In | 8 | Today's map editing flow, pointed at a scene. |
| Importer remembers its last settings | Later | | |
| Scene metadata bag | Later | | Only extensions would use it. |
| Scene Controls menu on the open scene | In for the grid | 8 | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| The GM views and edits a scene other than the open scene | In | 8 | Doing so never moves the players. Only the GM can, and only the GM is sent the scene list. |
| Show to players | In | 8 | Makes the scene the GM is viewing the open scene. Players start where the GM's view was. |
| Copying a scene to another room | Later | | |

Added in [Plan v0.4.0: scenes and live play](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/103):

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Duplicating a scene inside a room | In | 8 | An entry on a scene in the scene list. |

### C. Storage, accounts and rooms

Decisions: [Decide the access model: server password, local accounts, or both](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/10), [Screen storage and rooms (section C)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/13) and [Decide how the server stores rooms, accounts and library records](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/26).

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
| Storage manager: usage | In | 4 | Per room on the room list; the server total for the administrator. An image used in two rooms counts in both, and the server total counts disk space actually used. |
| Storage manager: quotas | In: a quota per room library and per account library, and a player quota per room. Later: a quota for the whole server | 9 | Today's per-file size cap stays. |
| Storage manager: backup export and import | In as a copy of the data directory. Later: in-app export and import of one room | 3 | Taken with the server stopped. A snapshot written by the running server is Later. |
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
| Assigning a scene as the welcome screen | In | 8 | Players can change nothing on it, as on a view-only scene. |
| View-only scene | In | 8 | Players and trusted players can pan, zoom, point and measure. Only the GM changes it. |

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
| Room switches: tokens, drawing, notes and text, fog, uploads | In | 5 | Set per room and applied to all of its scenes. Owner Only joins them in step 6. |
| Trusted player | In | 5 | Marked per room by the GM. |
| Locked items refuse changes from every player | In | 6 | Only the GM locks and unlocks. |
| Kicking or banning a player | Later | | Changing the room password covers it for now. |
| More than one GM in a room | Out | | |

### E. Real-time sync

Decision: [Screen real-time sync (section E)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/16).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Item-level sync with conflict handling | In | 6 | The server orders changes and the last write to a field wins. No CRDT. |
| Other people's in-progress actions seen live | In: drags, rulers. Later: drawing strokes, selections | 7 | Pointer, ruler and drag are checked live messages routed by scene, throttled, never stored and never in undo. Drags use the same permission and visibility rules as items; move, resize and rotate are live. |
| Offline edits queued and replayed on reconnect | Later | | The canvas is read-only while reconnecting. |
| Connection status | Have | | |
| Party list with name, colour, role, selection, metadata | In: name, colour, role, scene being viewed. Later: selection, metadata | 7 | Checked presence. Players see only a GM’s “viewing another scene” mark; GM devices see the scene name. Dice rolls and timers cross scenes. |
| Room-wide and local-only message broadcast | Later | | Only extensions need it. |

### F. Asset manager and dock

Decision: [Screen asset manager and image features (sections F and G)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/17).

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| Six image types | In: Map, Prop, Mount, Character, Attachment. Later: Note | 9 | Called asset types. A type is the layer an asset is placed on by default. Notes stay text items. |
| Dock along the bottom, a tab per type plus Scenes | In | 9 | Replaces the token bar and the Scenes dialog. |
| Dock search with fuzzy name match and a tag preview | In: search. Out: tag preview | 9 | |
| Asset Manager dialog | In | 9 | One dialog replaces the map picker and the token picker. |
| Sort by created or by name | In | 9 | Replaces arranging tiles by hand. |
| Folders | In as today's one-level groups. Later: nesting, colours, "Move to" | 9 | One list of folders per library, holding images of any type. |
| Collections per campaign | In as the room library and the account library | 9 | There is no collection to create or switch. |
| Tags | Out | | |
| Drop an image file onto the canvas with a type picker | In | 9 | Placed at the drop point. |
| Drop an image from another web page | Later | | What works today stays. |
| Importer defaults | In: type, size mode, label, and a saved grid on a map. Later: visible, locked, rotation, text colour, font | 9 | Aligning a map while creating a scene saves the alignment to the asset. The scene still owns its grid. |
| Image editor with a grid preview | In | 9 | Today's two edit dialogs, merged. |
| Starter sets | In as the server set. Out: third-party creator sets, tutorial scene. Later: images added by an administrator | 9 | |
| Video as image content | Out | | |

Added by the decision:

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| "Add to my library" moves an asset from a room library to the account library | In | 9 | A move, not a copy. |
| A player's dock shows the server set and their own uploads | In | 9 | Never the room library or the GM's account library. |

Added in [Plan v0.5.0: libraries and dock](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/136):

| Feature | Verdict | Step | Note |
| --- | --- | --- | --- |
| A player's Asset Manager over their own uploads | In | 9 | Rename, change the asset type, file in folders, delete. |
| Arranging tiles by hand | Out | | Replaced by the two sorts and search. |
| Moving a whole folder between libraries | Later | | A moved asset lands at the top level. |

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
| Ruler seen by everyone while dragging | In | 7 | Seen only by people viewing the same scene, including a frozen cast display, in its owner’s colour and with the scene’s distance rules. |
| Permanent rulers | Later | | |
| Movement mode | In | 7 | GM-set scene setting in Scene Controls, on by default. Moving tokens shows one straight line and distance per group to everyone sent the drag, using the ruler’s rules. No distance for resize or rotation; switching it off leaves drags live. |

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
| Cast display, opened from a display link | In | 2 | From step 8 it stays on the open scene while the GM views another. |
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
| Built-in 3D dice with shared rolls | Have | 7 | Checked presence carries shared rolls across scenes in step 7; sharing off sends none. They are never saved. |
| Countdown timer | Have | 7 | Checked presence carries it across scenes in step 7; it is never saved and still counts in its owner’s browser. |
| Audio sharing | Out | 1 | Removed in step 1, with all peer-to-peer code. |
| Room passwords | Have | | Optional, set by the GM. |
| Grid-size detection on map import | Have | | |
| Single executable | Have | | The project goal. |
| Status rings | Have | | Carried over as data on the token item in step 6. |
