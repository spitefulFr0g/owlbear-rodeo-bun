---
status: accepted
---

# The server is the only path between clients

The original app was peer-to-peer: browsers connected to each other over WebRTC and the server only introduced them. Assets have since moved to HTTP through the server, which left audio sharing as the last feature using peer connections. We decided to drop audio sharing and remove the peer-to-peer code with it, so every message between two people in a room goes through the server.

The table this is built for plays in one room, and a remote table already has a voice app that shares audio. Keeping the feature meant keeping WebRTC signalling, the ICE server configuration and the STUN/TURN setup that anyone hosting outside a home network has to get right.

## Considered options

- **Keeping audio sharing over WebRTC.** Rejected because one seldom-used feature would hold up the whole peer-to-peer layer and its hosting burden.
- **Streaming audio through the server.** Rejected as a new feature nobody has asked for, and a poor fit for a server meant to stay small.

## Consequences

- `Session.ts` peer connections, `Connection.ts`, the stream modal and party stream controls, `simple-peer`, `webrtc-adapter`, the `/iceservers` route, `ice.json`, the ICE server option and the server's `signal` relay are all removed.
- The signal relay bug is resolved by deleting the relay, not by fixing it.
- A host no longer configures STUN or TURN. The server needs one reachable port and nothing else.
- There is no way to play music to remote players from inside the app.
- Bringing audio back later means reintroducing signalling and ICE setup, or building server-side streaming.
- The removal is its own early cleanup, done before the item model work.

Full detail: [Decide which built-in features stay (section Q)](https://github.com/spitefulFr0g/owlbear-rodeo-bun/issues/12).
