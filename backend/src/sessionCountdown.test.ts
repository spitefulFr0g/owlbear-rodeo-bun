import { tokenItem } from "./testing/sceneFixtures";
import { expect, test } from "bun:test";
import { sendBatch, createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
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
    const player = await server.joinRoom(room.id, "", "player");
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    await session(gm.socket, true);
    await leave(gm.socket, player.socket);
    await server.clock.advance(299999);
    const active = await server.joinRoom(room.id);
    expect(active.info.room.session).toBe(true);
    const update = nextMessage(active.socket, "scene_changes");
    expect((await sendBatch(player.socket, { id: "allowed", sceneId: active.snapshot!.scene!.id, changes: [{ type: "add", item: tokenItem }] })).applied).toHaveLength(1);
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
    const player = await server.joinRoom(room.id, "", "player");
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
    const player = await server.joinRoom(room.id, "", "player");
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
    const player = await server.joinRoom(room.id, "", "player");
    await session(gm.socket, true);
    await leave(gm.socket, player.socket);
    expect((await fetch(`${server.address}/api/rooms/${room.id}`, { method: "DELETE", headers: { Cookie: cookie } })).status).toBe(204);
    await server.clock.advance(300000);
    const other = await createRoom(server, cookie, "Other table");
    const otherGM = await server.joinRoomAsGM(other.id, cookie);
    const otherPlayer = await server.joinRoom(other.id);
    await session(otherGM.socket, true);
    await leave(otherGM.socket, otherPlayer.socket);
    await server.stop();
    await server.clock.advance(300000);
  } finally { await server.dispose(); }
}, 15000);

test("a session kept across a restart ends five minutes after the start unless the GM returns", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const left = await createRoom(server, cookie, "Left table");
    const kept = await createRoom(server, cookie, "Kept table");
    for (const room of [left, kept]) await session((await server.joinRoomAsGM(room.id, cookie)).socket, true);
    await server.restart();
    await server.clock.advance(299999);
    const player = await server.joinRoom(left.id, "", "player");
    expect(player.info.room.session).toBe(true);
    const returning = await server.joinRoomAsGM(kept.id, cookie);
    const ended = nextMessage(player.socket, "room_state");
    await server.clock.advance(1);
    expect((await ended)[0].session).toBe(false);
    await server.clock.advance(600000);
    expect((await server.joinRoom(kept.id)).info.room.session).toBe(true);
    returning.socket.disconnect();
    await server.restart();
    expect((await server.joinRoom(left.id)).info.room.session).toBe(false);
  } finally { await server.dispose(); }
}, 15000);
