import { SceneGrid } from "../../src/sceneRules";
import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const change = (socket: Socket, value: unknown) => new Promise<any>(resolve =>
  socket.timeout(500).emit("scene_grid", value, (error: Error | null, result: unknown) => resolve(error ? "timeout" : result)));
const grid: SceneGrid = { type: "hexVertical", unitsPerCell: 150, measurement: { type: "euclidean", scale: "10m" }, shown: false, snap: false };

test("the GM changes the scene grid for every viewer and keeps it across a restart", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await new Promise(resolve => gm.socket.emit("session", true, resolve));
    const player = await server.joinRoom(room.id);
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    const otherGM = await server.joinRoomAsGM(room.id, cookie);
    const payload = { sceneId: gm.snapshot!.scene.id, grid };
    const relays = [gm, player, display, otherGM].map(peer => nextMessage(peer.socket, "scene_grid"));
    expect(await change(gm.socket, payload)).toEqual({ ok: true });
    for (const relay of relays) expect((await relay)[0]).toEqual(payload);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.grid).toEqual(grid);
  } finally { await server.dispose(); }
});

test("players, trusted players and cast displays cannot change the scene grid", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "player-browser");
    const trusted = await server.joinRoom(room.id, "", "trusted-browser");
    expect(await new Promise<any>(resolve => gm.socket.emit("room_trust", "trusted-browser", true, resolve))).toEqual({ ok: true });
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    for (const peer of [player, trusted, display]) {
      expect(await change(peer.socket, { sceneId: gm.snapshot!.scene.id, grid })).toEqual({ ok: false, error: "not_room_gm" });
    }
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.grid).toEqual(gm.snapshot!.scene.grid);
  } finally { await server.dispose(); }
});

test("malformed grid changes are refused without changing the scene", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    for (const value of [
      null, [], {}, { sceneId: "elsewhere", grid }, { sceneId, grid: [] },
      ...[
        { ...grid, type: "unknown" }, { ...grid, unitsPerCell: 100 },
        { ...grid, unitsPerCell: NaN }, { ...grid, unitsPerCell: Infinity },
        { ...grid, shown: 1 }, { ...grid, snap: "true" }, { ...grid, extra: true },
        { ...grid, measurement: null }, { ...grid, measurement: [] },
        { ...grid, measurement: { type: "unknown", scale: "5ft" } },
        { ...grid, measurement: { type: "manhattan", scale: 5 } },
        { ...grid, measurement: { type: "manhattan", scale: "5ft", extra: true } },
        { type: "square", unitsPerCell: 150, measurement: grid.measurement, shown: true },
      ].map(invalid => ({ sceneId, grid: invalid })),
    ]) expect(await change(gm.socket, value)).toEqual({ ok: false, error: "invalid" });
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.grid).toEqual(gm.snapshot!.scene.grid);
  } finally { await server.dispose(); }
});

test("grid changes stay with GM connections outside a session and save after the delay", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id);
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    const events: unknown[] = [];
    player.socket.on("scene_grid", value => events.push(value));
    display.socket.on("scene_grid", value => events.push(value));
    for (const type of ["square", "hexHorizontal"]) {
      expect(await change(gm.socket, { sceneId: gm.snapshot!.scene.id, grid: { ...grid, type } })).toEqual({ ok: true });
    }
    await new Promise(resolve => player.socket.emit("get_display_token", resolve));
    await new Promise(resolve => display.socket.emit("get_display_token", resolve));
    expect(events).toEqual([]);
    await server.clock.advance(3000);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(room.id, cookie)).snapshot!.scene.grid).toEqual({ ...grid, type: "hexHorizontal" }); }
    finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});
