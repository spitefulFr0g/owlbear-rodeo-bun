import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const defaults = { tokens: true, drawing: true, notes: true, fog: false, uploads: false, ownerOnly: false };
const change = (socket: Socket, value: unknown) => new Promise<any>(resolve => socket.emit("room_switches", value, resolve));

test("room switches default, reject players and malformed changes, broadcast and survive restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    expect(player.info.room.switches).toEqual(defaults);
    expect(await change(player.socket, { ownerOnly: true })).toEqual({ ok: false, error: "not_room_gm" });
    for (const invalid of [null, [], { ownerOnly: 1 }, { tokens: false, unknown: true }]) {
      expect(await change(gm.socket, invalid)).toEqual({ ok: false, error: "invalid" });
    }
    gm.socket.emit("presence_update", { nickname: "", color: "blue", dice: { share: false, rolls: [] }, userId: "gm" });
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    expect(display.info.room.switches).toEqual(defaults);
    expect(await change(display.socket, { tokens: false })).toEqual({ ok: false, error: "not_room_gm" });
    const messages = [gm, player, display].map(peer => nextMessage(peer.socket, "room_state"));
    expect(await change(gm.socket, { tokens: false, fog: true, uploads: true, ownerOnly: true })).toEqual({ ok: true });
    const switches = { ...defaults, tokens: false, fog: true, uploads: true, ownerOnly: true };
    for (const message of await Promise.all(messages)) expect(message[0]).toEqual({ name: "Table", switches, session: true, hasPassword: false });
    const renamed = nextMessage(player.socket, "room_state");
    await fetch(`${server.address}/api/rooms/${room.id}`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }) });
    expect((await renamed)[0]).toEqual({ name: "Renamed", switches, session: true, hasPassword: false });
    await server.clock.advance(3000);
    await server.restart();
    expect((await server.joinRoom(room.id)).info.room).toEqual({ name: "Renamed", switches, session: false, hasPassword: false });
  } finally { await server.dispose(); }
}, 15000);
