# Owlbear Rodeo (Bun)

A self-hosted virtual tabletop: one server that a table's players connect to with a browser.

## Language

### Access

**Room**:
The persistent place on a server that players join to share a tabletop. It has a name its GM can change, and it is kept until its GM deletes it.
_Avoid_: Campaign, game, party

**Account**:
An identity on one server that a person signs in to. Only an account can create a room.
_Avoid_: User, login, profile

**Administrator**:
An account that manages the other accounts on a server, and can see and delete any room on it. The first account, made at setup, is an administrator.
_Avoid_: Admin user, owner, superuser

**GM**:
The person running a room. A room has one GM: the account that created it, or the administrator it passed to when that account was removed.
_Avoid_: DM, host, map owner

**Player**:
Anyone in a room who is not its GM. A GM who joins their own room without signing in is a player.
_Avoid_: User, participant, member

**Trusted player**:
A player the GM has marked to receive the room's wider set of permissions.
_Avoid_: Co-GM, moderator, assistant

**Anonymous player**:
A person in a room who has not signed in to an account.
_Avoid_: Guest, visitor

**Presence**:
One person's live connection to a room: their name, colour, role and the scene they are viewing, plus their shared dice rolls and timer. It exists only while they are connected.
_Avoid_: Party member, peer

**Dice roll**:
The dice a person has thrown in their dice tray and the result. A shared roll is part of that person's presence, seen by everyone in the room whatever scene they are viewing, and is never saved.
_Avoid_: Roll history, roll log

**Timer**:
A countdown one person starts, shown to everyone in the room. It is part of that person's presence and ends when they disconnect.
_Avoid_: Clock, stopwatch, turn timer

**Session**:
The stretch of play in a room between its GM starting it and ending it. Players see the open scene only during a session. A session also ends by itself once the GM has been disconnected for a while.
_Avoid_: Game, meeting, live mode

**Welcome screen**:
What players see in a room outside a session. By default it shows the room's name and who is waiting. The GM can assign a scene to be shown in its place.
_Avoid_: Lockout screen, splash screen, lobby, waiting room

### Canvas

**Scene**:
An unbounded canvas in a room, holding items and one grid. A room holds any number of scenes.
_Avoid_: Map, board, level

**Open scene**:
The one scene in a room that the players see during a session. The GM may be viewing a different scene, and moves the players by showing it to them.
_Avoid_: Active scene, current scene, live scene

**View-only scene**:
A scene the GM has marked so that players can look at it but not change it.
_Avoid_: Locked scene, read-only scene, presentation scene

**Map**:
An image item on the Map layer. It is a picture only; the grid and everything placed on top belong to the scene.
_Avoid_: Background, battlemap

**Item**:
One thing placed on the canvas, such as an image, a shape or a piece of text. Every item has a position, a layer and an owner.
_Avoid_: Object, element, node, entity

**Layer**:
The fixed band an item is drawn in, which decides what covers what.
_Avoid_: Z-order, category, level

**Token**:
An image item on the Character, Mount, Prop or Attachment layer.
_Avoid_: Mini, piece, sprite

**Status ring**:
A coloured ring drawn around a token to mark a condition. A token can carry several.
_Avoid_: Condition marker, status effect, aura

**Note**:
A short piece of plain text on a coloured square, placed on the Note layer.
_Avoid_: Sticky, memo, comment

**Hidden item**:
An item that only its creator and the GM can see. New notes and text start hidden, and only the GM or a trusted player can show theirs to everyone.
_Avoid_: Private item, invisible item, secret item

**Cast display**:
A view-only connection to a room, made to be shown on a shared screen. It shows what a player sees with no interface, follows the GM's view, and is not a player.
_Avoid_: Player view, spectator, second screen, popout

**Display link**:
The address that opens a room as a cast display.
_Avoid_: Cast link, view link, spectator link

**Extension**:
An optional add-on that gives a room a feature the base does not have. Not built yet. A first-party extension would ship with the server; a third-party extension would be added by its manifest address.
_Avoid_: Plugin, add-on, module, mod

### Library

**Asset**:
A stored image that can be placed on the canvas as an image item. Every asset belongs to exactly one library.
_Avoid_: File, upload, resource

**Room library**:
The assets that belong to one room. An image uploaded in a room goes here, and the library is deleted with the room.
_Avoid_: Collection, campaign library

**Account library**:
The assets that belong to an account, usable in every room that account runs.
_Avoid_: My assets, personal library, global library

**Server set**:
The built-in maps and tokens that come with the server. Read-only and available in every room.
_Avoid_: Default assets, starter set, built-ins
