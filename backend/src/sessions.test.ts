import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

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

test("waiting players and cast displays receive party data and no pointers or display view", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    gm.socket.emit("player_state", { name: "Keeper" });
    const preparingGM = await server.joinRoomAsGM(room.id, cookie);
    const gmPointers = nextMessage(preparingGM.socket, "player_pointer");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    const display = await server.joinDisplay(room.id, token);
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const peers = [player.socket, trusted.socket, display.socket];
    const received: string[][] = peers.map(() => []);
    peers.forEach((peer, i) => {
      for (const event of ["scene_snapshot", "scene_changes", "player_pointer", "display_view"])
        peer.on(event, () => received[i].push(event));
    });
    expect(player.state.partyState[gm.socket.id!].name).toBe("Keeper");
    gm.socket.emit("player_pointer", { x: 1, y: 2 });
    gm.socket.emit("display_view", { sceneId: gm.snapshot!.scene!.id, x: 0, y: 0, width: 10, height: 10 });
    await gmPointers;
    for (const peer of peers) {
      peer.emit("player_pointer", { x: 3, y: 4 });
      await session(peer, false);
    }
    expect(received).toEqual([[], [], []]);
    const snapshots = peers.map(peer => nextMessage(peer, "scene_snapshot"));
    await session(gm.socket, true);
    for (const snapshot of await Promise.all(snapshots)) expect(snapshot[0]).toEqual(gm.snapshot);
    const forwarded = nextMessage(gm.socket, "player_pointer");
    player.socket.emit("player_pointer", { x: 3, y: 4 });
    expect((await forwarded)[0]).toEqual({ x: 3, y: 4 });
    await session(gm.socket, false);
    received.forEach(events => events.splice(0));
    player.socket.emit("player_pointer", { x: 5, y: 6 });
    await session(player.socket, false);
    expect(received).toEqual([[], [], []]);
  } finally { await server.dispose(); }
}, 15000);
