import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid } from "../../src/sceneRules";
import { tokenItem } from "./testing/sceneFixtures";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise(resolve => socket.timeout(500).emit(event, value, (error: Error | null, result: unknown) => resolve(error ? "timeout" : result)));

test("duplicating preserves the complete scene, leaves viewers in place and saves an independent copy immediately", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    const grid = { ...defaultSceneGrid, opacity: 0.25, color: "#123456" };
    await action(gm.socket, "scene_settings", { sceneId, grid, fogFill: true, viewOnly: true });
    await action(gm.socket, "scene_welcome", { sceneId });
    await sendBatch(gm.socket, { id: "add", sceneId, changes: [{ type: "add", item: { ...tokenItem, hidden: true, locked: true } }] });
    expect((await sendBatch(gm.socket, { id: "add-second", sceneId, changes: [
      { type: "add", item: { ...tokenItem, id: "second", hidden: false } },
      { type: "update", id: tokenItem.id, fields: { owner: "player-owner" } },
    ] })).refused).toEqual([]);
    const originalSnapshot = nextMessage(gm.socket, "scene_snapshot");
    await action(gm.socket, "scene_view", { sceneId });
    const original = (await originalSnapshot)[0].scene;
    expect(original.items.hero).toMatchObject({ id: "hero", owner: "player-owner", hidden: true, locked: true, order: 0 });
    expect(original.items.second).toMatchObject({ id: "second", owner: "gm", hidden: false, locked: false, order: 1 });
    const unexpected: unknown[] = [];
    for (const peer of [gm, other]) peer.socket.on("scene_snapshot", value => unexpected.push(value));
    const lists = [gm, other].map(peer => nextMessage(peer.socket, "scene_list"));
    const result = await action(gm.socket, "scene_duplicate", { sceneId });
    expect(result.ok).toBe(true);
    expect(result.sceneId).not.toBe(sceneId);
    for (const list of lists) expect((await list)[0]).toEqual({
      scenes: [{ id: sceneId, name: "Scene 1", viewOnly: true }, { id: result.sceneId, name: "Scene 1 copy", viewOnly: true }],
      openSceneId: sceneId, welcomeSceneId: sceneId,
    });
    expect(unexpected).toEqual([]);
    // A batch accepted on the original proves the sender was not moved.
    expect((await sendBatch(gm.socket, { id: "still-viewing", sceneId, changes: [{ type: "update", id: tokenItem.id, fields: { label: "Hero" } }] })).refused).toEqual([]);
    const durable = await server.durableCopy();
    try {
      const saved = await durable.joinRoomAsGM(room.id, cookie);
      const snapshot = nextMessage(saved.socket, "scene_snapshot");
      await action(saved.socket, "scene_view", { sceneId: result.sceneId });
      expect((await snapshot)[0].scene).toEqual({ ...original, id: result.sceneId });
    } finally { await durable.dispose(); }
    const snapshot = nextMessage(gm.socket, "scene_snapshot");
    await action(gm.socket, "scene_view", { sceneId: result.sceneId });
    expect((await snapshot)[0].scene).toEqual({ ...original, id: result.sceneId });
    await sendBatch(gm.socket, { id: "delete-copy-item", sceneId: result.sceneId, changes: [{ type: "delete", id: tokenItem.id }] });
    await action(gm.socket, "scene_settings", { sceneId: result.sceneId, fogFill: false, grid: defaultSceneGrid });
    const unchanged = nextMessage(other.socket, "scene_snapshot");
    await action(other.socket, "scene_view", { sceneId });
    expect((await unchanged)[0].scene).toEqual(original);
  } finally { await server.dispose(); }
});

test("95-character names can be copied but 96–100-character names receive an explanatory error without changing state", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    await action(gm.socket, "scene_rename", { sceneId, name: "x".repeat(95) });
    const list = nextMessage(gm.socket, "scene_list");
    const result = await action(gm.socket, "scene_duplicate", { sceneId });
    expect(result.ok).toBe(true);
    expect((await list)[0].scenes).toContainEqual({ id: result.sceneId, name: "x".repeat(95) + " copy", viewOnly: false });
    for (let length = 96; length <= 100; length++) {
      await action(gm.socket, "scene_rename", { sceneId, name: "x".repeat(length) });
      const messages: unknown[] = [];
      const receive = (value: unknown) => messages.push(value);
      gm.socket.on("scene_list", receive);
      gm.socket.on("scene_snapshot", receive);
      const refused = await action(gm.socket, "scene_duplicate", { sceneId });
      expect(refused).toEqual({ ok: false, error: "Cannot duplicate: adding ' copy' would exceed the 100-character scene name limit." });
      expect(messages).toEqual([]);
      gm.socket.off("scene_list", receive);
      gm.socket.off("scene_snapshot", receive);
    }
    const durable = await server.durableCopy();
    try {
      const socket = durable.connect(cookie);
      const saved = nextMessage(socket, "scene_list");
      socket.emit("join_game", room.id, "");
      expect((await saved)[0]).toEqual({ scenes: [
        { id: sceneId, name: "x".repeat(100), viewOnly: false },
        { id: result.sceneId, name: "x".repeat(95) + " copy", viewOnly: false },
      ], openSceneId: sceneId, welcomeSceneId: null });
    } finally { await durable.dispose(); }
  } finally { await server.dispose(); }
});

test("duplicate refuses malformed payloads, missing scenes, non-GMs and rooms at the scene cap", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene!.id;
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const messages: unknown[] = [];
    for (const peer of [gm, player, trusted, display]) {
      for (const event of ["scene_list", "scene_snapshot"]) peer.socket.on(event, value => messages.push(value));
    }
    for (const peer of [player, trusted, display]) expect(await action(peer.socket, "scene_duplicate", { sceneId })).toEqual({ ok: false, error: "not_room_gm" });
    for (const value of [null, [], "id", {}, { sceneId: 12 }, { sceneId, extra: true }]) {
      expect(await action(gm.socket, "scene_duplicate", value)).toEqual({ ok: false, error: "invalid" });
    }
    for (const missing of ["missing", "__proto__"]) expect(await action(gm.socket, "scene_duplicate", { sceneId: missing })).toEqual({ ok: false, error: "not_found" });
    expect(messages).toEqual([]);
    for (let count = 2; count <= 100; count++) expect((await action(gm.socket, "scene_create", { name: "Scene" })).ok).toBe(true);
    messages.length = 0;
    expect(await action(gm.socket, "scene_duplicate", { sceneId })).toEqual({ ok: false, error: "cap" });
    expect(messages).toEqual([]);
  } finally { await server.dispose(); }
});
