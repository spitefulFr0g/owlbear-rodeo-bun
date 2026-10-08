---
status: accepted
---

# A cast display is its own view-only connection

The table plays with a shared screen, so a player view on a second display is wanted from the first release. The quick way, used by Atlas VTT for Obsidian, is a second window opened from the GM's browser and fed by the GM's window. We decided the second window opens a display link instead, and connects to the server by itself as a cast display: a connection that sees what a player sees, shows no interface, cannot change anything and is not listed as a player. The popout window in the first release is a button that opens that link.

## Considered options

- **Feeding the popout from the GM's window with no server connection.** Rejected because it only ever works on the GM's machine and would be rewritten for a second device or for casting.
- **Casting through the Presentation API first.** Deferred. It is limited to Chrome and Edge and may need HTTPS, which a server on a home network does not have. A research ticket checks this.
- **Joining the shared screen as an ordinary player with the interface hidden.** Rejected because it would appear in the party list with a name and colour, and could change the room.

## Consequences

- The same display link works in the popout, in a browser on another device, and later as the address handed to the Presentation API.
- The server must accept a connection that can read and never write. This overlaps with the roles work.
- Nobody controls a cast display, so it follows the GM's view all the time. The GM can freeze it while they look elsewhere.
- It is built on today's canvas in the first release, before the item model and scenes, and the view code is partly redone when they land.

Full detail: [Screen grid, fog, drawing, text and presentation features (sections H, I, K, L, M)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/18).
