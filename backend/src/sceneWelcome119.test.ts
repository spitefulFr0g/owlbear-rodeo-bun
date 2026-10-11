import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid } from "../../src/sceneRules";
import { tokenItem } from "./testing/sceneFixtures";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise((resolve, reject) => socket.timeout(2000).emit(event, value, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result)));
const view = { x: 100, y: 200, width: 900, height: 600 };

async function table() {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Welcome");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    return { server, cookie, room, gm, player, trusted, display, token, waiting: [player, trusted, display] };
  } catch (error) { await server.dispose(); throw error; }
}

test("only the GM assigns a valid welcome screen, saves it immediately and clears it on deletion", async () => {
  const { server, cookie, room, gm, waiting, token } = await table();
  try {
    for (const peer of waiting) expect(peer.snapshot).toEqual({ scene: null });
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Welcome scene" });
    for (const peer of waiting) {
      expect(await action(peer.socket, "scene_welcome", { sceneId })).toEqual({ ok: false, error: "not_room_gm" });
    }
    for (const payload of [null, [], {}, { sceneId: 4 }, { sceneId, extra: true }]) {
      expect(await action(gm.socket, "scene_welcome", payload)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await action(gm.socket, "scene_welcome", { sceneId: "missing" })).toEqual({ ok: false, error: "not_found" });
    const snapshots = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
    const list = nextMessage(gm.socket, "scene_list");
    expect(await action(gm.socket, "scene_welcome", { sceneId })).toEqual({ ok: true });
    expect((await list)[0].welcomeSceneId).toBe(sceneId);
    for (const [snapshot] of await Promise.all(snapshots)) {
      expect(snapshot.scene.id).toBe(sceneId);
      expect(snapshot.scene.name).toBeUndefined();
    }
    const copy = await server.durableCopy();
    try {
      expect((await copy.joinRoom(room.id)).snapshot!.scene!.id).toBe(sceneId);
      expect((await copy.joinDisplay(room.id, token)).snapshot!.scene!.id).toBe(sceneId);
      const joinedGM = await copy.joinRoomAsGM(room.id, cookie);
      const copiedList = nextMessage(joinedGM.socket, "scene_list");
      await action(joinedGM.socket, "scene_welcome", { sceneId: null });
      expect((await copiedList)[0].welcomeSceneId).toBeNull();
    } finally { await copy.dispose(); }
    const deleted = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
    expect(await action(gm.socket, "scene_delete", { sceneId })).toEqual({ ok: true });
    for (const [snapshot] of await Promise.all(deleted)) expect(snapshot).toEqual({ scene: null });
    // A stale batch on the default welcome screen is refused without dereferencing a scene.
    expect((await sendBatch(waiting[0].socket, { id: "stale", sceneId, changes: [{ type: "add", item: tokenItem }] })).refused)
      .toEqual([{ id: tokenItem.id, item: null }]);
  } finally { await server.dispose(); }
});

test("waiting viewers receive only their welcome scene's changes and pointers, while all player edits are refused", async () => {
  const { server, room, gm, player, trusted, waiting } = await table();
  try {
    await action(gm.socket, "room_switches", { tokens: true, drawing: true, notes: true, fog: true, uploads: true, ownerOnly: false });
    const openSceneId = gm.snapshot!.scene!.id;
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Welcome scene" });
    await action(gm.socket, "scene_welcome", { sceneId });
    const changes = waiting.map(peer => nextMessage(peer.socket, "scene_changes"));
    await sendBatch(gm.socket, { id: "gm", sceneId, changes: [{ type: "add", item: tokenItem }] });
    for (const [batch] of await Promise.all(changes)) expect(batch.sceneId).toBe(sceneId);
    for (const peer of [player, trusted]) {
      const refused = await sendBatch(peer.socket, { id: "refused", sceneId, changes: [
        { type: "add", item: { ...tokenItem, id: "new" } },
        { type: "update", id: tokenItem.id, fields: { position: { x: 1, y: 2 } } },
        { type: "delete", id: tokenItem.id },
      ] });
      expect(refused.applied).toEqual([]);
      expect(refused.refused).toHaveLength(3);
    }
    const settings = waiting.map(peer => nextMessage(peer.socket, "scene_settings"));
    await action(gm.socket, "scene_settings", { sceneId, grid: { ...defaultSceneGrid, shown: false }, fogFill: true });
    for (const [setting] of await Promise.all(settings)) expect(setting.fogFill).toBe(true);
    const grids = waiting.map(peer => nextMessage(peer.socket, "scene_grid"));
    await action(gm.socket, "scene_grid", { sceneId, grid: defaultSceneGrid });
    for (const [grid] of await Promise.all(grids)) expect(grid.sceneId).toBe(sceneId);
    const pointers = [gm, trusted, waiting[2]].map(peer => nextMessage(peer.socket, "player_pointer"));
    player.socket.emit("player_pointer", { position: { x: 1, y: 2 } });
    for (const [pointer] of await Promise.all(pointers)) expect(pointer.position).toEqual({ x: 1, y: 2 });
    const leaked: unknown[] = [];
    for (const peer of waiting) peer.socket.onAny((event, value) => {
      if (["scene_changes", "scene_grid", "scene_settings", "player_pointer", "display_view", "player_view", "scene_list"].includes(event)) leaked.push([event, value]);
    });
    await action(gm.socket, "scene_view", { sceneId: openSceneId });
    await sendBatch(gm.socket, { id: "other", sceneId: openSceneId, changes: [{ type: "add", item: tokenItem }] });
    gm.socket.emit("player_pointer", { position: { x: 3, y: 4 } });
    gm.socket.emit("display_view", { sceneId: openSceneId, ...view });
    await action(gm.socket, "scene_settings", { sceneId: openSceneId, fogFill: true });
    await action(gm.socket, "scene_grid", { sceneId: openSceneId, grid: defaultSceneGrid });
    // Round trips on each socket drain messages sent before the barriers.
    for (const peer of waiting) await action(peer.socket, "scene_welcome", { sceneId });
    expect(leaked).toEqual([]);
    expect((await server.joinRoom(room.id)).snapshot!.scene!.items[tokenItem.id]).toBeDefined();
  } finally { await server.dispose(); }
});

test("session start and end move all waiting viewers, welcome changes take effect immediately and the scene's own flag applies during play", async () => {
  const { server, gm, player, trusted, waiting } = await table();
  try {
    const openSceneId = gm.snapshot!.scene!.id;
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Welcome scene" });
    await action(gm.socket, "scene_welcome", { sceneId });
    const start = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
    await action(gm.socket, "session", true);
    for (const [snapshot] of await Promise.all(start)) expect(snapshot.scene.id).toBe(openSceneId);
    const during: unknown[] = [];
    for (const peer of waiting) peer.socket.on("scene_snapshot", snapshot => during.push(snapshot));
    await action(gm.socket, "scene_welcome", { sceneId: openSceneId });
    for (const peer of waiting) await action(peer.socket, "scene_welcome", { sceneId });
    expect(during).toEqual([]);
    await action(gm.socket, "room_switches", { tokens: true });
    for (const peer of [player, trusted]) {
      expect((await sendBatch(peer.socket, { id: "play", sceneId: openSceneId, changes: [{ type: "add", item: { ...tokenItem, id: peer === player ? "player" : "trusted" } }] })).refused).toEqual([]);
    }
    await action(gm.socket, "scene_settings", { sceneId: openSceneId, viewOnly: true });
    expect((await sendBatch(trusted.socket, { id: "own-flag", sceneId: openSceneId, changes: [{ type: "add", item: tokenItem }] })).applied).toEqual([]);
    await action(gm.socket, "scene_settings", { sceneId: openSceneId, viewOnly: false });
    const end = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
    await action(gm.socket, "session", false);
    for (const [snapshot] of await Promise.all(end)) expect(snapshot.scene.id).toBe(openSceneId);
    expect((await sendBatch(trusted.socket, { id: "welcome-rule", sceneId: openSceneId, changes: [{ type: "add", item: tokenItem }] })).applied).toEqual([]);
    for (const target of [sceneId, null]) {
      const switched = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
      await action(gm.socket, "scene_welcome", { sceneId: target });
      for (const [snapshot] of await Promise.all(switched)) expect(snapshot.scene?.id ?? null).toBe(target);
    }
  } finally { await server.dispose(); }
});

test("the automatic session end returns players and cast displays to the welcome scene", async () => {
  const { server, gm, player, waiting } = await table();
  try {
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Welcome scene" });
    await action(gm.socket, "scene_welcome", { sceneId });
    await action(gm.socket, "session", true);
    const left = nextMessage(player.socket, "player_left");
    gm.socket.disconnect();
    await left;
    const ended = waiting.map(peer => nextMessage(peer.socket, "scene_snapshot"));
    await server.clock.advance(5 * 60 * 1000);
    for (const [snapshot] of await Promise.all(ended)) expect(snapshot.scene.id).toBe(sceneId);
  } finally { await server.dispose(); }
});
