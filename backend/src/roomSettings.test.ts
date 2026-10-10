import { expect, test } from "bun:test";
import type { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const password = (socket: Socket, value: unknown) => socket.timeout(10000).emitWithAck("room_password", value);
const displayLink = (socket: Socket) => socket.timeout(2000).emitWithAck("new_display_link");

async function refusedPassword(server: Awaited<ReturnType<typeof startTestServer>>, roomId: string, value: string) {
  const socket = server.connect();
  const refused = nextMessage(socket, "auth_error");
  socket.emit("join_game", roomId, value);
  await refused;
  socket.disconnect();
}

async function hasPassword(server: Awaited<ReturnType<typeof startTestServer>>, cookie: string) {
  const response = await fetch(`${server.address}/api/rooms`, { headers: { Cookie: cookie } });
  return (await response.json() as any).rooms[0].hasPassword;
}

test("GM sets, changes and removes a durable room password without disconnecting residents", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    let disconnects = 0;
    for (const peer of [gm, player, display]) peer.socket.on("disconnect", () => disconnects++);
    expect(await password(gm.socket, "first-secret")).toEqual({ ok: true });
    expect(await hasPassword(server, cookie)).toBe(true);
    await refusedPassword(server, room.id, "");
    await server.joinRoom(room.id, "first-secret");
    expect(await password(gm.socket, "second-secret")).toEqual({ ok: true });
    await refusedPassword(server, room.id, "first-secret");
    await server.joinRoom(room.id, "second-secret");
    await server.joinRoomAsGM(room.id, cookie);
    expect(disconnects).toBe(0);
    await server.clock.advance(3000);
    const copy = await server.durableCopy();
    try {
      expect(await hasPassword(copy, cookie)).toBe(true);
      await refusedPassword(copy, room.id, "first-secret");
      await copy.joinRoom(room.id, "second-secret");
    } finally { await copy.dispose(); }
    expect(await password(gm.socket, null)).toEqual({ ok: true });
    expect(await hasPassword(server, cookie)).toBe(false);
    await server.joinRoom(room.id);
    expect(await password(gm.socket, "third-secret")).toEqual({ ok: true });
    expect(await password(gm.socket, "")).toEqual({ ok: true });
    await server.joinRoom(room.id);
    expect(disconnects).toBe(0);
    await server.restart();
    expect(await hasPassword(server, cookie)).toBe(false);
    await server.joinRoom(room.id);
  } finally { await server.dispose(); }
}, 60000);

test("new display link disconnects every old display, revokes access and survives restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const old = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const displays = await Promise.all([server.joinDisplay(room.id, old), server.joinDisplay(room.id, old)]);
    const errors = displays.map(peer => nextMessage(peer.socket, "display_error"));
    const disconnected = displays.map(peer => nextMessage(peer.socket, "disconnect"));
    const result = await displayLink(gm.socket);
    expect(result.ok).toBe(true);
    expect(typeof result.token).toBe("string");
    expect(result.token).not.toBe(old);
    await Promise.all([...errors, ...disconnected]);
    expect(gm.socket.connected).toBe(true);
    expect(player.socket.connected).toBe(true);
    for (const peer of displays) {
      expect((await fetch(`${server.address}/assets/display-access`, { headers: { Authorization: `Bearer ${peer.token}` } })).status).toBe(401);
    }
    const refuseOld = async () => {
      const socket = server.connect();
      const error = nextMessage(socket, "display_error");
      socket.emit("join_display", room.id, old);
      await error;
      socket.disconnect();
    };
    await refuseOld();
    await server.joinDisplay(room.id, result.token);
    await server.restart();
    await refuseOld();
    await server.joinDisplay(room.id, result.token);
    const rejoined = await server.joinRoomAsGM(room.id, cookie);
    expect(await new Promise<string>(resolve => rejoined.socket.emit("get_display_token", resolve))).toBe(result.token);
  } finally { await server.dispose(); }
}, 15000);

test("room settings refuse players, displays, unjoined connections and malformed GM arguments", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    for (const socket of [player.socket, display.socket, server.connect()]) {
      expect(await password(socket, "forbidden-secret")).toEqual({ ok: false, error: "not_room_gm" });
      expect(await displayLink(socket)).toEqual({ ok: false, error: "not_room_gm" });
    }
    for (const invalid of [123, false, {}, [], undefined]) {
      expect(await password(gm.socket, invalid)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await gm.socket.timeout(2000).emitWithAck("new_display_link", "unexpected")).toEqual({ ok: false, error: "invalid" });
    expect(await hasPassword(server, cookie)).toBe(false);
    await server.joinRoom(room.id);
    await server.joinDisplay(room.id, token);
    expect(display.socket.connected).toBe(true);
    await server.restart();
    expect(await hasPassword(server, cookie)).toBe(false);
    await server.joinRoom(room.id);
    await server.joinDisplay(room.id, token);
  } finally { await server.dispose(); }
}, 20000);

test("everyone in the room is told when it gains or loses its password", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    expect(gm.info.room.hasPassword).toBe(false);
    for (const [value, expected] of [["secret", true], [null, false], ["secret", true], ["", false]] as const) {
      const told = [gm, player].map(peer => nextMessage(peer.socket, "room_state"));
      expect(await password(gm.socket, value)).toEqual({ ok: true });
      for (const [state] of await Promise.all(told)) expect(state.hasPassword).toBe(expected);
    }
    expect(await password(gm.socket, "secret")).toEqual({ ok: true });
    expect((await server.joinRoomAsGM(room.id, cookie)).info.room.hasPassword).toBe(true);
  } finally { await server.dispose(); }
}, 20000);
