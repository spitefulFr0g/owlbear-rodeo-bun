import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const pointer = (sceneId: string, x: number) => ({ sceneId, kind: "pointer", state: { position: { x, y: 2 }, visible: true } });
const session = (socket: Socket, running: unknown) => new Promise<any>(resolve => socket.emit("session", running, resolve));

test("only the GM controls a room session, which survives a refresh and a restart", async () => {
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
    expect((await server.joinRoom(room.id)).info.room.session).toBe(true);
    const returned = await server.joinRoomAsGM(room.id, cookie);
    expect(returned.info.room.session).toBe(true);
    expect(await session(returned.socket, false)).toEqual({ ok: true });
    await server.restart();
    expect((await server.joinRoom(room.id)).info.room.session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);

test("waiting players and cast displays receive presence and no pointers or display view", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    gm.socket.emit("presence_update", { color: "blue", dice: { share: false, rolls: [] }, nickname: "Keeper" });
    const preparingGM = await server.joinRoomAsGM(room.id, cookie);
    const gmPointers = nextMessage(preparingGM.socket, "live");
    const sceneId = gm.snapshot!.scene!.id;
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    const display = await server.joinDisplay(room.id, token);
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const peers = [player.socket, trusted.socket, display.socket];
    const received: string[][] = peers.map(() => []);
    peers.forEach((peer, i) => {
      for (const event of ["scene_snapshot", "scene_changes", "live", "display_view"])
        peer.on(event, () => received[i].push(event));
    });
    expect(player.state.presenceState[gm.socket.id!].nickname).toBe("Keeper");
    gm.socket.emit("live", pointer(sceneId, 1));
    gm.socket.emit("display_view", { sceneId, x: 0, y: 0, width: 10, height: 10 });
    await gmPointers;
    for (const peer of peers) {
      peer.emit("live", pointer(sceneId, 3));
      await session(peer, false);
    }
    expect(received).toEqual([[], [], []]);
    const snapshots = peers.map(peer => nextMessage(peer, "scene_snapshot"));
    await session(gm.socket, true);
    for (const snapshot of await Promise.all(snapshots)) expect(snapshot[0]).toEqual(gm.snapshot);
    const forwarded = nextMessage(gm.socket, "live");
    player.socket.emit("live", pointer(sceneId, 3));
    expect((await forwarded)[0]).toEqual({ ...pointer(sceneId, 3), connectionId: player.socket.id });
    await session(gm.socket, false);
    received.forEach(events => events.splice(0));
    player.socket.emit("live", pointer(sceneId, 5));
    await session(player.socket, false);
    expect(received).toEqual([[], [], []]);
  } finally { await server.dispose(); }
}, 15000);
