import { expect, test } from "bun:test";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
import type { Socket } from "socket.io-client";

const defaults = { tokens: true, drawing: true, notes: true, fog: false, uploads: false };
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
    expect(await change(player.socket, { fog: true })).toEqual({ ok: false, error: "not_room_gm" });
    for (const invalid of [null, [], { tokens: 1 }, { tokens: false, unknown: true }]) {
      expect(await change(gm.socket, invalid)).toEqual({ ok: false, error: "invalid" });
    }
    gm.socket.emit("player_state", { userId: "gm" });
    gm.socket.emit("map", { id: "map", owner: "gm" });
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    expect(display.info.room.switches).toEqual(defaults);
    expect(await change(display.socket, { tokens: false })).toEqual({ ok: false, error: "not_room_gm" });
    const messages = [gm, player, display].map(peer => nextMessage(peer.socket, "room_state"));
    expect(await change(gm.socket, { tokens: false, fog: true, uploads: true })).toEqual({ ok: true });
    const switches = { ...defaults, tokens: false, fog: true, uploads: true };
    for (const message of await Promise.all(messages)) expect(message[0]).toEqual({ name: "Table", switches, session: true });
    const renamed = nextMessage(player.socket, "room_state");
    await fetch(`${server.address}/api/rooms/${room.id}`, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }) });
    expect((await renamed)[0]).toEqual({ name: "Renamed", switches, session: true });
    await server.clock.advance(3000);
    await server.restart();
    expect((await server.joinRoom(room.id)).info.room).toEqual({ name: "Renamed", switches, session: false });
  } finally { await server.dispose(); }
}, 15000);

test("each placed-state kind requires its room switch while GM changes bypass all switches", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const state: any = { mapId: "map", tokens: {}, drawings: {}, notes: {}, fogs: {}, editFlags: [] };
    const saved = nextMessage(player.socket, "map_state");
    gm.socket.emit("map_state", state);
    await saved;
    let forwarded = 0;
    gm.socket.on("map_state_update", () => forwarded++);
    for (const [key, field] of [["tokens", "tokens"], ["drawing", "drawings"], ["notes", "notes"], ["fog", "fogs"]]) {
      await change(gm.socket, { [key]: false });
      const update = { id: "map", changes: [{ kind: "N", path: [field, "player"], rhs: true }] };
      const refused = nextMessage(player.socket, "map_state");
      player.socket.emit("map_state_update", update);
      expect((await refused)[0]).toEqual(state);
      const gmUpdate = { id: "map", changes: [{ kind: "N", path: [field, "gm"], rhs: true }] };
      const accepted = nextMessage(player.socket, "map_state_update");
      gm.socket.emit("map_state_update", gmUpdate);
      await accepted;
      state[field].gm = true;
      await change(gm.socket, { [key]: true });
      const allowed = nextMessage(gm.socket, "map_state_update");
      player.socket.emit("map_state_update", update);
      expect((await allowed)[0]).toEqual(update);
      state[field].player = true;
    }
    expect(forwarded).toBe(4);
    await change(gm.socket, { notes: false });
    for (const changes of [
      [{ kind: "N", path: ["tokens", "mixed"], rhs: true }, { kind: "N", path: ["notes", "mixed"], rhs: true }],
      [{ kind: "N", path: ["unknown"], rhs: true }],
      [{ kind: "N", path: ["tokens", "mixedUnknown"], rhs: true }, { kind: "N", path: ["unknown"], rhs: true }],
      [{ kind: "E", path: ["editFlags"], rhs: ["fog"], lhs: [] }],
      [{ kind: "N", rhs: { tokens: {} } }],
    ]) {
      const refused = nextMessage(player.socket, "map_state");
      player.socket.emit("map_state_update", { id: "map", changes });
      expect((await refused)[0]).toEqual(state);
    }
    expect(forwarded).toBe(4);
    await change(gm.socket, { notes: true });
    const mixed = { id: "map", changes: ["tokens", "notes"].map(field => ({ kind: "N", path: [field, "mixed"], rhs: true })) };
    const accepted = nextMessage(gm.socket, "map_state_update");
    player.socket.emit("map_state_update", mixed);
    await accepted;
    const unknown = nextMessage(player.socket, "map_state_update");
    gm.socket.emit("map_state_update", { id: "map", changes: [{ kind: "N", path: ["unknown"], rhs: true }] });
    await unknown;
    await server.restart();
    const restored = await server.joinRoomAsGM(room.id, cookie);
    expect(restored.state.mapState.editFlags).toEqual([]);
    expect(restored.state.mapState.unknown).toBe(true);
  } finally { await server.dispose(); }
}, 15000);

test("player updates cannot traverse object prototypes through a permitted tool", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Table");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const state = { mapId: "map", tokens: {}, drawings: {}, notes: {}, fogs: {} };
    const saved = nextMessage(player.socket, "map_state");
    gm.socket.emit("map_state", state);
    await saved;
    // Deleting a nonexistent inherited field proves the traversal without
    // polluting the test process when this regression runs against old code.
    for (const path of [["tokens", "__proto__", "reviewMissing"], ["tokens", "constructor", "prototype", "reviewMissing"]]) {
      const refused = nextMessage(player.socket, "map_state");
      player.socket.emit("map_state_update", { id: "map", changes: [{ kind: "D", path }] });
      expect((await refused)[0]).toEqual(state);
    }
    const nested = nextMessage(player.socket, "map_state");
    player.socket.emit("map_state_update", { id: "map", changes: [
      { kind: "N", path: ["tokens", "partial"], rhs: true },
      { kind: "A", path: ["tokens"], index: "__proto__", item: { kind: "D", path: ["reviewMissing"] } },
    ] });
    expect((await nested)[0]).toEqual(state);
    const manifest = { mapId: "map", assets: {} };
    const manifestSaved = nextMessage(player.socket, "manifest");
    gm.socket.emit("manifest", manifest);
    await manifestSaved;
    await new Promise(resolve => gm.socket.emit("room_switches", { uploads: true }, resolve));
    const manifestRefused = nextMessage(player.socket, "manifest");
    player.socket.emit("manifest_update", { id: "map", changes: [
      { kind: "N", path: ["assets", "partial"], rhs: { id: "partial", owner: "player" } },
      { kind: "D", path: ["assets", "__proto__", "reviewMissing"] },
    ] });
    expect((await manifestRefused)[0]).toEqual(manifest);
  } finally { await server.dispose(); }
}, 15000);
