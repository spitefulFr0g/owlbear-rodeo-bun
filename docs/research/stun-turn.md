# STUN/TURN for play outside the LAN

Research for issue #4. Written 2026-10-03 against `main` at `55b58f9`.

## Summary and recommendation

**Stop using WebRTC for assets. Move map and token transfer to plain HTTP on the server's own origin, backed by a small asset store on the server. Do not embed a TURN relay.**

Every player can already reach the host's HTTP port, or they could not have loaded the page. Sending assets over that same connection removes NAT traversal from the critical path altogether, needs no extra forwarded ports, makes a LAN game work with no internet access, and is the first piece of the server-side asset storage that the persistence work needs anyway.

WebRTC stays only for audio sharing, which already requires HTTPS or `localhost` (`README.md:61`). For that feature, keep the current default STUN entry and keep `--ice-servers` as the documented way to add an external TURN server.

Three smaller changes belong in the same work:

1. Surface ICE failures in the UI. Today they are silent (see section 1).
2. Document external TURN for audio sharing, including the fact that static credentials in the file are public.
3. Leave `backend/ice.json` as it is. After the change, no peer connection is created until someone shares audio, so a normal game never contacts Google.

## 1. How often STUN-only fails, and what it looks like today

### Failure rate

No primary source measures this exact setup. What exists:

| Claim | Source | Strength |
| --- | --- | --- |
| Fewer than 2% of tests showed home-router (CPE) NATs with symmetric mapping | Richter et al., IMC 2016, about 23,000 STUN sessions across 720 ASes [1] | Good: peer-reviewed measurement, but data from 2015–2016 |
| Over 92% of cellular ASes deploy carrier-grade NAT; about 17–18% of non-cellular eyeball ASes do | Same paper [1] | Good, same caveat |
| Cellular CGNs are bimodal: about 40% symmetric, about 20% full cone. About 11% of non-cellular CGN ASes are symmetric | Same paper [1] | Good, same caveat. Counted per AS, not per user |
| About 82% of NATs tested supported UDP hole punching | Ford, Srisuresh, Kegel, USENIX 2005 [2] | Old, small volunteer sample; historical lower bound only |
| mDNS host-candidate obfuscation lowered ICE connection rate by 2% (relative) | Chrome experiment reported in the IETF mDNS candidates draft [3] | Good for what it measures; unrelated to NAT type |
| "10–25% of WebRTC sessions need TURN" | Repeated in vendor blogs. I could not trace it to a published dataset. The one attributed quote I found (Callstats.io CEO, 2016: "Of those failed calls, 22% required some form of media relay") gives no sample or method [4] | Weak. Treat as folklore |

Reading these for the target setup (my inference, not a measurement):

- GM and player both on ordinary home broadband: STUN usually works. Symmetric home routers are rare.
- Player on a mobile connection: a large minority of carriers use symmetric CGN. A symmetric NAT on one side against a typical port-restricted home router on the other does not hole-punch, so these players should be expected to fail regularly.
- Player on a home ISP that uses CGN: an occasional failure.
- Every pair matters, not only GM to player. Assets are requested from whoever owns them (`src/network/NetworkedMapAndTokens.tsx:142-164`), so a token uploaded by one player is fetched player to player.

A reasonable planning assumption is that most groups of four or five that include a phone or tablet on mobile data will hit this at some point. That is an estimate, not a measured figure.

### What the player sees today

Traced from the code. The peer wrapper is `simple-peer` 9.11.1 (`package.json:60`), subclassed in `src/network/Connection.ts`.

1. The manifest arrives over socket.io. For each asset the player does not own or have cached, the client calls `assetLoadStart(asset.id)` and `session.sendTo(owner.sessionId, "assetRequest", asset)` (`src/network/NetworkedMapAndTokens.tsx:160-164`).
2. `assetLoadStart` sets `isLoading = true` and records the asset at 0 of 1 (`src/contexts/MapLoadingContext.tsx:33-40`). `MapLoadingOverlay` renders a 4px progress bar at the top of the screen (`src/components/map/MapLoadingOverlay.tsx:7-35`, `src/components/LoadingBar.tsx:42`).
3. `sendTo` creates the peer and queues the request behind `once("connect")` (`src/network/Session.ts:112-125`). There is no timeout.
4. When ICE fails, `simple-peer` destroys the peer with `ERR_ICE_CONNECTION_FAILURE` or `ERR_CONNECTION_FAILURE` (`node_modules/simple-peer/index.js:698-699`, `719-720`). `Session` emits `peerError` and drops the peer (`src/network/Session.ts:287-297`).
5. `Game.tsx` only shows a banner for `ERR_WEBRTC_SUPPORT` and `ERR_CREATE_OFFER` (`src/routes/Game.tsx:49-54`). ICE failure codes are ignored. Nothing is logged.
6. Nothing resets the loading state. `isLoading` only returns to false when overall progress reaches 1 (`src/contexts/MapLoadingContext.tsx:55-58`), and the asset id is never removed from `requestingAssetsRef` (`src/network/NetworkedMapAndTokens.tsx:147`, cleared only at `156`, `161`, `371`, `376`), so the request is never retried.

Result: an empty progress bar stuck at 0% at the top of the screen, indefinitely. The map area stays blank and custom tokens show the placeholder question mark (`src/docs/faq/maps.md:11-13`). No error, no toast, no retry. Because `allowMapChange` is `!isLoading` (`src/network/NetworkedMapAndTokens.tsx:407`), the map-select tool is also disabled for that player (`src/components/map/MapControls.tsx:88-90`). Only a page refresh clears it, and the refresh then fails the same way.

State sync (fog, drawings, token positions, pointers) keeps working because it goes over socket.io. The player sees tokens move on a blank board.

Not verified: how long the browser takes to declare ICE failed. It is browser-defined and I did not measure it.

## 2. Should the executable depend on Google's STUN server?

It does not need to for LAN play, and after the recommended change it will not for anything except audio sharing.

- **Empty list works.** With no `iceServers`, a connection is attempted with host candidates only, "which limits the connection to local peers" [5]. The frontend passes whatever `/iceservers` returns (`src/network/Session.ts:84`, `212`). Because `simple-peer` merges with `Object.assign({}, Peer.config, opts.config)` (`node_modules/simple-peer/index.js:46`), an explicit `[]` overrides its built-in Google and Twilio defaults (`index.js:1039-1047`).
- **mDNS obfuscation.** Browsers replace private host addresses with `<uuid>.local` names unless the page has media permission [3]. Two peers on the same LAN resolve these by multicast DNS. Where resolution fails, ICE falls back to "NAT hairpin, if supported, or TURN relay if not" [3]. So a small share of LAN pairs (networks that block multicast, such as some guest Wi-Fi) fail with host candidates alone, and with a STUN server they would also need router hairpinning. Chrome's measured cost is the 2% relative figure above. Per-browser and per-platform behaviour was not verified.
- **An unreachable STUN server should not break or delay LAN connections.** The app uses trickle ICE (`src/network/Session.ts:211`), so host candidates are signalled as soon as they are gathered and checks start without waiting for the STUN query. `simple-peer`'s 5 second `iceCompleteTimeout` only applies when trickle is off (`index.js:11`, `593-604`). This is reasoning from the code and RFC 8445/8838, not a test. It was not verified in a browser with the network cut.
- **Privacy and availability.** With the default list every browser in the game sends a STUN request to Google whenever a peer connection is created. I found no published terms or availability commitment for `stun.l.google.com` (not verified either way).

Conclusion: once assets leave WebRTC, a LAN game needs no internet access, and the STUN entry only matters for audio sharing between peers on different networks. Keeping the default costs nothing and avoids a behaviour change.

## 3. TURN options

### a. Document an external TURN server via `--ice-servers`

Already works; needs documentation only. The file is read once at startup (`backend/src/entities/IceServer.ts:8-12`) and served verbatim (`backend/src/controllers/IceServerController.ts:30-31`).

| Service | Free allowance | Paid | Credentials |
| --- | --- | --- | --- |
| Cloudflare Realtime TURN [6] | First 1,000 GB per month free, shared with the SFU | $0.05 per GB egress | Short-lived, minted by an authenticated API call with a `ttl` |
| Metered [7] | Pricing page: "Free Trial", 500 MB per month. Open Relay page: 20 GB per month with a free account and API key. The two pages disagree; not resolved | From $99 per month (150 GB), overage $0.40 per GB | API key |
| Twilio Network Traversal [8] | STUN free; no free TURN tier listed | $0.40 per GB (US, Germany) up to $0.80 per GB | Short-lived tokens from the API |
| Self-hosted coturn [9] | Software is free | Needs a host with a public IP, so a VPS | Static users or `use-auth-secret` |

Trade-offs: no code, and the relay does not use the GM's uplink. But it asks a home GM to sign up for a cloud service or run a VPS, which defeats the point of a single executable. Short-lived credentials from Cloudflare or Twilio expire, and the file is only read at startup, so the GM would have to regenerate it and restart. Static credentials are public (section 4).

### b. Embed a TURN relay in the executable

Feasible, but it is the wrong trade for this project.

**Libraries**

| Package | State | Notes |
| --- | --- | --- |
| `node-turn` 0.0.6 [10] | Last release 2020-09, last push 2023-12, 8 open issues, about 1,600 downloads per week | About 1,700 lines. UDP listener only. Implements RFC 5389/5766. Long-term credentials from a static map; no shared-secret mode. Uses `dgram`, `crypto`, `os`, plus `crc`, `js-yaml`, `log4js` |
| `turn-server` 0.6.6 [11] | First published 2026-04, ten releases since, single author, 2 GitHub stars, about 260 downloads per week. README: "Active development. APIs may change before v1.0" | About 10,000 lines. UDP, TCP, TLS, DTLS, WebSocket listeners. Shared-secret (REST) credentials, quotas, `externalIp`, `portRange`. Uses only `node:dgram`, `node:net`, `node:tls`, `node:crypto`, `node:dns`; optional dependencies are lazy-loaded |

Neither is a dependency I would want carrying game traffic unattended: one is unmaintained, the other is six months old with no visible adoption. The mature TURN servers (coturn in C, Pion in Go) cannot be linked into a Bun executable.

**Bun support.** Bun documents `node:dgram` as fully implemented with 99% of Node's test suite passing; the one listed gap is multicast membership on an unbound socket, which TURN does not use [12]. Open Bun issues mentioning UDP are typing mismatches and one event-loop edge case, none blocking [13].

Local check with Bun 1.4.2 on Linux x64:

- `node:dgram` and `Bun.udpSocket` exchanged datagrams, and 200 `dgram` sockets were bound at once.
- Both libraries started and answered a STUN Binding request, run with `bun` and as a `bun build --compile` binary.
- Not tested: a TURN Allocate and relay with a real browser, Windows, or behaviour under load.

**Binary size.** Negligible. Against a trivial compiled script (81.3 MB), `turn-server` added about 250 KB and `node-turn` about 53 KB. The current executables are 108 MB (Linux) and 113 MB (Windows).

**Networking cost.** This is the real problem.

- The GM must forward the TURN listening port (3478 UDP by default) and a UDP relay range in addition to the HTTP port. coturn and `node-turn` default the range to 49152–65535 [9][10]; it can be narrowed, but every allocation needs its own port and a full mesh of N players can hold up to N×(N−1) allocations.
- A relay behind NAT must advertise its public address (coturn's `external-ip` [9], `externalIp` in both libraries). The server would have to be told it or discover it with STUN, which brings back the external dependency.
- The GM's own browser sits behind the same router as the relay. Reaching a relayed address on the router's public IP needs NAT hairpinning, which home routers do not reliably support. Advertising the LAN address instead might avoid this when both peers hold allocations on the same relay. That is untested design speculation.
- All relayed traffic, including player-to-player transfers, would cross the GM's uplink and downlink.

**TURN over TCP on the HTTP port.** TURN permits TCP between client and server, while the relayed leg to the peer is UDP only [14]. Browsers accept `turn:host:port?transport=tcp` [15]. Sharing one TCP port with HTTP means sniffing the first bytes of each connection. Bun's `http.Server` "does not extend `net.Server`" [12], so the usual Node trick of handing a sniffed socket to the HTTP server is not available; it would need a front `net.Server` proxying to a loopback HTTP listener. Not prototyped. `turn-server`'s WebSocket transport does not help: browsers only speak TURN over UDP, TCP and TLS [15].

The end result of all that work would be a relay through the GM's machine, which option c achieves with a `fetch`.

### c. Skip WebRTC for assets and send them through the server

**What exists today**

- Assets are `{ file: Uint8Array, width, height, id, owner, mime }` (`src/types/Asset.ts`), stored in IndexedDB and keyed by a random UUID (`src/helpers/map.ts:132-152`). They are not content-addressed.
- Messages are `assetRequest`, `assetResponseSuccess`, `assetResponseFail` (`src/network/NetworkedMapAndTokens.tsx:358-377`).
- The send path msgpack-encodes the whole asset, slices it into 16,000 byte chunks, wraps each as `{ __chunked, data, id, index, total }`, encodes again and writes it to the data channel (`src/network/Connection.ts:9`, `82-123`). The receiver reassembles and emits `dataProgress` per chunk (`src/network/Connection.ts:40-74`), which drives the loading bar (`src/network/NetworkedMapAndTokens.tsx:380-386`).
- `session.sendTo` has exactly one caller (`src/network/NetworkedMapAndTokens.tsx:164`). The only other use of peer connections is audio (`src/network/NetworkedParty.tsx:39`, `84`).
- Maps are capped at 50 MB by the app's own guidance, with under 10 MB recommended (`src/docs/faq/maps.md:17`).

So the change is contained: about 40 lines in `NetworkedMapAndTokens.tsx`, one new client module, and new backend routes. `Session.ts` and `Connection.ts` stay as they are for audio.

**Socket.io or HTTP?**

| | Over the existing socket.io connection | HTTP on the same origin (recommended) |
| --- | --- | --- |
| Message size | `maxHttpBufferSize` is set to 10 MB (`backend/src/index.ts:55`; library default 1 MB). A larger message closes the socket [16]. Chunking must stay | No limit beyond what the route enforces; bodies stream |
| Binary | Supported; the msgpack parser is already in use (`backend/src/index.ts:56`) | Native |
| Head-of-line blocking | Asset chunks share the single WebSocket (`src/network/Session.ts:77`) with pointer and state updates, which stall behind a large map | Separate connections; none |
| Backpressure and progress | Hand-rolled acks | Browser handles flow control; progress from `Content-Length` and the response stream |
| Auth | Free: the socket is already in the game room | Needs a check (see below) |
| Server keeps a copy | No. The owner re-sends for each requester | Yes. The owner uploads once and need not stay online |
| Fit with persistence | Throwaway | The store becomes the persistent asset store |

**Bandwidth.** The server runs on the GM's machine. When the GM owns the asset, the GM's browser uploads over loopback or LAN and the server sends to each player over the GM's uplink, the same bytes as peer-to-peer today. When a player owns the asset, they upload once instead of once per peer, and the GM's connection carries the fan-out. That is the only new cost, and tokens are small.

**Limits.** Audio sharing cannot move to this path; it stays on WebRTC.

## 4. TURN credentials

Applies to audio sharing only if the recommendation is adopted.

- **Static credentials in the JSON file are public.** `/iceservers` has no middleware (`backend/src/controllers/IceServerController.ts:15`) and is fetched before the player joins a game (`src/network/Session.ts:79`). Anyone who can reach the port can read the username and password and use the relay for their own traffic.
- **The game password cannot gate it in any useful way.** Passwords are per game, and a game that does not exist is created on first join with whatever password the caller sends (`backend/src/entities/GameServer.ts:79-84`). Delivering ICE servers after `joined_game` would stop casual scraping of the URL, but anyone could still create a throwaway game and receive them. A real gate needs a server-wide secret or invite token, which the backend does not have.
- **Short-lived credentials bound the damage.** The TURN REST scheme: username is `expiry-timestamp:name`, password is `base64(HMAC(secret, username))`, recommended lifetime one day. The draft suggests HMAC-SHA1 and is an expired individual Internet-Draft with no formal standing, though widely implemented [17]. coturn implements it as `use-auth-secret` with `static-auth-secret` [9]. A leaked credential expires, but anyone who can fetch `/iceservers` can still get a fresh one.

If short-lived credentials are wanted later, it is a small addition: a `--turn-secret` option, with `/iceservers` computing the HMAC per request using `node:crypto`. Not recommended now. With assets off WebRTC, the remaining TURN use is audio sharing for hosts who have already set up HTTPS, and they can run coturn with a shared secret or use a hosted service.

## 5. Interaction with persistence and CRDT sync

The recommendation is the first step of that work, not a detour.

- Server-side persistence needs asset bytes on the server. An HTTP asset store keyed by asset id is that component. Making it durable later means changing where files are written and when they are evicted.
- Yjs documents should hold asset ids, not image bytes. Binary blobs fetched out of band by id is the arrangement this produces. The asset manifest (`src/types/Asset.ts`, synced through `useNetworkedState` at `src/network/NetworkedMapAndTokens.tsx:68-76`) already separates "which assets" from "the bytes".
- An embedded TURN relay would be written, debugged across home routers, and then made redundant when assets move to the server. External TURN documentation survives either way, for audio.
- Asset ids are random UUIDs. If deduplication matters later, switching to content hashes is easier before a persistent store exists. Worth deciding in the persistence design, not here.

## Comparison

| | a. External TURN, documented | b. Embedded TURN | c. Assets over HTTP (recommended) |
| --- | --- | --- | --- |
| Fixes symmetric NAT and CGNAT players | Yes, if the GM sets it up | Yes, if forwarding and hairpinning work | Yes, with no setup |
| Extra setup for the GM | Cloud account or VPS | UDP port plus relay range forwarded; public IP configured | None |
| Works with no internet on a LAN | Unchanged from today | Yes | Yes |
| New dependencies | None | An unmaintained or a six-month-old TURN library | None |
| Code change | Docs only | Medium, plus hard-to-test network behaviour | Small frontend change, new backend routes and store |
| Binary size | None | About 0.05–0.25 MB | Negligible |
| Credential exposure | Static credentials public | Needs short-lived credentials and quotas | Not applicable |
| GM uplink use | Relay is elsewhere | All relayed traffic | Same as peer-to-peer for GM-owned assets |
| Covers audio sharing | Yes | Yes | No (stays on WebRTC) |
| Fit with roadmap | Neutral | Discarded later | Becomes the asset store |

## Proposed implementation issue

**Title:** Transfer assets over HTTP through the server instead of WebRTC

**Scope**

- In: server asset store and routes; frontend asset upload and download; error and retry UI; README and in-app FAQ updates; visible ICE failure for audio.
- Out: durable storage across restarts (persistence issue), embedded TURN, short-lived TURN credentials, changing asset ids to content hashes.

**Steps**

1. Backend: add an `AssetController` with `PUT /games/:gameId/assets/:assetId` and `GET` (plus `HEAD`) on the same path. Store the body as an opaque blob, the msgpack-encoded `Asset` the client already produces, so the server never parses images. Stream to and from disk under a temp directory and enforce a per-asset size cap (start at the existing 50 MB guidance plus headroom).
2. Backend: authorise each request as a member of the game. Simplest option: the client sends its socket id and the server checks that the socket is in room `gameId`. Make `PUT` write-once per asset id.
3. Backend: delete a game's assets when the game is dropped or the process exits.
4. Frontend: when the manifest changes, upload any asset the local user owns that the server lacks (`HEAD`, then `PUT`). Replace the `assetRequest` send at `src/network/NetworkedMapAndTokens.tsx:164` with a `GET`, reporting progress through the existing `assetProgressUpdate` so the loading bar keeps working.
5. Frontend: on failure or timeout, clear the loading state and the `requestingAssetsRef` entry, show a toast, and retry with backoff. Remove the `assetRequest`/`assetResponse*` handlers (`:358-377`).
6. Frontend: show the existing banner for `ERR_ICE_CONNECTION_FAILURE` and `ERR_CONNECTION_FAILURE` in `src/routes/Game.tsx:49-54`, worded for audio sharing.
7. Docs: rewrite the troubleshooting section in `README.md:125-131` and the `--ice-servers` row (`README.md:59`) to say ICE servers only affect audio sharing; add a short external TURN how-to with the public-credentials warning; update `src/docs/faq/maps.md:9`.
8. Tests: backend route tests with `bun test` (auth, size cap, write-once, 404); a manual two-browser check with `iceServers: []` and no internet.

**Open questions**

- Eager upload by the owner (steps above) or lazy upload on first request, with the server asking the owner over the socket and holding the `GET`? Eager is simpler; lazy avoids uploading assets nobody fetches.
- Disk or memory for the store? Disk keeps memory flat and matches the persistence direction, but needs a location policy on Windows and cleanup after a crash.
- Is the socket id a good enough bearer? Other players in the game can see it (they are already authorised to read the assets), and write-once limits overwrites. A per-join random token returned with `joined_game` is the stricter alternative.
- Should the peer-to-peer path remain as a fallback? Recommendation: no. Two code paths, and the fallback is the one that fails silently.
- Unrelated finding to file separately: the `signal` relay forwards to any socket id without checking that both sockets are in the same game (`backend/src/entities/GameServer.ts:32-39`).

## Direction after review (2026-10-03)

The maintainer's goal is a full self-hostable server, with permanent storage of maps and assets on the server as a later feature. That confirms option c and changes how the base should be built. The asset store is a permanent part of the server, not a transfer cache, so the outline above is amended:

- **Durable from the start.** Assets are written under a data directory (`--data-dir` / `DATA_DIR`), not a temp directory, and are not deleted when a game is dropped or the process exits. This replaces step 3. Eviction and quotas per game become a later feature; a per-asset size cap stays.
- **Raw bytes, not msgpack blobs.** Store the image bytes with a small metadata record (mime, width, height, owner) and serve them with their real `Content-Type`. This replaces the opaque blob in step 1. A stored library has to be listable and usable directly as an image URL, which an opaque client-encoded blob prevents.
- **Content-addressed.** Key blobs by SHA-256 of the bytes and keep the existing asset UUID as a reference to a hash. This settles the last point of section 5 now, while there is no stored data to migrate. It gives deduplication, write-once semantics for free and immutable cache headers.
- **A storage interface.** Put the store behind a small interface (`put`, `get`, `has`, `delete`) with a filesystem implementation, so game state persistence and other backends can follow the same shape.
- **Join token, not socket id.** Issue a random token with `joined_game` and require it on asset routes. It is the hook that accounts or a server-wide password attach to later.
- **No peer-to-peer fallback.** The WebRTC asset path is removed; `Session.ts` and `Connection.ts` remain for audio only.

Open decision this raises: a durable store on a port-forwarded server can be filled by anyone who can reach it, because any visitor can create a game. Size caps limit the rate, not the total. A server-wide password or invite token is the real fix and should be decided before permanent libraries are built.

## Not verified

- Time for browsers to report ICE failure, and current mDNS candidate behaviour per browser and platform.
- That an unreachable STUN server causes no delay on a LAN (argued from trickle ICE and the code; not tested in a browser).
- Full TURN allocation and relay under Bun with a real browser, on Windows, or under load. Only STUN Binding was exercised.
- TURN-over-TCP multiplexed on the HTTP port under Bun.
- The LAN-address relay idea in section 3b.
- Which of Metered's two free-tier figures is current.
- Terms or availability commitments for Google's public STUN server.
- Web page contents were read through a summarising fetch tool. Quoted figures should be rechecked against the linked pages before being repeated elsewhere.

## Sources

1. Richter et al., "A Multi-perspective Analysis of Carrier-Grade NAT Deployment", ACM IMC 2016. https://arxiv.org/abs/1605.05606
2. Ford, Srisuresh, Kegel, "Peer-to-Peer Communication Across Network Address Translators", USENIX ATC 2005. https://arxiv.org/abs/cs/0603074
3. "Using Multicast DNS to protect privacy when exposing ICE candidates", draft-ietf-mmusic-mdns-ice-candidates-03 (expired June 2022). https://datatracker.ietf.org/doc/html/draft-ietf-mmusic-mdns-ice-candidates
4. Lagerway, "Know Where to 'TURN' When Deploying WebRTC", No Jitter, 2016. https://www.nojitter.com/video-conferencing/know-where-to-turn-when-deploying-webrtc
5. MDN, `RTCPeerConnection()` constructor, `iceServers`. https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection
6. Cloudflare Realtime: pricing https://developers.cloudflare.com/realtime/sfu/pricing/ ; TURN overview https://developers.cloudflare.com/realtime/turn/ ; credentials https://developers.cloudflare.com/realtime/turn/generate-credentials/
7. Metered: pricing https://www.metered.ca/stun-turn ; Open Relay Project https://www.metered.ca/tools/openrelay/
8. Twilio Network Traversal Service pricing. https://www.twilio.com/en-us/stun-turn/pricing
9. coturn `README.turnserver`. https://github.com/coturn/coturn/blob/master/README.turnserver
10. `node-turn`. https://github.com/Atlantis-Software/node-turn ; https://www.npmjs.com/package/node-turn (source of 0.0.6 tarball read directly)
11. `turn-server`. https://github.com/colocohen/turn-server ; https://www.npmjs.com/package/turn-server (source of 0.6.6 tarball read directly)
12. Bun Node.js compatibility. https://bun.com/docs/runtime/nodejs-compat
13. Bun issues: https://github.com/oven-sh/bun/issues/44218 , https://github.com/oven-sh/bun/issues/44274 , https://github.com/oven-sh/bun/issues/44271
14. RFC 8656, TURN. https://www.rfc-editor.org/rfc/rfc8656.html
15. RFC 7065, TURN URI scheme. https://www.rfc-editor.org/rfc/rfc7065.html (cited from memory, not fetched in this session)
16. Socket.IO server options, `maxHttpBufferSize`. https://socket.io/docs/v4/server-options/
17. Uberti, "A REST API For Access To TURN Services", draft-uberti-behave-turn-rest-00 (expired 2014). https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00

Also relevant: RFC 8445 (ICE) https://www.rfc-editor.org/rfc/rfc8445.html , RFC 8838 (Trickle ICE) https://www.rfc-editor.org/rfc/rfc8838.html , RFC 8489 (STUN) https://www.rfc-editor.org/rfc/rfc8489.html , RFC 8828 (WebRTC IP address handling) https://www.rfc-editor.org/rfc/rfc8828.html . These were cited for background and not fetched in this session.
