import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid, ImageItem } from "../../src/sceneRules";
import { createRoom, nextMessage, sendBatch, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise(resolve => socket.emit(event, value, resolve));
const barrier = (socket: Socket) => new Promise(resolve => socket.emit("get_display_token", resolve));
const token: ImageItem = { id: "hero", kind: "image", layer: "character", position: { x: 150, y: 300 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 999, owner: "forged", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero",
  outline: { type: "circle", x: 75, y: 75, radius: 75 } };

test("GM scene lists arrive between join and snapshot, and creating a scene saves its name immediately", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const socket = server.connect(cookie);
    const events: string[] = [];
    for (const event of ["joined_game", "scene_list", "scene_snapshot"]) socket.on(event, () => events.push(event));
    const list = nextMessage(socket, "scene_list");
    const initial = nextMessage(socket, "scene_snapshot");
    socket.emit("join_game", room.id, "");
    const [{ scene }] = await initial;
    expect((await list)[0]).toEqual({ scenes: [{ id: scene.id, name: "Scene 1", viewOnly: false }], openSceneId: scene.id, welcomeSceneId: null });
    expect(events).toEqual(["joined_game", "scene_list", "scene_snapshot"]);
    const snapshot = nextMessage(socket, "scene_snapshot");
    const updated = nextMessage(socket, "scene_list");
    const result = await action(socket, "scene_create", { name: "  Ambush  " });
    expect(result.ok).toBe(true);
    expect((await snapshot)[0]).toEqual({ scene: { id: result.sceneId, grid: defaultSceneGrid, fogFill: false, viewOnly: false, movementMode: true, items: {} } });
    expect((await updated)[0].scenes).toContainEqual({ id: result.sceneId, name: "Ambush", viewOnly: false });
    const copy = await server.durableCopy();
    try {
      const observer = copy.connect(cookie);
      const persistedList = nextMessage(observer, "scene_list");
      observer.emit("join_game", room.id, "");
      expect((await persistedList)[0].scenes).toContainEqual({ id: result.sceneId, name: "Ambush", viewOnly: false });
      const gm = await copy.joinRoomAsGM(room.id, cookie);
      const saved = nextMessage(gm.socket, "scene_snapshot");
      expect(await action(gm.socket, "scene_view", { sceneId: result.sceneId })).toEqual({ ok: true });
      expect((await saved)[0].scene.id).toBe(result.sceneId);
    } finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("GM connections prepare independently while changes, grids and pointers stay on their scene", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = await server.joinRoomAsGM(room.id, cookie);
    const openId = gm.snapshot!.scene!.id;
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, displayToken);
    const unwanted: unknown[] = [];
    for (const peer of [other, player, display]) {
      for (const event of ["scene_snapshot", "scene_changes", "scene_settings", "player_pointer"]) peer.socket.on(event, value => unwanted.push(value));
    }
    const otherList = nextMessage(other.socket, "scene_list");
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Preparation" });
    expect((await otherList)[0].scenes).toContainEqual({ id: sceneId, name: "Preparation", viewOnly: false });
    const answer = await sendBatch(gm.socket, { id: "prepare", sceneId, changes: [{ type: "add", item: token }] });
    expect(answer.applied).toHaveLength(1);
    expect(await action(gm.socket, "scene_settings", { sceneId, grid: { ...defaultSceneGrid, shown: true } })).toEqual({ ok: true });
    gm.socket.emit("player_pointer", { x: 12, y: 34 });
    await barrier(gm.socket);
    for (const peer of [other, player, display]) await barrier(peer.socket);
    expect(unwanted).toEqual([]);
    const wrong = await sendBatch(gm.socket, { id: "wrong", sceneId: openId, changes: [
      { type: "update", id: "hero", fields: { label: "Leak" } }, { type: "add", item: { ...token, id: "intruder" } },
    ] });
    expect(wrong.applied).toEqual([]);
    expect(wrong.refused).toEqual([{ id: "hero", item: null }, { id: "intruder", item: null }]);
    const privateEvents: unknown[] = [];
    gm.socket.on("scene_changes", value => privateEvents.push(value));
    gm.socket.on("player_pointer", value => privateEvents.push(value));
    const liveRelay = nextMessage(display.socket, "scene_changes");
    expect((await sendBatch(player.socket, { id: "live", sceneId: openId, changes: [{ type: "add", item: token }] })).applied).toHaveLength(1);
    expect((await liveRelay)[0].sceneId).toBe(openId);
    const pointer = nextMessage(other.socket, "player_pointer");
    player.socket.emit("player_pointer", { x: 56, y: 78 });
    expect((await pointer)[0]).toEqual({ x: 56, y: 78 });
    await barrier(gm.socket);
    expect(privateEvents).toEqual([]);
    const viewed = nextMessage(other.socket, "scene_snapshot");
    expect(await action(other.socket, "scene_view", { sceneId })).toEqual({ ok: true });
    expect((await viewed)[0].scene.items.hero.owner).toBe("gm");
    const gridRelay = nextMessage(other.socket, "scene_settings");
    expect(await action(gm.socket, "scene_settings", { sceneId, grid: { ...defaultSceneGrid, opacity: 0.25 } })).toEqual({ ok: true });
    expect((await gridRelay)[0]).toEqual({ sceneId, grid: { ...defaultSceneGrid, opacity: 0.25 }, fogFill: false, viewOnly: false, movementMode: true });
    const preparationRelay = nextMessage(other.socket, "scene_changes");
    await sendBatch(gm.socket, { id: "edit", sceneId, changes: [{ type: "update", id: "hero", fields: { label: "Prepared" } }] });
    expect((await preparationRelay)[0].sceneId).toBe(sceneId);
    await server.restart();
    const rejoined = await server.joinRoomAsGM(room.id, cookie);
    expect(rejoined.snapshot!.scene!.id).toBe(openId);
    const saved = nextMessage(rejoined.socket, "scene_snapshot");
    await action(rejoined.socket, "scene_view", { sceneId });
    expect((await saved)[0].scene.items.hero.label).toBe("Prepared");
  } finally { await server.dispose(); }
});

test("players, trusted players and cast displays never receive scene lists or requested preparation", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const displayToken = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const playerSocket = server.connect();
    const joinEvents: string[] = [];
    playerSocket.on("scene_list", () => joinEvents.push("scene_list"));
    const joined = nextMessage(playerSocket, "display_frozen");
    const playerSnapshot = nextMessage(playerSocket, "scene_snapshot");
    playerSocket.emit("join_game", room.id, "", undefined, { playerId: "player" });
    await joined;
    expect((await playerSnapshot)[0].scene.name).toBeUndefined();
    expect(joinEvents).toEqual([]);
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const displaySocket = server.connect();
    const displayEvents: string[] = [];
    displaySocket.on("scene_list", () => displayEvents.push("scene_list"));
    const displayJoined = nextMessage(displaySocket, "display_frozen");
    displaySocket.emit("join_display", room.id, displayToken);
    await displayJoined;
    const unexpected: unknown[] = [];
    for (const socket of [playerSocket, trusted.socket, displaySocket]) {
      for (const event of ["scene_list", "scene_snapshot", "scene_changes", "scene_settings"]) socket.on(event, value => unexpected.push(value));
    }
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Secret" });
    for (const socket of [playerSocket, trusted.socket, displaySocket]) {
      expect(await action(socket, "scene_create", { name: "Denied" })).toEqual({ ok: false, error: "not_room_gm" });
      expect(await action(socket, "scene_view", { sceneId })).toEqual({ ok: false, error: "not_room_gm" });
      await barrier(socket);
    }
    expect(unexpected).toEqual([]);
    expect(displayEvents).toEqual([]);
  } finally { await server.dispose(); }
});

test("invalid scene actions and missing scenes change nothing and emit no scene state", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const messages: unknown[] = [];
    gm.socket.on("scene_list", value => messages.push(value));
    gm.socket.on("scene_snapshot", value => messages.push(value));
    for (const value of [null, [], "name", {}, { name: 12 }, { name: " " }, { name: "Valid", extra: true }]) {
      expect(await action(gm.socket, "scene_create", value)).toEqual({ ok: false, error: "invalid" });
    }
    for (const value of [null, [], "id", {}, { sceneId: 12 }, { sceneId: gm.snapshot!.scene!.id, extra: true }]) {
      expect(await action(gm.socket, "scene_view", value)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await action(gm.socket, "scene_view", { sceneId: "missing" })).toEqual({ ok: false, error: "not_found" });
    expect(await action(gm.socket, "scene_view", { sceneId: "__proto__" })).toEqual({ ok: false, error: "not_found" });
    await barrier(gm.socket);
    expect(messages).toEqual([]);
  } finally { await server.dispose(); }
});
