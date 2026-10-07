---
status: accepted
---

# Accounts gate creation; players stay anonymous

Anyone who could reach the server's port could create a room and upload into it, which on an internet-exposed server means a stranger can fill the disk and read any TURN credentials. We decided that creating a room needs a local account, that players join anonymously with the room link, and that there is no server-wide password and no mode that skips accounts. Accounts were chosen over a shared password because the per-account library and the GM role both need an identity to attach to, and one mechanism is easier to keep secure than two.

The first visitor to the web page sets up the first administrator, with no setup link or secret. This is deliberate: before setup the server holds nothing sensitive, and a host who is beaten to it can start a fresh instance. In exchange, the server must make it obvious whether setup has happened, and a command-line flag reopens setup without losing rooms or assets.

## Considered options

- **Shared server password.** Smaller to build, but it gives no identity, so it would have been replaced once libraries and roles arrived.
- **Gating everyone, players included.** Rejected because players should be able to follow a link and play.
- **An open mode for LAN play.** Rejected because setup happens once and a second mode doubles what has to be kept secure and tested.
- **A one-time setup link printed in the console.** Rejected as unnecessary for a server with no data yet.
- **Self-registration.** Rejected; an administrator creates accounts and hands out one-time invite links, which also cover password resets since there is no email.

## Consequences

- A room can no longer be created by joining it, so the join token becomes a real proof of membership for the asset routes and `/iceservers`.
- A LAN host pays a one-time setup step that the current build does not have.
- An anonymous player's identity is only a random id kept in the browser, so anything granted to one (such as upload rights) is easy to lose or copy.

Full detail: [Decide the access model](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/10#issuecomment-5977332421).
