import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const session = (socket: Socket, running: boolean) => new Promise(resolve => socket.emit("session", running, resolve));
const leave = async (gm: Socket, player: Socket) => {
  const left = nextMessage(player, "player_left");
  gm.disconnect();
  await left;
};

test("players keep changing the scene until five minutes after the last GM leaves, then players and displays receive the session end", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    gm.socket.emit("map_state", { mapId: "scene", tokens: {} });
    await session(gm.socket, true);
    await leave(gm.socket, player.socket);
    await server.clock.advance(299999);
    const active = await server.joinRoom(room.id);
    expect(active.info.room.session).toBe(true);
    const update = nextMessage(active.socket, "map_state_update");
    player.socket.emit("map_state_update", { id: "scene", changes: [{ kind: "N", path: ["tokens", "allowed"], rhs: true }] });
    await update;
    const ended = [player.socket, display.socket].map(socket => nextMessage(socket, "room_state"));
    await server.clock.advance(1);
    for (const message of await Promise.all(ended)) expect(message[0].session).toBe(false);
    expect((await server.joinRoom(room.id)).info.room.session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);

test("a returning GM cancels the countdown without ending a later session early", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    await session(gm.socket, true);
    await leave(gm.socket, player.socket);
    await server.clock.advance(240000);
    const returning = await server.joinRoomAsGM(room.id, cookie);
    expect(returning.info.room.session).toBe(true);
    await session(returning.socket, false);
    await session(returning.socket, true);
    await leave(returning.socket, player.socket);
    await server.clock.advance(60000);
    expect((await server.joinRoom(room.id)).info.room.session).toBe(true);
    await server.clock.advance(239999);
    expect((await server.joinRoom(room.id)).info.room.session).toBe(true);
    const ended = nextMessage(player.socket, "room_state");
    await server.clock.advance(1);
    expect((await ended)[0].session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);

test("one of two GM connections leaving starts no countdown, but the last leaving does", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const first = await server.joinRoomAsGM(room.id, cookie);
    const second = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    await session(first.socket, true);
    await leave(first.socket, player.socket);
    await server.clock.advance(600000);
    expect((await server.joinRoom(room.id)).info.room.session).toBe(true);
    await leave(second.socket, player.socket);
    await server.clock.advance(299999);
    expect((await server.joinRoom(room.id)).info.room.session).toBe(true);
    const ended = nextMessage(player.socket, "room_state");
    await server.clock.advance(1);
    expect((await ended)[0].session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);

test("deleting a room or stopping the server clears a pending session countdown", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    await session(gm.socket, true);
    await leave(gm.socket, player.socket);
    expect((await fetch(`${server.address}/api/rooms/${room.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status).toBe(204);
    await server.clock.advance(300000);
    const other = await createRoom(server, cookie, "Other table");
    const otherGM = await server.joinRoomAsGM(other.id, cookie);
    const otherPlayer = await server.joinRoom(other.id);
    await session(otherGM.socket, true);
    await leave(otherGM.socket, otherPlayer.socket);
    await server.restart();
    const restartedGM = await server.joinRoomAsGM(other.id, cookie);
    expect(restartedGM.info.room.session).toBe(false);
    await session(restartedGM.socket, true);
    await server.clock.advance(300000);
    expect((await server.joinRoom(other.id)).info.room.session).toBe(true);
    await server.stop();
    await server.clock.advance(300000);
  } finally { await server.dispose(); }
}, 15000);
