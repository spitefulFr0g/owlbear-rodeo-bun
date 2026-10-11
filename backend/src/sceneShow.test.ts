import { expect, test } from "bun:test";
import { Socket } from "socket.io-client";
import { createRoom, nextMessage, setupAdministrator, startTestServer } from "./testing/serverHelpers";
const view = { x: -150, y: 300, width: 900, height: 600 };
const action = (socket: Socket, event: string, value: unknown): Promise<any> =>
  new Promise((resolve, reject) => socket.timeout(2000).emit(event, value, (error: Error | null, result: unknown) => error ? reject(error) : resolve(result)));

test("Show to players moves the table with its view, leaves other GMs and saves immediately", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const other = await server.joinRoomAsGM(room.id, cookie);
    await action(gm.socket, "session", true);
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Next" });
    const otherSnapshots: unknown[] = [];
    other.socket.on("scene_snapshot", value => otherSnapshots.push(value));
    const arrivals = [player, trusted, display].map(peer => {
      const events: unknown[] = [];
      peer.socket.on("scene_snapshot", value => events.push(["snapshot", value.scene.id]));
      peer.socket.on(peer === display ? "display_view" : "player_view", value => events.push(["view", value]));
      return events;
    });
    const messages = [player, trusted, display].map(peer => nextMessage(peer.socket, peer === display ? "display_view" : "player_view"));
    expect(await action(gm.socket, "scene_show", { sceneId, view })).toEqual({ ok: true });
    await Promise.all(messages);
    for (const events of arrivals) expect(events).toEqual([["snapshot", sceneId], ["view", { sceneId, ...view }]]);
    expect(otherSnapshots).toEqual([]);
    const copy = await server.durableCopy();
    try { expect((await copy.joinRoomAsGM(room.id, cookie)).snapshot!.scene.id).toBe(sceneId); }
    finally { await copy.dispose(); }
    for (const events of arrivals) events.length = 0;
    expect(await action(gm.socket, "scene_show", { sceneId, view })).toEqual({ ok: true });
    expect(await action(player.socket, "scene_show", { sceneId, view })).toEqual({ ok: false, error: "not_room_gm" });
    expect(arrivals).toEqual([[], [], []]);
  } finally { await server.dispose(); }
});

test("Show to players refuses invalid and unauthorized actions and outside a session starts at the default view", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const openSceneId = gm.snapshot!.scene.id;
    const player = await server.joinRoom(room.id, "", "player");
    const trusted = await server.joinRoom(room.id, "", "trusted");
    await new Promise(resolve => gm.socket.emit("room_trust", "trusted", true, resolve));
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Next" });
    const events: unknown[] = [];
    for (const peer of [player, trusted, display]) peer.socket.onAny((event, value) => {
      if (["scene_snapshot", "player_view", "display_view", "scene_list"].includes(event)) events.push([event, value]);
    });
    for (const peer of [player, trusted, display]) {
      expect(await action(peer.socket, "scene_show", { sceneId, view })).toEqual({ ok: false, error: "not_room_gm" });
    }
    for (const payload of [null, [], { sceneId, view, extra: true }, { sceneId, view: { ...view, width: 0 } },
      { sceneId, view: { ...view, x: Infinity } }, { sceneId, view: { ...view, extra: true } }, { sceneId, view: {} }]) {
      expect(await action(gm.socket, "scene_show", payload)).toEqual({ ok: false, error: "invalid" });
    }
    expect(await action(gm.socket, "scene_show", { sceneId: "missing", view })).toEqual({ ok: false, error: "not_found" });
    expect(await action(gm.socket, "scene_show", { sceneId: openSceneId, view })).toEqual({ ok: false, error: "not_viewing" });
    gm.socket.emit("display_view", { sceneId: openSceneId, ...view });
    expect(await action(gm.socket, "scene_show", { sceneId, view })).toEqual({ ok: true });
    expect(events).toEqual([]);
    const snapshot = nextMessage(player.socket, "scene_snapshot");
    const displaySnapshot = nextMessage(display.socket, "scene_snapshot");
    await action(gm.socket, "session", true);
    expect((await snapshot)[0].scene.id).toBe(sceneId);
    expect((await displaySnapshot)[0].scene.id).toBe(sceneId);
    await new Promise(resolve => display.socket.emit("get_display_token", resolve));
    expect(events.filter(event => ["player_view", "display_view"].includes((event as string[])[0]))).toEqual([]);
    await server.restart();
    expect((await server.joinRoomAsGM(room.id, cookie)).snapshot!.scene.id).toBe(sceneId);
  } finally { await server.dispose(); }
});

test("cast displays hold while the GM prepares and frozen displays switch with the carried view", async () => {
  const server = await startTestServer();
  try {
    const { cookie } = await setupAdministrator(server);
    const room = await createRoom(server, cookie, "Room");
    const gm = await server.joinRoomAsGM(room.id, cookie);
    const openSceneId = gm.snapshot!.scene.id;
    await action(gm.socket, "session", true);
    const token = await new Promise<string>(resolve => gm.socket.emit("get_display_token", resolve));
    const display = await server.joinDisplay(room.id, token);
    const initial = nextMessage(display.socket, "display_view");
    gm.socket.emit("display_view", { sceneId: openSceneId, ...view });
    expect((await initial)[0]).toEqual({ sceneId: openSceneId, ...view });
    const { sceneId } = await action(gm.socket, "scene_create", { name: "Next" });
    const received: unknown[] = [];
    display.socket.on("display_view", value => received.push(value));
    gm.socket.emit("display_view", { sceneId: openSceneId, ...view, x: 500 });
    await action(gm.socket, "scene_view", { sceneId: openSceneId });
    expect(received).toEqual([]);
    const resumed = nextMessage(display.socket, "display_view");
    gm.socket.emit("display_view", { sceneId: openSceneId, ...view, x: 100 });
    expect((await resumed)[0].x).toBe(100);
    const frozen = nextMessage(display.socket, "display_frozen");
    gm.socket.emit("display_freeze", true);
    expect((await frozen)[0]).toBe(true);
    await action(gm.socket, "scene_view", { sceneId });
    const switched = nextMessage(display.socket, "display_view");
    await action(gm.socket, "scene_show", { sceneId, view });
    expect((await switched)[0]).toEqual({ sceneId, ...view });
    received.length = 0;
    gm.socket.emit("display_view", { sceneId, ...view, x: 700 });
    await action(gm.socket, "scene_show", { sceneId, view });
    await new Promise(resolve => display.socket.emit("get_display_token", resolve));
    expect(received).toEqual([]);
    const joined = await server.joinDisplay(room.id, token);
    expect(joined.displayFrozen).toBe(true);
    const thawed = nextMessage(display.socket, "display_view");
    gm.socket.emit("display_freeze", false);
    expect((await thawed)[0]).toEqual({ sceneId, ...view, x: 700 });
  } finally { await server.dispose(); }
});
