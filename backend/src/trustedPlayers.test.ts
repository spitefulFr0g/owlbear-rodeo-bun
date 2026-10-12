import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const trust = (socket: Socket, id: unknown, trusted: unknown) => new Promise<any>(resolve => socket.emit("room_trust", id, trusted, resolve));
async function join(server: Awaited<ReturnType<typeof startTestServer>>, roomId: string, playerId?: string) {
  const socket = server.connect();
  const joined = nextMessage(socket, "joined_game");
  socket.emit("join_game", roomId, "", undefined, { playerId });
  const [, token, info] = await joined;
  return { socket, token, info };
}

test("trusted marks follow join identity across connections and restarts, with live role notifications", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Trust");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const first = await join(server, room.id, "remembered");
    const second = await join(server, room.id, "remembered");
    const stranger = await join(server, room.id, "stranger");
    const legacy = await join(server, room.id);
    const legacyParty = nextMessage(gm.socket, "presence_state");
    legacy.socket.emit("presence_update", { color: "blue", dice: { share: false, rolls: [] }, userId: "remembered", nickname: "Same name" });
    expect((await legacyParty)[0][legacy.socket.id!].userId).toBeUndefined();
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    expect(await trust(display.socket, "remembered", true)).toEqual({ ok: false, error: "not_room_gm" });
    for (const peer of [first, second, stranger]) {
      const party = nextMessage(gm.socket, "presence_state");
      peer.socket.emit("presence_update", { color: "blue", dice: { share: false, rolls: [] }, userId: "remembered", nickname: "Same name", role: "gm" });
      expect((await party)[0][peer.socket.id!].userId).toBe(peer === stranger ? "stranger" : "remembered");
    }
    expect(await trust(first.socket, "remembered", true)).toEqual({ ok: false, error: "not_room_gm" });
    for (const [id, value] of [["", true], [null, true], ["remembered", 1]]) {
      expect(await trust(gm.socket, id, value)).toEqual({ ok: false, error: "invalid" });
    }
    const roles = [first, second].map(peer => nextMessage(peer.socket, "player_role"));
    const parties = [gm, first, second, stranger, display].map(peer => nextMessage(peer.socket, "presence_state"));
    expect(await trust(gm.socket, "remembered", true)).toEqual({ ok: true });
    for (const role of await Promise.all(roles)) expect(role).toEqual(["trusted"]);
    for (const [party] of await Promise.all(parties)) {
      expect(party[first.socket.id!].role).toBe("trusted");
      expect(party[second.socket.id!].role).toBe("trusted");
      expect(party[stranger.socket.id!].role).toBe("player");
      expect(party[legacy.socket.id!].role).toBe("player");
      expect(party[display.socket.id!]).toBeUndefined();
    }
    const party = nextMessage(gm.socket, "presence_state");
    first.socket.emit("presence_update", { color: "blue", dice: { share: false, rolls: [] }, userId: "stranger", nickname: "Renamed", role: "player" });
    expect((await party)[0][first.socket.id!]).toMatchObject({ userId: "remembered", role: "trusted" });
    const otherRoom = await createRoom(server, cookie, "Other room");
    expect((await join(server, otherRoom.id, "remembered")).info.role).toBe("player");
    const copy = await server.durableCopy();
    try { expect((await join(copy, room.id, "remembered")).info.role).toBe("trusted"); }
    finally { await copy.dispose(); }
    await server.restart();
    expect((await join(server, room.id, "remembered")).info.role).toBe("trusted");
    expect((await join(server, room.id, "stranger")).info.role).toBe("player");
  } finally { await server.dispose(); }
}, 15000);
