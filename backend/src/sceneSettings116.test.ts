import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid } from "../../src/sceneRules";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise(resolve => socket.timeout(500).emit(event, value, (error: Error | null, result: unknown) => resolve(error ? "timeout" : result)));
const barrier = (socket: Socket) => new Promise(resolve => socket.emit("get_display_token", resolve));
const grid = { ...defaultSceneGrid, opacity: 0.25, lineWidth: 3, color: "#123AbC" };

test("settings on any named scene reach only its viewers and are saved immediately", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = await server.joinRoomAsGM(room.id, cookie);
    const openId = gm.snapshot!.scene!.id;
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Preparation" });
    const unexpected: unknown[] = [];
    gm.socket.on("scene_settings", value => unexpected.push(value));
    const expected = { sceneId: openId, grid, fogFill: true, viewOnly: true };
    const relays = [other, player, display].map(peer => nextMessage(peer.socket, "scene_settings"));
    const lists = [gm, other].map(peer => nextMessage(peer.socket, "scene_list"));
    expect(await action(gm.socket, "scene_settings", expected)).toEqual({ ok: true });
    for (const relay of relays) expect((await relay)[0]).toEqual(expected);
    for (const list of lists) expect((await list)[0].scenes).toContainEqual({ id: openId, name: "Scene 1", viewOnly: true });
    await barrier(gm.socket);
    expect(unexpected).toEqual([]);
    const own = nextMessage(gm.socket, "scene_settings");
    expect(await action(gm.socket, "scene_settings", { sceneId, fogFill: true })).toEqual({ ok: true });
    expect((await own)[0]).toEqual({ sceneId, grid: defaultSceneGrid, fogFill: true, viewOnly: false });
    const copy = await server.durableCopy();
    try {
      const saved = await copy.joinRoomAsGM(room.id, cookie);
      expect(saved.snapshot!.scene).toMatchObject({ id: openId, grid, fogFill: true, viewOnly: true });
      const snapshot = nextMessage(saved.socket, "scene_snapshot");
      await action(saved.socket, "scene_view", { sceneId });
      expect((await snapshot)[0].scene.fogFill).toBe(true);
    } finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("players, trusted players and cast displays cannot change scene settings", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const messages: unknown[] = [];
    for (const peer of [gm, player, trusted, display]) {
      for (const event of ["scene_settings", "scene_list"]) peer.socket.on(event, value => messages.push(value));
    }
    for (const peer of [player, trusted, display]) {
      expect(await action(peer.socket, "scene_settings", { sceneId: gm.snapshot!.scene!.id, grid, fogFill: true, viewOnly: true }))
        .toEqual({ ok: false, error: "not_room_gm" });
    }
    for (const peer of [gm, player, trusted, display]) await barrier(peer.socket);
    expect(messages).toEqual([]);
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene).toEqual(gm.snapshot!.scene);
  } finally { await server.dispose(); }
});

test("invalid or missing scene settings are refused atomically without sending state", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    const messages: unknown[] = [];
    for (const event of ["scene_settings", "scene_list"]) gm.socket.on(event, value => messages.push(value));
    for (const value of [
      null, [], "settings", {}, { sceneId }, { sceneId: 12, fogFill: true },
      { sceneId, grid, extra: true }, { sceneId, fogFill: 1 }, { sceneId, viewOnly: "true" },
      { sceneId, grid: null, fogFill: true }, { sceneId, grid: { ...grid, opacity: -0.1 }, viewOnly: true },
      { sceneId, grid: { ...grid, opacity: 1.1 } }, { sceneId, grid: { ...grid, lineWidth: 0 } },
      { sceneId, grid: { ...grid, lineWidth: 1000 } }, { sceneId, grid: { ...grid, color: "#abc" } },
    ]) expect(await action(gm.socket, "scene_settings", value)).toEqual({ ok: false, error: "invalid" });
    for (const missing of ["missing", "__proto__"]) {
      expect(await action(gm.socket, "scene_settings", { sceneId: missing, fogFill: true })).toEqual({ ok: false, error: "not_found" });
    }
    await barrier(gm.socket);
    expect(messages).toEqual([]);
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene).toEqual(gm.snapshot!.scene);
  } finally { await server.dispose(); }
});

test("partial settings preserve other values and refresh the list only when view-only changes", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    const lists: unknown[] = [];
    gm.socket.on("scene_list", value => lists.push(value));
    const settings = [
      { patch: { grid }, expected: { grid, fogFill: false, viewOnly: false } },
      { patch: { fogFill: true }, expected: { grid, fogFill: true, viewOnly: false } },
      { patch: { viewOnly: false }, expected: { grid, fogFill: true, viewOnly: false } },
      { patch: { fogFill: false }, expected: { grid, fogFill: false, viewOnly: false } },
    ];
    for (const { patch, expected } of settings) {
      const relay = nextMessage(gm.socket, "scene_settings");
      expect(await action(gm.socket, "scene_settings", { sceneId, ...patch })).toEqual({ ok: true });
      expect((await relay)[0]).toEqual({ sceneId, ...expected });
    }
    await barrier(gm.socket);
    expect(lists).toEqual([]);
  } finally { await server.dispose(); }
});
