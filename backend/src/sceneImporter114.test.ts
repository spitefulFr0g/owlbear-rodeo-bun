import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { defaultSceneGrid, ImageItem } from "../../src/sceneRules";
import { tokenItem } from "./testing/sceneFixtures";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";

const create = (socket: Socket, value: unknown): Promise<any> =>
  new Promise(resolve => socket.emit("scene_create", value, resolve));
const map: ImageItem = { ...tokenItem, id: "map", layer: "map", owner: "forged", order: 999,
  position: { x: -75, y: 30 }, scale: { x: 1.5, y: 1.5 } };

test("creating from a map delivers and immediately saves the complete aligned scene", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const grid = { ...defaultSceneGrid, type: "hexHorizontal" as const, measurement: { type: "euclidean" as const, scale: "10m" } };
    const snapshot = nextMessage(gm.socket, "scene_snapshot");
    const result = await create(gm.socket, { name: "Map scene", grid, fogFill: true, map });
    expect(result.ok).toBe(true);
    const expected = { id: result.sceneId, grid, fogFill: true, viewOnly: false,
      items: { map: { ...map, owner: "gm", locked: true, order: 0 } } };
    expect((await snapshot)[0].scene).toEqual(expected);
    const copy = await server.durableCopy();
    try {
      const observer = await copy.joinRoomAsGM(room.id, cookie);
      const saved = nextMessage(observer.socket, "scene_snapshot");
      observer.socket.emit("scene_view", { sceneId: result.sceneId });
      expect((await saved)[0].scene).toEqual(expected);
    } finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("invalid map imports create no scene and send no scene state", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const messages: unknown[] = [];
    for (const event of ["scene_snapshot", "scene_list"]) gm.socket.on(event, value => messages.push(value));
    for (const fields of [
      { map: null }, { map: {} }, { map: { ...map, layer: "character" } },
      { map: { ...map, width: "bad" } }, { map: { ...map, extra: true } },
      { map: { ...map, kind: "text" } }, { map: { ...map, scale: { x: "bad", y: 1 } } },
      { grid: null }, { grid: { ...defaultSceneGrid, opacity: 2 } },
      { grid: { ...defaultSceneGrid, extra: true } }, { fogFill: "true" }, { fogFill: null },
    ]) {
      expect(await create(gm.socket, { name: "Invalid import", ...fields })).toEqual({ ok: false, error: "invalid" });
    }
    await new Promise(resolve => gm.socket.emit("get_display_token", resolve));
    expect(messages).toEqual([]);
    const copy = await server.durableCopy();
    try {
      const socket = copy.connect(cookie);
      const list = nextMessage(socket, "scene_list");
      socket.emit("join_game", room.id, "");
      expect((await list)[0].scenes).toEqual([{ id: gm.snapshot!.scene!.id, name: "Scene 1", viewOnly: false }]);
    } finally { await copy.dispose(); }
  } finally { await server.dispose(); }
});

test("grid, Fog Fill and map are independent optional create fields", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    for (const fields of [{ grid: { ...defaultSceneGrid, shown: true } }, { fogFill: true }, { map }]) {
      const snapshot = nextMessage(gm.socket, "scene_snapshot");
      expect((await create(gm.socket, { name: "Optional", ...fields })).ok).toBe(true);
      const { scene } = (await snapshot)[0];
      expect(scene.grid).toEqual("grid" in fields ? fields.grid : defaultSceneGrid);
      expect(scene.fogFill).toBe("fogFill" in fields);
      expect(scene.items).toEqual("map" in fields ? { map: { ...map, owner: "gm", locked: true, order: 0 } } : {});
    }
  } finally { await server.dispose(); }
});
