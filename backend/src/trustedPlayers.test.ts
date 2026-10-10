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
    const legacyParty = nextMessage(gm.socket, "party_state");
    legacy.socket.emit("player_state", { userId: "remembered", nickname: "Same name" });
    expect((await legacyParty)[0][legacy.socket.id!].userId).toBeUndefined();
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    expect(await trust(display.socket, "remembered", true)).toEqual({ ok: false, error: "not_room_gm" });
    for (const peer of [first, second, stranger]) {
      const party = nextMessage(gm.socket, "party_state");
      peer.socket.emit("player_state", { userId: "remembered", nickname: "Same name", role: "gm" });
      expect((await party)[0][peer.socket.id!].userId).toBe(peer === stranger ? "stranger" : "remembered");
    }
    expect(await trust(first.socket, "remembered", true)).toEqual({ ok: false, error: "not_room_gm" });
    for (const [id, value] of [["", true], [null, true], ["remembered", 1]]) {
      expect(await trust(gm.socket, id, value)).toEqual({ ok: false, error: "invalid" });
    }
    const roles = [first, second].map(peer => nextMessage(peer.socket, "player_role"));
    const parties = [gm, first, second, stranger, display].map(peer => nextMessage(peer.socket, "party_state"));
    expect(await trust(gm.socket, "remembered", true)).toEqual({ ok: true });
    for (const role of await Promise.all(roles)) expect(role).toEqual(["trusted"]);
    for (const [party] of await Promise.all(parties)) {
      expect(party[first.socket.id!].role).toBe("trusted");
      expect(party[second.socket.id!].role).toBe("trusted");
      expect(party[stranger.socket.id!].role).toBe("player");
      expect(party[legacy.socket.id!].role).toBe("player");
      expect(party[display.socket.id!]).toBeUndefined();
    }
    const party = nextMessage(gm.socket, "party_state");
    first.socket.emit("player_state", { userId: "stranger", nickname: "Renamed", role: "player" });
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

test("trust immediately bypasses tool and upload switches but preserves GM settings boundaries", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Tools");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const first = await join(server, room.id, "remembered");
    const second = await join(server, room.id, "remembered");
    await new Promise(resolve => gm.socket.emit("room_switches", { tokens: false, drawing: false, notes: false, fog: false, uploads: false }, resolve));
    const state: any = { mapId: "map", tokens: {}, drawings: {}, notes: {}, fogs: {}, editFlags: [] };
    const saved = nextMessage(first.socket, "map_state");
    gm.socket.emit("map_state", state);
    await saved;
    const put = (token: string, id: string) => fetch(`${server.address}/assets/${id}`, { method: "PUT", body: new Uint8Array([1]), headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/png", "X-Asset-Width": "1", "X-Asset-Height": "1", "X-Asset-Owner": "player" } });
    const update = { id: "map", changes: ["tokens", "drawings", "notes", "fogs"].map(field => ({ kind: "N", path: [field, "placed"], rhs: true })) };
    const refused = nextMessage(first.socket, "map_state");
    first.socket.emit("map_state_update", update);
    expect((await refused)[0]).toEqual(state);
    expect((await put(first.token, "before")).status).toBe(403);
    await trust(gm.socket, "remembered", true);
    for (const peer of [first, second]) {
      const accepted = nextMessage(gm.socket, "map_state_update");
      peer.socket.emit("map_state_update", update);
      expect((await accepted)[0]).toEqual(update);
      expect((await put(peer.token, peer === first ? "first" : "second")).status).toBe(201);
    }
    for (const field of ["tokens", "drawings", "notes", "fogs"]) state[field].placed = true;
    for (const event of ["map", "map_state"]) {
      const denied = nextMessage(first.socket, event);
      first.socket.emit(event, { id: "forged", mapId: "forged" });
      expect((await denied)[0]).toEqual(event === "map" ? undefined : state);
    }
    for (const field of ["mapId", "editFlags", "settings", "unknown"]) {
      const denied = nextMessage(first.socket, "map_state");
      first.socket.emit("map_state_update", { id: "map", changes: [{ kind: "N", path: [field], rhs: true }] });
      expect((await denied)[0]).toEqual(state);
    }
    expect(await new Promise<any>(resolve => first.socket.emit("room_switches", { tokens: true }, resolve))).toEqual({ ok: false, error: "not_room_gm" });
    expect(await new Promise<any>(resolve => first.socket.emit("room_password", "secret", resolve))).toEqual({ ok: false, error: "not_room_gm" });
    expect(await new Promise<any>(resolve => first.socket.emit("new_display_link", resolve))).toEqual({ ok: false, error: "not_room_gm" });
    expect(await new Promise<any>(resolve => first.socket.emit("get_display_token", resolve))).toBeNull();
    const manifest = { mapId: "map", assets: { first: { id: "first", owner: "player" } } };
    const received = nextMessage(gm.socket, "manifest");
    first.socket.emit("manifest", manifest);
    expect((await received)[0]).toEqual(manifest);
    const added = nextMessage(gm.socket, "manifest_update");
    second.socket.emit("manifest_update", { id: "map", changes: [{ kind: "N", path: ["assets", "second"], rhs: { id: "second", owner: "player" } }] });
    await added;
    const roles = [first, second].map(peer => nextMessage(peer.socket, "player_role"));
    await trust(gm.socket, "remembered", false);
    for (const role of await Promise.all(roles)) expect(role).toEqual(["player"]);
    for (const peer of [first, second]) {
      const denied = nextMessage(peer.socket, "map_state");
      peer.socket.emit("map_state_update", update);
      expect((await denied)[0]).toEqual(state);
      expect((await put(peer.token, "after")).status).toBe(403);
      const deniedManifest = nextMessage(peer.socket, "manifest");
      peer.socket.emit("manifest", { mapId: "map", assets: { new: { id: "new", owner: "player" } } });
      expect((await deniedManifest)[0].assets.first.id).toBe("first");
    }
    await server.restart();
    expect((await join(server, room.id, "remembered")).info.role).toBe("player");
  } finally { await server.dispose(); }
}, 15000);
