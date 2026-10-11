import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise(resolve => socket.emit(event, value, resolve));

test("renaming reaches every GM and deleting moves viewers to the open scene, saved immediately", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = await server.joinRoomAsGM(room.id, cookie);
    const openId = gm.snapshot!.scene.id;
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Preparation" });
    await action(other.socket, "scene_view", { sceneId });
    const lists = [nextMessage(gm.socket, "scene_list"), nextMessage(other.socket, "scene_list")];
    expect(await action(gm.socket, "scene_rename", { sceneId, name: "  Scene 1  " })).toEqual({ ok: true });
    for (const list of lists) expect((await list)[0].scenes.filter((scene: any) => scene.name === "Scene 1")).toHaveLength(2);
    const renamedCopy = await server.durableCopy();
    try {
      const socket = renamedCopy.connect(cookie);
      const list = nextMessage(socket, "scene_list");
      socket.emit("join_game", room.id, "");
      expect((await list)[0].scenes).toContainEqual({ id: sceneId, name: "Scene 1", viewOnly: false });
    } finally { await renamedCopy.dispose(); }
    const snapshots = [nextMessage(gm.socket, "scene_snapshot"), nextMessage(other.socket, "scene_snapshot")];
    const deletedLists = [nextMessage(gm.socket, "scene_list"), nextMessage(other.socket, "scene_list")];
    expect(await action(gm.socket, "scene_delete", { sceneId })).toEqual({ ok: true });
    for (const snapshot of snapshots) expect((await snapshot)[0].scene.id).toBe(openId);
    for (const list of deletedLists) expect((await list)[0].scenes).toEqual([{ id: openId, name: "Scene 1", viewOnly: false }]);
    const copy = await server.durableCopy();
    try {
      const socket = copy.connect(cookie);
      const list = nextMessage(socket, "scene_list");
      socket.emit("join_game", room.id, "");
      expect((await list)[0].scenes).toEqual([{ id: openId, name: "Scene 1", viewOnly: false }]);
      const joined = await copy.joinRoomAsGM(room.id, cookie);
      expect(await action(joined.socket, "scene_view", { sceneId })).toEqual({ ok: false, error: "not_found" });
    } finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("invalid names, malformed actions, missing scenes and deleting the open scene emit nothing", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const sceneId = gm.snapshot!.scene.id;
    const messages: unknown[] = [];
    for (const event of ["scene_list", "scene_snapshot"]) gm.socket.on(event, value => messages.push(value));
    for (const name of ["", " \n ", "x".repeat(101), null, 12]) {
      expect(await action(gm.socket, "scene_create", { name })).toEqual({ ok: false, error: "invalid" });
      expect(await action(gm.socket, "scene_rename", { sceneId, name })).toEqual({ ok: false, error: "invalid" });
    }
    for (const event of ["scene_rename", "scene_delete"]) {
      for (const value of [null, [], "id", {}, { sceneId: 12 }, { sceneId, name: "Name", extra: true }]) {
        expect(await action(gm.socket, event, value)).toEqual({ ok: false, error: "invalid" });
      }
      for (const missing of ["missing", "__proto__"]) {
        expect(await action(gm.socket, event, { sceneId: missing, ...(event === "scene_rename" ? { name: "Name" } : {}) })).toEqual({ ok: false, error: "not_found" });
      }
    }
    expect(await action(gm.socket, "scene_delete", { sceneId, name: "extra" })).toEqual({ ok: false, error: "invalid" });
    expect(await action(gm.socket, "scene_delete", { sceneId })).toEqual({ ok: false, error: "open_scene" });
    expect(messages).toEqual([]);
  } finally { await server.dispose(); }
});

test("players, trusted players and cast displays cannot rename or delete scenes", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Secret" });
    const messages: unknown[] = [];
    for (const peer of [gm, player, trusted, display]) {
      for (const event of ["scene_list", "scene_snapshot"]) peer.socket.on(event, value => messages.push(value));
    }
    for (const peer of [player, trusted, display]) {
      expect(await action(peer.socket, "scene_rename", { sceneId, name: "Denied" })).toEqual({ ok: false, error: "not_room_gm" });
      expect(await action(peer.socket, "scene_delete", { sceneId })).toEqual({ ok: false, error: "not_room_gm" });
    }
    expect(messages).toEqual([]);
  } finally { await server.dispose(); }
});

test("a room accepts its hundredth scene and refuses further creation without moving its GM", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    let lastId = "";
    for (let count = 2; count <= 100; count++) {
      const result = await action(gm.socket, "scene_create", { name: "x".repeat(100) });
      expect(result.ok).toBe(true);
      lastId = result.sceneId;
    }
    const messages: unknown[] = [];
    for (const event of ["scene_list", "scene_snapshot"]) gm.socket.on(event, value => messages.push(value));
    expect(await action(gm.socket, "scene_create", { name: "Overflow" })).toEqual({ ok: false, error: "cap" });
    expect(messages).toEqual([]);
    expect(await action(gm.socket, "scene_delete", { sceneId: lastId })).toEqual({ ok: true });
    expect((await action(gm.socket, "scene_create", { name: "Room again" })).ok).toBe(true);
  } finally { await server.dispose(); }
});

test("deleting the scene players last held outside a session leaves them on the open scene", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const firstId = gm.snapshot!.scene.id;
    const player = await server.joinRoom(room.id, "", "player");
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Next" });
    expect(await action(gm.socket, "scene_show", { sceneId, view: { x: 0, y: 0, width: 100, height: 100 } })).toEqual({ ok: true });
    const snapshots: unknown[] = [];
    player.socket.on("scene_snapshot", value => snapshots.push(value));
    expect(await action(gm.socket, "scene_delete", { sceneId: firstId })).toEqual({ ok: true });
    const answer = nextMessage(player.socket, "scene_answer");
    player.socket.emit("scene_changes", { id: "batch", sceneId: firstId, changes: [{ type: "delete", id: "item" }] });
    expect((await answer)[0]).toEqual({ batchId: "batch", sceneId: firstId, applied: [], refused: [{ id: "item", item: null }] });
    expect(snapshots).toEqual([]);
    const snapshot = nextMessage(player.socket, "scene_snapshot");
    await action(gm.socket, "session", true);
    expect((await snapshot)[0].scene.id).toBe(sceneId);
  } finally { await server.dispose(); }
});
