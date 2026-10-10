import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const privateGMEvents = (socket: Socket, received: string[]) => {
  for (const event of ["map", "map_state", "manifest", "map_state_update", "manifest_update", "player_pointer"])
    socket.on(event, () => received.push(event));
};

const session = (socket: Socket, running: unknown) => new Promise<any>(resolve => socket.emit("session", running, resolve));

test("only the GM controls a room session, which survives refresh but ends on restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    expect(gm.info.room.session).toBe(false);
    const player = server.connect();
    const joined = nextMessage(player, "joined_game");
    player.emit("join_game", room.id, "");
    expect((await joined)[2].room.session).toBe(false);
    expect(await session(player, true)).toEqual({ ok: false, error: "not_room_gm" });
    expect(await session(gm.socket, "yes")).toEqual({ ok: false, error: "invalid" });
    const started = nextMessage(player, "room_state");
    expect(await session(gm.socket, true)).toEqual({ ok: true });
    expect((await started)[0].session).toBe(true);
    gm.socket.disconnect();
    const refreshed = await server.joinRoomAsGM(room.id, cookie);
    expect(refreshed.info.room.session).toBe(true);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).info.room.session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);

test("waiting players and cast displays receive party data but no prepared state, changes or pointers", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    gm.socket.emit("player_state", { name: "Keeper" });
    const preparingGM = await server.joinRoomAsGM(room.id, cookie);
    const gmTraffic: string[] = [];
    privateGMEvents(preparingGM.socket, gmTraffic);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const peers = [server.connect(), server.connect(), server.connect()];
    const received: string[][] = peers.map(() => []);
    const privateEvents = ["map", "map_state", "manifest", "map_state_update", "manifest_update", "player_pointer", "display_view"];
    peers.forEach((peer, i) => privateEvents.forEach(event => peer.on(event, () => received[i].push(event))));
    for (const [i, peer] of peers.entries()) {
      const joined = nextMessage(peer, i === 2 ? "joined_display" : "joined_game");
      const party = nextMessage(peer, "party_state");
      if (i === 2) peer.emit("join_display", room.id, token);
      else peer.emit("join_game", room.id, "", null, { playerId: `player-${i}` });
      expect((await joined)[2].room.session).toBe(false);
      expect((await party)[0][gm.socket.id!].name).toBe("Keeper");
    }
    await new Promise(resolve => gm.socket.emit("room_trust", "player-1", true, resolve));
    expect(await session(peers[1], true)).toEqual({ ok: false, error: "not_room_gm" });
    expect(await session(peers[2], true)).toEqual({ ok: false, error: "not_room_gm" });
    const map = { id: "secret", owner: "gm" };
    const state = { mapId: "secret", tokens: {}, notes: {} };
    const manifest = { mapId: "secret", assets: {} };
    gm.socket.emit("map", map);
    gm.socket.emit("map_state", state);
    gm.socket.emit("manifest", manifest);
    gm.socket.emit("player_pointer", { x: 1, y: 2 });
    gm.socket.emit("display_view", { mapId: "secret", x: 0, y: 0, width: 10, height: 10 });
    gm.socket.emit("map_state_update", { id: "secret", changes: [{ kind: "N", path: ["notes", "prepared"], rhs: "Secret door" }] });
    gm.socket.emit("manifest_update", { id: "secret", changes: [{ kind: "N", path: ["assets", "prepared"], rhs: { id: "image" } }] });
    state.notes = { prepared: "Secret door" };
    Object.assign(manifest.assets, { prepared: { id: "image" } });
    await session(gm.socket, false); // Orders the GM's preparation before player attempts.
    expect(gmTraffic).toEqual(["map", "map_state", "manifest", "player_pointer", "map_state_update", "manifest_update"]);
    gmTraffic.splice(0);
    for (const peer of peers) {
      peer.emit("map", { id: "spoiled" });
      peer.emit("map_state", { mapId: "secret", tokens: { bad: true } });
      peer.emit("map_state_update", { id: "secret", changes: [{ kind: "N", path: ["tokens", "bad"], rhs: true }] });
      peer.emit("manifest", { mapId: "secret", assets: { bad: { id: "bad" } } });
      peer.emit("manifest_update", { id: "secret", changes: [{ kind: "N", path: ["assets", "bad"], rhs: { id: "bad" } }] });
      peer.emit("player_pointer", { x: 3, y: 4 });
      await session(peer, false); // Socket acknowledgement orders the refused events.
    }
    expect(received).toEqual([[], [], []]);
    expect(gmTraffic).toEqual([]);
    const snapshots = peers.map(peer => Promise.all(["map", "map_state", "manifest"].map(event => nextMessage(peer, event))));
    await session(gm.socket, true);
    for (const snapshot of await Promise.all(snapshots)) expect(snapshot.map(args => args[0])).toEqual([map, state, manifest]);
    const active = await server.joinRoom(room.id);
    expect(active.state.map).toEqual(map);
    const forwarded = nextMessage(gm.socket, "map_state_update");
    peers[0].emit("map_state_update", { id: "secret", changes: [{ kind: "N", path: ["tokens", "allowed"], rhs: true }] });
    await forwarded;
    const ended = peers.map(peer => nextMessage(peer, "room_state"));
    await session(gm.socket, false);
    for (const message of await Promise.all(ended)) expect(message[0].session).toBe(false);
    received.forEach(events => events.splice(0));
    peers[0].emit("map_state_update", { id: "secret", changes: [{ kind: "N", path: ["tokens", "afterEnd"], rhs: true }] });
    await session(peers[0], true);
    expect(received).toEqual([[], [], []]);
    const prepared = await server.joinRoomAsGM(room.id, cookie);
    expect(prepared.state.mapState.tokens).toEqual({ allowed: true });
  } finally { await server.dispose(); }
}, 15000);
